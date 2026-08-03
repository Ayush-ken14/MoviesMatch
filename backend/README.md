---
title: CineMatch API
emoji: 🦇
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# CineMatch API

Hybrid movie-search backend (FastAPI): BM25+ lexical retrieval, `bge-small-en-v1.5`
dense embeddings + FAISS, Reciprocal Rank Fusion, a cross-encoder reranker, and a
grounded-explanation layer.

- Interactive docs: `/docs`
- Health: `/api/health`
- Search: `POST /api/search`

Full project + frontend: https://github.com/Aln2004/CineMatch
