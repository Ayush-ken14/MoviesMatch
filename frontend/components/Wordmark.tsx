"use client";

import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * "CINEMATCH" logotype. Fraunces high-contrast serif, a thin amber signal line
 * that draws itself, and a serif-italic tagline. `compact` shrinks it for the
 * sticky top bar after a search.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">
          Cine<span className="text-amber">Match</span>
        </span>
        <span className="hidden h-4 w-px bg-line-strong sm:block" />
        <span className="telemetry hidden text-[11px] uppercase tracking-[0.18em] text-ink-3 sm:block">
          hybrid search
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="font-display text-[clamp(44px,9vw,64px)] font-semibold leading-[1.02] tracking-[-0.02em] text-ink"
      >
        CINE<span className="text-amber">MATCH</span>
      </motion.h1>

      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
        className="mt-3 h-px w-40 origin-center bg-gradient-to-r from-transparent via-amber to-transparent"
        style={{ boxShadow: "0 0 14px 0 rgba(245,184,65,0.5)" }}
      />

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.28 }}
        className="mt-4 font-display text-md italic text-ink-2"
      >
        Hybrid movie discovery, tuned for Gotham nights
      </motion.p>
    </div>
  );
}
