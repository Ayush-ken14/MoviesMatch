"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ScoreBreakdown } from "@/lib/types";
import { toPercent } from "@/lib/format";

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

const TOOLTIP =
  "Hybrid score — BM25+ lexical fused with dense semantic, cross-encoder reranked.";

/**
 * Circular score ring (final score, amber, count-up) plus two thin labeled
 * bars: Lexical (amber) and Semantic (steel). Fills animate on mount and are
 * gated behind prefers-reduced-motion.
 */
export function ScoreMeter({
  score,
  scores,
  delay = 0,
}: {
  score: number;
  scores: ScoreBreakdown;
  delay?: number;
}) {
  const pct = toPercent(score);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const dashOffset = useTransform(count, (v) => RING_C - (v / 100) * RING_C);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      count.set(pct);
      setDisplay(pct);
      return;
    }
    const controls = animate(count, pct, {
      duration: 1.1,
      delay,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [pct, delay, count, rounded]);

  return (
    <div className="flex items-center gap-3">
      <ScoreRing pct={pct} dashOffset={dashOffset} display={display} />

      <div className="flex-1 space-y-2">
        <ScoreBar
          label="Lexical"
          value={scores.lexical}
          rank={scores.lexical_rank}
          color="var(--amber)"
          delay={delay}
        />
        <ScoreBar
          label="Semantic"
          value={scores.semantic}
          rank={scores.semantic_rank}
          color="var(--steel)"
          delay={delay + 0.08}
        />
      </div>
    </div>
  );
}

function ScoreRing({
  pct,
  dashOffset,
  display,
}: {
  pct: number;
  dashOffset: ReturnType<typeof useMotionValue<number>> | ReturnType<typeof useTransform<number, number>>;
  display: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <svg
        width={52}
        height={52}
        viewBox="0 0 52 52"
        role="img"
        aria-label={`Hybrid match score ${pct} percent`}
        tabIndex={0}
        className="-rotate-90 rounded-full focus-visible:outline-amber"
      >
        <circle
          cx="26"
          cy="26"
          r={RING_R}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="3"
        />
        <motion.circle
          cx="26"
          cy="26"
          r={RING_R}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          style={{
            strokeDashoffset: dashOffset,
            filter: "drop-shadow(0 0 4px rgba(245,184,65,0.5))",
          }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="telemetry text-[15px] font-semibold text-amber-hi">
          {display}
        </span>
      </div>
      {open && (
        <div
          role="tooltip"
          className="surface absolute bottom-full left-1/2 z-30 mb-2 w-52 -translate-x-1/2 rounded-btn p-3 text-[11px] leading-relaxed text-ink-2 shadow-panel"
        >
          {TOOLTIP}
        </div>
      )}
    </div>
  );
}

function ScoreBar({
  label,
  value,
  rank,
  color,
  delay,
}: {
  label: string;
  value: number;
  rank: number | null;
  color: string;
  delay: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const width = `${toPercent(value)}%`;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
          {label}
        </span>
        <span className="telemetry text-[11px]" style={{ color }}>
          {value.toFixed(3)}
          {rank != null && (
            <span className="ml-1 text-ink-3">#{rank}</span>
          )}
        </span>
      </div>
      <div
        ref={barRef}
        className="h-[3px] w-full overflow-hidden rounded-chip bg-line-strong"
      >
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-chip"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}
