// GET|POST /api/cron/onboarding-sequence
//
// ⛔ RETIRED — G34-BT2 EM01 (2026-09-25). Never scheduled in
// scripts/crontab.production and superseded by `email_drips` +
// lib/email-drip.ts (`/api/cron/email-drip`), the one commercial-mail engine
// (global frequency cap, consent, suppression, List-Unsubscribe). The handler
// answers `{ retired: true }` after the auth gate and sends nothing; the
// legacy body below is unreachable and kept only for the history.
//
// Post-signup onboarding emails for users who have NOT yet run an SVI analysis.
// Once they run an analysis, the lifecycle sequence (/api/cron/weekly-insights) takes over.
//
// Sequence (triggered from user.created_at):
//   D+1 : Welcome + how to run first SVI analysis
//   D+3 : Evidence Vault explainer — connect GitHub/Stripe/GA4
//   D+7 : Starter / Growth upgrade CTA (7-day trial). The Founding 100 A$5
//         pitch this step used to carry closed 2026-09-01 (G18-A, 2026-09-20).
//
// Max 3 emails per user ever. Sends max 20 users per run. Respects email preferences.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  canSendEmail,
  ensureEmailPreferences,
  getUnsubscribeUrl,
  getPreferencesUrl,
} from "@/lib/email-preferences";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { PLANS_V2, formatAud, type Plan } from "@/lib/plans-v2";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** G34-BT2 EM01 — see the header. */
const RETIRED = true;

// Pricing truth: every figure the D+7 step quotes comes from plans-v2 (price,
// trial) and plans.csv via plans.generated (monthly credit grant) — never typed.
function ladderPlan(id: string): Plan {
  const plan = PLANS_V2.find((p) => p.id === id);
  if (!plan) throw new Error(`plans-v2: unknown plan id "${id}"`);
  return plan;
}
function monthlyCredits(id: string): number {
  return GENERATED_PLANS_BY_ID[id]?.usage_limits?.monthly_credits ?? 0;
}
const STARTER = ladderPlan("founder_starter");
const GROWTH = ladderPlan("founder_growth");
const STARTER_PRICE = `${formatAud(STARTER.monthly_aud)}/mo`;
const GROWTH_PRICE = `${formatAud(GROWTH.monthly_aud)}/mo`;
const STARTER_CREDITS = monthlyCredits(STARTER.id);
const GROWTH_CREDITS = monthlyCredits(GROWTH.id);

interface OnboardingStep {
  type: string;
  daysAfter: number;
  subject: (name: string) => string;
  body: (name: string, siteUrl: string, unsubUrl: string, prefsUrl: string) => string;
}

const STEPS: OnboardingStep[] = [
  {
    type: "onboarding_d1",
    daysAfter: 1,
    subject: (name) => `${name}, your BlockID workspace is ready`,
    body: (name, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hey ${name}! 👋</h1>
      <p>Welcome to BlockID.au — your AI-powered startup intelligence platform.</p>
      <p>You're 60 seconds away from knowing your <strong>Startup Value Index (SVI)</strong> — the score investors use to evaluate your startup readiness.</p>
      <p style="background:#eff6ff;border-left:3px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;">
        <strong>Your SVI measures 8 dimensions:</strong> Traction, Market Penetration, Product-Market Fit, Team Strength, Market Size, IP Moat, Financial Health, and Investor Readiness.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${siteUrl}/#svi" style="display:inline-block;background:#2563eb;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Run My First Analysis →</a>
      </div>
      <p style="color:#64748b;font-size:13px;">It's free. Takes 60 seconds. No credit card required.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
  {
    type: "onboarding_d3",
    daysAfter: 3,
    subject: (name) => `${name}, connect your data to boost your SVI score`,
    body: (name, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hi ${name},</h1>
      <p>Did you know that founders who connect at least one data source score <strong>15-30 points higher</strong> on their SVI?</p>
      <p>BlockID's <strong>Evidence Vault</strong> lets you securely connect:</p>
      <ul style="line-height:2;">
        <li>🐙 <strong>GitHub</strong> — code commits, repo activity</li>
        <li>💳 <strong>Stripe</strong> — revenue, MRR, customer count</li>
        <li>📊 <strong>Google Analytics</strong> — traffic, engagement, sessions</li>
        <li>💼 <strong>LinkedIn</strong> — team credibility score</li>
      </ul>
      <div style="text-align:center;margin:28px 0;">
        <a href="${siteUrl}/workspace/evidence" style="display:inline-block;background:#2563eb;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Connect Your First Source →</a>
      </div>
      <p style="color:#64748b;font-size:13px;">Your data stays private. We only read — never write.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
  {
    type: "onboarding_d7",
    daysAfter: 7,
    subject: (name) => `${name}, ${STARTER.name} is ${STARTER_PRICE} with a ${STARTER.trial_days}-day free trial`,
    body: (name, siteUrl, unsubUrl, prefsUrl) => `
      <h1 style="font-size:20px;margin:0 0 12px;">Hi ${name},</h1>
      <p>You have had a week on the free tier. When you are ready for the next step, there are two paid rungs — both start with a <strong>${STARTER.trial_days}-day free trial</strong> and both include GST.</p>
      <p><strong>${STARTER.name} — ${STARTER_PRICE}</strong></p>
      <ul style="line-height:2;">
        <li>✅ <strong>${STARTER_CREDITS} AI credits</strong> every month</li>
        <li>✅ <strong>Data room</strong> — filling up in the order investors ask</li>
        <li>✅ <strong>Live investor link</strong> — NDA click-wrap and watermarked PDFs</li>
        <li>✅ <strong>Founder Radar</strong> — grant and program deadline alerts</li>
      </ul>
      <p><strong>${GROWTH.name} — ${GROWTH_PRICE}</strong></p>
      <ul style="line-height:2;">
        <li>✅ Everything in ${STARTER.name}, with <strong>${GROWTH_CREDITS} AI credits</strong> every month</li>
        <li>✅ <strong>Cap table sync</strong> — equity split, vesting, ESOP</li>
        <li>✅ <strong>Term Sheet AI</strong> — analyse any investor term sheet</li>
        <li>✅ <strong>Investor matching</strong> and unlimited grant application drafts</li>
      </ul>
      <div style="text-align:center;margin:28px 0;">
        <a href="${siteUrl}/pricing" style="display:inline-block;background:#2563eb;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Compare plans →</a>
      </div>
      <p style="color:#64748b;font-size:13px;">No lock-in — cancel from the billing page any time. Your free account stays as it is if you do nothing.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a> · <a href="${prefsUrl}" style="color:#94a3b8;">Email preferences</a>
      </p>`,
  },
];

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (RETIRED) {
    return NextResponse.json({ ok: true, retired: true, sent: 0, skipped: 0, engine: "email-drip" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const now = Date.now();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    let sent = 0;
    let skipped = 0;
    const MAX_BATCH = 20;

    // Only users who have NOT yet run an SVI analysis
    const { data: usersWithoutAnalysis } = await supabase
      .from("users")
      .select("id, email, display_name, created_at")
      .not(
        "email",
        "in",
        `(select distinct email from svi_analyses)`,
      )
      .order("created_at", { ascending: false })
      .limit(MAX_BATCH * 3);

    for (const u of (usersWithoutAnalysis ?? []).slice(0, MAX_BATCH)) {
      if (!u.email || !u.created_at) continue;

      const daysSinceSignup = Math.floor(
        (now - new Date(u.created_at).getTime()) / 86_400_000,
      );
      const firstName = (u.display_name as string)?.split(" ")[0] ?? "there";

      for (const step of STEPS) {
        if (daysSinceSignup < step.daysAfter) continue;
        if (daysSinceSignup > step.daysAfter + 3) continue;

        const { count } = await supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true })
          .eq("email", u.email)
          .eq("notification_type", step.type);

        if ((count ?? 0) > 0) continue;

        const allowed = await canSendEmail(u.email as string, "weekly_reports");
        if (!allowed) { skipped++; continue; }

        const token = await ensureEmailPreferences(u.email as string);
        const unsubUrl = getUnsubscribeUrl(token, "weekly_reports");
        const prefsUrl = getPreferencesUrl(token);

        await sendEmail({
          to: u.email as string,
          subject: step.subject(firstName),
          html: `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:#1e293b;">
            <div style="text-align:center;padding:24px 0;">
              <img src="${siteUrl}/images/logo-transparent.png" alt="BlockID.au" style="height:40px;" />
            </div>
            ${step.body(firstName, siteUrl, unsubUrl, prefsUrl)}
          </div>`,
          unsubscribeUrl: unsubUrl,
        });

        await supabase.from("svi_notifications").insert({
          email: u.email,
          account_id: null,
          notification_type: step.type,
        });

        sent++;
        break;
      }
    }

    return NextResponse.json({ ok: true, sent, skipped, policy: "onboarding_3_emails_pre_analysis" });
  } catch (err) {
    console.error("[onboarding-sequence]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export { GET as POST };
