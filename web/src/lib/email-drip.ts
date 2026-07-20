// Onboarding drip + NPS pulse orchestrator.
//
// Server-only. Reused by:
//   - /api/svi/route.ts  → enqueueOnboardingDrip(...) after the first
//     report email is fired.
//   - /api/cron/email-drip → walks due rows and sends via the shared
//     nodemailer/Resend transport in @/lib/email.
//
// Copy is direct and quiet (no exclamation marks, no emoji, no
// "Hey champion"). Every rendered body carries the Auschain footer
// and a working unsubscribe link.

import "server-only";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export type DripCampaign =
  | "onboarding_d1"
  | "onboarding_d3"
  | "onboarding_d7"
  | "onboarding_d14"
  | "nps_d30";

export type DripStatus = "pending" | "sent" | "cancelled" | "failed";

export interface EmailDrip {
  id: string;
  user_id: string | null;
  email: string;
  campaign: DripCampaign;
  scheduled_for: string;
  sent_at: string | null;
  status: DripStatus;
  payload: DripPayload;
  last_error: string | null;
  created_at: string;
}

export interface DripPayload {
  weakestDim?: string;
  weakestScore?: number;
  sector?: string | null;
  npsToken?: string;
}

export interface SviAnalysisSummary {
  weakestDim: string;
  weakestScore: number;
  sector: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(
    /\/$/,
    "",
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// ── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Insert the full 5-touch drip (D1, D3, D7, D14 + D30 NPS) for one
 * founder. De-duped by campaign: if any onboarding_d1 was scheduled in
 * the last 7 days for this email we short-circuit — a re-analysis or
 * repeat visit should not re-arm the sequence.
 */
export async function enqueueOnboardingDrip(
  email: string,
  userId: string | null,
  summary: SviAnalysisSummary,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const normEmail = email.toLowerCase().trim();
  if (!normEmail || !normEmail.includes("@")) return;

  // Dedupe — did we start a drip for this email in the last week?
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const { data: existing, error: existingErr } = await supabase
    .from("email_drips")
    .select("id")
    .eq("email", normEmail)
    .eq("campaign", "onboarding_d1")
    .gt("scheduled_for", sevenDaysAgo)
    .limit(1);
  if (existingErr) {
    console.warn("[email-drip] dedupe lookup failed", existingErr);
    return;
  }
  if (existing && existing.length > 0) return;

  const now = Date.now();
  const basePayload: DripPayload = {
    weakestDim: summary.weakestDim,
    weakestScore: summary.weakestScore,
    sector: summary.sector,
  };

  const rows: Array<{
    email: string;
    user_id: string | null;
    campaign: DripCampaign;
    scheduled_for: string;
    payload: DripPayload;
  }> = [
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d1",
      scheduled_for: new Date(now + 1 * DAY_MS).toISOString(),
      payload: basePayload,
    },
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d3",
      scheduled_for: new Date(now + 3 * DAY_MS).toISOString(),
      payload: basePayload,
    },
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d7",
      scheduled_for: new Date(now + 7 * DAY_MS).toISOString(),
      payload: basePayload,
    },
    {
      email: normEmail,
      user_id: userId,
      campaign: "onboarding_d14",
      scheduled_for: new Date(now + 14 * DAY_MS).toISOString(),
      payload: basePayload,
    },
  ];

  // NPS row — pre-create the nps_responses stub so the token is stable
  // between the drip email and the /nps landing page.
  const npsToken = newToken();
  const { error: npsErr } = await supabase.from("nps_responses").insert({
    user_id: userId,
    email: normEmail,
    token: npsToken,
  });
  if (npsErr) {
    console.warn("[email-drip] failed to create nps stub", npsErr);
    // Still continue — send the drip without the NPS touch.
  } else {
    rows.push({
      email: normEmail,
      user_id: userId,
      campaign: "nps_d30",
      scheduled_for: new Date(now + 30 * DAY_MS).toISOString(),
      payload: { ...basePayload, npsToken },
    });
  }

  const { error: insertErr } = await supabase.from("email_drips").insert(rows);
  if (insertErr) console.warn("[email-drip] insert failed", insertErr);
}

// ── Cron helpers ─────────────────────────────────────────────────────────────

export async function dueDrips(now: Date, limit: number): Promise<EmailDrip[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("email_drips")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[email-drip] dueDrips lookup failed", error);
    return [];
  }
  return (data ?? []) as EmailDrip[];
}

export async function markSent(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("email_drips")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markFailed(id: string, err: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("email_drips")
    .update({ status: "failed", last_error: err.slice(0, 500) })
    .eq("id", id);
}

// ── Copy ─────────────────────────────────────────────────────────────────────

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function footer(email: string): string {
  const unsub = `${siteUrl()}/unsubscribe?email=${encodeURIComponent(email)}`;
  return `
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0 16px 0;">
    <p style="margin:0 0 4px 0;color:#64748B;font-size:12px;line-height:1.6;">
      Auschain PTY LTD &middot; ACN 659 615 111 &middot; ABN 79 659 615 111
    </p>
    <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">
      Sent because you generated an SVI report on BlockID.au.
      <a href="${unsub}" style="color:#64748B;text-decoration:underline;">Unsubscribe</a>.
    </p>`;
}

function footerText(email: string): string {
  const unsub = `${siteUrl()}/unsubscribe?email=${encodeURIComponent(email)}`;
  return `\n\n—\nAuschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111\nSent because you generated an SVI report on BlockID.au.\nUnsubscribe: ${unsub}`;
}

function shell(inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlockID</title></head><body style="margin:0;padding:0;background:#F8FAFC;color:#0F172A;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;">
        <tr><td style="font-size:15px;color:#0F172A;line-height:1.6;">${inner}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p style="margin:24px 0;text-align:left;">
    <a href="${href}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;">${escapeHtml(label)}</a>
  </p>`;
}

function d1Copy(email: string, p: DripPayload): RenderedEmail {
  const dim = p.weakestDim ?? "your investor readiness signal";
  const dashUrl = `${siteUrl()}/dashboard/svi`;
  const evidenceUrl = `${siteUrl()}/workspace/evidence`;
  const subject = `Your SVI report is ready — three next steps for ${dim}`;
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 1</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">Three next steps on your SVI</h1>
    <p>Your first Startup Value Index report is generated. The lowest scoring dimension right now is <strong>${escapeHtml(dim)}</strong>${p.weakestScore != null ? ` at ${p.weakestScore}/100` : ""}, so that is where a small amount of work will move the SVI the most.</p>
    <p style="margin:16px 0 8px 0;font-weight:600;">Do these three things today:</p>
    <ol style="padding-left:20px;margin:0 0 16px 0;">
      <li style="margin-bottom:6px;">Open your dashboard and read the ${escapeHtml(dim)} section end to end.</li>
      <li style="margin-bottom:6px;">Add one piece of evidence against it in the Evidence Vault (a link, a screenshot, a PDF is enough).</li>
      <li style="margin-bottom:6px;">Re-score. Investors want to see movement, not perfection.</li>
    </ol>
    ${ctaButton(dashUrl, "Open dashboard")}
    <p style="color:#64748B;font-size:13px;">Or jump straight to <a href="${evidenceUrl}" style="color:#2563EB;">Evidence Vault</a>.</p>
    ${footer(email)}`);
  const text = `Your SVI report is ready.\n\nWeakest dimension: ${dim}${p.weakestScore != null ? ` (${p.weakestScore}/100)` : ""}.\n\nThree next steps:\n1. Read the ${dim} section in your dashboard.\n2. Add one piece of evidence in the Evidence Vault.\n3. Re-score.\n\nDashboard: ${dashUrl}\nEvidence Vault: ${evidenceUrl}${footerText(email)}`;
  return { subject, html, text };
}

function d3Copy(email: string, p: DripPayload): RenderedEmail {
  const lift = Math.max(4, Math.min(12, Math.round((100 - (p.weakestScore ?? 50)) / 8)));
  const teamUrl = `${siteUrl()}/workspace/team`;
  const subject = `Add your team to lift your SVI Team score by ~${lift} points`;
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 3</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">Bring your team into the workspace</h1>
    <p>Your SVI weights the Founder and Team dimension heavily. Adding co-founders, advisors and early hires with LinkedIn URLs typically lifts the Team component by <strong>${lift} points</strong> and the total SVI along with it.</p>
    <p>It also unlocks role-based dashboards so each person sees the report slice that matters to them.</p>
    ${ctaButton(teamUrl, "Invite team")}
    <p style="color:#64748B;font-size:13px;">Invites are free. Team members do not consume your credit balance.</p>
    ${footer(email)}`);
  const text = `Adding your team lifts the SVI Team component by roughly ${lift} points and pulls the headline number up.\n\nInvite team: ${teamUrl}${footerText(email)}`;
  return { subject, html, text };
}

function d7Copy(email: string, p: DripPayload): RenderedEmail {
  const sectorLabel = (p.sector ?? "your sector").replace(/[_-]/g, " ");
  const dim = p.weakestDim ?? "traction";
  const insightsUrl = `${siteUrl()}/insights`;
  const subject = `How founders in ${sectorLabel} are unblocking ${dim}`;
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 7</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">A pattern we see in ${escapeHtml(sectorLabel)}</h1>
    <p>Across recent BlockID scores, the founders in ${escapeHtml(sectorLabel)} who lifted <strong>${escapeHtml(dim)}</strong> fastest did three things in the first month.</p>
    <ol style="padding-left:20px;margin:0 0 16px 0;">
      <li style="margin-bottom:6px;">Wrote a one-page problem statement and posted it publicly to invite critique.</li>
      <li style="margin-bottom:6px;">Ran five 20-minute customer conversations and uploaded the notes as evidence.</li>
      <li style="margin-bottom:6px;">Attached one hard number (waitlist size, LOI, pilot revenue) even if small.</li>
    </ol>
    <p>None of it is glamorous. All of it is what investors want to see when they open your BlockID share link.</p>
    ${ctaButton(insightsUrl, "Read the full playbook")}
    ${footer(email)}`);
  const text = `Founders in ${sectorLabel} who lifted ${dim} did three things in the first month:\n1. Public one-page problem statement.\n2. Five 20-minute customer conversations, uploaded as evidence.\n3. One hard number (waitlist, LOI, pilot revenue).\n\nMore: ${insightsUrl}${footerText(email)}`;
  return { subject, html, text };
}

function d14Copy(email: string): RenderedEmail {
  const pricingUrl = `${siteUrl()}/pricing`;
  const subject = "Ready for the full report? Founder plan is A$29/mo";
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; Day 14</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">The full report unlocks the next 90 days</h1>
    <p>You have been on the free tier for two weeks. The Founder plan (A$29/mo, GST included) unlocks:</p>
    <ul style="padding-left:20px;margin:0 0 16px 0;">
      <li style="margin-bottom:6px;">Full, unlimited SVI reports with a 90-day action plan tailored to your stage.</li>
      <li style="margin-bottom:6px;">Deep competitor profiles and market EBITDA benchmarks for your sector.</li>
      <li style="margin-bottom:6px;">Cap table, vesting and ESOP tools you can share with your lawyer.</li>
    </ul>
    <p>No lock-in. Cancel from the billing page any time.</p>
    ${ctaButton(pricingUrl, "See plans")}
    ${footer(email)}`);
  const text = `The Founder plan is A$29/mo (GST included) and unlocks the full SVI report, competitor profiles, EBITDA benchmarks and cap table tools.\n\nSee plans: ${pricingUrl}${footerText(email)}`;
  return { subject, html, text };
}

function npsCopy(email: string, p: DripPayload): RenderedEmail {
  const token = p.npsToken ?? "";
  const npsUrl = `${siteUrl()}/nps?token=${encodeURIComponent(token)}`;
  const subject = "How likely are you to recommend BlockID?";
  const html = shell(`
    <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#2563EB;font-weight:600;">BlockID &middot; 30-day check-in</p>
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;color:#0F172A;">One question</h1>
    <p>On a scale of 0 to 10, how likely are you to recommend BlockID to another founder?</p>
    <p>One click, no login. If the number is low, we would rather hear about it now than guess later.</p>
    ${ctaButton(npsUrl, "Give a score")}
    ${footer(email)}`);
  const text = `On a scale of 0 to 10, how likely are you to recommend BlockID to another founder?\n\nOne click: ${npsUrl}${footerText(email)}`;
  return { subject, html, text };
}

export function renderDripBody(
  campaign: DripCampaign,
  email: string,
  payload: DripPayload,
): RenderedEmail {
  switch (campaign) {
    case "onboarding_d1":
      return d1Copy(email, payload);
    case "onboarding_d3":
      return d3Copy(email, payload);
    case "onboarding_d7":
      return d7Copy(email, payload);
    case "onboarding_d14":
      return d14Copy(email);
    case "nps_d30":
      return npsCopy(email, payload);
  }
}
