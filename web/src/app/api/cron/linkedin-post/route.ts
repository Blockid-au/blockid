// POST /api/cron/linkedin-post — Weekly LinkedIn share for SVI score milestones
//
// Auth: CRON_SECRET header (Bearer token)
// Rate limits: max 3 posts per run, 7-day cooldown per user via svi_notifications
//
// Flow:
//   1. Find users with linkedin oauth_connection AND a recent SVI score
//   2. Skip users who posted within the last 7 days
//   3. Fetch LinkedIn personId via /v2/userinfo (or use cached metadata)
//   4. Post SVI milestone share via ugcPosts API
//   5. Record in svi_notifications to enforce 7-day cooldown

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_RUN = 3;
const COOLDOWN_DAYS = 7;
const NOTIFICATION_TYPE = "linkedin_post";

// Human-readable dimension labels
const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision",
};

function buildPostText(score: number, stage: string, topDimension: string, topScore: number): string {
  return `🚀 Just ran a Startup Value Index analysis on BlockID — scored ${score}/100 in ${stage} stage.

Top strength: ${topDimension} (${topScore}/100)

SVI tracks 8 dimensions of real startup progress: traction, team, product, IP, capital, market, strategy, and financial health.

Curious what your startup scores? → blockid.au/score`;
}

async function getPersonId(accessToken: string, cachedMetadata: Record<string, unknown> | null): Promise<string | null> {
  if (cachedMetadata?.person_id && typeof cachedMetadata.person_id === "string") {
    return cachedMetadata.person_id;
  }
  try {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { sub?: string };
    return data.sub ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Find users with LinkedIn connected and a current SVI score
    const { data: connections, error: connErr } = await supabase
      .from("oauth_connections")
      .select("user_email, access_token, metadata")
      .eq("provider", "linkedin")
      .not("access_token", "is", null);

    if (connErr) throw connErr;
    if (!connections?.length) {
      return NextResponse.json({ ok: true, posted: 0, skipped: 0, reason: "no linkedin connections" });
    }

    // Fetch SVI accounts for these users
    const emails = connections.map((c: { user_email: string }) => c.user_email);
    const { data: accounts, error: accErr } = await supabase
      .from("svi_accounts")
      .select("id, email, current_svi, current_stage")
      .in("email", emails)
      .not("current_svi", "is", null);

    if (accErr) throw accErr;
    if (!accounts?.length) {
      return NextResponse.json({ ok: true, posted: 0, skipped: 0, reason: "no svi scores found" });
    }

    // Build connection lookup map
    const connectionByEmail = new Map(connections.map((c: { user_email: string; access_token: string; metadata: Record<string, unknown> | null }) => [c.user_email, c]));

    // Check 7-day cooldown for all candidate accounts
    const sevenDaysAgo = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const accountIds = accounts.map((a: { id: string }) => a.id);
    const { data: recentPosts } = await supabase
      .from("svi_notifications")
      .select("account_id")
      .eq("notification_type", NOTIFICATION_TYPE)
      .in("account_id", accountIds)
      .gte("sent_at", sevenDaysAgo);

    const recentlyPosted = new Set((recentPosts ?? []).map((r: { account_id: string }) => r.account_id));

    // Find latest SVI analysis for top dimension (fetch for batch)
    const { data: analyses } = await supabase
      .from("svi_analyses")
      .select("email, analysis_json")
      .in("email", emails)
      .order("created_at", { ascending: false });

    // Keep only the most recent analysis per email
    const latestAnalysisByEmail = new Map<string, unknown>();
    for (const row of (analyses ?? [])) {
      if (!latestAnalysisByEmail.has(row.email)) {
        latestAnalysisByEmail.set(row.email, row.analysis_json);
      }
    }

    let posted = 0;
    let skipped = 0;
    const results: Array<{ email: string; status: string; reason?: string }> = [];

    for (const account of accounts) {
      if (posted >= MAX_PER_RUN) break;

      if (recentlyPosted.has(account.id)) {
        skipped++;
        results.push({ email: account.email, status: "skipped", reason: "cooldown" });
        continue;
      }

      const conn = connectionByEmail.get(account.email);
      if (!conn?.access_token) {
        skipped++;
        results.push({ email: account.email, status: "skipped", reason: "no_token" });
        continue;
      }

      // Determine top dimension from latest analysis
      let topDimension = "Traction & Revenue";
      let topScore = account.current_svi as number;
      const analysisJson = latestAnalysisByEmail.get(account.email);
      if (analysisJson) {
        const parsed = analysisJson as { subs?: Array<{ key: string; value: number }> };
        if (Array.isArray(parsed.subs) && parsed.subs.length > 0) {
          const best = parsed.subs.reduce((a, b) => (b.value > a.value ? b : a));
          topDimension = DIMENSION_LABELS[best.key] ?? best.key;
          topScore = Math.round(best.value);
        }
      }

      const score = Math.round(account.current_svi as number);
      const stage = (account.current_stage as string) ?? "early";
      const postText = buildPostText(score, stage, topDimension, topScore);

      // Get LinkedIn personId
      const personId = await getPersonId(conn.access_token, conn.metadata as Record<string, unknown> | null);
      if (!personId) {
        skipped++;
        results.push({ email: account.email, status: "skipped", reason: "no_person_id" });
        // Cache miss — update metadata so next run doesn't retry the API call unnecessarily
        continue;
      }

      // Cache personId in oauth_connections.metadata if not already stored
      if (!(conn.metadata as Record<string, unknown> | null)?.person_id) {
        await supabase
          .from("oauth_connections")
          .update({ metadata: { ...(conn.metadata ?? {}), person_id: personId } })
          .eq("user_email", account.email)
          .eq("provider", "linkedin");
      }

      // Post to LinkedIn ugcPosts
      const ugcPayload = {
        author: `urn:li:person:${personId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: postText },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };

      const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(ugcPayload),
      });

      if (!postRes.ok) {
        const errBody = await postRes.text().catch(() => "");
        console.warn(`[blockid:cron:linkedin-post] failed for ${account.email}: ${postRes.status} ${errBody}`);
        skipped++;
        results.push({ email: account.email, status: "failed", reason: `linkedin_${postRes.status}` });
        continue;
      }

      // Record in svi_notifications for 7-day cooldown
      await supabase.from("svi_notifications").insert({
        account_id: account.id,
        notification_type: NOTIFICATION_TYPE,
        subject: `LinkedIn SVI post — score ${score}`,
        sent_at: new Date().toISOString(),
        payload: { score, stage, top_dimension: topDimension, top_score: topScore, person_id: personId },
      });

      posted++;
      results.push({ email: account.email, status: "posted" });
    }

    return NextResponse.json({ ok: true, posted, skipped, results });
  } catch (err) {
    console.error("[blockid:cron:linkedin-post] error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
