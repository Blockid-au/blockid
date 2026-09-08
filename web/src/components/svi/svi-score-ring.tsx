// SviScoreRing — reusable radial gauge for the Startup Value Index score.
//
// Fills the "SVI index has no visual" gap flagged in the UI audit.
// Renders an SVG ring where the stroke arc length is proportional to
// `score / 100`. Gradient tint follows the growth semantic:
//   score >= 70 → svi-500 → bull (positive)
//   score 40-69 → svi-500 → warn
//   score <  40 → svi-500 → bear
// The gauge is intentionally static — the arc length is computed at render
// time, no requestAnimationFrame. That respects `prefers-reduced-motion` by
// construction (nothing animates).

import * as React from "react";

const SVI_500 = "#FF9F0A"; // brand-accent per docs/design-system.md
const BULL = "#16C784";
const WARN = "#F5B23F";
const BEAR = "#F16169";
const TRACK = "rgba(148, 163, 184, 0.16)"; // matches --fintech-border

function pickEndStop(score: number): string {
  if (score >= 70) return BULL;
  if (score >= 40) return WARN;
  return BEAR;
}

function clampScore(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

export interface SviScoreRingProps {
  /** SVI score expected in [0, 100]. Values outside are clamped. */
  score: number;
  /** Diameter of the ring in px. Defaults to 180. */
  size?: number;
  /** Small label rendered under the numeric score. */
  label?: string;
  /** Ring stroke width in px. Defaults to 12. */
  strokeWidth?: number;
  /** Optional className hook for layout wrappers. */
  className?: string;
}

export function SviScoreRing({
  score,
  size = 180,
  label = "SVI",
  strokeWidth = 12,
  className,
}: SviScoreRingProps) {
  const clamped = clampScore(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const cx = size / 2;
  const cy = size / 2;
  const gradientId = React.useId();
  const endStop = pickEndStop(clamped);

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`SVI score ${Math.round(clamped)} out of 100`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={SVI_500} />
              <stop offset="100%" stopColor={endStop} />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={TRACK}
            strokeWidth={strokeWidth}
          />
          {/* Arc — rotated -90° so it starts at 12 o'clock */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        {/* Center number + label — absolutely positioned so the SVG stays a
            perfect square regardless of font metrics. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="font-display"
            style={{
              fontSize: Math.round(size * 0.32),
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--fintech-ink, #F1F5F9)",
              letterSpacing: "-0.02em",
            }}
          >
            {Math.round(clamped)}
          </span>
          {label ? (
            <span
              style={{
                marginTop: 4,
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fintech-ink-muted, #94A3B8)",
              }}
            >
              {label}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SviScoreRing;
