// BlockID email wrapper (server-only).
//
// Uses Gmail SMTP via Nodemailer (admin@blockid.au relay).
// Falls back to Resend if RESEND_API_KEY is set.
// Graceful degradation: if neither is configured, log + return
// { ok: false, reason: 'not_configured' }.

import "server-only";
import nodemailer from "nodemailer";

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
  | { ok: false; reason: "not_configured" | "send_error"; error?: unknown };

// ---------- Core send function ------------------------------------------------

async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[blockid:email] SMTP not configured, skipping", { to: args.to, subject: args.subject });
    return { ok: false, reason: "not_configured" };
  }
  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    console.log("[blockid:email] sent", { to: args.to, messageId: info.messageId });
    return { ok: true, id: info.messageId ?? "" };
  } catch (error) {
    console.error("[blockid:email] send failed", error);
    return { ok: false, reason: "send_error", error };
  }
}

// ---------- score-ready --------------------------------------------------------

export async function sendScoreReady(args: {
  to: string;
  slug: string;
  totalScore: number;
  companyName?: string | null;
}): Promise<SendResult> {
  const url = `${siteUrl()}/s/${args.slug}`;
  const html = scoreReadyHtml({ ...args, url });
  return sendEmail({ to: args.to, subject: "Your Investor-Ready Score is ready", html });
}

// ---------- magic-link --------------------------------------------------------
//
// Sent in two situations: (1) "Save Founder Pack" gate fires after a user
// completes ≥2 idea-phase tools and submits their email; (2) plain login
// for a returning user. Same template, intent-aware copy.

export async function sendMagicLink(args: {
  to: string;
  token: string;
  intent: "save_founder_pack" | "login";
  ttlMinutes: number;
}): Promise<SendResult> {
  const url = `${siteUrl()}/auth/verify?token=${encodeURIComponent(args.token)}`;
  const html = magicLinkHtml({ ...args, url });
  const subject =
    args.intent === "save_founder_pack"
      ? "Save your BlockID Founder Pack"
      : "Sign in to BlockID";

  if (!isSmtpConfigured()) {
    // Dev fallback: print verify URL to console
    console.warn("[blockid:email] SMTP not configured — verify URL:", url);
    return { ok: false, reason: "not_configured" };
  }

  return sendEmail({ to: args.to, subject, html });
}

function magicLinkHtml(args: {
  url: string;
  intent: "save_founder_pack" | "login";
  ttlMinutes: number;
}): string {
  const headline =
    args.intent === "save_founder_pack"
      ? "Save your Founder Pack"
      : "Sign in to BlockID";
  const sub =
    args.intent === "save_founder_pack"
      ? "Click the button below to save your Founder Pack and create your free BlockID account. The link is single-use and expires in " +
        args.ttlMinutes +
        " minutes."
      : "Click the button below to sign in. The link is single-use and expires in " +
        args.ttlMinutes +
        " minutes.";
  const cta =
    args.intent === "save_founder_pack" ? "Save my Founder Pack" : "Sign in";
  return shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(headline)}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${escapeHtml(sub)}</p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${args.url}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">${escapeHtml(cta)}</a>
          </p>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Or paste this URL</p>
          <p style="margin:0 0 24px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#94A3B8;word-break:break-all;">${args.url}</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">If you didn't request this email, you can safely ignore it — no account will be created.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
}

// ---------- score-viewed -------------------------------------------------------

export async function sendScoreViewed(args: {
  to: string;
  slug: string;
  viewerLabel?: string;
  companyName?: string | null;
}): Promise<SendResult> {
  const url = `${siteUrl()}/s/${args.slug}`;
  const html = scoreViewedHtml({ ...args, url });
  return sendEmail({ to: args.to, subject: "Your score was just viewed", html });
}

// ---------- HTML templates -----------------------------------------------------
//
// Inline-style only. BlockID navy/brand-blue palette. No emoji. No external CSS so
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
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Investor-Ready Score</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(co)}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your Investor-Ready Score has been generated. Share the link below with investors — they can open it without signing up.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:#3B7DD8;line-height:1;">${args.totalScore}<span style="color:#64748B;font-size:24px;">/100</span></div>
          </div>
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;text-transform:uppercase;letter-spacing:0.15em;">Share link</p>
          <p style="margin:0 0 24px 0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#F8FAFC;word-break:break-all;">${args.url}</p>
          <p style="margin:0;text-align:center;">
            <a href="${args.url}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View score</a>
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
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Activity</p>
          <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">${escapeHtml(co)} was just viewed</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your Investor-Ready Score share link was opened ${escapeHtml(who)} at ${escapeHtml(when)}.</p>
          <p style="margin:0;text-align:center;">
            <a href="${args.url}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">See activity</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:32px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">You're receiving this because you generated a BlockID Investor-Ready Score share link.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
}

// ---------- SVI welcome email ------------------------------------------------

export async function sendSVIWelcome(args: {
  to: string;
  name?: string | null;
  svi: number;
  stage: number;
}): Promise<SendResult> {
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const stageLabels = ["Concept", "Validated Idea", "MVP", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"];
  const stageLabel = stageLabels[args.stage] ?? "Concept";
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Welcome</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;">Welcome to BlockID${args.name ? `, ${escapeHtml(args.name)}` : ""}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your Startup Value Index baseline is ready. Here's where you stand:</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:56px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">SVI Score — ${escapeHtml(stageLabel)} Stage</p>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">Add evidence (pitch deck, revenue proof, cap table) to grow your score. Each piece of verified evidence lifts your SVI and strengthens your investor readiness.</p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View your dashboard</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({ to: args.to, subject: "Welcome to BlockID — Your SVI Baseline is Ready", html });
}

// ---------- SVI weekly report email ------------------------------------------

export async function sendSVIWeeklyReport(args: {
  to: string;
  name?: string | null;
  svi: number;
  delta: number | null;
  weekNum: number;
}): Promise<SendResult> {
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const deltaStr = args.delta != null
    ? (args.delta >= 0 ? `+${args.delta}` : `${args.delta}`)
    : "No change";
  const deltaColor = args.delta != null && args.delta >= 0 ? "#4ADE80" : "#F87171";
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Week ${args.weekNum} Report</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;">Your Weekly SVI Update</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Here's how your Startup Value Index changed this week${args.name ? `, ${escapeHtml(args.name)}` : ""}.</p>
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:48px;font-weight:600;color:#3B7DD8;line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;color:${deltaColor};">${escapeHtml(deltaStr)} this week</p>
          </div>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">${args.delta != null && args.delta > 0
            ? "Great progress! Keep adding evidence to maintain momentum."
            : args.delta != null && args.delta < 0
              ? "Your score dipped. Review your evidence gaps and add new proof to recover."
              : "Your score held steady. Add new evidence to push it higher."}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${dashUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">View Dashboard</a>
              </td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${evidenceUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">Add Evidence</a>
              </td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({ to: args.to, subject: `Week ${args.weekNum} SVI Report — ${deltaStr} points`, html });
}

// ---------- SVI Report email -------------------------------------------------

export async function sendSVIReport(args: {
  to: string;
  slug: string;
  rawInput?: string;
  analysis: {
    totalSVI: number;
    stageLabel: string;
    subs: { label: string; value: number }[];
    evidenceGaps: { label: string; action: string }[];
  };
}): Promise<SendResult> {
  const reportUrl = `${siteUrl()}/s/${args.slug}`;
  const loginUrl = `${siteUrl()}/auth/login`;
  const trackUrl = `${siteUrl()}/api/track/open?slug=${args.slug}&email=${encodeURIComponent(args.to)}`;

  // Truncate raw input for email summary (max 300 chars)
  const ideaSummary = args.rawInput
    ? escapeHtml(args.rawInput.replace(/^File:.*\n/, "").trim().slice(0, 300)) + (args.rawInput.length > 300 ? "..." : "")
    : null;

  const strengths = args.analysis.subs
    .filter((s) => s.value >= 60)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const gaps = args.analysis.evidenceGaps.slice(0, 3);

  const strengthRows = strengths
    .map(
      (s) =>
        `<tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(s.label)} <span style="color:#64748B;">(${s.value}/100)</span></td></tr>`,
    )
    .join("");

  const gapRows = gaps
    .map(
      (g) =>
        `<tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(g.label)}: <span style="color:#94A3B8;">${escapeHtml(g.action)}</span></td></tr>`,
    )
    .join("");

  const ideaSummaryHtml = ideaSummary ? `
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Your Idea</p>
            <p style="margin:0;color:#CBD5E1;font-size:13px;line-height:1.6;font-style:italic;">&ldquo;${ideaSummary}&rdquo;</p>
          </div>
  ` : "";

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Startup Value Report</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your Startup Value Report is Ready</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Your SVI analysis is complete. Here is your headline score and key findings.</p>
          ${ideaSummaryHtml}
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:#3B7DD8;line-height:1;">${args.analysis.totalSVI}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">SVI Score — ${escapeHtml(args.analysis.stageLabel)} Stage</p>
          </div>
          ${strengths.length > 0 ? `
          <p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Strengths</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${strengthRows}</table>
          ` : ""}
          ${gaps.length > 0 ? `
          <p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Evidence Gaps</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${gapRows}</table>
          ` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;">
            <tr>
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${reportUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">View Full Report</a>
              </td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${loginUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">Sign in to Dashboard</a>
              </td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
          <p style="margin:0;color:#64748B;font-size:11px;line-height:1.5;">You can sign in with Google or via a magic link sent to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <img src="${trackUrl}" width="1" height="1" alt="" style="display:none;" />`);
  return sendEmail({ to: args.to, subject: "Your BlockID Startup Value Report is Ready", html });
}

// ---------- SVI Share email --------------------------------------------------

export async function sendSVIShare(args: {
  to: string;
  senderName?: string | null;
  slug: string;
  svi: number;
}): Promise<SendResult> {
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
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${reportUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Full Report</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: `${sender} shared their BlockID Startup Value Report with you`,
    html,
  });
}

// ---------- Analysis purchase confirmation --------------------------------------

export async function sendAnalysisPurchaseConfirmation(args: {
  to: string;
}): Promise<SendResult> {
  const homeUrl = siteUrl();
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Purchase Confirmed</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your SVI Analysis Credit Has Been Added</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Thank you for your purchase. Your analysis credit is ready to use. Return to BlockID to run your analysis.</p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${homeUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;">Run Your Analysis</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: "Your SVI Analysis Credit Has Been Added",
    html,
  });
}

// ---------- Credit pack purchase confirmation -----------------------------------

export async function sendCreditPurchaseConfirmation(args: {
  to: string;
  credits: number;
}): Promise<SendResult> {
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
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${billingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Your Credits</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: `${args.credits} Credits Added to Your BlockID Account`,
    html,
  });
}

// ---------- Subscription cancelled (webhook-triggered) -------------------------

export async function sendSubscriptionCancelled(args: {
  to: string;
}): Promise<SendResult> {
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
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${pricingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Resubscribe with 30% Off</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: "Your BlockID Subscription Has Ended",
    html,
  });
}

// ---------- Payment confirmation ------------------------------------------------

export async function sendPaymentConfirmation(args: {
  to: string;
  planName: string;
}): Promise<SendResult> {
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
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${dashUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">Open Dashboard</a>
              </td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${sviUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">Get SVI Score</a>
              </td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: "Payment Confirmed \u2014 Your BlockID Account is Active",
    html,
  });
}

// ---------- Founding 50 payment link ------------------------------------------

export async function sendPaymentLink(args: {
  to: string;
  name: string;
  checkoutUrl: string;
  finalPrice: number;
  features: string[];
}): Promise<SendResult> {
  const featuresHtml = args.features
    .map(
      (f) =>
        `<tr><td style="padding:4px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:4px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(f)}</td></tr>`,
    )
    .join("");

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
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${args.checkoutUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;">Complete Payment</a>
          </p>
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
  </table>`);

  return sendEmail({
    to: args.to,
    subject: "Complete Your BlockID Founding 50 Payment",
    html,
  });
}

// ---------- Payment failed -------------------------------------------------------

export async function sendPaymentFailed(args: {
  to: string;
}): Promise<SendResult> {
  const billingUrl = `${siteUrl()}/dashboard`;
  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Action Required</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Payment Failed</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">We were unable to process your latest payment. Please update your payment method to keep your plan active.</p>
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${billingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Update Payment Method</a>
          </p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">If you believe this is an error, please reply to this email and we will investigate.</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: "Payment Failed \u2014 Please Update Your Payment Method",
    html,
  });
}

// ---------- Payment receipt (recurring) -----------------------------------------

export async function sendPaymentReceipt(args: {
  to: string;
  amountCents: number;
  currency?: string;
}): Promise<SendResult> {
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
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Go to Dashboard</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: `Payment Receipt \u2014 ${amountFormatted}`,
    html,
  });
}

// ---------- Cancellation email with retention offer -----------------------------

export async function sendCancellationEmail(args: {
  to: string;
  activeUntil: string;
}): Promise<SendResult> {
  const pricingUrl = `${siteUrl()}/#pricing`;
  const formattedDate = new Date(args.activeUntil).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${pricingUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">Resubscribe with 30% Off</a>
          </p>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:14px;line-height:1.6;">You will continue to have full access until your plan expires. After that, your account will be downgraded to the free tier.</p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);
  return sendEmail({
    to: args.to,
    subject: "We\u2019re Sorry to See You Go",
    html,
  });
}

// ---------- Growth report email ------------------------------------------------

export async function sendGrowthReport(args: {
  to: string;
  date: string;
  metrics: {
    totalUsers: number;
    newUsersWeek: number;
    newUsersToday: number;
    sviWeek: number;
    sviToday: number;
    leadsWeek: number;
    leadsToday: number;
    totalAccounts: number;
    payingUsers: number;
    evidenceWeek: number;
    scoresViewedWeek: number;
    avgSVI: number;
    avgDelta: number;
    uniqueEmails: number;
    signupRate: number;
    paymentRate: number;
    planDist: Record<string, number>;
    toolUsage: Record<string, number>;
    biggestDropOff: string;
    dropOffRate: number;
  };
  recommendations: Array<{
    priority: "critical" | "high" | "medium";
    title: string;
    detail: string;
    impact: string;
    action_type: string;
  }>;
}): Promise<SendResult> {
  const dashUrl = `${siteUrl()}/admin/growth`;
  const m = args.metrics;

  const priorityColor: Record<string, string> = {
    critical: "#F87171",
    high: "#FBBF24",
    medium: "#94A3B8",
  };

  const metricRows = [
    { label: "Total Users", value: String(m.totalUsers), sub: `+${m.newUsersWeek} this week` },
    { label: "SVI Analyses", value: String(m.sviWeek), sub: `${m.sviToday} today` },
    { label: "Leads Captured", value: String(m.leadsWeek), sub: `${m.leadsToday} today` },
    { label: "Paying Users", value: String(m.payingUsers), sub: `of ${m.totalAccounts} accounts` },
    { label: "Avg SVI Score", value: String(m.avgSVI), sub: `${m.avgDelta >= 0 ? "+" : ""}${m.avgDelta} avg delta` },
  ].map(
    (r) =>
      `<tr>
        <td style="padding:8px 12px;color:#94A3B8;font-size:13px;border-bottom:1px solid #1F2A44;">${escapeHtml(r.label)}</td>
        <td style="padding:8px 12px;font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;color:#F8FAFC;text-align:right;border-bottom:1px solid #1F2A44;">${escapeHtml(r.value)}</td>
        <td style="padding:8px 12px;color:#64748B;font-size:12px;text-align:right;border-bottom:1px solid #1F2A44;">${escapeHtml(r.sub)}</td>
      </tr>`,
  ).join("");

  const conversionRows = [
    { label: "Signup Rate", value: `${m.signupRate}%` },
    { label: "Payment Rate", value: `${m.paymentRate}%` },
  ].map(
    (r) =>
      `<tr>
        <td style="padding:6px 12px;color:#94A3B8;font-size:13px;">${escapeHtml(r.label)}</td>
        <td style="padding:6px 12px;font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:600;color:#3B7DD8;text-align:right;">${escapeHtml(r.value)}</td>
      </tr>`,
  ).join("");

  const dropOffHtml = m.biggestDropOff
    ? `<p style="margin:16px 0 0 0;color:#F87171;font-size:13px;">Biggest drop-off: <strong style="color:#F8FAFC;">${escapeHtml(m.biggestDropOff)}</strong> (${m.dropOffRate}%)</p>`
    : "";

  const recRows = args.recommendations.map(
    (r) =>
      `<tr>
        <td style="padding:8px 12px;vertical-align:top;width:70px;border-bottom:1px solid #1F2A44;">
          <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#0B1220;background:${priorityColor[r.priority] ?? "#94A3B8"};">${escapeHtml(r.priority)}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1F2A44;">
          <p style="margin:0 0 4px 0;color:#F8FAFC;font-size:14px;font-weight:600;">${escapeHtml(r.title)}</p>
          <p style="margin:0 0 4px 0;color:#94A3B8;font-size:13px;line-height:1.5;">${escapeHtml(r.detail)}</p>
          <p style="margin:0;color:#4ADE80;font-size:12px;">Impact: ${escapeHtml(r.impact)}</p>
        </td>
      </tr>`,
  ).join("");

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Growth Report</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Daily Growth Summary</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${escapeHtml(args.date)}</p>

          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Key Metrics</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;margin:0 0 24px 0;">
            ${metricRows}
          </table>

          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Conversion Rates</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;margin:0 0 8px 0;">
            ${conversionRows}
          </table>
          ${dropOffHtml}

          ${args.recommendations.length > 0 ? `
          <p style="margin:24px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">AI Recommendations</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;margin:0 0 24px 0;">
            ${recRows}
          </table>
          ` : ""}

          <p style="margin:24px 0 0 0;text-align:center;">
            <a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Growth Dashboard</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);

  return sendEmail({
    to: args.to,
    subject: `BlockID Growth Report \u2014 ${args.date}`,
    html,
  });
}

// ---------- SVI weekly review email -------------------------------------------

export async function sendSVIReview(args: {
  to: string;
  name?: string | null;
  svi: number;
  stage: number;
  stageLabel: string;
  wins: string[];
  gaps: Array<{ label: string; action: string; impact: number }>;
  projectedSvi: number;
  weekNum: number;
}): Promise<SendResult> {
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;

  // Score color based on value
  const scoreColor =
    args.svi >= 140
      ? "#4ADE80"
      : args.svi >= 100
        ? "#3B7DD8"
        : "#FBBF24";

  // Stage progress: what the next stage is and how far away
  const nextStageIdx = Math.min(args.stage + 1, 7);
  const stageLabels = [
    "Concept",
    "Validated Idea",
    "MVP",
    "Early Traction",
    "Revenue",
    "Growth",
    "Scale",
    "Corporation",
  ];
  const nextStageLabel = stageLabels[nextStageIdx] ?? "Corporation";

  // Win rows (green checkmarks)
  const winRows = args.wins
    .map(
      (w) =>
        `<tr><td style="padding:6px 8px;color:#4ADE80;font-size:14px;vertical-align:top;width:20px;">&#10003;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(w)}</td></tr>`,
    )
    .join("");

  // Gap rows (amber warnings with action + impact)
  const gapRows = args.gaps
    .map(
      (g) =>
        `<tr><td style="padding:6px 8px;color:#FBBF24;font-size:14px;vertical-align:top;width:20px;">&#9888;</td><td style="padding:6px 8px;color:#F8FAFC;font-size:14px;">${escapeHtml(g.label)}<br><span style="color:#94A3B8;font-size:13px;">${escapeHtml(g.action)}</span> <span style="color:#4ADE80;font-size:12px;font-weight:600;">+${g.impact} SVI</span></td></tr>`,
    )
    .join("");

  // Projected score bar
  const projectedHtml =
    args.projectedSvi > args.svi
      ? `
          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:16px;margin:0 0 24px 0;">
            <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Projected Score</p>
            <p style="margin:0 0 12px 0;color:#F8FAFC;font-size:15px;">Your SVI could reach <strong style="color:#4ADE80;">${args.projectedSvi}</strong> by completing the actions above.</p>
            <div style="background:#1F2A44;border-radius:6px;height:8px;overflow:hidden;">
              <div style="background:linear-gradient(90deg,#3B7DD8,#4ADE80);height:100%;width:${Math.min(100, Math.round((args.svi / Math.max(args.projectedSvi, 1)) * 100))}%;border-radius:6px;"></div>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0 0;">
              <tr>
                <td style="color:#94A3B8;font-size:11px;">Current: ${args.svi}</td>
                <td style="color:#4ADE80;font-size:11px;text-align:right;">Target: ${args.projectedSvi} (+${args.projectedSvi - args.svi})</td>
              </tr>
            </table>
          </div>`
      : "";

  const html = shell(`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1220;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#3B7DD8;font-weight:500;">BlockID — Week ${args.weekNum} Review</p>
          <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:600;color:#F8FAFC;letter-spacing:-0.01em;">Your Weekly SVI Review${args.name ? `, ${escapeHtml(args.name)}` : ""}</h1>
          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">Here is your personalised Startup Value Index review with specific actions to grow your score.</p>

          <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:12px;padding:24px;text-align:center;margin:0 0 16px 0;">
            <div style="font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:64px;font-weight:600;color:${scoreColor};line-height:1;">${args.svi}</div>
            <p style="margin:8px 0 0 0;color:#94A3B8;font-size:13px;">SVI Score — ${escapeHtml(args.stageLabel)} Stage</p>
            <p style="margin:4px 0 0 0;color:#64748B;font-size:12px;">Next stage: ${escapeHtml(nextStageLabel)}</p>
          </div>

          ${args.wins.length > 0 ? `
          <p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Top Strengths</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${winRows}</table>
          ` : ""}

          ${args.gaps.length > 0 ? `
          <p style="margin:16px 0 8px 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#64748B;font-weight:500;">Priority Actions</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${gapRows}</table>
          ` : ""}

          ${projectedHtml}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;">
            <tr>
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${evidenceUrl}" style="display:inline-block;width:100%;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">Upload Evidence</a>
              </td>
              <td width="4%"></td>
              <td width="48%" style="text-align:center;padding:4px;">
                <a href="${dashUrl}" style="display:inline-block;width:100%;background:#1F2A44;color:#F8FAFC;font-weight:600;text-decoration:none;padding:12px 0;border-radius:10px;font-size:14px;">View Dashboard</a>
              </td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
          <p style="margin:0;color:#64748B;font-size:11px;line-height:1.5;">You are receiving this because you have an SVI analysis on BlockID. To stop these emails, reply with "unsubscribe".</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);

  return sendEmail({
    to: args.to,
    subject: `Week ${args.weekNum} SVI Review — Score: ${args.svi} | ${args.stageLabel} Stage`,
    html,
  });
}

// ---------- SVI milestone celebration email ----------------------------------

export async function sendMilestoneEmail(args: {
  to: string;
  name?: string | null;
  badge: string;
  badgeLabel: string;
  message: string;
}): Promise<SendResult> {
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
            <div style="display:inline-block;width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#3B7DD8,#4ADE80);line-height:80px;margin:0 0 16px 0;">
              <span style="font-size:36px;color:#0B1220;font-weight:700;">&#9733;</span>
            </div>
            <p style="margin:0;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-size:16px;font-weight:600;color:#4ADE80;text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(args.badge.replace(/_/g, " "))}</p>
          </div>

          <p style="margin:0 0 24px 0;color:#94A3B8;font-size:15px;line-height:1.6;">${escapeHtml(args.message)}</p>

          <p style="margin:0 0 24px 0;text-align:center;">
            <a href="${dashUrl}" style="display:inline-block;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;">View Your Dashboard</a>
          </p>
          <hr style="border:none;border-top:1px solid #1F2A44;margin:24px 0 16px 0;">
          <p style="margin:0 0 8px 0;color:#64748B;font-size:12px;">BlockID.au — Valuation. Ownership. Execution. Growth.</p>
          <p style="margin:0;color:#64748B;font-size:11px;line-height:1.5;">You are receiving this because you reached a milestone on BlockID. To stop these emails, reply with "unsubscribe".</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`);

  return sendEmail({
    to: args.to,
    subject: `${args.badgeLabel} — BlockID Milestone`,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
