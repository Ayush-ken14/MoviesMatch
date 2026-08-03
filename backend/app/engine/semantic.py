"""
semantic.py — dense retrieval with BAAI/bge-small-en-v1.5 + FAISS.

Document embeddings are precomputed offline (scripts/build_index.py) and stored
as an L2-normalized float32 matrix, so a FAISS inner-product index gives exact
cosine similarity. Only the query is embedded at request time.

bge-v1.5 is an *asymmetric* retriever: queries get a short instruction prefix,
passages do not.
"""
from __future__ import annotations

import numpy as np

# bge-v1.5 recommended retrieval instruction (query side only).
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


class SemanticIndex:
    def __init__(self, model_name: str, embeddings: np.ndarray):
        import faiss

        self.model_name = model_name
        self.dim = embeddings.shape[1]
        self.embeddings = np.ascontiguousarray(embeddings.astype(np.float32))
        self.index = faiss.IndexFlatIP(self.dim)  # cosine on normalized vectors
        self.index.add(self.embeddings)
        self._model = None  # lazy

    # ---- model management ----
    @staticmethod
    def load_model(model_name: str):
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(model_name)

    @property
    def model(self):
        if self._model is None:
            self._model = self.load_model(self.model_name)
        return self._model

    def warmup(self) -> None:
        self.encode_query("warmup query")

    # ---- encoding ----
    @classmethod
    def encode_documents(cls, model, texts: list[str], batch_size: int = 64) -> np.ndarray:
        emb = model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=True,
            convert_to_numpy=True,
        )
        return emb.astype(np.float32)

    def encode_query(self, query: str) -> np.ndarray:
        vec = self.model.encode(
            [QUERY_INSTRUCTION + query],
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return vec.astype(np.float32)

    # ---- search ----
    def search(self, query: str, top_n: int) -> list[tuple[int, float]]:
        q = self.encode_query(query)
        top_n = min(top_n, self.index.ntotal)
        scores, idxs = self.index.search(q, top_n)
        return [(int(i), float(s)) for i, s in zip(idxs[0], scores[0]) if i != -1]

    def search_by_vector(self, vec: np.ndarray, top_n: int) -> list[tuple[int, float]]:
        vec = np.ascontiguousarray(vec.astype(np.float32)).reshape(1, -1)
        top_n = min(top_n, self.index.ntotal)
        scores, idxs = self.index.search(vec, top_n)
        return [(int(i), float(s)) for i, s in zip(idxs[0], scores[0]) if i != -1]

    def vector_of(self, idx: int) -> np.ndarray:
        return self.embeddings[idx]
