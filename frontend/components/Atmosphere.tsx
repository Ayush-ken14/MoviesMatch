/**
 * Fixed, non-interactive atmosphere overlays: film grain (SVG turbulence),
 * edge vignette, and a slowly drifting bat-signal glow. All motion is gated
 * behind prefers-reduced-motion via CSS.
 */
export function Atmosphere() {
  return (
    <>
      <div className="atmos batsignal-layer" aria-hidden="true">
        <div className="batsignal" />
      </div>
      <div className="atmos atmos-vignette" aria-hidden="true" />
      <svg className="atmos atmos-grain" aria-hidden="true">
        <filter id="cine-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves={2}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cine-grain)" />
      </svg>
    </>
  );
}
