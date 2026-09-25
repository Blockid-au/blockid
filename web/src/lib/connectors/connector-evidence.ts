// G21 P3-C — connector → EvidenceRecord.
//
// Every connector sync / snapshot (weekly resync, the founder's "Sync now",
// the OAuth callback's first pull, an ABR lookup) turns its metrics into
// `ConnectorEvidenceRow`s — one per claim key the source can speak for, at
// the ladder level lib/connectors/evidence-value.ts assigns — and pushes
// them through the claims sync (lib/evidence/claims.ts `connectorRows`).
// The sync mints the claim when nothing stated it, records the proof with
// `observed_at` = snapshot time and `expires_at` = +DEFAULT_TTL_DAYS.connector
// (90 d, retired by api/cron/evidence-expiry), supersedes the older proof
// from the same connector for the same claim, audits every new record, and
// re-grades the claim (a Stripe figure that disagrees with the founder's is
// `conflicting`, never averaged).
//
//   connectorEvidenceRows(input, observedAt)   pure — metrics → rows
//   connectorPayloadUri(provider, payload, at)  pure — the source_uri that
//                                              changes with the payload
//   emitConnectorEvidence(args)                 fail-soft DB hook the write
//                                              paths call; never throws,
//                                              never logs a token or a payload
//
// Nothing here reaches L6: a connector reads what the source of record
// exposes; only a named reviewer verifies (score-governance § 4, § 13).

import type { StripeConnectMetrics, StripeSignals } from "@/lib/oauth-stripe-signals";
import type { XeroMetrics } from "@/lib/connectors/xero-metrics";
import type { GithubSignals } from "@/lib/oauth-github-signals";
import type { Ga4Signals } from "@/lib/oauth-ga4-signals";
import { syncClaimsForProject, type AuditFn, type SyncClaimsSummary } from "@/lib/evidence/claims";
import { defaultClaimsDb, type ClaimsDb } from "@/lib/evidence/claims-db";
import { emitEvidenceVerified } from "@/lib/analytics/fi-events";
import { canonicalJson, sha256 } from "@/lib/evidence/records";
import type { ConnectorEvidenceRow, EvidenceLevel, NormalizedValue } from "@/lib/evidence/types";
import { connectorEvidenceValue, type EvidenceConnectorId } from "./evidence-value";

/** What the ABR adapter returns, reduced to what the register proves. */
export interface AbrEvidenceMetrics {
  abn: string;
  entityName: string | null;
  status: "Active" | "Cancelled";
  entityType?: string | null;
  gstRegistered?: boolean | null;
}

export type ConnectorMetricsInput =
  | { provider: "stripe"; metrics: Partial<StripeConnectMetrics> & Partial<StripeSignals> }
  | { provider: "xero"; metrics: XeroMetrics }
  | { provider: "github"; metrics: GithubSignals }
  | { provider: "ga4"; metrics: Ga4Signals }
  | { provider: "abr"; metrics: AbrEvidenceMetrics };

export type EvidenceEmittingConnector = ConnectorMetricsInput["provider"];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function numberValue(value: number, unit?: string): NormalizedValue {
  return unit ? { kind: "number", value, unit } : { kind: "number", value };
}

/** `connector://<provider>/<day>/<payload hash>` — a new payload on the same day is a new proof; the same payload is not. */
export function connectorPayloadUri(provider: EvidenceConnectorId, payload: unknown, observedAt: string): string {
  const day = observedAt.slice(0, 10);
  return `connector://${provider}/${day}/${sha256(canonicalJson(payload)).slice(0, 16)}`;
}

/** The registry level for a claim key on a connector — L5 only where the registry says transaction data, else L4. */
function levelFor(provider: EvidenceConnectorId, claimKey: string): EvidenceLevel {
  const reg = connectorEvidenceValue(provider);
  if (!reg) return "L4_connected_source";
  if (reg.level !== "L5_transaction_data") return reg.level === "L6_third_party_verified" ? "L4_connected_source" : reg.level;
  // Xero: the booked P&L is transaction data; cash at bank and a derived runway are a connected read.
  if (provider === "xero" && claimKey.startsWith("capital.")) return "L4_connected_source";
  return "L5_transaction_data";
}

/**
 * Pure: a connector's metrics → the claim observations it can back. Rows
 * only for figures the source actually returned (a missing bank report is
 * no runway claim); a zero is a measurement and is emitted.
 */
export function connectorEvidenceRows(input: ConnectorMetricsInput, observedAt: string | Date = new Date()): ConnectorEvidenceRow[] {
  const at = typeof observedAt === "string" ? observedAt : observedAt.toISOString();
  const reg = connectorEvidenceValue(input.provider);
  const name = reg?.name ?? input.provider;
  const uri = connectorPayloadUri(input.provider, input.metrics, at);
  const rows: ConnectorEvidenceRow[] = [];
  const push = (claim_key: string, value: NormalizedValue | null, statement?: string | null) => {
    rows.push({ provider: input.provider, source_name: name, claim_key, value, evidence_type: levelFor(input.provider, claim_key), observed_at: at, source_uri: uri, ...(statement ? { statement } : {}) });
  };

  switch (input.provider) {
    case "stripe": {
      const m = input.metrics;
      if (m.sourceObservation) break;
      const mrr = num(m.mrrAud);
      const arr = num(m.arrAud);
      const customers = num(m.activeCustomers);
      const churn = num(m.churnRate90dPct);
      if (mrr !== null && mrr > 0) {
        push("traction.has_revenue", { kind: "boolean", value: true });
        push("traction.mrr_aud", numberValue(Math.round(mrr), "AUD"));
      }
      if (arr !== null && arr > 0) push("traction.arr_aud", numberValue(Math.round(arr), "AUD"));
      if (customers !== null) {
        push("traction.paying_customers", numberValue(Math.round(customers)));
        if (customers > 0) push("market.has_customers", { kind: "boolean", value: true });
      }
      if (churn !== null) push("traction.churn_90d_pct", numberValue(Math.round(churn * 10) / 10, "%"));
      break;
    }
    case "xero": {
      const m = input.metrics;
      const months = num(m.windowMonths) && m.windowMonths > 0 ? m.windowMonths : 3;
      const income = num(m.totalIncomeAud);
      if (income !== null && income > 0) {
        push("traction.has_revenue", { kind: "boolean", value: true });
        push("traction.mrr_aud", numberValue(Math.round(income / months), "AUD"));
      }
      const bank = num(m.bankBalanceAud);
      if (bank !== null) push("capital.bank_balance_aud", numberValue(Math.round(bank), "AUD"));
      const expenses = num(m.totalExpensesAud);
      if (bank !== null && expenses !== null && expenses > 0) {
        const burn = expenses / months;
        push("capital.runway_months", numberValue(Math.round((bank / burn) * 10) / 10));
      }
      break;
    }
    case "github": {
      const m = input.metrics;
      const commits = num(m.recentCommits30d);
      if (commits !== null) push("ftv.shipping_cadence", numberValue(Math.round(commits)));
      if (m.primaryRepoName) push("product.has_source_code", { kind: "boolean", value: true }, `Source code is kept in a repository (${m.primaryRepoName})`);
      break;
    }
    case "ga4": {
      const m = input.metrics;
      const sessions = num(m.sessions30d);
      const conversions = num(m.conversions30d);
      if (sessions !== null) {
        push("traction.monthly_sessions", numberValue(Math.round(sessions)));
        if (sessions > 0) push("traction.has_analytics", { kind: "boolean", value: true });
      }
      if (conversions !== null) push("traction.monthly_conversions", numberValue(Math.round(conversions)));
      break;
    }
    case "abr": {
      const m = input.metrics;
      const active = m.status === "Active";
      const who = m.entityName ? `${m.entityName} (ABN ${m.abn})` : `ABN ${m.abn}`;
      push(
        "lco.registered",
        { kind: "boolean", value: active },
        active ? `${who} is registered and active on the Australian Business Register` : `${who} is cancelled on the Australian Business Register`,
      );
      if (active) push("legal.has_abn", { kind: "boolean", value: true }, `${who} holds an active ABN`);
      break;
    }
  }
  return rows;
}

export interface EmitConnectorEvidenceArgs {
  projectId: string | null | undefined;
  input: ConnectorMetricsInput;
  /** Snapshot time; defaults to now. */
  observedAt?: string | Date;
  /** `evidence_records.submitted_by` — the user who pressed Sync / linked the source; null for the cron. */
  actorUserId?: string | null;
  /** Injected for tests / the resync worker (which already holds a client); `undefined` → the default admin db. */
  db?: ClaimsDb | null;
  audit?: AuditFn | null;
}

/**
 * The hook every connector write path calls after its own signal /
 * snapshot writes. Fail-soft: a missing 0417 table, a DB error or a
 * project-less (legacy account-keyed) connection returns null and never
 * blocks the sync that just succeeded. Logs the provider and the error
 * message only.
 */
export async function emitConnectorEvidence(args: EmitConnectorEvidenceArgs): Promise<SyncClaimsSummary | null> {
  if (!args.projectId) return null;
  const at = args.observedAt ?? new Date();
  const rows = connectorEvidenceRows(args.input, at);
  if (rows.length === 0) return null;
  try {
    const db = args.db === undefined ? await defaultClaimsDb() : args.db;
    return await syncClaimsForProject(args.projectId, { signals: null }, {
      db,
      audit: args.audit,
      connectorRows: rows,
      actorUserId: args.actorUserId ?? null,
      now: typeof at === "string" ? new Date(at) : at,
    });
  } catch (err) {
    console.warn("[blockid:connector-evidence] sync skipped", { provider: args.input.provider, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export interface EmitAbrEvidenceArgs extends Omit<EmitConnectorEvidenceArgs, "input"> {
  abr: AbrEvidenceMetrics;
  /** The startup owner — the FI "organisation" on the analytics envelope. */
  ownerUserId: string | null;
  email?: string | null;
  plan?: string | null;
}

/**
 * ABR lookup → registration records (L4) + the `evidence_verified`
 * analytics event for the active-ABN record (G21 P3-C: "evidence_verified
 * from connectors"). The event carries the record id and its ladder level,
 * never the ABN. Fail-soft like the emitter.
 */
export async function emitAbrEvidence(args: EmitAbrEvidenceArgs): Promise<SyncClaimsSummary | null> {
  const db = args.db === undefined ? await defaultClaimsDb() : args.db;
  const summary = await emitConnectorEvidence({ ...args, db, input: { provider: "abr", metrics: args.abr } });
  if (!summary || !db || !args.projectId || args.abr.status !== "Active") return summary;
  try {
    const records = await db.listRecords(args.projectId, { dimension: "lco" });
    const rec = records.find((r) => r.status === "active" && r.source_type === "abr" && (r.source_name ?? "").endsWith("(abr:lco.registered)"));
    if (rec) {
      emitEvidenceVerified({
        ownerUserId: args.ownerUserId,
        actorUserId: args.actorUserId ?? null,
        email: args.email ?? null,
        plan: args.plan ?? null,
        projectId: args.projectId,
        channel: "connector",
        evidenceId: rec.id,
        level: rec.evidence_type,
        dimension: "lco",
        evidenceType: "abr",
      });
    }
  } catch (err) {
    console.warn("[blockid:connector-evidence] abr analytics skipped", { error: err instanceof Error ? err.message : String(err) });
  }
  return summary;
}
