import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface FlowStep {
  icon: string;
  label: string;
  sublabel?: string;
}

interface FlowDiagramProps {
  /** Steps to display as connected boxes */
  steps: FlowStep[];
  /** Delay before animation starts (in frames) */
  delay?: number;
  /** Optional title above the flow */
  title?: string;
  /** Direction: horizontal or vertical */
  direction?: "horizontal" | "vertical";
}

export const FlowDiagram: React.FC<FlowDiagramProps> = ({
  steps,
  delay = 0,
  title,
  direction = "horizontal",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  const titleOpacity = interpolate(delayedFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const isHorizontal = direction === "horizontal";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 80px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          width: "100%",
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

        {/* Flow steps */}
        <div
          style={{
            display: "flex",
            flexDirection: isHorizontal ? "row" : "column",
            alignItems: "center",
            gap: 0,
          }}
        >
          {steps.map((step, index) => {
            const stepDelay = delay + 15 + index * 18;
            const stepFrame = Math.max(0, frame - stepDelay);

            const stepSpring = spring({
              frame: stepFrame,
              fps,
              config: { damping: 14, stiffness: 80, mass: 0.5 },
            });

            const translateOffset = interpolate(
              stepSpring,
              [0, 1],
              [isHorizontal ? 30 : 20, 0]
            );

            // Arrow appears after the box
            const arrowDelay = delay + 15 + index * 18 + 10;
            const arrowFrame = Math.max(0, frame - arrowDelay);
            const arrowOpacity = interpolate(arrowFrame, [0, 8], [0, 1], {
              extrapolateRight: "clamp",
            });

            return (
              <React.Fragment key={index}>
                {/* Step box */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    padding: isHorizontal ? "24px 28px" : "20px 40px",
                    borderRadius: 16,
                    backgroundColor: `${BRAND.colors.ink800}90`,
                    border: `2px solid ${BRAND.colors.brand500}40`,
                    opacity: stepSpring,
                    transform: isHorizontal
                      ? `translateX(${translateOffset}px)`
                      : `translateY(${translateOffset}px)`,
                    minWidth: isHorizontal ? 160 : 280,
                    textAlign: "center",
                  }}
                >
                  {/* Icon */}
                  <div style={{ fontSize: 32, lineHeight: 1 }}>
                    {step.icon}
                  </div>

                  {/* Label */}
                  <div
                    style={{
                      fontFamily: BRAND.fonts.heading,
                      fontSize: isHorizontal ? 20 : 22,
                      fontWeight: 600,
                      color: BRAND.colors.white,
                      lineHeight: 1.2,
                    }}
                  >
                    {step.label}
                  </div>

                  {/* Sublabel */}
                  {step.sublabel && (
                    <div
                      style={{
                        fontFamily: BRAND.fonts.heading,
                        fontSize: 14,
                        color: BRAND.colors.slate400,
                        lineHeight: 1.3,
                        maxWidth: 200,
                      }}
                    >
                      {step.sublabel}
                    </div>
                  )}
                </div>

                {/* Arrow between steps (not after last) */}
                {index < steps.length - 1 && (
                  <div
                    style={{
                      opacity: arrowOpacity,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: isHorizontal ? "0 8px" : "4px 0",
                      color: BRAND.colors.brand400,
                      fontSize: 28,
                      fontWeight: 700,
                    }}
                  >
                    {isHorizontal ? "\u2192" : "\u2193"}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
