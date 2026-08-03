/**
 * Formatting helpers for telemetry, ratings, runtimes and poster fallbacks.
 * Kept pure + framework-agnostic so they can be unit-reasoned in isolation.
 */

/** 148 -> "2h 28m", 99 -> "1h 39m", 45 -> "45m" */
export function formatRuntime(runtime: number | null | undefined): string | null {
  if (runtime == null || !Number.isFinite(runtime) || runtime <= 0) return null;
  const hours = Math.floor(runtime / 60);
  const minutes = Math.round(runtime % 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** 0.898 -> "90", 0.05 -> "5". Clamps to 0..100. */
export function toPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

/** Format a latency figure in ms, mono-friendly. 59.2 -> "59.2" */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return ms >= 100 ? Math.round(ms).toString() : ms.toFixed(1);
}

/** Guard a year value; returns null when unusable. */
export function safeYear(year: number | null | undefined): number | null {
  if (year == null || !Number.isFinite(year) || year < 1870 || year > 2100) return null;
  return Math.trunc(year);
}

/** 8.4 -> "8.4", null -> null */
export function formatRating(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  return rating.toFixed(1);
}

/** Map an ISO-ish language code to a display label. */
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  hi: "Hindi",
  zh: "Chinese",
  ru: "Russian",
  pt: "Portuguese",
};

export function formatLanguage(code: string | null | undefined): string | null {
  if (!code) return null;
  return LANGUAGE_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

/**
 * Deterministic charcoal gradient seed for the poster fallback so the
 * placeholder feels designed rather than random on every render.
 */
export function posterFallbackSeed(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 360);
}

/** Big-number formatting for corpus size: 9500 -> "9,500". */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Trim a model id to its short leaf, e.g. "BAAI/bge-small-en-v1.5" -> "bge-small". */
export function shortModel(model: string | null | undefined): string {
  if (!model) return "—";
  const leaf = model.split("/").pop() ?? model;
  // bge-small-en-v1.5 -> bge-small; ms-marco-MiniLM-L-6-v2 -> cross-encoder MiniLM
  if (leaf.startsWith("bge-small")) return "bge-small";
  if (leaf.toLowerCase().includes("minilm")) return "MiniLM-L6";
  return leaf;
}
