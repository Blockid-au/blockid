import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BRAND } from "../styles/brand";

interface DropMicLine {
  text: string;
  /** Color override for this line */
  color?: string;
  /** Font size override */
  fontSize?: number;
  /** Font weight override */
  fontWeight?: number;
}

interface DropMicProps {
  lines: DropMicLine[];
  /** Frames between each line appearance */
  beatFrames?: number;
  /** Starting delay in frames */
  delay?: number;
}

export const DropMic: React.FC<DropMicProps> = ({
  lines,
  beatFrames = 30,
  delay = 0,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.colors.ink950,
        justifyContent: "center",
        alignItems: "center",
        padding: "0 120px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {lines.map((line, index) => {
          const lineStartFrame = delay + index * beatFrames;
          const lineFrame = frame - lineStartFrame;

          const opacity = interpolate(lineFrame, [0, 15], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const translateY = interpolate(lineFrame, [0, 15], [20, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const scale = interpolate(lineFrame, [0, 10, 15], [0.95, 1.02, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={index}
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: line.fontSize || 52,
                fontWeight: line.fontWeight || 700,
                color: line.color || BRAND.colors.white,
                opacity,
                transform: `translateY(${translateY}px) scale(${scale})`,
                textAlign: "center",
                lineHeight: 1.2,
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
