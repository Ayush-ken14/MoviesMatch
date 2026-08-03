"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { SearchResult } from "@/lib/types";
import { safeYear } from "@/lib/format";
import { Poster } from "./Poster";
import { ScoreMeter } from "./ScoreMeter";
import { CornerReturnIcon } from "./icons";

const EASE = [0.16, 1, 0.3, 1] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * Result card: poster (with light-sweep + zoom on hover), rank badge, title,
 * genre chips, ScoreMeter, match terms, grounded reason, and a working
 * "More like this" affordance. The whole card opens the detail modal.
 */
export function MovieCard({
  result,
  rank,
  index,
  onOpen,
  onSimilar,
}: {
  result: SearchResult;
  rank: number;
  index: number;
  onOpen: (result: SearchResult) => void;
  onSimilar: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const yr = safeYear(result.year);
  const genres = result.genres.slice(0, 3);
  const matchTerms = (result.match_terms ?? []).slice(0, 3);

  return (
    <motion.article
      variants={cardVariants}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="group surface relative flex flex-col overflow-hidden rounded-card shadow-card transition-[border-color,box-shadow] duration-300 hover:border-amber-dim hover:shadow-card-hover"
    >
      {/* Poster region — click opens detail */}
      <button
        type="button"
        onClick={() => onOpen(result)}
        aria-label={`Open details for ${result.title}`}
        className="relative block aspect-[2/3] w-full overflow-hidden bg-void text-left"
      >
        <motion.div
          className="absolute inset-0"
          animate={{ scale: hovered ? 1.04 : 1 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <Poster
            url={result.poster_url}
            title={result.title}
            year={yr}
            priority={index < 4}
          />
        </motion.div>

        {/* bottom scrim for legibility */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {/* diagonal amber light-sweep on hover */}
        <div
          className="pointer-events-none absolute inset-0 -translate-x-full opacity-0 transition-all duration-700 ease-cine group-hover:translate-x-full group-hover:opacity-100"
          style={{
            background:
              "linear-gradient(115deg, transparent 35%, rgba(245,184,65,0.18) 50%, transparent 65%)",
          }}
        />

        {/* rank badge */}
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-chip border border-line-strong bg-black/60 px-2 py-1 backdrop-blur-sm">
          <span className="telemetry text-[10px] font-semibold text-amber-hi">
            #{rank}
          </span>
        </div>

        {/* title over scrim */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3 className="font-display text-md font-semibold leading-tight text-ink drop-shadow-sm line-clamp-2">
            {result.title}
          </h3>
          {yr != null && (
            <span className="telemetry text-[11px] text-ink-2">{yr}</span>
          )}
        </div>
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-3">
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <span key={g} className="chip !py-[3px] !text-[11px]">
                {g}
              </span>
            ))}
          </div>
        )}

        <ScoreMeter
          score={result.score}
          scores={result.scores}
          delay={Math.min(index, 8) * 0.03}
        />

        {matchTerms.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
              matched
            </span>
            {matchTerms.map((t) => (
              <span
                key={t}
                className="telemetry rounded border border-amber-dim/50 bg-amber/5 px-1.5 py-0.5 text-[10px] text-amber-hi"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {result.reason && (
          <p className="clamp-2 text-[12.5px] leading-relaxed text-ink-2">
            {result.reason}
          </p>
        )}

        <button
          type="button"
          onClick={() => onSimilar(result.id)}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-btn border border-line-strong bg-white/[0.02] py-2 text-[12px] font-medium text-ink-2 transition-colors duration-200 hover:border-amber-dim hover:bg-amber/[0.06] hover:text-amber-hi"
        >
          <CornerReturnIcon size={14} />
          More like this
        </button>
      </div>
    </motion.article>
  );
}
