import {
  mockMovie,
  mockSearch,
  mockSimilar,
  mockStats,
  mockSuggest,
} from "./mock";
import type {
  HealthResponse,
  Movie,
  SearchRequest,
  SearchResponse,
  StatsResponse,
  Suggestion,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const FORCE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

/** Recompute a total that reflects the (possibly jittered) stage timings. */
function withDerivedTotal(res: SearchResponse): SearchResponse {
  const t = res.timing_ms;
  const sum = t.parse + t.lexical + t.semantic + t.fusion + t.rerank + t.reason;
  return { ...res, timing_ms: { ...t, total: Math.round(sum * 10) / 10 } };
}

/** Wrap fetch with a timeout so a hung backend falls back quickly to mock. */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Request to ${path} failed with ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function search(request: SearchRequest): Promise<SearchResponse> {
  const body: SearchRequest = { limit: 24, explain: true, ...request };
  if (FORCE_MOCK) return withDerivedTotal(mockSearch(body));
  try {
    return await fetchJson<SearchResponse>("/api/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    return withDerivedTotal(mockSearch(body));
  }
}

export async function suggest(q: string, limit = 8): Promise<Suggestion[]> {
  if (!q.trim()) return [];
  if (FORCE_MOCK) return mockSuggest(q, limit);
  try {
    return await fetchJson<Suggestion[]>(
      `/api/suggest?q=${encodeURIComponent(q)}&limit=${limit}`
    );
  } catch {
    return mockSuggest(q, limit);
  }
}

export async function getStats(): Promise<StatsResponse> {
  if (FORCE_MOCK) return mockStats();
  try {
    return await fetchJson<StatsResponse>("/api/stats");
  } catch {
    return mockStats();
  }
}

export async function getMovie(id: string): Promise<Movie | null> {
  if (FORCE_MOCK) return mockMovie(id);
  try {
    return await fetchJson<Movie>(`/api/movie/${encodeURIComponent(id)}`);
  } catch {
    return mockMovie(id);
  }
}

export async function getSimilar(id: string, limit = 12): Promise<SearchResponse> {
  if (FORCE_MOCK) return withDerivedTotal(mockSimilar(id, limit));
  try {
    return await fetchJson<SearchResponse>(
      `/api/movie/${encodeURIComponent(id)}/similar?limit=${limit}`
    );
  } catch {
    return withDerivedTotal(mockSimilar(id, limit));
  }
}

export async function getHealth(): Promise<HealthResponse | null> {
  if (FORCE_MOCK) return null;
  try {
    return await fetchJson<HealthResponse>("/api/health");
  } catch {
    return null;
  }
}
