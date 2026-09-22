import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { readAccountStatusBody } from "@/lib/security/svi-account-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const VERSION = "personal-reanalysis-wallet-v1";
const uuid = z.string().uuid();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const termsSchema = z.object({
  version: z.literal(VERSION), actorId: uuid, reportId: uuid, site: z.literal("blockid.au"), walletId: uuid, accountId: uuid,
  businessId: z.string().min(1).max(200), revision: z.string().min(1).max(200), inputSha256: sha, rawSha256: sha,
  grantDurationDays: z.literal(7), chargeRule: z.literal("separate_quote_approval_required"), scoreRule: z.literal("may_decrease_or_remain_unchanged"),
}).strict();
const previewSchema = z.object({ version: z.literal(VERSION), displayedTermsSha256: sha, terms: termsSchema }).strict();
const connectionSchema = z.object({
  associationId: uuid, grantId: uuid, walletId: uuid, accountId: uuid, businessId: z.string().min(1).max(200),
  revision: z.string().min(1).max(200), inputSha256: sha, rawSha256: sha, expiresAt: z.string().datetime({ offset: true }),
});
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Cookie" } });
const failure = (status: number) => response({ ok: false, error: status === 404 ? "not_found" : status === 409 ? "displayed_terms_changed" : status === 403 ? "invalid_origin" : status === 400 ? "invalid_request" : "research_access_unavailable" }, status);
type Context = { params: Promise<{ id: string }> };
async function actor(context: Context) {
  const id = (await context.params).id;
  if (!uuid.safeParse(id).success) return null;
  const user = await getCurrentUser();
  return user && uuid.safeParse(user.id).success ? { id: id.toLowerCase(), userId: user.id.toLowerCase() } : null;
}
async function call(name: string, args: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  if (!db) throw Error("authority_unavailable");
  const { data, error } = await db.rpc(name, args).abortSignal(AbortSignal.timeout(3000));
  if (error) throw Error(["authority_forbidden", "authority_snapshot_changed"].includes(error.message) ? error.message : "authority_unavailable");
  return data;
}
const failed = (error: unknown) => failure(error instanceof Error && error.message === "authority_forbidden" ? 404 : error instanceof Error && error.message === "authority_snapshot_changed" ? 409 : 503);

/** No wallet, connection, quote or charge is created by viewing these terms. */
export async function GET(_request: Request, context: Context) {
  try {
    const who = await actor(context); if (!who) return failure(404);
    const value = previewSchema.parse(await call("preview_owned_analysis_wallet", { p_actor: who.userId, p_analysis: who.id }));
    if (value.terms.actorId !== who.userId || value.terms.accountId !== who.userId || value.terms.reportId !== who.id) return failure(503);
    return response({ ok: true, ...value, researchExecutionAvailable: false, chargesCredits: false });
  } catch (error) { return failed(error); }
}
async function POST_handler(request: Request, context: Context) {
  if (request.headers.get("origin") !== "https://blockid.au") return failure(403);
  try {
    const who = await actor(context); if (!who) return failure(404);
    let body;
    try { body = z.object({ version: z.literal(VERSION), decision: z.literal("connect"), displayedTermsSha256: sha }).strict().parse(JSON.parse(await readAccountStatusBody(request))); }
    catch { return failure(400); }
    const value = connectionSchema.parse(await call("connect_owned_analysis_wallet", { p_actor: who.userId, p_analysis: who.id, p_explicit_acceptance: true, p_expected_terms_sha256: body.displayedTermsSha256 }));
    if (value.accountId !== who.userId) return failure(503);
    return response({ ok: true, connection: value, researchExecutionAvailable: false, chargesCredits: false });
  } catch (error) { return failed(error); }
}
async function DELETE_handler(request: Request, context: Context) {
  if (request.headers.get("origin") !== "https://blockid.au") return failure(403);
  try {
    const who = await actor(context); if (!who) return failure(404);
    let body;
    try { body = z.object({ version: z.literal(VERSION), decision: z.literal("revoke"), grantId: uuid }).strict().parse(JSON.parse(await readAccountStatusBody(request))); }
    catch { return failure(400); }
    const changed = z.boolean().parse(await call("revoke_owned_analysis_wallet", { p_actor: who.userId, p_analysis: who.id, p_grant: body.grantId }));
    return response({ ok: true, revoked: true, changed, grantId: body.grantId, chargesCredits: false });
  } catch (error) { return failed(error); }
}
export const POST = apiRoute({ route: "api/analyses/[id]/research-access/route.ts", method: "POST" }, POST_handler);
export const DELETE = apiRoute({ route: "api/analyses/[id]/research-access/route.ts", method: "DELETE" }, DELETE_handler);
