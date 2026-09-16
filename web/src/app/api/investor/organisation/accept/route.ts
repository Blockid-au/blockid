// POST /api/investor/organisation/accept — a signed-in user accepts a seat
// invite (G13-W5-D3, S-D3; BA spec §A.5 E4.5). No evaluator gate: the
// invitee may still be a founder-plan account — accepting the seat is what
// makes them an evaluator (isEvaluatorUser → isOrgSeat).
//
//   { token } → 200 { ok, org:{id,name}, already_member }
//   401 auth_required · 400 invalid body · 404 not_found (unknown / revoked
//   token — never confirms existence) · 410 expired · 403 email_mismatch ·
//   429 over 20 / 10 min · 503 DB.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/investor/organisations";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const ACCEPTS_PER_10_MIN = 20;
const schema = z.object({ token: z.string().min(16).max(64) }).strict();
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  // The token is the credential — bound guesses per user (same as the claim route).
  const limited = enforceRateLimit("org-invite-accept", user.id, request, ACCEPTS_PER_10_MIN, 10 * 60 * 1000);
  if (limited) return limited;
  const body = await readJsonBody(request, 2 * 1024);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);
  const r = await acceptInvite({ id: user.id, email: user.email }, parsed.data.token);
  if (!r.ok) {
    const status = r.error === "not_found" ? 404 : r.error === "expired" ? 410 : r.error === "email_mismatch" ? 403 : r.error === "unavailable" ? 503 : 500;
    return json({ ok: false, error: r.error, message: r.message }, status);
  }
  return json({ ok: true, org: { id: r.org.id, name: r.org.name }, already_member: r.alreadyMember });
}

export const POST = apiRoute({ route: "api/investor/organisation/accept/route.ts", method: "POST" }, POST_handler);
