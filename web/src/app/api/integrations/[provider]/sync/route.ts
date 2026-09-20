import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import {
  getConnection,
  markSynced,
  writeSignals,
  type OAuthProvider,
} from "@/lib/oauth-connectors";
import { fetchGithubSignals } from "@/lib/oauth-github-signals";
import { fetchStripeSignals } from "@/lib/oauth-stripe-signals";
import { fetchGa4RichSignals, fetchGa4Signals, ga4SnapshotRow, writeGa4Snapshot, type Ga4SnapshotDb } from "@/lib/oauth-ga4-signals";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { emitConnectorEvidence } from "@/lib/connectors/connector-evidence";

export const dynamic = "force-dynamic";

const PROVIDERS: OAuthProvider[] = ["github", "stripe", "ga4"];
const RATE_LIMIT_MS = 60_000;

async function POST_handler(
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

  // S18-A — member-aware (editor+): the connection is the CALLER's own
  // token for this project; the refreshed signals are written under the
  // project OWNER's user_id so owner + members read one set.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const signalsUserId = scope?.ownerUserId ?? user.id;
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
      await writeSignals(signalsUserId, projectId, "github", [
        { key: "recent_commits_30d", numeric: s.recentCommits30d },
        { key: "public_repos", numeric: s.publicRepos },
        { key: "top_language", text: s.topLanguage },
        { key: "primary_repo_name", text: s.primaryRepoName },
        { key: "primary_repo_stars", numeric: s.primaryRepoStars },
      ]);
      // G21 P3-C — the pull as EvidenceRecords on the claim register (fail-soft).
      await emitConnectorEvidence({ projectId, input: { provider: "github", metrics: s }, actorUserId: user.id });
    } else if (provider === "stripe") {
      const s = await fetchStripeSignals(conn.accessToken);
      await writeSignals(signalsUserId, projectId, "stripe", [
        { key: "mrr_aud", numeric: s.mrrAud },
        { key: "active_customers", numeric: s.activeCustomers },
        { key: "recent_payments_30d", numeric: s.recentPayments30d },
        { key: "average_order_aud", numeric: s.averageOrderAud },
      ]);
      await emitConnectorEvidence({ projectId, input: { provider: "stripe", metrics: s }, actorUserId: user.id });
    } else {
      const propertyId =
        (conn.metadata?.propertyId as string | undefined) ??
        conn.providerAccountId ??
        "";
      if (!propertyId) {
        throw new Error("no_property_id");
      }
      const s = await fetchGa4Signals(conn.accessToken, propertyId);
      await writeSignals(signalsUserId, projectId, "ga4", [
        { key: "sessions_30d", numeric: s.sessions30d },
        { key: "new_users_30d", numeric: s.newUsers30d },
        { key: "conversions_30d", numeric: s.conversions30d },
        { key: "avg_session_duration_sec", numeric: s.averageSessionDurationSec },
      ]);
      await emitConnectorEvidence({ projectId, input: { provider: "ga4", metrics: s }, actorUserId: user.id });
      // S-R5: richer 90-day pull → ga4_signal_snapshots (AARRR funnel + channel
      // mix for TRE / MPC). Best-effort: a failed rich pull or a missing table
      // (0402 not applied) never fails the sync the founder just clicked.
      try {
        const rich = await fetchGa4RichSignals(conn.accessToken, propertyId);
        const db = getSupabaseAdmin();
        if (db) await writeGa4Snapshot(db as unknown as Ga4SnapshotDb, ga4SnapshotRow({ userId: signalsUserId, projectId, propertyId, signals: rich, source: "sync" }));
      } catch (err) {
        console.warn("[integrations:sync] ga4 rich pull skipped:", err instanceof Error ? err.message : String(err));
      }
    }
    await markSynced(conn.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = (err as Error).message;
    await markSynced(conn.id, message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/integrations/[provider]/sync/route.ts", method: "POST" }, POST_handler);
