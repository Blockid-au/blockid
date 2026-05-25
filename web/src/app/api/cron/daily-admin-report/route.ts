import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAIBudgetStatus } from "@/lib/ai-client";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Daily admin dashboard email — sends platform KPIs to admin@blockid.au.
 *
 * Trigger: GET /api/cron/daily-admin-report  (Authorization: Bearer CRON_SECRET)
 * Schedule: 22:00 UTC daily (= 8:00 AM AEST next day)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  try {
    // ── Date helpers (AEST = UTC+10) ──────────────────────────────────
    const now = new Date();
    const aestNow = new Date(now.getTime() + 10 * 60 * 60 * 1000);
    const dateStr = aestNow.toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Australia/Sydney",
    });

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // ── Gather metrics from Supabase ──────────────────────────────────

    const [
      newUsersRes,
      totalUsersRes,
      analysesTodayRes,
      totalAnalysesRes,
      creditsDataRes,
      checkoutsRes,
      planDataRes,
      pageViewsRes,
      topAnalysesRes,
    ] = await Promise.all([
      // 1. New users (last 24h)
      supabase
        .from("app_users")
        .select("*", { count: "exact", head: true })
        .gte("created_at", yesterday),
      // 2. Total users
      supabase
        .from("app_users")
        .select("*", { count: "exact", head: true }),
      // 3. Analyses run (last 24h)
      supabase
        .from("svi_analyses")
        .select("*", { count: "exact", head: true })
        .gte("created_at", yesterday),
      // 4. Total analyses
      supabase
        .from("svi_analyses")
        .select("*", { count: "exact", head: true }),
      // 5. Credits spent (last 24h) — negative amounts = spent
      supabase
        .from("credit_transactions")
        .select("amount")
        .lt("amount", 0)
        .gte("created_at", yesterday),
      // 6. Purchases (last 24h) — positive credits, excluding signup_bonus
      supabase
        .from("credit_transactions")
        .select("*", { count: "exact", head: true })
        .gt("amount", 0)
        .gte("created_at", yesterday)
        .not("reason", "eq", "signup_bonus"),
      // 7. Active plans breakdown
      supabase
        .from("app_users")
        .select("plan")
        .not("plan", "is", null),
      // 8. Page views (last 24h)
      supabase
        .from("user_actions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", yesterday),
      // 9. Top analyses today
      supabase
        .from("svi_analyses")
        .select("total_svi, created_at, email")
        .gte("created_at", yesterday)
        .order("total_svi", { ascending: false })
        .limit(5),
    ]);

    // ── Parse results ──────────────────────────────────────────────────

    const newUsers = newUsersRes.count ?? 0;
    const totalUsers = totalUsersRes.count ?? 0;
    const analysesToday = analysesTodayRes.count ?? 0;
    const totalAnalyses = totalAnalysesRes.count ?? 0;

    const creditsSpent =
      (creditsDataRes.data as { amount: number }[] | null)?.reduce(
        (sum, t) => sum + Math.abs(t.amount),
        0,
      ) ?? 0;

    const checkouts = checkoutsRes.count ?? 0;
    const pageViews = pageViewsRes.count ?? 0;

    // Plan distribution
    const planCounts: Record<string, number> = {};
    for (const row of (planDataRes.data ?? []) as { plan: string }[]) {
      const p = row.plan ?? "free";
      planCounts[p] = (planCounts[p] ?? 0) + 1;
    }

    const topAnalyses = (topAnalysesRes.data ?? []) as {
      total_svi: number;
      created_at: string;
      email: string;
    }[];

    // AI budget
    const aiBudget = getAIBudgetStatus();

    // ── 10. Run C-Level agent tasks and collect results ────────────────
    let agentResults: Array<{ agent: string; task: string; result: string; ok: boolean }> = [];
    try {
      const cronSecret = process.env.CRON_SECRET ?? "";
      const agentRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"}/api/cron/agent-upgrade`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${cronSecret}` },
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        agentResults = (agentData.results ?? []) as typeof agentResults;
      }
    } catch (err) {
      console.warn("[daily-admin-report] agent-upgrade call failed:", err);
    }

    // ── 11. AI-generated recommendations (if free providers available) ──
    let aiRecommendations = "";
    try {
      const { callAIForUpgrade } = await import("@/lib/ai-client");
      const recResult = await callAIForUpgrade({
        system: "You are the COO of BlockID.au, an AI-powered startup valuation platform. Write a brief daily operational summary (3-5 bullet points) with improvement recommendations based on today's metrics. Be specific and actionable. Format as markdown bullet list.",
        user: `Today's metrics (${dateStr}):
- New users: ${newUsers} (total: ${totalUsers})
- Analyses run: ${analysesToday} (total: ${totalAnalyses})
- Credits spent: ${creditsSpent}
- Purchases: ${checkouts}
- Page views: ${pageViews}
- Plans: ${Object.entries(planCounts).map(([p, c]) => `${p}=${c}`).join(", ")}
- AI budget: $${aiBudget.spent}/$${aiBudget.limit} (${aiBudget.percent}%)
- Agent results: ${agentResults.map(r => `[${r.agent}] ${r.result}`).join("; ")}

Write 3-5 concise recommendations. Focus on growth, conversion, and operational health.`,
        maxTokens: 500,
      });
      if (recResult) {
        aiRecommendations = recResult.text;
      }
    } catch {
      aiRecommendations = "";
    }

    // ── Locale formatting helper ───────────────────────────────────────

    const fmt = (n: number) => n.toLocaleString("en-AU");

    // ── Build HTML email ───────────────────────────────────────────────

    const planDistHtml = Object.entries(planCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([plan, count]) => `${plan}: <strong>${fmt(count)}</strong>`)
      .join(" &nbsp;|&nbsp; ");

    const topAnalysesRows = topAnalyses.length > 0
      ? topAnalyses
          .map(
            (a) =>
              `<tr>
              <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 14px;">${escapeHtml(a.email)}</td>
              <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 14px; text-align: right;"><strong>${a.total_svi}</strong>/200</td>
              <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 14px; color: #666;">${new Date(a.created_at).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit" })}</td>
            </tr>`,
          )
          .join("\n")
      : `<tr><td style="padding: 12px; color: #999; font-style: italic;" colspan="3">No analyses in the last 24 hours</td></tr>`;

    const budgetColor =
      aiBudget.percent >= 90
        ? "#dc2626"
        : aiBudget.percent >= 70
          ? "#f59e0b"
          : "#16a34a";

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f4f4f5;">
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">

  <!-- Header -->
  <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 32px 24px; text-align: center;">
    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">BlockID.au Daily Report</h1>
    <p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">${dateStr} AEST</p>
  </div>

  <!-- KPI Cards -->
  <div style="padding: 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px; background: #f8fafc; border-radius: 8px; width: 50%; vertical-align: top;">
          <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">New Users (24h)</div>
          <div style="font-size: 28px; font-weight: 700; color: #1e293b; margin-top: 4px;">${fmt(newUsers)}</div>
          <div style="font-size: 12px; color: #94a3b8;">Total: ${fmt(totalUsers)}</div>
        </td>
        <td style="width: 12px;"></td>
        <td style="padding: 12px; background: #f8fafc; border-radius: 8px; width: 50%; vertical-align: top;">
          <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Analyses (24h)</div>
          <div style="font-size: 28px; font-weight: 700; color: #1e293b; margin-top: 4px;">${fmt(analysesToday)}</div>
          <div style="font-size: 12px; color: #94a3b8;">Total: ${fmt(totalAnalyses)}</div>
        </td>
      </tr>
      <tr><td colspan="3" style="height: 12px;"></td></tr>
      <tr>
        <td style="padding: 12px; background: #f8fafc; border-radius: 8px; width: 50%; vertical-align: top;">
          <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Credits Spent (24h)</div>
          <div style="font-size: 28px; font-weight: 700; color: #1e293b; margin-top: 4px;">${fmt(creditsSpent)}</div>
          <div style="font-size: 12px; color: #94a3b8;">credits used</div>
        </td>
        <td style="width: 12px;"></td>
        <td style="padding: 12px; background: #f8fafc; border-radius: 8px; width: 50%; vertical-align: top;">
          <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Purchases (24h)</div>
          <div style="font-size: 28px; font-weight: 700; color: #1e293b; margin-top: 4px;">${fmt(checkouts)}</div>
          <div style="font-size: 12px; color: #94a3b8;">credit purchases</div>
        </td>
      </tr>
      <tr><td colspan="3" style="height: 12px;"></td></tr>
      <tr>
        <td colspan="3" style="padding: 12px; background: #f8fafc; border-radius: 8px; vertical-align: top;">
          <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Page Views / Actions (24h)</div>
          <div style="font-size: 28px; font-weight: 700; color: #1e293b; margin-top: 4px;">${fmt(pageViews)}</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Plan Distribution -->
  <div style="padding: 0 24px 24px;">
    <h2 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Plan Distribution</h2>
    <p style="margin: 0; font-size: 14px; color: #475569;">
      ${planDistHtml || '<span style="color: #94a3b8; font-style: italic;">No plan data available</span>'}
    </p>
  </div>

  <!-- AI Budget -->
  <div style="padding: 0 24px 24px;">
    <h2 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">AI Budget (${aiBudget.month})</h2>
    <div style="background: #f1f5f9; border-radius: 8px; padding: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 14px; color: #475569;">$${aiBudget.spent.toFixed(2)} / $${aiBudget.limit}</span>
        <span style="font-size: 14px; font-weight: 600; color: ${budgetColor};">${aiBudget.percent}%</span>
      </div>
      <div style="background: #e2e8f0; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: ${budgetColor}; height: 100%; width: ${Math.min(aiBudget.percent, 100)}%; border-radius: 4px;"></div>
      </div>
      <div style="margin-top: 8px; font-size: 13px; color: #64748b;">${fmt(aiBudget.calls)} API calls this month</div>
    </div>
  </div>

  <!-- Top Analyses -->
  <div style="padding: 0 24px 24px;">
    <h2 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Top Analyses (24h)</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
      <tr style="background: #f8fafc;">
        <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Email</th>
        <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase;">SVI Score</th>
        <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Time</th>
      </tr>
      ${topAnalysesRows}
    </table>
  </div>

  <!-- C-Level Agent Status -->
  ${agentResults.length > 0 ? `
  <div style="padding: 0 24px 24px;">
    <h2 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">C-Level Agent Activity</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
      ${agentResults.map(r => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top;">
          <span style="display: inline-block; background: ${r.ok ? "#dcfce7" : "#fee2e2"}; color: ${r.ok ? "#166534" : "#991b1b"}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.5px;">${escapeHtml(r.agent)}</span>
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #475569;">
          <strong style="color: #1e293b;">${escapeHtml(r.task)}</strong><br>
          <span style="color: #64748b;">${escapeHtml(r.result.slice(0, 200))}</span>
        </td>
      </tr>`).join("")}
    </table>
  </div>` : ""}

  <!-- COO Recommendations -->
  ${aiRecommendations ? `
  <div style="padding: 0 24px 24px;">
    <h2 style="margin: 0 0 12px; font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">COO Recommendations</h2>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px;">
      <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.7; white-space: pre-line;">${escapeHtml(aiRecommendations)}</p>
    </div>
  </div>` : ""}

  <!-- Footer -->
  <div style="padding: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #94a3b8;">
      Automated daily report from BlockID.au — COO Agent<br>
      <a href="https://blockid.au/admin" style="color: #3b82f6; text-decoration: none;">View admin dashboard &#8594;</a>
    </p>
  </div>

</div>
</body>
</html>`;

    // ── Send email ─────────────────────────────────────────────────────

    const subject = `BlockID Daily \u2014 ${dateStr} | ${fmt(newUsers)} new users, ${fmt(analysesToday)} analyses`;

    const emailResult = await sendEmail({
      to: "admin@blockid.au",
      subject,
      html: emailHtml,
    });

    console.log("[daily-admin-report] Email sent:", emailResult);

    return NextResponse.json({
      ok: true,
      date: dateStr,
      metrics: {
        newUsers,
        totalUsers,
        analysesToday,
        totalAnalyses,
        creditsSpent,
        checkouts,
        pageViews,
        planCounts,
        aiBudget,
        topAnalyses: topAnalyses.length,
        agentTasks: agentResults.length,
        hasRecommendations: !!aiRecommendations,
      },
      emailResult,
    });
  } catch (err) {
    console.error("[daily-admin-report] cron failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── HTML escape helper ──────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
