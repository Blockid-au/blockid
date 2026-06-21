// POST /api/cron/weekly-revenue-report
//
// Weekly revenue + credit-spend summary emailed to admin@blockid.au.
// Authoritative dollars come from Stripe (payment_intents.succeeded), credit
// spend by feature comes from credit_transactions (negative amounts), founding
// 100 cumulative count comes from app_users.plan.
//
// Schedule: Mondays 09:00 UTC (covers prior 7-day window).

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAIL = "admin@blockid.au";

interface SpendByFeature {
  feature: string;
  credits: number;
  count: number;
}

interface RevenueWindow {
  count: number;
  audCents: number;
}

interface ReportData {
  startIso: string;
  endIso: string;
  thisWeek: RevenueWindow;
  prevWeek: RevenueWindow;
  foundingTotal: number;
  foundingDelta: number;
  newUsers: number;
  spend: SpendByFeature[];
  feedbackCount: number;
  feedbackCreditsGranted: number;
}

async function fetchStripeRevenue(stripe: NonNullable<ReturnType<typeof getStripe>>, sinceSec: number, untilSec: number): Promise<RevenueWindow> {
  let audCents = 0;
  let count = 0;
  let starting_after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const page = await stripe.paymentIntents.list({
      created: { gte: sinceSec, lt: untilSec },
      limit: 100,
      starting_after,
    });
    for (const pi of page.data) {
      if (pi.status === "succeeded" && (pi.currency ?? "").toLowerCase() === "aud") {
        audCents += pi.amount_received ?? 0;
        count += 1;
      }
    }
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1]?.id;
    if (!starting_after) break;
  }
  return { count, audCents };
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const supabase = getSupabaseAdmin()!;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startThis = now - 7 * dayMs;
  const startPrev = now - 14 * dayMs;
  const endThisIso = new Date(now).toISOString();
  const startThisIso = new Date(startThis).toISOString();
  const startPrevIso = new Date(startPrev).toISOString();

  let thisWeek: RevenueWindow = { count: 0, audCents: 0 };
  let prevWeek: RevenueWindow = { count: 0, audCents: 0 };
  if (isStripeConfigured()) {
    const stripe = getStripe()!;
    [thisWeek, prevWeek] = await Promise.all([
      fetchStripeRevenue(stripe, Math.floor(startThis / 1000), Math.floor(now / 1000)),
      fetchStripeRevenue(stripe, Math.floor(startPrev / 1000), Math.floor(startThis / 1000)),
    ]);
  }

  const [foundingNowRes, foundingPrevRes, newUsersRes, spendRes, feedbackRes] = await Promise.all([
    supabase.from("app_users").select("id", { count: "exact", head: true }).eq("plan", "founding_100"),
    supabase.from("app_users").select("id", { count: "exact", head: true }).eq("plan", "founding_100").lt("plan_started_at", startThisIso),
    supabase.from("app_users").select("id", { count: "exact", head: true }).gte("created_at", startThisIso),
    supabase.from("credit_transactions").select("amount, reason").lt("amount", 0).gte("created_at", startThisIso),
    supabase.from("user_feedback").select("credits_awarded").gte("created_at", startThisIso),
  ]);

  const spendMap = new Map<string, { credits: number; count: number }>();
  for (const row of (spendRes.data ?? []) as { amount: number; reason: string }[]) {
    const key = row.reason || "unknown";
    const acc = spendMap.get(key) ?? { credits: 0, count: 0 };
    acc.credits += Math.abs(Number(row.amount) || 0);
    acc.count += 1;
    spendMap.set(key, acc);
  }
  const spend: SpendByFeature[] = Array.from(spendMap.entries())
    .map(([feature, v]) => ({ feature, ...v }))
    .sort((a, b) => b.credits - a.credits);

  const feedbackCount = feedbackRes.data?.length ?? 0;
  const feedbackCreditsGranted =
    (feedbackRes.data ?? []).reduce((s, r: { credits_awarded?: number }) => s + Number(r.credits_awarded ?? 0), 0);

  const foundingTotal = foundingNowRes.count ?? 0;
  const foundingPrev = foundingPrevRes.count ?? 0;
  const foundingDelta = Math.max(0, foundingTotal - foundingPrev);

  const data: ReportData = {
    startIso: startThisIso,
    endIso: endThisIso,
    thisWeek,
    prevWeek,
    foundingTotal,
    foundingDelta,
    newUsers: newUsersRes.count ?? 0,
    spend,
    feedbackCount,
    feedbackCreditsGranted: Math.round(feedbackCreditsGranted * 100) / 100,
  };

  const html = renderHtml(data);
  const subject = `Weekly revenue — A$${(data.thisWeek.audCents / 100).toFixed(2)} (${data.thisWeek.count} payments)`;

  const result = await sendEmail({ to: ADMIN_EMAIL, subject, html });

  return NextResponse.json({ ok: true, sent: result.ok, data });
}

function pct(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+∞" : "0%";
  const p = ((curr - prev) / prev) * 100;
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function aud(cents: number): string {
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function renderHtml(d: ReportData): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const window = `${fmt(d.startIso)} → ${fmt(d.endIso)}`;
  const spendRows = d.spend.length === 0
    ? `<tr><td colspan="3" style="padding:12px;color:#94a3b8;font-style:italic;">No credits spent in window.</td></tr>`
    : d.spend.map((s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">${escapeHtml(s.feature)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#475569;text-align:right;">${s.credits.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#94a3b8;text-align:right;">${s.count}</td>
      </tr>`).join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;color:#1e293b;">
<div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="padding:24px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;">
    <h1 style="margin:0;font-size:20px;">Weekly Revenue Report</h1>
    <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${window} · BlockID.au</p>
  </div>

  <div style="padding:24px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Revenue (Stripe, AUD)</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#475569;">This week</td>
        <td style="padding:6px 0;font-size:18px;font-weight:700;color:#0f172a;text-align:right;">${aud(d.thisWeek.audCents)}</td>
        <td style="padding:6px 0 6px 12px;font-size:13px;color:#475569;text-align:right;">${d.thisWeek.count} payments</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#94a3b8;">Prior week</td>
        <td style="padding:6px 0;font-size:13px;color:#475569;text-align:right;">${aud(d.prevWeek.audCents)}</td>
        <td style="padding:6px 0 6px 12px;font-size:13px;color:#475569;text-align:right;">${d.prevWeek.count} payments</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#94a3b8;">WoW</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:${d.thisWeek.audCents >= d.prevWeek.audCents ? "#15803d" : "#b91c1c"};text-align:right;">${pct(d.thisWeek.audCents, d.prevWeek.audCents)}</td>
        <td></td>
      </tr>
    </table>
  </div>

  <div style="padding:0 24px 24px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Founding 100 · Signups</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#475569;">Founding 100 — cumulative</td>
        <td style="padding:6px 0;font-size:18px;font-weight:700;color:#0f172a;text-align:right;">${d.foundingTotal}</td>
        <td style="padding:6px 0 6px 12px;font-size:13px;color:${d.foundingDelta > 0 ? "#15803d" : "#94a3b8"};text-align:right;">+${d.foundingDelta} this wk</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#475569;">New signups (any plan)</td>
        <td style="padding:6px 0;font-size:13px;color:#0f172a;text-align:right;">${d.newUsers}</td>
        <td></td>
      </tr>
    </table>
  </div>

  <div style="padding:0 24px 24px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Credit Spend by Feature</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr style="background:#f8fafc;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Feature</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Credits</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Tx</th>
      </tr>
      ${spendRows}
    </table>
  </div>

  <div style="padding:0 24px 24px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Feedback Program</h2>
    <p style="margin:0;font-size:13px;color:#475569;">${d.feedbackCount} feedback items · ${d.feedbackCreditsGranted.toFixed(2)} credits granted this week.</p>
  </div>

  <div style="padding:24px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      Weekly automated report — BlockID.au<br>
      <a href="https://blockid.au/admin" style="color:#3b82f6;text-decoration:none;">View admin dashboard →</a>
    </p>
  </div>
</div>
</body></html>`;
}
