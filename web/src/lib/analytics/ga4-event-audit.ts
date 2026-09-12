// GA4 weekly event audit (S23-B) — Data API side.
//
// Confirms the events shipped in G11/G12 + the hero one-liner test
// (GA4_AUDIT_EVENTS) are actually arriving in the property: one
// `runReport` over the last 7 days grouped by `eventName`, filtered to the
// expected list, then a second report on `hero_variant_shown` ×
// `customEvent:arm` to learn whether the hero dimension is registered (a
// 400 "is not a valid dimension" means it is not — no Admin API needed, so
// the audit still works while analyticsadmin is disabled).
//
// Persisted to content/reports/ga4-event-audit.json; /api/status reduces it
// to `ga4_events: ok | missing:<list> | blocked | unknown` via
// readGa4EventAuditStatus(). Access failures never throw — they become
// `blocked` with the operator steps (Data API variant).
//
// Scope: analytics.readonly — the Data API rejects analytics.edit tokens.

import { promises as fs } from "node:fs";
import path from "node:path";
import { GA4_AUDIT_EVENTS, HERO_VARIANT_DIMENSION, classifyGa4Error, type Ga4Blocked } from "./ga4-dimensions";
import { GA4_SCOPE_READONLY, ga4PropertyId, ga4PropertyPath, ga4ServiceAccount, type Ga4Env } from "./ga4-credentials";

export const GA4_EVENT_AUDIT_FILE = path.join("content", "reports", "ga4-event-audit.json");
/** A weekly run is stale after 8 days (Mon 04:30 UTC + a day of slack). */
export const GA4_EVENT_AUDIT_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export type Ga4EventAuditState = "ok" | "missing" | "blocked" | "unknown";

export interface Ga4EventAuditReport {
  ts: string;
  ok: boolean;
  status: Ga4EventAuditState;
  property: string | null;
  range: { start: string; end: string; days: number };
  expected: string[];
  /** eventName → eventCount over the range (expected events only). */
  seen: Record<string, number>;
  missing: string[];
  /** Total distinct event names GA4 returned (sanity: 0 means the tag is dead). */
  total_event_names: number;
  hero_variant: {
    parameter: string;
    registered: boolean | null;
    /** arm → count of hero_variant_shown, when registered. */
    arms: Record<string, number>;
  };
  blocked: Ga4Blocked | null;
  error: string | null;
  dry: boolean;
  duration_ms: number;
}

// ── Data API client seam ────────────────────────────────────────────────

export interface Ga4DataRow {
  dimensionValues?: Array<{ value?: string | null }>;
  metricValues?: Array<{ value?: string | null }>;
}

export interface Ga4DataClient {
  properties: {
    runReport: (args: { property: string; requestBody: Record<string, unknown> }) => Promise<{ data: { rows?: Ga4DataRow[] } }>;
  };
}

async function buildDataClient(env: Ga4Env): Promise<Ga4DataClient> {
  const sa = ga4ServiceAccount(env);
  if (!sa) throw new Error("service account not configured");
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: [GA4_SCOPE_READONLY] });
  return google.analyticsdata({ version: "v1beta", auth }) as unknown as Ga4DataClient;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface RunEventAuditOptions {
  env?: Ga4Env;
  client?: Ga4DataClient;
  days?: number;
  now?: Date;
  expected?: readonly string[];
  dry?: boolean;
}

export async function runGa4EventAudit(opts: RunEventAuditOptions = {}): Promise<Ga4EventAuditReport> {
  const started = Date.now();
  const env = opts.env ?? (process.env as Ga4Env);
  const now = opts.now ?? new Date();
  const days = opts.days ?? 7;
  const expected = [...(opts.expected ?? GA4_AUDIT_EVENTS)];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const property = ga4PropertyPath(env);
  const sa = ga4ServiceAccount(env);
  const stepOpts = { serviceAccountEmail: sa?.client_email ?? null, propertyId: ga4PropertyId(env), api: "data" as const };

  const report: Ga4EventAuditReport = {
    ts: now.toISOString(),
    ok: false,
    status: "unknown",
    property,
    range: { start: isoDay(start), end: isoDay(end), days },
    expected,
    seen: {},
    missing: [...expected],
    total_event_names: 0,
    hero_variant: { parameter: HERO_VARIANT_DIMENSION.parameterName, registered: null, arms: {} },
    blocked: null,
    error: null,
    dry: opts.dry ?? false,
    duration_ms: 0,
  };
  const finish = (r: Ga4EventAuditReport): Ga4EventAuditReport => ({ ...r, duration_ms: Date.now() - started });

  if (!property || (!sa && !opts.client)) {
    const what = !property ? "GA4_PROPERTY_ID" : "GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY";
    return finish({
      ...report,
      status: "blocked",
      blocked: { reason: "not_configured", steps: [], message: `${what} not set` },
    });
  }

  let client: Ga4DataClient;
  try {
    client = opts.client ?? (await buildDataClient(env));
  } catch (e) {
    return finish({ ...report, error: e instanceof Error ? e.message : String(e) });
  }

  const dateRanges = [{ startDate: report.range.start, endDate: report.range.end }];

  // 1) Event counts, filtered to the expected names.
  try {
    const res = await client.properties.runReport({
      property,
      requestBody: {
        dateRanges,
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: expected } } },
        limit: "200",
      },
    });
    const seen: Record<string, number> = {};
    for (const row of res.data.rows ?? []) {
      const name = row.dimensionValues?.[0]?.value ?? "";
      const count = Number(row.metricValues?.[0]?.value ?? 0);
      if (name && expected.includes(name)) seen[name] = (seen[name] ?? 0) + (Number.isFinite(count) ? count : 0);
    }
    report.seen = seen;
    report.missing = expected.filter((e) => !(seen[e] > 0));
  } catch (e) {
    const blocked = classifyGa4Error(e, stepOpts);
    if (blocked) return finish({ ...report, status: "blocked", blocked });
    return finish({ ...report, error: e instanceof Error ? e.message : String(e) });
  }

  // 2) How many distinct event names at all (0 = tag not firing).
  try {
    const res = await client.properties.runReport({
      property,
      requestBody: { dateRanges, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], limit: "500" },
    });
    report.total_event_names = (res.data.rows ?? []).length;
  } catch {
    /* informational only */
  }

  // 3) Hero dimension: registered ⇔ customEvent:arm is a valid dimension.
  try {
    const res = await client.properties.runReport({
      property,
      requestBody: {
        dateRanges,
        dimensions: [{ name: "eventName" }, { name: `customEvent:${HERO_VARIANT_DIMENSION.parameterName}` }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "hero_variant_shown" } } },
        limit: "50",
      },
    });
    report.hero_variant.registered = true;
    const arms: Record<string, number> = {};
    for (const row of res.data.rows ?? []) {
      const arm = row.dimensionValues?.[1]?.value ?? "(not set)";
      arms[arm] = (arms[arm] ?? 0) + Number(row.metricValues?.[0]?.value ?? 0);
    }
    report.hero_variant.arms = arms;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not a valid dimension/i.test(msg)) report.hero_variant.registered = false;
    else report.hero_variant.registered = null;
  }

  const status: Ga4EventAuditState = report.missing.length === 0 ? "ok" : "missing";
  return finish({ ...report, ok: status === "ok", status });
}

// ── Persistence + /api/status reduction ─────────────────────────────────

/** Persist the report. Never throws. */
export async function persistGa4EventAudit(report: Ga4EventAuditReport, root: string = process.cwd()): Promise<boolean> {
  try {
    const file = path.join(root, GA4_EVENT_AUDIT_FILE);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
    return true;
  } catch (err) {
    console.error("[blockid:ga4] event-audit write failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** The last persisted report, or null. Never throws. */
export async function readGa4EventAudit(root: string = process.cwd()): Promise<Partial<Ga4EventAuditReport> | null> {
  try {
    const raw = await fs.readFile(path.join(root, GA4_EVENT_AUDIT_FILE), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<Ga4EventAuditReport>) : null;
  } catch {
    return null;
  }
}

/** Reduce a report to the /api/status string: `ok | missing:<a,b> | blocked | unknown`. Pure. */
export function ga4EventStatusString(report: Partial<Ga4EventAuditReport> | null, now: number = Date.now()): string {
  if (!report) return "unknown";
  const t = report.ts ? new Date(report.ts).getTime() : Number.NaN;
  if (!Number.isFinite(t) || now - t > GA4_EVENT_AUDIT_MAX_AGE_MS) return "unknown";
  if (report.status === "blocked" || report.blocked) return "blocked";
  if (report.status === "ok") return "ok";
  if (report.status === "missing") return `missing:${(report.missing ?? []).join(",")}`;
  return "unknown";
}

export async function readGa4EventAuditStatus(root: string = process.cwd(), now: number = Date.now()): Promise<string> {
  return ga4EventStatusString(await readGa4EventAudit(root), now);
}
