/**
 * /api/funding/draft — per-grant application drafts (T0251, plan §4h
 * "Application drafts"). Same rails as POST /api/funding/report.
 *
 * POST `{ project_id, grant_id, confirm? }`
 *   auth → rate-limit → gate → (preview | generate) → spend → insert.
 *   The spend runs BEFORE the insert (review 2026-09-10 #3): a spend that
 *   loses the race (`ok:false`) returns 402 and stores nothing, so the editor
 *   can never open a draft that was not paid for. An insert failure after a
 *   successful spend refunds the credits (`grantCredits`).
 *   Gate:
 *     • `can(user, "grant_finder")` is required (Starter+, Startup Package,
 *       evaluator rungs) → 403 `plan_required` otherwise (free founders see
 *       the locked copy in the UI and never reach here).
 *     • Growth extras (`hasGrowthExtras`: founder tier ≥ Growth or an
 *       active Startup Package grant) → unlimited, cost 0.
 *     • Otherwise (Starter) → `FEATURE_COSTS.grant_application_draft`
 *       (2 credits). Transparent-pricing rule: `confirm !== true` returns
 *       200 `{ preview: true, cost, balance, prompts }` and spends nothing;
 *       the editor shows that cost on the button before the confirmed call.
 *   Generation reuses the accelerator-drafter pattern through ai-client with
 *   the SVI analysis + data-room evidence as context. Never blank: an AI
 *   failure still stores the prompts with empty answers (200, `ai_ok: false`)
 *   and is NOT charged.
 *
 * PATCH `{ id, answers?, status? }` — owner update from the editor.
 *
 *   200 { ok, draft, prompts, cost, creditsCharged, ai_ok }
 *   400 bad body   401 unauthorized   402 insufficient_credits
 *   403 plan_required | project_not_found_or_forbidden   404 grant_not_found
 *   429 rate_limited   503 service_unavailable
 */

import { NextResponse } from "next/server";
import { isGrantId, isUuid, readJsonBody } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { canAfford, grantCredits, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { can } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectById } from "@/lib/projects";
import { getGrant } from "@/lib/funding/data";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";
import { promptsForGrant, emptyAnswers } from "@/lib/funding/application-prompts";
import { gatherDraftContext, insertGrantDraft, updateGrantDraft } from "@/lib/funding/application-drafts";
import { draftGrantApplication } from "@/lib/agents/grant-application-drafter";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FEATURE_KEY = "grant_application_draft";
const RATE_LIMIT_PER_HOUR = 20;
const PATCH_RATE_PER_MIN = 60;
const POST_BODY_MAX_BYTES = 16 * 1024;
export const ANSWER_MAX_KEYS = 50;
export const ANSWER_KEY_MAX_LEN = 64;
export const ANSWER_MAX_LEN = 20_000;
// 50 answers × 20 000 chars (multi-byte) + envelope.
const PATCH_BODY_MAX_BYTES = 4 * 1024 * 1024;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("funding-draft", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, POST_BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body", field: "grant_id" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const grantId = str(body.grant_id ?? body.grantId);
  if (!grantId) return NextResponse.json({ ok: false, error: "grant_id is required", field: "grant_id" }, { status: 400 });
  // S8-C: catalogue ids are lower-case slugs — anything else is a 400, not a DB round-trip.
  if (!isGrantId(grantId)) return NextResponse.json({ ok: false, error: "invalid_grant_id", field: "grant_id" }, { status: 400 });
  const projectId = str(body.project_id ?? body.projectId);
  if (projectId && !isUuid(projectId)) {
    return NextResponse.json({ ok: false, error: "invalid_project_id", field: "project_id" }, { status: 400 });
  }
  const confirmed = body.confirm === true;

  let project = null;
  if (projectId) {
    project = await getProjectById(projectId);
    if (!project || project.userId !== user.id) {
      return NextResponse.json({ ok: false, error: "project_not_found_or_forbidden" }, { status: 403 });
    }
  }

  const grant = await getGrant(grantId);
  if (!grant || grant.exclude_from_matching) return NextResponse.json({ ok: false, error: "grant_not_found" }, { status: 404 });
  const prompts = promptsForGrant(grant);

  // Gate → cost.
  const uwp = { id: user.id, plan: user.plan ?? "free", segment: "founder" };
  const included = await can(uwp, "grant_finder");
  if (!included) {
    return NextResponse.json({ ok: false, error: "plan_required", feature: "grant_finder" }, { status: 403 });
  }
  const unlimited = await hasGrowthExtras({ id: user.id, plan: user.plan });
  let cost = 0;
  let balance: number | null = null;
  if (!unlimited) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    cost = FEATURE_COSTS[FEATURE_KEY] ?? afford.cost;
    balance = afford.balance;
    if (!afford.allowed) {
      return NextResponse.json(
        { ok: false, error: "insufficient_credits", creditsRequired: cost, balance: afford.balance, reason: afford.reason ?? "insufficient_credits" },
        { status: 402 },
      );
    }
    if (!confirmed) {
      // Transparent pricing: show the price, spend nothing.
      return NextResponse.json({ ok: true, preview: true, cost, balance, prompts, grant: { id: grant.id, name: grant.name } });
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  // Generate — never throws; failures come back as empty answers.
  const ctx = await gatherDraftContext({ id: user.id, email: user.email ?? null }, project, grant.id, { db: supabase });
  let result;
  try {
    result = await draftGrantApplication(
      {
        id: grant.id,
        name: grant.name,
        provider: grant.provider,
        summary: grant.summary,
        amount_note: grant.amount_note,
        co_contribution: grant.co_contribution,
        official_url: grant.official_url,
      },
      prompts,
      ctx,
    );
  } catch (err) {
    console.error("[funding:draft] drafter threw", err instanceof Error ? err.message : String(err));
    result = { answers: emptyAnswers(prompts), ai_ok: false, failed: prompts.map((p) => p.id), provider: null, model: null };
  }

  const charge = result.ai_ok ? cost : 0; // a failed draft is never charged

  // Spend FIRST (atomic RPC in credits.ts), insert only once the credits are
  // ours — a lost race leaves nothing behind for the editor to load (#3).
  let creditsCharged = 0;
  if (charge > 0) {
    const spent = await spendCredits(user.id, FEATURE_KEY, { project_id: project?.id ?? null, grant_id: grant.id });
    if (!spent.ok) {
      return NextResponse.json(
        { ok: false, error: "credit_spend_failed", creditsRequired: charge, credits_needed: charge, balance: spent.balance },
        { status: 402 },
      );
    }
    creditsCharged = charge;
    balance = spent.balance;
  }

  const draft = await insertGrantDraft(
    {
      user_id: user.id,
      project_id: project?.id ?? null,
      grant_id: grant.id,
      answers: result.answers,
      prompts,
      credits_cost: charge,
      status: "draft",
      meta: { ai_ok: result.ai_ok, failed: result.failed, provider: result.provider, model: result.model, unlimited, evidence: ctx.evidence.length },
    },
    { db: supabase },
  );
  if (!draft) {
    if (creditsCharged > 0) {
      // Compensate: the founder paid for a row that does not exist.
      const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: FEATURE_KEY, grant_id: grant.id, reason: "draft_insert_failed" });
      if (refund.ok) balance = refund.balance;
      else console.error("[funding:draft] refund after insert failure did not land", { user: user.id, grant: grant.id });
    }
    return NextResponse.json({ ok: false, error: "draft_insert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    draft,
    prompts,
    cost,
    creditsCharged,
    balance,
    ai_ok: result.ai_ok,
    failed: result.failed,
    grant: { id: grant.id, name: grant.name, official_url: grant.official_url },
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Editor autosave — generous, but bounded (S8-C).
  const limited = enforceRateLimit("funding-draft-patch", user.id, request, PATCH_RATE_PER_MIN, 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, PATCH_BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body", field: "id" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const id = str(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "id is required", field: "id" }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "draft_not_found" }, { status: 404 });

  const patch: { answers?: Record<string, string>; status?: "draft" | "final" } = {};
  if (body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
    const answers: Record<string, string> = {};
    let n = 0;
    for (const [k, v] of Object.entries(body.answers as Record<string, unknown>)) {
      // Prompt ids are short slugs; cap the key set so the jsonb column cannot
      // be turned into an arbitrary-size document (S8-C).
      if (typeof v !== "string" || k.length > ANSWER_KEY_MAX_LEN) continue;
      if (++n > ANSWER_MAX_KEYS) break;
      answers[k] = v.slice(0, ANSWER_MAX_LEN);
    }
    patch.answers = answers;
  }
  if (body.status === "draft" || body.status === "final") patch.status = body.status;
  if (!patch.answers && !patch.status) {
    return NextResponse.json({ ok: false, error: "nothing to update", field: "answers" }, { status: 400 });
  }

  const draft = await updateGrantDraft(id, user.id, patch);
  if (!draft) return NextResponse.json({ ok: false, error: "draft_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, draft });
}
