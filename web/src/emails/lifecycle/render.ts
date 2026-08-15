// Lifecycle email templates (T-0414).
//
// Visual upgrade: BlockID brand palette (navy + cyan), stat-card grid,
// progress steps, and value-focused copy. Tables used throughout for broad
// email-client compatibility (Outlook 2016+, Gmail, Apple Mail).

import type { LifecycleStep } from "@/lib/conversion/lifecycle";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://blockid.au";

export interface LifecycleEmailInput {
  step: LifecycleStep;
  firstName?: string | null;
  trialEndsAt?: string | null;
  planLabel?: string | null;
  unsubscribeUrl?: string | null;
  /** Optional variant from experiments (e.g. day5_email_subject). */
  variant?: string | null;
  /** SVI score at send time — used in personalised bodies. */
  sviScore?: number | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

const SUBJECTS: Record<LifecycleStep, string> = {
  day0: "Welcome to BlockID — 3 steps to your first score",
  day3: "Ready to run your first Investor-Ready Score?",
  day5: "Your BlockID trial ends in 2 days",
  day6: "Last day of your BlockID trial",
  day7: "Your trial ends today — confirm your plan",
  day14: "One week later — how did the raise go?",
  winback: "Come back to BlockID — 30% off for 3 months",
  done: "",
};

function subjectFor(step: LifecycleStep, variant?: string | null, firstName?: string | null): string {
  if (step === "day5") {
    switch (variant) {
      case "curiosity":    return "One quick question about your trial";
      case "personalised": return firstName ? `${firstName}, your BlockID trial ends in 2 days` : SUBJECTS.day5;
      case "benefit":
      default:             return "Keep your cap table + investor links live";
    }
  }
  return SUBJECTS[step];
}

// ─── Shared design tokens ─────────────────────────────────────────────────────

const T = {
  navyDeep:  "#0B0F2A",
  navyMid:   "#131938",
  navyLight: "#1A2247",
  cyan:      "#22D3EE",
  cyanDim:   "#0891B2",
  blue:      "#3B82F6",
  white:     "#ffffff",
  textPrimary:   "#0f172a",
  textSecondary: "#475569",
  textMuted:     "#94a3b8",
  emerald:       "#059669",
  amber:         "#d97706",
  cardBg:        "#f8fafc",
  border:        "#e2e8f0",
};

// ─── Layout primitives ────────────────────────────────────────────────────────

/** Brand header — dark navy with logo. */
function brandHeader(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.navyDeep};border-radius:16px 16px 0 0">
      <tr>
        <td style="padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <img src="${APP_URL}/logo.svg" alt="BlockID" width="130" height="auto"
                     style="display:block;height:auto" />
              </td>
              <td align="right" style="vertical-align:middle">
                <span style="font-size:11px;color:${T.cyan};letter-spacing:0.08em;text-transform:uppercase;font-weight:600">
                  Startup Intelligence Platform
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/** Cyan accent strip between header and body. */
function accentStrip(): string {
  return `<div style="height:3px;background:linear-gradient(90deg,${T.cyan},${T.blue});border-radius:0"></div>`;
}

/** 3-column stat card grid (table-based for Outlook compatibility). */
function statGrid(stats: Array<{ value: string; label: string; color?: string }>): string {
  const cells = stats.map(s => `
    <td width="33%" style="padding:4px">
      <div style="background:${T.cardBg};border:1px solid ${T.border};border-radius:10px;padding:14px 10px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:${s.color ?? T.textPrimary};line-height:1.2">${s.value}</div>
        <div style="font-size:11px;color:${T.textSecondary};margin-top:3px;line-height:1.4">${s.label}</div>
      </div>
    </td>`).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
      <tr>${cells}</tr>
    </table>`;
}

/** Numbered step list with cyan numbers. */
function stepList(steps: string[]): string {
  const rows = steps.map((s, i) => `
    <tr>
      <td width="28" valign="top" style="padding-top:2px">
        <div style="width:22px;height:22px;border-radius:50%;background:${T.navyDeep};color:${T.cyan};font-size:11px;font-weight:700;text-align:center;line-height:22px">${i + 1}</div>
      </td>
      <td style="padding:0 0 10px 8px;font-size:14px;color:${T.textPrimary};line-height:1.5">${s}</td>
    </tr>`).join("");
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">
      ${rows}
    </table>`;
}

/** CTA button. */
function ctaButton(label: string, href: string, primary = true): string {
  const bg = primary ? T.navyDeep : T.cardBg;
  const color = primary ? T.cyan : T.textPrimary;
  const border = primary ? "none" : `1px solid ${T.border}`;
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0">
      <tr>
        <td>
          <a href="${href}"
             style="display:inline-block;background:${bg};color:${color};text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;border:${border};letter-spacing:0.01em">
            ${label} →
          </a>
        </td>
      </tr>
    </table>`;
}

/** Highlight box (value callout). */
function highlightBox(text: string, emoji = "💡"): string {
  return `
    <div style="background:${T.navyDeep};border-radius:10px;padding:16px 20px;margin:20px 0;border-left:3px solid ${T.cyan}">
      <span style="font-size:16px">${emoji}</span>
      <span style="font-size:14px;color:${T.white};line-height:1.6;margin-left:8px">${text}</span>
    </div>`;
}

/** SVI progress bar (inline HTML/CSS, works in Gmail). */
function sviProgressBar(score: number | null | undefined, label = "Your SVI Score"): string {
  if (!score) return "";
  const pct = Math.min(Math.round((score / 150) * 100), 100);
  const color = score >= 85 ? T.emerald : score >= 50 ? T.blue : T.amber;
  return `
    <div style="margin:20px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:12px;color:${T.textSecondary};font-weight:600">${label}</td>
          <td align="right" style="font-size:16px;font-weight:700;color:${color}">${score}</td>
        </tr>
      </table>
      <div style="height:8px;background:${T.border};border-radius:4px;margin-top:8px;overflow:hidden">
        <div style="height:8px;background:${color};border-radius:4px;width:${pct}%"></div>
      </div>
    </div>`;
}

/** Main shell wrapper — assembles header + body card + footer. */
function shell(
  content: string,
  unsubscribeUrl?: string | null,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>BlockID</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${T.textPrimary}">
  <div style="max-width:580px;margin:0 auto;padding:32px 16px">
    ${brandHeader()}
    ${accentStrip()}
    <div style="background:${T.white};border-radius:0 0 16px 16px;padding:36px 32px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      ${content}
    </div>
    <p style="font-size:11px;color:${T.textMuted};text-align:center;margin:20px 0 0;line-height:1.6">
      Auschain PTY LTD &middot; ACN 659 615 111 &middot; Sydney NSW<br />
      ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:${T.textMuted};text-decoration:underline">Unsubscribe</a> &middot; ` : ""}
      <a href="${APP_URL}/legal/privacy" style="color:${T.textMuted};text-decoration:underline">Privacy Policy</a>
    </p>
  </div>
</body></html>`;
}

function trialLine(input: LifecycleEmailInput): string {
  if (!input.trialEndsAt) return "";
  const d = new Date(input.trialEndsAt);
  return `Trial ends ${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · ${input.planLabel ?? "Growth"}.`;
}

// ─── Step renderers ───────────────────────────────────────────────────────────

export function renderLifecycleEmail(input: LifecycleEmailInput): RenderedEmail {
  const name = input.firstName ? `Hi ${input.firstName},` : "Hi,";
  const subject = subjectFor(input.step, input.variant, input.firstName);
  const trial = trialLine(input);
  const unsub = input.unsubscribeUrl ?? null;

  switch (input.step) {
    case "day0":
      return {
        subject,
        html: shell(`
          <h1 style="font-size:24px;font-weight:800;color:${T.navyDeep};margin:0 0 6px">Welcome to BlockID</h1>
          <p style="font-size:13px;color:${T.textMuted};margin:0 0 24px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Your startup intelligence platform is live</p>

          ${statGrid([
            { value: "7", label: "Day Free Trial", color: T.navyDeep },
            { value: "AI", label: "Powered Analysis", color: T.blue },
            { value: "100+", label: "AU Startups Indexed", color: T.emerald },
          ])}

          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 8px">${name}</p>
          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">
            Your 7-day trial is live. Founders who complete these three steps in week one
            raise <strong style="color:${T.textPrimary}">3&times; faster</strong> on average — here's your roadmap:
          </p>

          ${stepList([
            "<strong>Run your first Investor-Ready Score</strong> — get an AI-powered SVI score in under 10 minutes",
            "<strong>Upload evidence to your data room</strong> — team bios, market research, LinkedIn profile, GitHub",
            "<strong>Generate a share link</strong> — send your live score card to an investor or advisor",
          ])}

          ${highlightBox("Founders with a completed profile raise capital <strong>3.2× faster</strong> than those with a bare profile. Start with step 1 today.", "🚀")}

          ${ctaButton("Start Step 1 — Get My Score", `${APP_URL}/onboarding`)}

          <p style="font-size:13px;color:${T.textMuted};margin:24px 0 0;line-height:1.6">
            ${trial} We'll send you a friendly reminder if you get stuck.
          </p>
        `, unsub),
      };

    case "day3":
      return {
        subject,
        html: shell(`
          <h1 style="font-size:24px;font-weight:800;color:${T.navyDeep};margin:0 0 6px">Ready to run your score?</h1>
          <p style="font-size:13px;color:${T.textMuted};margin:0 0 24px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Day 3 of 7 — keep the momentum</p>

          ${statGrid([
            { value: "3", label: "Days Into Trial", color: T.amber },
            { value: "10m", label: "To First SVI Score", color: T.blue },
            { value: "4 days", label: "Trial Remaining", color: T.navyDeep },
          ])}

          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">${name}</p>
          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">
            You're 3 days in. Running one full Investor-Ready Score now is the single biggest signal
            that you're on track — and it takes just ~10 minutes.
          </p>

          ${highlightBox("The <strong>Startup Value Index (SVI)</strong> scores your startup across 8 dimensions: Team, Market, Product, Traction, Cap Table, Investor Readiness, Legal, and Strategic Vision.", "📊")}

          ${ctaButton("Run My Score Now", `${APP_URL}/svi/run`)}

          <p style="font-size:13px;color:${T.textMuted};margin:24px 0 0;line-height:1.6">${trial}</p>
        `, unsub),
      };

    case "day5": {
      const sviBlock = input.sviScore
        ? sviProgressBar(input.sviScore, "Your current SVI Score")
        : "";
      return {
        subject,
        html: shell(`
          <h1 style="font-size:24px;font-weight:800;color:${T.navyDeep};margin:0 0 6px">Two days left in your trial</h1>
          <p style="font-size:13px;color:${T.textMuted};margin:0 0 24px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Keep your momentum alive</p>

          ${sviBlock}

          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">${name}</p>
          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">
            You've built real momentum. Staying on Growth keeps your cap table, data room,
            and investor share links live — no interruption on day 8.
          </p>

          ${statGrid([
            { value: "∞", label: "SVI Analyses / Month", color: T.blue },
            { value: "Full", label: "Data Room Access", color: T.emerald },
            { value: "Live", label: "Investor Share Links", color: T.navyDeep },
          ])}

          ${ctaButton("Keep My Access — Upgrade Now", `${APP_URL}/pricing?plan=founder_growth`)}

          <p style="font-size:13px;color:${T.textMuted};margin:24px 0 0;line-height:1.6">${trial}</p>
        `, unsub),
      };
    }

    case "day6":
      return {
        subject,
        html: shell(`
          <h1 style="font-size:24px;font-weight:800;color:${T.navyDeep};margin:0 0 6px">One day left in your trial</h1>
          <p style="font-size:13px;color:${T.textMuted};margin:0 0 24px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Trial ends tomorrow — your choice</p>

          ${sviProgressBar(input.sviScore)}

          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">${name}</p>
          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">
            Your trial ends tomorrow. If you'd rather not continue on Growth, you can downgrade
            to Starter (A$29/mo) with one click — no charge tomorrow.
          </p>

          ${highlightBox("Your data room, cap table, and SVI history are all safe — they won't be deleted. You choose what to keep active.", "🔒")}

          ${ctaButton("Manage My Plan", `${APP_URL}/account/billing`, false)}

          <p style="font-size:13px;color:${T.textMuted};margin:24px 0 0;line-height:1.6">${trial}</p>
        `, unsub),
      };

    case "day7":
      return {
        subject,
        html: shell(`
          <h1 style="font-size:24px;font-weight:800;color:${T.navyDeep};margin:0 0 6px">Your trial ends today</h1>
          <p style="font-size:13px;color:${T.textMuted};margin:0 0 24px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Action needed before 09:00 AEST</p>

          ${sviProgressBar(input.sviScore)}

          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">${name}</p>
          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">
            Your card will be charged at 09:00 AEST unless you change or cancel.
            If Growth is right for you — do nothing. Otherwise use the button below.
          </p>

          ${ctaButton("Manage My Plan", `${APP_URL}/account/billing`, false)}

          <p style="font-size:13px;color:${T.textMuted};margin:24px 0 0;line-height:1.6">${trial}</p>
        `, unsub),
      };

    case "day14":
      return {
        subject,
        html: shell(`
          <h1 style="font-size:24px;font-weight:800;color:${T.navyDeep};margin:0 0 6px">How's the raise going?</h1>
          <p style="font-size:13px;color:${T.textMuted};margin:0 0 24px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Two weeks on BlockID</p>

          ${sviProgressBar(input.sviScore, "Your SVI Score after two weeks")}

          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">${name}</p>
          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">
            You've been on BlockID for two weeks. Would you share one thing that's working —
            or one thing that's not? We read every reply and use it to make the platform better.
          </p>

          ${highlightBox("Your feedback shapes BlockID's roadmap. We're a small team building for Australian founders — your experience matters.", "💬")}

          ${ctaButton("Reply to Us", `mailto:hello@blockid.au?subject=Two%20weeks%20on%20BlockID`, false)}

          <p style="font-size:13px;color:${T.textMuted};margin:24px 0 0;line-height:1.6">
            This is a one-off email — no more nudges from us this week.
          </p>
        `, unsub),
      };

    case "winback":
      return {
        subject,
        html: shell(`
          <h1 style="font-size:24px;font-weight:800;color:${T.navyDeep};margin:0 0 6px">Come back with 30% off</h1>
          <p style="font-size:13px;color:${T.textMuted};margin:0 0 24px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Your BlockID data is safe — we kept it for you</p>

          ${statGrid([
            { value: "30%", label: "Off First 3 Months", color: T.emerald },
            { value: "14", label: "Days to Reactivate", color: T.amber },
            { value: "Safe", label: "Your Data", color: T.blue },
          ])}

          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">${name}</p>
          <p style="font-size:15px;line-height:1.7;color:${T.textSecondary};margin:0 0 16px">
            Your BlockID data is still safe. If you reactivate in the next 14 days we'll knock
            <strong style="color:${T.textPrimary}">30% off your first 3 months</strong> with code <code style="background:${T.cardBg};padding:2px 6px;border-radius:4px;font-size:14px">COMEBACK30</code>.
          </p>

          ${highlightBox("The AU startup market is moving fast. Founders with an active SVI score are 4× more likely to get an investor intro in the next 90 days.", "📈")}

          ${ctaButton("Reactivate with COMEBACK30", `${APP_URL}/pricing?coupon=COMEBACK30`)}

          <p style="font-size:13px;color:${T.textMuted};margin:24px 0 0;line-height:1.6">
            This offer expires 14 days from today.
          </p>
        `, unsub),
      };

    case "done":
    default:
      return { subject: "", html: "" };
  }
}
