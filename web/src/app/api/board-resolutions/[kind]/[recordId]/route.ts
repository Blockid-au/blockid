/**
 * /api/board-resolutions/[kind]/[recordId] — generate a board resolution (S26-B).
 *
 * POST `{ confirm?: boolean, regenerate?: boolean }`
 *   Generates the AU circulating resolution of the directors for the
 *   referenced record of the caller's active project:
 *     share-issue  → share_transactions (issue) id
 *     dividend     → dividend_records id
 *     esop         → esop_pool id
 *   Same rails as the dividend statements (S25-B): auth → rate-limit →
 *   scope (editor+) → record → (preview | generate) → spend.
 *   Gate / cost:
 *     • owner OR an accepted editor/admin member (`getProjectScope("editor")`);
 *     • equity add-on (`esop.manage`) or Growth+ / Startup Package →
 *       included, cost 0 (`statementsIncluded` — the same gate);
 *     • otherwise `FEATURE_COSTS.board_resolution` (1 credit), charged to
 *       the CALLER. `confirm !== true` returns 200 `{ preview: true, cost,
 *       balance, included, company, directors, record }` and spends nothing.
 *   Idempotent per (project, kind, record): an existing CURRENT resolution
 *   is returned (`existing: true`) and nothing is charged — the PDF is a
 *   free re-download. Spend runs BEFORE the insert; an insert failure refunds.
 *
 *   Regenerate (S27-A, review P2-7): `{ regenerate: true }` (editor+) when
 *   the source record changed after the resolution was generated (a
 *   resized ESOP pool, an edited dividend). The preview reports `stale`
 *   (stored hash ≠ hash of a fresh draft) and `nextVersion`; confirm
 *   charges like a first generation (unless included), marks the current
 *   row superseded and inserts version n+1 (migration 0361). The old
 *   version stays downloadable with a SUPERSEDED banner. A regenerate that
 *   finds nothing to supersede is simply a first generation.
 *
 *   200 { ok, preview: true, cost, listedCost, included, includedVia, balance, creditNote, company, directors, soleDirector, record, existing, stale, regenerate, nextVersion, versions }
 *   200 { ok, resolution, existing, superseded, cost, creditsCharged, balance, creditNote }
 *   400 bad kind  401  402 insufficient_credits | credit_spend_failed
 *   403/404 scope / record  409 supersede_conflict  429  500 insert_failed  503
 *
 * GET — the current resolution for the record (viewer+) or `resolution:
 *   null`, every `versions` (newest first) and `stale`.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isUuid, readJsonBody } from "@/lib/security/request-guards";
import { canAfford, grantCredits, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { statementsIncluded } from "@/lib/dividends/gate";
import { isResolutionKind } from "@/lib/board-resolutions/build";
import {
  buildResolution,
  issueResolution,
  listResolutionVersions,
  loadResolutionInputs,
  resolutionIsStale,
  resolutionRowSummary,
  resolutionVersion,
} from "@/lib/board-resolutions/server";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const FEATURE_KEY = "board_resolution";
const RATE_LIMIT_PER_HOUR = 60;
const BODY_MAX_BYTES = 4 * 1024;

type Params = { params: Promise<{ kind: string; recordId: string }> };

async function POST_handler(request: Request, { params }: Params) {
  const { kind, recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isResolutionKind(kind)) return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  if (!isUuid(recordId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const limited = enforceRateLimit("board-resolutions", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const confirmed = body.confirm === true;
  const regenerate = body.regenerate === true;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });
  const creditNote = creditChargeNote(scope);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const inputs = await loadResolutionInputs(supabase, kind, recordId, recordScope);
  if (!inputs) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Already generated → free re-download, nothing to charge — unless the caller asked to regenerate.
  const versions = await listResolutionVersions(supabase, kind, recordId, scope.projectId);
  const existing = versions.find((v) => !v.superseded_at) ?? null;
  const draft = buildResolution(inputs.record, inputs.company, inputs.directors);
  const stale = existing ? resolutionIsStale(existing, draft) : false;
  const supersedes = regenerate ? existing : null;
  const gate = await statementsIncluded({ id: user.id, plan: user.plan });
  const listedCost = FEATURE_COSTS[FEATURE_KEY] ?? 1;
  let cost = 0;
  let balance: number | null = null;
  if ((!existing || regenerate) && !gate.included) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    cost = listedCost;
    balance = afford.balance;
    if (!afford.allowed) {
      return NextResponse.json({ ok: false, error: "insufficient_credits", creditsRequired: cost, balance: afford.balance, reason: afford.reason ?? "insufficient_credits", creditNote }, { status: 402 });
    }
  }

  if (!confirmed) {
    return NextResponse.json({
      ok: true,
      preview: true,
      cost,
      listedCost,
      included: gate.included,
      includedVia: gate.via,
      balance,
      creditNote,
      company: inputs.company,
      directors: inputs.directors,
      soleDirector: draft.soleDirector,
      title: draft.title,
      facts: draft.facts,
      record: inputs.record,
      existing: existing ? resolutionRowSummary(existing) : null,
      stale,
      regenerate,
      nextVersion: existing ? resolutionVersion(existing) + 1 : 1,
      versions: versions.map(resolutionRowSummary),
    });
  }

  if (existing && !regenerate) {
    return NextResponse.json({ ok: true, resolution: resolutionRowSummary(existing), existing: true, superseded: null, cost: 0, creditsCharged: 0, balance, creditNote, stale });
  }

  let creditsCharged = 0;
  if (cost > 0) {
    const spent = await spendCredits(user.id, FEATURE_KEY, { project_id: scope.projectId, kind, record_id: recordId });
    if (!spent.ok) return NextResponse.json({ ok: false, error: "credit_spend_failed", creditsRequired: cost, balance: spent.balance, creditNote }, { status: 402 });
    creditsCharged = cost;
    balance = spent.balance;
  }

  const result = await issueResolution({ db: supabase, projectId: scope.projectId, userId: user.id, kind, recordId, payload: draft, creditsCharged, supersedes });
  if (!result.ok) {
    if (creditsCharged > 0) {
      const reason = result.error === "supersede_conflict" ? "resolution_supersede_conflict" : "resolution_insert_failed";
      const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: FEATURE_KEY, project_id: scope.projectId, reason });
      if (refund.ok) balance = refund.balance;
      else console.error("[board-resolutions] refund after failed generation did not land", { user: user.id, project: scope.projectId, reason });
    }
    if (result.error === "supersede_conflict") {
      return NextResponse.json({ ok: false, error: "supersede_conflict", message: "This resolution was regenerated by someone else a moment ago — reload to see the current version." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "insert_failed", retryCost: cost }, { status: 500 });
  }
  if (result.existing && creditsCharged > 0) {
    // A concurrent press won the unique index — the row is already paid for; give this charge back.
    const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: FEATURE_KEY, project_id: scope.projectId, reason: "resolution_already_generated" });
    if (refund.ok) balance = refund.balance;
    creditsCharged = 0;
  }

  return NextResponse.json({
    ok: true,
    resolution: resolutionRowSummary(result.row),
    existing: result.existing,
    superseded: result.superseded ? resolutionRowSummary(result.superseded) : null,
    cost,
    creditsCharged,
    balance,
    creditNote,
  });
}

export async function GET(_request: Request, { params }: Params) {
  const { kind, recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isResolutionKind(kind)) return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  if (!isUuid(recordId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const versions = await listResolutionVersions(supabase, kind, recordId, scope.projectId);
  const row = versions.find((v) => !v.superseded_at) ?? null;
  // `stale` compares the stored hash with a fresh draft — read-only, so a viewer may see it.
  let stale = false;
  if (row) {
    const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
    const inputs = await loadResolutionInputs(supabase, kind, recordId, recordScope);
    if (inputs) stale = resolutionIsStale(row, buildResolution(inputs.record, inputs.company, inputs.directors));
  }
  return NextResponse.json({ ok: true, role: scope.role, resolution: row ? resolutionRowSummary(row) : null, versions: versions.map(resolutionRowSummary), stale });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/board-resolutions/[kind]/[recordId]/route.ts", method: "POST" }, POST_handler);
