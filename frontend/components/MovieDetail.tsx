"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Movie, SearchResult } from "@/lib/types";
import { getSimilar } from "@/lib/api";
import {
  formatLanguage,
  formatRating,
  formatRuntime,
  safeYear,
} from "@/lib/format";
import { Poster } from "./Poster";
import { CloseIcon, StarFilledIcon, CornerReturnIcon } from "./icons";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Accessible movie detail modal (role=dialog, focus trap, Esc to close,
 * backdrop blur). Loads a "More like this" row from /movie/{id}/similar.
 */
export function MovieDetail({
  movie,
  onClose,
  onSelectSimilar,
}: {
  movie: Movie | null;
  onClose: () => void;
  onSelectSimilar: (result: SearchResult) => void;
}) {
  return (
    <AnimatePresence>
      {movie && (
        <DetailModal
          key={movie.id}
          movie={movie}
          onClose={onClose}
          onSelectSimilar={onSelectSimilar}
        />
      )}
    </AnimatePresence>
  );
}

function DetailModal({
  movie,
  onClose,
  onSelectSimilar,
}: {
  movie: Movie;
  onClose: () => void;
  onSelectSimilar: (result: SearchResult) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [similar, setSimilar] = useState<SearchResult[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(true);

  const yr = safeYear(movie.year);
  const rating = formatRating(movie.vote_average);
  const runtime = formatRuntime(movie.runtime);
  const language = formatLanguage(movie.language);

  // Lock scroll, focus the dialog, restore focus on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Fetch similar titles.
  useEffect(() => {
    let active = true;
    setLoadingSimilar(true);
    getSimilar(movie.id, 8)
      .then((res) => {
        if (active) setSimilar(res.results.filter((r) => r.id !== movie.id));
      })
      .finally(() => {
        if (active) setLoadingSimilar(false);
      });
    return () => {
      active = false;
    };
  }, [movie.id]);

  // Esc + focus trap.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 py-8 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onKeyDown={onKeyDown}
    >
      {/* backdrop */}
      <motion.button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/70 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="surface relative z-10 w-full max-w-3xl overflow-hidden rounded-card shadow-panel"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-btn border border-line-strong bg-black/50 text-ink-2 backdrop-blur-sm transition-colors hover:border-amber-dim hover:text-amber-hi"
        >
          <CloseIcon size={18} />
        </button>

        <div className="grid gap-5 p-5 sm:grid-cols-[200px_1fr] sm:gap-6 sm:p-6">
          {/* poster */}
          <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-full">
            <div className="relative aspect-[2/3] overflow-hidden rounded-btn border border-line bg-void shadow-card">
              <Poster
                url={movie.poster_url}
                title={movie.title}
                year={yr}
                sizes="200px"
                priority
              />
            </div>
          </div>

          {/* info */}
          <div className="min-w-0">
            <h2
              id="detail-title"
              className="font-display text-xl font-semibold leading-tight text-ink"
            >
              {movie.title}
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
              {yr != null && <span className="telemetry text-[12px]">{yr}</span>}
              {runtime && (
                <>
                  <Dot />
                  <span className="telemetry text-[12px]">{runtime}</span>
                </>
              )}
              {language && (
                <>
                  <Dot />
                  <span className="text-[12px]">{language}</span>
                </>
              )}
              {rating && (
                <>
                  <Dot />
                  <span className="inline-flex items-center gap-1">
                    <StarFilledIcon size={13} className="text-amber" />
                    <span className="telemetry text-[12px] text-amber-hi">
                      {rating}
                    </span>
                    <span className="telemetry text-[11px] text-ink-3">
                      ({movie.vote_count.toLocaleString()})
                    </span>
                  </span>
                </>
              )}
            </div>

            {movie.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {movie.genres.map((g) => (
                  <span key={g} className="chip">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {movie.tagline && (
              <p className="mt-4 font-display text-md italic text-ink-2">
                “{movie.tagline}”
              </p>
            )}

            {movie.overview && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
                {movie.overview}
              </p>
            )}

            {movie.director && (
              <p className="mt-4 text-[12px] text-ink-3">
                Directed by{" "}
                <span className="text-ink-2">{movie.director}</span>
              </p>
            )}

            {movie.cast.length > 0 && (
              <MetaChips label="Cast" items={movie.cast.slice(0, 6)} />
            )}

            {movie.keywords.length > 0 && (
              <MetaChips
                label="Themes"
                items={movie.keywords.slice(0, 8)}
                mono
              />
            )}
          </div>
        </div>

        {/* similar row */}
        <div className="border-t border-line px-5 pb-5 pt-4 sm:px-6">
          <div className="mb-3 flex items-center gap-2">
            <CornerReturnIcon size={14} className="text-amber" />
            <span className="label-eyebrow !text-ink-2">More like this</span>
          </div>
          {loadingSimilar ? (
            <SimilarSkeleton />
          ) : similar.length === 0 ? (
            <p className="text-[12px] text-ink-3">No related titles found.</p>
          ) : (
            <div className="no-scrollbar mask-fade-x -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {similar.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectSimilar(r)}
                  className="group w-24 shrink-0 text-left"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-btn border border-line bg-void transition-colors group-hover:border-amber-dim">
                    <Poster
                      url={r.poster_url}
                      title={r.title}
                      year={safeYear(r.year)}
                      sizes="96px"
                    />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-ink-2 group-hover:text-ink">
                    {r.title}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function MetaChips({
  label,
  items,
  mono = false,
}: {
  label: string;
  items: string[];
  mono?: boolean;
}) {
  return (
    <div className="mt-4">
      <span className="label-eyebrow">{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it}
            className={`chip ${mono ? "telemetry !text-[11px]" : ""}`}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function SimilarSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-24 shrink-0">
          <div className="aspect-[2/3] animate-pulse rounded-btn bg-white/[0.04]" />
          <div className="mt-1.5 h-2.5 w-4/5 animate-pulse rounded bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-ink-3" aria-hidden="true" />;
}
