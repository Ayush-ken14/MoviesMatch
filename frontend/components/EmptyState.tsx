"use client";

import { motion } from "framer-motion";
import type { StatsResponse } from "@/lib/types";
import { formatCount, safeYear } from "@/lib/format";
import { Wordmark } from "./Wordmark";
import { Poster } from "./Poster";
import { FilmIcon, LayersIcon, SparkIcon } from "./icons";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Landing experience: wordmark + tagline, the search console (rendered by the
 * page and passed as children), sample-query chips, a marquee of real
 * top-rated posters, and a mono corpus stat line.
 */
export function EmptyState({
  stats,
  onPickQuery,
  onPickMovie,
  children,
}: {
  stats: StatsResponse | null;
  onPickQuery: (q: string) => void;
  onPickMovie: (id: string) => void;
  children: React.ReactNode; // the SearchConsole
}) {
  const samples = stats?.sample_queries ?? [];
  const topRated = stats?.top_rated ?? [];
  const corpus = stats?.corpus_size ?? 9500;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-16 sm:pt-24">
      <Wordmark />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
        className="mt-10 w-full"
      >
        {children}
      </motion.div>

      {/* sample query chips */}
      {samples.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 w-full"
        >
          <div className="mb-3 flex items-center justify-center gap-2">
            <SparkIcon size={13} className="text-amber" />
            <span className="label-eyebrow">Start with one of these</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {samples.map((q, i) => (
              <motion.button
                key={q}
                type="button"
                onClick={() => onPickQuery(q)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 + i * 0.05, duration: 0.4, ease: EASE }}
                className="chip cursor-pointer transition-colors duration-200 hover:border-amber-dim hover:!text-amber-hi"
              >
                {q}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* top rated marquee */}
      {topRated.length > 0 && (
        <TopRatedStrip topRated={topRated} onPickMovie={onPickMovie} />
      )}

      {/* corpus stat line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="telemetry mb-16 mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-ink-3"
      >
        <FilmIcon size={13} className="text-ink-3" />
        <span className="text-ink-2">{formatCount(corpus)}</span> films
        <span className="text-ink-3">·</span>
        BM25+
        <LayersIcon size={12} className="mx-0.5 inline text-ink-3" />
        <span className="text-amber-hi">bge-small</span>
        <span className="text-ink-3">⋈</span>
        <span className="text-steel">cross-encoder</span>
      </motion.div>
    </div>
  );
}

function TopRatedStrip({
  topRated,
  onPickMovie,
}: {
  topRated: StatsResponse["top_rated"];
  onPickMovie: (id: string) => void;
}) {
  // Duplicate for a seamless marquee loop.
  const doubled = [...topRated, ...topRated];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, delay: 0.65 }}
      className="mt-12 w-screen max-w-[100vw]"
    >
      <div className="mb-3 text-center">
        <span className="label-eyebrow">Top rated in the corpus</span>
      </div>
      <div className="mask-fade-x group overflow-hidden">
        <div className="flex w-max gap-4 px-4 motion-safe:animate-marquee motion-safe:group-hover:[animation-play-state:paused]">
          {doubled.map((m, i) => (
            <button
              key={`${m.id}-${i}`}
              type="button"
              onClick={() => onPickMovie(m.id)}
              aria-label={`Open ${m.title}`}
              className="group/poster w-24 shrink-0 text-left sm:w-28"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-btn border border-line bg-void shadow-card transition-all duration-300 group-hover/poster:border-amber-dim group-hover/poster:shadow-card-hover">
                <Poster
                  url={m.poster_url}
                  title={m.title}
                  year={safeYear(m.year)}
                  sizes="112px"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover/poster:opacity-100" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
