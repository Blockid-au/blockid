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

const FROM_DEFAULT = "BlockID.au <info@blockid.au>";

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

// ---------- Resend fallback ---------------------------------------------------

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const from = process.env.RESEND_FROM_EMAIL || fromAddress();

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

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl?: string;
  attachments?: { filename: string; content: Buffer | Uint8Array; contentType?: string }[];
}): Promise<SendResult> {
  // Priority 1: SMTP (Nodemailer)
  const transporter = getTransporter();
  if (transporter) {
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
      console.log("[blockid:email] sent via SMTP", { to: args.to, messageId: info.messageId });
      return { ok: true, id: info.messageId ?? "" };
    } catch (error) {
      console.error("[blockid:email] SMTP send failed, trying Resend fallback", error);
      // Fall through to Resend
    }
  }

  // Priority 2: Resend API
  if (isResendConfigured()) {
    return sendViaResend({ to: args.to, subject: args.subject, html: args.html });
  }

  // Neither configured
  console.warn("[blockid:email] No email provider configured (set SMTP_USER+SMTP_PASS or RESEND_API_KEY)", { to: args.to, subject: args.subject });
  return { ok: false, reason: "not_configured" };
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:16px 0 0 0;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#4ADE80;">${isVi ? "Buoc Tiep Theo Cua Ban" : "Your Next Steps"}</p>
            <p style="margin:0 0 6px 0;color:#CBD5E1;font-size:12px;line-height:1.5;">1. ${isVi ? "Xem bao cao va xac dinh 3 uu tien hang dau" : "Review your report and identify your top 3 priorities"}</p>
            <p style="margin:0 0 6px 0;color:#CBD5E1;font-size:12px;line-height:1.5;">2. ${isVi ? "Tai len bang chung len Evidence Vault de tang diem" : "Upload evidence to your Evidence Vault to boost your score"}</p>
            <p style="margin:0 0 6px 0;color:#CBD5E1;font-size:12px;line-height:1.5;">3. ${isVi ? "Thuc hien hanh dong khac phuc dau tien trong 7 ngay" : "Take your first gap-closing action within 7 days"}</p>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:11px;font-style:italic;">${isVi ? "Moi hanh buoc nho deu nang gia tri startup cua ban." : "Every small step raises your startup's value. We're with you."}</p>
          </div>
          <div style="background:#1F2A44;border-radius:10px;padding:14px;margin:12px 0 0 0;text-align:center;">
            <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#FBBF24;">${isVi ? "Mo Khoa Bao Cao Day Du" : "Unlock Your Full Report"}</p>
            <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.5;">${isVi ? "Ban cao day du khong gioi han trang, phan tich chi tiet, doi thu canh tranh va ke hoach hanh dong 90 ngay." : "This is a 10-page preview. The full report includes unlimited depth, detailed competitor profiles, financial projections, and a 90-day action plan tailored to your stage."}</p>
          </div>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:11px;line-height:1.5;">${signInHelp}</p>
          <p style="margin:0;color:#475569;font-size:10px;line-height:1.4;">This analysis is produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111). The SVI is NOT a financial valuation or investment recommendation. BlockID does not hold an AFSL. Seek independent professional advice. Prices in AUD incl. GST.</p>
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

// ---------- Welcome + First Report email (new user auto-account) -------------
// Sent when a new user creates their first report. Combines:
//   1. Welcome to BlockID
//   2. SVI report summary + PDF attachment
//   3. Temporary password + login URL
//   4. Instructions to set their own password

export async function sendWelcomeWithReport(args: {
  to: string;
  slug: string;
  rawInput?: string;
  analysis: SVIAnalysis;
  tempPassword: string;
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const reportUrl = `${siteUrl()}/s/${args.slug}`;
  const loginUrl = `${siteUrl()}/auth/login`;
  const profileUrl = `${siteUrl()}/workspace/profile`;
  const trackUrl = `${siteUrl()}/api/track/open?slug=${args.slug}&email=${encodeURIComponent(args.to)}`;
  const ideaSummary = args.rawInput ? escapeHtml(args.rawInput.replace(/^File:.*\n/, "").trim().slice(0, 300)) + (args.rawInput.length > 300 ? "..." : "") : null;
  const strengths = args.analysis.subs.filter((s) => s.value >= 60).sort((a, b) => b.value - a.value).slice(0, 3);
  const gaps = args.analysis.evidenceGaps.slice(0, 3);
  const strengthRows = strengths.map((s) => `<tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(s.label)} <span style="color:#64748B;">(${s.value}/100)</span></td></tr>`).join("");
  const gapRows = gaps.map((g) => `<tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(g.label)}: <span style="color:#94A3B8;">${escapeHtml(g.action)}</span></td></tr>`).join("");

  // Generate PDF attachment
  let pdfAttachment: { filename: string; content: Buffer; contentType: string } | undefined;
  try {
    const pdfBuffer = await renderToBuffer(
      SVIReportPDF({ analysis: args.analysis, email: args.to }),
    );
    const filename = `BlockID-SVI-Report-${args.slug}.pdf`;
    pdfAttachment = { filename, content: Buffer.from(pdfBuffer), contentType: "application/pdf" };
  } catch (pdfErr) {
    console.error("[blockid:email] PDF generation failed for welcome email", pdfErr);
  }

  const ideaSummaryHtml = ideaSummary ? `<div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 16px 0;"><p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${isVi ? "Y Tuong Cua Ban" : "Your Idea"}</p><p style="margin:0;color:#CBD5E1;font-size:13px;line-height:1.6;font-style:italic;">&ldquo;${ideaSummary}&rdquo;</p></div>` : "";

  const subject = isVi
    ? "Chao mung den BlockID — Bao Cao Dau Tien & Tai Khoan Cua Ban"
    : "Welcome to BlockID — Your First Report & Account Details";

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${isVi ? "Chao Mung Den BlockID!" : "Welcome to BlockID!"}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${isVi
    ? "Tai khoan cua ban da duoc tao tu dong. Bao cao phan tich dau tien cua ban da san sang ben duoi."
    : "Your account has been automatically created. Your first analysis report is ready below."
  }${pdfAttachment ? (isVi ? " Bao cao PDF day du duoc dinh kem." : " The full PDF report is attached.") : ""}</p>

          <!-- Account credentials box -->
          <div style="background:linear-gradient(135deg,#1a2744 0%,#0f1d35 100%);border:1px solid #2563EB;border-radius:12px;padding:20px;margin:0 0 24px 0;">
            <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#60A5FA;">${isVi ? "Thong Tin Tai Khoan Cua Ban" : "Your Account Details"}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;color:#94A3B8;font-size:13px;width:120px;">${isVi ? "Email:" : "Email:"}</td>
                <td style="padding:4px 0;color:#F8FAFC;font-size:13px;font-weight:500;">${escapeHtml(args.to)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#94A3B8;font-size:13px;">${isVi ? "Mat khau tam:" : "Temp password:"}</td>
                <td style="padding:4px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:600;color:#4ADE80;letter-spacing:0.05em;">${escapeHtml(args.tempPassword)}</td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;color:#FBBF24;font-size:11px;line-height:1.5;">${isVi
    ? "Hay doi mat khau nay thanh mat khau rieng cua ban sau khi dang nhap."
    : "Please change this to your own password after signing in."
  }</p>
          </div>

          <!-- Login button -->
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${loginUrl}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;">${isVi ? "Dang Nhap Ngay" : "Sign In Now"}</a>
          </p>

          <hr style="border:none;border-top:1px solid #1F2A44;margin:0 0 24px 0;">

          <!-- SVI Report summary -->
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">${isVi ? "Bao Cao Gia Tri Startup" : "Startup Value Report"}</p>
          ${ideaSummaryHtml}
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:#3B7DD8;line-height:1;">${args.analysis.totalSVI}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">${isVi ? "Diem SVI" : "SVI Score"} — ${escapeHtml(args.analysis.stageLabel)} Stage</p>
          </div>
          ${strengths.length > 0 ? `<p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${isVi ? "Diem Manh" : "Strengths"}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${strengthRows}</table>` : ""}
          ${gaps.length > 0 ? `<p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">${isVi ? "Thieu Bang Chung" : "Evidence Gaps"}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${gapRows}</table>` : ""}
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${reportUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;">${isVi ? "Xem Bao Cao Day Du" : "View Full Report"}</a>
          </p>

          <!-- Next steps -->
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#4ADE80;">${isVi ? "Buoc Tiep Theo" : "Your Next Steps"}</p>
            <p style="margin:0 0 6px 0;color:#CBD5E1;font-size:12px;line-height:1.5;">1. ${isVi ? "Dang nhap voi mat khau tam o tren" : "Sign in with the temp password above"}</p>
            <p style="margin:0 0 6px 0;color:#CBD5E1;font-size:12px;line-height:1.5;">2. ${isVi ? "Doi mat khau rieng tai" : "Set your own password at"} <a href="${profileUrl}" style="color:#60A5FA;text-decoration:underline;">${isVi ? "Ho So" : "Profile"}</a></p>
            <p style="margin:0 0 6px 0;color:#CBD5E1;font-size:12px;line-height:1.5;">3. ${isVi ? "Xem bao cao va xac dinh uu tien" : "Review your report and identify priorities"}</p>
            <p style="margin:0 0 6px 0;color:#CBD5E1;font-size:12px;line-height:1.5;">4. ${isVi ? "Tao them y tuong moi va theo doi tien trinh" : "Create more ideas and track your progress"}</p>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:11px;font-style:italic;">${isVi ? "Moi buoc nho deu nang gia tri startup cua ban." : "Every small step raises your startup's value. We're with you."}</p>
          </div>

          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:11px;line-height:1.5;">${isVi
    ? "Quen mat khau? Vao trang dang nhap, nhan 'Forgot your password?' de nhan mat khau moi qua email."
    : "Forgot your password? Visit the login page and click 'Forgot your password?' to receive a new one via email."
  }</p>
          <p style="margin:0;color:#475569;font-size:10px;line-height:1.4;">This analysis is produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111). The SVI is NOT a financial valuation or investment recommendation. BlockID does not hold an AFSL. Seek independent professional advice. Prices in AUD incl. GST.</p>
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

// ---------- Password reset email (with temp password) -------------------------

export async function sendPasswordReset(args: {
  to: string;
  tempPassword: string;
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  const loginUrl = `${siteUrl()}/auth/login`;
  const profileUrl = `${siteUrl()}/workspace/profile`;

  const subject = isVi
    ? "BlockID — Mat Khau Moi Cua Ban"
    : "BlockID — Your New Password";

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${isVi ? "Dat Lai Mat Khau" : "Password Reset"}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${isVi
    ? "Mat khau moi da duoc tao cho tai khoan cua ban. Hay su dung mat khau tam ben duoi de dang nhap."
    : "A new password has been generated for your account. Use the temporary password below to sign in."
  }</p>

          <!-- New credentials box -->
          <div style="background:linear-gradient(135deg,#1a2744 0%,#0f1d35 100%);border:1px solid #2563EB;border-radius:12px;padding:20px;margin:0 0 24px 0;">
            <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#60A5FA;">${isVi ? "Mat Khau Moi" : "Your New Password"}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;color:#94A3B8;font-size:13px;width:120px;">${isVi ? "Email:" : "Email:"}</td>
                <td style="padding:4px 0;color:#F8FAFC;font-size:13px;font-weight:500;">${escapeHtml(args.to)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#94A3B8;font-size:13px;">${isVi ? "Mat khau:" : "Password:"}</td>
                <td style="padding:4px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:600;color:#4ADE80;letter-spacing:0.05em;">${escapeHtml(args.tempPassword)}</td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;color:#FBBF24;font-size:11px;line-height:1.5;">${isVi
    ? "Hay doi mat khau nay thanh mat khau rieng sau khi dang nhap."
    : "Please change this to your own password after signing in."
  }</p>
          </div>

          <!-- Login + Profile buttons -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${loginUrl}" style="display:inline-block;width:100%;background:#2563EB;color:#FFFFFF;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">${isVi ? "Dang Nhap" : "Sign In"}</a></td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;"><a href="${profileUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">${isVi ? "Doi Mat Khau" : "Change Password"}</a></td>
            </tr>
          </table>

          <hr style="border:none;border-top:1px solid #1F2A44;margin:0 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
          <p style="margin:0;color:#64748B;font-size:11px;line-height:1.5;">${isVi
    ? "Neu ban khong yeu cau dat lai mat khau, hay lien he admin@blockid.au."
    : "If you didn't request this password reset, please contact admin@blockid.au."
  }</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);

  // Password reset is transactional — always send (no unsubscribe check)
  return sendEmail({ to: args.to, subject, html });
}

// ---------- Farewell email (on global unsubscribe) ---------------------------

export async function sendFarewellEmail(args: {
  to: string;
  locale?: "en" | "vi";
}): Promise<SendResult> {
  const isVi = args.locale === "vi";
  const homeUrl = siteUrl();
  const { unsubscribeUrl } = await prepareUnsubscribe(args.to);
  const resubUrl = `${homeUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeUrl.split("token=")[1] ?? "")}`;

  const subject = isVi
    ? "Tam biet tu BlockID — Chung toi luon o day"
    : "Goodbye from BlockID — We'll always be here";

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${isVi ? "Cam on ban da dong hanh" : "Thank you for being with us"}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${isVi
    ? "Ban da huy dang ky nhan email tu BlockID. Chung toi ton trong quyet dinh cua ban."
    : "You've unsubscribed from BlockID emails. We respect your decision and hope we added value to your startup journey."
  }</p>

          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 24px 0;">
            <p style="margin:0 0 12px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;font-weight:500;">${isVi ? "Nhung dieu ban nen biet" : "A few things to know"}</p>
            <p style="margin:0 0 8px 0;color:#CBD5E1;font-size:13px;line-height:1.6;">${isVi ? "&#10003; Tai khoan va du lieu cua ban van duoc bao toan" : "&#10003; Your account and all data remain safely stored"}</p>
            <p style="margin:0 0 8px 0;color:#CBD5E1;font-size:13px;line-height:1.6;">${isVi ? "&#10003; Ban van co the dang nhap va su dung BlockID bat cu luc nao" : "&#10003; You can sign in and use BlockID anytime"}</p>
            <p style="margin:0 0 0 0;color:#CBD5E1;font-size:13px;line-height:1.6;">${isVi ? "&#10003; Ban chi nhan email giao dich (hoa don)" : "&#10003; You'll only receive transactional emails (receipts)"}</p>
          </div>

          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">${isVi
    ? "Neu ban doi y, ban co the dang ky lai bat cu luc nao:"
    : "If you change your mind, you can resubscribe anytime:"
  }</p>

          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${homeUrl}/auth/login" style="display:inline-block;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;">${isVi ? "Quay lai BlockID" : "Return to BlockID"}</a>
          </p>

          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
          <p style="margin:0;color:#475569;font-size:10px;line-height:1.4;">${isVi
    ? "Day la email cuoi cung ban se nhan tu BlockID. Chuc ban thanh cong."
    : "This is the last email you'll receive from us. We wish you every success with your startup."
  }</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);

  // Farewell is transactional — always send (ironic but necessary)
  return sendEmail({ to: args.to, subject, html });
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Founding 100</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Complete Your Founding 100 Payment</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Hi ${escapeHtml(args.name)}, your spot is reserved for 24 hours. Click below to complete payment and lock in your Founding 100 membership.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Complete Your BlockID Founding 100 Payment", html, unsubscribeUrl });
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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
          <p style="margin:0;color:#64748B;font-size:12px;">${args.footer ?? "BlockID.au — Valuation. Ownership. Growth."}</p>
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
    tagline: "BlockID — Founding 100",
    headline: "100 Credits for A$1",
    body: `${greeting} are reserving spots for our Founding 100 cohort — the first 100 Australian startups to lock in lifetime early-access pricing on BlockID.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Founder Plan includes</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">100 analysis credits included</td></tr>
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
          <p style="margin:0 0 24px 0;color:#F87171;font-size:14px;font-weight:600;">Only 100 spots available. Once the cohort is full, pricing goes up.`,
    ctaLabel: "Claim Your Founding 100 Spot",
    ctaUrl: foundingUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "free_day7"));
  return sendEmail({ to: args.to, subject: "100 credits for A$1 \u2014 here\u2019s what Founding 100 members get", html, unsubscribeUrl });
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
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
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

// ---------- vesting milestone -----------------------------------------------

export async function sendVestingMilestone(args: {
  to: string;
  shareholderName: string;
  percentVested: number;
  sharesVested: number;
  totalShares: number;
  milestoneType: "cliff_reached" | "monthly_vest" | "vesting_complete";
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/workspace/vesting`;
  const pct = Math.round(args.percentVested * 10) / 10;

  const subjectMap: Record<typeof args.milestoneType, string> = {
    cliff_reached: `Cliff Reached — ${pct}% Vested`,
    monthly_vest: `Vesting Update — ${pct}% Vested (${Math.round(args.sharesVested).toLocaleString()} shares)`,
    vesting_complete: `Vesting Complete — 100% Fully Vested`,
  };

  const headlineMap: Record<typeof args.milestoneType, string> = {
    cliff_reached: "Your Cliff Has Been Reached",
    monthly_vest: "Monthly Vesting Update",
    vesting_complete: "Congratulations — Fully Vested!",
  };

  const bodyMap: Record<typeof args.milestoneType, string> = {
    cliff_reached: `Great news, ${escapeHtml(args.shareholderName)}! Your cliff period has ended. ${Math.round(args.sharesVested).toLocaleString()} of your ${args.totalShares.toLocaleString()} shares (${pct}%) have now vested.`,
    monthly_vest: `Hi ${escapeHtml(args.shareholderName)}, your equity continues to vest. You now have ${Math.round(args.sharesVested).toLocaleString()} of ${args.totalShares.toLocaleString()} shares vested (${pct}%).`,
    vesting_complete: `Congratulations, ${escapeHtml(args.shareholderName)}! All ${args.totalShares.toLocaleString()} shares have fully vested. Your equity is now 100% yours.`,
  };

  const scoreColor = args.milestoneType === "vesting_complete" ? "#10B981" : "#3B7DD8";

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Vesting</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${headlineMap[args.milestoneType]}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${bodyMap[args.milestoneType]}</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:48px;font-weight:600;color:${scoreColor};line-height:1;">${pct}<span style="color:#64748B;font-size:20px;">%</span></div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">${Math.round(args.sharesVested).toLocaleString()} / ${args.totalShares.toLocaleString()} shares vested</p>
          </div>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Your Vesting</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">BlockID — Persistent Identity & Trust Infrastructure for Private Capital Markets.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);

  return sendEmail({
    to: args.to,
    subject: subjectMap[args.milestoneType],
    html,
    unsubscribeUrl,
  });
}

// ---------- First report 24h follow-up email --------------------------------

export async function sendNurtureFirstReport24h(args: {
  to: string;
  name?: string | null;
  svi: number;
  stageLabel: string;
  slug: string;
  evidenceGaps: { label: string; impact: number }[];
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const reportUrl = `${siteUrl()}/s/${args.slug}`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";

  // Build top 3 gaps table rows
  const topGaps = args.evidenceGaps.slice(0, 3);
  const gapRows = topGaps.map((g, i) => `
    <tr>
      <td style="padding:8px 12px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;font-weight:700;">${i + 1}.</td>
      <td style="padding:8px 12px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;">
        <strong>${escapeHtml(g.label)}</strong> — <span style="color:#4ADE80;font-weight:600;">+${g.impact} points</span>
      </td>
    </tr>`).join("");

  const html = shell(nurtureCard({
    tagline: "BlockID — Your First Report",
    headline: `Your startup scored ${args.svi} — here's how to improve`,
    body: `${greeting} 24 hours ago, you got your first BlockID analysis.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 4px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Your SVI Score</p>
            <p style="margin:0 0 4px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:48px;font-weight:700;color:#4ADE80;">${args.svi}</p>
            <p style="margin:0;font-size:14px;color:#94A3B8;">${escapeHtml(args.stageLabel)} Stage</p>
          </div>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Top ${topGaps.length} ways to boost your score</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            ${gapRows}
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Upload evidence to verify these items and watch your score climb.`,
    ctaLabel: "Upload Evidence Now",
    ctaUrl: evidenceUrl,
    extra: `<p style="margin:0 0 24px 0;text-align:center;">
              <a href="${reportUrl}" style="display:inline-block;background:transparent;color:#3B7DD8;font-weight:600;text-decoration:underline;padding:8px 16px;font-size:14px;">View Your Full Report &rarr;</a>
            </p>`,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "first_report_24h"));
  return sendEmail({
    to: args.to,
    subject: `Your startup scored ${args.svi} — here's how to improve`,
    html,
    unsubscribeUrl,
  });
}

// ---------- Evidence Score Boost (Day 3) --------------------------------------

export async function sendEvidenceScoreBoost(args: {
  to: string;
  name?: string | null;
  svi: number;
  evidenceGaps: { label: string; impact: number }[];
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";

  const topGaps = args.evidenceGaps.slice(0, 3);
  const totalPoints = topGaps.reduce((sum, g) => sum + g.impact, 0);
  const gapRows = topGaps.map((g, i) => `
    <tr>
      <td style="padding:8px 12px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;font-weight:700;">${i + 1}.</td>
      <td style="padding:8px 12px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;">
        <strong>${escapeHtml(g.label)}</strong> — <span style="color:#4ADE80;font-weight:600;">+${g.impact} points</span>
      </td>
    </tr>`).join("");

  const html = shell(nurtureCard({
    tagline: "BlockID — Evidence Boost",
    headline: `Your SVI score could be ${totalPoints}% higher`,
    body: `${greeting} your startup scored <strong style="color:#4ADE80;">${args.svi}</strong> on the Startup Value Index. But you have not uploaded any evidence yet.</p>
          <p style="margin:0 0 8px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Evidence is how BlockID verifies your claims. Without it, your score only reflects what we could find publicly. Here are your top gaps:</p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Top ${topGaps.length} evidence gaps</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            ${gapRows}
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Upload just one document and your score will update automatically.`,
    ctaLabel: `Upload Evidence Now \u2192 +${totalPoints} points`,
    ctaUrl: evidenceUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "evidence_boost_3d"));
  return sendEmail({
    to: args.to,
    subject: `Your SVI score could be ${totalPoints}% higher \u2014 here\u2019s how`,
    html,
    unsubscribeUrl,
  });
}

// ---------- Unlock Deeper Analysis (Day 7 after first analysis) ---------------

export async function sendUnlockDeeperAnalysis(args: {
  to: string;
  name?: string | null;
  stageLabel: string;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const billingUrl = `${siteUrl()}/workspace/billing#credits`;
  const greeting = args.name ? `${escapeHtml(args.name!)}, your` : "Your";

  const html = shell(nurtureCard({
    tagline: "BlockID — Full Analysis",
    headline: `What investors will see in your ${escapeHtml(args.stageLabel)} startup`,
    body: `${greeting} free SVI analysis gave you a snapshot. But investors dig deeper. A full analysis unlocks the sections that matter most to them.</p>
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Locked in your free report</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#128274;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;"><strong>Competitor Profiles</strong> — How you compare to similar startups in your market</td></tr>
            <tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#128274;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;"><strong>Financial Projections</strong> — Revenue runway, burn rate, and growth trajectory</td></tr>
            <tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#128274;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;"><strong>Risk Assessment</strong> — Key risks with severity scoring and mitigation actions</td></tr>
            <tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#128274;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;"><strong>Investor Readiness</strong> — What you need before approaching investors</td></tr>
          </table>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Credit packs</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;">1 Full Analysis</td><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1F2A44;">from A$0.50</td></tr>
              <tr><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;border-bottom:1px solid #1F2A44;">10 Credits</td><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #1F2A44;">A$9 <span style="color:#4ADE80;font-size:12px;">Save 10%</span></td></tr>
              <tr><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">50 Credits</td><td style="padding:6px 8px;color:#3B7DD8;font-size:14px;font-weight:600;text-align:right;">A$15 <span style="color:#4ADE80;font-size:12px;">Save 70%</span></td></tr>
            </table>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">Credits never expire. Use them for analyses, AI evidence reviews, and full reports.`,
    ctaLabel: "Unlock Full Analysis \u2014 from A$0.50",
    ctaUrl: billingUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "unlock_deeper_7d"));
  return sendEmail({
    to: args.to,
    subject: `What investors will see in your ${args.stageLabel} startup`,
    html,
    unsubscribeUrl,
  });
}

// ---------- Weekly SVI Summary ------------------------------------------------

export async function sendWeeklySVISummary(args: {
  to: string;
  name?: string | null;
  svi: number;
  delta: number;
  evidenceCount: number;
  evidenceGaps: { label: string; impact: number }[];
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";

  const deltaStr = args.delta > 0 ? `+${args.delta}` : args.delta === 0 ? "no change" : `${args.delta}`;
  const deltaColor = args.delta > 0 ? "#4ADE80" : args.delta === 0 ? "#94A3B8" : "#F87171";

  // Build recommended next actions from evidence gaps
  const topGaps = args.evidenceGaps.slice(0, 3);
  const actionRows = topGaps.map((g) => `
    <tr>
      <td style="padding:6px 8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#8226;</td>
      <td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(g.label)} <span style="color:#4ADE80;font-size:12px;font-weight:600;">(+${g.impact} pts)</span></td>
    </tr>`).join("");

  const html = shell(nurtureCard({
    tagline: "BlockID — Weekly Summary",
    headline: `SVI ${args.svi} (${deltaStr})`,
    body: `${greeting} here is your weekly startup summary.`,
    ctaLabel: "View Dashboard",
    ctaUrl: dashUrl,
    extra: `
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Current SVI</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:56px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
            <p style="margin:4px 0 0 0;font-size:14px;color:${deltaColor};font-weight:600;">${deltaStr} this week</p>
          </div>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">This week</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">Evidence items uploaded</td><td style="padding:4px 8px;color:#3B7DD8;font-size:14px;font-weight:600;text-align:right;">${args.evidenceCount}</td></tr>
            </table>
          </div>
          ${topGaps.length > 0 ? `
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Recommended next actions</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
            ${actionRows}
          </table>` : ""}
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${evidenceUrl}" style="display:inline-block;background:transparent;color:#3B7DD8;font-weight:600;text-decoration:underline;padding:8px 16px;font-size:14px;">Upload More Evidence</a>
          </p>`,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "weekly_summary"));
  return sendEmail({
    to: args.to,
    subject: `Your startup this week: SVI ${args.svi} (${deltaStr})`,
    html,
    unsubscribeUrl,
  });
}

// ---------- Credit low alert ---------------------------------------------------

export async function sendCreditLowAlert(args: {
  to: string;
  currentBalance: number;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "svi_alerts"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const buyUrl = `${siteUrl()}/workspace/billing#credits`;
  const balanceStr = args.currentBalance % 1 === 0
    ? String(args.currentBalance)
    : args.currentBalance.toFixed(2);
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Credits Running Low</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your Credits Are Running Low</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">You have <strong style="color:#FBBF24;">${escapeHtml(balanceStr)} credits</strong> remaining. Your next SVI analysis costs 0.50 credits, so now is a great time to top up.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Current balance</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:48px;font-weight:600;color:#FBBF24;line-height:1;">${escapeHtml(balanceStr)}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">credits remaining</p>
          </div>
          <div style="background:#1F2A44;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px 0;">
            <p style="margin:0 0 4px 0;color:#F8FAFC;font-size:16px;font-weight:600;">Buy 10 credits for A$5</p>
            <p style="margin:0 0 16px 0;color:#94A3B8;font-size:13px;">That's 20 standard SVI analyses</p>
            <a href="${buyUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:15px;">Buy Credits</a>
          </div>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 24px 0;">
            <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Credit costs</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 8px;color:#94A3B8;font-size:13px;">SVI Analysis</td><td style="padding:4px 8px;color:#F8FAFC;font-size:13px;text-align:right;font-family:'IBM Plex Mono',monospace;">0.50</td></tr>
              <tr><td style="padding:4px 8px;color:#94A3B8;font-size:13px;">R&amp;D Report</td><td style="padding:4px 8px;color:#F8FAFC;font-size:13px;text-align:right;font-family:'IBM Plex Mono',monospace;">1.00</td></tr>
              <tr><td style="padding:4px 8px;color:#94A3B8;font-size:13px;">Deep Dive</td><td style="padding:4px 8px;color:#F8FAFC;font-size:13px;text-align:right;font-family:'IBM Plex Mono',monospace;">1.50</td></tr>
            </table>
          </div>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${unsubFooter(unsubscribeUrl, preferencesUrl)}`);
  return sendEmail({ to: args.to, subject: "Your BlockID Credits Are Running Low", html, unsubscribeUrl });
}

// ---------- Inactive user re-engagement emails --------------------------------

export async function sendReengagement30d(args: {
  to: string;
  name?: string | null;
  svi?: number | null;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const sviUrl = `${siteUrl()}/#svi`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";

  const sviBlock = args.svi != null ? `
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Your last SVI score</p>
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:56px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">Has your startup changed in 30 days?</p>
          </div>` : "";

  const html = shell(nurtureCard({
    tagline: "BlockID — We Miss You",
    headline: "Your Startup Score Might Have Changed",
    body: `${greeting} a lot can change in 30 days — new traction, updated financials, fresh evidence. Your SVI score may no longer reflect where you really are.</p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Re-analyze your startup for free and see your updated position.`,
    ctaLabel: "Check Your Score Now",
    ctaUrl: sviUrl,
    extra: sviBlock,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "reengagement_30d"));
  return sendEmail({ to: args.to, subject: "Your startup score might have changed", html, unsubscribeUrl });
}

export async function sendReengagement60d(args: {
  to: string;
  name?: string | null;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";
  const html = shell(nurtureCard({
    tagline: "BlockID — New Features",
    headline: "New Features Since You Last Visited",
    body: `${greeting} we have been busy building tools to help your startup grow. Here is what is new since your last visit:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr>
              <td style="padding:8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#10003;</td>
              <td style="padding:8px;color:#F8FAFC;font-size:14px;"><strong>Evidence Vault</strong> — securely upload pitch decks, financials, and traction data to boost your score</td>
            </tr>
            <tr>
              <td style="padding:8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#10003;</td>
              <td style="padding:8px;color:#F8FAFC;font-size:14px;"><strong>Cap Table Manager</strong> — model equity splits, dilution, and ESOP allocations in seconds</td>
            </tr>
            <tr>
              <td style="padding:8px;color:#3B7DD8;font-size:14px;vertical-align:top;width:20px;">&#10003;</td>
              <td style="padding:8px;color:#F8FAFC;font-size:14px;"><strong>Competitive Research</strong> — AI-powered landscape analysis to see how you stack up</td>
            </tr>
          </table>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Come back and explore what has changed.`,
    ctaLabel: "See What's New",
    ctaUrl: dashUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "reengagement_60d"));
  return sendEmail({ to: args.to, subject: "New features since you last visited BlockID", html, unsubscribeUrl });
}

export async function sendReengagement90d(args: {
  to: string;
  name?: string | null;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "promotions"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const sviUrl = `${siteUrl()}/#svi`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";
  const html = shell(nurtureCard({
    tagline: "BlockID — Welcome Back",
    headline: "Your Data Is Safe — Come Back Anytime",
    body: `${greeting} it has been a while since we last saw you. We wanted to reassure you that all your data — SVI analyses, evidence, equity models — is safe and waiting for you.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Your data is secure</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#128274;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">All analyses and documents are encrypted and stored securely</td></tr>
              <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#128274;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Your equity models and cap tables are preserved exactly as you left them</td></tr>
              <tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#128274;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">Evidence uploads and SVI history are always available</td></tr>
            </table>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">As a welcome back gift, re-analyze your startup for free and see how things have changed in the market.`,
    ctaLabel: "Welcome Back",
    ctaUrl: sviUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "reengagement_90d"));
  return sendEmail({ to: args.to, subject: "Your data is safe — come back anytime", html, unsubscribeUrl });
}

// ---------- Weekly Insight Digest -------------------------------------------

export async function sendInsightDigest(args: {
  to: string;
  name?: string | null;
  insights: { title: string; summary: string }[];
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";

  const insightRows = args.insights.slice(0, 3).map((ins) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1F2A44;">
        <p style="margin:0 0 4px 0;color:#F8FAFC;font-size:15px;font-weight:600;">${escapeHtml(ins.title)}</p>
        <p style="margin:0;color:#94A3B8;font-size:13px;line-height:1.5;">${escapeHtml(ins.summary)}</p>
      </td>
    </tr>`).join("");

  const html = shell(nurtureCard({
    tagline: "BlockID — Weekly Insights",
    headline: `${args.insights.length} New Insight${args.insights.length === 1 ? "" : "s"} for You`,
    body: `${greeting} you have new insights waiting on your dashboard. Here is a quick look at the top highlights from the past week.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Your insights</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${insightRows}
            </table>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">View all your insights on the dashboard for personalised recommendations.`,
    ctaLabel: "View All Insights on Dashboard",
    ctaUrl: dashUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "insight_digest"));
  return sendEmail({
    to: args.to,
    subject: `${args.insights.length} new insight${args.insights.length === 1 ? "" : "s"} for your startup`,
    html,
    unsubscribeUrl,
  });
}

// --- Section 9: Weekly Action Reminder ---------------------------------------

export async function sendActionReminder(args: {
  to: string;
  name?: string | null;
  actionTitle: string;
  actionDetail: string;
  actionImpact: string;
}): Promise<SendResult> {
  if (!(await canSendEmail(args.to, "product_updates"))) return { ok: false, reason: "unsubscribed" };
  const { unsubscribeUrl, preferencesUrl } = await prepareUnsubscribe(args.to);
  const dashUrl = `${siteUrl()}/dashboard`;
  const greeting = args.name ? `Hi ${escapeHtml(args.name!)},` : "Hi,";

  const html = shell(nurtureCard({
    tagline: "BlockID — Action Plan",
    headline: escapeHtml(args.actionTitle),
    body: `${greeting} you have an uncompleted action that could meaningfully improve your startup score.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:20px;margin:0 0 16px 0;">
            <p style="margin:0 0 4px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Next action</p>
            <p style="margin:0 0 8px 0;color:#F8FAFC;font-size:16px;font-weight:600;">${escapeHtml(args.actionTitle)}</p>
            <p style="margin:0 0 12px 0;color:#94A3B8;font-size:14px;line-height:1.6;">${escapeHtml(args.actionDetail)}</p>
            <p style="margin:0;color:#4ADE80;font-size:14px;font-weight:600;">Estimated impact: ${escapeHtml(args.actionImpact)}</p>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">Complete this action on your dashboard to see your score improve.`,
    ctaLabel: "Complete This Action",
    ctaUrl: dashUrl,
  }) + unsubFooter(unsubscribeUrl, preferencesUrl) + nurturePx(args.to, "action_reminder"));
  return sendEmail({
    to: args.to,
    subject: `Your next step: ${args.actionTitle}`,
    html,
    unsubscribeUrl,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
