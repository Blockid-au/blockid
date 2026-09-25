// BlockID e-mail transport core (server-only) — G34-BT2 EM07.
//
// Split out of lib/email.ts so every sender — including lib/ops-alert-email.ts,
// which must not import lib/email.ts (→ lib/auth → next/headers would make
// public pages request-bound, see lib/security/public-cacheable-routes) — goes
// through ONE sendEmail: erased-recipient guard, `email_sends` log, the C-class
// gate (consent / suppression / frequency cap) and RFC 8058 List-Unsubscribe.
// lib/email.ts re-exports everything public here, so `@/lib/email` callers and
// their mocks are unchanged. Keep this module free of app imports beyond
// ./email-sends and ./email-preferences (both Supabase-only).
//
// Gmail SMTP via Nodemailer (admin@blockid.au relay) first, Resend fallback
// when RESEND_API_KEY is set; neither → { ok: false, reason: "not_configured" }.

import "server-only";
import nodemailer from "nodemailer";
import { ensureEmailPreferences, type EmailCategory } from "./email-preferences";
import {
  commercialSendGate,
  getSuppression,
  oneClickUnsubscribeUrl,
  recordEmailSend,
  toOneClickUnsubscribeUrl,
  type EmailClass,
} from "./email-sends";

const FROM_DEFAULT = "BlockID.au <info@blockid.au>";

function fromAddress(): string {
  return process.env.SMTP_FROM_EMAIL || FROM_DEFAULT;
}

/**
 * S26-A — a display name on the PLATFORM sender ("Jane Chen via BlockID.au
 * <info@blockid.au>"): the founder's name, never the founder's address, so
 * SPF / DKIM / DMARC stay ours. Quotes and angle brackets are stripped from
 * the name; an empty name leaves the configured sender untouched.
 */
export function withFromName(configured: string, name: string | null | undefined): string {
  const clean = (name ?? "").replace(/["<>\r\n]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return configured;
  const m = /<([^>]+)>/.exec(configured);
  const addr = (m ? m[1] : configured).trim();
  return `"${clean} via BlockID.au" <${addr}>`;
}

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });
}

export type SendResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "send_error"
        | "unsubscribed"
        | "erased_recipient"
        /** G34-BT2 EM04 — hard bounce (any class) or bounce/complaint (C-class). */
        | "suppressed"
        /** G34-BT2 EM05 — C-class to an address without marketing consent. */
        | "no_consent"
        /** G34-BT2 EM03 — C-class over the global cap, or the send log was unreadable (fail-closed). */
        | "frequency_capped";
      error?: unknown;
    };

/**
 * G33-T11: an erased account's address is rewritten to a tombstone
 * (`deleted+<hash>@erased.blockid.au`, lib/privacy/erasure-map.ts). 24/09 live
 * logs showed six mails sent to such addresses — nothing may be delivered to an
 * erased identity, whichever job still holds the row.
 */
export const ERASED_RECIPIENT_DOMAIN = "erased.blockid.au";
export function isErasedRecipient(to: string): boolean {
  const at = to.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = to.trim().toLowerCase().slice(at + 1).replace(/>$/, "");
  return domain === ERASED_RECIPIENT_DOMAIN || domain.endsWith(`.${ERASED_RECIPIENT_DOMAIN}`);
}

// ---------- Resend fallback ---------------------------------------------------

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
  /** Plain-text twin (multipart/alternative) — G14-S34 feedback letter. */
  text?: string;
  fromName?: string | null;
  /** G34-BT2 EM06 — List-Unsubscribe / List-Unsubscribe-Post, same as the SMTP path. */
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer | Uint8Array | string; contentType?: string; cid?: string }[];
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const from = withFromName(process.env.RESEND_FROM_EMAIL || fromAddress(), args.fromName);

  // Resend API accepts attachments as an array of { filename, content }
  // where content is base64-encoded string (or a remote URL via `path`).
  // See https://resend.com/docs/api-reference/emails/send-email.
  const resendAttachments = args.attachments?.map((a) => {
    let contentB64: string;
    if (typeof a.content === "string") {
      // Assume already base64 if it's plain ASCII / no whitespace, otherwise encode.
      contentB64 = /^[A-Za-z0-9+/=\r\n]+$/.test(a.content)
        ? a.content.replace(/\s+/g, "")
        : Buffer.from(a.content, "utf8").toString("base64");
    } else {
      contentB64 = Buffer.from(a.content).toString("base64");
    }
    return {
      filename: a.filename,
      content: contentB64,
      ...(a.contentType && { content_type: a.contentType }),
      // S-R4: inline image referenced as <img src="cid:…"> in the HTML.
      ...(a.cid && { content_id: a.cid }),
    };
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        ...(args.text && { text: args.text }),
        ...(args.headers && Object.keys(args.headers).length > 0 && { headers: args.headers }),
        ...(resendAttachments?.length && { attachments: resendAttachments }),
      }),
    });
    const data = await res.json() as { id?: string; message?: string };
    if (!res.ok) {
      console.error("[blockid:email] Resend API error", data);
      return { ok: false, reason: "send_error", error: data.message };
    }
    console.log("[blockid:email] sent via Resend", { to: args.to, id: data.id });
    return { ok: true, id: data.id ?? "" };
  } catch (error) {
    console.error("[blockid:email] Resend fetch failed", error);
    return { ok: false, reason: "send_error", error };
  }
}

// ---------- Core send function ------------------------------------------------

/**
 * G34-BT2 EM06 — the List-Unsubscribe headers for one send. C-class always
 * gets an RFC 8058 one-click pair pointing at `/api/unsubscribe?token=…`
 * (minted here when the caller passed none). A T-class send keeps the
 * header only when the caller supplied an unsubscribe URL; a token-bearing
 * page link is mapped onto the one-click API route, and a token-less link
 * (`?email=`) is advertised without the One-Click POST it cannot honour.
 */
async function unsubscribeHeaders(args: {
  to: string;
  unsubscribeUrl?: string;
  emailClass: EmailClass;
  category?: EmailCategory;
}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  let oneClick = args.unsubscribeUrl ? toOneClickUnsubscribeUrl(args.unsubscribeUrl) : null;
  if (!oneClick && args.emailClass === "C") {
    try {
      const token = await ensureEmailPreferences(args.to);
      if (token) oneClick = oneClickUnsubscribeUrl(token, args.category);
    } catch {
      /* fall through to the caller's link */
    }
  }
  if (oneClick) {
    headers["List-Unsubscribe"] = `<${oneClick}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  } else if (args.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${args.unsubscribeUrl}>`;
  }
  return headers;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text twin — sent as multipart/alternative by both providers (G14-S34). */
  text?: string;
  unsubscribeUrl?: string;
  /** S26-A — display name on the platform sender ("<name> via BlockID.au"); the address never changes. */
  fromName?: string | null;
  /** `cid` marks an inline image (referenced as `<img src="cid:<cid>">`) — S-R4 report visuals. */
  attachments?: { filename: string; content: Buffer | Uint8Array; contentType?: string; cid?: string }[];
  /**
   * G34-BT2 — "T" transactional (default) or "C" commercial. C-class passes
   * suppression + consent + the global frequency cap (fail-closed) and always
   * carries the RFC 8058 one-click List-Unsubscribe pair.
   */
  emailClass?: EmailClass;
  /** G34-BT2 EM02/EM03 — the sequence this send belongs to ("lead-nurture"); the per-flow 72 h cap keys on it. */
  flow?: string;
  /** G34-BT2 EM02 — the template / step ("lead_d1"). */
  template?: string;
  /** C-class: preference category the one-click unsubscribe is scoped to. */
  category?: EmailCategory;
}): Promise<SendResult> {
  if (isErasedRecipient(args.to)) {
    console.warn("[blockid:email] refused: recipient is an erased-account tombstone");
    return { ok: false, reason: "erased_recipient" };
  }
  const emailClass: EmailClass = args.emailClass ?? "T";
  const log = (status: Parameters<typeof recordEmailSend>[0]["status"], providerMessageId?: string | null) =>
    recordEmailSend({ to: args.to, flow: args.flow, emailClass, template: args.template, providerMessageId, status });

  // G34-BT2 EM03/EM04/EM05 — the commercial gate (fail-closed); transactional
  // mail is stopped only by a hard bounce (fail-open when unreadable).
  if (emailClass === "C") {
    const gate = await commercialSendGate(args.to, args.flow ?? "unspecified");
    if (!gate.ok) {
      await log(`blocked:${gate.reason}${gate.detail ? `:${gate.detail}` : ""}`);
      console.info("[blockid:email] commercial send skipped", { reason: gate.reason, flow: args.flow ?? null });
      return {
        ok: false,
        reason: gate.reason === "no_consent" ? "no_consent" : gate.reason === "frequency_capped" ? "frequency_capped" : "suppressed",
      };
    }
  } else {
    const sup = await getSuppression(args.to);
    if (sup.reason === "hard_bounce") {
      await log("blocked:suppressed:hard_bounce");
      return { ok: false, reason: "suppressed" };
    }
  }

  const headers = await unsubscribeHeaders({
    to: args.to,
    unsubscribeUrl: args.unsubscribeUrl,
    emailClass,
    category: args.category,
  });

  // Priority 1: SMTP (Nodemailer)
  const transporter = getTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: withFromName(fromAddress(), args.fromName),
        to: args.to,
        subject: args.subject,
        html: args.html,
        ...(args.text && { text: args.text }),
        headers,
        ...(args.attachments?.length && {
          attachments: args.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content),
            contentType: a.contentType ?? "application/pdf",
            ...(a.cid && { cid: a.cid, contentDisposition: "inline" as const }),
          })),
        }),
      });
      console.log("[blockid:email] sent via SMTP", { to: args.to, messageId: info.messageId });
      await log("sent", info.messageId ?? null);
      return { ok: true, id: info.messageId ?? "" };
    } catch (error) {
      console.error("[blockid:email] SMTP send failed, trying Resend fallback", error);
      // Fall through to Resend
    }
  }

  // Priority 2: Resend API
  if (isResendConfigured()) {
    const result = await sendViaResend({
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      fromName: args.fromName,
      headers,
      attachments: args.attachments,
    });
    await log(result.ok ? "sent" : "failed", result.ok ? result.id : null);
    return result;
  }

  // Neither configured (or SMTP threw with no fallback — logged as failed).
  if (transporter) await log("failed");
  console.warn("[blockid:email] No email provider configured (set SMTP_USER+SMTP_PASS or RESEND_API_KEY)", { to: args.to, subject: args.subject });
  return { ok: false, reason: "not_configured" };
}
