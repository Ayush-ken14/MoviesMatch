"use client";

import Image from "next/image";
import { useState } from "react";
import { posterFallbackSeed, safeYear } from "@/lib/format";

/**
 * TMDB poster with a designed fallback. On error (or when no URL is present)
 * it renders a charcoal card showing the title + year — never a broken image.
 */
export function Poster({
  url,
  title,
  year,
  sizes,
  priority = false,
}: {
  url: string | null;
  title: string;
  year: number | null;
  sizes?: string;
  priority?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const showFallback = !url || errored;

  if (showFallback) {
    return <PosterFallback title={title} year={year} />;
  }

  return (
    <Image
      src={url}
      alt={`${title} poster`}
      fill
      sizes={sizes ?? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"}
      priority={priority}
      className="object-cover"
      onError={() => setErrored(true)}
    />
  );
}

export function PosterFallback({
  title,
  year,
}: {
  title: string;
  year: number | null;
}) {
  const hue = posterFallbackSeed(title);
  const yr = safeYear(year);
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden p-4 text-center"
      style={{
        background: `linear-gradient(155deg, hsl(${hue}, 8%, 11%) 0%, #0b0d10 70%)`,
      }}
      aria-label={`${title} poster unavailable`}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(245,184,65,0.35), transparent)" }}
      />
      <span className="label-eyebrow mb-2">CineMatch</span>
      <span className="font-display text-md font-semibold leading-tight text-ink-2 line-clamp-4">
        {title}
      </span>
      {yr != null && (
        <span className="telemetry mt-2 text-[11px] text-ink-3">{yr}</span>
      )}
    </div>
  );
}
