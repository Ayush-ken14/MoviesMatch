"""Central configuration for the CineMatch engine (env-overridable)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CINEMATCH_", env_file=".env", extra="ignore")

    # ---- data / index paths ----
    corpus_path: Path = DATA_DIR / "corpus.json"
    embeddings_path: Path = DATA_DIR / "embeddings.npy"
    faiss_path: Path = DATA_DIR / "faiss.index"
    meta_path: Path = DATA_DIR / "index_meta.json"

    # ---- models ----
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    enable_reranker: bool = True

    # ---- BM25+ hyper-params (tuned for short keyword-dense docs) ----
    bm25_k1: float = 1.5
    bm25_b: float = 0.75
    bm25_delta: float = 1.0

    # ---- retrieval / fusion ----
    candidate_pool: int = 80        # top-k pulled from each retriever before fusion
    rerank_pool: int = 40           # top-k of the fused list handed to the reranker
    rrf_k: int = 60                 # RRF damping constant

    # ---- SLM (Ollama) ----
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"
    enable_slm: bool = True         # attempt Ollama; falls back to templates
    slm_timeout: float = 12.0

    # ---- server ----
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


settings = Settings()
