// Signed handoff token for Startup Value Index (startupvalueindex.com).
// See app/api/auth/svi-handoff/route.ts for the flow; kept here because a
// route module may only export handlers.
import { createHmac, randomBytes } from "node:crypto";

export const SVI_ORIGIN = "https://startupvalueindex.com";
export const SVI_HANDOFF_TTL_S = 5 * 60;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

/** base64url(JSON{uid, exp, n}) + "." + base64url(HMAC-SHA256(secret, payload)). */
export function mintHandoffToken(uid: string, secret: string, now = Date.now()): string {
  const payload = b64url(
    JSON.stringify({ uid, exp: Math.floor(now / 1000) + SVI_HANDOFF_TTL_S, n: randomBytes(8).toString("hex") }),
  );
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Only an https URL on the SVI origin may receive the token. */
export function safeReturnUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.origin !== SVI_ORIGIN) return null;
    u.searchParams.delete("svi_token");
    return u;
  } catch {
    return null;
  }
}
