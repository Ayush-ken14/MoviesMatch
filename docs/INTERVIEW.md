# CineMatch — Interview Prep (talking points + Q&A)

Everything here is about **your** project. Answers are written the way you'd say them out
loud. The ML section is deepest, because that's what gets probed.

---

## 1. The 30-second pitch

> "CineMatch is a search-first movie recommender. You type a title or a natural-language
> mood — like *'mind-bending sci-fi like Inception but with more heart'* — and it returns
> ranked films with a match score, a lexical-vs-semantic breakdown, and a grounded
> one-line reason for each pick. Under the hood it's a **hybrid retrieval pipeline**: BM25+
> for keyword matching, a bge-small embedding model with FAISS for semantic matching,
> Reciprocal Rank Fusion to combine them, a cross-encoder to rerank the top candidates,
> and a small-LM layer for query understanding and explanations. FastAPI backend,
> Next.js + TypeScript frontend."

## 2. Talking points (drop these naturally)
- "I didn't rely on a single retriever — **word matching and meaning matching fail on
  different queries**, so I fused them."
- "I used the **retrieve-then-rerank** pattern: cheap retrieval to shortlist, an expensive
  cross-encoder to reorder — the standard way to get precision without paying for it on
  the whole corpus."
- "Every score is **explainable** — the UI shows how much each result won on lexical vs
  semantic, and the reasons are **grounded in real metadata**, so no hallucination."
- "I designed for **graceful degradation** — it runs with no Ollama, no GPU, nothing
  pre-installed."

---

## 3. ML deep-dive Q&A

### Q: What is BM25 and why not just TF-IDF?
**A:** BM25 is a ranking function for keyword relevance. It builds on TF-IDF's two ideas —
term frequency (a word appearing more = more relevant) and inverse document frequency
(rare words matter more) — but fixes TF-IDF's flaws: it **saturates** term frequency (the
10th occurrence of a word barely adds over the 2nd, controlled by `k1`) and it
**normalizes for document length** (controlled by `b`), so long documents don't win just by
being long. I used **BM25+**, which adds a small constant `δ` — a lower bound that stops
BM25 from over-penalizing long documents that genuinely contain the term.

### Q: What's an embedding, in one sentence?
**A:** A neural model maps a piece of text to a fixed-length vector of numbers (384 dims
for bge-small) such that texts with similar *meaning* have vectors that are close together.
So semantic similarity becomes geometric closeness.

### Q: How do you measure similarity between vectors?
**A:** Cosine similarity — the cosine of the angle between them, ignoring magnitude. I
L2-normalize all vectors (scale to length 1), which makes cosine similarity equal to a
plain dot product, so I can use a FAISS inner-product index and get exact cosine for free.

### Q: Bi-encoder vs cross-encoder — what's the difference and why use both?
**A:** A **bi-encoder** (bge) encodes the query and each document **separately** into
vectors and compares them — fast, because you precompute all document vectors once and
just do nearest-neighbour at query time. A **cross-encoder** feeds `(query, document)`
**together** into the model and outputs one relevance score — far more accurate because it
can attend across both, but slow, because you must run the model fresh for every pair. So
I use the bi-encoder to **retrieve** a shortlist cheaply and the cross-encoder to
**rerank** only the top ~40. Best of both.

### Q: Why hybrid? Why not just embeddings — isn't semantic search "better"?
**A:** They fail on different inputs. Embeddings are great for mood and paraphrase
(*"feels like a fever dream"*) but weak on exact tokens — for a query like *"The Dark
Knight"* or an actor's name, keyword search is more reliable. BM25 is the opposite. Fusing
them covers both, and empirically the fused list beats either alone.

### Q: How exactly do you fuse two rankings with different score scales?
**A:** My default is **Reciprocal Rank Fusion**. It throws away the raw scores and uses
only each item's **rank**: `score = Σ 1/(k + rank)` across the two lists, with `k=60`.
Because it's rank-based it's **scale-free** — I don't have to normalize BM25's 0–15 range
against cosine's 0–1 range, so neither engine can dominate just because its numbers are
bigger. I also implemented an optional **weighted blend** (min-max normalize each, then a
weighted average) exposed as a UI toggle.

### Q: Embeddings can't do negation. How does "not horror" work?
**A:** Right — in embedding space "not horror" still points toward horror. I handle
negation with **structure**, not vectors: the query-understanding step extracts
`negations=["horror"]`, then I (1) **hard-filter** out Horror-genre movies when enough
results remain, and (2) strip "horror" from the keyword query so BM25 can't count it as a
*positive* match. That's why the "not horror" query returns thrillers, not horror.

### Q: What's the cold-start / precomputation story?
**A:** Document embeddings are computed **once** offline and saved as a normalized float32
matrix (`build_index.py`); at query time I only embed the single query. BM25 tokens are
also precomputed and pickled. On server startup I load these, build the FAISS + BM25
indexes in memory, and warm the models. So the expensive work happens once, not per
request.

### Q: How would you evaluate retrieval quality?
**A:** For a personal project I used qualitative checks plus a few automated assertions
(exact-title queries return the exact film; "90s" queries return 1990s films; "not horror"
excludes horror). To do it properly I'd build a small labelled set of (query → relevant
movies) and measure **nDCG@10, MRR, and Recall@k** — nDCG because ranking order matters,
MRR for "is the best result near the top," Recall@k to check the retrieval stage isn't
dropping good candidates before rerank. I'd A/B the fusion methods and `k1/b` on that set.

### Q: Why bge-small specifically?
**A:** It's a strong small English retrieval model (384-dim) that runs comfortably on CPU,
downloads in ~130 MB, and is trained for asymmetric query/passage retrieval (queries get an
instruction prefix). For a laptop-scale personal project it's the sweet spot of quality vs
resource. I could swap to `bge-base` for a bit more quality — the model name is one config
line.

### Q: What does the small-LM (SLM) layer actually add?
**A:** Two things: (1) **query understanding** — parsing a messy sentence into structured
filters (genre/mood/decade/"like X"/"not Y"), and (2) **grounded explanations** — a
one-line reason per result. It's wired to a local Ollama model if present, but the
**rule-based fallback** does both well enough that the model is an upgrade, not a
dependency. The key discipline is **grounding**: reasons are built only from that movie's
real metadata, so they never hallucinate.

### Q: How do you prevent hallucinated reasons?
**A:** The explanation function is only ever given real fields (director, year, genre,
matched keywords, rating) and, in the LLM path, is explicitly instructed to use only those
facts. The fallback path is a template filled with real fields, so it's hallucination-proof
by construction.

---

## 4. Backend / system-design Q&A

### Q: Walk me through a request.
**A:** `POST /api/search` → FastAPI validates the body with pydantic → the engine parses
the query, runs BM25+ and bge/FAISS in parallel to get 80 candidates each, fuses them with
RRF, applies genre/decade/rating/negation boosts, reranks the top ~40 with the
cross-encoder, and writes a grounded reason per result → returns a typed `SearchResponse`
with per-stage timings and score breakdowns. End to end ~50–250 ms.

### Q: Where's the latency, and how would you cut it?
**A:** The cross-encoder rerank dominates (~150 ms of ~200 ms). To cut it: cache results
for repeat queries, rerank fewer candidates, use a smaller/quantized reranker or ONNX
runtime, or move to GPU. Retrieval itself is single-digit milliseconds.

### Q: Why FastAPI + pydantic?
**A:** Async, fast, and pydantic gives me typed request/response validation for free — the
schema *is* the contract, and the frontend TypeScript types mirror it, so both ends stay in
sync.

### Q: How is the frontend structured?
**A:** Next.js App Router + TypeScript + Tailwind + Framer Motion. A typed API client, a
custom Gotham-noir design system, real loading/empty/error/no-results states, and a mock
fallback so the UI works even if the backend is down.

---

## 5. "Why did you…" decision questions
- **Why RRF as default?** Scale-free and robust; doesn't need score normalization.
- **Why precompute embeddings?** Query latency — embedding 9,500 docs per request would be
  absurd; do it once.
- **Why not put everything in one model / just prompt an LLM?** An LLM over 9,500 movies
  per query is slow, expensive, and hallucinates. Retrieval is the right tool; the LLM is
  used only where it adds value (understanding + explaining).
- **Why hard-filter negations instead of just penalizing?** A user who says "not horror"
  means it; a soft penalty still let horror leak to the top, so I filter.

---

## 6. Known limitations (say these — it shows maturity)
- **No formal eval set** — quality is checked qualitatively + a few assertions, not with
  labelled nDCG/MRR.
- **Catalog is ~9,500 popular films**, not the full TMDB — a reproducibility/size trade-off
  driven by which poster-complete sources are freely available without an API key.
- **Cast isn't structured** for every film (the free source pre-flattened it), so I ground
  reasons on director/genre/keywords instead.
- **Cross-encoder is the latency bottleneck** — fine locally, would need caching/GPU at
  scale.
- **Personal project scope** — no auth, no persistence, no horizontal scaling by design.

## 7. If asked "what would you do next?"
- Add a labelled eval set + nDCG/MRR dashboard and tune `k1/b/δ` and fusion weights against
  it.
- Learned fusion (train a small model to weight lexical vs semantic per query).
- Query-embedding + result cache for latency.
- User feedback signals (click / "more like this") to personalize ranking.
