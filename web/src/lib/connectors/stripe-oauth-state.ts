import { randomBytes, timingSafeEqual } from "node:crypto";
import { sealToken, openToken, type SealEnv } from "@/lib/oauth-token-seal";

export const STRIPE_STATE_COOKIE = "blockid_stripe_state";
export const STRIPE_STATE_TTL_SECONDS = 600;
export interface StripeOAuthScope { userId: string; projectId: string | null; ownerUserId: string }

/** Only the random challenge leaves the site. Scope stays authenticated/encrypted. */
export function createStripeOAuthState(scope: StripeOAuthScope, now = Date.now(), env: SealEnv = process.env) {
  const state = randomBytes(24).toString("base64url");
  const cookie = sealToken(JSON.stringify({ version: 1, purpose: "stripe_oauth", state, ...scope, issuedAt: now }), env);
  // Never accept the dev/migration plaintext fallback for an authorization grant.
  if (!cookie?.startsWith("gcm:")) throw new Error("stripe_state_key_unavailable");
  return { state, cookie };
}

export function verifyStripeOAuthState(cookie: string | undefined, state: string | null, scope: StripeOAuthScope, now = Date.now(), env: SealEnv = process.env): boolean {
  if (!cookie?.startsWith("gcm:") || cookie.length > 4096 || !state || state.length !== 32) return false;
  try {
    const pieces = cookie.split(":");
    if (pieces.length !== 4 || pieces.slice(1).some(part => !part || Buffer.from(part, "base64").toString("base64") !== part)
      || Buffer.from(pieces[1], "base64").length !== 12 || Buffer.from(pieces[2], "base64").length !== 16) return false;
    const raw = openToken(cookie, env);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    return payload.version === 1 && payload.purpose === "stripe_oauth"
      && typeof payload.state === "string" && Buffer.byteLength(payload.state) === Buffer.byteLength(state)
      && timingSafeEqual(Buffer.from(payload.state), Buffer.from(state))
      && payload.userId === scope.userId && payload.projectId === scope.projectId && payload.ownerUserId === scope.ownerUserId
      && Number.isFinite(payload.issuedAt) && Number.isFinite(now)
      && payload.issuedAt <= now && now - payload.issuedAt < STRIPE_STATE_TTL_SECONDS * 1000;
  } catch { return false; }
}
