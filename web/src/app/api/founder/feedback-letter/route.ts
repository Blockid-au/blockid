// GET /api/founder/feedback-letter — the founder's latest "What investors
// said" letter (G14-S34).
//
//   200 { ok, letter: { id, k, org_count, window_start, window_end,
//                        aggregate, letter_md, letter_md_vi, next_actions,
//                        status, sent_at, opened_at, created_at } }
//   404 { ok:false, error:"not_found" }   no letter for this founder (also
//                                        while migration 0404 is missing —
//                                        the store answers null)
//   401                                  anonymous
//
// Founder-only by construction: the row is looked up by
// `founder_user_id = caller`, so an evaluator, a member or a stranger gets
// 404, never someone else's letter. The FIRST read stamps `opened_at` +
// `status = 'opened'` and emits the server event `feedback_letter_opened`
// once (the store's conditional update decides "first"); the landing block's
// client tracker calls this on mount, the email deep-links to the block.
//
// The response is the stored aggregate — already walked against
// FOUNDER_FORBIDDEN_FIELDS when it was built; the route re-checks so a
// hand-edited row can never leak through.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PRIVATE_JSON_HEADERS } from "@/lib/security/request-guards";
import { emitEventSafe } from "@/lib/analytics/server";
import { findForbiddenKey } from "@/lib/evaluations/feedback-letter-shared";
import { latestLetterForFounder, markLetterOpened, type FeedbackLetterRow } from "@/lib/evaluations/feedback-letter-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function serialiseLetter(l: FeedbackLetterRow, opened: boolean) {
  return {
    id: l.id,
    k: l.k,
    org_count: l.orgCount,
    window_start: l.windowStart,
    window_end: l.windowEnd,
    aggregate: l.aggregate,
    letter_md: l.letterMd,
    letter_md_vi: l.letterMdVi,
    next_actions: l.nextActions,
    status: opened ? "opened" : l.status,
    sent_at: l.sentAt,
    opened_at: opened ? new Date().toISOString() : l.openedAt,
    created_at: l.createdAt,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });

  const letter = await latestLetterForFounder(user.id);
  if (!letter) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_JSON_HEADERS });

  // Defence in depth — a stored row must never carry a forbidden key.
  const leak = findForbiddenKey({ aggregate: letter.aggregate, next_actions: letter.nextActions });
  if (leak) {
    console.error("[blockid:feedback-letter] forbidden key in stored letter", { letter_id: letter.id, leak });
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_JSON_HEADERS });
  }

  const firstOpen = !letter.openedAt && (await markLetterOpened(letter.id, user.id));
  if (firstOpen) {
    emitEventSafe({
      name: "feedback_letter_opened",
      params: { letter_id: letter.id, k: letter.k, weakest_dim: letter.aggregate.weakestDim ?? "none", user_id: user.id },
      userId: user.id,
      source: "api:founder/feedback-letter",
    });
  }
  return NextResponse.json({ ok: true, letter: serialiseLetter(letter, firstOpen) }, { headers: PRIVATE_JSON_HEADERS });
}
