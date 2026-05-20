import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const glowOpacity = interpolate(frame, [20, 50, 70, 90], [0, 0.6, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineY = interpolate(frame, [40, 60], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.colors.ink950,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Glow effect behind logo */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND.colors.brand500}40 0%, transparent 70%)`,
          opacity: glowOpacity,
          filter: "blur(40px)",
        }}
      />

      {/* Logo */}
      <div
        style={{
          opacity,
          transform: `scale(${scaleSpring})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <Img
          src={staticFile("images/logo-icon-transparent.png")}
          style={{
            width: 200,
            height: 200,
            objectFit: "contain",
          }}
        />

        <div
          style={{
            fontFamily: BRAND.fonts.heading,
            fontSize: 72,
            fontWeight: 700,
            color: BRAND.colors.white,
            letterSpacing: "-0.02em",
          }}
        >
          Block
          <span style={{ color: BRAND.colors.brand500 }}>ID</span>
          <span style={{ color: BRAND.colors.slate400, fontSize: 48 }}>
            .au
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            fontFamily: BRAND.fonts.heading,
            fontSize: 28,
            fontWeight: 400,
            color: BRAND.colors.slate300,
            letterSpacing: "0.05em",
          }}
        >
          Where AI meets startup valuation
        </div>
      </div>
    </AbsoluteFill>
  );
};
