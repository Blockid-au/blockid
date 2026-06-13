import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateSVIAccount, getProjectIdFromRequest } from "@/lib/projects";
import { parseRepoInput, fetchRepoStats } from "@/lib/github";

export const dynamic = "force-dynamic";

function impactFor(stats: { commitsLast90: number; stars: number }): number {
  let impact = 4;
  if (stats.commitsLast90 >= 30) impact += 4;
  else if (stats.commitsLast90 >= 10) impact += 2;
  if (stats.stars >= 100) impact += 3;
  else if (stats.stars >= 10) impact += 1;
  return Math.min(impact, 10);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );

  let body: { repo?: string };
  try {
    body = (await request.json()) as { repo?: string };
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }
  if (!body.repo) {
    return NextResponse.json({ ok: false, reason: "Repo required" }, { status: 400 });
  }
  const parsed = parseRepoInput(body.repo);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, reason: "Could not parse repo — paste a github.com URL or owner/repo" },
      { status: 400 },
    );
  }

  const stats = await fetchRepoStats(parsed.owner, parsed.repo);
  if (!stats) {
    return NextResponse.json(
      { ok: false, reason: "Could not fetch repo — is it public and does it exist?" },
      { status: 404 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, stats, persisted: false });
  }

  const projectId = await getProjectIdFromRequest();
  const accountId = await findOrCreateSVIAccount(user.email, projectId);
  if (!accountId) {
    return NextResponse.json({ ok: true, stats, persisted: false });
  }

  const impact = impactFor(stats);
  const label = `GitHub · ${stats.owner}/${stats.repo}`;

  // Replace any prior github_repo evidence row for this account.
  await supabase
    .from("svi_evidence")
    .delete()
    .eq("account_id", accountId)
    .eq("evidence_type", "github_repo");

  const { error } = await supabase.from("svi_evidence").insert({
    account_id: accountId,
    evidence_type: "github_repo",
    label,
    value_or_url: stats.url,
    confidence_level: "connected_source",
    dimension: "ptd",
    svi_impact: impact,
    verified_at: new Date().toISOString(),
    project_id: projectId,
  });

  if (error) {
    console.error("[blockid:github] evidence insert failed", error);
    return NextResponse.json({ ok: true, stats, persisted: false });
  }

  return NextResponse.json({ ok: true, stats, persisted: true, impact });
}
