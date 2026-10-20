// A1 (pricing v5 §7.4, G35) — nightly public price-feed sync.
//
// Reads the PUBLIC model/price feeds (GET only — never a completion):
//   DeepInfra   https://api.deepinfra.com/v1/openai/models  (USD / 1M in `metadata.pricing`)
//               https://api.deepinfra.com/models/list        (deprecation + promo end; best effort)
//   OpenRouter  https://openrouter.ai/api/v1/models          (USD / token strings)
// compares every feed-checked catalogue row against the single price table
// (model-prices.ts via model-catalog.ts) and writes
//   content/reports/ai-price-feed.json            latest snapshot + comparisons
//   content/reports/ai-price-feed-history.jsonl   one compact line per run
// Ops is alerted at most once per UTC day when a catalogued model's price
// moves by MORE than 5 % or the model disappears from its feed.
//
// Report price policy (report-attempt-budget.ts, founder-pinned): when it
// expires in ≤ 7 days AND every admitted model's feed price still equals the
// pinned integer price, a ready-to-apply renewal proposal (+30 days, with the
// evidence) is written to content/reports/ai-price-policy-renewal.json and the
// alert says so. It is NEVER applied automatically — the founder edits
// REPORT_PRICE_POLICY_EXPIRES_AT and deploys.
//
// Everything is dependency-injected (fetch, clock, paths, sender) so the
// acceptance tests run on mocked fetch + a temp dir. No server-only import:
// scripts/ai/sync-prices.mjs loads this through tsx.

import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { MODEL_CATALOG, catalogPrice, type CatalogModel } from "./model-catalog";
import type { PricePer1M } from "./model-prices";

export const PRICE_DRIFT_ALERT_PCT = 5;
export const RENEWAL_WINDOW_DAYS = 7;
export const RENEWAL_EXTENSION_DAYS = 30;
export const DEEPINFRA_FEED_URL = "https://api.deepinfra.com/v1/openai/models";
export const DEEPINFRA_LIST_URL = "https://api.deepinfra.com/models/list";
export const OPENROUTER_FEED_URL = "https://openrouter.ai/api/v1/models";
const DAY_MS = 86_400_000;
const FETCH_TIMEOUT_MS = 20_000;

export type FeedProvider = "deepinfra" | "openrouter";

export interface FeedRow extends PricePer1M {
  context: number | null;
  /** Promo fraction the provider advertises (0.5 = 50 % off), null when none. */
  discount: number | null;
  discountEndsAt: string | null;
  deprecated: boolean;
  replacedBy: string | null;
}

export interface ProviderFeed {
  provider: FeedProvider;
  url: string;
  ok: boolean;
  error?: string;
  fetchedAt: string;
  totalModels: number;
  /** Feed rows, keyed by model id. The written snapshot keeps catalogued ids only. */
  rows: Record<string, FeedRow>;
}

export type ComparisonStatus = "unchanged" | "drift_minor" | "changed" | "missing" | "feed_error";

export interface PriceComparison {
  provider: FeedProvider;
  id: string;
  admitted: boolean;
  catalog: PricePer1M;
  feed: PricePer1M | null;
  /** Largest relative move of in/out, percent (100 when a zero price became non-zero). */
  changePct: number | null;
  status: ComparisonStatus;
  deprecated?: boolean;
  replacedBy?: string | null;
  discountEndsAt?: string | null;
}

export interface PinnedPolicy {
  id: string;
  expiresAt: string;
  /** Integer micro-USD per 1k tokens (report-attempt-budget.ts). */
  pinned: Readonly<Record<string, Readonly<{ input: number; output: number; context: number }>>>;
}

export interface RenewalEvidence {
  model: string;
  pinned_usd_per_1m: PricePer1M;
  feed_usd_per_1m: PricePer1M | null;
  unchanged: boolean;
  source: string;
  fetched_at: string;
}

export interface RenewalProposal {
  status: "proposed" | "blocked_price_changed" | "blocked_feed_unavailable";
  policy_id: string;
  current_expires_at: string;
  days_left: number;
  proposed_expires_at: string | null;
  generated_at: string;
  auto_applied: false;
  approval: string;
  evidence: RenewalEvidence[];
  apply_steps: string[];
}

// ── Parsing ───────────────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** `GET /v1/openai/models` → rows (USD / 1M already). Rows without a token price are skipped. */
export function parseDeepInfraOpenAIModels(json: unknown): Record<string, FeedRow> {
  const data = (json as { data?: unknown })?.data;
  const out: Record<string, FeedRow> = {};
  if (!Array.isArray(data)) return out;
  for (const m of data as Array<{ id?: unknown; metadata?: { pricing?: Record<string, unknown>; context_length?: unknown; discount?: unknown } | null }>) {
    if (typeof m?.id !== "string") continue;
    const p = m.metadata?.pricing;
    const pin = num(p?.input_tokens), pout = num(p?.output_tokens);
    if (pin === null || pout === null) continue;
    out[m.id] = { in: round6(pin), out: round6(pout), context: num(m.metadata?.context_length), discount: num(m.metadata?.discount), discountEndsAt: null, deprecated: false, replacedBy: null };
  }
  return out;
}

/** `GET /models/list` → deprecation + promo-end metadata (merged onto the openai rows). */
export function parseDeepInfraModelList(json: unknown): Record<string, Pick<FeedRow, "deprecated" | "replacedBy" | "discountEndsAt">> {
  const out: Record<string, Pick<FeedRow, "deprecated" | "replacedBy" | "discountEndsAt">> = {};
  if (!Array.isArray(json)) return out;
  for (const m of json as Array<{ model_name?: unknown; deprecated?: unknown; replaced_by?: unknown; pricing?: { discount_ends_at?: unknown } | null }>) {
    if (typeof m?.model_name !== "string") continue;
    const ends = num(m.pricing?.discount_ends_at);
    out[m.model_name] = {
      deprecated: Boolean(m.deprecated),
      replacedBy: typeof m.replaced_by === "string" ? m.replaced_by : null,
      discountEndsAt: ends !== null ? new Date(ends * 1000).toISOString() : null,
    };
  }
  return out;
}

/** `GET openrouter.ai/api/v1/models` → rows (USD per token strings → USD / 1M). */
export function parseOpenRouterModels(json: unknown): Record<string, FeedRow> {
  const data = (json as { data?: unknown })?.data;
  const out: Record<string, FeedRow> = {};
  if (!Array.isArray(data)) return out;
  for (const m of data as Array<{ id?: unknown; context_length?: unknown; expiration_date?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }>) {
    if (typeof m?.id !== "string") continue;
    const pin = num(m.pricing?.prompt), pout = num(m.pricing?.completion);
    if (pin === null || pout === null || pin < 0 || pout < 0) continue; // -1 = "variable" router pricing
    out[m.id] = { in: round6(pin * 1e6), out: round6(pout * 1e6), context: num(m.context_length), discount: null, discountEndsAt: null, deprecated: typeof m.expiration_date === "string" && m.expiration_date !== "", replacedBy: null };
  }
  return out;
}

// ── Comparison ────────────────────────────────────────────────────────

/** Largest relative change of in/out, percent. A zero price that became non-zero counts as 100 %. */
export function pctChange(from: PricePer1M, to: PricePer1M): number {
  const one = (a: number, b: number) => (a === 0 ? (b === 0 ? 0 : 100) : (Math.abs(b - a) / a) * 100);
  return Math.round(Math.max(one(from.in, to.in), one(from.out, to.out)) * 100) / 100;
}

export function comparePrices(
  feeds: Partial<Record<FeedProvider, ProviderFeed>>,
  catalog: readonly CatalogModel[] = MODEL_CATALOG,
  thresholdPct = PRICE_DRIFT_ALERT_PCT,
): PriceComparison[] {
  const out: PriceComparison[] = [];
  for (const m of catalog) {
    if (m.priceFeed === "manual") continue;
    const provider = m.priceFeed;
    const catalogRow = catalogPrice(m) ?? { in: 0, out: 0 };
    const feed = feeds[provider];
    const base = { provider, id: m.id, admitted: m.admitted, catalog: catalogRow };
    if (!feed || !feed.ok) { out.push({ ...base, feed: null, changePct: null, status: "feed_error" }); continue; }
    const row = feed.rows[m.id];
    if (!row) { out.push({ ...base, feed: null, changePct: null, status: "missing" }); continue; }
    const pct = pctChange(catalogRow, row);
    out.push({
      ...base,
      feed: { in: row.in, out: row.out },
      changePct: pct,
      status: pct > thresholdPct ? "changed" : pct > 0 ? "drift_minor" : "unchanged",
      ...(row.deprecated ? { deprecated: true, replacedBy: row.replacedBy } : {}),
      ...(row.discountEndsAt ? { discountEndsAt: row.discountEndsAt } : {}),
    });
  }
  return out;
}

/** Comparisons that warrant the daily ops alert: a > threshold move, a vanished model, or a deprecation. */
export function alertableComparisons(rows: readonly PriceComparison[]): PriceComparison[] {
  return rows.filter((c) => c.status === "changed" || c.status === "missing" || c.deprecated === true);
}

// ── Report price-policy renewal (proposal only) ───────────────────────

function utcMidnightIso(ms: number): string {
  const d = new Date(ms);
  return `${d.toISOString().slice(0, 10)}T00:00:00Z`;
}

export function buildRenewalProposal(policy: PinnedPolicy, deepinfra: ProviderFeed | undefined, now: number): RenewalProposal | null {
  const expires = Date.parse(policy.expiresAt);
  const daysLeft = Number.isFinite(expires) ? (expires - now) / DAY_MS : Number.NEGATIVE_INFINITY;
  if (daysLeft > RENEWAL_WINDOW_DAYS) return null;
  const fetchedAt = deepinfra?.fetchedAt ?? new Date(now).toISOString();
  const evidence: RenewalEvidence[] = Object.entries(policy.pinned).map(([model, p]) => {
    const row = deepinfra?.ok ? deepinfra.rows[model] : undefined;
    const feed = row ? { in: row.in, out: row.out } : null;
    return {
      model,
      pinned_usd_per_1m: { in: p.input / 1000, out: p.output / 1000 },
      feed_usd_per_1m: feed,
      unchanged: feed !== null && Math.round(feed.in * 1000) === p.input && Math.round(feed.out * 1000) === p.output,
      source: `https://deepinfra.com/${model}`,
      fetched_at: fetchedAt,
    };
  });
  const status: RenewalProposal["status"] = !deepinfra?.ok || evidence.some((e) => e.feed_usd_per_1m === null)
    ? "blocked_feed_unavailable"
    : evidence.every((e) => e.unchanged) ? "proposed" : "blocked_price_changed";
  const proposed = status === "proposed" ? utcMidnightIso(Math.max(Number.isFinite(expires) ? expires : now, now) + RENEWAL_EXTENSION_DAYS * DAY_MS) : null;
  return {
    status,
    policy_id: policy.id,
    current_expires_at: policy.expiresAt,
    days_left: Math.round(daysLeft * 10) / 10,
    proposed_expires_at: proposed,
    generated_at: new Date(now).toISOString(),
    auto_applied: false,
    approval: "Founder approval required — the report price policy is founder-pinned and is never applied automatically.",
    evidence,
    apply_steps: status === "proposed"
      ? [
          `Founder approves this proposal (admitted DeepInfra prices unchanged vs the pinned table).`,
          `Set REPORT_PRICE_POLICY_EXPIRES_AT = "${proposed}" in web/src/lib/ai/report-attempt-budget.ts; keep REPORT_PRICE_POLICY = "${policy.id}" unchanged (in-flight ledgers pin it).`,
          `Note the re-observation date in the comment above it, run the report-attempt-budget tests, commit and deploy (bash web/scripts/deploy-auto.sh).`,
        ]
      : status === "blocked_price_changed"
        ? [`An admitted model's live price differs from the pinned table — do NOT extend. Re-price the policy (new id + table) with founder approval.`]
        : [`The DeepInfra feed did not list every admitted model — verify the prices on the official model pages by hand before extending.`],
  };
}

// ── Runner ────────────────────────────────────────────────────────────

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PriceSyncPaths {
  feed: string;
  history: string;
  renewal: string;
  /** Once-per-UTC-day alert marker. */
  alertState: string;
}

export interface PriceSyncDeps {
  policy: PinnedPolicy;
  paths: PriceSyncPaths;
  send: (text: string) => Promise<boolean>;
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Only used when the public DeepInfra feed refuses an anonymous GET. Never logged. */
  deepinfraApiKey?: string;
  catalog?: readonly CatalogModel[];
  thresholdPct?: number;
}

export interface PriceSyncResult {
  generatedAt: string;
  feeds: Record<FeedProvider, { ok: boolean; error?: string; totalModels: number }>;
  comparisons: PriceComparison[];
  alertable: PriceComparison[];
  renewal: RenewalProposal | null;
  alerted: boolean;
  alertSkippedReason?: "nothing_to_report" | "already_alerted_today";
}

async function getJson(fetchImpl: FetchLike, url: string, headers: Record<string, string> = {}): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: "GET", headers: { accept: "application/json", ...headers }, signal: ctrl.signal });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchDeepInfraFeed(fetchImpl: FetchLike, now: number, apiKey?: string): Promise<ProviderFeed> {
  const fetchedAt = new Date(now).toISOString();
  try {
    let r = await getJson(fetchImpl, DEEPINFRA_FEED_URL);
    if ((r.status === 401 || r.status === 403) && apiKey) r = await getJson(fetchImpl, DEEPINFRA_FEED_URL, { authorization: `Bearer ${apiKey}` });
    if (r.status !== 200) return { provider: "deepinfra", url: DEEPINFRA_FEED_URL, ok: false, error: `HTTP ${r.status}`, fetchedAt, totalModels: 0, rows: {} };
    const rows = parseDeepInfraOpenAIModels(r.json);
    if (Object.keys(rows).length === 0) return { provider: "deepinfra", url: DEEPINFRA_FEED_URL, ok: false, error: "no priced models in feed", fetchedAt, totalModels: 0, rows: {} };
    try {
      const list = await getJson(fetchImpl, DEEPINFRA_LIST_URL);
      if (list.status === 200) {
        const meta = parseDeepInfraModelList(list.json);
        for (const [id, row] of Object.entries(rows)) if (meta[id]) Object.assign(row, meta[id]);
      }
    } catch { /* enrichment is best effort */ }
    return { provider: "deepinfra", url: DEEPINFRA_FEED_URL, ok: true, fetchedAt, totalModels: Object.keys(rows).length, rows };
  } catch (err) {
    return { provider: "deepinfra", url: DEEPINFRA_FEED_URL, ok: false, error: errText(err), fetchedAt, totalModels: 0, rows: {} };
  }
}

export async function fetchOpenRouterFeed(fetchImpl: FetchLike, now: number): Promise<ProviderFeed> {
  const fetchedAt = new Date(now).toISOString();
  try {
    const r = await getJson(fetchImpl, OPENROUTER_FEED_URL);
    if (r.status !== 200) return { provider: "openrouter", url: OPENROUTER_FEED_URL, ok: false, error: `HTTP ${r.status}`, fetchedAt, totalModels: 0, rows: {} };
    const rows = parseOpenRouterModels(r.json);
    if (Object.keys(rows).length === 0) return { provider: "openrouter", url: OPENROUTER_FEED_URL, ok: false, error: "no priced models in feed", fetchedAt, totalModels: 0, rows: {} };
    return { provider: "openrouter", url: OPENROUTER_FEED_URL, ok: true, fetchedAt, totalModels: Object.keys(rows).length, rows };
  } catch (err) {
    return { provider: "openrouter", url: OPENROUTER_FEED_URL, ok: false, error: errText(err), fetchedAt, totalModels: 0, rows: {} };
  }
}

function errText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return /abort/i.test(msg) ? `timeout after ${FETCH_TIMEOUT_MS}ms` : msg.slice(0, 160);
}

async function atomicWrite(file: string, body: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, body);
  await rename(tmp, file);
}

/** Keep only catalogued ids in the written snapshot (the raw feeds are ~1 MB). */
function trimFeed(feed: ProviderFeed, ids: Set<string>): ProviderFeed {
  return { ...feed, rows: Object.fromEntries(Object.entries(feed.rows).filter(([id]) => ids.has(id))) };
}

export function formatPriceAlert(alertable: readonly PriceComparison[], feeds: Record<FeedProvider, ProviderFeed>, renewal: RenewalProposal | null, renewalPath: string, day: string): string | null {
  const lines: string[] = [];
  for (const c of alertable) {
    const tag = c.admitted ? " [REPORT-ADMITTED]" : "";
    if (c.status === "missing") lines.push(`• ${c.provider}/${c.id}${tag}: no longer in the public feed`);
    else if (c.status === "changed") lines.push(`• ${c.provider}/${c.id}${tag}: ${c.catalog.in}/${c.catalog.out} → ${c.feed!.in}/${c.feed!.out} USD per 1M (${c.changePct}%)`);
    if (c.deprecated) lines.push(`• ${c.provider}/${c.id}${tag}: marked deprecated${c.replacedBy ? ` (replaced by ${c.replacedBy})` : ""}`);
  }
  for (const f of Object.values(feeds)) if (!f.ok) lines.push(`• ${f.provider} price feed unavailable (${f.error ?? "error"}) — prices not verified today`);
  if (renewal) {
    if (renewal.status === "proposed") lines.push(`Report price policy expires in ${renewal.days_left} day(s); admitted prices unchanged → renewal proposal to ${renewal.proposed_expires_at} written to ${renewalPath} (founder approval required, not applied).`);
    else if (renewal.status === "blocked_price_changed") lines.push(`Report price policy expires in ${renewal.days_left} day(s) and an admitted price CHANGED — no renewal proposed; re-price with founder approval.`);
    else lines.push(`Report price policy expires in ${renewal.days_left} day(s); the feed did not confirm every admitted price — verify by hand before extending.`);
  }
  if (lines.length === 0) return null;
  return [`AI price sync ${day} — threshold ${PRICE_DRIFT_ALERT_PCT}%`, ...lines, "Catalogue: web/src/lib/ai/model-catalog.ts · prices: web/src/lib/ai/model-prices.ts"].join("\n");
}

export async function runPriceSync(deps: PriceSyncDeps): Promise<PriceSyncResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = (deps.now ?? Date.now)();
  const catalog = deps.catalog ?? MODEL_CATALOG;
  const [deepinfra, openrouter] = await Promise.all([
    fetchDeepInfraFeed(fetchImpl, now, deps.deepinfraApiKey),
    fetchOpenRouterFeed(fetchImpl, now),
  ]);
  const feeds: Record<FeedProvider, ProviderFeed> = { deepinfra, openrouter };
  const comparisons = comparePrices(feeds, catalog, deps.thresholdPct ?? PRICE_DRIFT_ALERT_PCT);
  const alertable = alertableComparisons(comparisons);
  const renewal = buildRenewalProposal(deps.policy, deepinfra, now);
  const generatedAt = new Date(now).toISOString();
  const day = generatedAt.slice(0, 10);

  const ids = new Set(catalog.map((m) => m.id));
  const summary = {
    checked: comparisons.length,
    unchanged: comparisons.filter((c) => c.status === "unchanged").length,
    drift_minor: comparisons.filter((c) => c.status === "drift_minor").length,
    changed: comparisons.filter((c) => c.status === "changed").length,
    missing: comparisons.filter((c) => c.status === "missing").length,
    feed_errors: comparisons.filter((c) => c.status === "feed_error").length,
  };
  await atomicWrite(deps.paths.feed, JSON.stringify({
    generated_at: generatedAt,
    threshold_pct: deps.thresholdPct ?? PRICE_DRIFT_ALERT_PCT,
    feeds: { deepinfra: trimFeed(deepinfra, ids), openrouter: trimFeed(openrouter, ids) },
    comparisons,
    summary,
    policy: { id: deps.policy.id, expires_at: deps.policy.expiresAt, renewal_status: renewal?.status ?? null, renewal_file: renewal ? deps.paths.renewal : null },
  }, null, 2));
  await mkdir(dirname(deps.paths.history), { recursive: true });
  await appendFile(deps.paths.history, JSON.stringify({
    ts: generatedAt,
    feeds: { deepinfra: { ok: deepinfra.ok, total: deepinfra.totalModels }, openrouter: { ok: openrouter.ok, total: openrouter.totalModels } },
    summary,
    changed: comparisons.filter((c) => c.status === "changed" || c.status === "drift_minor").map((c) => ({ provider: c.provider, id: c.id, from: c.catalog, to: c.feed, pct: c.changePct })),
    missing: comparisons.filter((c) => c.status === "missing").map((c) => `${c.provider}/${c.id}`),
    renewal: renewal?.status ?? null,
  }) + "\n");
  if (renewal) await atomicWrite(deps.paths.renewal, JSON.stringify(renewal, null, 2));

  const text = formatPriceAlert(alertable, feeds, renewal, deps.paths.renewal, day);
  const result: PriceSyncResult = {
    generatedAt,
    feeds: {
      deepinfra: { ok: deepinfra.ok, ...(deepinfra.error ? { error: deepinfra.error } : {}), totalModels: deepinfra.totalModels },
      openrouter: { ok: openrouter.ok, ...(openrouter.error ? { error: openrouter.error } : {}), totalModels: openrouter.totalModels },
    },
    comparisons,
    alertable,
    renewal,
    alerted: false,
  };
  if (!text) return { ...result, alertSkippedReason: "nothing_to_report" };
  try {
    const prior = JSON.parse(await readFile(deps.paths.alertState, "utf8")) as { day?: unknown };
    if (prior.day === day) return { ...result, alertSkippedReason: "already_alerted_today" };
  } catch { /* no marker yet */ }
  // Record the day BEFORE sending: a crash after a send must not double-alert.
  try { await atomicWrite(deps.paths.alertState, JSON.stringify({ day, at: generatedAt })); } catch { /* still alert */ }
  let alerted = false;
  try { alerted = await deps.send(text); } catch { alerted = false; }
  return { ...result, alerted };
}
