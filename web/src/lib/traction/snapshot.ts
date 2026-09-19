// Traction snapshot — G14-S33 (COO + CFO-advisor).
//
// One JSON per day (content/reports/traction-snapshot.json, history in
// traction-history.jsonl) that every investor-facing number is read FROM:
// the admin tile, /api/platform-stats (when fresh), scripts/investor-update.mjs
// and the deck provenance table. Three rules:
//
//   1. QA / seeded / erased accounts are never counted (QA_ACCOUNT_EMAIL_PATTERNS).
//      Every per-user figure filters on the surviving app_users id set so a
//      qa-live-* run or a seeded evaluator can never inflate traction.
//   2. Nothing is invented: a table that is missing (42P01), a column that
//      is missing (42703) or a query that fails yields `null` for that
//      figure plus one `warnings[]` line — never a throw, never a 0 that
//      looks like a measurement.
//   3. MRR is shown two ways so the CFO can reconcile them: the
//      subscription roll-up (active subscription_trial_state × plan monthly
//      price, the v_mrr_active definition re-done in code so QA users can
//      be excluded) and the trailing-30-day `revenue_events` cash; plus an
//      optional Stripe head-count reconciliation (`stripe_reconciled`).
//
// The builder is pure over an injected client so the colocated test drives
// it with fixtures; the cron route wires the service-role client.

import { z } from "zod";
import { EVALUATOR_TRIAL_PLAN_IDS } from "@/lib/plans/signup-plans";
import { emptyCounts as emptyFunnelCounts, funnelCountsSchema, reduceFunnel as reduceFunnelV2, type FunnelEventRow } from "@/lib/funnel/core";

// ─── QA / seeded / erased account exclusion ─────────────────────────────────

/**
 * Emails excluded from every traction figure. Sources:
 *  - `scripts/seed-test-users.mjs` seeds `qa-<segment>-<index>@blockid.au`
 *    (+ `qa-reseller-*`, `qa-founder-attributed-*`) and `--reset` deletes
 *    every `qa-*@blockid.au`;
 *  - `tests/live-qa/lib/env.ts` provisions `qa-live-<stamp>@blockid.au` and
 *    `qa-live-member-<stamp>@blockid.au`;
 *  - `src/lib/privacy/erasure-map.ts` tombstones an erased account as
 *    `deleted+<hash>@erased.blockid.au`.
 * Matching is case-insensitive on the trimmed address.
 */
export const QA_ACCOUNT_EMAIL_PATTERNS: readonly RegExp[] = Object.freeze([
  /^qa-[a-z0-9._+-]*@blockid\.au$/i,
  /^qa-live-[a-z0-9-]+@blockid\.au$/i,
  /^deleted\+[a-z0-9]+@erased\.blockid\.au$/i,
  /@erased\.blockid\.au$/i,
]);

export function isExcludedAccountEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const e = email.trim();
  if (!e) return false;
  return QA_ACCOUNT_EMAIL_PATTERNS.some((re) => re.test(e));
}

// ─── Schema ─────────────────────────────────────────────────────────────────

const nInt = z.number().int().nonnegative().nullable();
const countRecord = z.record(z.string(), z.number().int().nonnegative());

export const tractionSnapshotSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string(),
  git_sha: z.string().nullable(),
  users: z.object({
    total: nInt,
    founders: nInt,
    evaluators_by_plan: countRecord,
    excluded_count: nInt,
  }),
  analyses: z.object({
    svi_analyses: nInt,
    analyses: nInt,
    guest_analyses_paid: nInt,
  }),
  tbr: z.object({
    purchased: nInt,
    shared: nInt,
    views: nInt,
  }),
  evaluators: z.object({
    trials: nInt,
    paying_by_plan: countRecord,
    reports_per_evaluator_p50: z.number().nonnegative().nullable(),
  }),
  assessments: z.object({
    submitted: nInt,
    shared_with_founder: nInt,
  }),
  share_links: nInt,
  api_keys_active: nInt,
  webhooks_active: nInt,
  mrr_aud_cents: z.object({
    from_subscriptions: nInt,
    from_revenue_events: nInt,
    stripe_reconciled: z.boolean().nullable(),
  }),
  funnel_7d: countRecord,
  // G16-A: the real funnel (distinct actors per step, QA rows excluded)
  // from the same reducer as scripts/funnel-report.mjs — one source of truth.
  // `funnel_7d` (top event names) is kept for the older consumers.
  funnel_7d_v2: funnelCountsSchema,
  warnings: z.array(z.string()),
});

export type TractionSnapshot = z.infer<typeof tractionSnapshotSchema>;

/** Every figure null, no warnings — what a zero-DB run starts from. */
export function emptyTractionSnapshot(now: Date = new Date(), gitSha: string | null = null): TractionSnapshot {
  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    git_sha: gitSha,
    users: { total: null, founders: null, evaluators_by_plan: {}, excluded_count: null },
    analyses: { svi_analyses: null, analyses: null, guest_analyses_paid: null },
    tbr: { purchased: null, shared: null, views: null },
    evaluators: { trials: null, paying_by_plan: {}, reports_per_evaluator_p50: null },
    assessments: { submitted: null, shared_with_founder: null },
    share_links: null,
    api_keys_active: null,
    webhooks_active: null,
    mrr_aud_cents: { from_subscriptions: null, from_revenue_events: null, stripe_reconciled: null },
    funnel_7d: {},
    funnel_7d_v2: emptyFunnelCounts(),
    warnings: [],
  };
}

// ─── Pure helpers (unit-pinned) ─────────────────────────────────────────────

export const EVALUATOR_PLAN_IDS: ReadonlySet<string> = new Set<string>(EVALUATOR_TRIAL_PLAN_IDS);

/**
 * `app_users.account_type` values that mark an evaluator seat — mirrors
 * EVALUATOR_ACCOUNT_TYPES in src/lib/evaluations.ts (copied so this module
 * stays free of the email / Supabase imports that file carries).
 */
export const EVALUATOR_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
  "investor",
  "investor_angel",
  "investor_vc",
  "accelerator",
  "incubator",
  "advisor",
  "service_provider",
]);

export interface UserRow {
  id: string;
  email: string | null;
  plan: string | null;
  account_type?: string | null;
  segment?: string | null;
}

export function isEvaluatorRow(u: Pick<UserRow, "plan" | "account_type">): boolean {
  if (u.plan && EVALUATOR_PLAN_IDS.has(u.plan)) return true;
  if (u.account_type && EVALUATOR_ACCOUNT_TYPES.has(u.account_type)) return true;
  return false;
}

/** Split users into counted / excluded and bucket evaluators by plan. */
export function bucketUsers(rows: readonly UserRow[]): {
  kept: UserRow[];
  keptIds: Set<string>;
  excluded_count: number;
  founders: number;
  evaluators_by_plan: Record<string, number>;
} {
  const kept: UserRow[] = [];
  let excluded = 0;
  for (const r of rows) {
    if (isExcludedAccountEmail(r.email)) excluded += 1;
    else kept.push(r);
  }
  const evaluators_by_plan: Record<string, number> = {};
  let founders = 0;
  for (const u of kept) {
    if (isEvaluatorRow(u)) {
      const key = u.plan && u.plan.trim() ? u.plan : "no_plan";
      evaluators_by_plan[key] = (evaluators_by_plan[key] ?? 0) + 1;
    } else {
      founders += 1;
    }
  }
  return { kept, keptIds: new Set(kept.map((u) => u.id)), excluded_count: excluded, founders, evaluators_by_plan };
}

/** Median of a list of numbers (midpoint average on even length). */
export function p50(values: readonly number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface PlanPriceRow {
  id: string;
  price_aud_cents: number | null;
  interval: string | null;
}

export interface SubscriptionRow {
  user_id: string | null;
  plan_id: string | null;
  status: string | null;
}

/**
 * Subscription MRR in cents — the v_mrr_active (migration 0083) definition
 * re-done in code: active rows × monthly-normalised plan price, yearly ÷ 12,
 * free / once / custom plans contribute 0. `keptIds` drops QA accounts.
 */
export function mrrFromSubscriptions(
  subs: readonly SubscriptionRow[],
  plans: readonly PlanPriceRow[],
  keptIds: ReadonlySet<string> | null,
): { cents: number; active: number; paying_by_plan: Record<string, number>; trials: number } {
  const priceByPlan = new Map(plans.map((p) => [p.id, p]));
  let cents = 0;
  let active = 0;
  let trials = 0;
  const paying_by_plan: Record<string, number> = {};
  for (const s of subs) {
    if (keptIds && (!s.user_id || !keptIds.has(s.user_id))) continue;
    const isEvaluatorPlan = !!s.plan_id && EVALUATOR_PLAN_IDS.has(s.plan_id);
    if (s.status === "trialing") {
      if (isEvaluatorPlan) trials += 1;
      continue;
    }
    if (s.status !== "active") continue;
    active += 1;
    if (isEvaluatorPlan && s.plan_id) paying_by_plan[s.plan_id] = (paying_by_plan[s.plan_id] ?? 0) + 1;
    const plan = s.plan_id ? priceByPlan.get(s.plan_id) : undefined;
    const price = Number(plan?.price_aud_cents ?? 0);
    if (!plan || !Number.isFinite(price) || price <= 0) continue;
    if (plan.interval === "monthly") cents += price;
    else if (plan.interval === "yearly") cents += Math.round(price / 12);
  }
  return { cents, active, paying_by_plan, trials };
}

/** event_name → count, top-N by count (ties alphabetical) — the funnel_7d block. */
export function reduceFunnel(rows: ReadonlyArray<{ event_name: string | null }>, top = 25): Record<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = (r.event_name ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
  return Object.fromEntries(sorted);
}

// ─── Client seam ────────────────────────────────────────────────────────────

/** The subset of the supabase-js query builder the builder uses (mockable). */
export interface TractionQueryResult<T = unknown> {
  data: T | null;
  count?: number | null;
  error: { code?: string; message?: string } | null;
}
export interface TractionQuery extends PromiseLike<TractionQueryResult<unknown>> {
  select: (columns: string, opts?: { count?: "exact"; head?: boolean }) => TractionQuery;
  eq: (col: string, v: unknown) => TractionQuery;
  in: (col: string, v: readonly unknown[]) => TractionQuery;
  gte: (col: string, v: unknown) => TractionQuery;
  not: (col: string, op: string, v: unknown) => TractionQuery;
  range: (from: number, to: number) => TractionQuery;
  order: (col: string, opts?: { ascending?: boolean }) => TractionQuery;
}
export interface TractionClient {
  from: (table: string) => TractionQuery;
}

/**
 * Narrow a supabase-js service-role client to the seam. supabase-js's
 * PostgrestQueryBuilder is structurally a superset of TractionQuery (every
 * method used here exists with the same call shape) but its generics do not
 * unify with the plain interface, hence the explicit cast in one place.
 */
export function asTractionClient(client: unknown): TractionClient | null {
  return client && typeof client === "object" && typeof (client as { from?: unknown }).from === "function" ? (client as TractionClient) : null;
}

/** Stripe subset for the head-count reconciliation. */
export interface TractionStripe {
  subscriptions: {
    list: (params: { status: "active"; limit: number }) => Promise<{ data: Array<{ id: string }>; has_more?: boolean }>;
  };
}

export interface BuildTractionSnapshotOptions {
  supabase: TractionClient | null;
  stripe?: TractionStripe | null;
  now?: Date;
  gitSha?: string | null;
  /** Row cap on the paginated scans (users, subscriptions, analytics events). */
  maxRows?: number;
}

const PAGE = 1000;
const DEFAULT_MAX_ROWS = 50_000;

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const code = (e as { code?: string }).code;
    return `${code ? `${code} ` : ""}${(e as { message: string }).message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

// ─── Builder ────────────────────────────────────────────────────────────────

export async function buildTractionSnapshot(opts: BuildTractionSnapshotOptions): Promise<TractionSnapshot> {
  const now = opts.now ?? new Date();
  const snap = emptyTractionSnapshot(now, opts.gitSha ?? null);
  const warnings = snap.warnings;
  const supabase = opts.supabase;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;

  if (!supabase) {
    warnings.push("supabase: not configured — every figure is null");
    return snap;
  }

  /** Run one query; on any failure record a warning and return null. */
  async function safe<T>(label: string, run: () => PromiseLike<TractionQueryResult<unknown>>): Promise<TractionQueryResult<T> | null> {
    try {
      const res = (await run()) as TractionQueryResult<T>;
      if (res.error) {
        warnings.push(`${label}: ${errMessage(res.error)}`);
        return null;
      }
      return res;
    } catch (e) {
      warnings.push(`${label}: ${errMessage(e)}`);
      return null;
    }
  }

  const client: TractionClient = supabase;

  async function count(label: string, build: (q: TractionQuery) => TractionQuery): Promise<number | null> {
    const res = await safe(label, () => build(client.from(label.split(":")[0])));
    if (!res) return null;
    return typeof res.count === "number" ? res.count : null;
  }

  /** Paginated full scan (range windows of PAGE) capped at maxRows. */
  async function scan<T>(label: string, build: (q: TractionQuery) => TractionQuery): Promise<T[] | null> {
    const table = label.split(":")[0];
    const out: T[] = [];
    for (let from = 0; from < maxRows; from += PAGE) {
      const res = await safe<T[]>(label, () => build(client.from(table)).range(from, from + PAGE - 1));
      if (!res) return null;
      const rows = Array.isArray(res.data) ? res.data : [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
    warnings.push(`${label}: scan capped at ${maxRows} rows`);
    return out;
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  // 1) Users — the id set every per-user figure filters on.
  const userRows = await scan<UserRow>("app_users:users", (q) => q.select("id, email, plan, account_type, segment").order("id", { ascending: true }));
  let keptIds: Set<string> | null = null;
  if (userRows) {
    const b = bucketUsers(userRows);
    keptIds = b.keptIds;
    snap.users = { total: b.kept.length, founders: b.founders, evaluators_by_plan: b.evaluators_by_plan, excluded_count: b.excluded_count };
  }

  // 2) Analyses.
  const [svi, analyses, guestPaid] = await Promise.all([
    count("svi_analyses:count", (q) => q.select("id", { count: "exact", head: true })),
    count("analyses:count", (q) => q.select("id", { count: "exact", head: true })),
    count("guest_analyses:paid", (q) => q.select("id", { count: "exact", head: true }).in("status", ["paid", "analyzing", "delivered"])),
  ]);
  snap.analyses = { svi_analyses: svi, analyses, guest_analyses_paid: guestPaid };

  // 3) Trust Business Report: paid orders, minted share tokens, public views.
  const [purchased, shared, views] = await Promise.all([
    count("report_orders:paid", (q) => q.select("id", { count: "exact", head: true }).in("status", ["PAID", "GENERATING", "READY", "SHARED"])),
    count("svi_snapshots:shared", (q) => q.select("id", { count: "exact", head: true }).not("report_share_token", "is", null)),
    count("tbr_views:count", (q) => q.select("id", { count: "exact", head: true })),
  ]);
  snap.tbr = { purchased, shared, views };

  // 4) Subscriptions + plans → evaluator trials / paying / subscription MRR.
  const [subs, plans] = await Promise.all([
    scan<SubscriptionRow>("subscription_trial_state:subs", (q) => q.select("user_id, plan_id, status").order("user_id", { ascending: true })),
    scan<PlanPriceRow>("plans:prices", (q) => q.select("id, price_aud_cents, interval").order("id", { ascending: true })),
  ]);
  if (subs) {
    const m = mrrFromSubscriptions(subs, plans ?? [], keptIds);
    snap.evaluators.trials = m.trials;
    snap.evaluators.paying_by_plan = m.paying_by_plan;
    snap.mrr_aud_cents.from_subscriptions = plans ? m.cents : null;
    if (!plans) warnings.push(`plans:prices: unavailable — subscription MRR is null (active subs counted: ${m.active})`);

    // Stripe head-count reconciliation: does Stripe agree on the number of
    // active subscriptions? null when Stripe is not configured / errors.
    if (opts.stripe) {
      try {
        const list = await opts.stripe.subscriptions.list({ status: "active", limit: 100 });
        const stripeActive = list.data.length;
        if (list.has_more) warnings.push("stripe: >100 active subscriptions — reconciliation compares the first page only");
        // Compare against ALL active rows (QA included) — Stripe does not
        // know which of its customers are QA accounts.
        const allActive = subs.filter((s) => s.status === "active").length;
        snap.mrr_aud_cents.stripe_reconciled = stripeActive === allActive;
        if (stripeActive !== allActive) warnings.push(`stripe: ${stripeActive} active subscriptions vs ${allActive} active subscription_trial_state rows`);
      } catch (e) {
        warnings.push(`stripe: ${errMessage(e)}`);
      }
    }
  }

  // 5) Evaluator report throughput: reports per evaluator (median).
  const reportRows = await scan<{ user_id: string | null }>("evaluation_reports:per_evaluator", (q) => q.select("user_id").order("user_id", { ascending: true }));
  if (reportRows) {
    const per = new Map<string, number>();
    for (const r of reportRows) {
      if (!r.user_id) continue;
      if (keptIds && !keptIds.has(r.user_id)) continue;
      per.set(r.user_id, (per.get(r.user_id) ?? 0) + 1);
    }
    snap.evaluators.reports_per_evaluator_p50 = per.size === 0 ? 0 : p50([...per.values()]);
  }

  // 6) Assessments (table may be empty or absent until G13 S-D2 ships the write side).
  const [submitted, sharedWithFounder] = await Promise.all([
    count("evaluation_assessments:submitted", (q) => q.select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count("evaluation_assessments:shared", (q) => q.select("id", { count: "exact", head: true }).not("shared_with_founder_at", "is", null)),
  ]);
  snap.assessments = { submitted, shared_with_founder: sharedWithFounder };

  // 7) Share links, API keys, webhooks.
  const [shareLinks, apiKeys, webhooks] = await Promise.all([
    count("share_packages:count", (q) => q.select("id", { count: "exact", head: true })),
    count("api_keys:active", (q) => q.select("id", { count: "exact", head: true }).eq("is_active", true)),
    count("webhook_endpoints:active", (q) => q.select("id", { count: "exact", head: true }).eq("active", true)),
  ]);
  snap.share_links = shareLinks;
  snap.api_keys_active = apiKeys;
  snap.webhooks_active = webhooks;

  // 8) Revenue-events MRR proxy: trailing-30-day subscribe + renewal cash (net).
  const rev = await safe<Array<{ net_aud_cents: number | null; user_id?: string | null }>>("revenue_events:30d", () =>
    client.from("revenue_events").select("net_aud_cents, user_id").in("kind", ["subscribe", "renewal"]).gte("ts", thirtyDaysAgo),
  );
  if (rev) {
    let cents = 0;
    for (const r of rev.data ?? []) {
      if (keptIds && r.user_id && !keptIds.has(r.user_id)) continue;
      const n = Number(r.net_aud_cents ?? 0);
      if (Number.isFinite(n)) cents += n;
    }
    snap.mrr_aud_cents.from_revenue_events = Math.max(0, Math.round(cents));
  }

  // 9) Funnel: analytics_events last 7 days — top event names (funnel_7d) and,
  //    G16-A, the step funnel through the shared reducer (funnel_7d_v2).
  const events = await scan<FunnelEventRow>("analytics_events:7d", (q) =>
    q.select("event_id, event_name, user_id, session_id, params, ts").gte("ts", sevenDaysAgo).order("ts", { ascending: false }),
  );
  if (events) {
    const kept = events.filter((e) => !(keptIds && e.user_id && !keptIds.has(e.user_id)));
    snap.funnel_7d = reduceFunnel(kept);
    snap.funnel_7d_v2 = reduceFunnelV2(kept);
  }

  return tractionSnapshotSchema.parse(snap);
}
