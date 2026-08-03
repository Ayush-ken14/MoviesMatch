"""
fusion.py — combine the lexical (BM25+) and dense (bge/FAISS) candidate lists.

Two configurable strategies:
  * "rrf"      Reciprocal Rank Fusion — rank-based, scale-free, robust default.
                 score = Σ_source 1 / (rrf_k + rank_source)
  * "weighted" min-max normalize each retriever's raw scores over the candidate
                 union, then a convex blend: w_lex·lex + w_sem·sem.

Either way every returned candidate carries its per-retriever ranks and
normalized sub-scores so the UI can show the lexical-vs-semantic breakdown.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Fused:
    idx: int
    lex_raw: float = 0.0
    sem_raw: float = 0.0
    lex_rank: int | None = None   # 1-based within the lexical list
    sem_rank: int | None = None
    lex_norm: float = 0.0         # 0..1 over the candidate union
    sem_norm: float = 0.0
    fused: float = 0.0            # ranking score (method-dependent)


def _minmax(values: dict[int, float]) -> dict[int, float]:
    if not values:
        return {}
    lo = min(values.values())
    hi = max(values.values())
    if hi - lo < 1e-12:
        return {k: (1.0 if hi > 0 else 0.0) for k in values}
    return {k: (v - lo) / (hi - lo) for k, v in values.items()}


def fuse(
    lex: list[tuple[int, float]],
    sem: list[tuple[int, float]],
    *,
    method: str = "rrf",
    rrf_k: int = 60,
    w_lex: float = 0.5,
    w_sem: float = 0.5,
) -> list[Fused]:
    lex_rank = {idx: r for r, (idx, _) in enumerate(lex, start=1)}
    sem_rank = {idx: r for r, (idx, _) in enumerate(sem, start=1)}
    lex_raw = {idx: s for idx, s in lex}
    sem_raw = {idx: s for idx, s in sem}

    # min-max normalized sub-scores over the union (for display + weighted blend)
    lex_norm = _minmax(lex_raw)
    sem_norm = _minmax(sem_raw)

    cand: dict[int, Fused] = {}
    for idx in set(lex_raw) | set(sem_raw):
        cand[idx] = Fused(
            idx=idx,
            lex_raw=lex_raw.get(idx, 0.0),
            sem_raw=sem_raw.get(idx, 0.0),
            lex_rank=lex_rank.get(idx),
            sem_rank=sem_rank.get(idx),
            lex_norm=lex_norm.get(idx, 0.0),
            sem_norm=sem_norm.get(idx, 0.0),
        )

    if method == "weighted":
        total = (w_lex + w_sem) or 1.0
        wl, ws = w_lex / total, w_sem / total
        for c in cand.values():
            c.fused = wl * c.lex_norm + ws * c.sem_norm
    else:  # rrf
        for c in cand.values():
            score = 0.0
            if c.lex_rank:
                score += 1.0 / (rrf_k + c.lex_rank)
            if c.sem_rank:
                score += 1.0 / (rrf_k + c.sem_rank)
            c.fused = score

    return sorted(cand.values(), key=lambda c: c.fused, reverse=True)
