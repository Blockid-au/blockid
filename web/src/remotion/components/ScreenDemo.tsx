import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface ScreenDemoProps {
  /** Title shown in the browser address bar */
  url?: string;
  /** Lines of text describing what is shown on screen */
  descriptionLines: string[];
  /** Optional subtitle/status text */
  status?: string;
  /** Delay before appearing */
  delay?: number;
}

export const ScreenDemo: React.FC<ScreenDemoProps> = ({
  url = "blockid.au",
  descriptionLines,
  status,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  const scaleSpring = spring({
    frame: delayedFrame,
    fps,
    config: { damping: 14, stiffness: 60, mass: 0.8 },
  });

  const scale = interpolate(scaleSpring, [0, 1], [0.9, 1]);

  const opacity = interpolate(delayedFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

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
          width: 1440,
          height: 810,
          borderRadius: 16,
          overflow: "hidden",
          border: `2px solid ${BRAND.colors.ink800}`,
          boxShadow: `0 40px 100px rgba(0,0,0,0.6), 0 0 60px ${BRAND.colors.brand500}20`,
          transform: `scale(${scale})`,
        }}
      >
        {/* Browser chrome */}
        <div
          style={{
            height: 48,
            backgroundColor: BRAND.colors.ink900,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#FF5F57",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#FFBD2E",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#28C840",
              }}
            />
          </div>

          {/* Address bar */}
          <div
            style={{
              flex: 1,
              height: 30,
              backgroundColor: BRAND.colors.ink800,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              paddingLeft: 14,
              fontFamily: BRAND.fonts.mono,
              fontSize: 14,
              color: BRAND.colors.slate400,
            }}
          >
            <span style={{ color: BRAND.colors.emerald500, marginRight: 6 }}>
              {"🔒"}
            </span>
            {url}
          </div>
        </div>

        {/* Content area — placeholder for real screenshots */}
        <div
          style={{
            height: 762,
            backgroundColor: BRAND.colors.ink950,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 20,
            padding: "40px 60px",
          }}
        >
          {descriptionLines.map((line, index) => {
            const lineDelay = delay + 15 + index * 20;
            const lineFrame = Math.max(0, frame - lineDelay);
            const lineOpacity = interpolate(lineFrame, [0, 12], [0, 1], {
              extrapolateRight: "clamp",
            });

            return (
              <div
                key={index}
                style={{
                  fontFamily: BRAND.fonts.heading,
                  fontSize: 28,
                  color: BRAND.colors.slate300,
                  opacity: lineOpacity,
                  textAlign: "center",
                  padding: "12px 24px",
                  border: `1px dashed ${BRAND.colors.slate400}40`,
                  borderRadius: 8,
                  width: "100%",
                  maxWidth: 900,
                }}
              >
                {line}
              </div>
            );
          })}

          {/* Status bar */}
          {status && (
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 18,
                color: BRAND.colors.brand400,
                marginTop: 20,
                opacity: interpolate(
                  Math.max(0, frame - delay - 15 - descriptionLines.length * 20),
                  [0, 15],
                  [0, 1],
                  { extrapolateRight: "clamp" }
                ),
              }}
            >
              {status}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
