"""
build_index.py — precompute the retrieval artifacts from corpus.json:

  * data/embeddings.npy        L2-normalized bge-small document vectors (float32)
  * data/lexical_tokens.pkl    the preprocessed token lists for BM25+
  * data/index_meta.json       provenance / model / dims

Run once after build_corpus.py (or whenever the corpus or model changes):
    python scripts/build_index.py
"""
from __future__ import annotations

import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.engine.corpus import Corpus  # noqa: E402
from app.engine.preprocess import preprocessor  # noqa: E402
from app.engine.semantic import SemanticIndex  # noqa: E402


def log(m: str) -> None:
    print(f"[build_index] {m}", flush=True)


def main() -> None:
    corpus = Corpus(settings.corpus_path)
    log(f"corpus: {corpus.size} movies")

    # ---- lexical tokens ----
    t = time.perf_counter()
    tokens = [preprocessor.tokenize(txt) for txt in corpus.lexical_texts()]
    with open(settings.embeddings_path.parent / "lexical_tokens.pkl", "wb") as f:
        pickle.dump(tokens, f)
    avg = sum(len(x) for x in tokens) / max(1, len(tokens))
    log(f"tokenized ({preprocessor.backend}) avg {avg:.0f} tokens/doc in {time.perf_counter()-t:.1f}s")

    # ---- embeddings ----
    t = time.perf_counter()
    log(f"loading embedding model {settings.embedding_model} ...")
    model = SemanticIndex.load_model(settings.embedding_model)
    emb = SemanticIndex.encode_documents(model, corpus.semantic_texts(), batch_size=64)
    np.save(settings.embeddings_path, emb)
    log(f"embeddings {emb.shape} saved in {time.perf_counter()-t:.1f}s")

    settings.meta_path.write_text(json.dumps({
        "corpus_size": corpus.size,
        "embedding_model": settings.embedding_model,
        "dim": int(emb.shape[1]),
        "normalized": True,
    }, indent=2))
    log("wrote index_meta.json — done.")


if __name__ == "__main__":
    main()
