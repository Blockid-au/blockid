import "server-only";

export interface Ga4Signals {
  sessions30d: number;
  newUsers30d: number;
  conversions30d: number;
  averageSessionDurationSec: number;
}

interface RunReportResponse {
  rows?: Array<{
    metricValues: Array<{ value?: string }>;
  }>;
}

export async function fetchGa4Signals(
  accessToken: string,
  propertyId: string,
): Promise<Ga4Signals> {
  const trimmed = propertyId.replace(/^properties\//, "");
  const body = {
    dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    metrics: [
      { name: "sessions" },
      { name: "newUsers" },
      { name: "conversions" },
      { name: "averageSessionDuration" },
    ],
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${trimmed}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as RunReportResponse;
  const values = json.rows?.[0]?.metricValues ?? [];
  const num = (i: number): number => Number(values[i]?.value ?? 0) || 0;

  return {
    sessions30d: Math.round(num(0)),
    newUsers30d: Math.round(num(1)),
    conversions30d: Math.round(num(2)),
    averageSessionDurationSec: Math.round(num(3)),
  };
}

// ─── S-R5: richer 90-day pull → ga4_signal_snapshots + AARRR funnel ─────────
//
// Two runReport calls against the same property: (1) totals split by
// newVsReturning (sessions, users, engaged sessions, engagement rate, key
// events, avg session duration) and (2) sessions by default channel group
// for the channel mix. `keyEvents` is GA4's current name for conversions;
// the request falls back to `conversions` on a 400 for older properties.
// Everything is read from the LAST sync (the report pipeline never calls
// the API — it reads the latest `ga4_signal_snapshots` row).

export interface Ga4Channel {
  channel: string;
  sessions: number;
  /** 0–1 share of sessions in the window. */
  share: number;
}

export interface Ga4AarrrFunnel {
  acquisition: number;
  activation: number;
  retention: number;
  revenue: number;
  /** Not observable from GA4 alone — null keeps the chart honest. */
  referral: number | null;
}

export interface Ga4RichSignals {
  windowDays: number;
  sessions: number;
  newUsers: number;
  returningUsers: number;
  /** 0–1 share of users who returned in the window. */
  returningShare: number;
  conversions: number;
  /** 0–1 conversions ÷ sessions. */
  conversionRate: number;
  engagedSessions: number;
  /** 0–1. */
  engagementRate: number;
  avgSessionDurationSec: number;
  topChannels: Ga4Channel[];
  funnel: Ga4AarrrFunnel;
}

interface RunReportRows {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
}

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";

async function runReport(accessToken: string, propertyId: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<RunReportRows> {
  const res = await fetchImpl(`${GA4_DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as RunReportRows;
}

const n = (v: string | undefined): number => Number(v ?? 0) || 0;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Pure: assemble the AARRR funnel from the totals (acquisition ⊇ activation ⊇ retention ⊇ revenue as counts). */
export function buildAarrrFunnel(t: Pick<Ga4RichSignals, "sessions" | "engagedSessions" | "returningUsers" | "conversions">): Ga4AarrrFunnel {
  return {
    acquisition: Math.round(t.sessions),
    activation: Math.round(Math.min(t.engagedSessions, t.sessions)),
    retention: Math.round(t.returningUsers),
    revenue: Math.round(t.conversions),
    referral: null,
  };
}

/** Pure: shape the two report answers into Ga4RichSignals (exported for the fixture test). */
export function shapeRichSignals(totals: RunReportRows, channels: RunReportRows, windowDays: number): Ga4RichSignals {
  let sessions = 0;
  let newUsers = 0;
  let returningUsers = 0;
  let engaged = 0;
  let conversions = 0;
  let durationWeighted = 0;
  for (const row of totals.rows ?? []) {
    const bucket = (row.dimensionValues?.[0]?.value ?? "").toLowerCase();
    const m = row.metricValues ?? [];
    const s = n(m[0]?.value);
    const users = n(m[1]?.value);
    sessions += s;
    engaged += n(m[2]?.value);
    conversions += n(m[3]?.value);
    durationWeighted += n(m[4]?.value) * s;
    if (bucket === "new") newUsers += users;
    else if (bucket === "returning") returningUsers += users;
  }
  const users = newUsers + returningUsers;
  const ch = (channels.rows ?? [])
    .map((row) => ({ channel: row.dimensionValues?.[0]?.value ?? "(other)", sessions: n(row.metricValues?.[0]?.value) }))
    .filter((c) => c.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
  const chTotal = ch.reduce((a, c) => a + c.sessions, 0) || sessions || 1;
  const out: Ga4RichSignals = {
    windowDays,
    sessions: Math.round(sessions),
    newUsers: Math.round(newUsers),
    returningUsers: Math.round(returningUsers),
    returningShare: users > 0 ? r3(returningUsers / users) : 0,
    conversions: Math.round(conversions),
    conversionRate: sessions > 0 ? r3(conversions / sessions) : 0,
    engagedSessions: Math.round(engaged),
    engagementRate: sessions > 0 ? r3(engaged / sessions) : 0,
    avgSessionDurationSec: sessions > 0 ? Math.round(durationWeighted / sessions) : 0,
    topChannels: ch.slice(0, 3).map((c) => ({ channel: c.channel, sessions: Math.round(c.sessions), share: r3(c.sessions / chTotal) })),
    funnel: { acquisition: 0, activation: 0, retention: 0, revenue: 0, referral: null },
  };
  out.funnel = buildAarrrFunnel(out);
  return out;
}

export async function fetchGa4RichSignals(
  accessToken: string,
  propertyId: string,
  opts: { windowDays?: number; fetchImpl?: typeof fetch } = {},
): Promise<Ga4RichSignals> {
  const trimmed = propertyId.replace(/^properties\//, "");
  const windowDays = opts.windowDays ?? 90;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dateRanges = [{ startDate: `${windowDays}daysAgo`, endDate: "today" }];
  const metrics = (conv: "keyEvents" | "conversions") => [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagedSessions" }, { name: conv }, { name: "averageSessionDuration" }];
  let totals: RunReportRows;
  try {
    totals = await runReport(accessToken, trimmed, { dateRanges, dimensions: [{ name: "newVsReturning" }], metrics: metrics("keyEvents") }, fetchImpl);
  } catch (err) {
    if ((err as { status?: number }).status !== 400) throw err;
    totals = await runReport(accessToken, trimmed, { dateRanges, dimensions: [{ name: "newVsReturning" }], metrics: metrics("conversions") }, fetchImpl);
  }
  const channels = await runReport(accessToken, trimmed, { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 10 }, fetchImpl);
  return shapeRichSignals(totals, channels, windowDays);
}

// ─── Snapshot persistence (ga4_signal_snapshots, migration 0402) ─────────────

export const GA4_SNAPSHOTS_TABLE = "ga4_signal_snapshots";

export interface Ga4SnapshotRow {
  user_id: string;
  project_id: string | null;
  property_id: string | null;
  taken_at: string;
  window_days: number;
  sessions: number;
  new_users: number;
  returning_users: number;
  returning_share: number;
  conversions: number;
  conversion_rate: number;
  engaged_sessions: number;
  engagement_rate: number;
  avg_session_duration_s: number;
  top_channels: Ga4Channel[];
  funnel: Ga4AarrrFunnel;
  source: "callback" | "sync" | "resync";
}

export function ga4SnapshotRow(args: { userId: string; projectId: string | null; propertyId: string | null; signals: Ga4RichSignals; source: Ga4SnapshotRow["source"]; takenAt?: Date }): Ga4SnapshotRow {
  const s = args.signals;
  return {
    user_id: args.userId,
    project_id: args.projectId,
    property_id: args.propertyId,
    taken_at: (args.takenAt ?? new Date()).toISOString(),
    window_days: s.windowDays,
    sessions: s.sessions,
    new_users: s.newUsers,
    returning_users: s.returningUsers,
    returning_share: s.returningShare,
    conversions: s.conversions,
    conversion_rate: s.conversionRate,
    engaged_sessions: s.engagedSessions,
    engagement_rate: s.engagementRate,
    avg_session_duration_s: s.avgSessionDurationSec,
    top_channels: s.topChannels,
    funnel: s.funnel,
    source: args.source,
  };
}

export function ga4SignalsFromSnapshotRow(r: Partial<Ga4SnapshotRow>): Ga4RichSignals & { takenAt: string | null } {
  const base = {
    windowDays: Number(r.window_days ?? 90),
    sessions: Number(r.sessions ?? 0),
    newUsers: Number(r.new_users ?? 0),
    returningUsers: Number(r.returning_users ?? 0),
    returningShare: Number(r.returning_share ?? 0),
    conversions: Number(r.conversions ?? 0),
    conversionRate: Number(r.conversion_rate ?? 0),
    engagedSessions: Number(r.engaged_sessions ?? 0),
    engagementRate: Number(r.engagement_rate ?? 0),
    avgSessionDurationSec: Number(r.avg_session_duration_s ?? 0),
    topChannels: Array.isArray(r.top_channels) ? r.top_channels : [],
  };
  const funnel = r.funnel && typeof r.funnel === "object" && "acquisition" in r.funnel ? (r.funnel as Ga4AarrrFunnel) : buildAarrrFunnel(base);
  return { ...base, funnel, takenAt: r.taken_at ?? null };
}

export interface Ga4SnapshotDb {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
    upsert(row: Record<string, unknown>, opts: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
    select(cols: string): {
      eq(col: string, v: string): {
        eq(col: string, v: string): { order(col: string, o: { ascending: boolean }): { limit(n: number): { maybeSingle(): PromiseLike<{ data: unknown | null; error: { message: string } | null }> } } };
        is(col: string, v: null): { order(col: string, o: { ascending: boolean }): { limit(n: number): { maybeSingle(): PromiseLike<{ data: unknown | null; error: { message: string } | null }> } } };
      };
    };
  };
}

/**
 * Best-effort write (a missing table — 0402 not applied — is a warn, never a
 * failed sync). One row per (user, project, property, day): `taken_day` is the
 * upsert key, so repeated sync clicks refresh today's row instead of appending
 * (W5 review).
 */
export async function writeGa4Snapshot(db: Ga4SnapshotDb, row: Ga4SnapshotRow): Promise<boolean> {
  try {
    const dayRow = { ...row, taken_day: row.taken_at.slice(0, 10) } as unknown as Record<string, unknown>;
    const { error } = await db.from(GA4_SNAPSHOTS_TABLE).upsert(dayRow, { onConflict: "user_id,project_id,property_id,taken_day" });
    if (error) {
      console.warn("[ga4-signals] snapshot insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[ga4-signals] snapshot insert threw:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Latest snapshot for (owner, project) — null when none / table missing. */
export async function loadLatestGa4Snapshot(db: Ga4SnapshotDb, userId: string, projectId: string | null): Promise<(Ga4RichSignals & { takenAt: string | null }) | null> {
  try {
    const base = db.from(GA4_SNAPSHOTS_TABLE).select("*").eq("user_id", userId);
    const scoped = projectId ? base.eq("project_id", projectId) : base.is("project_id", null);
    const { data, error } = await scoped.order("taken_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return ga4SignalsFromSnapshotRow(data as Partial<Ga4SnapshotRow>);
  } catch {
    return null;
  }
}

export interface Ga4Property {
  propertyId: string;
  displayName: string;
  parent: string;
}

interface AccountSummary {
  account?: string;
  displayName?: string;
  propertySummaries?: Array<{
    property?: string;
    displayName?: string;
    parent?: string;
  }>;
}

interface AccountSummariesResponse {
  accountSummaries?: AccountSummary[];
}

export async function listGa4Properties(
  accessToken: string,
): Promise<Ga4Property[]> {
  const res = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as AccountSummariesResponse;
  const out: Ga4Property[] = [];
  for (const acct of json.accountSummaries ?? []) {
    for (const p of acct.propertySummaries ?? []) {
      const raw = p.property ?? "";
      const propertyId = raw.replace(/^properties\//, "");
      if (!propertyId) continue;
      out.push({
        propertyId,
        displayName: p.displayName ?? propertyId,
        parent: acct.displayName ?? "",
      });
    }
  }
  return out;
}
