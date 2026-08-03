"use client";

import { motion } from "framer-motion";
import type { SearchResult } from "@/lib/types";
import { MovieCard } from "./MovieCard";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

/**
 * Responsive results grid: 2 cols mobile, 3 tablet, 4 desktop, 5 xl.
 * Staggered entrance; re-keying on query drives the layout re-animation.
 */
export function ResultsGrid({
  results,
  onOpen,
  onSimilar,
}: {
  results: SearchResult[];
  onOpen: (result: SearchResult) => void;
  onSimilar: (id: string) => void;
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {results.map((result, i) => (
        <MovieCard
          key={result.id}
          result={result}
          rank={i + 1}
          index={i}
          onOpen={onOpen}
          onSimilar={onSimilar}
        />
      ))}
    </motion.div>
  );
}
