"use client";

/**
 * HowItWorksVideo — 16:9 muted-autoplay preview frame for the See How
 * It Works section. Renders a native <video> with a branded SVG poster
 * and cleanly degrades to an <img> if /media/how-it-works.mp4 is not on
 * disk (dev, first-time deploy, or a Remotion pipeline failure).
 *
 * Interactive-only concerns (autoplay opt-out under prefers-reduced-motion,
 * onError fallback swap) force a client boundary — the surrounding gold
 * ring, gradient and tagline all render statically from the parent RSC.
 */
import { useEffect, useRef, useState } from "react";

const VIDEO_SRC = "/media/how-it-works.mp4";
const POSTER_SRC = "/media/how-it-works-poster.svg";

export interface HowItWorksVideoProps {
  /** Localised aria-label sourced from HOW_IT_WORKS_COPY.headline. */
  readonly ariaLabel: string;
  /** Localised caption rendered under the frame. */
  readonly tagline: string;
}

export function HowItWorksVideo({ ariaLabel, tagline }: HowItWorksVideoProps) {
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // If reduced-motion turned on after mount, pause any in-flight autoplay.
  useEffect(() => {
    if (reduced && videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        /* pause is best-effort; ignore */
      }
    }
  }, [reduced]);

  return (
    <figure className="mx-auto w-full max-w-4xl">
      <div
        className={[
          "group relative overflow-hidden rounded-2xl",
          "ring-1 ring-[var(--color-brand-gold)]/40",
          "shadow-[0_18px_60px_-24px_rgba(15,27,71,0.55)]",
          "bg-[linear-gradient(135deg,var(--color-brand-navy-deep),var(--color-brand-navy-elev-2))]",
        ].join(" ")}
        tabIndex={0}
        onMouseEnter={() => setChromeVisible(true)}
        onMouseLeave={() => setChromeVisible(false)}
        onFocus={() => setChromeVisible(true)}
        onBlur={(event) => {
          // Only collapse chrome when focus leaves the entire frame.
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setChromeVisible(false);
          }
        }}
      >
        <div className="relative aspect-[16/9] w-full">
          {failed ? (
            <img
              src={POSTER_SRC}
              alt={ariaLabel}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              src={VIDEO_SRC}
              poster={POSTER_SRC}
              muted
              loop
              playsInline
              preload="metadata"
              autoPlay={!reduced}
              controls={reduced || chromeVisible}
              aria-label={ariaLabel}
              onError={() => setFailed(true)}
            />

          )}

          {/* Hover / focus-within reveals native controls on the underlying
              <video>. We render a subtle gradient chrome that fades out on
              interaction so the controls read cleanly. */}
          <div
            aria-hidden="true"
            className={[
              "pointer-events-none absolute inset-x-0 bottom-0 h-16",
              "bg-gradient-to-t from-[rgba(11,15,42,0.55)] to-transparent",
              "opacity-100 transition-opacity duration-300",
              "group-hover:opacity-0 group-focus-within:opacity-0",
            ].join(" ")}
          />
        </div>
      </div>

      {tagline ? (
        <figcaption className="mt-4 text-center text-sm text-[var(--fintech-ink-muted)]">
          {tagline}
        </figcaption>
      ) : null}

    </figure>
  );
}

export default HowItWorksVideo;
