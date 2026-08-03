export interface Movie {
  id: string;
  tmdb_id: number | null;
  title: string;
  year: number | null;
  genres: string[];
  overview: string;
  tagline: string | null;
  poster_url: string | null;
  vote_average: number | null;
  vote_count: number;
  popularity: number;
  language: string | null;
  cast: string[];
  director: string | null;
  keywords: string[];
  runtime: number | null;
}

export interface ScoreBreakdown {
  lexical: number;
  semantic: number;
  fusion: number;
  rerank: number | null;
  lexical_rank: number | null;
  semantic_rank: number | null;
}

export interface SearchResult extends Movie {
  score: number;
  scores: ScoreBreakdown;
  match_terms: string[];
  reason: string | null;
}

export interface ParsedQuery {
  intent: "recommend" | "find_title" | "similar";
  clean_query: string;
  genres: string[];
  moods: string[];
  era_from: number | null;
  era_to: number | null;
  similar_to: string | null;
  keywords: string[];
  negations: string[];
  min_rating: number | null;
  source: string;
}

export interface Timing {
  parse: number;
  lexical: number;
  semantic: number;
  fusion: number;
  rerank: number;
  reason: number;
  total: number;
}

export interface EngineInfo {
  fusion: string;
  rerank: boolean;
  embedding_model: string;
  reranker_model: string | null;
  slm: string;
  corpus_size: number;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  fusion?: "rrf" | "weighted";
  lexical_weight?: number;
  semantic_weight?: number;
  rerank?: boolean;
  explain?: boolean;
}

export interface SearchResponse {
  query: string;
  parsed: ParsedQuery;
  engine: EngineInfo;
  timing_ms: Timing;
  count: number;
  results: SearchResult[];
}

export interface Suggestion {
  id: string;
  title: string;
  year: number | null;
  poster_url: string | null;
}

export interface GenreCount {
  name: string;
  count: number;
}

export interface StatsResponse {
  corpus_size: number;
  genres: GenreCount[];
  decades: GenreCount[];
  sample_queries: string[];
  top_rated: Suggestion[];
}

export interface HealthResponse {
  status: string;
  ready: boolean;
  corpus_size: number;
  embedding_model: string;
  reranker: boolean;
  reranker_model: string | null;
  slm: string;
  faiss: boolean;
}
