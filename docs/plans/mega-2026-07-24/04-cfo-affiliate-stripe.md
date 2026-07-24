# CFO — Affiliate 5-Tier Verification + Stripe Sync + Founder→Reseller Linkage

Owner: CFO agent. Date: 2026-07-24. Sibling to 01/02/03 in this mega-plan.

## 1. Problem statement

Three checkpoints must hold true at all times for the affiliate/reseller
programme to be financially trustworthy:

1. **Tier integrity** — the five allowed tiers `[0, 10, 20, 30, 40]` (see
   `web/src/lib/reseller/promotion-code-mint.ts:17` and
   `web/src/lib/reseller/tier-mix.ts:20`) each map to a Stripe coupon whose
   `percent_off` matches the tier and whose id follows the canonical scheme
   `res_tier_<pct>` (global fallback) or `res_<uuidPrefix>_t<pct>` (per-reseller,
   already in place via `buildStripeCouponSpec`).
2. **Code ↔ login mapping** — every active `reseller_promotion_codes.code` row
   in Supabase is joinable to a `resellers` row (`reseller_id`) that has a
   login-capable owner (`app_users.email`).  A code without a live owner is a
   dead code — attribution accrues, commission never pays.
3. **Founder → reseller linkage** — when a founder pays with a reseller code,
   an atomic row lands in `reseller_attribution` capturing
   `(reseller_id, founder_id, startup_id, tier_pct, session_id, amount_gross,
    commission)`.  Missing rows here are the single biggest source of
   commission disputes.

Today, (1) is enforced only at mint time (per-reseller coupon spec) and drifts
silently if an ops admin edits a coupon in the Stripe dashboard.  (3) partially
exists — session metadata carries `reseller_id` / `reseller_code` (checkout
route lines 269-277) — but the webhook handler for
`checkout.session.completed` (`web/src/app/api/stripe/webhook/route.ts:60`) does
NOT yet write to `reseller_attribution`.

## 2. Design

### 2.1 Canonical global tier coupons

In addition to per-reseller coupons (`res_<uuidPrefix>_t<pct>`) we introduce a
per-tier canonical coupon with id `res_tier_<pct>` for pct ∈ {10, 20, 30, 40}
(tier 0 is attribution-only — no Stripe object).  This is the source-of-truth
coupon used by the reconciler and by manual admin flows that want a
tier discount without picking a specific reseller (e.g. programme-wide
seasonal push).  Per-reseller coupons continue to be minted for individual
promotion codes so commission accrual can be joined via
`coupon.metadata.reseller_id`.

### 2.2 Reconciler algorithm (`tier-coupon-reconciler.ts`)

Pure function `planTierCouponReconciliation(existing, tiers)` returns a
typed list of actions:

- `noop`      — coupon exists with matching `percent_off` and `duration=forever`.
- `create`    — coupon id missing on Stripe → mint with canonical spec.
- `repair`    — coupon exists but `percent_off` diverges → REPAIR IS
  NEVER DESTRUCTIVE.  We do NOT delete the drifting coupon (Stripe forbids
  editing `percent_off`; deletion could orphan live subscriptions).  Instead
  we (a) rename it to `res_tier_<pct>_legacy_<yyyymmdd>` by updating its
  `metadata.canonical=false`, and (b) create a fresh canonical id
  `res_tier_<pct>_v<n>` where n increments the version counter kept in
  `reseller_stripe_state` (new single-row table, migration 0111).  The
  reconciler logs a `blocker_requires_admin_confirmation` audit row and
  returns `repair` with `requires_confirmation=true` — the fixer script
  refuses to act without `--confirm-drift`.
- `metadata_patch` — coupon exists, `percent_off` matches, but metadata is
  stale (e.g. missing `source=reseller_module_p9.3`).  Patch in place.

The reconciler NEVER calls `coupons.delete` — that is the load-bearing safety
rail called out in `risks`.

Wrapper `reconcileTierCoupons(stripe, opts)` is added to `stripe-billing.ts`
(the only impure adapter allowed to import the Stripe SDK) — it lists
`coupons.list({limit:100})`, filters by `metadata.source==="reseller_module_p9.3"`
plus `id`-prefix `res_tier_`, calls the pure planner, and applies actions.

### 2.3 Checkout route metadata guarantee

`/api/stripe/checkout/route.ts` already stamps `reseller_id`, `reseller_code`,
`tier_at_signup`, `reseller_display_name` and `reseller_id_hash` onto session
metadata (lines 269-277) whenever `resellerAttribution` resolves.  The
follow-up change is defensive:

- promote the metadata block into a helper `buildSessionResellerMetadata(a)`
  used by both `sessionParams.metadata` and `subscription_data.metadata` so
  the two never drift.
- explicitly require `metadata.reseller_id` + `metadata.reseller_code` (raw)
  on the Stripe session under the D3-CISO-07 phase-1 compat window; add a
  test that asserts both fields land in `sessionParams.metadata` whenever a
  reseller code is provided.
- guard: if `resellerCode` normalised is present but `resellerAttribution`
  resolution failed (unknown code / inactive reseller), we log the miss via
  `logUserAction({action:"reseller.code.miss"})` — currently silent.

### 2.4 Founder-attribution linker (webhook handler)

New pure module `founder-attribution-linker.ts` exposes:

```
decideResellerAttribution(session, project)
  → { kind: "insert", row } | { kind: "skip", reason }
```

Called from `checkout.session.completed` (webhook route line 60), after the
existing `app_users.plan` update.  Inputs are the Stripe session object and
the resolved `project_id` (workspace) for that founder.  Row shape:

```
reseller_attribution {
  reseller_id           uuid  NOT NULL
  founder_id            uuid  NOT NULL  -- app_users.id
  startup_id            uuid  NULL      -- projects.id (may lag)
  tier_pct              int   NOT NULL  -- one of 0/10/20/30/40
  stripe_session_id     text  NOT NULL  UNIQUE  -- idempotency key
  stripe_subscription_id text NULL
  amount_gross_cents    int   NOT NULL  -- session.amount_total
  currency              text  NOT NULL
  commission_cents      int   NOT NULL  -- amount_gross * (tier_pct/100) — retail only
  billing_model         text  NOT NULL  -- retail | wholesale (from reseller row)
  attributed_at         timestamptz NOT NULL DEFAULT now()
  source                text  NOT NULL DEFAULT 'checkout.session.completed'
}
```

`stripe_session_id UNIQUE` gives us idempotency-under-retry: Stripe replays
the same event id → the INSERT ON CONFLICT DO NOTHING short-circuits.

`skip` reasons: `no_reseller_metadata`, `reseller_not_active`,
`invalid_tier_pct`, `already_attributed` (session_id present), or
`amount_zero` (free/trial with zero payment — the trialing subscription's
first paid invoice will drive a later `invoice.paid` event that we'll wire in
a follow-up tick).

### 2.5 Verify-tier-sync script

`scripts/reseller/verify-tier-sync.mjs` — one-shot Node script the CFO can
run against prod (SUPABASE_SERVICE_ROLE_KEY + STRIPE_SECRET_KEY env).  Emits
a table:

```
tier  stripe_coupon_id     stripe_percent_off  db_active_codes  status
0     (attribution-only)   —                   14               OK
10    res_tier_10          10                  22               OK
20    res_tier_20          20                  9                OK
30    res_tier_30          30                  3                DRIFT: percent_off=25
40    res_tier_40          40                  1                MISSING
```

Exit code `0` if all OK, `1` if any drift/miss.  Cron already-scheduled
`cron-health.jsonl` writer will pick this up via
`node scripts/reseller/verify-tier-sync.mjs --emit-cron-health`.

### 2.6 Admin surface

`/admin/reseller-loop` (already existing shell) grows a "Founder → reseller
graph" tile powered by a new SQL view `v_reseller_attribution_graph` (grouped
by `(reseller_code, tier_pct)` → founder count + gross MRR).

## 3. Tests

- `tier-coupon-reconciler.test.ts` — table-driven cases for `noop`, `create`,
  `repair` (must set `requires_confirmation=true` and NOT emit delete),
  `metadata_patch`.  Verifies pure planner against a mock Stripe fixture.
- `founder-attribution-linker.test.ts` — asserts
  `no_reseller_metadata` → skip; a full metadata block → `insert` with
  correct commission math for tiers 10/20/30/40; `retail` vs `wholesale`
  commission_cents formula; idempotency skip (`already_attributed`).
- Checkout route existing tests extended: metadata assertion for
  `reseller_id` + `reseller_code`.

## 4. Rollout

1. Ship pure modules + tests (no runtime change).
2. Wire `reconcileTierCoupons` behind cron
   `/api/cron/reseller-stripe-sync` (already exists — extend, don't add).
3. Land migration 0111 (`reseller_attribution` UNIQUE constraint on
   `stripe_session_id`, `reseller_stripe_state` state table).
4. Enable webhook linker under feature flag `RESELLER_ATTRIBUTION_LINKER=1`.
5. Backfill: run `verify-tier-sync.mjs --backfill-attribution` over
   `checkout_sessions` from the last 90 days.

## 5. Risks + mitigations

- **Divergent coupons already on Stripe.**  Reconciler defaults to
  non-destructive `repair` requiring `--confirm-drift`; never calls
  `coupons.delete`.
- **Legacy sessions without metadata.reseller_id.**  Linker falls back to
  `client_reference_id` (already set to `via:<code>` in checkout route line
  261) and re-derives `reseller_id` from `reseller_promotion_codes.code`.
- **Wholesale double-count.**  `billing_model` column on
  `reseller_attribution` lets commission accrual filter wholesale rows out
  of the retail commission ledger.
- **Trial subscriptions with amount_total=0.**  `amount_zero` skip today +
  follow-up `invoice.paid` handler tomorrow.
