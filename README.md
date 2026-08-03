# CineMatch 🦇

**A search-first movie discovery engine with genuine hybrid-retrieval depth and a Gotham-noir soul.**

Type a title *or* a natural-language mood — `mind-bending sci-fi like Inception but with more heart`, `cozy 90s comedies for a rainy sunday` — and CineMatch returns ranked films with real posters, a transparent **match score**, a lexical-vs-semantic breakdown, and a one-line **grounded reason** for every pick. Every card has a **More like this**.

> Rebuilt from the ground up: **FastAPI + a real hybrid IR stack** (BM25+ ⋈ dense embeddings ⋈ cross-encoder rerank ⋈ SLM query-understanding) behind a **Next.js / TypeScript / Framer-Motion** front end.

---

## Architecture

```
                                  ┌────────────────────────── FastAPI ──────────────────────────┐
  natural-language query          │                                                              │
        │                         │   ① SLM / rules  ── parse intent, mood, era, "like X", negs  │
        ▼                         │            │                                                 │
  ┌───────────┐                   │   ┌────────┴─────────┐                                       │
  │ Next.js   │ ── POST /search ─▶│   ▼                  ▼                                       │
  │ (App Rtr) │                   │  ② BM25+ lexical   ② bge-small + FAISS   (top-K each)        │
  │ TS + FM   │ ◀── results ──────│   └────────┬─────────┘                                       │
  └───────────┘                   │            ▼                                                 │
                                  │  ③ fusion  (Reciprocal Rank Fusion │ weighted min-max)       │
                                  │            ▼                                                 │
                                  │  ④ intent-aware soft boosts (genre / era / rating / negation)│
                                  │            ▼                                                 │
                                  │  ⑤ cross-encoder rerank (ms-marco-MiniLM) on the shortlist   │
                                  │            ▼                                                 │
                                  │  ⑥ grounded "why recommended" per result (SLM │ template)    │
                                  └──────────────────────────────────────────────────────────────┘
```

1. **Corpus** — 9,500 films merged from three public, no-auth sources into one clean record set: real TMDB poster URLs + overview + genres + year + rating (Pablinho dump), enriched with director / keywords / tagline (TMDB-5000), plus extra lexical tokens (the repo's original 45k bag). Raw text is preserved for display and grounding.
2. **Lexical** — `rank_bm25.BM25Plus` over a keyword-dense field; the `+` lower-bounds TF saturation so long docs aren't over-penalized. Exposes the actual matched terms.
3. **Semantic** — `BAAI/bge-small-en-v1.5` sentence embeddings, L2-normalized, exact cosine via a FAISS inner-product index. Queries get bge's retrieval instruction prefix; only the query is embedded at request time.
4. **Fusion** — Reciprocal Rank Fusion (rank-based, scale-free) *or* a min-max-normalized weighted blend — method **and** weights are request-configurable from the UI.
5. **Rerank** — a cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`) reads each `(query, movie)` pair jointly and re-scores the shortlist for precision. Degrades gracefully if unavailable.
6. **SLM layer** — a local Ollama instruct model (`qwen2.5:3b` by default) parses the query into structured filters and writes a strictly-grounded one-line reason. **No Ollama? It falls back to a capable rule-based parser + metadata-grounded templates** — the feature always works and never invents facts.
7. **Explainability** — every result carries `score`, a `lexical / semantic / fusion / rerank` breakdown with per-retriever ranks, and `match_terms`. The UI surfaces all of it.

---

## Run it

### Backend  (one command)
```bash
cd backend
./run.sh
```
`run.sh` creates a venv, installs deps, fetches NLTK data, builds the corpus + index on first run (downloads two public CSVs ≈30 MB and the bge-small model ≈130 MB, once), then serves on **http://localhost:8000** (interactive docs at `/docs`).

<details><summary>Manual equivalent</summary>

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/build_corpus.py     # merge sources -> data/corpus.json
python scripts/build_index.py      # embeddings + BM25 tokens
uvicorn app.main:app --reload --port 8000
```
</details>

### Frontend  (one command)
```bash
cd frontend
npm install && npm run dev
```
Opens on **http://localhost:3000**. It talks to the backend at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) and **falls back to bundled real-data mock** if the backend is down, so the UI is demoable standalone.

### Optional: the SLM upgrade
```bash
brew install ollama && ollama serve      # in one shell
ollama pull qwen2.5:3b                     # or llama3.2:3b
```
CineMatch auto-detects Ollama and switches query-understanding + reasons to the model; otherwise it uses the built-in rule engine.

---

## API contract

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/health` | engine + model status |
| `GET`  | `/api/stats` | catalog facets (empty-state) |
| `GET`  | `/api/suggest?q=` | title autocomplete |
| `POST` | `/api/search` | hybrid search — `SearchRequest → SearchResponse` |
| `GET`  | `/api/movie/{id}` | one movie |
| `GET`  | `/api/movie/{id}/similar` | "More like this" |

Full pydantic models in [`backend/app/schemas.py`](backend/app/schemas.py); mirrored TS types in `frontend/lib/types.ts`.

---

## Tech & design decisions

- **Why this hybrid stack:** BM25+ nails exact terms (titles, names, keywords); dense embeddings capture mood/semantics; RRF fuses them without score-scale fights; a cross-encoder fixes the top-k ordering where it matters most. Each stage earns its place and is individually inspectable.
- **Reproducible, key-free data:** posters come straight from the TMDB image CDN via stored `poster_path`s — no API key, no paid tier, fully offline after the one-time CSV pull.
- **Graceful degradation everywhere:** missing Ollama → rules; missing reranker → fused order; missing NLTK data → built-in stopwords + light stemmer. It runs on a laptop.
- **Design:** a bespoke Gotham-noir system — near-black canvas, one restrained bat-signal amber accent, cold steel used *only* to color the semantic score. Theme through type, light and shadow, not clip-art.

---

## Docs

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the ML + backend work, in plain English with worked examples (start here).
- **[docs/INTERVIEW.md](docs/INTERVIEW.md)** — interview-ready talking points and Q&A (ML-theory heavy).
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — deploy the frontend to Vercel (+ the real backend on a container host).
