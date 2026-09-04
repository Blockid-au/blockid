import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = (searchParams.get("company") ?? "Your Startup").slice(0, 40);
  const score = Math.min(100, Math.max(0, parseInt(searchParams.get("score") ?? "0", 10)));
  const stage = searchParams.get("stage") ?? "seed";

  const color = score >= 70 ? "#059669" : score >= 45 ? "#d97706" : "#dc2626";
  const label = score >= 70 ? "Investor Ready" : score >= 45 ? "Developing" : "Early Stage";
  const stageLabel = stage.charAt(0).toUpperCase() + stage.replace("-", " ").slice(1);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          padding: "60px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
          <div style={{ color: "#f59e0b", fontSize: 26, fontWeight: 700 }}>BlockID.au</div>
          <div style={{ color: "#475569", fontSize: 16 }}>|</div>
          <div style={{ color: "#64748b", fontSize: 18 }}>Startup Value Index™</div>
        </div>

        {/* Company name */}
        <div style={{ display: "flex", color: "#f1f5f9", fontSize: company.length > 25 ? 44 : 52, fontWeight: 800, lineHeight: 1.1, marginBottom: 40 }}>
          {company}
        </div>

        {/* Score display */}
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ color, fontSize: 130, fontWeight: 900, lineHeight: 1 }}>{score}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color, fontSize: 30, fontWeight: 700 }}>{label}</div>
            <div style={{ color: "#94a3b8", fontSize: 20 }}>out of 100</div>
            <div style={{
              display: "flex", alignItems: "center", marginTop: 8,
              background: "#1e293b", border: "1px solid #334155",
              borderRadius: 8, padding: "6px 14px",
            }}>
              <div style={{ color: "#94a3b8", fontSize: 16 }}>{stageLabel} Stage</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", marginTop: "auto", color: "#475569", fontSize: 15 }}>
          blockid.au/score — Free investor-readiness analysis for Australian founders
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
