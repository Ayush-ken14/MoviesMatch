import searchFixture from "./fixtures/search.json";
import statsFixture from "./fixtures/stats.json";
import type {
  Movie,
  SearchRequest,
  SearchResponse,
  SearchResult,
  StatsResponse,
  Suggestion,
} from "./types";

/**
 * Bundled fixture-backed engine so the app is fully demoable when the backend
 * is down (or when NEXT_PUBLIC_USE_MOCK === "1"). Everything derives from the
 * two real fixtures shipped in lib/fixtures.
 */

const BASE_SEARCH = searchFixture as unknown as SearchResponse;
const STATS = statsFixture as unknown as StatsResponse;

/** Strip the private *_text fields the fixtures carry but the type omits. */
function cleanResult(raw: SearchResult): SearchResult {
  const { ...rest } = raw as SearchResult & {
    semantic_text?: string;
    lexical_text?: string;
  };
  delete (rest as Record<string, unknown>).semantic_text;
  delete (rest as Record<string, unknown>).lexical_text;
  return rest;
}

const ALL_RESULTS: SearchResult[] = BASE_SEARCH.results.map(cleanResult);

/** Simulated per-stage latency with light jitter so telemetry feels alive. */
function jitter(base: number, spread: number): number {
  return Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "but", "like", "more", "that", "feel", "feels",
  "movies", "movie", "film", "films", "some", "very", "into", "from", "your",
]);

/**
 * Score a result against the query by matching tokens across searchable fields.
 * Produces a deterministic-ish relevance signal used only to reorder the
 * fixture — the pre-computed hybrid scores are preserved for display.
 */
function relevance(result: SearchResult, terms: string[]): number {
  if (terms.length === 0) return result.score;
  const haystack = [
    result.title,
    result.overview,
    result.tagline ?? "",
    result.genres.join(" "),
    result.keywords.join(" "),
    result.director ?? "",
    (result.match_terms ?? []).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) hits += 1;
  }
  // Blend keyword overlap with the movie's intrinsic quality so an unmatched
  // query still returns a sensible, well-ordered set rather than nothing.
  const overlap = hits / terms.length;
  return overlap * 0.7 + result.score * 0.3;
}

export function mockSearch(request: SearchRequest): SearchResponse {
  const query = request.query.trim();
  const terms = tokenize(query).filter((t) => !STOPWORDS.has(t));

  const scored = ALL_RESULTS.map((result) => ({
    result,
    rel: relevance(result, terms),
  }));

  scored.sort((a, b) => b.rel - a.rel || b.result.score - a.result.score);

  const limit = request.limit ?? scored.length;
  const results = scored.slice(0, limit).map((s) => s.result);

  const useWeighted = request.fusion === "weighted";
  const rerankOn = request.rerank ?? true;

  return {
    query,
    // Reuse the rich fixture parse when the query matches it, else synthesize
    // a lightweight parse from the query itself.
    parsed:
      query.toLowerCase() === BASE_SEARCH.query.toLowerCase()
        ? BASE_SEARCH.parsed
        : synthParse(query, terms),
    engine: {
      ...BASE_SEARCH.engine,
      fusion: useWeighted ? "weighted" : "rrf",
      rerank: rerankOn,
      reranker_model: rerankOn ? BASE_SEARCH.engine.reranker_model : null,
    },
    timing_ms: {
      parse: jitter(2.1, 1),
      lexical: jitter(9.4, 3),
      semantic: jitter(7.8, 3),
      fusion: jitter(0.6, 0.3),
      rerank: rerankOn ? jitter(38.2, 8) : 0,
      reason: jitter(1.1, 0.6),
      total: 0,
    },
    count: results.length,
    results,
  };
}

/** Derive a plausible ParsedQuery for arbitrary queries in mock mode. */
function synthParse(query: string, terms: string[]): SearchResponse["parsed"] {
  const known = STATS.genres.map((g) => g.name);
  const genres = known.filter((g) =>
    query.toLowerCase().includes(g.toLowerCase())
  );
  const moodWords = ["cozy", "slow-burn", "dark", "cerebral", "emotional", "fever", "dreamy", "gritty"];
  const moods = moodWords.filter((m) => query.toLowerCase().includes(m.split("-")[0]));
  const likeMatch = query.match(/like\s+([A-Z][\w' ]+)/);

  return {
    intent: likeMatch ? "similar" : "recommend",
    clean_query: terms.join(" ") || query,
    genres,
    moods,
    era_from: null,
    era_to: null,
    similar_to: likeMatch ? likeMatch[1].trim() : null,
    keywords: terms.slice(0, 4),
    negations: [],
    min_rating: null,
    source: "rules",
  };
}

export function mockSuggest(q: string, limit = 8): Suggestion[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const r of ALL_RESULTS) {
    if (r.title.toLowerCase().includes(needle) && !seen.has(r.id)) {
      seen.add(r.id);
      out.push({ id: r.id, title: r.title, year: r.year, poster_url: r.poster_url });
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function mockStats(): StatsResponse {
  return STATS;
}

export function mockMovie(id: string): Movie | null {
  const found = ALL_RESULTS.find((r) => r.id === id);
  if (!found) return null;
  // Return only the Movie surface (drop scoring fields).
  const { score, scores, match_terms, reason, ...movie } = found;
  void score;
  void scores;
  void match_terms;
  void reason;
  return movie;
}

export function mockSimilar(id: string, limit = 12): SearchResponse {
  const anchor = ALL_RESULTS.find((r) => r.id === id);
  const pool = ALL_RESULTS.filter((r) => r.id !== id);

  // Rank by genre overlap with the anchor, then a stable shuffle by score.
  const anchorGenres = new Set(anchor?.genres ?? []);
  const ranked = [...pool].sort((a, b) => {
    const aOverlap = a.genres.filter((g) => anchorGenres.has(g)).length;
    const bOverlap = b.genres.filter((g) => anchorGenres.has(g)).length;
    return bOverlap - aOverlap || b.score - a.score;
  });

  const results = ranked.slice(0, limit);
  return {
    query: anchor ? `Similar to ${anchor.title}` : "Similar",
    parsed: {
      intent: "similar",
      clean_query: anchor?.title ?? "",
      genres: anchor?.genres ?? [],
      moods: [],
      era_from: null,
      era_to: null,
      similar_to: anchor?.title ?? null,
      keywords: anchor?.keywords.slice(0, 4) ?? [],
      negations: [],
      min_rating: null,
      source: "rules",
    },
    engine: BASE_SEARCH.engine,
    timing_ms: {
      parse: jitter(1.2, 0.5),
      lexical: jitter(6.1, 2),
      semantic: jitter(9.2, 2),
      fusion: jitter(0.5, 0.2),
      rerank: jitter(31.0, 6),
      reason: jitter(0.9, 0.4),
      total: jitter(49, 6),
    },
    count: results.length,
    results,
  };
}
