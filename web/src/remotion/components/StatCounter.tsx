import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface StatCounterProps {
  target: number;
  prefix?: string;
  suffix?: string;
  label: string;
  source?: string;
  color?: "red" | "brand" | "gold" | "emerald" | "white";
  /** Delay before counter starts (in frames) */
  delay?: number;
  /** Duration of count-up animation in frames */
  duration?: number;
  /** Format with commas */
  formatNumber?: boolean;
}

export const StatCounter: React.FC<StatCounterProps> = ({
  target,
  prefix = "",
  suffix = "",
  label,
  source,
  color = "white",
  delay = 0,
  duration = 45,
  formatNumber = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  const progress = spring({
    frame: delayedFrame,
    fps,
    config: { damping: 30, stiffness: 40, mass: 1 },
    durationInFrames: duration,
  });

  const currentValue = Math.round(interpolate(progress, [0, 1], [0, target]));

  const formattedValue = formatNumber
    ? currentValue.toLocaleString("en-AU")
    : currentValue.toString();

  const opacity = interpolate(delayedFrame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  const colorMap: Record<string, string> = {
    red: BRAND.colors.red400,
    brand: BRAND.colors.brand500,
    gold: BRAND.colors.gold400,
    emerald: BRAND.colors.emerald500,
    white: BRAND.colors.white,
  };

  const accentColor = colorMap[color] || BRAND.colors.white;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* Number */}
        <div
          style={{
            fontFamily: BRAND.fonts.mono,
            fontSize: 120,
            fontWeight: 700,
            color: accentColor,
            lineHeight: 1,
          }}
        >
          {prefix}
          {formattedValue}
          {suffix}
        </div>

        {/* Label */}
        <div
          style={{
            fontFamily: BRAND.fonts.heading,
            fontSize: 36,
            fontWeight: 400,
            color: BRAND.colors.slate300,
            textAlign: "center",
            maxWidth: 800,
          }}
        >
          {label}
        </div>

        {/* Source citation */}
        {source && (
          <div
            style={{
              fontFamily: BRAND.fonts.mono,
              fontSize: 16,
              color: BRAND.colors.slate400,
              marginTop: 8,
            }}
          >
            Source: {source}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
