// G35 Pricing v5 P4 — "Your Verified report has been reviewed" (plan §6.4.7:
// paid / ready / in-review / REVIEWED; report-delivery class — one of the
// e-mail kinds that still sends after the 25/09 pause).
//
// Transactional (T-class) by construction: it completes what the buyer paid
// for — the report link + the Investor Pack PDF attached — and carries no
// price, plan, credit or cross-sell (pinned by email-transactional-lint.test.ts).

import "server-only";
import { sendEmail, type SendResult } from "@/lib/email-core";
import { SENDER_IDENTITY_HTML, SENDER_IDENTITY_LINE } from "@/lib/email";

export const VERIFIED_REVIEWED_FLOW = "report-delivery";
export const VERIFIED_REVIEWED_TEMPLATE = "verified_report_reviewed";
/** Attachments above this go as a link only (mail providers cap ~10–25 MB). */
export const INVESTOR_PACK_ATTACH_MAX_BYTES = 8 * 1024 * 1024;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

export interface VerifiedReviewedEmailInput {
  startupName: string;
  /** Absolute report URL (`/workspace/reports/business?order=<id>`). */
  reportUrl: string;
  /** "BlockID Reviewed · 21 Oct 2026 · Long Do". */
  badgeLabel: string;
  /** Recipient's first name / display name, when known. */
  name?: string | null;
  /** Evidence items the reviewer accepted / reviewed. */
  accepted: number;
  reviewed: number;
  /** True when the Investor Pack PDF is attached. */
  packAttached: boolean;
}

/** Pure template: subject + HTML + plain text. */
export function renderVerifiedReviewedEmail(input: VerifiedReviewedEmailInput): { subject: string; html: string; text: string } {
  const startup = input.startupName.trim() || "your startup";
  const hello = input.name?.trim() ? `Hi ${input.name.trim().split(/\s+/)[0]},` : "Hi,";
  const reviewedLine =
    input.reviewed > 0
      ? `Our team checked ${input.reviewed} evidence item${input.reviewed === 1 ? "" : "s"} behind the report and accepted ${input.accepted}. The verification level and evidence confidence on the report now reflect that review.`
      : "Our team checked the evidence behind the report. The verification level and evidence confidence on the report reflect that review.";
  const packLine = input.packAttached
    ? "Your Investor Pack (PDF) is attached — the same reviewed numbers, laid out for an investor."
    : "We could not attach your Investor Pack (PDF) to this e-mail — reply to this message and we will send it to you directly.";
  const subject = `Reviewed: your Verified report for ${startup}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID</title></head><body style="margin:0;padding:24px 16px;background:#f7f8fa;color:#0b0f1a;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;"><tr><td>
<p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#1B2A5E;font-weight:600;">BlockID · Verified report</p>
<h1 style="margin:0 0 12px 0;font-size:22px;font-weight:600;color:#0b0f1a;">Your report for ${escapeHtml(startup)} has been reviewed</h1>
<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(hello)}</p>
<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(reviewedLine)}</p>
<p style="margin:0 0 18px 0;display:inline-block;padding:6px 12px;border:1px solid #0891b2;border-radius:999px;color:#155e75;background:#ecfeff;font-size:13px;font-weight:600;">${escapeHtml(input.badgeLabel)}</p>
<p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(packLine)}</p>
<p style="margin:0 0 24px 0;"><a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;background:#1B2A5E;color:#ffffff;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Open your report</a></p>
<p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:#6b7280;">A BlockID review checks the evidence for authenticity and relevance. It is not an audit and not financial advice.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px 0;">
<p style="margin:0;color:#6b7280;font-size:11px;line-height:1.6;">${SENDER_IDENTITY_HTML}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    `Your report for ${startup} has been reviewed`,
    "",
    hello,
    "",
    reviewedLine,
    "",
    input.badgeLabel,
    "",
    packLine,
    "",
    `Open your report: ${input.reportUrl}`,
    "",
    "A BlockID review checks the evidence for authenticity and relevance. It is not an audit and not financial advice.",
    "",
    "—",
    SENDER_IDENTITY_LINE,
  ].join("\n");
  return { subject, html, text };
}

/** Send the reviewed e-mail (T-class, flow report-delivery) with the Investor Pack attached when it fits. */
export async function sendVerifiedReviewedEmail(args: { to: string; input: Omit<VerifiedReviewedEmailInput, "packAttached">; investorPack?: Buffer | null }): Promise<SendResult> {
  const attach = Boolean(args.investorPack && args.investorPack.length > 0 && args.investorPack.length <= INVESTOR_PACK_ATTACH_MAX_BYTES);
  const body = renderVerifiedReviewedEmail({ ...args.input, packAttached: attach });
  return sendEmail({
    to: args.to,
    subject: body.subject,
    html: body.html,
    text: body.text,
    emailClass: "T",
    flow: VERIFIED_REVIEWED_FLOW,
    template: VERIFIED_REVIEWED_TEMPLATE,
    ...(attach && args.investorPack
      ? { attachments: [{ filename: `investor-pack-${slug(args.input.startupName)}.pdf`, content: args.investorPack, contentType: "application/pdf" }] }
      : {}),
  });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "startup";
}
