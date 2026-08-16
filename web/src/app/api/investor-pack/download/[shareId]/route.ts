// GET /api/investor-pack/download/[shareId]
//
// T-1203 — download a previously-generated investor pack via share token.
//
// Share tokens are minted by POST /api/investor-pack/one-click and stored in
// the `investor_pack_shares` table. Tokens expire after 30 days. The PDF is
// regenerated on-demand (no blob storage required) using the share row's
// pack_meta to reconstruct the InvestorPackData payload from current workspace
// state.
//
// This route does NOT require authentication — the opaque share token is the
// access credential. Investors receive the URL via email or copy-paste.
//
// Response (200): application/pdf with Content-Disposition: attachment
// Response (404): { ok: false, error: "Share link not found" }
// Response (410): { ok: false, error: "Share link has expired" }
// Response (500): { ok: false, error: "PDF generation failed" }

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  renderInvestorPack,
  SVI_13_CRITERIA,
  type InvestorPackData,
} from "@/lib/pdf/investor-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sanitizeFilenamePart(input: string): string {
  return (
    input
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .toLowerCase() || "startup"
  );
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Re-assemble InvestorPackData from current workspace state for a share row.
 * Falls back gracefully when tables are missing or data is sparse.
 */
async function reassembleForShare(
  userId: string,
  projectId: string | null,
  packMeta: Record<string, unknown> | null,
): Promise<InvestorPackData> {
  const admin = getSupabaseAdmin();
  const asOfDate = todayIsoDate();

  const startupName =
    typeof packMeta?.startupName === "string" && packMeta.startupName.trim()
      ? packMeta.startupName
      : "Startup";

  let tagline: string | undefined;
  let sector: string | undefined;

  // Project metadata
  if (admin && projectId) {
    try {
      const { data: proj } = await admin
        .from("projects")
        .select("name, description, industry")
        .eq("id", projectId)
        .maybeSingle();
      if (proj) {
        if (typeof (proj as any).description === "string" && (proj as any).description.trim()) {
          tagline = (proj as any).description;
        }
        if (typeof (proj as any).industry === "string" && (proj as any).industry.trim()) {
          sector = (proj as any).industry;
        }
      }
    } catch {
      /* fall through */
    }
  }

  // SVI report (latest)
  let sviGrade = typeof packMeta?.sviGrade === "string" ? packMeta.sviGrade : "—";
  let sviScore = 0;
  let sviDelta30d: number | undefined;
  let sviCriteria: InvestorPackData["svi"]["criteria"] = SVI_13_CRITERIA.map(
    (c) => ({ id: c.id, label: c.label, score: NaN }),
  );

  if (admin) {
    try {
      const q = admin
        .from("svi_reports")
        .select("id, grade, composite_score, delta_30d, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (projectId) q.eq("project_id", projectId);
      const { data: report } = await q.maybeSingle();

      if (report) {
        if (typeof (report as any).grade === "string") sviGrade = (report as any).grade;
        if (typeof (report as any).composite_score === "number" && Number.isFinite((report as any).composite_score)) {
          sviScore = (report as any).composite_score;
        }
        if (typeof (report as any).delta_30d === "number" && Number.isFinite((report as any).delta_30d)) {
          sviDelta30d = (report as any).delta_30d;
        }

        const reportId = (report as any).id;
        if (reportId) {
          try {
            const { data: evidence } = await admin
              .from("svi_report_evidence")
              .select("criterion_id, score, delta")
              .eq("report_id", reportId);
            if (evidence && (evidence as any[]).length > 0) {
              const byId = new Map((evidence as any[]).map((e: any) => [e.criterion_id, e]));
              sviCriteria = SVI_13_CRITERIA.map((c) => {
                const hit = byId.get(c.id);
                return {
                  id: c.id,
                  label: c.label,
                  score: hit && typeof (hit as any).score === "number" ? (hit as any).score : NaN,
                  delta: hit && typeof (hit as any).delta === "number" ? (hit as any).delta : undefined,
                };
              });
            }
          } catch {
            /* leave canonical stubs */
          }
        }
      }
    } catch {
      /* leave defaults */
    }
  }

  // Cap table
  let capTable: InvestorPackData["capTable"];
  if (admin && projectId) {
    try {
      const { data: shares } = await admin
        .from("cap_table_shares")
        .select("shareholder_name, share_class, num_shares, ownership_pct, value_aud")
        .eq("project_id", projectId)
        .order("num_shares", { ascending: false });
      if (shares && (shares as any[]).length > 0) {
        capTable = (shares as any[]).map((row: any) => ({
          shareholder: row.shareholder_name ?? "Unknown",
          class: row.share_class ?? "Ordinary",
          shares: typeof row.num_shares === "number" ? row.num_shares : 0,
          percentage: typeof row.ownership_pct === "number" ? row.ownership_pct : 0,
          valueAud: typeof row.value_aud === "number" ? row.value_aud : 0,
        }));
      }
    } catch {
      /* leave capTable undefined */
    }
  }

  // Teaser copy from founder profile
  let opportunity: string | undefined;
  let risk: string | undefined;
  let oneliner: string | undefined;

  if (admin) {
    try {
      const q = admin
        .from("founder_profiles")
        .select("elevator_pitch, opportunity_statement, key_risk")
        .eq("user_id", userId);
      if (projectId) q.eq("project_id", projectId);
      const { data: profile } = await q.maybeSingle();
      if (profile) {
        const p = profile as any;
        if (typeof p.opportunity_statement === "string" && p.opportunity_statement.trim()) opportunity = p.opportunity_statement;
        if (typeof p.key_risk === "string" && p.key_risk.trim()) risk = p.key_risk;
        if (typeof p.elevator_pitch === "string" && p.elevator_pitch.trim()) oneliner = p.elevator_pitch;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    startup: { name: startupName, tagline, sector, asOfDate },
    svi: { grade: sviGrade, score: sviScore, delta30d: sviDelta30d, criteria: sviCriteria },
    capTable,
    traction: { mrrHistory: [] },
    teaser: {
      headline: startupName,
      oneliner: oneliner ?? `${startupName} — investor pack generated by BlockID.au.`,
      opportunity,
      risk,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
): Promise<Response> {
  try {
    const { shareId } = await params;

    if (!shareId || typeof shareId !== "string" || shareId.length > 64) {
      return NextResponse.json(
        { ok: false, error: "Share link not found" },
        { status: 404 },
      );
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    // Look up the share token.
    const { data: share, error: lookupErr } = await admin
      .from("investor_pack_shares")
      .select("id, user_id, project_id, expires_at, pack_meta, download_count")
      .eq("share_id", shareId)
      .maybeSingle();

    if (lookupErr) {
      console.error("[investor-pack:download] lookup error", lookupErr);
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }
    if (!share) {
      return NextResponse.json(
        { ok: false, error: "Share link not found" },
        { status: 404 },
      );
    }

    // Validate expiry.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    if (new Date((share as any).expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { ok: false, error: "Share link has expired" },
        { status: 410 },
      );
    }

    const userId = (share as any).user_id as string;
    const projectId = ((share as any).project_id as string | null) ?? null;
    const packMeta = ((share as any).pack_meta as Record<string, unknown> | null) ?? null;
    const downloadCount = ((share as any).download_count as number) ?? 0;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Reassemble + render PDF.
    const data = await reassembleForShare(userId, projectId, packMeta);
    const buffer = await renderInvestorPack(data);

    // Bump download count + set first-download timestamp (fire-and-forget).
    void admin
      .from("investor_pack_shares")
      .update({
        download_count: downloadCount + 1,
        ...(downloadCount === 0 ? { downloaded_at: new Date().toISOString() } : {}),
      })
      .eq("share_id", shareId);

    const filenamePart = sanitizeFilenamePart(data.startup.name);
    const filename = `blockid-investor-pack-${filenamePart}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Investor-Pack-Version": "v2",
        "X-Share-Id": shareId,
      },
    });
  } catch (err) {
    console.error("[investor-pack:download]", err);
    return NextResponse.json(
      { ok: false, error: "PDF generation failed" },
      { status: 500 },
    );
  }
}
