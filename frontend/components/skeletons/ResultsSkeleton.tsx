import { SkeletonCard } from "./SkeletonCard";

/** Grid of skeleton cards shown while a search is in flight. */
export function ResultsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-4 w-40 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-4 w-24 animate-pulse rounded bg-white/[0.04]" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
