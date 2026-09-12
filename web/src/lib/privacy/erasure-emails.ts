// Transactional emails for self-service account deletion (S24-B).
// Always sent (no unsubscribe footer): a re-auth link and a "deletion
// scheduled — cancel" notice are account-security messages, like the
// password-reset email.

import "server-only";
import { sendEmail } from "@/lib/email";
import { GRACE_DAYS, REAUTH_TTL_MIN } from "./deletion-request";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function card(headline: string, paragraphs: string[], cta: { label: string; url: string }, footer: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID</title></head><body style="margin:0;padding:0;background:#0B1220;color:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;">${esc(headline)}</h1>
          ${paragraphs.map((p) => `<p style="margin:0 0 16px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${esc(p)}</p>`).join("")}
          <p style="margin:8px 0 24px 0;text-align:center;">
            <a href="${cta.url}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">${esc(cta.label)}</a>
          </p>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Or paste this URL</p>
          <p style="margin:0 0 24px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#94A3B8;word-break:break-all;">${cta.url}</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">${esc(footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function reauthUrl(token: string): string {
  return `${siteUrl()}/workspace/settings?delete_token=${encodeURIComponent(token)}`;
}

export function cancelUrl(token: string): string {
  return `${siteUrl()}/api/account/delete/cancel?token=${encodeURIComponent(token)}`;
}

/** Passwordless accounts: confirm you control the mailbox before the request is accepted. */
export async function sendDeletionReauth(args: { to: string; token: string }) {
  const url = reauthUrl(args.token);
  return sendEmail({
    to: args.to,
    subject: "Confirm your BlockID account deletion request",
    html: card(
      "Confirm it's you",
      [
        `Someone — hopefully you — asked to delete the BlockID account for ${args.to}. Click the button to confirm and continue; the link is single-use and expires in ${REAUTH_TTL_MIN} minutes.`,
        "Nothing is deleted yet. After you confirm you will still have a 7-day grace period to change your mind.",
      ],
      { label: "Continue to delete my account", url },
      "If you didn't request this, you can ignore this email — your account stays as it is. Consider changing your password if you did not sign in recently.",
    ),
  });
}

/** Request accepted: grace period + cancel link. */
export async function sendDeletionScheduled(args: { to: string; cancelToken: string; scheduledFor: string }) {
  const url = cancelUrl(args.cancelToken);
  const when = new Date(args.scheduledFor).toUTCString();
  return sendEmail({
    to: args.to,
    subject: `Your BlockID account will be deleted on ${when.slice(0, 16)}`,
    html: card(
      "Account deletion scheduled",
      [
        `We received your request to delete your BlockID account. It will be erased after a ${GRACE_DAYS}-day grace period, on ${when}.`,
        "Until then your account keeps working. If you change your mind, click the button below — the request is cancelled immediately and nothing is removed.",
        "What is erased: your profile, projects, reports, data rooms, evidence, API keys and sessions. What we keep, in de-identified form, for the periods the Privacy Policy requires: invoices and credit ledgers (7 years), consent records, and the tamper-evident audit log. Your Stripe subscriptions are cancelled and payment methods removed.",
      ],
      { label: "Keep my account", url },
      "You are receiving this because a deletion was requested from your signed-in account. If that wasn't you, click Keep my account and contact privacy@blockid.au.",
    ),
  });
}
