import { getSupabaseAdmin } from "@/lib/supabase";
import { ACCOUNT_STATUS_PATH, accountRowActive, accountStatusMac, readAccountStatusBody, RESPONSE_DOMAIN, verifyAccountStatusRequest } from "@/lib/security/svi-account-status";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "content-type": "application/json", "cache-control": "private, no-store" };
const failure = (status: number) => new Response(JSON.stringify({ error: status === 401 ? "authentication_required" : "account_status_unavailable" }), { status, headers });
/** Read-only authority assertion; never a wallet, research or billing grant. */
export async function POST(req: Request) {
  const key = process.env.SVI_HANDOFF_SECRET?.trim();
  if (!key || key.length < 32) return failure(503);
  let request;
  try {
    if (req.method !== "POST" || new URL(req.url).pathname !== ACCOUNT_STATUS_PATH || new URL(req.url).search || req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return failure(401);
    request = verifyAccountStatusRequest(await readAccountStatusBody(req), req.headers.get("x-svi-signature"), key, Math.floor(Date.now() / 1000));
  } catch { return failure(401); }
  if (!request) return failure(401);
  try {
    const db = getSupabaseAdmin();
    if (!db) return failure(503);
    const { data, error } = await db.from("app_users").select("id, deleted_at, erased_at").eq("id", request.uid).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if (error) return failure(503);
    // Missing columns/invalid data are authority failures, not an active fallback.
    if (data && (data.id !== request.uid || !Object.hasOwn(data, "deleted_at") || !Object.hasOwn(data, "erased_at"))) return failure(503);
    const raw = JSON.stringify({ v: 1, uid: request.uid, nonce: request.nonce, active: accountRowActive(data, request.uid), observedAt: Math.floor(Date.now() / 1000) });
    return new Response(raw, { status: 200, headers: { ...headers, "x-svi-response-signature": accountStatusMac(key, RESPONSE_DOMAIN, raw) } });
  } catch { return failure(503); }
}
