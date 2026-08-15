// POST /api/analyzer/run
//
// Runs the Code/Website Analyzer for a startup:
//   1. Validate body — at least one of github_url / website_url is required.
//   2. Collect signals in parallel.
//   3. Compute pure sub_score + valuation adjuster.
//   4. Persist to analyzer_runs (scoped by startup_id — multi-startup safe).
//
// Auth: getCurrentUser() required. Rate limit: 5/hour per user.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { analyseGithub } from "@/lib/analyzer/github";
import { analyseWebsite } from "@/lib/analyzer/website";
import { scoreAnalyzer } from "@/lib/analyzer/score";

export const dynamic = "force-dynamic";

const MAX_URL_LENGTH = 2048;

interface Body {
  startup_id?: string;
  github_url?: string | null;
  website_url?: string | null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "authentication_required" },
      { status: 401 },
    );
  }

  const rl = await consumeRateLimit({
    bucket: "analyzer.run",
    actorId: user.id,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate_limited",
        retry_after_seconds: rl.retry_after_seconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const { startup_id, github_url, website_url } = body;

  if (!startup_id || typeof startup_id !== "string") {
    return NextResponse.json({ ok: false, reason: "missing_startup_id" }, { status: 400 });
  }
  const gh = typeof github_url === "string" && github_url.length > 0 && github_url.length <= MAX_URL_LENGTH ? github_url : null;
  const ws = typeof website_url === "string" && website_url.length > 0 && website_url.length <= MAX_URL_LENGTH ? website_url : null;
  if (!gh && !ws) {
    return NextResponse.json(
      { ok: false, reason: "missing_url", detail: "Provide github_url or website_url" },
      { status: 400 },
    );
  }

  // Collect signals in parallel — either may return null when input missing.
  const [githubSignals, websiteSignals] = await Promise.all([
    gh ? analyseGithub(gh) : Promise.resolve(null),
    ws ? analyseWebsite(ws) : Promise.resolve(null),
  ]);

  const signals = { github: githubSignals, website: websiteSignals };
  const scored = scoreAnalyzer(signals);

  // Persist. Fail-soft: if the table isn't provisioned yet (42P01), return the
  // computed score with a warning so the UI still renders something.
  const supabase = getSupabaseAdmin();
  let runId: string | null = null;
  let persistError: string | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from("analyzer_runs")
      .insert({
        startup_id,
        user_id: user.id,
        github_url: gh,
        website_url: ws,
        signals,
        sub_score: scored.sub_score,
        valuation_adjuster_pct: scored.valuation_adjuster_pct,
        rationale: scored.rationale,
      })
      .select("id")
      .maybeSingle();
    if (error) persistError = error.message;
    else runId = (data?.id as string | undefined) ?? null;
  }

  return NextResponse.json({
    ok: true,
    run_id: runId,
    sub_score: scored.sub_score,
    valuation_adjuster_pct: scored.valuation_adjuster_pct,
    rationale: scored.rationale,
    breakdown: scored.breakdown,
    signals,
    persist_warning: persistError,
  });
}
