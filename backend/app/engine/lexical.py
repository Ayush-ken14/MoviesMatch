"""
lexical.py — BM25+ retrieval over the keyword-dense `lexical_text` field.

Uses rank_bm25's BM25Plus (the '+' lower-bounds term-frequency saturation via a
delta term, which helps long documents from being unfairly penalized). The
per-document frequency dicts that BM25Plus already keeps are reused to explain
*which* query terms actually hit a given movie — surfaced in the UI as
`match_terms`.
"""
from __future__ import annotations

import numpy as np
from rank_bm25 import BM25Plus

from app.engine.preprocess import preprocessor


class LexicalIndex:
    def __init__(self, tokenized_corpus: list[list[str]], k1: float, b: float, delta: float):
        self.k1, self.b, self.delta = k1, b, delta
        self.bm25 = BM25Plus(tokenized_corpus, k1=k1, b=b, delta=delta)

    @classmethod
    def build(cls, texts: list[str], k1: float, b: float, delta: float) -> "LexicalIndex":
        tokenized = [preprocessor.tokenize(t) for t in texts]
        return cls(tokenized, k1, b, delta)

    def scores(self, query_tokens: list[str]) -> np.ndarray:
        if not query_tokens:
            return np.zeros(self.bm25.corpus_size, dtype=np.float32)
        return np.asarray(self.bm25.get_scores(query_tokens), dtype=np.float32)

    def search(self, query_tokens: list[str], top_n: int) -> list[tuple[int, float]]:
        scores = self.scores(query_tokens)
        if scores.size == 0 or not query_tokens:
            return []
        top_n = min(top_n, scores.size)
        # argpartition for speed, then sort just the top slice
        idx = np.argpartition(-scores, top_n - 1)[:top_n]
        idx = idx[np.argsort(-scores[idx])]
        return [(int(i), float(scores[i])) for i in idx if scores[i] > 0]

    def match_terms(self, doc_idx: int, query_tokens: list[str], limit: int = 6) -> list[str]:
        """Query terms (lemmas) that actually occur in the document."""
        doc_freq = self.bm25.doc_freqs[doc_idx]
        seen, out = set(), []
        for t in query_tokens:
            if t in doc_freq and t not in seen:
                seen.add(t)
                out.append(t)
            if len(out) >= limit:
                break
        return out
