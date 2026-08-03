"""
main.py — the CineMatch FastAPI service.

Routes (see app/schemas.py for the full contract):
  GET  /api/health                     engine + model status
  GET  /api/stats                      catalog facets for the empty state
  GET  /api/suggest?q=&limit=          title autocomplete
  POST /api/search                     hybrid search  (SearchRequest -> SearchResponse)
  GET  /api/movie/{id}                 single movie
  GET  /api/movie/{id}/similar?limit=  "More like this"
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.engine.search import SearchEngine
from app.schemas import (
    HealthResponse,
    Movie,
    SearchRequest,
    SearchResponse,
    StatsResponse,
    Suggestion,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")
log = logging.getLogger("cinematch")

state: dict[str, SearchEngine] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("loading engine ...")
    engine = SearchEngine(settings)
    state["engine"] = engine
    log.info("corpus=%d  slm=%s  loading models (first run downloads them) ...",
             engine.corpus.size, engine.slm.label)
    try:
        engine.warmup()
        log.info("ready. reranker=%s", bool(engine.reranker and engine.reranker.available))
    except Exception as e:  # pragma: no cover - model download failure shouldn't kill server
        log.warning("warmup issue (engine still serves): %s", e)
    yield
    state.clear()


app = FastAPI(title="CineMatch API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Public, read-only, no-credentials API — allow any origin so the deployed
    # frontend (Vercel, HF Space, localhost, …) can call it from the browser.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def engine() -> SearchEngine:
    eng = state.get("engine")
    if eng is None:
        raise HTTPException(503, "engine not ready")
    return eng


@app.get("/")
def root():
    return {"service": "CineMatch API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health", response_model=HealthResponse)
def health():
    return engine().health()


@app.get("/api/stats", response_model=StatsResponse)
def stats():
    return engine().stats()


@app.get("/api/suggest", response_model=list[Suggestion])
def suggest(q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    return engine().suggest(q, limit)


@app.post("/api/search", response_model=SearchResponse)
def search(req: SearchRequest):
    return engine().search(req)


@app.get("/api/movie/{movie_id}", response_model=Movie)
def get_movie(movie_id: str):
    try:
        return engine().get_movie(movie_id)
    except KeyError:
        raise HTTPException(404, f"movie '{movie_id}' not found")


@app.get("/api/movie/{movie_id}/similar", response_model=SearchResponse)
def similar(movie_id: str, limit: int = Query(12, ge=1, le=50)):
    try:
        return engine().similar(movie_id, limit)
    except KeyError:
        raise HTTPException(404, f"movie '{movie_id}' not found")
