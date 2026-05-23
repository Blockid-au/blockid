import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const svi = searchParams.get("svi") ?? "100";
  const stage = searchParams.get("stage") ?? "0";
  const name = searchParams.get("name") ?? "My Startup";

  const sviNum = parseInt(svi);
  const stageNum = parseInt(stage);

  const stageLabels = ["Idea", "Concept", "Building", "Launched", "Traction", "Revenue", "Scale-Ready", "Investor-Ready"];
  const stageLabel = stageLabels[stageNum] ?? "Idea";

  const scoreColor = sviNum >= 170 ? "#059669" : sviNum >= 120 ? "#2563eb" : sviNum >= 80 ? "#d97706" : "#dc2626";

  return new ImageResponse(
    (
      <div style={{
        width: "1200px", height: "630px",
        display: "flex", flexDirection: "column",
        background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)",
        padding: "60px",
        fontFamily: "Arial",
      }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold", color: "white" }}>
              BlockID.au
            </div>
          </div>
          <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.7)" }}>
            Startup Value Index
          </div>
        </div>

        {/* Center content */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: "20px", color: "rgba(255,255,255,0.8)", marginBottom: "16px" }}>
              {name}
            </div>
            <div style={{
              fontSize: "120px", fontWeight: "bold", color: "white",
              lineHeight: 1,
              textShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}>
              {svi}
            </div>
            <div style={{
              marginTop: "12px",
              padding: "8px 24px",
              borderRadius: "99px",
              background: scoreColor,
              color: "white",
              fontSize: "18px",
              fontWeight: "bold",
            }}>
              {stageLabel} — Stage {stage}
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: "16px", color: "rgba(255,255,255,0.6)" }}>
            Valuation. Ownership. Growth.
          </div>
          <div style={{
            padding: "10px 20px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.2)",
            color: "white",
            fontSize: "14px",
            fontWeight: "bold",
          }}>
            Get your free SVI → blockid.au
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
