# CineMatch — Architecture & ML Theory (plain-English guide)

This document explains **how CineMatch works end to end**, in simple language, with
worked examples. It is split into two halves:

1. **The ML side** — how a sentence like *"mind-bending sci-fi like Inception but with
   more heart"* becomes a ranked list of movies. (This is the important part.)
2. **The backend side** — how that logic is wrapped into an API, and how the
   frontend talks to it.

---

# Part 1 — The ML side (the retrieval engine)

## 1.0 The big picture in one paragraph

We have ~9,500 movies. When you type a query, we don't just keyword-match. We run
**two different search engines in parallel** — one that matches *words* (BM25+) and
one that matches *meaning* (embeddings) — **combine** their opinions, **re-check** the
top candidates with a smarter-but-slower model (a cross-encoder), and finally write a
**one-line human reason** for each result. A small language layer reads your sentence
first to pull out structure (genre, mood, decade, "like X", "not Y").

```
your sentence
     │
     ▼
[1] UNDERSTAND   → genre? mood? decade? "like X"? "not Y"? highly-rated?
     │
     ├─────────────────────┬───────────────────────┐
     ▼                     ▼                        │
[2a] BM25+ (words)   [2b] embeddings (meaning)      │  each returns its own top-80
     └──────────┬──────────┘                        │
                ▼                                    │
[3] FUSION  → merge the two ranked lists into one   │
                ▼                                    │
[4] BOOSTS  → nudge by genre/decade/rating, drop "not Y"
                ▼
[5] RERANK  → a cross-encoder re-scores the top ~40 for precision
                ▼
[6] EXPLAIN → grounded one-line "why" per result
                ▼
        ranked movies + scores
```

Why do it this way? Because **no single method is enough**:
- Word-matching alone fails on *"movies that feel like a fever dream"* — none of those
  words appear in a movie's plot.
- Meaning-matching alone fails on *"The Dark Knight"* — you want that exact film, not
  "films that are thematically dark and knightly."

Using both, then reconciling them, is called **hybrid retrieval**. It's the same idea
behind modern search and RAG systems.

---

## 1.1 The corpus (what we search over)

Each movie is one "document". We merged three free, public data sources into one clean
record (`backend/scripts/build_corpus.py`):

```json
{
  "id": "inception",
  "title": "Inception",
  "year": 2010,
  "genres": ["Action", "Science Fiction", "Adventure"],
  "overview": "Cobb, a skilled thief who commits corporate espionage ...",
  "director": "Christopher Nolan",
  "keywords": ["dream", "kidnapping", "subconsciousness", ...],
  "vote_average": 8.4,
  "poster_url": "https://image.tmdb.org/t/p/original/....jpg",

  "semantic_text": "Inception (2010) Genres: ... Your mind is the scene of the crime. Cobb ...",
  "lexical_text":  "Inception Action Science Fiction ... dream kidnapping ..."
}
```

Two derived fields do the heavy lifting:
- **`semantic_text`** — a natural, readable paragraph. Fed to the *meaning* engine.
- **`lexical_text`** — a keyword-dense bag (genres and keywords repeated). Fed to the
  *word* engine.

We keep the raw fields (`overview`, `director`, …) untouched so we can **display** them
and **ground explanations** in real facts.

### Text preprocessing (`preprocess.py`)
Before word-matching, we clean text with a standard NLP pipeline:
1. **Normalize** — lowercase, strip accents (`café → cafe`).
2. **Tokenize** — split into words, drop punctuation.
3. **Remove stopwords** — throw away "the, a, of, is" (no search value).
4. **Lemmatize** — reduce words to a base form so `dreams`, `dreaming`, `dreamt` all
   become `dream` and can match each other.

Example: `"The mind-bending DREAMS of detectives"` → `["mind", "bend", "dream", "detective"]`.
The **same** cleaning is applied to documents (at build time) and to the query (at search
time) so they match.

---

## 1.2 BM25+ — the "word" engine (lexical retrieval)

**What it does:** ranks documents by how well their words overlap your query words —
but smartly, not just by counting.

**The intuition (three rules):**
1. **Rare words matter more.** If your query has "subconsciousness", a movie containing
   it is a strong signal. If it has "man", that's weak — half the corpus has "man". This
   is **IDF** (inverse document frequency): rarer word → higher weight.
2. **Repetition has diminishing returns.** A plot that says "dream" 8 times isn't 8×
   more relevant than one that says it once. BM25 **saturates** term frequency — the
   2nd mention helps a lot, the 8th barely.
3. **Long documents get a fair shake.** A long plot naturally contains more words, so it
   would unfairly win. BM25 **normalizes by length**.

**The formula (you don't need to memorize it, just recognize it):**
```
score(doc, query) = Σ  IDF(word) ·  ( f · (k1+1) ) / ( f + k1·(1 - b + b·|doc|/avg_len) )  + δ
                  word in query
```
- `f` = how often the word appears in the doc
- `k1` (=1.5) controls how fast repetition saturates
- `b` (=0.75) controls how much length matters
- `δ` (=1.0) is the **"+" in BM25+**: a small floor so very long documents that *do*
  contain the word aren't pushed to ~0. That's the only difference between BM25 and
  BM25+ — a lower bound that fixes BM25's bias against long docs.

**Example:** query `dark knight`.
- "The Dark Knight" plot contains both, "dark" and "knight" are moderately rare → high score.
- A random romance contains neither → 0.
We use the library `rank_bm25` (`BM25Plus`) and also read back **which query words
actually matched** each movie — that's the `match_terms` you see on a card.

**Strength:** exact terms, names, titles. **Weakness:** it's blind to meaning — "fever
dream" won't match "surreal" unless those exact letters appear.

---

## 1.3 Embeddings + FAISS — the "meaning" engine (semantic retrieval)

**What it does:** finds movies whose *meaning* is close to your query's meaning, even
with zero shared words.

**The intuition:** a neural model (`BAAI/bge-small-en-v1.5`) reads a piece of text and
turns it into a list of 384 numbers — a **vector** — that captures its meaning. Texts
about similar things get similar vectors. "A surreal, dreamlike film" and "a movie that
feels like a fever dream" land close together in this 384-dimensional space, even though
they share no keywords.

```
"fever dream movie"      → [0.02, -0.11, 0.34, ... ]  (384 numbers)
"Mulholland Drive plot"  → [0.03, -0.09, 0.31, ... ]  ← very close  → high similarity
"tax accounting guide"   → [0.90,  0.40,-0.22, ... ]  ← far away    → low similarity
```

**How we measure "close":** **cosine similarity** — the angle between two vectors. We
L2-normalize every vector (make its length 1), which turns cosine similarity into a
simple dot product. Score ranges ~0 (unrelated) to 1 (identical meaning).

**Why FAISS:** comparing your query to 9,500 vectors is fast, but FAISS (Facebook AI
Similarity Search) makes it instant and scales to millions. We use an **exact** flat
inner-product index — for 9,500 movies exact is plenty fast (~8 ms) and 100% accurate.

**Precomputation:** we embed all 9,500 movies **once** offline (`build_index.py`) and
save the matrix to disk. At query time we only embed your one query, then FAISS returns
the nearest movie vectors.

**One detail — asymmetric search:** bge is trained so that **queries** get a short
instruction prefix (`"Represent this sentence for searching relevant passages:"`) while
**documents** don't. This matches how it was trained and improves results.

**Strength:** mood, themes, paraphrases, natural language. **Weakness:** can miss exact
names/titles, and it **can't do negation** — "not horror" still looks semantically like
horror. (We fix that with boosts, see 1.5.)

---

## 1.4 Fusion — combining the two rankings

Now we have two ranked lists (word-based and meaning-based) with **incomparable scores**
(BM25 might be 0–15, cosine is 0–1). How do we merge them fairly?

### Method A — Reciprocal Rank Fusion (RRF) — our default
Ignore the raw scores, use only the **rank** (position) in each list:
```
fused_score(movie) = 1/(k + rank_in_lexical) + 1/(k + rank_in_semantic)     (k = 60)
```
- A movie ranked #1 by words and #3 by meaning scores `1/61 + 1/63`.
- Being near the top of *either* list helps; being top of *both* is best.
- **Why it's good:** it's **scale-free** — no need to normalize the two engines' scores,
  so a weirdly-large BM25 score can't dominate. RRF is a well-known, robust default in IR.

### Method B — Weighted blend (optional, user-selectable)
Normalize each engine's scores to 0–1 (min-max), then take a weighted average:
```
fused_score = w_lex · lexical_norm + w_sem · semantic_norm     (e.g. 0.5 / 0.5)
```
The UI's **RRF / Weighted** toggle and the weight slider control exactly this. It's a
real knob, not decoration — flipping it re-runs the search with a different fusion.

**Example:** for *"fever dream"*, the meaning engine finds Mulholland Drive (rank 1) but
the word engine doesn't (not in its list). RRF still ranks it well because one strong
vote is enough. For *"The Dark Knight"*, the word engine nails it at rank 1, so RRF keeps
it on top.

---

## 1.5 Intent-aware boosts (using the understood query)

The query-understanding step (1.7) extracts structure. We use it to **nudge** scores:
- **Genre match** (`+`): query asked for Comedy and the movie is a Comedy → small bonus.
- **Decade match** (`+/−`): "90s" → boost 1990–1999 films, penalize others.
- **Rating** (`+/−`): "highly rated" → strong penalty for low-rated films.
- **Negation** (`−−`): "not horror" → we **hard-remove** Horror movies (as long as enough
  results remain), and we strip "horror" from the word query so it's never a *positive*
  match. This is how CineMatch respects "not X" even though embeddings can't.

These are additive adjustments to the score, deliberately small so they *tilt* the
ranking without overriding genuine relevance.

---

## 1.6 Cross-encoder reranking — the precision pass

Fusion gives a good top-40, but the bi-encoder (bge) scored the query and each movie
**separately** — it never looked at them *together*. A **cross-encoder**
(`cross-encoder/ms-marco-MiniLM-L-6-v2`) does exactly that: it takes `(query, movie_text)`
as **one** input and outputs a single relevance score. Because it can attend to both at
once, it's much more accurate — but too slow to run on all 9,500 movies.

So we use the classic **retrieve-then-rerank** pattern:
- **Retrieve** cheaply: BM25+ and bge each grab 80 candidates (fast).
- **Rerank** expensively: the cross-encoder re-scores only the top ~40 (accurate).

This is the single biggest quality lever and also the main latency cost (~150 ms of a
~200 ms search). If the reranker isn't available, we gracefully fall back to the fused
order.

**Analogy:** retrieval is skimming 9,500 book blurbs to shortlist 40; reranking is
actually reading those 40 to pick the best.

---

## 1.7 The SLM layer — query understanding + grounded reasons

Two jobs, both done by a small language model **if a local Ollama server is running**,
otherwise by a **rule-based fallback** (so it always works):

**(a) Query understanding** — turn a sentence into structure:
```
"cozy 90s comedies for a rainy sunday, not horror"
   → { genres: ["Comedy"], moods: ["cozy"], era: 1990–1999,
       negations: ["horror"], min_rating: null, similar_to: null }
```
The fallback is a real parser: regex + vocabulary maps for genres, moods, decades
("90s", "before 2000"), "like X", "not/less/without X", and "highly rated". This drives
the boosts (1.5) and the query shown in the UI's "how we read your query" panel.

**(b) Grounded explanations** — a one-line *why* per result, e.g.
> *"Christopher Nolan's 2012 action-crime — its dark, knight threads line up with your
> search, and it's well-rated at 7.8."*

**Grounding rule:** the reason may only use **real metadata** from that movie (director,
year, genre, matched keywords, rating). It can never invent actors or plot points. The
fallback builds the sentence from a template filled with real fields; the Ollama version
is given the facts and told "use ONLY these." This is how we get natural-sounding reasons
with **zero hallucination**.

---

## 1.8 Scores you see in the UI

- **Match %** (the ring) — a "confidence for this query" derived from the final ranking.
  The page's top result anchors high; the rest fan down. It's meant to be readable, not a
  raw probability.
- **Lexical / Semantic bars** — the *real* normalized sub-scores from BM25+ and bge, so
  you can literally see whether a result won on words, on meaning, or both.
- **Rank badges** (`lexical_rank`, `semantic_rank`) — where each engine placed it.

This transparency is intentional: the hybrid is the story, so we show it.

---

# Part 2 — The backend side (the API)

## 2.1 Shape of the code
```
backend/
├── app/
│   ├── main.py          FastAPI app: routes + CORS + startup
│   ├── schemas.py       pydantic models = the API contract (source of truth)
│   ├── config.py        all tunables (model names, k1/b, pool sizes) in one place
│   └── engine/
│       ├── preprocess.py   text cleaning (normalize/lemmatize/stopwords)
│       ├── corpus.py       loads corpus.json
│       ├── lexical.py      BM25+ wrapper
│       ├── semantic.py     bge + FAISS
│       ├── fusion.py       RRF / weighted blend
│       ├── rerank.py       cross-encoder
│       ├── slm.py          query understanding + grounded reasons
│       └── search.py       the orchestrator that runs 1.1 → 1.8
├── scripts/
│   ├── build_corpus.py  merge data sources → data/corpus.json  (run once)
│   ├── build_index.py   embed + tokenize → data/*.npy/.pkl     (run once)
│   └── smoke.py         end-to-end test + relevance checks
└── run.sh               one command: venv → deps → build → serve
```

## 2.2 Request lifecycle (what happens on `POST /api/search`)
1. FastAPI validates the JSON body against `SearchRequest` (pydantic) — bad input is
   auto-rejected with a clear error.
2. `SearchEngine.search()` runs the pipeline (parse → retrieve → fuse → boost → rerank →
   explain), timing each stage.
3. The result is serialized as a `SearchResponse` and sent back. The response includes the
   parsed query, per-stage timings, engine info, and the ranked results with score
   breakdowns.

**Startup:** on boot we load the corpus, build the FAISS index from the saved vectors,
build BM25+ from the saved tokens, and "warm up" the models (first call is otherwise
slow). This takes ~15 s once; after that searches are ~50–250 ms.

## 2.3 The API contract
| Method | Route | Purpose |
|---|---|---|
| GET  | `/api/health` | is the engine ready? which models are live? |
| GET  | `/api/stats` | catalog facts for the landing page |
| GET  | `/api/suggest?q=` | title autocomplete |
| POST | `/api/search` | the hybrid search |
| GET  | `/api/movie/{id}` | one movie |
| GET  | `/api/movie/{id}/similar` | "More like this" |

**"More like this"** reuses the whole pipeline but seeds it with the *movie itself*: it
searches using that movie's embedding + keywords and excludes the movie from its own
results.

## 2.4 Frontend ↔ backend
- Next.js (App Router, TypeScript) calls the API at `NEXT_PUBLIC_API_URL`
  (default `http://localhost:8000`). CORS is enabled for `localhost`.
- The TS types in `frontend/lib/types.ts` mirror `schemas.py` exactly, so the contract is
  enforced on both sides.
- If the backend is unreachable, the frontend falls back to **bundled real-data mock**, so
  the UI is always demoable.

## 2.5 Design choices (and the honest trade-offs)
- **Exact FAISS, not approximate** — at 9,500 docs, approximate indexes add complexity for
  no speed benefit. (At millions, you'd switch to `IndexIVFFlat`/HNSW.)
- **Precompute everything reproducible** — embeddings and tokens are build artifacts, not
  committed; two scripts rebuild them from scratch.
- **Graceful degradation** — no Ollama → rules; no reranker → fused order; no NLTK data →
  built-in stopwords. It runs on a laptop with nothing pre-installed.
- **This is a personal project** — deliberately no Redis/queue/autoscaling. The code is
  simple and readable on purpose.
