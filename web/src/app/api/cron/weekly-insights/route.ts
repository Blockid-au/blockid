import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Get all active accounts with SVI data
    const { data: accounts } = await supabase
      .from("svi_accounts")
      .select("id, email, name, current_svi, current_stage, last_active_at")
      .not("current_svi", "is", null);

    let sent = 0;

    for (const account of accounts ?? []) {
      // Skip if no SVI score
      if (!account.current_svi) continue;

      // Get latest analysis
      const { data: analysis } = await supabase
        .from("svi_analyses")
        .select("analysis_json, created_at")
        .eq("email", account.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!analysis) continue;

      // Get week-over-week delta
      const { data: snapshots } = await supabase
        .from("svi_snapshots")
        .select("svi_total, snapshot_date")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(2);

      const currentSVI = account.current_svi;
      const previousSVI = snapshots?.[1]?.svi_total;
      const delta = previousSVI ? currentSVI - previousSVI : null;

      // Generate personalised insight with AI
      let insight = "Keep building! Upload more evidence to boost your SVI score.";

      if (isAIConfigured()) {
        try {
          const analysisData = analysis.analysis_json as any;
          const topGap = analysisData?.evidenceGaps?.[0];

          const { text } = await callAI({
            system: "You are a friendly startup mentor. Write a 2-3 sentence personalised weekly insight for a founder. Be encouraging, specific, and actionable. No jargon.",
            user: `Founder: ${account.name ?? "there"}
SVI Score: ${currentSVI}${delta ? ` (${delta > 0 ? "+" : ""}${delta} this week)` : ""}
Stage: ${account.current_stage ?? 0}
Top opportunity: ${topGap?.label ?? "Upload evidence"} — ${topGap?.action ?? "Add documents to boost your score"}
Write a brief, motivating weekly update.`,
            maxTokens: 200,
          });
          insight = text.trim();
        } catch {
          // Fallback to generic insight
        }
      }

      // Send email
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
      const firstName = account.name?.split(" ")[0] ?? "there";

      await sendEmail({
        to: account.email,
        subject: `Your weekly SVI update — ${currentSVI} points${delta ? ` (${delta > 0 ? "\u2191" : "\u2193"}${Math.abs(delta)})` : ""}`,
        html: `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;color:#1e293b;">
          <div style="text-align:center;padding:24px 0;">
            <img src="${siteUrl}/images/logo-transparent.png" alt="BlockID.au" style="height:40px;" />
          </div>
          <h1 style="font-size:20px;margin:0 0 8px 0;">Hey ${firstName}!</h1>
          <p style="font-size:32px;font-weight:bold;color:#2563eb;margin:8px 0;">${currentSVI}</p>
          <p style="color:#64748b;font-size:14px;margin:0 0 16px 0;">Your Startup Value Index${delta ? ` \u2014 ${delta > 0 ? "+" : ""}${delta} since last week` : ""}</p>
          <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:16px 0;">
            <p style="font-size:14px;line-height:1.6;margin:0;">${insight}</p>
          </div>
          <div style="text-align:center;margin:24px 0;">
            <a href="${siteUrl}/dashboard/svi" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">View Your Dashboard</a>
          </div>
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:32px;">BlockID.au \u2014 Valuation. Ownership. Execution. Growth.</p>
        </div>`,
      });

      sent++;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[weekly-insights]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
