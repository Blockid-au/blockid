import "server-only";
import { createHash } from "node:crypto";
import { ConnectorHttpError } from "./http-error";

/** A deliberately narrow observation, NOT legal-entity attestation or accepted valuation evidence. */
export const STRIPE_RECURRING_METHOD = "stripe-native-aud-fixed-recurring-v1";
export const STRIPE_SOURCE_API_VERSION = "2025-04-30.basil";
export class StripeRecurringSourceError extends Error {
  constructor(public readonly code: "invalid_binding" | "malformed_source" | "unsupported_contract" | "incomplete_source" | "source_unavailable") {
    super(code); this.name = "StripeRecurringSourceError";
  }
}
type Row = Record<string, unknown>;
function reject(code: StripeRecurringSourceError["code"]): never { throw new StripeRecurringSourceError(code); }
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject("malformed_source");
  return value as Row;
}
function id(value: unknown, prefix: string): string {
  if (typeof value !== "string" || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) reject("malformed_source");
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) reject("unsupported_contract");
  return value;
}
function empty(value: unknown) { if (!Array.isArray(value) || value.length) reject("unsupported_contract"); }
function noDiscounts(value: unknown) { if (value !== null) empty(value); }
function absent(value: unknown) { if (value !== null && value !== undefined) reject("unsupported_contract"); }
function gcd(a: bigint, b: bigint): bigint { while (b) { const r = a % b; a = b; b = r; } return a; }
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

export interface StripeRecurringObservation {
  method: typeof STRIPE_RECURRING_METHOD;
  sourceAccountId: string;
  currency: "AUD";
  metric: "fixed_recurring_contract_monthly_run_rate";
  mrrAud: number;
  activeSubscriptions: number;
  activeSubscriptionCustomers: number;
  itemCount: number;
  complete: true;
  eligibleForValuation: false;
  observationStartedAt: string;
  capturedAt: string;
  consistency: "paginated_observation_not_atomic";
  apiVersion: typeof STRIPE_SOURCE_API_VERSION;
  requests: number;
  sourceDigest: string;
  pages: Array<{ path: string; sha256: string }>;
}

/**
 * Server-only collector. Missing, partial, unsupported or upstream errors throw:
 * no partial sums, guessed FX, defaults for absent amount/quantity, or error-to-zero.
 * Supports only active, live, AUD fixed licensed month/year contracts without
 * discounts, trials, taxes, pending changes, schedules, pauses or cancellation.
 * Contract run rate is neither cash receipts nor accounting revenue. Legal entity
 * binding, trusted persistence and a controlled canary remain separate gates.
 */
export async function fetchStripeRecurringSource(
  accessToken: string,
  binding: { sourceAccountId: string; livemode: boolean },
  options: { fetch?: typeof fetch; now?: () => number; maxRequests?: number; maxItems?: number; timeoutMs?: number } = {},
): Promise<StripeRecurringObservation> {
  if (!accessToken || binding.livemode !== true || !/^acct_[A-Za-z0-9]+$/.test(binding.sourceAccountId)) reject("invalid_binding");
  const fetcher = options.fetch ?? fetch, now = options.now ?? Date.now;
  const started = now();
  if (!Number.isFinite(started)) reject("invalid_binding");
  const maxRequests = options.maxRequests ?? 100, maxItems = options.maxItems ?? 10_000, timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(maxRequests) || maxRequests < 2 || maxRequests > 100
    || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 10_000
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) reject("invalid_binding");
  const pages: StripeRecurringObservation["pages"] = [];
  let requests = 0, observations = 0;
  const remaining = () => {
    const elapsed = now() - started;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= timeoutMs) reject("incomplete_source");
    return Math.max(1, Math.min(15_000, Math.floor(timeoutMs - elapsed)));
  };
  async function get(path: string): Promise<Row> {
    if (++requests > maxRequests) reject("incomplete_source");
    const timeout = remaining();
    try {
      const response = await fetcher(`https://api.stripe.com${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Stripe-Version": STRIPE_SOURCE_API_VERSION },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new ConnectorHttpError("stripe", response.status, "recurring_source");
      if (!response.body) reject("malformed_source");
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let text = "", bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2_000_000) { await reader.cancel(); reject("incomplete_source"); }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      remaining();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { reject("malformed_source"); }
      const value = row(parsed);
      pages.push({ path, sha256: digest(text) });
      return value;
    } catch (error) {
      if (error instanceof StripeRecurringSourceError || error instanceof ConnectorHttpError) throw error;
      reject("source_unavailable");
    }
  }
  async function list(path: string, prefix: string): Promise<Row[]> {
    const result: Row[] = [], seen = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      const url = new URL(path, "https://api.stripe.com");
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("starting_after", cursor);
      const page = await get(url.pathname + url.search);
      if (page.object !== "list" || !Array.isArray(page.data) || typeof page.has_more !== "boolean" || page.data.length > 100) reject("malformed_source");
      if (page.has_more && !page.data.length) reject("incomplete_source");
      for (const value of page.data) {
        const item = row(value), key = id(item.id, prefix);
        if (seen.has(key) || ++observations > maxItems) reject("incomplete_source");
        seen.add(key); result.push(item); cursor = key;
      }
      if (!page.has_more) return result;
    }
  }
  const account = await get("/v1/account");
  if (account.object !== "account" || account.id !== binding.sourceAccountId) reject("invalid_binding");
  // Account objects do not prove live mode. Balance does, even for an empty set.
  const balance = await get("/v1/balance");
  if (balance.object !== "balance" || balance.livemode !== true) reject("invalid_binding");
  const subscriptions = await list("/v1/subscriptions?status=active", "sub");
  const customers = new Set<string>(), seenItems = new Set<string>();
  let numerator = 0n, denominator = 1n;
  for (const sub of subscriptions) {
    if (sub.object !== "subscription" || sub.livemode !== true || sub.status !== "active" || sub.currency !== "aud"
      || sub.collection_method !== "charge_automatically" || sub.cancel_at_period_end !== false) reject("unsupported_contract");
    for (const field of ["cancel_at", "canceled_at", "pause_collection", "pending_update", "schedule", "trial_end", "discount", "billing_thresholds"]) absent(sub[field]);
    noDiscounts(sub.discounts); empty(sub.default_tax_rates);
    if (row(sub.automatic_tax).enabled !== false) reject("unsupported_contract");
    const customerId = id(sub.customer, "cus");
    if (!customers.has(customerId)) {
      const customer = await get(`/v1/customers/${customerId}`);
      if (customer.object !== "customer" || customer.id !== customerId || customer.livemode !== true || customer.deleted) reject("invalid_binding");
      // Basil customer-level discounts are separate from subscription discounts.
      if (!("discount" in customer)) reject("malformed_source");
      absent(customer.discount);
      customers.add(customerId);
    }
    // Never trust the embedded, possibly truncated `items.data` list.
    const items = await list(`/v1/subscription_items?subscription=${encodeURIComponent(String(sub.id))}`, "si");
    if (!items.length) reject("malformed_source");
    for (const item of items) {
      const itemId = id(item.id, "si");
      if (item.object !== "subscription_item" || item.subscription !== sub.id || seenItems.has(itemId)) reject("malformed_source");
      seenItems.add(itemId); noDiscounts(item.discounts); empty(item.tax_rates); absent(item.billing_thresholds);
      const price = row(item.price), recurring = row(price.recurring);
      if (price.object !== "price" || price.livemode !== true || price.currency !== "aud" || price.type !== "recurring"
        || price.billing_scheme !== "per_unit" || price.tax_behavior !== "exclusive" || recurring.usage_type !== "licensed") reject("unsupported_contract");
      id(price.id, "price");
      for (const field of ["transform_quantity", "tiers_mode", "custom_unit_amount", "currency_options"]) absent(price[field]);
      const amount = integer(price.unit_amount), quantity = integer(item.quantity), count = integer(recurring.interval_count, 1);
      if (price.unit_amount_decimal != null && (typeof price.unit_amount_decimal !== "string"
        || !/^\d+(?:\.0+)?$/.test(price.unit_amount_decimal) || Number(price.unit_amount_decimal) !== amount)) reject("unsupported_contract");
      if (!["month", "year"].includes(String(recurring.interval))) reject("unsupported_contract");
      const months = count * (recurring.interval === "year" ? 12 : 1);
      if (months > 36) reject("unsupported_contract");
      const d = BigInt(months), n = BigInt(amount) * BigInt(quantity);
      numerator = numerator * d + n * denominator; denominator *= d;
      const divisor = gcd(numerator, denominator); numerator /= divisor; denominator /= divisor;
    }
  }
  // Round once, to AUD cents. Rational arithmetic avoids per-item rounding drift.
  const cents = (2n * numerator + denominator) / (2n * denominator);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) reject("unsupported_contract");
  remaining();
  const capturedAt = new Date(now()).toISOString();
  return {
    method: STRIPE_RECURRING_METHOD, sourceAccountId: binding.sourceAccountId, currency: "AUD",
    metric: "fixed_recurring_contract_monthly_run_rate", mrrAud: Number(cents) / 100,
    activeSubscriptions: subscriptions.length, activeSubscriptionCustomers: customers.size, itemCount: seenItems.size,
    complete: true, eligibleForValuation: false, observationStartedAt: new Date(started).toISOString(), capturedAt,
    consistency: "paginated_observation_not_atomic", apiVersion: STRIPE_SOURCE_API_VERSION, requests,
    sourceDigest: digest(JSON.stringify({ method: STRIPE_RECURRING_METHOD, account: binding.sourceAccountId, pages })), pages,
  };
}
