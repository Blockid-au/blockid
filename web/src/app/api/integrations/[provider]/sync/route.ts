import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  getConnection,
  markSynced,
  writeSignals,
  type OAuthProvider,
} from "@/lib/oauth-connectors";
import { fetchGithubSignals } from "@/lib/oauth-github-signals";
import { fetchStripeSignals } from "@/lib/oauth-stripe-signals";
import { fetchGa4Signals } from "@/lib/oauth-ga4-signals";

export const dynamic = "force-dynamic";

const PROVIDERS: OAuthProvider[] = ["github", "stripe", "ga4"];
const RATE_LIMIT_MS = 60_000;

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await ctx.params;
  if (!PROVIDERS.includes(raw as OAuthProvider)) {
    return NextResponse.json({ ok: false, error: "bad_provider" }, { status: 400 });
  }
  const provider = raw as OAuthProvider;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const projectId = await getProjectIdFromRequest();
  const conn = await getConnection(user.id, provider, projectId);
  if (!conn || conn.status !== "active" || !conn.accessToken) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 404 });
  }

  if (conn.lastSyncAt) {
    const age = Date.now() - new Date(conn.lastSyncAt).getTime();
    if (age < RATE_LIMIT_MS) {
      return NextResponse.json(
        {
          ok: false,
          error: "rate_limited",
          retryAfterMs: RATE_LIMIT_MS - age,
        },
        { status: 429 },
      );
    }
  }

  try {
    if (provider === "github") {
      const s = await fetchGithubSignals(conn.accessToken);
      await writeSignals(user.id, projectId, "github", [
        { key: "recent_commits_30d", numeric: s.recentCommits30d },
        { key: "public_repos", numeric: s.publicRepos },
        { key: "top_language", text: s.topLanguage },
        { key: "primary_repo_name", text: s.primaryRepoName },
        { key: "primary_repo_stars", numeric: s.primaryRepoStars },
      ]);
    } else if (provider === "stripe") {
      const s = await fetchStripeSignals(conn.accessToken);
      await writeSignals(user.id, projectId, "stripe", [
        { key: "mrr_aud", numeric: s.mrrAud },
        { key: "active_customers", numeric: s.activeCustomers },
        { key: "recent_payments_30d", numeric: s.recentPayments30d },
        { key: "average_order_aud", numeric: s.averageOrderAud },
      ]);
    } else {
      const propertyId =
        (conn.metadata?.propertyId as string | undefined) ??
        conn.providerAccountId ??
        "";
      if (!propertyId) {
        throw new Error("no_property_id");
      }
      const s = await fetchGa4Signals(conn.accessToken, propertyId);
      await writeSignals(user.id, projectId, "ga4", [
        { key: "sessions_30d", numeric: s.sessions30d },
        { key: "new_users_30d", numeric: s.newUsers30d },
        { key: "conversions_30d", numeric: s.conversions30d },
        { key: "avg_session_duration_sec", numeric: s.averageSessionDurationSec },
      ]);
    }
    await markSynced(conn.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = (err as Error).message;
    await markSynced(conn.id, message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
