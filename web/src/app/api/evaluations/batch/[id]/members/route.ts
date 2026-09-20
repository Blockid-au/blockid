// GET | POST | DELETE /api/evaluations/batch/[id]/members — reviewer seats
// on a BlockID Cohort (G21 P2-B; migration 0423 evaluation_batch_members).
//
//   GET    → 200 { ok, available, members[], role }                    (viewer+)
//   POST   { email, role: "reviewer"|"viewer"|"owner" }
//          → 201 { ok, member, email_sent, already }                   (owner)
//          404 unknown_email (+ hint: the person signs up first) ·
//          400 invalid_email / self · 503 before 0423
//   DELETE { user_id } → 200 { ok, removed }                          (owner)
//
// Non-member / unknown batch → 404; a reviewer or viewer calling POST /
// DELETE → 403. 429 over 20 invites per hour.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { BATCH_ROLES, addBatchMember, assertBatchRole, listBatchMembers, removeBatchMember } from "@/lib/evaluations/batch-members";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const INVITES_PER_HOUR = 20;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

export const memberInviteSchema = z.object({ email: z.string().min(3).max(254), role: z.enum(BATCH_ROLES).default("reviewer") }).strict();
export const memberRemoveSchema = z.object({ user_id: z.string().uuid() }).strict();

function deny(access: { error: "not_found" | "forbidden" | "unavailable" }) {
  if (access.error === "forbidden") return json({ ok: false, error: "forbidden", message: "Only the cohort owner can manage reviewers" }, 403);
  if (access.error === "unavailable") return json({ ok: false, error: "unavailable" }, 503);
  return json({ ok: false, error: "not_found" }, 404);
}

function siteBase(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://blockid.au";
  }
}

async function getHandler(_request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await assertBatchRole(id, user.id, "viewer");
  if (!access.ok) return deny(access);
  const { members, available } = await listBatchMembers(access.batch);
  return json({
    ok: true,
    available,
    role: access.role,
    members: members.map((m) => ({ user_id: m.userId, role: m.role, email: m.email, display_name: m.displayName, is_creator: m.isCreator, created_at: m.createdAt })),
  });
}

async function postHandler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await assertBatchRole(id, user.id, "owner");
  if (!access.ok) return deny(access);

  const limited = enforceRateLimit("batch-member-invite", user.id, request, INVITES_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = memberInviteSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }

  const r = await addBatchMember({ batch: access.batch, inviter: { id: user.id, email: user.email, displayName: user.displayName ?? null }, email: parsed.data.email, role: parsed.data.role, siteBase: siteBase(request) });
  if (!r.ok) {
    const status = r.error === "unknown_email" ? 404 : r.error === "unavailable" ? 503 : r.error === "db_error" ? 500 : 400;
    return json({ ok: false, error: r.error, message: r.message }, status);
  }
  return json({ ok: true, member: { user_id: r.member.userId, role: r.member.role, email: r.member.email, display_name: r.member.displayName, is_creator: false, created_at: r.member.createdAt }, email_sent: r.emailSent, already: r.already }, r.already ? 200 : 201);
}

async function deleteHandler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await assertBatchRole(id, user.id, "owner");
  if (!access.ok) return deny(access);

  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = memberRemoveSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  const r = await removeBatchMember({ batch: access.batch, actorId: user.id, userId: parsed.data.user_id });
  if (!r.ok) {
    const status = r.error === "unavailable" ? 503 : r.error === "db_error" ? 500 : 400;
    return json({ ok: false, error: r.error, message: r.message }, status);
  }
  return json({ ok: true, removed: r.removed });
}

export const GET = getHandler;
export const POST = apiRoute({ route: "api/evaluations/batch/[id]/members/route.ts", method: "POST" }, postHandler);
export const DELETE = apiRoute({ route: "api/evaluations/batch/[id]/members/route.ts", method: "DELETE" }, deleteHandler);
