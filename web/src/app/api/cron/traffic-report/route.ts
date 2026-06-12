// POST /api/cron/traffic-report — Daily website traffic + user funnel report.
//
// Combines Google Analytics 4 traffic (via service account — see lib/
// google-analytics.ts for the one-time setup) with the internal Supabase
// funnel (signups → analyses → paying), then emails ADMIN_EMAIL and posts a
// summary to Telegram. GA degrades gracefully: if GA_PROPERTY_ID isn't set,
// the report still ships with the internal funnel.
//
// Schedule: daily. Auth: Bearer CRON_SECRET.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { sendTelegram } from "@/lib/telegram";
import { getGA4Report, isGAConfigured } from "@/lib/google-analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@blockid.au";

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  const now = new Date();
  const day1 = new Date(now.getTime() - 86_400_000).toISOString();
  const day7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const dateStr = now.toISOString().slice(0, 10);

  // ── Internal funnel (Supabase) ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headCount = async (table: string, build?: (q: any) => any) => {
    const q0 = supabase!.from(table).select("*", { count: "exact", head: true });
    let q = q0;
    if (build) q = build(q) as typeof q;
    const { count } = await q;
    return count ?? 0;
  };

  const [
    totalUsers, newUsers1d, newUsers7d, analyses1d, analyses7d, purchases1d, purchases7d,
  ] = await Promise.all([
    headCount("app_users"),
    headCount("app_users", (q) => q.gte("created_at", day1)),
    headCount("app_users", (q) => q.gte("created_at", day7)),
    headCount("svi_analyses", (q) => q.gte("created_at", day1)),
    headCount("svi_analyses", (q) => q.gte("created_at", day7)),
    headCount("credit_transactions", (q) => q.gte("created_at", day1).gt("amount", 0)),
    headCount("credit_transactions", (q) => q.gte("created_at", day7).gt("amount", 0)),
  ]);

  // ── GA4 traffic (optional) ────────────────────────────────────────────
  const ga = await getGA4Report(1);

  // ── Build report ──────────────────────────────────────────────────────
  const trafficLine = ga
    ? `👀 *Visitors (GA, yesterday):* ${ga.activeUsers.toLocaleString()} users · ${ga.sessions.toLocaleString()} sessions · ${ga.pageViews.toLocaleString()} pageviews · ${ga.newUsers.toLocaleString()} new`
    : `👀 *Visitors (GA):* _not connected — set GA_PROPERTY_ID + grant the service account GA Viewer access to enable_`;

  const sourcesLine = ga?.topSources.length
    ? "\n📈 *Top channels:* " + ga.topSources.map((s) => `${s.source} (${s.users})`).join(", ")
    : "";
  const pagesLine = ga?.topPages.length
    ? "\n📄 *Top pages:* " + ga.topPages.map((p) => `${p.page} (${p.views})`).join(", ")
    : "";

  const tg = `📊 *BlockID.au — Traffic & Funnel*
📅 ${dateStr}

${trafficLine}${sourcesLine}${pagesLine}

🧭 *Funnel (24h / 7d):*
• Signups: ${newUsers1d} / ${newUsers7d}
• SVI analyses: ${analyses1d} / ${analyses7d}
• Paying (credit purchases): ${purchases1d} / ${purchases7d}
• Signup→Analysis: ${pct(analyses7d, newUsers7d)} · Analysis→Paid: ${pct(purchases7d, analyses7d)}

👥 *Total users:* ${totalUsers.toLocaleString()}`;

  const gaHtml = ga
    ? `<tr><td>Visitors (active users)</td><td align="right"><b>${ga.activeUsers.toLocaleString()}</b></td></tr>
       <tr><td>Sessions</td><td align="right">${ga.sessions.toLocaleString()}</td></tr>
       <tr><td>Pageviews</td><td align="right">${ga.pageViews.toLocaleString()}</td></tr>
       <tr><td>New visitors</td><td align="right">${ga.newUsers.toLocaleString()}</td></tr>
       <tr><td>Top channels</td><td align="right">${ga.topSources.map((s) => `${s.source} (${s.users})`).join("<br>") || "—"}</td></tr>
       <tr><td>Top pages</td><td align="right">${ga.topPages.map((p) => `${p.page} (${p.views})`).join("<br>") || "—"}</td></tr>`
    : `<tr><td colspan="2" style="color:#b45309">Google Analytics not connected — set <code>GA_PROPERTY_ID</code> and grant the service account GA Viewer access to include website traffic.</td></tr>`;

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1e293b">
    <h2 style="margin:0 0 4px">📊 Traffic &amp; Funnel — ${dateStr}</h2>
    <p style="color:#64748b;margin:0 0 16px">Daily report for BlockID.au</p>
    <h3 style="margin:16px 0 6px">👀 Website traffic (GA, yesterday)</h3>
    <table cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e2e8f0">${gaHtml}</table>
    <h3 style="margin:20px 0 6px">🧭 User funnel</h3>
    <table cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e2e8f0">
      <tr><th align="left">Stage</th><th align="right">24h</th><th align="right">7d</th></tr>
      <tr><td>Signups</td><td align="right">${newUsers1d}</td><td align="right">${newUsers7d}</td></tr>
      <tr><td>SVI analyses</td><td align="right">${analyses1d}</td><td align="right">${analyses7d}</td></tr>
      <tr><td>Paying (credit purchases)</td><td align="right">${purchases1d}</td><td align="right">${purchases7d}</td></tr>
      <tr><td>Signup→Analysis</td><td align="right" colspan="2">${pct(analyses7d, newUsers7d)} (7d)</td></tr>
      <tr><td>Analysis→Paid</td><td align="right" colspan="2">${pct(purchases7d, analyses7d)} (7d)</td></tr>
      <tr><td><b>Total users</b></td><td align="right" colspan="2"><b>${totalUsers.toLocaleString()}</b></td></tr>
    </table>
  </div>`;

  const [emailed, tgSent] = await Promise.all([
    sendEmail({ to: ADMIN_EMAIL, subject: `📊 BlockID Traffic & Funnel — ${dateStr}`, html })
      .then(() => true).catch((e) => { console.error("[traffic-report] email failed", e); return false; }),
    sendTelegram(tg).catch(() => false),
  ]);

  return NextResponse.json({
    ok: true,
    date: dateStr,
    gaConnected: isGAConfigured(),
    emailed,
    telegram: tgSent,
    funnel: { totalUsers, newUsers1d, newUsers7d, analyses1d, analyses7d, purchases1d, purchases7d },
    ga: ga ?? null,
  });
}
