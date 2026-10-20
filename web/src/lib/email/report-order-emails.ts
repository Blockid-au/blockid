// report-order-emails — the Pricing v5 order lifecycle e-mails (G35 P3,
// plan §1.5 G4 / §6.4.7).
//
// Report-delivery class (T): these complete something the buyer paid for, so
// they still send while marketing e-mail is paused (founder 25/09). They are
// pinned by the EM08 transactional lint (email-transactional-lint.test.ts):
// no offers, no "upgrade" / "buy" wording, no /pricing or billing links; the
// paid confirmation is a receipt (its amount is the transaction itself).
//
//   sendReportOrderPaid      PAID       tier + what happens next
//   sendReportOrderReady     READY      link to the report
//   sendReportOrderInReview  IN_REVIEW  Verified: "within N business days",
//                                       due date in Sydney time
// (reviewed / delivered for Verified is wave W4's admin flow.)

import "server-only";
import { sendEmail, type SendResult } from "@/lib/email-core";
import { complianceFooter } from "@/lib/email";
import { EMAIL_BUTTON_STYLE, EMAIL_CARD_STYLE, EMAIL_THEME } from "./theme";
import type { PaygTier } from "@/lib/pricing/v5-payg";
import { reportOrderPath } from "@/lib/paywall/report-delivery";

const TIER_NAME: Record<PaygTier, string> = { snapshot: "Snapshot", full: "Full", verified: "Verified" };

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

function orderUrl(orderId: string): string {
  return `${siteUrl()}${reportOrderPath(orderId)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function audCents(cents: number): string {
  return `A$${(cents / 100).toFixed(2)}`;
}

/** "Thursday 23 October 2026, 11:59 pm (Sydney time)". */
export function sydneyDueLabel(at: Date): string {
  const s = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  return `${s} (Sydney time)`;
}

function card(eyebrow: string, heading: string, bodyHtml: string, cta: { href: string; label: string } | null, footerHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID</title></head><body style="margin:0;padding:0;background:${EMAIL_THEME.page};color:${EMAIL_THEME.ink};font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_THEME.page};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="${EMAIL_CARD_STYLE}">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${EMAIL_THEME.navy};font-weight:500;">${esc(eyebrow)}</p>
          <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:600;color:${EMAIL_THEME.ink};">${esc(heading)}</h1>
          ${bodyHtml}
          ${cta ? `<p style="margin:24px 0;text-align:center;"><a href="${cta.href}" style="${EMAIL_BUTTON_STYLE}">${esc(cta.label)}</a></p>` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${footerHtml}</body></html>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 12px 0;color:${EMAIL_THEME.inkSubtle};font-size:15px;line-height:1.6;">${text}</p>`;
}

/** What happens after payment, per tier. Plain sentences — no offers. */
export function nextStepsText(tier: PaygTier, slaBusinessDays: number, isTierChange: boolean): string {
  if (isTierChange && tier === "full") return "Every section of your existing report is now open — no new analysis is needed.";
  if (tier === "verified") {
    return `${isTierChange ? "Your Full report is now with the BlockID team" : "We are preparing your Full report now; the BlockID team then reviews the evidence behind it"}. Your Verified report is delivered within ${slaBusinessDays} business day${slaBusinessDays === 1 ? "" : "s"} and we will e-mail you when it is ready.`;
  }
  return "We are preparing your report now — it is usually ready within an hour. We will e-mail you the link as soon as it is done.";
}

export async function sendReportOrderPaid(args: {
  to: string;
  orderId: string;
  tier: PaygTier;
  amountCents: number;
  slaBusinessDays: number;
  /** true for a D28 tier change on an existing report. */
  isTierChange?: boolean;
}): Promise<SendResult> {
  const { unsubscribeUrl, footerHtml } = await complianceFooter(args.to, { theme: "light" });
  const name = `${TIER_NAME[args.tier]} report`;
  const html = card(
    "BlockID — Payment received",
    `Thank you — your ${name} is paid`,
    para(`We received ${esc(audCents(args.amountCents))} (GST included) for your ${esc(name)}. Stripe e-mails your tax invoice separately.`) +
      para(esc(nextStepsText(args.tier, args.slaBusinessDays, args.isTierChange === true))),
    { href: orderUrl(args.orderId), label: "Track your report" },
    footerHtml,
  );
  return sendEmail({
    to: args.to,
    subject: `Payment received — your BlockID ${name}`,
    html,
    unsubscribeUrl,
    template: "report_order_paid",
  });
}

export async function sendReportOrderReady(args: { to: string; orderId: string; tier: PaygTier }): Promise<SendResult> {
  const { unsubscribeUrl, footerHtml } = await complianceFooter(args.to, { theme: "light" });
  const name = `${TIER_NAME[args.tier]} report`;
  const html = card(
    "BlockID — Report ready",
    `Your ${name} is ready`,
    para(`Your ${esc(name)} is ready to read online and download as a PDF.`),
    { href: orderUrl(args.orderId), label: "Open your report" },
    footerHtml,
  );
  return sendEmail({ to: args.to, subject: `Your BlockID ${name} is ready`, html, unsubscribeUrl, template: "report_order_ready" });
}

export async function sendReportOrderInReview(args: {
  to: string;
  orderId: string;
  dueAt: Date;
  slaBusinessDays: number;
}): Promise<SendResult> {
  const { unsubscribeUrl, footerHtml } = await complianceFooter(args.to, { theme: "light" });
  const days = args.slaBusinessDays;
  const html = card(
    "BlockID — Verified report in review",
    "Your Verified report is with our team",
    para("Your Full report has been written and the BlockID team is now reviewing the evidence behind it.") +
      para(`It will be ready within ${days} business day${days === 1 ? "" : "s"} — by <strong>${esc(sydneyDueLabel(args.dueAt))}</strong>. We will e-mail you as soon as it is delivered.`),
    { href: orderUrl(args.orderId), label: "Track your report" },
    footerHtml,
  );
  return sendEmail({
    to: args.to,
    subject: `Your BlockID Verified report is in review — ready within ${days} business day${days === 1 ? "" : "s"}`,
    html,
    unsubscribeUrl,
    template: "report_order_in_review",
  });
}
