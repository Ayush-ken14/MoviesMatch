"""
schemas.py — The CineMatch API contract (single source of truth).

Every request/response body in the FastAPI layer is one of these pydantic
models. The frontend's TypeScript types in `frontend/lib/types.ts` mirror
these one-to-one. Change them here first, then propagate.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
#  Core movie record                                                          #
# --------------------------------------------------------------------------- #
class Movie(BaseModel):
    id: str
    tmdb_id: Optional[int] = None
    title: str
    year: Optional[int] = None
    genres: list[str] = []
    overview: str = ""
    tagline: Optional[str] = None
    poster_url: Optional[str] = None
    vote_average: Optional[float] = None
    vote_count: int = 0
    popularity: float = 0.0
    language: Optional[str] = None
    cast: list[str] = []
    director: Optional[str] = None
    keywords: list[str] = []
    runtime: Optional[int] = None


# --------------------------------------------------------------------------- #
#  Search result (a Movie + why it matched)                                   #
# --------------------------------------------------------------------------- #
class ScoreBreakdown(BaseModel):
    """All sub-scores are min-max normalized to 0..1 within the candidate set
    so the UI can render comparable bars."""
    lexical: float = 0.0
    semantic: float = 0.0
    fusion: float = 0.0
    rerank: Optional[float] = None
    lexical_rank: Optional[int] = None
    semantic_rank: Optional[int] = None


class SearchResult(Movie):
    score: float = 0.0                 # final ranking score, 0..1
    scores: ScoreBreakdown = ScoreBreakdown()
    match_terms: list[str] = []        # query terms that hit the lexical index
    reason: Optional[str] = None       # grounded one-liner (SLM or template)


# --------------------------------------------------------------------------- #
#  Query understanding                                                        #
# --------------------------------------------------------------------------- #
class ParsedQuery(BaseModel):
    intent: Literal["recommend", "find_title", "similar"] = "recommend"
    clean_query: str = ""
    genres: list[str] = []
    moods: list[str] = []
    era_from: Optional[int] = None
    era_to: Optional[int] = None
    similar_to: Optional[str] = None
    keywords: list[str] = []
    negations: list[str] = []
    min_rating: Optional[float] = None
    source: str = "rules"              # "ollama:<model>" | "rules"


class Timing(BaseModel):
    parse: float = 0.0
    lexical: float = 0.0
    semantic: float = 0.0
    fusion: float = 0.0
    rerank: float = 0.0
    reason: float = 0.0
    total: float = 0.0


class EngineInfo(BaseModel):
    fusion: str
    rerank: bool
    embedding_model: str
    reranker_model: Optional[str] = None
    slm: str
    corpus_size: int


# --------------------------------------------------------------------------- #
#  Requests / responses                                                       #
# --------------------------------------------------------------------------- #
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=400)
    limit: int = Field(12, ge=1, le=50)
    fusion: Literal["rrf", "weighted"] = "rrf"
    lexical_weight: float = Field(0.5, ge=0.0, le=1.0)
    semantic_weight: float = Field(0.5, ge=0.0, le=1.0)
    rerank: bool = True
    explain: bool = True


class SearchResponse(BaseModel):
    query: str
    parsed: ParsedQuery
    engine: EngineInfo
    timing_ms: Timing
    count: int
    results: list[SearchResult]


class Suggestion(BaseModel):
    id: str
    title: str
    year: Optional[int] = None
    poster_url: Optional[str] = None


class GenreCount(BaseModel):
    name: str
    count: int


class StatsResponse(BaseModel):
    corpus_size: int
    genres: list[GenreCount]
    decades: list[GenreCount]
    sample_queries: list[str]
    top_rated: list[Suggestion]


class HealthResponse(BaseModel):
    status: str
    ready: bool
    corpus_size: int
    embedding_model: str
    reranker: bool
    reranker_model: Optional[str] = None
    slm: str
    faiss: bool
