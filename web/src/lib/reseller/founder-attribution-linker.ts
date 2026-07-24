// Pure decision + adapter for founder-side reseller_attribution rows.
//
// Fired from the checkout.session.completed webhook. Idempotency is enforced
// by the DB UNIQUE(stripe_session_id) constraint that migration 0111 lands;
// the adapter INSERT ... ON CONFLICT DO NOTHING so Stripe event retries
// swallow duplicates instead of throwing.
//
// Zero Stripe/Supabase imports in the pure planner — the adapter dynamic-
// imports @/lib/supabase so callers can unit-test decideResellerAttribution
// as a pure function.

import type Stripe from "stripe";

export const ALLOWED_TIER_PCTS: readonly number[] = [0, 10, 20, 30, 40];

export type ResellerBillingModel = "retail" | "wholesale";

export interface ResellerAttributionResellerRow {
  id: string;
  code: string;
  status: "active" | "paused" | "terminated";
  billing_model: ResellerBillingModel;
}

export interface DecideResellerAttributionCtx {
  resellerRow: ResellerAttributionResellerRow | null;
  projectId: string | null;
  founderId: string | null;
  /** True when a reseller_attribution row already exists for this session_id. */
  alreadyAttributed?: boolean;
}

export interface ResellerAttributionRow {
  reseller_id: string;
  founder_id: string | null;
  startup_id: string | null;
  tier_pct: number;
  stripe_session_id: string;
  stripe_subscription_id: string | null;
  amount_gross_cents: number;
  currency: string;
  commission_cents: number;
  billing_model: ResellerBillingModel;
  attributed_at: string;
  source: "checkout_session_completed";
}

export type DecideResellerAttributionResult =
  | { kind: "insert"; row: ResellerAttributionRow }
  | {
      kind: "skip";
      reason:
        | "no_reseller_metadata"
        | "reseller_not_active"
        | "invalid_tier_pct"
        | "amount_zero"
        | "already_attributed"
        | "unknown_reseller"
        | "missing_session_id";
    };

/**
 * Compute the reseller_attribution row (or skip reason) for a completed
 * checkout session. Never throws.
 *
 * Commission math:
 *   - retail:    amount_gross_cents * tier_pct / 100 (floor)
 *   - wholesale: 0 (accrued off the wholesale invoice — avoids double-count)
 *
 * See docs/plans/mega-2026-07-24/04-cfo-affiliate-stripe.md § "Commission
 * accrual" for the truth table.
 */
export function decideResellerAttribution(
  session: Stripe.Checkout.Session,
  ctx: DecideResellerAttributionCtx,
): DecideResellerAttributionResult {
  const sessionId = typeof session.id === "string" ? session.id : "";
  if (!sessionId) return { kind: "skip", reason: "missing_session_id" };

  const metadata = (session.metadata ?? {}) as Record<string, string | undefined>;
  const metaResellerId = metadata.reseller_id?.trim();
  const metaResellerCode = metadata.reseller_code?.trim();

  if (!metaResellerId && !metaResellerCode) {
    return { kind: "skip", reason: "no_reseller_metadata" };
  }

  if (!ctx.resellerRow) {
    return { kind: "skip", reason: "unknown_reseller" };
  }
  if (ctx.resellerRow.status !== "active") {
    return { kind: "skip", reason: "reseller_not_active" };
  }

  const tierRaw = metadata.tier_at_signup ?? "";
  const tierPct = Number(tierRaw);
  if (!Number.isFinite(tierPct) || !ALLOWED_TIER_PCTS.includes(tierPct)) {
    return { kind: "skip", reason: "invalid_tier_pct" };
  }

  const amountGross =
    typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
      ? session.amount_total
      : 0;
  if (amountGross <= 0) {
    return { kind: "skip", reason: "amount_zero" };
  }

  if (ctx.alreadyAttributed) {
    return { kind: "skip", reason: "already_attributed" };
  }

  const billingModel: ResellerBillingModel = ctx.resellerRow.billing_model;
  const commissionCents =
    billingModel === "retail"
      ? Math.floor((amountGross * tierPct) / 100)
      : 0;

  const currency =
    typeof session.currency === "string" && session.currency.length > 0
      ? session.currency.toUpperCase()
      : "AUD";

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  return {
    kind: "insert",
    row: {
      reseller_id: ctx.resellerRow.id,
      founder_id: ctx.founderId,
      startup_id: ctx.projectId,
      tier_pct: tierPct,
      stripe_session_id: sessionId,
      stripe_subscription_id: subscriptionId,
      amount_gross_cents: amountGross,
      currency,
      commission_cents: commissionCents,
      billing_model: billingModel,
      attributed_at: new Date().toISOString(),
      source: "checkout_session_completed",
    },
  };
}

// -------------------------------------------------------------------------
// Adapter (impure) — INSERT ... ON CONFLICT (stripe_session_id) DO NOTHING
// -------------------------------------------------------------------------

export interface LinkFounderAttributionCtx {
  projectId: string | null;
  founderId: string | null;
  /**
   * Pre-resolved reseller row. When null, the adapter tries to resolve from
   * session.metadata.reseller_id, then session.client_reference_id (via:<code>).
   */
  resellerRow?: ResellerAttributionResellerRow | null;
}

export type LinkFounderAttributionOutcome =
  | {
      ok: true;
      kind: "inserted" | "already_attributed";
      row?: ResellerAttributionRow;
    }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "insert_failed"
        | "skip"
        | "resolve_failed";
      skipReason?: string;
    };

/**
 * Idempotent INSERT for reseller_attribution keyed on stripe_session_id.
 * Mirrors a row into reseller_commissions when kind='insert' &&
 * billing_model='retail'. Never throws — a webhook must not fail on a
 * bookkeeping side-effect (Stripe retry storm).
 */
export async function linkFounderAttribution(
  supabase: unknown,
  session: Stripe.Checkout.Session,
  ctx: LinkFounderAttributionCtx,
): Promise<LinkFounderAttributionOutcome> {
  if (!supabase) return { ok: false, reason: "not_configured" };

  const sb = supabase as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: unknown;
          }>;
        };
      };
      insert: (row: Record<string, unknown>) => Promise<{
        error: { code?: string; message?: string } | null;
      }>;
    };
  };

  // Resolve reseller row when caller did not pre-load one.
  let resellerRow = ctx.resellerRow ?? null;
  const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
  if (!resellerRow) {
    try {
      const resellerId = meta.reseller_id?.trim();
      if (resellerId) {
        const { data } = await sb
          .from("resellers")
          .select("id, code, status, billing_model")
          .eq("id", resellerId)
          .maybeSingle();
        if (data) {
          resellerRow = {
            id: data.id as string,
            code: data.code as string,
            status: data.status as ResellerAttributionResellerRow["status"],
            billing_model:
              (data.billing_model as ResellerBillingModel) ?? "retail",
          };
        }
      }
      // client_reference_id fallback: `via:<code>` per checkout route.
      if (!resellerRow) {
        const clientRef =
          typeof session.client_reference_id === "string"
            ? session.client_reference_id
            : "";
        const viaMatch = /^via:(.+)$/i.exec(clientRef);
        const code = viaMatch?.[1]?.trim().toUpperCase() ?? meta.reseller_code?.trim();
        if (code) {
          const { data: promo } = await sb
            .from("reseller_promotion_codes")
            .select("reseller_id")
            .eq("code", code)
            .maybeSingle();
          const rid = promo?.reseller_id as string | undefined;
          if (rid) {
            const { data } = await sb
              .from("resellers")
              .select("id, code, status, billing_model")
              .eq("id", rid)
              .maybeSingle();
            if (data) {
              resellerRow = {
                id: data.id as string,
                code: data.code as string,
                status: data.status as ResellerAttributionResellerRow["status"],
                billing_model:
                  (data.billing_model as ResellerBillingModel) ?? "retail",
              };
            }
          }
        }
      }
    } catch (err) {
      console.warn("[reseller] linkFounderAttribution resolve_failed", err);
      return { ok: false, reason: "resolve_failed" };
    }
  }

  // Check existing attribution (best-effort — DB UNIQUE is the real guard).
  let alreadyAttributed = false;
  try {
    const { data } = await sb
      .from("reseller_attribution")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();
    alreadyAttributed = Boolean(data);
  } catch {
    // Table may not exist pre-migration 0111 — treat as not-attributed and
    // let the INSERT bounce with an insert_failed reason the caller logs.
  }

  const decision = decideResellerAttribution(session, {
    resellerRow,
    projectId: ctx.projectId,
    founderId: ctx.founderId,
    alreadyAttributed,
  });

  if (decision.kind === "skip") {
    return { ok: false, reason: "skip", skipReason: decision.reason };
  }

  try {
    const { error } = await sb.from("reseller_attribution").insert(decision.row);
    if (error) {
      if (error.code === "23505") {
        return { ok: true, kind: "already_attributed" };
      }
      console.error("[reseller] reseller_attribution insert failed", error);
      return { ok: false, reason: "insert_failed" };
    }
  } catch (err) {
    console.error("[reseller] reseller_attribution insert threw", err);
    return { ok: false, reason: "insert_failed" };
  }

  // Mirror into reseller_commissions for retail only — wholesale commission
  // accrues off the wholesale invoice (see risks: double-count mitigation).
  if (
    decision.row.billing_model === "retail" &&
    decision.row.commission_cents > 0
  ) {
    try {
      await sb.from("reseller_commissions").insert({
        reseller_id: decision.row.reseller_id,
        stripe_session_id: decision.row.stripe_session_id,
        stripe_subscription_id: decision.row.stripe_subscription_id,
        tier_pct: decision.row.tier_pct,
        amount_gross_cents: decision.row.amount_gross_cents,
        commission_cents: decision.row.commission_cents,
        currency: decision.row.currency,
        source: "checkout_session_completed",
      });
    } catch (err) {
      // Non-fatal: attribution row is the source of truth, commission mirror
      // can be back-filled by the CFO reconciler.
      console.warn("[reseller] reseller_commissions mirror failed", err);
    }
  }

  return { ok: true, kind: "inserted", row: decision.row };
}
