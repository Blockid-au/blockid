// /api/evaluations/[id] — one evaluation the caller holds (T0270).
//
//   PATCH  { label?, notes? } → { ok, evaluation }
//   DELETE                    → { ok } — soft: the evaluations row goes, the
//                               projects row (and its reports) stays.
//
// Ownership is enforced inside lib/evaluations.ts: every write is filtered
// by `evaluator_user_id = user.id`, so a foreign id simply reads as 404.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteEvaluation, getEvaluationForUser, updateEvaluation } from "@/lib/evaluations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;

  let body: { label?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as { label?: unknown; notes?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const patch: { label?: string | null; notes?: string | null } = {};
  if ("label" in body) {
    if (body.label !== null && typeof body.label !== "string") {
      return NextResponse.json({ ok: false, error: "invalid_label" }, { status: 400 });
    }
    patch.label = body.label as string | null;
  }
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ ok: false, error: "invalid_notes" }, { status: 400 });
    }
    patch.notes = body.notes as string | null;
  }

  const existing = await getEvaluationForUser(user.id, id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const evaluation = await updateEvaluation(user.id, id, patch);
  if (!evaluation) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, evaluation });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;

  const removed = await deleteEvaluation(user.id, id);
  if (!removed) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: id, project_kept: true });
}
