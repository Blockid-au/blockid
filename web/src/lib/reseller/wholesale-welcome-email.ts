// Reseller wholesale welcome email — pure builder.
//
// Emitted when a wholesale reseller provisions a founder workspace via
// POST /api/reseller/create-startup (plan §C.1.5 + §H.8). The email:
//   - names the introducing reseller (co-branding via email-footer helper)
//   - confirms the workspace is provisional until the founder clicks the
//     magic-link (H.8: prevents reseller spam signups juking KPIs)
//   - explicitly reassures the founder that NO payment is required from them
//     because the reseller is the seller-of-record (plan §U.3 wholesale;
//     closes CPO advisory §25 remaining item — non-payment confirmation)
//
// Contract: pure. No I/O, no DOM, no siteUrl(). Caller passes the fully-
// resolved magic-link URL so the builder stays framework-neutral (mirrors
// how buildAddonRemovalSchedulePhases keeps the Stripe branch testable
// without network).
//
// Consumers: web/src/lib/email.ts will expose sendWholesaleWelcome(args)
// that composes buildWholesaleWelcomeEmail() output into the standard
// shell()/sendEmail() pipeline. Tick-scope for this file is the pure
// template only; wiring lands in a follow-up tick after the create-
// startup POST endpoint is built.

import { resellerFooterHtml, resellerFooterText, type Locale } from "./email-footer";

export type WholesaleWelcomeInput = {
  founderName?: string | null;
  companyName: string;
  resellerDisplayName: string;
  magicLinkUrl: string;
  ttlHours: number;
  locale?: Locale;
};

export type WholesaleWelcomeEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function greeting(founderName: string | null | undefined, locale: Locale): string {
  const name = (founderName ?? "").trim();
  if (name) return locale === "vi" ? `Chào ${name},` : `Hi ${name},`;
  return locale === "vi" ? "Chào bạn," : "Hi there,";
}

/**
 * Pure builder — returns {subject, html, text}. Callers hand the result to
 * sendEmail() with `to: founderEmail`.
 *
 * Missing/blank `resellerDisplayName` or `magicLinkUrl` throw synchronously:
 * both are required for a wholesale-provisioned welcome — a version without
 * either belongs on a different (retail) path.
 */
export function buildWholesaleWelcomeEmail(
  input: WholesaleWelcomeInput,
): WholesaleWelcomeEmail {
  const locale: Locale = input.locale === "vi" ? "vi" : "en";
  const company = (input.companyName ?? "").trim();
  const reseller = (input.resellerDisplayName ?? "").trim();
  const url = (input.magicLinkUrl ?? "").trim();
  const ttl = Number.isFinite(input.ttlHours) && input.ttlHours > 0
    ? Math.floor(input.ttlHours)
    : 24;

  if (!company) throw new Error("companyName required");
  if (!reseller) throw new Error("resellerDisplayName required");
  if (!url) throw new Error("magicLinkUrl required");

  const isVi = locale === "vi";

  const subject = isVi
    ? `Xác minh không gian làm việc BlockID cho ${company}`
    : `Verify your BlockID workspace for ${company}`;

  const headline = isVi
    ? "Xác minh không gian làm việc của bạn"
    : "Verify your workspace";

  const intro = isVi
    ? `${escapeHtml(reseller)} đã tạo một không gian làm việc BlockID cho <strong>${escapeHtml(company)}</strong>. Nhấp vào nút bên dưới trong ${ttl} giờ tới để kích hoạt.`
    : `${escapeHtml(reseller)} has created a BlockID workspace for <strong>${escapeHtml(company)}</strong>. Click the button below within the next ${ttl} hours to activate it.`;

  const provisionalLabel = isVi
    ? "Trạng thái: Tạm thời"
    : "Status: Provisional";

  const provisionalBody = isVi
    ? "Không gian làm việc của bạn ở chế độ chỉ đọc cho đến khi bạn xác minh email. Các tính năng xuất, chia sẻ công khai và ký blockchain sẽ mở khóa sau khi xác minh."
    : "Your workspace is read-only until you verify your email. Exports, public share links, and blockchain signing unlock once verified.";

  const noPaymentLabel = isVi
    ? "Bạn không cần thanh toán"
    : "No payment required from you";

  const noPaymentBody = isVi
    ? `${escapeHtml(reseller)} là bên phát hành hóa đơn và đã thanh toán cho gói của bạn. BlockID sẽ không hỏi bạn thẻ tín dụng hoặc chi tiết thanh toán.`
    : `${escapeHtml(reseller)} is the seller-of-record and has already paid for your plan. BlockID will not ask you for a credit card or billing details.`;

  const ctaLabel = isVi ? "Kích hoạt không gian làm việc" : "Activate my workspace";
  const orPasteLabel = isVi ? "Hoặc dán liên kết này" : "Or paste this link";
  const footerNote = isVi
    ? `Nếu bạn không mong đợi email này, vui lòng liên hệ ${escapeHtml(reseller)} hoặc admin@blockid.au.`
    : `If you did not expect this email, contact ${escapeHtml(reseller)} or admin@blockid.au.`;
  const greetingLine = greeting(input.founderName, locale);

  const cobrand = resellerFooterHtml(reseller, locale);

  const html = [
    `<p style="margin:0 0 12px 0;color:#334155;font-size:15px;line-height:1.6;">${escapeHtml(greetingLine)}</p>`,
    `<h1 style="margin:0 0 12px 0;font-size:22px;font-weight:600;color:#0F172A;letter-spacing:-0.01em;">${escapeHtml(headline)}</h1>`,
    `<p style="margin:0 0 20px 0;color:#334155;font-size:15px;line-height:1.6;">${intro}</p>`,
    `<p style="margin:0 0 20px 0;text-align:center;">`,
    `<a href="${escapeHtml(url)}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">${escapeHtml(ctaLabel)}</a>`,
    `</p>`,
    `<p style="margin:0 0 6px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">${escapeHtml(orPasteLabel)}</p>`,
    `<p style="margin:0 0 20px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#475569;word-break:break-all;">${escapeHtml(url)}</p>`,
    `<div style="margin:20px 0;padding:12px 16px;background:#FEF3C7;border-radius:8px;border-left:3px solid #F59E0B;">`,
    `<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#78350F;text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(provisionalLabel)}</p>`,
    `<p style="margin:0;font-size:13px;color:#78350F;line-height:1.5;">${escapeHtml(provisionalBody)}</p>`,
    `</div>`,
    `<div style="margin:16px 0;padding:12px 16px;background:#ECFDF5;border-radius:8px;border-left:3px solid #10B981;">`,
    `<p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#065F46;text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(noPaymentLabel)}</p>`,
    `<p style="margin:0;font-size:13px;color:#065F46;line-height:1.5;">${noPaymentBody}</p>`,
    `</div>`,
    `<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 12px 0;">`,
    `<p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">${footerNote}</p>`,
    cobrand,
  ].join("");

  const textLines = [
    greetingLine,
    "",
    isVi
      ? `${reseller} đã tạo không gian làm việc BlockID cho ${company}.`
      : `${reseller} has created a BlockID workspace for ${company}.`,
    "",
    isVi
      ? `Xác minh trong ${ttl} giờ tới:`
      : `Verify within the next ${ttl} hours:`,
    url,
    "",
    `${provisionalLabel}: ${provisionalBody}`,
    "",
    `${noPaymentLabel}: ${isVi
      ? `${reseller} là bên phát hành hóa đơn và đã thanh toán cho gói của bạn. BlockID sẽ không hỏi bạn thẻ tín dụng.`
      : `${reseller} is the seller-of-record and has already paid for your plan. BlockID will not ask you for a credit card.`}`,
    "",
    isVi
      ? `Nếu bạn không mong đợi email này, hãy liên hệ ${reseller} hoặc admin@blockid.au.`
      : `If you did not expect this email, contact ${reseller} or admin@blockid.au.`,
    resellerFooterText(reseller, locale).trim(),
  ];
  const text = textLines.filter((l) => l !== undefined).join("\n").trim() + "\n";

  return { subject, html, text };
}
