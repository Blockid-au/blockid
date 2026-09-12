// POST /api/founder/tech-analysis
//
// Runs the Tech Intelligence agent against a startup's website URL and optional
// GitHub URL. Produces a structured TechScore (0-100) and saves to the
// tech_analyses table. The result is also reflected on svi_snapshots if that
// column exists.
//
// Body:  { startup_id: string, website_url: string, github_url?: string }
// Auth:  getCurrentUser() + assertProjectScope(startup_id, "editor") —
//        S18-B review P2-1: an accepted editor/admin on a shared project can
//        run it; the project row and the persisted tech_analyses row are
//        keyed on the OWNER's user id (one row per project), a viewer gets
//        403 and a non-member 404.
// Rate:  5/hour per caller (same limit as startup-package/analyze)
// Gate:  startup_package feature flag

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertProjectScope } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import { consumeRateLimit } from "@/lib/rate-limit/persistent";
import { runTechIntelligence } from "@/lib/agents/tech-intelligence";

export const dynamic = "force-dynamic";

// Maximum request body size guard
const MAX_URL_LENGTH = 2048;

interface TechAnalysisBody {
  startup_id?: string;
  website_url?: string;
  github_url?: string | null;
}

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "authentication_required" },
      { status: 401 },
    );
  }

  // ── Rate limit: 5/hour ───────────────────────────────────────────────
  const rl = await consumeRateLimit({
    bucket: "founder.tech-analysis",
    actorId: user.id,
    limit: 5,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate_limited",
        limit: rl.limit,
        retry_after_seconds: rl.retry_after_seconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retry_after_seconds ?? 60) },
      },
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body: TechAnalysisBody;
  try {
    body = (await request.json()) as TechAnalysisBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const { startup_id, website_url, github_url } = body;

  if (!startup_id || typeof startup_id !== "string") {
    return NextResponse.json({ ok: false, reason: "missing_startup_id" }, { status: 400 });
  }

  if (!website_url || typeof website_url !== "string" || website_url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ ok: false, reason: "missing_website_url" }, { status: 400 });
  }

  // ── Validate URL format ──────────────────────────────────────────────
  try {
    new URL(website_url);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_website_url" }, { status: 400 });
  }

  // ── Verify project access (owner or editor+ member) ──────────────────
  // S18-B review P2-1 — was `projects.user_id = user.id` (owner-only), so
  // every member hit 404 from the Run button. The scope resolves the
  // OWNER's id; the project row is read under that key.
  let ownerUserId: string;
  try {
    const scope = await assertProjectScope(user, startup_id, "editor");
    ownerUserId = scope.ownerUserId;
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "db_unavailable" }, { status: 503 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, sector, user_id")
    .eq("id", startup_id)
    .eq("user_id", ownerUserId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { ok: false, reason: "project_not_found_or_unauthorized" },
      { status: 404 },
    );
  }

  // ── Run Tech Intelligence ─────────────────────────────────────────────
  let result;
  try {
    result = await runTechIntelligence({
      websiteUrl: website_url,
      githubUrl: github_url ?? null,
      startupName: (project.name as string) ?? "Startup",
      sector: (project.sector as string | undefined) ?? undefined,
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "analysis_failed" }, { status: 500 });
  }

  // ── Persist to tech_analyses (upsert — one row per project, keyed on
  //    the OWNER so the dashboard/svi read by startup_id sees the same row
  //    whoever ran it) ──────────────────────────────────────────────────
  try {
    await supabase.from("tech_analyses").upsert(
      {
        startup_id,
        user_id: ownerUserId,
        tech_score: result.techScore,
        svi_contribution: result.sviContribution,
        valuation_multiplier_boost: result.valuationMultiplierBoost / 100, // store as decimal
        website_url,
        github_url: github_url ?? null,
        website_signals: result.websiteSignals as unknown as Record<string, unknown>,
        github_signals: result.githubSignals as unknown as Record<string, unknown> | null,
        llm_assessment: result.llmAssessment as unknown as Record<string, unknown>,
        tech_maturity: result.llmAssessment.techMaturity,
        product_presence: result.llmAssessment.productPresence,
        developer_activity: result.llmAssessment.developerActivity,
        scalability_score: result.llmAssessment.scalabilityScore,
        analysis_version: "1.0",
        created_at: result.generatedAt,
      },
      {
        onConflict: "startup_id,user_id",
      },
    );
  } catch {
    // Non-fatal — we still return the result even if the save fails
  }

  return NextResponse.json({ ok: true, ...result });
}
