// G34-BT2 EM04 — Resend delivery webhook: hard bounce / complaint suppression.
//
// sendEmail tries Gmail SMTP first and falls back to Resend. Only the Resend
// leg reports bounces and complaints programmatically (Gmail SMTP bounces
// arrive as DSN mail in the relay mailbox — parsing those, or moving C-class
// to Resend, is plan EM04's second half and a founder decision). Resend signs
// webhooks with Svix: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}`
// keyed by the base64 part of `whsec_…`, sent as `v1,<base64>` entries in
// `svix-signature`. Events handled:
//   email.bounced    → hard bounce (unless the bounce type is Transient /
//                      Undetermined) → suppressRecipient(…, "hard_bounce")
//   email.complained → suppressRecipient(…, "complaint")
// Everything else is acknowledged and ignored.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { markSendStatusByProviderId, suppressRecipient, type SuppressionReason } from "./email-sends";

/** Svix replay window (their SDK default). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`, "utf8").digest();
  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try {
      given = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

export interface SuppressionAction {
  reason: SuppressionReason;
  recipients: string[];
  providerMessageId: string | null;
}

/** Pure: what (if anything) a Resend event asks us to suppress. */
export function suppressionForEvent(event: ResendEvent): SuppressionAction | null {
  const to = event.data?.to;
  const recipients = (Array.isArray(to) ? to : typeof to === "string" ? [to] : [])
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.includes("@"));
  if (recipients.length === 0) return null;
  const providerMessageId = event.data?.email_id ?? null;
  if (event.type === "email.complained") return { reason: "complaint", recipients, providerMessageId };
  if (event.type === "email.bounced") {
    const kind = (event.data?.bounce?.type ?? "").toLowerCase();
    if (kind === "transient" || kind === "undetermined") return null;
    return { reason: "hard_bounce", recipients, providerMessageId };
  }
  return null;
}

/** Apply a verified event. Returns what was done (for the response body). */
export async function handleResendEvent(event: ResendEvent): Promise<{ suppressed: number; reason: SuppressionReason | null }> {
  const action = suppressionForEvent(event);
  if (!action) return { suppressed: 0, reason: null };
  let suppressed = 0;
  for (const email of action.recipients) {
    if (await suppressRecipient(email, action.reason)) suppressed++;
  }
  if (action.providerMessageId) {
    await markSendStatusByProviderId(action.providerMessageId, action.reason === "complaint" ? "complained" : "bounced");
  }
  return { suppressed, reason: action.reason };
}
