import { ImageResponse } from "next/og";

export const runtime = "edge";
// G21 P0-B: og:image:alt mirrors the FI1 hero H1 (docs/design/messaging.md § 2)
// so the social card, browser tab and hero headline all say the same thing.
export const alt = "Screen every startup on the same evidence-backed framework · BlockID.au";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0A0F1E 0%, #111827 100%)",
          fontFamily: "Inter, sans-serif",
          position: "relative",
        }}
      >
        {/* Background glow */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,212,255,0.08) 0%, transparent 70%)",
          display: "flex",
        }} />

        {/* Logo / Brand */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 32,
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "linear-gradient(135deg, #00D4FF, #0066FF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{ color: "#0A0F1E", fontSize: 28, fontWeight: 800, display: "flex" }}>B</div>
          </div>
          <div style={{ color: "#F8FAFC", fontSize: 32, fontWeight: 700, display: "flex" }}>BlockID</div>
        </div>

        {/* Headline */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}>
          <div style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#F8FAFC",
            textAlign: "center",
            lineHeight: 1.1,
            maxWidth: 900,
            display: "flex",
          }}>
            Screen every startup on the same evidence-backed framework
          </div>
          <div style={{
            fontSize: 22,
            color: "#94A3B8",
            textAlign: "center",
            display: "flex",
          }}>
            Startup Value Index · by BlockID
          </div>
        </div>

        {/* Stats strip */}
        <div style={{
          display: "flex",
          gap: 48,
          marginTop: 48,
          paddingTop: 32,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}>
          {[
            { value: "8 SVI dimensions", label: "one rubric for every deal" },
            { value: "AUD valuation range", label: "evidence-backed" },
            { value: "Investor Dossier", label: "founders get the feedback free" },
          ].map((stat) => (
            <div key={stat.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#00D4FF", display: "flex" }}>{stat.value}</div>
              <div style={{ fontSize: 14, color: "#94A3B8", display: "flex" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* URL badge */}
        <div style={{
          position: "absolute",
          bottom: 32,
          right: 40,
          color: "#94A3B8",
          fontSize: 16,
          display: "flex",
        }}>
          blockid.au
        </div>
      </div>
    ),
    { ...size }
  );
}
