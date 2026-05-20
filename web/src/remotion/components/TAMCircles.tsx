import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface MarketTier {
  label: string;
  value: string;
  description: string;
}

interface TAMCirclesProps {
  tam?: MarketTier;
  sam?: MarketTier;
  som?: MarketTier;
  delay?: number;
  title?: string;
}

export const TAMCircles: React.FC<TAMCirclesProps> = ({
  tam = {
    label: "TAM",
    value: "A$4.4T",
    description: "Global startup ecosystem",
  },
  sam = {
    label: "SAM",
    value: "A$3.2B",
    description: "Cap table + valuation tools",
  },
  som = {
    label: "SOM",
    value: "A$250K",
    description: "Year 1: 500 AU startups",
  },
  delay = 0,
  title = "Market Opportunity",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  // Staggered circle expansions
  const tamSpring = spring({
    frame: delayedFrame,
    fps,
    config: { damping: 16, stiffness: 40, mass: 1 },
  });

  const samSpring = spring({
    frame: Math.max(0, delayedFrame - 20),
    fps,
    config: { damping: 16, stiffness: 40, mass: 1 },
  });

  const somSpring = spring({
    frame: Math.max(0, delayedFrame - 40),
    fps,
    config: { damping: 16, stiffness: 40, mass: 1 },
  });

  const titleOpacity = interpolate(delayedFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Label appearances (to the right)
  const tamLabelOpacity = interpolate(delayedFrame, [10, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const samLabelOpacity = interpolate(delayedFrame, [30, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const somLabelOpacity = interpolate(delayedFrame, [50, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 100,
          fontFamily: BRAND.fonts.heading,
          fontSize: 48,
          fontWeight: 700,
          color: BRAND.colors.white,
          opacity: titleOpacity,
          textAlign: "center",
          width: "100%",
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 80,
        }}
      >
        {/* Circles container */}
        <div
          style={{
            position: "relative",
            width: 600,
            height: 600,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* TAM — outermost */}
          <div
            style={{
              position: "absolute",
              width: 580,
              height: 580,
              borderRadius: "50%",
              border: `3px solid ${BRAND.colors.brand500}40`,
              backgroundColor: `${BRAND.colors.brand500}08`,
              transform: `scale(${tamSpring})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              paddingTop: 30,
            }}
          >
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 14,
                color: BRAND.colors.brand400,
                opacity: tamLabelOpacity,
              }}
            >
              TAM
            </div>
          </div>

          {/* SAM — middle */}
          <div
            style={{
              position: "absolute",
              width: 380,
              height: 380,
              borderRadius: "50%",
              border: `3px solid ${BRAND.colors.gold400}50`,
              backgroundColor: `${BRAND.colors.gold400}08`,
              transform: `scale(${samSpring})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              paddingTop: 25,
            }}
          >
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 14,
                color: BRAND.colors.gold400,
                opacity: samLabelOpacity,
              }}
            >
              SAM
            </div>
          </div>

          {/* SOM — innermost */}
          <div
            style={{
              position: "absolute",
              width: 180,
              height: 180,
              borderRadius: "50%",
              border: `3px solid ${BRAND.colors.emerald500}60`,
              backgroundColor: `${BRAND.colors.emerald500}15`,
              transform: `scale(${somSpring})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 14,
                color: BRAND.colors.emerald500,
                opacity: somLabelOpacity,
              }}
            >
              SOM
            </div>
          </div>
        </div>

        {/* Labels on the right */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          {/* TAM label */}
          <div style={{ opacity: tamLabelOpacity }}>
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 16,
                fontWeight: 600,
                color: BRAND.colors.brand400,
                marginBottom: 4,
              }}
            >
              TAM
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 42,
                fontWeight: 700,
                color: BRAND.colors.white,
                lineHeight: 1,
              }}
            >
              {tam.value}
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 18,
                color: BRAND.colors.slate300,
                marginTop: 4,
              }}
            >
              {tam.description}
            </div>
          </div>

          {/* SAM label */}
          <div style={{ opacity: samLabelOpacity }}>
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 16,
                fontWeight: 600,
                color: BRAND.colors.gold400,
                marginBottom: 4,
              }}
            >
              SAM
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 42,
                fontWeight: 700,
                color: BRAND.colors.white,
                lineHeight: 1,
              }}
            >
              {sam.value}
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 18,
                color: BRAND.colors.slate300,
                marginTop: 4,
              }}
            >
              {sam.description}
            </div>
          </div>

          {/* SOM label */}
          <div style={{ opacity: somLabelOpacity }}>
            <div
              style={{
                fontFamily: BRAND.fonts.mono,
                fontSize: 16,
                fontWeight: 600,
                color: BRAND.colors.emerald500,
                marginBottom: 4,
              }}
            >
              SOM
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 42,
                fontWeight: 700,
                color: BRAND.colors.white,
                lineHeight: 1,
              }}
            >
              {som.value}
            </div>
            <div
              style={{
                fontFamily: BRAND.fonts.heading,
                fontSize: 18,
                color: BRAND.colors.slate300,
                marginTop: 4,
              }}
            >
              {som.description}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
