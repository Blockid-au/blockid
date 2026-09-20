// /api/cron/outcome-signals — daily 03:10 UTC (G21 P3-A).
//
// For every project with an svi_snapshot in the last 180 days (capped 500 /
// run) derive PROPOSED outcomes from what BlockID already holds — register
// grant awards (by ABN), connector MRR ≥ +25 % against the snapshot ≥ 90 d
// earlier, stage rises between snapshots, cohort "proceed" decisions and,
// when GITHUB_TOKEN is set, tags on the linked GitHub repository — and
// upsert them with ignoreDuplicates on the 0427 unique key. Never confirms:
// a person does, on /workspace/evidence/outcomes or /admin/outcomes. One
// `outcome.proposed` audit row per inserted proposal.
//
//   ?dry=1   derive only — no writes, no audit rows
//   ?cap=N   override the 500 per-run cap (≤ 2000)
//
// Auth: CRON_SECRET via `Authorization: Bearer` or `x-cron-secret`, like
// every other cron here. GET and POST both work (cron-runner.sh POSTs).
// Allow-listed from apiRoute (api/cron/** — system actor; the run lands in
// cron-health.jsonl via the runner and the job writes its own audit rows).

import { NextResponse } from "next/server";
import { fetchGithubTags, listRecentlySnapshottedProjects, loadProposalContext, deriveProposals, runOutcomeSignals, OUTCOME_SIGNALS_RUN_CAP } from "@/lib/outcomes/proposals";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function defaultAudit(params: { user_id: string | null; actor: string; action: string; resource_type: string; resource_id: string | null; detail: Record<string, unknown> }): Promise<unknown> {
  const { appendAudit } = await import("@/lib/audit");
  return appendAudit(params);
}

async function run(request: Request) {
  if (!isCronAuthorised(request, { xCronSecretHeader: true })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const capRaw = Number(url.searchParams.get("cap"));
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.min(2000, Math.floor(capRaw)) : OUTCOME_SIGNALS_RUN_CAP;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const token = process.env.GITHUB_TOKEN;
  const fetchTags = token ? (owner: string, repo: string) => fetchGithubTags(owner, repo, token) : undefined;

  try {
    if (dry) {
      const now = new Date();
      const { ids, capped } = await listRecentlySnapshottedProjects(db, now, cap);
      let derived = 0;
      const warnings: string[] = [];
      const sample: Array<{ project_id: string; kind: string; source: string; observed_at: string }> = [];
      for (const id of ids) {
        const { ctx, warnings: w } = await loadProposalContext(db, id, { now: () => now, fetchTags });
        const p = deriveProposals(ctx);
        derived += p.length;
        for (const x of p.slice(0, 3)) if (sample.length < 20) sample.push({ project_id: id, kind: x.kind, source: x.source, observed_at: x.observed_at });
        warnings.push(...w.map((m) => `${id}: ${m}`));
      }
      return NextResponse.json({ ok: true, dry: true, at: now.toISOString(), projects: ids.length, derived, inserted: 0, capped, sample, warnings: warnings.slice(0, 50) });
    }
    const result = await runOutcomeSignals(db, { cap, fetchTags, audit: defaultAudit });
    return NextResponse.json({ ...result, dry: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[blockid:outcome-signals] failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
