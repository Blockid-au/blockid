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

interface CTASlideProps {
  founderName?: string;
  founderTitle?: string;
  companyEntity?: string;
  linkedIn?: string;
  ctaText?: string;
  tagline?: string;
}

export const CTASlide: React.FC<CTASlideProps> = ({
  founderName = "Do Van Long",
  founderTitle = "Founder & CEO",
  companyEntity = "Auschain Pty Ltd",
  linkedIn = "linkedin.com/in/dovanlong",
  ctaText = "First analysis free. Start today.",
  tagline = "Where AI meets startup valuation",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 80, mass: 0.6 },
  });

  const contentOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaPulse = interpolate(
    frame % 60,
    [0, 30, 60],
    [1, 1.05, 1],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.colors.ink950,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          transform: `scale(${logoSpring})`,
        }}
      >
        {/* Logo */}
        <Img
          src={staticFile("images/logo-icon-transparent.png")}
          style={{
            width: 120,
            height: 120,
            objectFit: "contain",
          }}
        />

        {/* Brand name */}
        <div
          style={{
            fontFamily: BRAND.fonts.heading,
            fontSize: 64,
            fontWeight: 700,
            color: BRAND.colors.white,
          }}
        >
          Block
          <span style={{ color: BRAND.colors.brand500 }}>ID</span>
          <span style={{ color: BRAND.colors.slate400, fontSize: 42 }}>
            .au
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: BRAND.fonts.heading,
            fontSize: 28,
            color: BRAND.colors.slate300,
            opacity: contentOpacity,
          }}
        >
          {tagline}
        </div>

        {/* Divider */}
        <div
          style={{
            width: 400,
            height: 1,
            backgroundColor: BRAND.colors.slate400,
            opacity: contentOpacity * 0.3,
            marginTop: 8,
            marginBottom: 8,
          }}
        />

        {/* Founder info */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: contentOpacity,
          }}
        >
          <div
            style={{
              fontFamily: BRAND.fonts.heading,
              fontSize: 32,
              fontWeight: 600,
              color: BRAND.colors.white,
            }}
          >
            {founderName}
          </div>
          <div
            style={{
              fontFamily: BRAND.fonts.heading,
              fontSize: 22,
              color: BRAND.colors.slate300,
            }}
          >
            {founderTitle}, {companyEntity}
          </div>
        </div>

        {/* LinkedIn QR placeholder */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            opacity: contentOpacity,
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              backgroundColor: BRAND.colors.white,
              borderRadius: 8,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontFamily: BRAND.fonts.mono,
              fontSize: 12,
              color: BRAND.colors.ink950,
              textAlign: "center",
              padding: 8,
            }}
          >
            [QR Code]
            <br />
            LinkedIn
          </div>
          <div
            style={{
              fontFamily: BRAND.fonts.mono,
              fontSize: 14,
              color: BRAND.colors.slate400,
            }}
          >
            {linkedIn}
          </div>
        </div>

        {/* CTA Button */}
        <div
          style={{
            marginTop: 16,
            opacity: ctaOpacity,
            transform: `scale(${ctaPulse})`,
          }}
        >
          <div
            style={{
              fontFamily: BRAND.fonts.heading,
              fontSize: 28,
              fontWeight: 600,
              color: BRAND.colors.white,
              backgroundColor: BRAND.colors.brand500,
              padding: "16px 48px",
              borderRadius: 12,
              boxShadow: `0 4px 30px ${BRAND.colors.brand500}60`,
            }}
          >
            {ctaText}
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            fontFamily: BRAND.fonts.mono,
            fontSize: 20,
            color: BRAND.colors.brand400,
            opacity: ctaOpacity,
            marginTop: 8,
          }}
        >
          blockid.au
        </div>
      </div>
    </AbsoluteFill>
  );
};
