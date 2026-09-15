// Signed download links for the first-analysis PDF (S32-B).
//
// The email carries the PDF as an attachment when it fits (≤ 8 MB); above
// that — or as the "open it in the browser" fallback — it links to
// `/api/analyses/[id]/report.pdf?token=…`. The token is an HMAC over
// `analysisId.expiry` so the link works from a mail client with no cookie
// and no session, but only for that one analysis and only until it expires.
//
// Pure `node:crypto`, no `server-only` (the route test signs and verifies
// without a Next runtime). The key is a stable server secret; with none
// configured no link is minted — the email still carries the attachment.

import { createHmac, timingSafeEqual } from "node:crypto";

export const DOWNLOAD_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function downloadTokenSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env.REPORT_LINK_SECRET || env.OAUTH_TOKEN_ENCRYPTION_KEY || env.CRON_SECRET;
  return typeof v === "string" && v.trim().length >= 16 ? v.trim() : null;
}

function sign(secret: string, id: string, exp: number): string {
  return createHmac("sha256", secret).update(`${id}.${exp}`, "utf8").digest("base64url");
}

/** `exp.sig` — or null when no secret is configured. */
export function mintDownloadToken(
  analysisId: string,
  opts: { now?: number; ttlMs?: number; secret?: string | null } = {},
): string | null {
  const secret = opts.secret === undefined ? downloadTokenSecret() : opts.secret;
  if (!secret) return null;
  const exp = (opts.now ?? Date.now()) + (opts.ttlMs ?? DOWNLOAD_TOKEN_TTL_MS);
  return `${exp}.${sign(secret, analysisId, exp)}`;
}

export type TokenVerdict = "ok" | "expired" | "malformed" | "mismatch" | "no_secret";

export function verifyDownloadToken(
  analysisId: string,
  token: string | null | undefined,
  opts: { now?: number; secret?: string | null } = {},
): TokenVerdict {
  const secret = opts.secret === undefined ? downloadTokenSecret() : opts.secret;
  if (!secret) return "no_secret";
  if (typeof token !== "string") return "malformed";
  const dot = token.indexOf(".");
  if (dot <= 0) return "malformed";
  const exp = Number.parseInt(token.slice(0, dot), 10);
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || !sig) return "malformed";
  const expected = sign(secret, analysisId, exp);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "mismatch";
  if ((opts.now ?? Date.now()) > exp) return "expired";
  return "ok";
}

export function downloadPath(analysisId: string, token: string | null): string {
  const base = `/api/analyses/${encodeURIComponent(analysisId)}/report.pdf`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
