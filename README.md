MoviesMatch


A Search-First Movie Discovery Engine Driven by Genuine Hybrid-Retrieval DepthBuilt with a Gotham-Noir aesthetic, multi-stage neural re-ranking, and zero-hallucination explainable AI.Architecture • Search Pipeline • Quickstart • API Reference • Engineering Decisions⚡ Key Highlights🧠 True Hybrid Search Engine: Merges Exact Token Matching (BM25+) with Dense Vector Embeddings (bge-small-en-v1.5 + FAISS) using Reciprocal Rank Fusion (RRF).🎯 Multi-Stage Re-Ranking: Implements cross-encoder re-ranking (ms-marco-MiniLM-L-6-v2) over the initial candidate pool for high-precision top-$K$ ordering.🤖 SLM-Powered Query Understanding: Uses local Ollama (qwen2.5:3b) to break down natural language queries ("mind-bending sci-fi like Inception with more heart") into intent, era filters, and soft boosts.⚡ Graceful Degradation: Auto-detects missing local dependencies (e.g., missing Ollama or NLTK) and falls back to deterministic rule-based parsing without crashing or hallucinating.🔍 Grounded Explainability: Generates a real-time match breakdown (Lexical, Semantic, Fusion, Rerank) and grounded justifications for every recommendation.🦇 Gotham-Noir Experience: Custom design system built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and Framer Motion.🏗 System Architecture                                  ┌────────────────────────── FastAPI Engine ──────────────────────────┐
  Natural Language Query          │                                                                    │
   ┌──────────────────┐           │   ① SLM / Rules  ── Extract intent, mood, era, "like X", negations │
   │  "cozy 90s sci-fi"│           │         │                                                          │
   └────────┬─────────┘           │   ┌─────┴──────────────────┐                                       │
            │                     │   ▼                        ▼                                       │
            ▼                     │  ② BM25+ Lexical          ② Dense Vector Search                    │
   ┌──────────────────┐           │     (Rank-BM25)              (bge-small + FAISS)                   │
   │ Next.js Frontend │ ── POST ─▶│   └─────┬──────────────────┘                                       │
   │ (App Router / TS)│           │         ▼                                                          │
   │ Framer Motion    │ ◀─ JSON ──│  ③ Fusion Layer (Reciprocal Rank Fusion | Weighted Min-Max)        │
   └──────────────────┘           │         ▼                                                          │
                                  │  ④ Intent-Aware Soft Boosts (Genre, Rating, Year Range)           │
                                  │         ▼                                                          │
                                  │  ⑤ Cross-Encoder Reranker (ms-marco-MiniLM-L-6-v2)                │
                                  │         ▼                                                          │
                                  │  ⑥ Grounded Reason Generation (SLM / Metadata Templates)          │
                                  └────────────────────────────────────────────────────────────────────┘
🧬 Hybrid IR Search PipelineMoviesMatch combines classical Information Retrieval with modern Neural Search across 6 explicit stages:StageNameTechnologyDescription1Intent ParsingOllama (qwen2.5:3b) / Rule EngineExtracts genre targets, release eras, tone, director targets, and exclusions.2aLexical Retrievalrank_bm25.BM25PlusCaptures exact keyword hits (actor names, titles, hyper-specific terms). Lower-bounds TF saturation to prevent over-penalizing long summaries.2bSemantic Retrievalbge-small-en-v1.5 + FAISSNormalizes dense embeddings using L2 norm and computes Cosine distance using FAISS FlatIP index to capture abstract moods and subtext.3Rank FusionReciprocal Rank Fusion (RRF)Fuses Candidate Sets $R_{lex}$ and $R_{sem}$ safely without score-scale imbalances:$$RRF\_Score(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$4Soft BoostingCustom Rule MatrixAdjusts raw fusion scores based on metadata matches (e.g., matching director or release decade).5Cross-Encoder Rerankms-marco-MiniLM-L-6-v2Evaluates the $(Query, Movie\_Summary)$ pairs through a single cross-attention pass to refine the final top-$K$ sequence.6ExplainabilityDynamic Template EngineReturns exact matched lexical terms, score sub-metrics, and a 1-line justification for why the movie fits.🚀 QuickstartPrerequisitesPython: 3.10+Node.js: 18.0+(Optional) Ollama: For SLM-driven intent parsing (brew install ollama)1. Backend SetupBash# Clone the repository
git clone https://github.com/Ayush-ken14/MoviesMatch.git
cd MoviesMatch/backend

# Run automated bootstrap script
# (Creates virtual environment, installs packages, downloads datasets & builds indexes)
chmod +x run.sh
./run.sh
Note: The backend serves at http://localhost:8000. View interactive Swagger API documentation at http://localhost:8000/docs.Bashcd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Download data sources & generate corpus.json
python scripts/build_corpus.py

# Build FAISS vector indices & BM25 parameters
python scripts/build_index.py

# Launch FastAPI server
uvicorn app.main:app --reload --port 8000
2. Frontend SetupBashcd ../frontend

# Install dependencies
npm install

# Start local development server
npm run dev
The application will launch at http://localhost:3000.Note: If the backend service is offline, the frontend falls back to a bundled dataset mock for offline evaluation.3. Enable Local SLM (Optional Upgrade)To enable small-language-model query extraction and natural reasoning:Bash# Start Ollama service
ollama serve

# In a separate terminal, pull the default model
ollama pull qwen2.5:3b
MoviesMatch auto-detects running Ollama instances on startup and upgrades its pipeline automatically.📡 API ContractCore EndpointsEndpointMethodInputOutputDescription/api/healthGET—StatusJSONEngine status, index sizes, and model loading state./api/suggestGET?q=stringList[String]Auto-completion suggestions for film titles./api/searchPOSTSearchRequestSearchResponseMain search endpoint executing the full 6-stage pipeline./api/movie/{id}GETid: stringMovieDetailComplete metadata record for a given film./api/movie/{id}/similarGETid: stringList[Movie]Nearest-neighbor graph search for similar titles.Search Payload ExampleJSON// POST /api/search
{
  "query": "gritty dark knight detective story in Gotham",
  "top_k": 10,
  "fusion_method": "rrf",
  "weights": {
    "lexical": 0.4,
    "semantic": 0.6
  },
  "enable_reranker": true
}
⚙️ Engineering & Design Decisions1. Robustness Against API Outages & CostsNo Third-Party Runtime Dependencies: Post-installation, the search execution pathway functions completely offline. Movie metadata and posters leverage static CDN mappings derived from TMDB datasets.Controlled System Overhead: Embeddings employ lightweight architectures (bge-small-en-v1.5, ~130MB), keeping RAM usage below 1.5 GB while processing requests in under 80 milliseconds.2. Zero-Hallucination GroundingLarge Language Models often fabricate film details when asked for recommendations. MoviesMatch addresses this by restricting LLMs/SLMs to Query Parsing and Templated Summarization. The actual retrieval candidates are strictly bounded by deterministic corpus indexing.3. Gotham-Noir Design LanguageDark-mode visual architecture built with a dark slate foundation (#090A0F).Selective amber accents (#FFB000) for high-contrast visual anchors.Dedicated score component displays sub-metrics (Lexical, Semantic, and Re-rank) directly on card elements for complete transparency.📂 Repository StructureMoviesMatch/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI Application Entrypoint
│   │   ├── schemas.py         # Pydantic Schemas & Types
│   │   ├── engine/            # Retrieval, Fusion, & Rerank Implementations
│   │   └── slm/               # Ollama Driver & Rule-Based Fallbacks
│   ├── scripts/               # Data Ingestion & Index Creation Pipelines
│   └── requirements.txt
├── frontend/
│   ├── app/                   # Next.js 14 App Router (Pages & API Routes)
│   ├── components/            # UI System & Motion Components
│   ├── lib/                   # TypeScript Types & Fetch Utilities
│   └── public/
├── docs/
│   ├── ARCHITECTURE.md        # Technical In-Depth Pipeline Documentation
│   ├── INTERVIEW.md           # System Architecture & IR Theory Discussion Guide
│   └── DEPLOYMENT.md          # Production Deployment Guide (Vercel & Docker)
└── README.md
Built for movie lovers, software architects, and IR enthusiasts.
