// POST /api/reports/cohort/feedback-letters — feedback letters to the
// NON-SELECTED applicants of one cohort (G21 P2-C, 2026-09-20; Selection tab).
//
//   body { batch: <id>, confirm?: boolean, project_ids?: string[] }
//
//   confirm absent / false → PREVIEW: per non-selected applicant (submitted
//   "pass", not shortlisted) the eligibility under the k ≥ 3 assessors from
//   ≥ 2 orgs floor, the subject and a letter excerpt. Nothing written,
//   nothing sent.
//   confirm: true → SEND for the eligible projects (optionally narrowed by
//   project_ids): founder_feedback_letters row, assessment rows stamped,
//   in-app notification, e-mail through sendFounderFeedbackLetter. The floor
//   is re-checked on send; a below-floor startup never gets a letter.
//
//   401 anonymous · 403 feature_locked · 400 bad body · 404 no role on the
//   batch (owner or reviewer — viewers preview only) · 200 { ok, mode,
//   previews | results }.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, recordGateHit } from "@/lib/entitlements";
import { canBatchScore, canExportLpReport } from "@/lib/evaluations/batch-shared";
import { defaultFeedbackBatchDeps, previewFeedbackLetters, sendFeedbackLetters, type FeedbackCandidate } from "@/lib/evaluations/feedback-letter-batch";
import { isNonSelected } from "@/lib/evaluations/program-journey";
import { loadCohortBundle } from "@/lib/evaluations/program-journey-data";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const bodySchema = z
  .object({
    batch: z.string().regex(/^[0-9a-f-]{36}$/i),
    confirm: z.boolean().optional(),
    project_ids: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).max(500).optional(),
  })
  .strict();

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const limited = enforceRateLimit("cohort-feedback-letters", user.id, request, 10, 60 * 60 * 1000);
  if (limited) return limited;

  const flags = await getEntitlements(user.plan ?? "", user.id);
  if (!canExportLpReport(flags) && !canBatchScore(flags)) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "lp_report", "api", "api/reports/cohort/feedback-letters");
    return NextResponse.json({ ok: false, error: "feature_locked", feature: "lp_report", upgrade_url: "/pricing?segment=evaluator" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_body", message: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const { batch: batchId, confirm, project_ids } = parsed.data;

  const bundle = await loadCohortBundle(user.id, batchId);
  if (!bundle) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (confirm && bundle.role === "viewer") return NextResponse.json({ ok: false, error: "forbidden", message: "Viewers can preview letters; the owner or a reviewer sends them." }, { status: 403 });

  const wanted = project_ids ? new Set(project_ids) : null;
  const candidates: FeedbackCandidate[] = bundle.startups
    .filter(isNonSelected)
    .filter((s) => !wanted || wanted.has(s.projectId))
    .map((s) => ({ projectId: s.projectId, evaluationId: s.evaluationId, name: s.name }));

  const deps = await defaultFeedbackBatchDeps();
  if (!confirm) {
    const previews = await previewFeedbackLetters(candidates, deps);
    return NextResponse.json({ ok: true, mode: "preview", batch: batchId, candidates: candidates.length, eligible: previews.filter((p) => p.reason === "eligible").length, previews });
  }
  const results = await sendFeedbackLetters(candidates, deps);
  return NextResponse.json({ ok: true, mode: "sent", batch: batchId, candidates: candidates.length, sent: results.filter((r) => r.outcome === "sent").length, results });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/reports/cohort/feedback-letters/route.ts", method: "POST" }, POST_handler);
