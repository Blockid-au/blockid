// GET /api/cron/weekly-revenue-digest
//
// Weekly revenue + credit-spend digest emailed to admin@blockid.au.
// Aggregates last 7 days from stripe_webhook_events + credit_transactions.
//
// Schedule: Mondays 09:00 UTC
// Auth:     Authorization: Bearer {CRON_SECRET}
//
// T_REVENUE_0001

import { NextResponse } from "next/server";
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
  audDollars: number;
}

interface DigestData {
  startIso: string;
  endIso: string;
  thisWeek: RevenueWindow;
  prevWeek: RevenueWindow;
  newUsers: number;
  spend: SpendByFeature[];
  totalCreditSpend: number;
}

export async function GET(request: Request) {
  // Auth gate
  const auth = request.headers.get("authorization") ?? "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin()!;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const since7d = new Date(now - 7 * dayMs).toISOString();
  const since14d = new Date(now - 14 * dayMs).toISOString();
  const endIso = new Date(now).toISOString();

  // This week revenue
  const { data: thisWeekRaw } = await supabase
    .from("stripe_webhook_events")
    .select("payload")
    .eq("type", "payment_intent.succeeded")
    .gte("created_at", since7d);

  // Previous week revenue (7-14 days ago)
  const { data: prevWeekRaw } = await supabase
    .from("stripe_webhook_events")
    .select("payload")
    .eq("type", "payment_intent.succeeded")
    .gte("created_at", since14d)
    .lt("created_at", since7d);

  function sumRevenue(rows: Array<{ payload: Record<string, unknown> }>): RevenueWindow {
    let audDollars = 0;
    let count = 0;
    for (const r of rows) {
      const amt = Number((r.payload as { amount?: unknown })?.amount ?? 0);
      if (amt > 0) {
        audDollars += amt / 100;
        count += 1;
      }
    }
    return { count, audDollars };
  }

  const thisWeek = sumRevenue(
    (thisWeekRaw ?? []) as Array<{ payload: Record<string, unknown> }>,
  );
  const prevWeek = sumRevenue(
    (prevWeekRaw ?? []) as Array<{ payload: Record<string, unknown> }>,
  );

  // New users in last 7 days
  const { count: newUsers } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since7d);

  // Credit spend by feature
  const { data: spendRaw } = await supabase
    .from("credit_transactions")
    .select("amount, reason")
    .lt("amount", 0)
    .gte("created_at", since7d);

  const spendMap = new Map<string, { credits: number; count: number }>();
  let totalCreditSpend = 0;
  for (const row of (spendRaw ?? []) as Array<{ amount: number; reason: string }>) {
    const key = row.reason || "unknown";
    const abs = Math.abs(Number(row.amount) || 0);
    const acc = spendMap.get(key) ?? { credits: 0, count: 0 };
    acc.credits += abs;
    acc.count += 1;
    spendMap.set(key, acc);
    totalCreditSpend += abs;
  }
  const spend: SpendByFeature[] = Array.from(spendMap.entries())
    .map(([feature, v]) => ({ feature, ...v }))
    .sort((a, b) => b.credits - a.credits);

  const data: DigestData = {
    startIso: since7d,
    endIso,
    thisWeek,
    prevWeek,
    newUsers: newUsers ?? 0,
    spend,
    totalCreditSpend: Math.round(totalCreditSpend * 100) / 100,
  };

  const subject = `Weekly Revenue Digest — A$${data.thisWeek.audDollars.toFixed(2)} (${data.thisWeek.count} payments)`;
  const html = renderHtml(data);

  const result = await sendEmail({ to: ADMIN_EMAIL, subject, html });

  return NextResponse.json({
    ok: true,
    sent: result.ok,
    data: {
      thisWeek: data.thisWeek,
      prevWeek: data.prevWeek,
      newUsers: data.newUsers,
      totalCreditSpend: data.totalCreditSpend,
    },
  });
}

// ---------------------------------------------------------------------------
// HTML email renderer
// ---------------------------------------------------------------------------

function aud(dollars: number): string {
  return `A$${dollars.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+∞" : "—";
  const p = ((curr - prev) / prev) * 100;
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderHtml(d: DigestData): string {
  const window = `${fmtDate(d.startIso)} → ${fmtDate(d.endIso)}`;
  const wowColor = d.thisWeek.audDollars >= d.prevWeek.audDollars ? "#15803d" : "#b91c1c";

  const spendRows =
    d.spend.length === 0
      ? `<tr><td colspan="3" style="padding:12px;color:#94a3b8;font-style:italic;">No credits spent in window.</td></tr>`
      : d.spend
          .map(
            (s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">${escHtml(s.feature)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#92400e;text-align:right;font-weight:600;">${s.credits.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#94a3b8;text-align:right;">${s.count}</td>
      </tr>`,
          )
          .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;color:#1e293b;">
<div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

  <div style="padding:24px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;">
    <h1 style="margin:0;font-size:20px;">Weekly Revenue Digest</h1>
    <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">${window} · BlockID.au</p>
  </div>

  <div style="padding:24px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Revenue (Stripe, AUD)</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#475569;">This week</td>
        <td style="padding:6px 0;font-size:22px;font-weight:700;color:#0f172a;text-align:right;">${aud(d.thisWeek.audDollars)}</td>
        <td style="padding:6px 0 6px 12px;font-size:13px;color:#475569;text-align:right;">${d.thisWeek.count} payments</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#94a3b8;">Prior week</td>
        <td style="padding:6px 0;font-size:13px;color:#475569;text-align:right;">${aud(d.prevWeek.audDollars)}</td>
        <td style="padding:6px 0 6px 12px;font-size:13px;color:#94a3b8;text-align:right;">${d.prevWeek.count} payments</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#94a3b8;">WoW</td>
        <td style="padding:6px 0;font-size:13px;font-weight:600;color:${wowColor};text-align:right;">${pct(d.thisWeek.audDollars, d.prevWeek.audDollars)}</td>
        <td></td>
      </tr>
    </table>
  </div>

  <div style="padding:0 24px 24px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">User Growth</h2>
    <p style="margin:0;font-size:13px;color:#475569;">
      <strong style="color:#0f172a;">${d.newUsers}</strong> new signups this week.
    </p>
  </div>

  <div style="padding:0 24px 24px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">
      Credit Spend by Feature
      <span style="font-size:12px;font-weight:normal;color:#94a3b8;margin-left:8px;">total: ${d.totalCreditSpend.toFixed(2)} credits</span>
    </h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr style="background:#f8fafc;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Feature</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Credits</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Tx</th>
      </tr>
      ${spendRows}
    </table>
  </div>

  <div style="padding:24px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      Automated weekly digest · BlockID.au<br>
      <a href="https://blockid.au/admin/revenue-spend" style="color:#3b82f6;text-decoration:none;">View revenue dashboard →</a>
    </p>
  </div>

</div>
</body></html>`;
}
