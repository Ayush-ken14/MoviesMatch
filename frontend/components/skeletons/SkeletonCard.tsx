/**
 * Loading placeholder mirroring MovieCard's shape, with an amber-tinted
 * shimmer sweep across the poster.
 */
export function SkeletonCard() {
  return (
    <div className="surface flex flex-col overflow-hidden rounded-card shadow-card">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-panel-2">
        <Shimmer />
        <div className="absolute left-3 top-3 h-5 w-9 rounded-chip bg-white/[0.04]" />
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex gap-1.5">
          <div className="h-5 w-14 rounded-chip bg-white/[0.04]" />
          <div className="h-5 w-16 rounded-chip bg-white/[0.04]" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-[52px] w-[52px] rounded-full bg-white/[0.04]" />
          <div className="flex-1 space-y-2">
            <div className="h-[3px] w-full rounded-chip bg-white/[0.06]" />
            <div className="h-[3px] w-4/5 rounded-chip bg-white/[0.06]" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded bg-white/[0.04]" />
          <div className="h-2.5 w-2/3 rounded bg-white/[0.04]" />
        </div>
        <div className="h-8 w-full rounded-btn bg-white/[0.03]" />
      </div>
    </div>
  );
}

function Shimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-y-0 w-1/2 animate-shimmer"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(245,184,65,0.06), rgba(255,255,255,0.03), transparent)",
        }}
      />
    </div>
  );
}
