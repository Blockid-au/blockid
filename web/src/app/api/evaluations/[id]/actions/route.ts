// POST /api/evaluations/[id]/actions — Investor Dossier block 6 + block 3
// actions (G13-W5-D3, S-D3; BA spec §A.3 blocks 3 and 6, §A.5 E3.4 / E3.6).
//
//   { action: "watchlist" }                       → { ok, added, ticker }
//   { action: "portfolio", valuation_aud?, ownership_pct?, invested_at?, notes? }
//                                                → { ok, id, created }
//   { action: "intro" }                           → { ok, channel: "mailto", href }
//                                                | { ok, channel: "crm", contact_id, created, notified }
//   { action: "request_access" }                  → { ok, mode: "invite", claim_url }
//                                                | { ok, mode: "notified", requested, notified }
//
//   401 auth_required · 404 not_found for an unknown id, a founder caller or
//   a lapsed seat (never 403) · 400 invalid body · 409 for "already at
//   full_mentor" / "no founder email" · 422 consent_too_low · 429 over
//   30/min · 503 DB. Every action is HMAC-audited by the lib (§C.2).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { resolveAssessmentAccess } from "@/lib/evaluations/assessment-access";
import { claimUrlForToken } from "@/lib/evaluations";
import { addProjectToWatchlist, markInvested, requestAccess, requestIntro } from "@/lib/investor/actions";
import { resolveActingOrg } from "@/lib/investor/organisations";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const ACTIONS_PER_MINUTE = 30;

export const dossierActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("watchlist") }).strict(),
  z
    .object({
      action: z.literal("portfolio"),
      valuation_aud: z.number().nonnegative().max(1e12).nullable().optional(),
      ownership_pct: z.number().min(0).max(100).nullable().optional(),
      invested_at: z.string().datetime({ offset: true }).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    })
    .strict(),
  z.object({ action: z.literal("intro") }).strict(),
  z.object({ action: z.literal("request_access") }).strict(),
]);

const notFound = () => NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: PRIVATE_JSON_HEADERS });
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

async function POST_handler(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const access = await resolveAssessmentAccess(id, user);
  if (!access || access.role !== "assessor") return notFound();

  const limited = enforceRateLimit("dossier-actions", user.id, request, ACTIONS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;
  const parsed = dossierActionSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  const input = parsed.data;
  const { evaluation, project } = access;

  if (input.action === "watchlist") {
    const r = await addProjectToWatchlist({ userId: user.id, projectId: project.id, projectSlug: project.slug || null, evaluationId: evaluation.id });
    if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.error === "unavailable" ? 503 : 500);
    return json({ ok: true, added: r.added, ticker: r.ticker });
  }

  if (input.action === "portfolio") {
    const r = await markInvested({
      userId: user.id,
      projectId: project.id,
      projectName: project.name,
      evaluationId: evaluation.id,
      valuationAud: input.valuation_aud ?? null,
      ownershipPct: input.ownership_pct ?? null,
      investedAt: input.invested_at ?? null,
      notes: input.notes ?? null,
    });
    if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.error === "unavailable" ? 503 : r.error === "invalid_input" ? 400 : 500);
    return json({ ok: true, id: r.id, created: r.created });
  }

  if (input.action === "intro") {
    const org = await resolveActingOrg(user.id).catch(() => null);
    const r = await requestIntro({
      investor: { id: user.id, email: user.email, displayName: user.displayName ?? null, plan: user.plan ?? null, orgName: org && !org.is_personal ? org.name : (org?.name ?? null) },
      evaluation,
      startupName: project.name,
    });
    if (!r.ok) return json({ ok: false, error: r.error, message: r.message, href: r.href ?? null }, r.error === "consent_too_low" ? 422 : r.error === "no_founder" ? 409 : r.error === "unavailable" ? 503 : 500);
    return r.channel === "mailto" ? json({ ok: true, channel: "mailto", href: r.href }) : json({ ok: true, channel: "crm", contact_id: r.contactId, created: r.created, notified: r.notified });
  }

  // request_access
  const r = await requestAccess({
    investor: { id: user.id, email: user.email, displayName: user.displayName ?? null },
    evaluation,
    startupName: project.name,
    claimUrl: evaluation.inviteToken ? claimUrlForToken(evaluation.inviteToken) : null,
  });
  if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.error === "unavailable" ? 503 : 409);
  return r.mode === "invite" ? json({ ok: true, mode: "invite", claim_url: r.claimUrl }) : json({ ok: true, mode: "notified", requested: r.requested, notified: r.notified });
}

export const POST = apiRoute({ route: "api/evaluations/[id]/actions/route.ts", method: "POST" }, POST_handler);
