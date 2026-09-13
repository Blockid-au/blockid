// S25-A — weekly connector resync worker (one connection per call).
//
// `api/cron/connector-resync` lists active Stripe / Xero connections from
// BOTH vaults — `oauth_connections_v2` (lib/oauth-connectors.ts, written by
// api/integrations/stripe/callback) and the legacy account_id-keyed
// `oauth_connections` (written by api/oauth/{stripe,xero}/callback) — claims
// each with a 15-minute lease (the evaluation-batch-runner pattern: a
// conditional UPDATE that only wins when the lease is null or expired) and
// hands it to `resyncConnection()`:
//
//   1. open the sealed token (`openToken`, S23-A). A row whose token cannot
//      be opened is `token_unreadable`: one in-app `connector_reconnect`
//      notification per 30 days, nothing else — never a log line with the
//      payload.
//   2. Xero: refresh first (30-minute access tokens; Xero rotates the
//      refresh token, so the new pair is sealed back onto the row).
//      `invalid_grant` = the user revoked us → `needs_reconnect` + the same
//      notification.
//   3. re-pull the SAME metrics the callback pulls — Stripe Connect: MRR,
//      active subscriptions, customers, 90-day churn; Xero: 3-month P&L
//      income / expenses / net + bank balance.
//   4. insert a dated `connector_snapshots` row (0349), compare with the
//      previous snapshot (`metricsChanged`) …
//   5. … refresh the dated `svi_signals` / `svi_evidence` rows the callback
//      writes (upsert), and
//   6. when the values moved: rescore the account through the shared
//      `rescoreAccountFromEvidence()` and enqueue `svi.rescored`
//      (source "connector_resync") for the owner's endpoints.
//
// Every DB call goes through the injected client so the cron test can run
// the whole worker against a fake. Nothing here logs a token.

import type { SupabaseClient } from "@supabase/supabase-js";
import { openToken, sealToken } from "@/lib/oauth-token-seal";
import { fetchStripeConnectMetrics, type StripeConnectMetrics } from "@/lib/oauth-stripe-signals";
import {
  XERO_PL_EVIDENCE_DIMENSION,
  XERO_REVENUE_EVIDENCE_DIMENSION,
  XeroRefreshError,
  fetchXeroMetrics,
  fetchXeroTenant,
  refreshXeroToken,
  type XeroMetrics,
} from "@/lib/connectors/xero-metrics";
import {
  insertConnectorSnapshot,
  loadSnapshotHistory,
  metricsChanged,
  type ConnectorProvider,
} from "@/lib/connectors/snapshots";
import { scoreConnectedRevenue } from "@/lib/svi/connected-revenue-score";
import { rescoreAccountFromEvidence } from "@/lib/svi/rescore-from-evidence";
import { insertNotification } from "@/lib/notifications";
import { enqueueWebhook } from "@/lib/webhooks/registry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export const MAX_CONNECTIONS_PER_TICK = 20;
export const RESYNC_LEASE_MINUTES = 15;
/** A connection synced more recently than this is not a candidate (weekly cadence, manual re-runs are cheap). */
export const RESYNC_MIN_INTERVAL_DAYS = 6;
export const RECONNECT_NOTIFY_THROTTLE_MS = 30 * 24 * 60 * 60 * 1000;

export type ConnectionTable = "oauth_connections_v2" | "oauth_connections";

export interface ResyncCandidate {
  table: ConnectionTable;
  id: string;
  provider: ConnectorProvider;
  /** Sealed payloads exactly as stored (never logged). */
  accessTokenSealed: string | null;
  refreshTokenSealed: string | null;
  /** v2: the linker's user_id; legacy: null until the account is resolved. */
  linkedUserId: string | null;
  projectId: string | null;
  /** legacy: oauth_connections.account_id (svi_accounts.id). */
  accountId: string | null;
  /** stripe_user_id / Xero tenantId. */
  providerAccountId: string | null;
  metadata: Record<string, unknown>;
  resyncLastAt: string | null;
}

export type ResyncOutcome =
  | "synced"
  | "unchanged"
  | "token_unreadable"
  | "needs_reconnect"
  | "failed"
  | "would_run"
  | "skipped_scope";

export interface ResyncSummary {
  table: ConnectionTable;
  id: string;
  provider: ConnectorProvider;
  project_id: string | null;
  outcome: ResyncOutcome;
  changed?: boolean;
  svi_delta?: number | null;
  webhooks_queued?: number;
  error?: string;
}

interface V2Row {
  id: string;
  user_id: string;
  project_id: string | null;
  provider: string;
  provider_account_id: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  metadata: Record<string, unknown> | null;
  resync_last_at: string | null;
}

interface LegacyRow {
  id: string;
  account_id: string | null;
  provider: string;
  provider_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  raw_profile: string | Record<string, unknown> | null;
  resync_last_at: string | null;
}

function parseProfile(raw: LegacyRow["raw_profile"]): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isProvider(v: string): v is ConnectorProvider {
  return v === "stripe" || v === "xero";
}

/**
 * Candidates from both vaults, oldest-synced first, at most `limit`. Rows
 * synced within `RESYNC_MIN_INTERVAL_DAYS` are excluded. Legacy rows without
 * an access token are revoked (`api/evidence/disconnect` deletes the row;
 * `revokeConnection` nulls the columns) and are not candidates.
 */
export async function listResyncCandidates(db: Db, limit: number, now: Date = new Date()): Promise<ResyncCandidate[]> {
  const staleBefore = new Date(now.getTime() - RESYNC_MIN_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const out: ResyncCandidate[] = [];

  const v2 = await db
    .from("oauth_connections_v2")
    .select("id, user_id, project_id, provider, provider_account_id, access_token_encrypted, refresh_token_encrypted, metadata, resync_last_at")
    .eq("status", "active")
    .in("provider", ["stripe", "xero"])
    .or(`resync_last_at.is.null,resync_last_at.lt.${staleBefore}`)
    .order("resync_last_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (v2.error) throw new Error(`oauth_connections_v2: ${v2.error.message}`);
  for (const r of (v2.data ?? []) as V2Row[]) {
    if (!isProvider(r.provider)) continue;
    out.push({
      table: "oauth_connections_v2",
      id: r.id,
      provider: r.provider,
      accessTokenSealed: r.access_token_encrypted,
      refreshTokenSealed: r.refresh_token_encrypted,
      linkedUserId: r.user_id,
      projectId: r.project_id,
      accountId: null,
      providerAccountId: r.provider_account_id,
      metadata: r.metadata ?? {},
      resyncLastAt: r.resync_last_at,
    });
  }

  if (out.length < limit) {
    const legacy = await db
      .from("oauth_connections")
      .select("id, account_id, provider, provider_user_id, access_token, refresh_token, raw_profile, resync_last_at")
      .in("provider", ["stripe", "xero"])
      .not("access_token", "is", null)
      .or(`resync_last_at.is.null,resync_last_at.lt.${staleBefore}`)
      .order("resync_last_at", { ascending: true, nullsFirst: true })
      .limit(limit - out.length);
    if (legacy.error) throw new Error(`oauth_connections: ${legacy.error.message}`);
    for (const r of (legacy.data ?? []) as LegacyRow[]) {
      if (!isProvider(r.provider)) continue;
      const profile = parseProfile(r.raw_profile);
      out.push({
        table: "oauth_connections",
        id: r.id,
        provider: r.provider,
        accessTokenSealed: r.access_token,
        refreshTokenSealed: r.refresh_token,
        linkedUserId: null,
        projectId: null,
        accountId: r.account_id,
        providerAccountId: r.provider_user_id ?? (typeof profile.tenantId === "string" ? profile.tenantId : null),
        metadata: profile,
        resyncLastAt: r.resync_last_at,
      });
    }
  }

  return out.slice(0, limit);
}

/** Conditional lease flip; false when another tick holds the row. */
export async function claimConnection(db: Db, c: Pick<ResyncCandidate, "table" | "id">, now: Date = new Date()): Promise<boolean> {
  const nowIso = now.toISOString();
  const until = new Date(now.getTime() + RESYNC_LEASE_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await db
    .from(c.table)
    .update({ resync_leased_until: until })
    .eq("id", c.id)
    .or(`resync_leased_until.is.null,resync_leased_until.lt.${nowIso}`)
    .select("id");
  if (error) {
    console.warn("[connector-resync] claim failed", { table: c.table, id: c.id, code: error.code });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function releaseConnection(
  db: Db,
  c: Pick<ResyncCandidate, "table" | "id">,
  now: Date,
  error: string | null,
): Promise<void> {
  const patch: Record<string, unknown> =
    c.table === "oauth_connections_v2"
      ? { resync_leased_until: null, resync_last_at: now.toISOString(), last_sync_at: now.toISOString(), last_sync_error: error, status: error ? "error" : "active" }
      : { resync_leased_until: null, resync_last_at: now.toISOString() };
  await db.from(c.table).update(patch).eq("id", c.id);
}

export interface ResolvedScope {
  ownerUserId: string | null;
  projectId: string | null;
  accountId: string | null;
  dataEmail: string | null;
}

/**
 * Who owns the data this connection feeds: the project OWNER (svi_signals /
 * connector_snapshots key) and the svi_accounts row (svi_evidence key).
 */
export async function resolveScope(db: Db, c: ResyncCandidate): Promise<ResolvedScope> {
  if (c.table === "oauth_connections") {
    if (!c.accountId) return { ownerUserId: null, projectId: null, accountId: null, dataEmail: null };
    const { data } = await db.from("svi_accounts").select("id, email, user_id, project_id").eq("id", c.accountId).maybeSingle();
    if (!data) return { ownerUserId: null, projectId: null, accountId: c.accountId, dataEmail: null };
    let ownerUserId = (data.user_id as string | null) ?? null;
    if (!ownerUserId && data.email) {
      const { data: u } = await db.from("app_users").select("id").ilike("email", data.email as string).maybeSingle();
      ownerUserId = (u?.id as string | undefined) ?? null;
    }
    return { ownerUserId, projectId: (data.project_id as string | null) ?? null, accountId: data.id as string, dataEmail: (data.email as string) ?? null };
  }

  // v2 — signals were written under the project OWNER's user_id at link time.
  let ownerUserId = c.linkedUserId;
  if (c.projectId) {
    const { data: p } = await db.from("projects").select("user_id").eq("id", c.projectId).maybeSingle();
    if (p?.user_id) ownerUserId = p.user_id as string;
  }
  let acct = c.projectId
    ? await db.from("svi_accounts").select("id, email").eq("project_id", c.projectId).limit(1).maybeSingle()
    : { data: null };
  if (!acct.data && ownerUserId && !c.projectId) {
    acct = await db.from("svi_accounts").select("id, email").eq("user_id", ownerUserId).is("project_id", null).limit(1).maybeSingle();
  }
  return {
    ownerUserId,
    projectId: c.projectId,
    accountId: (acct.data?.id as string | undefined) ?? null,
    dataEmail: (acct.data?.email as string | undefined) ?? null,
  };
}

async function notifyReconnect(c: ResyncCandidate, scope: ResolvedScope): Promise<void> {
  const userId = scope.ownerUserId ?? c.linkedUserId;
  if (!userId) return;
  await insertNotification({
    userId,
    projectId: scope.projectId,
    kind: "connector_reconnect",
    payload: { provider: c.provider, href: "/workspace/evidence" },
    dedupeKey: `connector_reconnect:${c.provider}:${c.table}:${c.id}`,
    throttleMs: RECONNECT_NOTIFY_THROTTLE_MS,
  });
}

async function upsertSignals(
  db: Db,
  ownerUserId: string,
  projectId: string | null,
  provider: ConnectorProvider,
  signals: Array<{ key: string; numeric: number | null }>,
  now: Date,
): Promise<void> {
  const rows = signals.map((s) => ({
    user_id: ownerUserId,
    project_id: projectId,
    provider,
    signal_key: s.key,
    signal_value_num: s.numeric,
    signal_value_text: null,
    metadata: { source: "connector_resync" },
    captured_at: now.toISOString(),
  }));
  const { error } = await db.from("svi_signals").upsert(rows, { onConflict: "user_id,provider,signal_key,project_id", ignoreDuplicates: false });
  if (error) console.warn("[connector-resync] svi_signals upsert failed", { provider, code: error.code });
}

async function upsertEvidence(
  db: Db,
  accountId: string,
  match: { evidence_type: string; dimension: string },
  payload: Record<string, unknown>,
  now: Date,
): Promise<void> {
  const { data: existing } = await db
    .from("svi_evidence")
    .select("id")
    .eq("account_id", accountId)
    .eq("evidence_type", match.evidence_type)
    .eq("dimension", match.dimension)
    .maybeSingle();
  const row = { account_id: accountId, ...match, ...payload, confidence_level: "connected_source", verified_at: now.toISOString() };
  if (existing?.id) await db.from("svi_evidence").update(row).eq("id", existing.id);
  else await db.from("svi_evidence").insert({ ...row, created_at: now.toISOString() });
}

function money(v: number): string {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
}

async function applyStripe(db: Db, scope: ResolvedScope, m: StripeConnectMetrics, now: Date): Promise<void> {
  if (scope.ownerUserId) {
    await upsertSignals(db, scope.ownerUserId, scope.projectId, "stripe", [
      { key: "mrr_aud", numeric: m.mrrAud },
      { key: "active_customers", numeric: m.activeCustomers },
      { key: "active_subscriptions", numeric: m.activeSubscriptions },
      { key: "churn_rate_90d_pct", numeric: m.churnRate90dPct },
    ], now);
  }
  if (scope.accountId) {
    const score = scoreConnectedRevenue({ mrrAud: m.mrrAud, capturedAt: now.toISOString(), churnRate90dPct: m.churnRate90dPct, now });
    await upsertEvidence(db, scope.accountId, { evidence_type: "stripe", dimension: "tre" }, {
      label: m.mrrAud > 0 ? `Stripe: MRR ${money(m.mrrAud)}, ${m.activeCustomers} customers` : `Stripe: ${m.activeCustomers} customers, no active subscriptions`,
      value_or_url: JSON.stringify({
        mrr: m.mrrAud,
        customerCount: m.activeCustomers,
        subscriptionCount: m.activeSubscriptions,
        churnRate90dPct: m.churnRate90dPct,
        currency: m.currency,
        connectedAt: now.toISOString(),
        source: "connector_resync",
      }),
      svi_impact: score.points,
    }, now);
    if (m.activeCustomers > 0) {
      const mpcImpact = Math.min(12, Math.max(5, Math.floor(Math.log10(m.activeCustomers + 1) * 5)));
      await upsertEvidence(db, scope.accountId, { evidence_type: "stripe", dimension: "mpc" }, {
        label: `Stripe Customers: ${m.activeCustomers} paying customer${m.activeCustomers === 1 ? "" : "s"}`,
        value_or_url: String(m.activeCustomers),
        svi_impact: mpcImpact,
      }, now);
    }
  }
}

async function applyXero(db: Db, scope: ResolvedScope, m: XeroMetrics, now: Date): Promise<void> {
  const mrr = m.totalIncomeAud > 0 ? Math.round(m.totalIncomeAud / m.windowMonths) : 0;
  if (scope.ownerUserId) {
    await upsertSignals(db, scope.ownerUserId, scope.projectId, "xero", [
      { key: "mrr_aud", numeric: mrr },
      { key: "expenses_3m_aud", numeric: m.totalExpensesAud },
      { key: "bank_balance_aud", numeric: m.bankBalanceAud },
    ], now);
  }
  if (scope.accountId) {
    await upsertEvidence(db, scope.accountId, { evidence_type: "xero_pl", dimension: XERO_PL_EVIDENCE_DIMENSION }, {
      label: "Xero P&L (3 months)",
      value_or_url: JSON.stringify({
        totalIncomeAud: m.totalIncomeAud,
        totalExpensesAud: m.totalExpensesAud,
        netProfitAud: m.netProfitAud,
        bankBalanceAud: m.bankBalanceAud,
        tenantName: m.tenantName,
        connectedAt: now.toISOString(),
        source: "connector_resync",
      }),
      svi_impact: 18,
    }, now);
    if (m.totalIncomeAud > 0) {
      const score = scoreConnectedRevenue({ mrrAud: mrr, capturedAt: now.toISOString(), now });
      await upsertEvidence(db, scope.accountId, { evidence_type: "xero_revenue", dimension: XERO_REVENUE_EVIDENCE_DIMENSION }, {
        label: "Xero Revenue Verified",
        value_or_url: JSON.stringify({
          totalIncomeAud: m.totalIncomeAud,
          incomeDisplay: money(m.totalIncomeAud),
          tenantName: m.tenantName,
          connectedAt: now.toISOString(),
          source: "connector_resync",
        }),
        svi_impact: score.points,
      }, now);
    }
  }
}

async function persistXeroTokens(db: Db, c: ResyncCandidate, pair: { accessToken: string; refreshToken: string | null; expiresAt: string | null }): Promise<void> {
  const patch =
    c.table === "oauth_connections_v2"
      ? { access_token_encrypted: sealToken(pair.accessToken), refresh_token_encrypted: sealToken(pair.refreshToken ?? undefined) ?? c.refreshTokenSealed, expires_at: pair.expiresAt, updated_at: new Date().toISOString() }
      : { access_token: sealToken(pair.accessToken), refresh_token: sealToken(pair.refreshToken ?? undefined) ?? c.refreshTokenSealed };
  await db.from(c.table).update(patch).eq("id", c.id);
}

/**
 * Sync one claimed connection end to end. Never throws; the outcome says
 * what happened. Releases the lease on every path.
 */
export async function resyncConnection(db: Db, c: ResyncCandidate, opts: { now?: Date } = {}): Promise<ResyncSummary> {
  const now = opts.now ?? new Date();
  const base: ResyncSummary = { table: c.table, id: c.id, provider: c.provider, project_id: c.projectId, outcome: "failed" };
  let scope: ResolvedScope = { ownerUserId: null, projectId: c.projectId, accountId: c.accountId, dataEmail: null };
  try {
    scope = await resolveScope(db, c);
    base.project_id = scope.projectId;

    // 1. Open the sealed token — never logged.
    const accessToken = openToken(c.accessTokenSealed);
    const refreshToken = openToken(c.refreshTokenSealed);
    const unreadable =
      (Boolean(c.accessTokenSealed) && accessToken === null) || (Boolean(c.refreshTokenSealed) && refreshToken === null);
    if (unreadable || (!accessToken && !refreshToken)) {
      await notifyReconnect(c, scope);
      await releaseConnection(db, c, now, "token_unreadable");
      return { ...base, outcome: "token_unreadable" };
    }

    if (!scope.ownerUserId && !scope.accountId) {
      await releaseConnection(db, c, now, "scope_unresolved");
      return { ...base, outcome: "skipped_scope", error: "scope_unresolved" };
    }

    // 2. Pull.
    let metrics: StripeConnectMetrics | XeroMetrics;
    if (c.provider === "stripe") {
      if (!accessToken) throw new Error("stripe_no_access_token");
      metrics = await fetchStripeConnectMetrics(accessToken);
    } else {
      if (!refreshToken) {
        await notifyReconnect(c, scope);
        await releaseConnection(db, c, now, "xero_no_refresh_token");
        return { ...base, outcome: "needs_reconnect", error: "xero_no_refresh_token" };
      }
      let pair;
      try {
        pair = await refreshXeroToken(refreshToken);
      } catch (err) {
        if (err instanceof XeroRefreshError && err.status >= 400 && err.status < 500) {
          await notifyReconnect(c, scope);
          await releaseConnection(db, c, now, "xero_refresh_rejected");
          return { ...base, outcome: "needs_reconnect", error: "xero_refresh_rejected" };
        }
        throw err;
      }
      await persistXeroTokens(db, c, pair);
      let tenantId = c.providerAccountId;
      let tenantName = typeof c.metadata.tenantName === "string" ? c.metadata.tenantName : null;
      if (!tenantId) {
        const t = await fetchXeroTenant(pair.accessToken);
        if (!t) throw new Error("xero_no_tenant");
        tenantId = t.tenantId;
        tenantName = t.tenantName;
      }
      metrics = await fetchXeroMetrics(pair.accessToken, tenantId, tenantName);
    }

    // 3. Snapshot + change detection (owner-keyed; skipped when the owner is unknown).
    let changed = true;
    if (scope.ownerUserId) {
      const history = await loadSnapshotHistory(db, { userId: scope.ownerUserId, projectId: scope.projectId, limit: 5 });
      const prev = history[c.provider]?.latest ?? null;
      changed = metricsChanged(c.provider, prev?.metrics ?? null, metrics as unknown as Record<string, unknown>);
      await insertConnectorSnapshot(db, {
        userId: scope.ownerUserId,
        projectId: scope.projectId,
        provider: c.provider,
        metrics,
        source: "resync",
        takenAt: now.toISOString(),
      });
    }

    // 4. Refresh the dated signal / evidence rows.
    if (c.provider === "stripe") await applyStripe(db, scope, metrics as StripeConnectMetrics, now);
    else await applyXero(db, scope, metrics as XeroMetrics, now);

    // 5. Rescore + webhook only when the values moved.
    let delta: number | null = null;
    let queued = 0;
    if (changed && scope.accountId && scope.dataEmail) {
      const { data: acct } = await db.from("svi_accounts").select("current_svi, current_stage").eq("id", scope.accountId).maybeSingle();
      const result = await rescoreAccountFromEvidence(db, {
        accountId: scope.accountId,
        currentSvi: typeof acct?.current_svi === "number" ? acct.current_svi : null,
        dataEmail: scope.dataEmail,
        projectId: scope.projectId,
        ownerUserId: scope.ownerUserId,
        now,
      });
      delta = result.delta;
      const r = await enqueueWebhook(
        "svi.rescored",
        scope.projectId,
        {
          project_id: scope.projectId,
          account_id: scope.accountId,
          svi_total: result.newSVI,
          previous_svi: result.previousSVI,
          delta: result.delta,
          stage: result.stage,
          source: "connector_resync",
          snapshot_date: now.toISOString().split("T")[0],
        },
        scope.ownerUserId ? { userIds: [scope.ownerUserId], now } : { now },
      );
      queued = r.queued;
    }

    await releaseConnection(db, c, now, null);
    return { ...base, outcome: changed ? "synced" : "unchanged", changed, svi_delta: delta, webhooks_queued: queued };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[connector-resync] connection failed", { table: c.table, id: c.id, provider: c.provider, error: message });
    await releaseConnection(db, c, now, message.slice(0, 200)).catch(() => {});
    return { ...base, outcome: "failed", error: message };
  }
}
