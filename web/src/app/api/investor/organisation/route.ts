// /api/investor/organisation — seats (G13-W5-D3, S-D3; BA spec §A.5 E4.5 /
// F1–F4, §A.4 "Seats").
//
//   GET    → 200 { ok, available, org, is_owner, members[], invites[], seats:{limit, used, remaining} }
//   POST   { email, role? } → 201 { ok, invite, invite_url, email_sent, seats }
//          402 seat_limit { limit, used, upgrade_hint, upgrade_url } (F4 — no Stripe change)
//          409 already_member · 403 not_owner · 400 invalid_email
//   DELETE { member_id } | { invite_id } → 200 { ok }
//
// Gate: evaluator persona / investor.dealflow OR an existing seat (the
// invited seat may hold a founder plan — the owner's plan carries the
// entitlement, isEvaluatorUser covers it). Anonymous → 401; non-evaluator
// → 402 feature_locked like the rest of the evaluator surface.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isEvaluatorUser } from "@/lib/evaluations";
import { recordGateHit } from "@/lib/entitlements";
import { SEAT_ROLES, getTeam, inviteMember, leaveOrg, removeSeat } from "@/lib/investor/organisations";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const INVITES_PER_HOUR = 20;

export const inviteSchema = z.object({ email: z.string().min(3).max(254), role: z.enum(SEAT_ROLES).optional() }).strict();
export const removeSchema = z.union([
  z.object({ member_id: z.string().min(1).max(80) }).strict(),
  z.object({ invite_id: z.string().uuid() }).strict(),
  // Self-leave: a seat leaves an org it does not own (W5 review — there was no way out).
  z.object({ leave_org_id: z.string().uuid() }).strict(),
]);

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

async function gate() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  if (!(await isEvaluatorUser(user))) {
    await recordGateHit({ id: user.id, plan: user.plan ?? "", segment: "investor" }, "investor.dealflow", "api");
    return { user: null, response: json({ ok: false, error: "feature_locked", feature: "investor.dealflow", upgrade_url: "/pricing?segment=evaluator" }, 402) };
  }
  return { user, response: null };
}

function seatsOut(seats: { limit: number; used: number; remaining: number; unlimited: boolean }) {
  return { limit: seats.unlimited ? null : seats.limit, used: seats.used, remaining: seats.unlimited ? null : seats.remaining };
}

export async function GET() {
  const { user, response } = await gate();
  if (!user) return response;
  const team = await getTeam({ id: user.id, plan: user.plan ?? null });
  return json({
    ok: true,
    available: team.available,
    org: team.org ? { id: team.org.id, name: team.org.name, kind: team.org.kind, is_personal: team.org.is_personal } : null,
    is_owner: team.isOwner,
    members: team.members.map((m) => ({ id: m.id, user_id: m.userId, role: m.role, display_name: m.displayName, email: m.email, is_owner: m.isOwner, joined_at: m.joinedAt })),
    invites: team.invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expires_at: i.expiresAt, created_at: i.createdAt })),
    seats: seatsOut(team.seats),
  });
}

async function POST_handler(request: Request) {
  const { user, response } = await gate();
  if (!user) return response;
  const limited = enforceRateLimit("org-invite", user.id, request, INVITES_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = inviteSchema.safeParse(body.body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);

  const r = await inviteMember({ id: user.id, plan: user.plan ?? null, email: user.email, displayName: user.displayName ?? null }, parsed.data);
  if (!r.ok) {
    const status = r.error === "seat_limit" ? 402 : r.error === "not_owner" ? 403 : r.error === "already_member" ? 409 : r.error === "invalid_email" ? 400 : r.error === "unavailable" ? 503 : 500;
    return json({ ok: false, error: r.error, message: r.message, ...(r.error === "seat_limit" ? { limit: r.limit, used: r.used, upgrade_hint: r.upgradeHint, upgrade_url: "/pricing?segment=evaluator" } : {}) }, status);
  }
  return json(
    { ok: true, invite: { id: r.invite.id, email: r.invite.email, role: r.invite.role, expires_at: r.invite.expiresAt }, invite_url: r.inviteUrl, email_sent: r.emailSent, seats: seatsOut(r.seats) },
    201,
  );
}

async function DELETE_handler(request: Request) {
  const { user, response } = await gate();
  if (!user) return response;
  const body = await readJsonBody(request, 2 * 1024);
  if (!body.ok) return body.response;
  const parsed = removeSchema.safeParse(body.body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);
  if ("leave_org_id" in parsed.data) {
    const left = await leaveOrg(user.id, parsed.data.leave_org_id);
    if (!left.ok) return json({ ok: false, error: left.error, message: left.message }, left.error === "is_owner" ? 403 : left.error === "not_found" ? 404 : left.error === "unavailable" ? 503 : 500);
    return json({ ok: true, left: true });
  }
  const target = "member_id" in parsed.data ? { memberId: parsed.data.member_id } : { inviteId: parsed.data.invite_id };
  const r = await removeSeat({ id: user.id, plan: user.plan ?? null }, target);
  if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.error === "not_owner" ? 403 : r.error === "not_found" ? 404 : r.error === "unavailable" ? 503 : 500);
  return json({ ok: true });
}

export const POST = apiRoute({ route: "api/investor/organisation/route.ts", method: "POST" }, POST_handler);
export const DELETE = apiRoute({ route: "api/investor/organisation/route.ts", method: "DELETE" }, DELETE_handler);
