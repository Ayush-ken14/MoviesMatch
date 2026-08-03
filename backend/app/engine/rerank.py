"""
rerank.py — cross-encoder reranking of the top fused candidates.

A bi-encoder (bge) retrieves fast but scores query and document independently;
a cross-encoder reads the (query, document) pair jointly and is far more precise
on the final shortlist. We rerank only `rerank_pool` candidates to keep latency
low. Loads lazily and degrades gracefully (returns None) if unavailable.
"""
from __future__ import annotations

import math


class Reranker:
    def __init__(self, model_name: str):
        self.model_name = model_name
        self._model = None
        self.available = True

    @property
    def model(self):
        if self._model is None:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(self.model_name, max_length=384)
        return self._model

    def warmup(self) -> None:
        try:
            self.model.predict([("a", "b")])
        except Exception:
            self.available = False

    def rerank(self, query: str, docs: list[tuple[int, str]]) -> dict[int, float] | None:
        """Return {idx: score in 0..1} or None if the reranker is unavailable."""
        if not docs:
            return {}
        try:
            pairs = [(query, text) for _, text in docs]
            raw = self.model.predict(pairs, convert_to_numpy=True, show_progress_bar=False)
        except Exception:
            self.available = False
            return None
        # ms-marco cross-encoders emit an unbounded relevance logit; squash to 0..1
        return {idx: 1.0 / (1.0 + math.exp(-float(s))) for (idx, _), s in zip(docs, raw)}
