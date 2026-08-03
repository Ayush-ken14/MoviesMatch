"use client";

import { motion } from "framer-motion";
import { RefreshIcon } from "../icons";

/**
 * Designed error state with a Retry button that re-runs the last query.
 */
export function ErrorState({
  query,
  onRetry,
}: {
  query: string;
  onRetry: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="surface mx-auto max-w-md rounded-card p-8 text-center shadow-card"
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-danger/40 bg-danger/[0.08]">
        <span className="telemetry text-lg text-danger">!</span>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">
        The signal dropped
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-ink-2">
        We couldn&apos;t reach the discovery engine
        {query ? (
          <>
            {" "}
            for <span className="text-ink">“{query}”</span>
          </>
        ) : null}
        . Check the connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-btn bg-amber px-4 py-2 text-[13px] font-medium text-void transition-transform duration-200 hover:bg-amber-hi active:scale-95"
      >
        <RefreshIcon size={15} />
        Retry search
      </button>
    </motion.div>
  );
}
