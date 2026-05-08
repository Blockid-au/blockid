// Resend transactional email wrapper (server-only).
//
// Two templates inline:
//   - score-ready  : sent after /api/score persists a row.
//   - score-viewed : sent when a third party opens the share link.
//
// Graceful degradation: if RESEND_API_KEY is missing we log + return
// { ok: false, reason: 'not_configured' } so callers (fire-and-forget) never
// block the response.

import "server-only";
import { Resend } from "resend";

const FROM_DEFAULT = "BlockID <noreply@blockid.au>";

let cached: Resend | null | undefined;

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getResend(): Resend | null {
  if (cached !== undefined) return cached;
  if (!isResendConfigured()) {
    cached = null;
    return null;
  }
  cached = new Resend(process.env.RESEND_API_KEY as string);
  return cached;
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || FROM_DEFAULT;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "send_error"; error?: unknown };

// ---------- score-ready --------------------------------------------------------

export async function sendScoreReady(args: {
  to: string;
  slug: string;
  totalScore: number;
  companyName?: string | null;
}): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    console.warn(
      "[blockid:email] sendScoreReady — Resend not configured, skipping",
      { to: args.to, slug: args.slug },
    );
    return { ok: false, reason: "not_configured" };
  }
  const url = `${siteUrl()}/s/${args.slug}`;
  const html = scoreReadyHtml({ ...args, url });
  try {
    const res = await resend.emails.send({
      from: fromAddress(),
      to: args.to,
      subject: "Your Investor-Ready Score is ready",
      html,
    });
    if (res.error) throw res.error;
    return { ok: true, id: res.data?.id ?? "" };
  } catch (error) {
    console.error("[blockid:email] sendScoreReady failed", error);
    return { ok: false, reason: "send_error", error };
  }
}

// ---------- score-viewed -------------------------------------------------------

export async function sendScoreViewed(args: {
  to: string;
  slug: string;
  viewerLabel?: string;
  companyName?: string | null;
}): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    console.warn(
      "[blockid:email] sendScoreViewed — Resend not configured, skipping",
      { to: args.to, slug: args.slug },
    );
    return { ok: false, reason: "not_configured" };
  }
  const url = `${siteUrl()}/s/${args.slug}`;
  const html = scoreViewedHtml({ ...args, url });
  try {
    const res = await resend.emails.send({
      from: fromAddress(),
      to: args.to,
      subject: "Your score was just viewed",
      html,
    });
    if (res.error) throw res.error;
    return { ok: true, id: res.data?.id ?? "" };
  } catch (error) {
    console.error("[blockid:email] sendScoreViewed failed", error);
    return { ok: false, reason: "send_error", error };
  }
}

// ---------- HTML templates -----------------------------------------------------
//
// Inline-style only. BlockID navy/teal palette. No emoji. No external CSS so
// it renders consistently in Gmail / Outlook / Apple Mail.

function shell(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID</title></head><body style="margin:0;padding:0;background:#0B1220;color:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">${body}</body></html>`;
}

function scoreReadyHtml(args: {
  url: string;
  totalScore: number;
  companyName?: string | null;
}): string {
  const co = args.companyName || "Your company";
  return shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#0FB5A9;font-weight:500;">BlockID — Investor-Ready Score</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(co)}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your Investor-Ready Score has been generated. Share the link below with investors — they can open it without signing up.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:#0FB5A9;line-height:1;">${args.totalScore}<span style="color:#64748B;font-size:24px;">/100</span></div>
          </div>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Share link</p>
          <p style="margin:0 0 24px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#F8FAFC;word-break:break-all;">${args.url}</p>
          <p style="margin:0;text-align:center;">
            <a href="${args.url}" style="display:inline-block;background:#0FB5A9;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View score</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:32px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">BlockID — Persistent Identity & Trust Infrastructure for Private Capital Markets. AU data residency.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
}

function scoreViewedHtml(args: {
  url: string;
  viewerLabel?: string;
  companyName?: string | null;
}): string {
  const who = args.viewerLabel || "by a viewer";
  const co = args.companyName || "Your score";
  const when = new Date().toUTCString();
  return shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#0FB5A9;font-weight:500;">BlockID — Activity</p>
          <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(co)} was just viewed</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your Investor-Ready Score share link was opened ${escapeHtml(who)} at ${escapeHtml(when)}.</p>
          <p style="margin:0;text-align:center;">
            <a href="${args.url}" style="display:inline-block;background:#0FB5A9;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">See activity</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:32px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">You're receiving this because you generated a BlockID Investor-Ready Score share link.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
