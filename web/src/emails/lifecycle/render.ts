// Lifecycle email templates (T-0414).
//
// Plain HTML string builder (no React runtime dependency) — matches
// web/src/lib/email.ts which calls Nodemailer / Resend with `html`.
// Each step renders headline + body + primary CTA + trial-status
// footer, and stamps a List-Unsubscribe URL the mailer wires up.

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
      case "curiosity": return "One quick question about your trial";
      case "personalised": return firstName ? `${firstName}, your BlockID trial ends in 2 days` : SUBJECTS.day5;
      case "benefit":
      default:          return "Keep your cap table + investor links live";
    }
  }
  return SUBJECTS[step];
}

function shell(headline: string, body: string, ctaLabel: string, ctaHref: string, footer: string, unsubscribeUrl?: string | null): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <img src="${APP_URL}/logo.svg" alt="BlockID" width="120" style="height:auto;margin-bottom:20px" />
      <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px;color:#0f172a">${headline}</h1>
      <div style="font-size:15px;line-height:1.6;color:#334155">${body}</div>
      <p style="margin:24px 0 0">
        <a href="${ctaHref}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${ctaLabel}</a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#64748b;margin:28px 0 0">${footer}</p>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">
      Auschain PTY LTD · ACN 659 615 111 · Sydney NSW<br />
      ${unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:#94a3b8">Unsubscribe</a> · ` : ""}
      <a href="${APP_URL}/legal/privacy" style="color:#94a3b8">Privacy</a>
    </p>
  </div>
  </body></html>`;
}

function trialLine(input: LifecycleEmailInput): string {
  if (!input.trialEndsAt) return "";
  const d = new Date(input.trialEndsAt);
  return `Trial ends ${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · ${input.planLabel ?? "Growth"}.`;
}

export function renderLifecycleEmail(input: LifecycleEmailInput): RenderedEmail {
  const name = input.firstName ? `Hi ${input.firstName},` : "Hi,";
  const subject = subjectFor(input.step, input.variant, input.firstName);
  const trial = trialLine(input);
  const unsub = input.unsubscribeUrl ?? null;

  switch (input.step) {
    case "day0":
      return {
        subject,
        html: shell(
          "Welcome to BlockID",
          `<p>${name}</p>
          <p>Your 7-day trial is live. Founders who finish these three steps in week one raise <strong>3× faster</strong> on average:</p>
          <ol style="padding-left:20px;margin:12px 0">
            <li>Run your first Investor-Ready Score</li>
            <li>Upload one evidence file to your data room</li>
            <li>Generate a share link and send it to an investor</li>
          </ol>`,
          "Start step 1",
          `${APP_URL}/onboarding`,
          `${trial} We'll email you a friendly reminder if you get stuck.`,
          unsub,
        ),
      };
    case "day3":
      return {
        subject,
        html: shell(
          "Ready to run your first score?",
          `<p>${name}</p>
          <p>You're 3 days into your trial. Running one full Investor-Ready Score today is the single biggest signal that you'll convert — and it takes ~10 minutes.</p>`,
          "Run my score",
          `${APP_URL}/svi/run`,
          trial,
          unsub,
        ),
      };
    case "day5":
      return {
        subject,
        html: shell(
          "Two days left in your trial",
          `<p>${name}</p>
          <p>You've been building real momentum. Locking in Growth now keeps your cap table, data room, and investor share links live — no interruption on day 8.</p>`,
          "Keep my access",
          `${APP_URL}/pricing?plan=founder_growth`,
          trial,
          unsub,
        ),
      };
    case "day6":
      return {
        subject,
        html: shell(
          "One day left in your trial",
          `<p>${name}</p>
          <p>Your trial ends tomorrow. If you'd rather not continue on Growth, downgrade to Starter (A$29/mo) with one click — no charge tomorrow.</p>`,
          "Manage my plan",
          `${APP_URL}/account/billing`,
          trial,
          unsub,
        ),
      };
    case "day7":
      return {
        subject,
        html: shell(
          "Your trial ends today",
          `<p>${name}</p>
          <p>Your card will be charged at 09:00 AEST unless you change or cancel. If Growth is right, do nothing; otherwise use the button below.</p>`,
          "Manage my plan",
          `${APP_URL}/account/billing`,
          trial,
          unsub,
        ),
      };
    case "day14":
      return {
        subject,
        html: shell(
          "How's the raise going?",
          `<p>${name}</p>
          <p>You've been on BlockID for two weeks. Would you share one thing that's working — or one thing that's not? We read every reply.</p>`,
          "Reply to us",
          `mailto:hello@blockid.au?subject=Two%20weeks%20on%20BlockID`,
          "This is a one-off email — no more nudges from us this week.",
          unsub,
        ),
      };
    case "winback":
      return {
        subject,
        html: shell(
          "Come back with 30% off",
          `<p>${name}</p>
          <p>Your BlockID data is still safe. If you reactivate in the next 14 days we'll knock <strong>30% off your first 3 months</strong> with code <code>COMEBACK30</code>.</p>`,
          "Reactivate with COMEBACK30",
          `${APP_URL}/pricing?coupon=COMEBACK30`,
          "This offer expires 14 days from today.",
          unsub,
        ),
      };
    case "done":
    default:
      return { subject: "", html: "" };
  }
}
