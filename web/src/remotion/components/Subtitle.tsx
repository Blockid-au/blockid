import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface SubtitleProps {
  /** Subtitle text to display */
  text: string;
  /** Delay in frames before showing (default 0) */
  delay?: number;
  /** Duration in frames to display (defaults to parent Sequence duration) */
  durationInFrames?: number;
}

/**
 * Subtitle — renders a semi-transparent bar at the bottom of the video frame
 * with centered white text that fades in and out.
 */
export const Subtitle: React.FC<SubtitleProps> = ({
  text,
  delay = 0,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  const delayedFrame = Math.max(0, frame - delay);

  // Fade in over 10 frames, fade out over 10 frames at the end
  const fadeInEnd = 10;
  const totalDuration = durationInFrames ?? 9999;
  const fadeOutStart = totalDuration - delay - 10;

  const opacity = interpolate(
    delayedFrame,
    [0, fadeInEnd, Math.max(fadeInEnd + 1, fadeOutStart), Math.max(fadeInEnd + 2, fadeOutStart + 10)],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  if (delayedFrame <= 0) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          padding: "16px 32px",
          marginBottom: 40,
          borderRadius: 8,
          maxWidth: "80%",
          opacity,
          transform: `translateY(${interpolate(opacity, [0, 1], [8, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily:
              "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
            fontSize: 28,
            fontWeight: 500,
            color: "#FFFFFF",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
