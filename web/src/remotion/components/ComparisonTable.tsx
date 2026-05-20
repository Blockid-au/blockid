import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../styles/brand";

interface ComparisonRow {
  feature: string;
  values: ("yes" | "no" | "partial")[];
}

interface ComparisonTableProps {
  /** Column headers (competitor names) */
  headers: string[];
  /** Rows of feature comparisons */
  rows: ComparisonRow[];
  /** Delay before table appears */
  delay?: number;
  /** Title above the table */
  title?: string;
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  headers,
  rows,
  delay = 0,
  title = "Competitive Advantage",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delayedFrame = Math.max(0, frame - delay);

  const tableOpacity = interpolate(delayedFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  const titleSpring = spring({
    frame: delayedFrame,
    fps,
    config: { damping: 18, stiffness: 80, mass: 0.5 },
  });

  const renderCell = (
    value: "yes" | "no" | "partial",
    rowIdx: number,
    colIdx: number
  ) => {
    const cellDelay = delay + 20 + rowIdx * 10 + colIdx * 5;
    const cellFrame = Math.max(0, frame - cellDelay);

    const cellSpring = spring({
      frame: cellFrame,
      fps,
      config: { damping: 12, stiffness: 120, mass: 0.4 },
    });

    let icon: string;
    let iconColor: string;

    if (value === "yes") {
      icon = "\u2713";
      iconColor = BRAND.colors.emerald500;
    } else if (value === "partial") {
      icon = "~";
      iconColor = BRAND.colors.gold400;
    } else {
      icon = "\u2717";
      iconColor = BRAND.colors.red400;
    }

    return (
      <div
        key={`${rowIdx}-${colIdx}`}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "14px 0",
          opacity: cellSpring,
          transform: `scale(${cellSpring})`,
        }}
      >
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: iconColor,
          }}
        >
          {icon}
        </span>
      </div>
    );
  };

  const colCount = headers.length + 1; // +1 for feature name column

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 100px",
        opacity: tableOpacity,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
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
            transform: `scale(${titleSpring})`,
          }}
        >
          {title}
        </div>

        {/* Table */}
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: `2fr ${headers.map(() => "1fr").join(" ")}`,
            backgroundColor: `${BRAND.colors.ink800}80`,
            borderRadius: 16,
            overflow: "hidden",
            border: `1px solid ${BRAND.colors.slate400}20`,
          }}
        >
          {/* Header row */}
          <div
            style={{
              padding: "18px 24px",
              fontFamily: BRAND.fonts.heading,
              fontSize: 18,
              fontWeight: 600,
              color: BRAND.colors.slate400,
              borderBottom: `1px solid ${BRAND.colors.slate400}20`,
            }}
          >
            Feature
          </div>
          {headers.map((header, idx) => {
            const isLast = idx === headers.length - 1;
            return (
              <div
                key={header}
                style={{
                  padding: "18px 12px",
                  fontFamily: BRAND.fonts.heading,
                  fontSize: 20,
                  fontWeight: 700,
                  color: isLast ? BRAND.colors.brand500 : BRAND.colors.slate300,
                  textAlign: "center",
                  borderBottom: `1px solid ${BRAND.colors.slate400}20`,
                  backgroundColor: isLast
                    ? `${BRAND.colors.brand500}10`
                    : "transparent",
                }}
              >
                {header}
              </div>
            );
          })}

          {/* Data rows */}
          {rows.map((row, rowIdx) => (
            <React.Fragment key={row.feature}>
              <div
                style={{
                  padding: "14px 24px",
                  fontFamily: BRAND.fonts.heading,
                  fontSize: 20,
                  fontWeight: 500,
                  color: BRAND.colors.white,
                  borderBottom:
                    rowIdx < rows.length - 1
                      ? `1px solid ${BRAND.colors.slate400}10`
                      : "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {row.feature}
              </div>
              {row.values.map((val, colIdx) => {
                const isLastCol = colIdx === row.values.length - 1;
                return (
                  <div
                    key={`${row.feature}-${colIdx}`}
                    style={{
                      borderBottom:
                        rowIdx < rows.length - 1
                          ? `1px solid ${BRAND.colors.slate400}10`
                          : "none",
                      backgroundColor: isLastCol
                        ? `${BRAND.colors.brand500}10`
                        : "transparent",
                    }}
                  >
                    {renderCell(val, rowIdx, colIdx)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
