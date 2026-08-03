"""
search.py — the retrieval orchestrator.

Pipeline per query:
  parse (SLM/rules) -> BM25+ lexical top-K  ∥  bge/FAISS dense top-K
    -> fusion (RRF | weighted min-max) -> intent-aware soft boosts
    -> cross-encoder rerank of the shortlist -> grounded "why" per result.

All artifacts are precomputed by scripts/build_index.py; this module just loads
them and serves.
"""
from __future__ import annotations

import math
import pickle
import re
import time

import numpy as np

from app.config import Settings
from app.engine.corpus import Corpus
from app.engine.fusion import Fused, fuse
from app.engine.lexical import LexicalIndex
from app.engine.preprocess import preprocessor
from app.engine.rerank import Reranker
from app.engine.semantic import SemanticIndex
from app.engine.slm import GENRE_CANON, SLM
from app.schemas import (
    EngineInfo,
    GenreCount,
    HealthResponse,
    Movie,
    ParsedQuery,
    ScoreBreakdown,
    SearchRequest,
    SearchResponse,
    SearchResult,
    StatsResponse,
    Suggestion,
    Timing,
)

_SAMPLE_QUERIES = [
    "mind-bending sci-fi like Inception but with more heart",
    "cozy 90s comedies for a rainy sunday",
    "slow-burn neo-noir crime thrillers",
    "movies that feel like a fever dream",
    "gritty revenge thrillers with a female lead",
    "feel-good found-family space adventures",
]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


# Meta words the parser consumes into `min_rating` — they must not leak into the
# BM25 query as content terms (e.g. "rated" lemmatizes to "rat" and would match
# a movie about a rat). Filtered only when a rating intent was actually parsed.
_RATING_WORDS = {"highly", "rated", "rate", "acclaimed", "critically",
                 "masterpiece", "toprated"}


def _minmax_list(vals: list[float]) -> list[float]:
    if not vals:
        return []
    lo, hi = min(vals), max(vals)
    if hi - lo < 1e-12:
        return [1.0 if hi > 0 else 0.0 for _ in vals]
    return [(v - lo) / (hi - lo) for v in vals]


class SearchEngine:
    def __init__(self, settings: Settings):
        self.s = settings
        self.corpus = Corpus(settings.corpus_path)

        # ---- lexical: load precomputed tokenized corpus, build BM25+ ----
        tokenized = self._load_tokens()
        self.lexical = LexicalIndex(
            tokenized, settings.bm25_k1, settings.bm25_b, settings.bm25_delta
        )

        # ---- semantic: load embeddings, build FAISS flat index ----
        embeddings = np.load(settings.embeddings_path)
        self.semantic = SemanticIndex(settings.embedding_model, embeddings)

        # ---- reranker + SLM ----
        self.reranker = Reranker(settings.reranker_model) if settings.enable_reranker else None
        self.slm = SLM(settings.ollama_host, settings.ollama_model,
                       settings.enable_slm, settings.slm_timeout)

        self.title_index = {_norm(r["title"]): i for i, r in enumerate(self.corpus.records)}
        self._ready = False

    # --------------------------------------------------------------------- #
    def _load_tokens(self) -> list[list[str]]:
        tok_path = self.s.embeddings_path.parent / "lexical_tokens.pkl"
        if tok_path.exists():
            with open(tok_path, "rb") as f:
                return pickle.load(f)
        # fallback: tokenize on the fly (slower cold start)
        return [preprocessor.tokenize(t) for t in self.corpus.lexical_texts()]

    def warmup(self) -> None:
        self.semantic.warmup()
        if self.reranker:
            self.reranker.warmup()
        self._ready = True

    def _resolve_similar(self, title: str | None) -> int | None:
        if not title:
            return None
        key = _norm(title)
        if key in self.title_index:
            return self.title_index[key]
        # prefix / containment fallback
        for k, idx in self.title_index.items():
            if key and (k.startswith(key) or key.startswith(k)) and abs(len(k) - len(key)) <= 4:
                return idx
        return None

    def _boost(self, parsed: ParsedQuery, rec: dict) -> float:
        """Intent-aware additive score adjustment in ~[-0.3, +0.25]."""
        adj = 0.0
        genres = set(rec.get("genres") or [])
        low_g = {g.lower() for g in genres}
        kws = {k.lower() for k in (rec.get("keywords") or [])}

        gmatch = len(set(parsed.genres) & genres)
        adj += min(0.12, 0.07 * gmatch)

        if parsed.era_from or parsed.era_to:
            y = rec.get("year")
            if y:
                lo = parsed.era_from or 0
                hi = parsed.era_to or 3000
                adj += 0.10 if lo <= y <= hi else -0.13

        if parsed.min_rating:
            r = rec.get("vote_average")
            if r is not None:
                adj += 0.06 if r >= parsed.min_rating else -0.40

        for neg in parsed.negations:
            n = neg.lower()
            # negated *genre* is handled by a hard filter upstream; here we also
            # penalize soft matches in keywords / plain adjectives.
            if n in kws or (n in low_g and GENRE_CANON.get(n) not in genres):
                adj -= 0.25
        return max(-0.6, min(0.25, adj))

    # --------------------------------------------------------------------- #
    def _rank_candidates(
        self, query_for_semantic: str, lex_tokens: list[str], parsed: ParsedQuery,
        req: SearchRequest, timing: Timing, exclude: set[int], seed_idx: int | None,
    ) -> list[Fused]:
        pool = self.s.candidate_pool

        t = time.perf_counter()
        lex = self.lexical.search(lex_tokens, pool)
        timing.lexical = round((time.perf_counter() - t) * 1000, 2)

        t = time.perf_counter()
        if seed_idx is not None:
            qv = self.semantic.encode_query(query_for_semantic)[0]
            blended = 0.55 * qv + 0.45 * self.semantic.vector_of(seed_idx)
            blended = blended / (np.linalg.norm(blended) + 1e-9)
            sem = self.semantic.search_by_vector(blended, pool)
        else:
            sem = self.semantic.search(query_for_semantic, pool)
        timing.semantic = round((time.perf_counter() - t) * 1000, 2)

        if exclude:
            lex = [(i, s) for i, s in lex if i not in exclude]
            sem = [(i, s) for i, s in sem if i not in exclude]

        t = time.perf_counter()
        fused = fuse(lex, sem, method=req.fusion, rrf_k=self.s.rrf_k,
                     w_lex=req.lexical_weight, w_sem=req.semantic_weight)
        timing.fusion = round((time.perf_counter() - t) * 1000, 2)
        return fused

    @staticmethod
    def _display_scores(finals: list[float]) -> list[float]:
        """Turn raw ranking scores into a satisfying 'match confidence' for the
        UI: the page top is anchored to its absolute quality (0.80..0.99), the
        rest spread down to a floor via a soft sqrt curve. The truthful
        lexical / semantic / fusion / rerank sub-scores stay untouched in
        ScoreBreakdown."""
        if not finals:
            return []
        hi, lo = max(finals), min(finals)
        top_disp = 0.80 + 0.19 * max(0.0, min(1.0, hi))
        floor = 0.62
        if hi - lo < 1e-6:
            return [round(top_disp, 4)] * len(finals)
        return [round(floor + (top_disp - floor) * math.sqrt((f - lo) / (hi - lo)), 4)
                for f in finals]

    def _assemble(
        self, query: str, parsed: ParsedQuery, fused: list[Fused], lex_tokens: list[str],
        req: SearchRequest, timing: Timing,
    ) -> list[SearchResult]:
        # hard-exclude explicitly negated genres ("... not horror") when doing
        # so still leaves enough results; otherwise fall back to soft penalties.
        neg_genres = {GENRE_CANON[w.lower()] for w in parsed.negations
                      if w.lower() in GENRE_CANON}
        if neg_genres:
            kept = [f for f in fused
                    if not (set(self.corpus.record(f.idx)["genres"]) & neg_genres)]
            if len(kept) >= req.limit:
                fused = kept

        # normalize fused scores over the shortlist for display
        shortlist = fused[: max(self.s.rerank_pool, req.limit)]
        fused_norm = _minmax_list([f.fused for f in shortlist])
        for f, fn in zip(shortlist, fused_norm):
            f.fused = fn  # reuse field to hold normalized fusion score for display

        # ---- rerank the shortlist ----
        rr_scores: dict[int, float] | None = None
        rerank_used = False
        t = time.perf_counter()
        if req.rerank and self.reranker:
            docs = [(f.idx, self.corpus.record(f.idx)["semantic_text"][:600]) for f in shortlist]
            rr_scores = self.reranker.rerank(query, docs)
            rerank_used = rr_scores is not None
        timing.rerank = round((time.perf_counter() - t) * 1000, 2)

        # ---- final ranking score = base (rerank|fusion) + intent boosts ----
        exact_idx = self.title_index.get(_norm(query))
        scored: list[tuple[float, Fused, float | None]] = []
        for f in shortlist:
            rec = self.corpus.record(f.idx)
            base = rr_scores[f.idx] if rerank_used else f.fused
            adj = self._boost(parsed, rec)
            if exact_idx is not None and f.idx == exact_idx:
                adj += 0.6  # an exact-title query should surface that exact film
            final = max(0.0, min(1.0, base + adj))
            scored.append((final, f, rr_scores[f.idx] if rerank_used else None))
        scored.sort(key=lambda x: x[0], reverse=True)

        top = scored[: req.limit]
        disp = self._display_scores([x[0] for x in top])

        # ---- build results + grounded reasons ----
        results: list[SearchResult] = []
        reason_t = 0.0
        for rank_i, (final, f, rr) in enumerate(top):
            rec = self.corpus.record(f.idx)
            movie = self.corpus.to_movie(f.idx)
            match_terms = self.lexical.match_terms(f.idx, lex_tokens)
            reason = None
            if req.explain:
                rt = time.perf_counter()
                reason = self.slm.explain(query, parsed, rec, match_terms)
                reason_t += (time.perf_counter() - rt) * 1000
            results.append(SearchResult(
                **movie.model_dump(),
                score=disp[rank_i],
                scores=ScoreBreakdown(
                    lexical=round(f.lex_norm, 4),
                    semantic=round(f.sem_norm, 4),
                    fusion=round(f.fused, 4),
                    rerank=round(rr, 4) if rr is not None else None,
                    lexical_rank=f.lex_rank,
                    semantic_rank=f.sem_rank,
                ),
                match_terms=match_terms,
                reason=reason,
            ))
        timing.reason = round(reason_t, 2)
        self._last_rerank_used = rerank_used
        return results

    # --------------------------------------------------------------------- #
    def search(self, req: SearchRequest) -> SearchResponse:
        t0 = time.perf_counter()
        timing = Timing()

        t = time.perf_counter()
        parsed = self.slm.parse(req.query)
        timing.parse = round((time.perf_counter() - t) * 1000, 2)

        lex_tokens = preprocessor.tokenize(req.query)
        # negated terms must not count as positive lexical matches
        neg_lemmas: set[str] = set()
        for w in parsed.negations:
            neg_lemmas.update(preprocessor.tokenize(w))
        if neg_lemmas:
            lex_tokens = [t for t in lex_tokens if t not in neg_lemmas]
        if parsed.min_rating:
            rating_lemmas = {lem for w in _RATING_WORDS for lem in preprocessor.tokenize(w)}
            lex_tokens = [t for t in lex_tokens if t not in rating_lemmas]
        seed_idx = self._resolve_similar(parsed.similar_to)
        exclude = {seed_idx} if seed_idx is not None else set()
        semantic_query = parsed.clean_query or req.query

        fused = self._rank_candidates(
            semantic_query, lex_tokens, parsed, req, timing, exclude, seed_idx
        )
        results = self._assemble(req.query, parsed, fused, lex_tokens, req, timing)
        timing.total = round((time.perf_counter() - t0) * 1000, 2)

        return SearchResponse(
            query=req.query, parsed=parsed, count=len(results), results=results,
            timing_ms=timing, engine=self._engine_info(req, getattr(self, "_last_rerank_used", False)),
        )

    def similar(self, movie_id: str, limit: int) -> SearchResponse:
        idx = self.corpus.index_of(movie_id)
        if idx is None:
            raise KeyError(movie_id)
        rec = self.corpus.record(idx)
        req = SearchRequest(query=rec["title"], limit=limit, fusion="rrf", rerank=True)
        timing = Timing()
        parsed = ParsedQuery(
            intent="similar", clean_query=rec["title"],
            similar_to=rec["title"], genres=rec.get("genres", [])[:2], source="rules",
        )
        lex_tokens = preprocessor.tokenize(rec["lexical_text"])[:40]
        fused = self._rank_candidates(
            rec["semantic_text"][:400], lex_tokens, parsed, req, timing, {idx}, idx
        )
        results = self._assemble(rec["title"], parsed, fused, lex_tokens, req, timing)
        return SearchResponse(
            query=rec["title"], parsed=parsed, count=len(results), results=results,
            timing_ms=timing, engine=self._engine_info(req, getattr(self, "_last_rerank_used", False)),
        )

    # --------------------------------------------------------------------- #
    def suggest(self, q: str, limit: int) -> list[Suggestion]:
        key = _norm(q)
        if not key:
            return []
        starts, contains = [], []
        for i, rec in enumerate(self.corpus.records):
            tk = _norm(rec["title"])
            if tk.startswith(key):
                starts.append(i)
            elif key in tk:
                contains.append(i)
            if len(starts) >= limit and len(contains) >= limit:
                break
        # popularity-rank within each bucket
        starts.sort(key=lambda i: -self.corpus.records[i]["vote_count"])
        contains.sort(key=lambda i: -self.corpus.records[i]["vote_count"])
        picks = (starts + contains)[:limit]
        return [Suggestion(id=self.corpus.records[i]["id"], title=self.corpus.records[i]["title"],
                           year=self.corpus.records[i]["year"],
                           poster_url=self.corpus.records[i]["poster_url"]) for i in picks]

    def get_movie(self, movie_id: str) -> Movie:
        idx = self.corpus.index_of(movie_id)
        if idx is None:
            raise KeyError(movie_id)
        return self.corpus.to_movie(idx)

    def stats(self) -> StatsResponse:
        from collections import Counter
        gc: Counter = Counter()
        dc: Counter = Counter()
        for r in self.corpus.records:
            for g in r["genres"]:
                gc[g] += 1
            if r["year"]:
                dc[f"{r['year'] // 10 * 10}s"] += 1
        top = sorted(
            [r for r in self.corpus.records if (r["vote_count"] or 0) > 3000],
            key=lambda r: -(r["vote_average"] or 0),
        )[:10]
        return StatsResponse(
            corpus_size=self.corpus.size,
            genres=[GenreCount(name=n, count=c) for n, c in gc.most_common(12)],
            decades=[GenreCount(name=n, count=c) for n, c in sorted(dc.items())],
            sample_queries=_SAMPLE_QUERIES,
            top_rated=[Suggestion(id=r["id"], title=r["title"], year=r["year"],
                                  poster_url=r["poster_url"]) for r in top],
        )

    def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok", ready=self._ready, corpus_size=self.corpus.size,
            embedding_model=self.s.embedding_model,
            reranker=bool(self.reranker and self.reranker.available),
            reranker_model=self.s.reranker_model if self.reranker else None,
            slm=self.slm.label, faiss=True,
        )

    def _engine_info(self, req: SearchRequest, rerank_used: bool) -> EngineInfo:
        return EngineInfo(
            fusion=req.fusion, rerank=rerank_used,
            embedding_model=self.s.embedding_model,
            reranker_model=self.s.reranker_model if (self.reranker and rerank_used) else None,
            slm=self.slm.label, corpus_size=self.corpus.size,
        )
