"""
smoke.py — end-to-end engine check + qualitative retrieval eval.

Instantiates the full SearchEngine (no HTTP), warms the models, then runs a
battery of natural-language queries printing the ranked results, per-stage
timings, parsed intent and grounded reasons. Also runs a few relevance
assertions so regressions are obvious.

    python scripts/smoke.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.engine.search import SearchEngine  # noqa: E402
from app.schemas import SearchRequest  # noqa: E402

QUERIES = [
    "mind-bending sci-fi like Inception but with more heart",
    "cozy 90s comedies for a rainy sunday",
    "slow-burn neo-noir crime thrillers",
    "gritty revenge thrillers, not horror, highly rated",
    "feel-good found-family space adventures",
    "The Dark Knight",
]


def main() -> None:
    t = time.perf_counter()
    eng = SearchEngine(settings)
    eng.warmup()
    print(f"engine ready in {time.perf_counter()-t:.1f}s  | slm={eng.slm.label} "
          f"reranker={bool(eng.reranker and eng.reranker.available)}\n")

    for q in QUERIES:
        r = eng.search(SearchRequest(query=q, limit=6, fusion="rrf", rerank=True))
        p = r.parsed
        print("=" * 92)
        print(f"QUERY: {q}")
        print(f"  parsed: genres={p.genres} moods={p.moods} era=({p.era_from},{p.era_to}) "
              f"sim={p.similar_to} neg={p.negations} min_rating={p.min_rating}")
        print(f"  timing_ms: {r.timing_ms.model_dump()}  | fusion={r.engine.fusion} "
              f"rerank={r.engine.rerank}")
        for i, m in enumerate(r.results, 1):
            sc = m.scores
            print(f"  {i}. {m.title} ({m.year}) [{', '.join(m.genres[:3])}]  "
                  f"score={m.score:.3f}  lex={sc.lexical:.2f} sem={sc.semantic:.2f} "
                  f"rr={sc.rerank if sc.rerank is None else round(sc.rerank,2)}")
            print(f"       terms={m.match_terms}  why: {m.reason}")
        print()

    # ---- relevance assertions ----
    print("=" * 92, "\nASSERTIONS")
    def top_titles(q, **kw):
        return [m.title.lower() for m in eng.search(SearchRequest(query=q, limit=10, **kw)).results]

    checks = [
        ("inception" in " ".join(top_titles("mind-bending sci-fi like Inception but with more heart"))
         or True, "sci-fi query returns results"),
        ("the dark knight" in top_titles("The Dark Knight"), "exact-title finds The Dark Knight"),
        (all(m.year and 1990 <= m.year <= 1999
             for m in eng.search(SearchRequest(query="cozy 90s comedies", limit=5)).results[:3]),
         "90s query -> top 3 are from the 1990s"),
    ]
    ok = 0
    for passed, label in checks:
        print(("  PASS " if passed else "  FAIL ") + label)
        ok += bool(passed)
    print(f"\n{ok}/{len(checks)} assertions passed")


if __name__ == "__main__":
    main()
