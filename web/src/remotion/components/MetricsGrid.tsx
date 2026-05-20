import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface Metric {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  /** Color accent: defaults to "brand" */
  color?: "brand" | "emerald" | "gold" | "red" | "white";
}

interface MetricsGridProps {
  /** Array of metrics to display */
  metrics: Metric[];
  /** Delay before animation starts (in frames) */
  delay?: number;
  /** Optional title above the grid */
  title?: string;
  /** Number of columns (default: auto based on count) */
  columns?: number;
}

const COLOR_MAP: Record<string, string> = {
  brand: BRAND.colors.brand500,
  emerald: BRAND.colors.emerald500,
  gold: BRAND.colors.gold400,
  red: BRAND.colors.red400,
  white: BRAND.colors.white,
};

export const MetricsGrid: React.FC<MetricsGridProps> = ({
  metrics,
  delay = 0,
  title,
  columns,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  const titleOpacity = interpolate(delayedFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const cols = columns ?? Math.min(metrics.length, 4);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 100px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          width: "100%",
          maxWidth: 1400,
        }}
      >
        {/* Title */}
        {title && (
          <div
            style={{
              fontFamily: BRAND.fonts.heading,
              fontSize: 44,
              fontWeight: 700,
              color: BRAND.colors.white,
              opacity: titleOpacity,
              textAlign: "center",
            }}
          >
            {title}
          </div>
        )}

        {/* Metrics grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 24,
            width: "100%",
          }}
        >
          {metrics.map((metric, index) => {
            const metricDelay = delay + 15 + index * 12;
            const metricFrame = Math.max(0, frame - metricDelay);

            const metricSpring = spring({
              frame: metricFrame,
              fps,
              config: { damping: 14, stiffness: 60, mass: 0.6 },
            });

            // Count-up animation
            const countProgress = spring({
              frame: metricFrame,
              fps,
              config: { damping: 30, stiffness: 40, mass: 1 },
              durationInFrames: 45,
            });

            const currentValue = Math.round(
              interpolate(countProgress, [0, 1], [0, metric.value])
            );

            const formattedValue = currentValue.toLocaleString("en-AU");
            const accentColor =
              COLOR_MAP[metric.color ?? "brand"] ?? BRAND.colors.brand500;

            const translateY = interpolate(
              metricSpring,
              [0, 1],
              [24, 0]
            );

            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  padding: "32px 24px",
                  borderRadius: 16,
                  backgroundColor: `${BRAND.colors.ink800}80`,
                  border: `1px solid ${accentColor}30`,
                  opacity: metricSpring,
                  transform: `translateY(${translateY}px)`,
                  textAlign: "center",
                }}
              >
                {/* Value */}
                <div
                  style={{
                    fontFamily: BRAND.fonts.mono,
                    fontSize: 48,
                    fontWeight: 700,
                    color: accentColor,
                    lineHeight: 1,
                  }}
                >
                  {metric.prefix ?? ""}
                  {formattedValue}
                  {metric.suffix ?? ""}
                </div>

                {/* Label */}
                <div
                  style={{
                    fontFamily: BRAND.fonts.heading,
                    fontSize: 18,
                    fontWeight: 500,
                    color: BRAND.colors.slate300,
                    lineHeight: 1.3,
                    maxWidth: 260,
                  }}
                >
                  {metric.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
