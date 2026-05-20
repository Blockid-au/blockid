import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface TextRevealProps {
  /** Array of lines to reveal one at a time */
  lines: string[];
  /** Mode: "line" reveals line by line, "character" reveals char by char */
  mode?: "line" | "character";
  /** Frames between each line reveal */
  staggerFrames?: number;
  /** Starting delay in frames */
  delay?: number;
  /** Font size */
  fontSize?: number;
  /** Text color */
  color?: string;
  /** Align text */
  align?: "left" | "center" | "right";
  /** Source citation to appear in small text */
  source?: string;
  /** Font weight */
  fontWeight?: number;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  lines,
  mode = "line",
  staggerFrames = 20,
  delay = 0,
  fontSize = 48,
  color = BRAND.colors.white,
  align = "center",
  source,
  fontWeight = 600,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: align === "center" ? "center" : "flex-start",
        padding: "0 120px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          textAlign: align,
          width: "100%",
        }}
      >
        {lines.map((line, index) => {
          const lineFrame = Math.max(
            0,
            frame - delay - index * staggerFrames
          );

          if (mode === "line") {
            const lineOpacity = interpolate(lineFrame, [0, 12], [0, 1], {
              extrapolateRight: "clamp",
            });

            const lineY = spring({
              frame: lineFrame,
              fps,
              config: { damping: 20, stiffness: 100, mass: 0.6 },
            });

            const translateY = interpolate(lineY, [0, 1], [30, 0]);

            return (
              <div
                key={index}
                style={{
                  fontFamily: BRAND.fonts.heading,
                  fontSize,
                  fontWeight,
                  color,
                  opacity: lineOpacity,
                  transform: `translateY(${translateY}px)`,
                  lineHeight: 1.3,
                }}
              >
                {line}
              </div>
            );
          }

          // Character mode
          const chars = line.split("");
          return (
            <div
              key={index}
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize,
                fontWeight,
                color,
                lineHeight: 1.3,
                display: "flex",
                justifyContent:
                  align === "center"
                    ? "center"
                    : align === "right"
                      ? "flex-end"
                      : "flex-start",
                flexWrap: "wrap",
              }}
            >
              {chars.map((char, charIndex) => {
                const charFrame = Math.max(
                  0,
                  frame -
                    delay -
                    index * staggerFrames -
                    charIndex * 1.5
                );

                const charOpacity = interpolate(
                  charFrame,
                  [0, 5],
                  [0, 1],
                  { extrapolateRight: "clamp" }
                );

                return (
                  <span
                    key={charIndex}
                    style={{
                      opacity: charOpacity,
                      display: "inline-block",
                      whiteSpace: "pre",
                    }}
                  >
                    {char}
                  </span>
                );
              })}
            </div>
          );
        })}

        {/* Source citation */}
        {source && (
          <div
            style={{
              fontFamily: BRAND.fonts.mono,
              fontSize: 16,
              color: BRAND.colors.slate400,
              marginTop: 24,
              opacity: interpolate(
                frame - delay - lines.length * staggerFrames,
                [0, 15],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              ),
            }}
          >
            {source}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
