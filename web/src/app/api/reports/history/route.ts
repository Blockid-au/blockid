// GET /api/reports/history
//
// T_REPORT_ARCHIVE — returns the authenticated user's report history:
//   - investor_pack_shares (all generated investor packs, newest first)
//   - assembled_reports (AI-assembled reports, newest first, if they exist)
//
// Auth required (401 for unauthenticated).
// Both queries degrade gracefully if the table doesn't exist yet.
//
// Response (200):
//   {
//     investorPacks: Array<{ id, share_id, created_at, expires_at, is_expired, download_url }>,
//     assembledReports: Array<{ id, order_id, tier, created_at, word_count, startup_name }>
//   }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Service unavailable" },
      { status: 503 },
    );
  }

  const now = new Date();

  // ── Investor packs ──────────────────────────────────────────────────────────
  const investorPacks: Array<{
    id: string;
    share_id: string;
    created_at: string;
    expires_at: string;
    is_expired: boolean;
    download_url: string;
  }> = [];

  try {
    const { data: packs } = await admin
      .from("investor_pack_shares")
      .select("id, share_id, created_at, expires_at, pack_meta")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (packs && (packs as any[]).length > 0) {
      for (const row of packs as any[]) {
        const expiresAt = new Date(row.expires_at);
        investorPacks.push({
          id: row.id,
          share_id: row.share_id,
          created_at: row.created_at,
          expires_at: row.expires_at,
          is_expired: expiresAt.getTime() < now.getTime(),
          download_url: `/api/investor-pack/download/${row.share_id}`,
        });
      }
    }
  } catch {
    // investor_pack_shares may not exist in older envs — degrade silently
  }

  // ── Assembled reports ───────────────────────────────────────────────────────
  const assembledReports: Array<{
    id: string;
    order_id: string;
    tier: string;
    created_at: string;
    word_count: number;
    startup_name: string;
  }> = [];

  try {
    // assembled_reports is joined with projects via project_id for startup name.
    // The table may not exist in all environments.
    const { data: reports } = await admin
      .from("assembled_reports")
      .select("id, project_id, tier, created_at, total_words, title, status")
      .eq("user_id", user.id)
      .in("status", ["complete"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (reports && (reports as any[]).length > 0) {
      // Collect unique project ids to batch-fetch startup names
      const projectIds = [
        ...new Set(
          (reports as any[])
            .map((r: any) => r.project_id)
            .filter(Boolean),
        ),
      ];

      const nameMap = new Map<string, string>();
      if (projectIds.length > 0) {
        try {
          const { data: projects } = await admin
            .from("projects")
            .select("id, name")
            .in("id", projectIds);
          if (projects) {
            for (const p of projects as any[]) {
              if (typeof p.name === "string" && p.name.trim()) {
                nameMap.set(p.id, p.name);
              }
            }
          }
        } catch {
          /* ignore — name lookup is best-effort */
        }
      }

      for (const row of reports as any[]) {
        const startupName =
          (row.project_id && nameMap.get(row.project_id)) ||
          (typeof row.title === "string" && row.title.trim()) ||
          "Startup";

        assembledReports.push({
          id: row.id,
          order_id: row.id, // assembled_reports uses id as the route param
          tier: typeof row.tier === "string" ? row.tier : "standard",
          created_at: row.created_at,
          word_count: typeof row.total_words === "number" ? row.total_words : 0,
          startup_name: startupName,
        });
      }
    }
  } catch {
    // assembled_reports table may not exist yet — degrade silently
  }

  /* eslint-enable @typescript-eslint/no-explicit-any */

  return NextResponse.json(
    { ok: true, investorPacks, assembledReports },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    },
  );
}
