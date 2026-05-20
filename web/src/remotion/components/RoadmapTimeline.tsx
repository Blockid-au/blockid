import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface RoadmapPhase {
  phase: number;
  title: string;
  status: "complete" | "in-progress" | "planned";
  target?: string;
}

interface RoadmapTimelineProps {
  phases?: RoadmapPhase[];
  /** Delay before animation starts */
  delay?: number;
  /** Frames between each phase reveal */
  staggerFrames?: number;
  title?: string;
}

const DEFAULT_PHASES: RoadmapPhase[] = [
  { phase: 1, title: "AI Analysis", status: "complete" },
  { phase: 2, title: "Evidence & Validation", status: "in-progress", target: "Q3 2026" },
  { phase: 3, title: "Dollar Valuation Engine", status: "planned", target: "Q4 2026" },
  { phase: 4, title: "Full Cap Table Management", status: "planned", target: "Q1 2027" },
  { phase: 5, title: "Blockchain Tokenization", status: "planned", target: "Q2-Q3 2027" },
  { phase: 6, title: "Investor Matching & Fundraise", status: "planned", target: "Q3-Q4 2027" },
  { phase: 7, title: "Revenue & Dividends", status: "planned", target: "2028" },
  { phase: 8, title: "Growth Journal & Exit", status: "planned", target: "2028+" },
];

export const RoadmapTimeline: React.FC<RoadmapTimelineProps> = ({
  phases = DEFAULT_PHASES,
  delay = 0,
  staggerFrames = 12,
  title = "Product Roadmap",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(
    Math.max(0, frame - delay),
    [0, 15],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "complete":
        return "\u2713";
      case "in-progress":
        return "\u26A1";
      default:
        return "\u25CB";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "complete":
        return BRAND.colors.emerald500;
      case "in-progress":
        return BRAND.colors.gold400;
      default:
        return BRAND.colors.slate400;
    }
  };

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
          width: "100%",
          maxWidth: 1200,
        }}
      >
        {/* Title */}
        <div
          style={{
            fontFamily: BRAND.fonts.heading,
            fontSize: 48,
            fontWeight: 700,
            color: BRAND.colors.white,
            marginBottom: 40,
            textAlign: "center",
            opacity: titleOpacity,
          }}
        >
          {title}
        </div>

        {/* Timeline */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px 40px",
          }}
        >
          {phases.map((phase, index) => {
            const phaseDelay = delay + 15 + index * staggerFrames;
            const phaseFrame = Math.max(0, frame - phaseDelay);

            const phaseSpring = spring({
              frame: phaseFrame,
              fps,
              config: { damping: 14, stiffness: 80, mass: 0.5 },
            });

            const statusColor = getStatusColor(phase.status);

            return (
              <div
                key={phase.phase}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 20px",
                  borderRadius: 12,
                  backgroundColor: `${BRAND.colors.ink800}80`,
                  border: `1px solid ${statusColor}30`,
                  opacity: phaseSpring,
                  transform: `translateX(${interpolate(
                    phaseSpring,
                    [0, 1],
                    [40, 0]
                  )}px)`,
                }}
              >
                {/* Status icon */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    backgroundColor: `${statusColor}20`,
                    border: `2px solid ${statusColor}`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 18,
                    fontWeight: 700,
                    color: statusColor,
                    flexShrink: 0,
                  }}
                >
                  {getStatusIcon(phase.status)}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: 20,
                      fontWeight: 600,
                      color: BRAND.colors.white,
                      lineHeight: 1.2,
                    }}
                  >
                    Phase {phase.phase}: {phase.title}
                  </div>
                  {phase.target && (
                    <div
                      style={{
                        fontFamily: BRAND.fonts.mono,
                        fontSize: 14,
                        color: BRAND.colors.slate400,
                        marginTop: 4,
                      }}
                    >
                      Target: {phase.target}
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div
                  style={{
                    fontFamily: BRAND.fonts.mono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusColor,
                    backgroundColor: `${statusColor}15`,
                    padding: "4px 10px",
                    borderRadius: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    flexShrink: 0,
                  }}
                >
                  {phase.status === "complete"
                    ? "LIVE"
                    : phase.status === "in-progress"
                      ? "Building"
                      : "Planned"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
