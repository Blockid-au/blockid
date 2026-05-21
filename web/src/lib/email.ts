// BlockID email wrapper (server-only).
//
// Uses Gmail SMTP via Nodemailer (admin@blockid.au relay).
// Falls back to Resend if RESEND_API_KEY is set.
// Graceful degradation: if neither is configured, log + return
// { ok: false, reason: 'not_configured' }.

import "server-only";
import nodemailer from "nodemailer";
import { renderToBuffer } from "@react-pdf/renderer";
import { SVIReportPDF } from "@/lib/pdf/svi-report-pdf";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import {
  ensureEmailPreferences,
  canSendEmail,
  getUnsubscribeUrl,
  getPreferencesUrl,
} from "./email-preferences";

const FROM_DEFAULT = "BlockID <admin@blockid.au>";

function fromAddress(): string {
  return process.env.SMTP_FROM_EMAIL || FROM_DEFAULT;
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

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "send_error" | "unsubscribed"; error?: unknown };

// ---------- Core send function ------------------------------------------------

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl?: string;
  attachments?: { filename: string; content: Buffer | Uint8Array; contentType?: string }[];
}): Promise<SendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[blockid:email] SMTP not configured, skipping", { to: args.to, subject: args.subject });
    return { ok: false, reason: "not_configured" };
  }
  try {
    const headers: Record<string, string> = {};
    if (args.unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${args.unsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const info = await transporter.sendMail({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      headers,
      ...(args.attachments?.length && {
        attachments: args.attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: a.contentType ?? "application/pdf",
        })),
      }),
    });
    console.log("[blockid:email] sent", { to: args.to, messageId: info.messageId });
    return { ok: true, id: info.messageId ?? "" };
  } catch (error) {
    console.error("[blockid:email] send failed", error);
    return { ok: false, reason: "send_error", error };
  }
}

// ---------- Helpers for subscription-aware sending ----------------------------

async function prepareUnsubscribe(to: string): Promise<{
  token: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
}> {
  const token = await ensureEmailPreferences(to);
  return {
    token,
    unsubscribeUrl: getUnsubscribeUrl(token),
    preferencesUrl: getPreferencesUrl(token),
  };
}

function unsubFooter(unsubUrl: string, prefsUrl: string, locale?: "en" | "vi"): string {
  const isVi = locale === "vi";
  const receivingText = isVi
    ? "Ban nhan duoc email nay vi ban co tai khoan BlockID.au."
    : "You're receiving this because you have a BlockID.au account.";
  const unsubText = isVi ? "Huy dang ky" : "Unsubscribe";
  const prefsText = isVi ? "Quan ly tuy chon email" : "Manage email preferences";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:0 16px 32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td>
          <p style="margin:16px 0 0 0;color:#475569;font-size:11px;line-height:1.5;text-align:center;">
            ${receivingText}
            <a href="${unsubUrl}" style="color:#475569;text-decoration:underline;">${unsubText}</a> &middot;
            <a href="${prefsUrl}" style="color:#475569;text-decoration:underline;">${prefsText}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// ---------- score-ready --------------------------------------------------------

export async function sendScoreReady(args: {
  to: string;
  slug: string;
  totalScore: number;
  companyName?: string | null;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const url = `${siteUrl()}/s/${args.slug}`;
  const co = args.companyName || "Your company";
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Investor-Ready Score</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(co)}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your Investor-Ready Score has been generated. Share the link below with investors — they can open it without signing up.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:#3B7DD8;line-height:1;">${args.totalScore}<span style="color:#64748B;font-size:24px;">/100</span></div>
          </div>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Share link</p>
          <p style="margin:0 0 24px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#F8FAFC;word-break:break-all;">${url}</p>
          <p style="margin:0;text-align:center;">
            <a href="${url}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View score</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:32px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">BlockID — Persistent Identity & Trust Infrastructure for Private Capital Markets. AU data residency.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Your Investor-Ready Score is ready", html, unsubscribeUrl });
}

// ---------- magic-link --------------------------------------------------------
// TRANSACTIONAL: always sends regardless of preferences.

export async function sendMagicLink(args: {
  to: string;
  token: string;
  intent: "save_founder_pack" | "login";
  ttlMinutes: number;
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  const url = `${siteUrl()}/auth/verify?token=${encodeURIComponent(args.token)}`;
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const headline = args.intent === "save_founder_pack"
    ? (isVi ? "Luu Founder Pack cua ban" : "Save your Founder Pack")
    : (isVi ? "Dang nhap BlockID" : "Sign in to BlockID");
  const sub = args.intent === "save_founder_pack"
    ? (isVi
        ? "Nhan nut ben duoi de luu Founder Pack va tao tai khoan BlockID mien phi. Lien ket chi su dung mot lan va het han trong " + args.ttlMinutes + " phut."
        : "Click the button below to save your Founder Pack and create your free BlockID account. The link is single-use and expires in " + args.ttlMinutes + " minutes.")
    : (isVi
        ? "Nhan nut ben duoi de dang nhap. Lien ket chi su dung mot lan va het han trong " + args.ttlMinutes + " phut."
        : "Click the button below to sign in. The link is single-use and expires in " + args.ttlMinutes + " minutes.");
  const cta = args.intent === "save_founder_pack"
    ? (isVi ? "Luu Founder Pack" : "Save my Founder Pack")
    : (isVi ? "Dang nhap" : "Sign in");
  const subject = args.intent === "save_founder_pack"
    ? (isVi ? "Luu Founder Pack BlockID cua ban" : "Save your BlockID Founder Pack")
    : (isVi ? "Dang nhap BlockID" : "Sign in to BlockID");

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(headline)}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${escapeHtml(sub)}</p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${url}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">${escapeHtml(cta)}</a>
          </p>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">${isVi ? "Hoac dan lien ket nay" : "Or paste this URL"}</p>
          <p style="margin:0 0 24px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#94A3B8;word-break:break-all;">${url}</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">${isVi ? "Neu ban khong yeu cau email nay, ban co the bo qua — khong co tai khoan nao duoc tao." : "If you didn't request this email, you can safely ignore it — no account will be created."}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl, args.locale)}`);

  if (!isSmtpConfigured()) {
    console.warn("[blockid:email] SMTP not configured — verify URL:", url);
    return { ok: false, reason: "not_configured" };
  }

  return sendEmail({ to: args.to, subject, html, unsubscribeUrl });
}

// ---------- score-viewed -------------------------------------------------------

export async function sendScoreViewed(args: {
  to: string;
  slug: string;
  viewerLabel?: string;
  companyName?: string | null;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const url = `${siteUrl()}/s/${args.slug}`;
  const who = args.viewerLabel || "by a viewer";
  const co = args.companyName || "Your score";
  const when = new Date().toUTCString();
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Activity</p>
          <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(co)} was just viewed</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your Investor-Ready Score share link was opened ${escapeHtml(who)} at ${escapeHtml(when)}.</p>
          <p style="margin:0;text-align:center;">
            <a href="${url}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">See activity</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:32px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">You're receiving this because you generated a BlockID Investor-Ready Score share link.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Your score was just viewed", html, unsubscribeUrl });
}

// ---------- HTML shell --------------------------------------------------------

function shell(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID</title></head><body style="margin:0;padding:0;background:#0B1220;color:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">${body}</body></html>`;
}

// ---------- SVI welcome email ------------------------------------------------

export async function sendSVIWelcome(args: {
  to: string;
  name?: string | null;
  svi: number;
  stage: number;
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const stageLabels = ["Concept", "Validated Idea", "MVP", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"];
  const stageLabel = stageLabels[args.stage] ?? "Concept";
  const headlineText = isVi
    ? `Chao Mung Den Voi BlockID${args.name ? `, ${escapeHtml(args.name)}` : ""}`
    : `Welcome to BlockID${args.name ? `, ${escapeHtml(args.name)}` : ""}`;
  const bodyText = isVi
    ? "Chi So Gia Tri Startup (SVI) co ban cua ban da san sang. Day la vi tri cua ban:"
    : "Your Startup Value Index baseline is ready. Here's where you stand:";
  const evidenceText = isVi
    ? "Them bang chung (pitch deck, bang chung doanh thu, bang von) de tang diem cua ban. Moi bang chung duoc xac minh se nang cao SVI va su san sang goi von cua ban."
    : "Add evidence (pitch deck, revenue proof, cap table) to grow your score. Each piece of verified evidence lifts your SVI and strengthens your investor readiness.";
  const ctaText = isVi ? "Xem bang dieu khien" : "View your dashboard";
  const subject = isVi ? "Chao Mung Den Voi BlockID — Chi So SVI Co Ban Da San Sang" : "Welcome to BlockID — Your SVI Baseline is Ready";
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — ${isVi ? "Chao Mung" : "Welcome"}</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;">${headlineText}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${bodyText}</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:56px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">${isVi ? "Diem SVI" : "SVI Score"} — ${escapeHtml(stageLabel)} Stage</p>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">${evidenceText}</p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">${ctaText}</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl, args.locale)}`);
  return sendEmail({ to: args.to, subject, html, unsubscribeUrl });
}

// ---------- SVI weekly report email ------------------------------------------

export async function sendSVIWeeklyReport(args: {
  to: string;
  name?: string | null;
  svi: number;
  delta: number | null;
  weekNum: number;
  aiSummary?: string;
  topGaps?: string[];
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  if (!(await canSendEmail(args.to, "weekly_reports"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const reportsUrl = `${siteUrl()}/workspace/reports`;
  const deltaStr = args.delta != null ? (args.delta >= 0 ? `+${args.delta}` : `${args.delta}`) : (isVi ? "Khong doi" : "No change");
  const deltaColor = args.delta != null && args.delta >= 0 ? "#4ADE80" : "#F87171";
  const deltaArrow = args.delta != null ? (args.delta >= 0 ? "&#9650;" : "&#9660;") : "";

  // AI summary section
  const aiSummaryHtml = args.aiSummary
    ? `<div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 16px 0;">
        <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${isVi ? "Nhan Dinh Tuan" : "Weekly Insight"}</p>
        <p style="margin:0;color:#CBD5E1;font-size:13px;line-height:1.6;">${escapeHtml(args.aiSummary)}</p>
      </div>`
    : "";

  // Top gaps section (next actions)
  const gapsHtml = args.topGaps && args.topGaps.length > 0
    ? `<div style="margin:0 0 16px 0;">
        <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${isVi ? "Hanh Dong Uu Tien Tuan Toi" : "Top Actions for Next Week"}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${args.topGaps.slice(0, 3).map((g, i) => `<tr><td style="padding:4px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">${i + 1}.</td><td style="padding:4px 8px;color:#F8FAFC;font-size:13px;">${escapeHtml(g)}</td></tr>`).join("")}
        </table>
      </div>`
    : "";

  const progressText = args.delta != null && args.delta > 0
    ? (isVi ? "Tien bo tuyet voi! Tiep tuc them bang chung de duy tri da." : "Great progress! Keep adding evidence to maintain momentum.")
    : args.delta != null && args.delta < 0
      ? (isVi ? "Diem cua ban giam nhe. Xem lai cac thieu sot bang chung va them bang chung moi de phuc hoi." : "Your score dipped. Review your evidence gaps and add new proof to recover.")
      : (isVi ? "Diem cua ban on dinh. Them bang chung moi de day diem len cao hon." : "Your score held steady. Add new evidence to push it higher.");

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — ${isVi ? `Bao Cao Tuan ${args.weekNum}` : `Week ${args.weekNum} Report`}</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;">${isVi ? "Cap Nhat SVI Hang Tuan" : "Your Weekly SVI Update"}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${isVi ? `Day la cach Chi So Gia Tri Startup cua ban thay doi tuan nay${args.name ? `, ${escapeHtml(args.name)}` : ""}.` : `Here's how your Startup Value Index changed this week${args.name ? `, ${escapeHtml(args.name)}` : ""}.`}</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:48px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;color:${deltaColor};">${deltaArrow} ${escapeHtml(deltaStr)} ${isVi ? "tuan nay" : "this week"}</p>
          </div>
          ${aiSummaryHtml}
          ${gapsHtml}
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">${progressText}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="31%" style="text-align:center;padding:4px;">
                <a href="${dashUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:13px;">${isVi ? "Bang Dieu Khien" : "Dashboard"}</a>
              </td>
              <td width="3%"></td>
              <td width="31%" style="text-align:center;padding:4px;">
                <a href="${evidenceUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:13px;">${isVi ? "Them Bang Chung" : "Add Evidence"}</a>
              </td>
              <td width="3%"></td>
              <td width="31%" style="text-align:center;padding:4px;">
                <a href="${reportsUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:13px;">${isVi ? "Bao Cao Day Du" : "Full Report"}</a>
              </td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl, args.locale)}`);
  const subjectText = isVi
    ? `Bao Cao SVI Tuan ${args.weekNum} — ${deltaStr} diem`
    : `Week ${args.weekNum} SVI Report — ${deltaStr} points`;
  return sendEmail({ to: args.to, subject: subjectText, html, unsubscribeUrl });
}

// ---------- SVI Report email -------------------------------------------------

export async function sendSVIReport(args: {
  to: string;
  slug: string;
  rawInput?: string;
  analysis: SVIAnalysis;
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const reportUrl = `${siteUrl()}/s/${args.slug}`;
  const loginUrl = `${siteUrl()}/auth/login`;
  const trackUrl = `${siteUrl()}/api/track/open?slug=${args.slug}&email=${encodeURIComponent(args.to)}`;
  const ideaSummary = args.rawInput ? escapeHtml(args.rawInput.replace(/^File:.*\n/, "").trim().slice(0, 300)) + (args.rawInput.length > 300 ? "..." : "") : null;
  const strengths = args.analysis.subs.filter((s) => s.value >= 60).sort((a, b) => b.value - a.value).slice(0, 3);
  const gaps = args.analysis.evidenceGaps.slice(0, 3);
  const strengthRows = strengths.map((s) => `<tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(s.label)} <span style="color:#64748B;">(${s.value}/100)</span></td></tr>`).join("");
  const gapRows = gaps.map((g) => `<tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(g.label)}: <span style="color:#94A3B8;">${escapeHtml(g.action)}</span></td></tr>`).join("");
  const ideaLabel = isVi ? "Y Tuong Cua Ban" : "Your Idea";
  const ideaSummaryHtml = ideaSummary ? `<div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 16px 0;"><p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${ideaLabel}</p><p style="margin:0;color:#CBD5E1;font-size:13px;line-height:1.6;font-style:italic;">&ldquo;${ideaSummary}&rdquo;</p></div>` : "";

  // Generate PDF attachment
  let pdfAttachment: { filename: string; content: Buffer; contentType: string } | undefined;
  try {
    const pdfBuffer = await renderToBuffer(
      SVIReportPDF({ analysis: args.analysis, email: args.to }),
    );
    const filename = `BlockID-SVI-Report-${args.slug}.pdf`;
    pdfAttachment = { filename, content: Buffer.from(pdfBuffer), contentType: "application/pdf" };
  } catch (pdfErr) {
    console.error("[blockid:email] PDF generation failed, sending email without attachment", pdfErr);
  }

  const tagline = isVi ? "BlockID — Bao Cao Gia Tri Startup" : "BlockID — Startup Value Report";
  const headline = isVi ? "Bao Cao Gia Tri Startup Cua Ban Da San Sang" : "Your Startup Value Report is Ready";
  const bodyIntro = isVi
    ? `Phan tich SVI cua ban da hoan tat. Day la diem so tong quan va cac phat hien chinh.${pdfAttachment ? " Bao cao PDF day du duoc dinh kem." : ""}`
    : `Your SVI analysis is complete. Here is your headline score and key findings.${pdfAttachment ? " The full PDF report is attached." : ""}`;
  const strengthsLabel = isVi ? "Diem Manh" : "Strengths";
  const gapsLabel = isVi ? "Thieu Bang Chung" : "Evidence Gaps";
  const viewReportCta = isVi ? "Xem Bao Cao Day Du" : "View Full Report";
  const signInCta = isVi ? "Dang Nhap Bang Dieu Khien" : "Sign in to Dashboard";
  const signInHelp = isVi
    ? "Ban co the dang nhap bang Google hoac qua lien ket ma phep gui den email nay."
    : "You can sign in with Google or via a magic link sent to this email.";
  const subject = isVi
    ? "Bao Cao Gia Tri Startup BlockID Cua Ban Da San Sang"
    : "Your BlockID Startup Value Report is Ready";

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">${tagline}</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${headline}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${bodyIntro}</p>
          ${ideaSummaryHtml}
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:#3B7DD8;line-height:1;">${args.analysis.totalSVI}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">${isVi ? "Diem SVI" : "SVI Score"} — ${escapeHtml(args.analysis.stageLabel)} Stage</p>
          </div>
          ${strengths.length > 0 ? `<p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${strengthsLabel}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${strengthRows}</table>` : ""}
          ${gaps.length > 0 ? `<p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${gapsLabel}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${gapRows}</table>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;">
            <tr>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${reportUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">${viewReportCta}</a></td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${loginUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">${signInCta}</a></td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
          <p style="margin:0;color:#64748B;font-size:11px;line-height:1.5;">${signInHelp}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl, args.locale)}
  <img src="${trackUrl}" width="1" height="1" alt="" style="display:none;" />`);
  return sendEmail({
    to: args.to,
    subject,
    html,
    unsubscribeUrl,
    ...(pdfAttachment && { attachments: [pdfAttachment] }),
  });
}

// ---------- SVI Share email --------------------------------------------------

export async function sendSVIShare(args: { to: string; senderName?: string | null; slug: string; svi: number }): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const reportUrl = `${siteUrl()}/s/${args.slug}`;
  const sender = args.senderName || "A founder";
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Shared Report</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(sender)} shared a Startup Value Report with you</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">You have been invited to view a BlockID Startup Value Index report. Click below to see the full analysis.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">SVI Score</p>
          </div>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${reportUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Full Report</a></p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: `${sender} shared their BlockID Startup Value Report with you`, html, unsubscribeUrl });
}

// ---------- Analysis purchase confirmation --------------------------------------

export async function sendAnalysisPurchaseConfirmation(args: { to: string }): Promise<SendResult> {
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const homeUrl = siteUrl();
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Purchase Confirmed</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your SVI Analysis Credit Has Been Added</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Thank you for your purchase. Your analysis credit is ready to use. Return to BlockID to run your analysis.</p>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${homeUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;">Run Your Analysis</a></p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Your SVI Analysis Credit Has Been Added", html, unsubscribeUrl });
}

// ---------- Credit pack purchase confirmation -----------------------------------

export async function sendCreditPurchaseConfirmation(args: { to: string; credits: number }): Promise<SendResult> {
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const billingUrl = `${siteUrl()}/workspace/billing#credits`;
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Credits Added</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your Credits Have Been Added</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Thank you for your purchase. Your credit pack has been applied to your account.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Credits added</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:48px;font-weight:600;color:#3B7DD8;line-height:1;">+${args.credits}</div>
          </div>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${billingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Your Credits</a></p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: `${args.credits} Credits Added to Your BlockID Account`, html, unsubscribeUrl });
}

// ---------- Subscription cancelled (webhook-triggered) -------------------------

export async function sendSubscriptionCancelled(args: { to: string }): Promise<SendResult> {
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const pricingUrl = `${siteUrl()}/#pricing`;
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your Subscription Has Ended</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your subscription has been cancelled and your account has been downgraded to the free plan. You can resubscribe at any time to regain access to all features.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 8px 0;color:#94A3B8;font-size:14px;">Use code</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:600;color:#3B7DD8;line-height:1;letter-spacing:0.05em;">COMEBACK30</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:14px;">for 30% off your next subscription</p>
          </div>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${pricingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Resubscribe with 30% Off</a></p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Your BlockID Subscription Has Ended", html, unsubscribeUrl });
}

// ---------- Payment confirmation ------------------------------------------------

export async function sendPaymentConfirmation(args: { to: string; planName: string }): Promise<SendResult> {
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const sviUrl = `${siteUrl()}/#svi`;
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Payment Confirmed</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your Account is Active</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your <strong style="color:#F8FAFC;">${escapeHtml(args.planName)}</strong> plan is now active. You have full access to your BlockID dashboard, SVI scoring, and all included features.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:48px;font-weight:600;color:#3B7DD8;line-height:1;">SVI</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">Run your first Startup Value Index analysis</p>
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${dashUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">Open Dashboard</a></td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${sviUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">Get SVI Score</a></td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Payment Confirmed \u2014 Your BlockID Account is Active", html, unsubscribeUrl });
}

// ---------- Founding 50 payment link ------------------------------------------

export async function sendPaymentLink(args: { to: string; name: string; checkoutUrl: string; finalPrice: number; features: string[] }): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const featuresHtml = args.features.map((f) => `<tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(f)}</td></tr>`).join("");
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Founding 50</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Complete Your Founding 50 Payment</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Hi ${escapeHtml(args.name)}, your spot is reserved for 24 hours. Click below to complete payment and lock in your Founding 50 membership.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Total due</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:48px;font-weight:600;color:#3B7DD8;line-height:1;">$${args.finalPrice}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">AUD — one-time payment</p>
          </div>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${args.checkoutUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;">Complete Payment</a></p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">What you get</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">${featuresHtml}</table>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Or paste this URL</p>
          <p style="margin:0 0 24px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#94A3B8;word-break:break-all;">${args.checkoutUrl}</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;line-height:1.6;">This link expires in 24 hours. If you have questions, reply to this email.</p>
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Complete Your BlockID Founding 50 Payment", html, unsubscribeUrl });
}

// ---------- Payment failed -------------------------------------------------------

export async function sendPaymentFailed(args: { to: string }): Promise<SendResult> {
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const billingUrl = `${siteUrl()}/dashboard`;
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Action Required</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Payment Failed</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">We were unable to process your latest payment. Please update your payment method to keep your plan active.</p>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${billingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Update Payment Method</a></p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">If you believe this is an error, please reply to this email and we will investigate.</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Payment Failed \u2014 Please Update Your Payment Method", html, unsubscribeUrl });
}

// ---------- Payment receipt (recurring) -----------------------------------------

export async function sendPaymentReceipt(args: { to: string; amountCents: number; currency?: string }): Promise<SendResult> {
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard`;
  const currency = (args.currency ?? "aud").toUpperCase();
  const amountFormatted = `$${(args.amountCents / 100).toFixed(2)} ${currency}`;
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Payment Receipt</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Payment Received</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Thank you for your payment. Here is your receipt.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Amount paid</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:36px;font-weight:600;color:#3B7DD8;line-height:1;">${escapeHtml(amountFormatted)}</div>
          </div>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Go to Dashboard</a></p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: `Payment Receipt \u2014 ${amountFormatted}`, html, unsubscribeUrl });
}

// ---------- Cancellation email with retention offer -----------------------------

export async function sendCancellationEmail(args: { to: string; activeUntil: string }): Promise<SendResult> {
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const pricingUrl = `${siteUrl()}/#pricing`;
  const formattedDate = new Date(args.activeUntil).toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">We're Sorry to See You Go</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your subscription has been scheduled for cancellation. Your plan will remain active until <strong style="color:#F8FAFC;">${escapeHtml(formattedDate)}</strong>.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 8px 0;color:#94A3B8;font-size:14px;">If you change your mind, use code</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:600;color:#3B7DD8;line-height:1;letter-spacing:0.05em;">COMEBACK30</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:14px;">for 30% off your next subscription</p>
          </div>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${pricingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Resubscribe with 30% Off</a></p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">You will continue to have full access until your plan expires. After that, your account will be downgraded to the free tier.</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "We\u2019re Sorry to See You Go", html, unsubscribeUrl });
}

// ---------- Growth report email ------------------------------------------------

export async function sendGrowthReport(args: {
  to: string; date: string;
  metrics: { totalUsers: number; newUsersWeek: number; newUsersToday: number; sviWeek: number; sviToday: number; leadsWeek: number; leadsToday: number; totalAccounts: number; payingUsers: number; evidenceWeek: number; scoresViewedWeek: number; avgSVI: number; avgDelta: number; uniqueEmails: number; signupRate: number; paymentRate: number; planDist: Record<string, number>; toolUsage: Record<string, number>; biggestDropOff: string; dropOffRate: number };
  recommendations: Array<{ priority: "critical" | "high" | "medium"; title: string; detail: string; impact: string; action_type: string }>;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/admin/growth`;
  const m = args.metrics;
  const priorityColor: Record<string, string> = { critical: "#F87171", high: "#FBBF24", medium: "#94A3B8" };
  const metricRows = [
    { label: "Total Users", value: String(m.totalUsers), sub: `+${m.newUsersWeek} this week` },
    { label: "SVI Analyses", value: String(m.sviWeek), sub: `${m.sviToday} today` },
    { label: "Leads Captured", value: String(m.leadsWeek), sub: `${m.leadsToday} today` },
    { label: "Paying Users", value: String(m.payingUsers), sub: `of ${m.totalAccounts} accounts` },
    { label: "Avg SVI Score", value: String(m.avgSVI), sub: `${m.avgDelta >= 0 ? "+" : ""}${m.avgDelta} avg delta` },
  ].map((r) => `<tr><td style="padding:8px 12px;color:#94A3B8;font-size:13px;border-bottom:1px solid #1F2A44;">${escapeHtml(r.label)}</td><td style="padding:8px 12px;font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;color:#F8FAFC;text-align:right;border-bottom:1px solid #1F2A44;">${escapeHtml(r.value)}</td><td style="padding:8px 12px;color:#64748B;font-size:12px;text-align:right;border-bottom:1px solid #1F2A44;">${escapeHtml(r.sub)}</td></tr>`).join("");
  const conversionRows = [{ label: "Signup Rate", value: `${m.signupRate}%` }, { label: "Payment Rate", value: `${m.paymentRate}%` }].map((r) => `<tr><td style="padding:6px 12px;color:#94A3B8;font-size:13px;">${escapeHtml(r.label)}</td><td style="padding:6px 12px;font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:600;color:#3B7DD8;text-align:right;">${escapeHtml(r.value)}</td></tr>`).join("");
  const dropOffHtml = m.biggestDropOff ? `<p style="margin:16px 0 0 0;color:#F87171;font-size:13px;">Biggest drop-off: <strong style="color:#F8FAFC;">${escapeHtml(m.biggestDropOff)}</strong> (${m.dropOffRate}%)</p>` : "";
  const recRows = args.recommendations.map((r) => `<tr><td style="padding:8px 12px;vertical-align:top;width:70px;border-bottom:1px solid #1F2A44;"><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#0B1220;background:${priorityColor[r.priority] ?? "#94A3B8"};">${escapeHtml(r.priority)}</span></td><td style="padding:8px 12px;border-bottom:1px solid #1F2A44;"><p style="margin:0 0 4px 0;color:#F8FAFC;font-size:14px;font-weight:600;">${escapeHtml(r.title)}</p><p style="margin:0 0 4px 0;color:#94A3B8;font-size:13px;line-height:1.5;">${escapeHtml(r.detail)}</p><p style="margin:0;color:#4ADE80;font-size:12px;">Impact: ${escapeHtml(r.impact)}</p></td></tr>`).join("");
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Growth Report</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Daily Growth Summary</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${escapeHtml(args.date)}</p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Key Metrics</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;margin:0 0 24px 0;">${metricRows}</table>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Conversion Rates</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;margin:0 0 8px 0;">${conversionRows}</table>
          ${dropOffHtml}
          ${args.recommendations.length > 0 ? `<p style="margin:24px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">AI Recommendations</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;margin:0 0 24px 0;">${recRows}</table>` : ""}
          <p style="margin:24px 0 0 0;text-align:center;"><a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Growth Dashboard</a></p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: `BlockID Growth Report \u2014 ${args.date}`, html, unsubscribeUrl });
}

// ---------- SVI weekly review email -------------------------------------------

export async function sendSVIReview(args: {
  to: string; name?: string | null; svi: number; stage: number; stageLabel: string;
  wins: string[]; gaps: Array<{ label: string; action: string; impact: number }>; projectedSvi: number; weekNum: number;
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  if (!(await canSendEmail(args.to, "weekly_reports"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const scoreColor = args.svi >= 140 ? "#4ADE80" : args.svi >= 100 ? "#3B7DD8" : "#FBBF24";
  const stageLabels = ["Concept", "Validated Idea", "MVP", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"];
  const nextStageLabel = stageLabels[Math.min(args.stage + 1, 7)] ?? "Corporation";
  const winRows = args.wins.map((w) => `<tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(w)}</td></tr>`).join("");
  const gapRows = args.gaps.map((g) => `<tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(g.label)}<br><span style="color:#94A3B8;font-size:13px;">${escapeHtml(g.action)}</span> <span style="color:#4ADE80;font-size:12px;font-weight:600;">+${g.impact} SVI</span></td></tr>`).join("");
  const projectedLabel = isVi ? "Diem Du Kien" : "Projected Score";
  const projectedBody = isVi
    ? `SVI cua ban co the dat <strong style="color:#4ADE80;">${args.projectedSvi}</strong> khi hoan thanh cac hanh dong tren.`
    : `Your SVI could reach <strong style="color:#4ADE80;">${args.projectedSvi}</strong> by completing the actions above.`;
  const currentLabel = isVi ? "Hien tai" : "Current";
  const targetLabel = isVi ? "Muc tieu" : "Target";
  const projectedHtml = args.projectedSvi > args.svi ? `<div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 24px 0;"><p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${projectedLabel}</p><p style="margin:0 0 12px 0;color:#F8FAFC;font-size:15px;">${projectedBody}</p><div style="background:#1F2A44;border-radius:6px;height:8px;overflow:hidden;"><div style="background:linear-gradient(90deg,#3B7DD8,#4ADE80);height:100%;width:${Math.min(100, Math.round((args.svi / Math.max(args.projectedSvi, 1)) * 100))}%;border-radius:6px;"></div></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0 0;"><tr><td style="color:#94A3B8;font-size:11px;">${currentLabel}: ${args.svi}</td><td style="color:#4ADE80;font-size:11px;text-align:right;">${targetLabel}: ${args.projectedSvi} (+${args.projectedSvi - args.svi})</td></tr></table></div>` : "";
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — ${isVi ? `Danh Gia Tuan ${args.weekNum}` : `Week ${args.weekNum} Review`}</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${isVi ? `Danh Gia SVI Hang Tuan${args.name ? `, ${escapeHtml(args.name)}` : ""}` : `Your Weekly SVI Review${args.name ? `, ${escapeHtml(args.name)}` : ""}`}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${isVi ? "Day la ban danh gia Chi So Gia Tri Startup ca nhan cua ban voi cac hanh dong cu the de tang diem." : "Here is your personalised Startup Value Index review with specific actions to grow your score."}</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:${scoreColor};line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">${isVi ? "Diem SVI" : "SVI Score"} — ${escapeHtml(args.stageLabel)} Stage</p>
            <p style="margin:4px 0 0 0;color:#64748B;font-size:12px;">${isVi ? "Giai doan tiep theo" : "Next stage"}: ${escapeHtml(nextStageLabel)}</p>
          </div>
          ${args.wins.length > 0 ? `<p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${isVi ? "Diem Manh Hang Dau" : "Top Strengths"}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${winRows}</table>` : ""}
          ${args.gaps.length > 0 ? `<p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${isVi ? "Hanh Dong Uu Tien" : "Priority Actions"}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${gapRows}</table>` : ""}
          ${projectedHtml}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;">
            <tr>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${evidenceUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">${isVi ? "Tai Len Bang Chung" : "Upload Evidence"}</a></td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${dashUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">${isVi ? "Xem Bang Dieu Khien" : "View Dashboard"}</a></td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl, args.locale)}`);
  const subjectText = isVi
    ? `Danh Gia SVI Tuan ${args.weekNum} — Diem: ${args.svi} | ${args.stageLabel} Stage`
    : `Week ${args.weekNum} SVI Review — Score: ${args.svi} | ${args.stageLabel} Stage`;
  return sendEmail({ to: args.to, subject: subjectText, html, unsubscribeUrl });
}

// ---------- SVI milestone celebration email ----------------------------------

export async function sendMilestoneEmail(args: { to: string; name?: string | null; badge: string; badgeLabel: string; message: string }): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Milestone</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(args.badgeLabel)}</h1>
          ${args.name ? `<p style="margin:0 0 16px 0;color:#94A3B8;font-size:15px;">Congratulations, ${escapeHtml(args.name)}.</p>` : ""}
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:32px;text-align:center;margin:0 0 24px 0;">
            <div style="display:inline-block;width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#3B7DD8,#4ADE80);line-height:80px;margin:0 0 16px 0;"><span style="font-size:36px;color:#0B1220;font-weight:700;">&#9733;</span></div>
            <p style="margin:0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:16px;font-weight:600;color:#4ADE80;text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(args.badge.replace(/_/g, " "))}</p>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${escapeHtml(args.message)}</p>
          <p style="margin:0 0 24px 0;text-align:center;"><a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Your Dashboard</a></p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: `${args.badgeLabel} — BlockID Milestone`, html, unsubscribeUrl });
}

// ---------- Nurture email helpers --------------------------------------------

type NurtureArgs = {
  to: string;
  name?: string | null;
  svi?: number | null;
};

function nurturePx(to: string, type: string): string {
  return `<img src="${siteUrl()}/api/track/open?slug=nurture-${type}&email=${encodeURIComponent(to)}" width="1" height="1" alt="" style="display:none;" />`;
}

function nurtureCard(args: { tagline: string; headline: string; body: string; ctaLabel: string; ctaUrl: string; footer?: string; extra?: string }): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">${escapeHtml(args.tagline)}</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(args.headline)}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${args.body}</p>
          ${args.extra ?? ""}
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${args.ctaUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">${escapeHtml(args.ctaLabel)}</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">${args.footer ?? "BlockID.au — Valuation. Ownership. Execution. Growth."}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

// --- Sequence A: Post-Free Analysis (4-step over 7 days) -------------------
// Email 1 (Immediate) is handled by sendSVIReport at analysis time.

export async function sendNurtureFreeDay1(args: NurtureArgs): Promise<SendResult> {
  // Legacy alias — kept for backward compatibility with svi-notify cron
  return sendNurtureFreeDay2(args);
}

export async function sendNurtureFreeDay2(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)}, your` : "Your";
  const html = shell(nurtureCard({
    tagline: "BlockID — Boost Your Score",
    headline: "3 Quick Wins to Boost Your Score",
    body: `${greeting} SVI score reflects what we can verify about your startup. The fastest way to lift it by 30+ points? Upload evidence.</p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Top 3 evidence items to upload</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;"><strong>Pitch deck</strong> — validates your narrative, market sizing, and team (+5-10 SVI)</td></tr>
            <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;"><strong>GitHub repo</strong> — proves technical execution and commit velocity (+5-10 SVI)</td></tr>
            <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;"><strong>Analytics screenshot</strong> — GA4, Mixpanel, or Stripe dashboard showing traction (+10-15 SVI)</td></tr>
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Upload your first piece of evidence and watch your score climb.`,
    ctaLabel: "Upload Evidence",
    ctaUrl: evidenceUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "free_day2"));
  return sendEmail({ to: args.to, subject: "Boost your SVI by 30+ points \u2014 here\u2019s how", html, unsubscribeUrl });
}

export async function sendNurtureFreeDay3(args: NurtureArgs): Promise<SendResult> {
  // Legacy alias — kept for backward compatibility with svi-notify cron
  return sendNurtureFreeDay4(args);
}

export async function sendNurtureFreeDay4(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const equityUrl = `${siteUrl()}/tools/equity-split`;
  const greeting = args.name ? `${escapeHtml(args.name!)}, splitting` : "Splitting";
  const html = shell(nurtureCard({
    tagline: "BlockID — Equity Checklist",
    headline: "Are You Splitting Equity Fairly?",
    body: `${greeting} equity wrong is the #1 reason co-founder relationships break down. Use our free tools to get it right from day one.</p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Free equity tools</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td style="padding:8px 12px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#9654;</td><td style="padding:8px 12px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;"><strong>Equity Split Tool</strong> — Model fair splits based on contribution, risk, and commitment.</td></tr>
            <tr><td style="padding:8px 12px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#9654;</td><td style="padding:8px 12px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;"><strong>Cap Table Builder</strong> — Visualise ownership across founders, advisors, and ESOP.</td></tr>
            <tr><td style="padding:8px 12px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#9654;</td><td style="padding:8px 12px;color:#F8FAFC;font-size:14px;"><strong>Dilution Calculator</strong> — See how future funding rounds impact your ownership.</td></tr>
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">All three are completely free. No sign-up required.`,
    ctaLabel: "Split Equity Free",
    ctaUrl: equityUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "free_day4"));
  return sendEmail({ to: args.to, subject: "Are you splitting equity fairly? Check now (free)", html, unsubscribeUrl });
}

export async function sendNurtureFreeDay7(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const foundingUrl = `${siteUrl()}/founding-50`;
  const greeting = args.name ? `${escapeHtml(args.name!)}, we` : "We";
  const html = shell(nurtureCard({
    tagline: "BlockID — Founding 50",
    headline: "100 Credits for A$49",
    body: `${greeting} are reserving spots for our Founding 50 cohort — the first 50 Australian startups to lock in lifetime early-access pricing on BlockID.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Founder Plan includes</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">100 analysis credits (A$0.49 each)</td></tr>
              <tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">Full evidence vault with AI verification</td></tr>
              <tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">Investor-ready share links and PDF reports</td></tr>
              <tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">Priority support and feature requests</td></tr>
              <tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">Locked-in early-access pricing forever</td></tr>
            </table>
          </div>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;color:#F8FAFC;font-size:14px;font-weight:600;">Early-stage SaaS founder, Sydney</p>
            <p style="margin:0;color:#94A3B8;font-size:13px;line-height:1.6;font-style:italic;">&ldquo;Having a verifiable SVI score made investor conversations start differently. The evidence vault saved me hours of prep for each meeting.&rdquo;</p>
          </div>
          <p style="margin:0 0 24px 0;color:#F87171;font-size:14px;font-weight:600;">Only ${50} spots available. Once the cohort is full, pricing goes up.`,
    ctaLabel: "Claim Your Founding 50 Spot",
    ctaUrl: foundingUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "free_day7"));
  return sendEmail({ to: args.to, subject: "100 credits for A$49 \u2014 here\u2019s what Founding 50 members get", html, unsubscribeUrl });
}

export async function sendNurtureFreeDay14(args: NurtureArgs): Promise<SendResult> {
  // Legacy alias — redirects to day 7 upgrade CTA for backward compat
  return sendNurtureFreeDay7(args);
}

// --- Sequence B: Post-Payment (4-step over 7 days) -------------------------
// Email 1 (Immediate) is handled by sendPaymentConfirmation at payment time.

export async function sendNurturePaidDay1(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const roadmapUrl = `${siteUrl()}/workspace/roadmap`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const greeting = args.name ? `, ${escapeHtml(args.name!)}` : "";
  const html = shell(nurtureCard({
    tagline: "BlockID — Day 1",
    headline: "Your 30-Day Growth Plan Starts Now",
    body: `Welcome aboard${greeting}. Today is Day 1 of your growth plan. Let us start with the single most impactful action: uploading your first piece of evidence.</p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Step-by-step guide</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">1.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Go to <strong>Workspace &rarr; Evidence</strong></td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">2.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Click <strong>Upload</strong> and select a file (pitch deck, financials, or analytics screenshot)</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">3.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Our AI verifies and scores it automatically</td></tr>
          </table>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Connect GitHub (optional)</p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">If you have a GitHub repo, connect it from the Evidence page to automatically verify your technical execution and commit velocity.`,
    ctaLabel: "Start Your Growth Plan",
    ctaUrl: roadmapUrl,
    extra: `<p style="margin:0 0 16px 0;text-align:center;"><a href="${evidenceUrl}" style="color:#3B7DD8;font-size:13px;text-decoration:underline;">Or go straight to Evidence Upload</a></p>`,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "paid_day1"));
  return sendEmail({ to: args.to, subject: "Day 1: Upload your first piece of evidence", html, unsubscribeUrl });
}

export async function sendNurturePaidDay3(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const equityUrl = `${siteUrl()}/workspace/equity-setup`;
  const greeting = args.name ? `${escapeHtml(args.name!)}, your` : "Your";
  const html = shell(nurtureCard({
    tagline: "BlockID — Equity Setup",
    headline: "Build Your Cap Table in 5 Minutes",
    body: `${greeting} equity structure is one of the first things investors check. The Equity Setup Wizard walks you through it in 6 simple steps.</p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">6-step Equity Setup Wizard</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">1.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Add founders and their contribution type</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">2.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Set initial equity splits</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">3.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Configure vesting schedules</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">4.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Allocate advisor and ESOP pools</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">5.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Preview dilution from future funding rounds</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:24px;font-weight:600;">6.</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Export your cap table as PDF</td></tr>
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">A well-structured cap table lifts your SVI and makes due diligence faster for investors.`,
    ctaLabel: "Set Up Equity",
    ctaUrl: equityUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "paid_day3"));
  return sendEmail({ to: args.to, subject: "Your equity, organized \u2014 try the Equity Setup Wizard", html, unsubscribeUrl });
}

export async function sendNurturePaidDay7(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const greeting = args.name ? `, ${escapeHtml(args.name!)}` : "";
  const sviBlock = args.svi ? `
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Current SVI</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:56px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
          </div>` : "";
  const html = shell(nurtureCard({
    tagline: "BlockID — Week 1 Progress",
    headline: "Your First Weekly Report",
    body: `Congratulations${greeting} — you have completed your first week on the Founder Plan. Here is a snapshot of where you stand.`,
    ctaLabel: "View Dashboard",
    ctaUrl: dashUrl,
    extra: sviBlock + `
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">What to focus on next</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Review evidence gaps flagged in your SVI report</td></tr>
            <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Upload fresh evidence to close the top-priority gap</td></tr>
            <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Share your SVI link with an investor or advisor</td></tr>
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">Your full weekly SVI report will arrive every 7 days. Each report tracks your score delta, evidence added, and badges earned.`,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "paid_day7"));
  return sendEmail({ to: args.to, subject: `Week 1 Progress: SVI ${args.svi ?? ""} \u2014 here\u2019s what changed`.trim(), html, unsubscribeUrl });
}

export async function sendNurturePaidDay14(args: NurtureArgs): Promise<SendResult> {
  // Legacy alias — kept for backward compatibility with svi-notify cron
  return sendNurturePaidDay7(args);
}

export async function sendNurturePaidDay30(args: NurtureArgs): Promise<SendResult> {
  // Legacy alias — kept for backward compatibility with svi-notify cron
  return sendNurturePaidDay7(args);
}

// --- Sequence C: Re-engagement ----------------------------------------------

export async function sendNurtureReengageDay14(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)}, we` : "We";
  const html = shell(nurtureCard({
    tagline: "BlockID — We Miss You",
    headline: "Need Help Getting Started?",
    body: `${greeting} noticed you have not been active on BlockID recently. No worries — we are here to help.</p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">If you are unsure what to do next, try one of these:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#8226;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Upload a pitch deck or financial document to improve your SVI</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#8226;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Run a fresh SVI analysis to check your current score</td></tr>
            <tr><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#8226;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Reply to this email with any questions — we read every response</td></tr>
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your dashboard is always one click away.`,
    ctaLabel: "Return to Dashboard",
    ctaUrl: dashUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "reengage_day14"));
  return sendEmail({ to: args.to, subject: "We noticed you haven't been active — need help?", html, unsubscribeUrl });
}

export async function sendNurtureReengageDay30(args: NurtureArgs): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const sviUrl = `${siteUrl()}/#svi`;
  const greeting = args.name ? `${escapeHtml(args.name!)}, your` : "Your";
  const html = shell(nurtureCard({
    tagline: "BlockID — Score Update",
    headline: "Your SVI May Have Changed",
    body: `${greeting} market, competitors, and fundraising landscape have shifted since your last visit. Your SVI score may no longer reflect your current position.</p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Run a fresh analysis to see where you stand today. It only takes a minute.`,
    ctaLabel: "Check Your Score",
    ctaUrl: sviUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "reengage_day30"));
  return sendEmail({ to: args.to, subject: "Your SVI may have changed — check your score", html, unsubscribeUrl });
}

// ---------- Low credit alert ---------------------------------------------------

export async function sendLowCreditAlert(args: { to: string; balance: number }): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const billingUrl = `${siteUrl()}/workspace/billing#credits`;
  const balanceStr = args.balance.toFixed(2);
  const html = shell(nurtureCard({
    tagline: "BlockID — Credit Alert",
    headline: "Your Credits Are Running Low",
    body: `Your BlockID credit balance is <strong style="color:#FBBF24;">${escapeHtml(balanceStr)}</strong> credits. Some features require credits to use, including SVI analyses, AI evidence reviews, full reports, and equity recommendations.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Features you will lose access to</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 8px;color:#F87171;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">SVI Analysis (0.50 credits)</td></tr>
              <tr><td style="padding:4px 8px;color:#F87171;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">AI Evidence Review (0.10 - 1.50 credits)</td></tr>
              <tr><td style="padding:4px 8px;color:#F87171;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">Full Reports (2.00 - 5.00 credits)</td></tr>
              <tr><td style="padding:4px 8px;color:#F87171;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">AI Equity Recommendations (0.50 - 1.50 credits)</td></tr>
            </table>
          </div>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Best value credit packs</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;">10 Credits</td><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1F2A44;">A$9 <span style="color:#4ADE80;font-size:12px;">Save 10%</span></td></tr>
              <tr><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;">25 Credits</td><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1F2A44;">A$20 <span style="color:#4ADE80;font-size:12px;">Save 20%</span></td></tr>
              <tr><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">50 Credits</td><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;font-weight:600;text-align:right;">A$15 <span style="color:#4ADE80;font-size:12px;">Save 70%</span></td></tr>
            </table>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">Free features like evidence upload, investor score, and dilution calculator still work without credits.`,
    ctaLabel: "Buy Credits",
    ctaUrl: billingUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "low_credit"));
  return sendEmail({ to: args.to, subject: "Your BlockID credits are running low", html, unsubscribeUrl });
}

// ---------- Report delivery email with upgrade CTA -----------------------------

export async function sendReportDelivery(args: {
  to: string;
  slug: string;
  tier: string;
  sviScore: number;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const reportUrl = `${siteUrl()}/s/${args.slug}`;
  const billingUrl = `${siteUrl()}/workspace/billing#credits`;
  const trackUrl = `${siteUrl()}/api/track/open?slug=${args.slug}&email=${encodeURIComponent(args.to)}`;

  // Next action CTA based on tier
  let nextAction = "";
  let nextCtaLabel = "";
  let nextCtaUrl = billingUrl;
  if (args.tier === "preview" || args.tier === "scan") {
    nextAction = "Want the full picture? Unlock the Standard report for deeper analysis, evidence gaps, and actionable recommendations.";
    nextCtaLabel = "Unlock Full Report (0.50 credits)";
    nextCtaUrl = reportUrl;
  } else if (args.tier === "standard") {
    nextAction = "Ready to go deeper? The Deep Dive report includes benchmarking, competitor context, a detailed action plan, and investor perspective.";
    nextCtaLabel = "Go Deeper with Deep Dive (1.50 credits)";
    nextCtaUrl = reportUrl;
  } else if (args.tier === "deep_dive" || args.tier === "deep") {
    nextAction = "Take the next step with AI Equity Recommendations — get data-driven guidance on equity splits, vesting, and share structure tailored to your startup.";
    nextCtaLabel = "Get AI Equity Advice (1.00 credits)";
    nextCtaUrl = `${siteUrl()}/workspace/equity-setup`;
  }

  const nextActionHtml = nextAction
    ? `<div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 24px 0;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Next Step</p>
        <p style="margin:0 0 16px 0;color:#94A3B8;font-size:14px;line-height:1.6;">${escapeHtml(nextAction)}</p>
        <p style="margin:0;text-align:center;"><a href="${nextCtaUrl}" style="display:inline-block;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:13px;">${escapeHtml(nextCtaLabel)}</a></p>
      </div>`
    : "";

  const scoreColor = args.sviScore >= 140 ? "#4ADE80" : args.sviScore >= 100 ? "#3B7DD8" : "#FBBF24";
  const tierLabel = args.tier === "deep_dive" ? "Deep Dive" : args.tier === "standard" ? "Standard" : args.tier === "preview" ? "Preview" : args.tier.charAt(0).toUpperCase() + args.tier.slice(1);

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — ${escapeHtml(tierLabel)} Report</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your SVI Report is Ready</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your ${escapeHtml(tierLabel)} analysis is complete. Here is your headline score.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:${scoreColor};line-height:1;">${args.sviScore}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">SVI Score — ${escapeHtml(tierLabel)} Report</p>
          </div>
          ${nextActionHtml}
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${reportUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Report</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}
  <img src="${trackUrl}" width="1" height="1" alt="" style="display:none;" />`);

  return sendEmail({
    to: args.to,
    subject: `Your SVI Report is Ready — Score: ${args.sviScore}`,
    html,
    unsubscribeUrl,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
