import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface TeamMember {
  role: string;
  title: string;
  skills: number;
}

interface TeamOrgProps {
  founderName?: string;
  founderTitle?: string;
  members?: TeamMember[];
  delay?: number;
  companyInfo?: string;
}

const DEFAULT_MEMBERS: TeamMember[] = [
  { role: "CTO", title: "Chief Technology Officer", skills: 22 },
  { role: "CPO", title: "Chief Product Officer", skills: 4 },
  { role: "CMO", title: "Chief Marketing Officer", skills: 5 },
  { role: "CFO", title: "Chief Financial Officer", skills: 4 },
  { role: "COO", title: "Chief Operating Officer", skills: 5 },
  { role: "CRO", title: "Chief Revenue Officer", skills: 4 },
  { role: "IR", title: "Investor Relations", skills: 3 },
  { role: "Media", title: "Media Studio", skills: 3 },
  { role: "Blockchain", title: "Blockchain Expert", skills: 4 },
];

export const TeamOrg: React.FC<TeamOrgProps> = ({
  founderName = "Do Van Long",
  founderTitle = "Founder & CEO",
  members = DEFAULT_MEMBERS,
  delay = 0,
  companyInfo = "Auschain Pty Ltd (ACN 659 615 111) \u2014 Sydney, NSW",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  // Founder card animation
  const founderSpring = spring({
    frame: delayedFrame,
    fps,
    config: { damping: 14, stiffness: 80, mass: 0.6 },
  });

  // Total skills
  const totalSkills = members.reduce((sum, m) => sum + m.skills, 0);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 80px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          width: "100%",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontFamily: BRAND.fonts.heading,
            fontSize: 42,
            fontWeight: 700,
            color: BRAND.colors.white,
            opacity: founderSpring,
            textAlign: "center",
          }}
        >
          AI-First Team
        </div>

        {/* Founder card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: "20px 48px",
            borderRadius: 16,
            backgroundColor: `${BRAND.colors.brand500}20`,
            border: `2px solid ${BRAND.colors.brand500}`,
            opacity: founderSpring,
            transform: `scale(${founderSpring})`,
          }}
        >
          <div
            style={{
              fontFamily: BRAND.fonts.heading,
              fontSize: 28,
              fontWeight: 700,
              color: BRAND.colors.white,
            }}
          >
            {founderName}
          </div>
          <div
            style={{
              fontFamily: BRAND.fonts.heading,
              fontSize: 18,
              color: BRAND.colors.brand400,
            }}
          >
            {founderTitle}
          </div>
        </div>

        {/* Connecting lines indicator */}
        <div
          style={{
            width: 2,
            height: 20,
            backgroundColor: BRAND.colors.slate400,
            opacity: interpolate(delayedFrame, [15, 25], [0, 0.5], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />

        {/* C-level grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 12,
            width: "100%",
            maxWidth: 1400,
          }}
        >
          {members.map((member, index) => {
            const memberDelay = delay + 20 + index * 6;
            const memberFrame = Math.max(0, frame - memberDelay);

            const memberSpring = spring({
              frame: memberFrame,
              fps,
              config: { damping: 12, stiffness: 100, mass: 0.4 },
            });

            return (
              <div
                key={member.role}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 8px",
                  borderRadius: 12,
                  backgroundColor: `${BRAND.colors.ink800}80`,
                  border: `1px solid ${BRAND.colors.slate400}20`,
                  opacity: memberSpring,
                  transform: `scale(${memberSpring}) translateY(${interpolate(
                    memberSpring,
                    [0, 1],
                    [20, 0]
                  )}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: BRAND.fonts.mono,
                    fontSize: 16,
                    fontWeight: 700,
                    color: BRAND.colors.brand400,
                  }}
                >
                  {member.role}
                </div>
                <div
                  style={{
                    fontFamily: BRAND.fonts.heading,
                    fontSize: 12,
                    color: BRAND.colors.slate300,
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {member.title}
                </div>
                <div
                  style={{
                    fontFamily: BRAND.fonts.mono,
                    fontSize: 11,
                    color: BRAND.colors.slate400,
                    marginTop: 2,
                  }}
                >
                  {member.skills} skills
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom info row */}
        <div
          style={{
            display: "flex",
            gap: 40,
            alignItems: "center",
            opacity: interpolate(delayedFrame, [60, 80], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              fontFamily: BRAND.fonts.mono,
              fontSize: 18,
              fontWeight: 600,
              color: BRAND.colors.gold400,
            }}
          >
            {totalSkills}+ specialized skills
          </div>
          <div
            style={{
              fontFamily: BRAND.fonts.mono,
              fontSize: 14,
              color: BRAND.colors.slate400,
            }}
          >
            {companyInfo}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
