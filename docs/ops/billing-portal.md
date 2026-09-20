# Stripe Billing Portal + self-serve cancel (G18-D, 2026-09-19)

Founder direction 2026-09-19: *"cho phép cancel subscription trên giao diện"*
(let a subscriber cancel from the UI) and *"check với Stripe"* for the 7-day
trial. This runbook covers what the portal configuration enables, why plan
changes stay out of it, how to inspect it, and what the in-app cancel does
per subscription state.

## What was broken

* The Stripe account had **zero** Billing Portal configurations
  (`GET /v1/billing_portal/configurations` → `[]`). Stripe only mints the
  default one when someone saves the Customer Portal page in the Dashboard,
  so `billing_portal/sessions.create` failed in live mode with
  *"default configuration has not been created"* and the **Manage Billing**
  button on `/workspace/billing` returned a 500 to every real customer.
* `POST /api/stripe/cancel` listed only `status=active` subscriptions, so the
  trial banner's "Cancel Trial" silently 404'd for every trialing user.
* `/workspace/billing` offered no cancel at all — only the (broken) portal
  and a "Downgrade" confirm that redirected to the same portal.
* `customer.subscription.updated` re-mirrored `plan_id` from
  `STRIPE_PRICE_MAP` only; the v2 ladder rows are billed through
  `plans.stripe_price_id`, so every update event set
  `subscription_trial_state.plan_id = NULL` and the trial banner lost its
  plan name and price.

## Portal configuration — self-provisioned

`web/src/lib/billing/portal-config.ts` → `ensurePortalConfiguration(stripe)`:

1. `GET /v1/billing_portal/configurations?active=true&limit=10`.
2. If any exist: use Stripe's `is_default` one (else the first). **Never
   creates** when one exists — an operator may have tuned it in the
   Dashboard.
3. If none exist: create exactly one (concurrent cold-start callers share
   one in-flight promise).
4. Cache the id in **module memory only**. A cold start re-lists. Nothing is
   written to `content/` or the release dir.

`POST /api/stripe/portal` passes `configuration: <id>` explicitly on every
session. A list/create failure answers **503
`portal_configuration_unavailable`** with a customer-readable `message`
(never a bare 500); the page shows it and the in-app cancel still works.

### Features the configuration enables

| Feature | Setting | Why |
| --- | --- | --- |
| `subscription_cancel` | enabled, `mode: at_period_end`, `proration_behavior: none`, reasons collected: `too_expensive, missing_features, switched_service, unused, other` | Mirrors the in-app rule: access until period end, no refund (`/legal/terms#refunds`). The reason lands on the Stripe subscription's `cancellation_details`. |
| `payment_method_update` | enabled | Dunning path — a failed card can be replaced without support. |
| `invoice_history` | enabled | ATO tax invoices / receipts. |
| `customer_update` | enabled: `email, address, name` | Keeps the tax invoice correct. |
| `subscription_update` | **disabled** | See below. |
| `business_profile` | headline "BlockID — manage your subscription", terms `/legal/terms`, privacy `/privacy` | |
| `default_return_url` | `https://blockid.au/workspace/billing` | Sessions also pass `return_url` explicitly. |

### Why `subscription_update` is off

Plan changes must go through **`POST /api/stripe/change-plan`**, which
updates `app_users.plan` / `plan_started_at`, records the conversion event,
audits `stripe.plan.changed` and reconciles the Equity add-on. A portal-side
price switch would surface only as `customer.subscription.updated`, whose
`planIdFromPrice` reads `STRIPE_PRICE_MAP` — it does not know the v2 ladder
rows (`plans.stripe_price_id`), so entitlements would silently drift from
what Stripe bills. Until the webhook resolves plan ids from the `plans`
table, the portal must not change plans. The billing page's "Downgrade"
therefore calls `change-plan` for paid→paid moves and routes Free (= cancel)
to the cancel section.

### Inspecting it

```bash
# read-only, from the deploy host (never paste keys anywhere)
curl -s https://api.stripe.com/v1/billing_portal/configurations \
  -H "Authorization: Bearer $STRIPE_SECRET_KEY" -G -d active=true -d limit=10 | jq '.data[] | {id, is_default, active, features}'
```

Dashboard path: **Settings → Billing → Customer portal** (the page lists the
configuration created by the app under "Configurations"; `metadata.managed_by
= blockid-web`). Do not delete it — the app would create another on the next
cold start, but any Dashboard tuning would be lost.

Live check after deploy: sign in as an **admin customer that has a Stripe
customer id** (any account that ever started a checkout), open
`/workspace/billing` → **Manage Billing**. The first click creates the
configuration (log line `[blockid:stripe] created Billing Portal
configuration bpc_…`); the portal must open with *Cancel plan*, *Update
payment method* and *Invoice history*, and **without** a *Update plan* row.

## Self-serve cancel — `/workspace/billing#cancel`

The page loads the customer's **live** Stripe subscription
(`lib/billing/subscription.server.ts`: `subscriptions.list status=all`, mirror
fallback when Stripe is unreachable, re-mirrors the live answer into
`subscription_trial_state`). The **Cancel subscription** section renders for
every plan family (founder, evaluator, accelerator):

| State | Copy | `POST /api/stripe/cancel` does | After |
| --- | --- | --- | --- |
| `trialing` | "Cancel your &lt;plan&gt; trial — your trial ends today and your card is not charged. First charge would have been on &lt;trial_end&gt;." | `subscriptions.cancel(id)` **now**; `app_users.plan → free`, `cancel_at = now`; mirror `status = canceled`; churn row; audit `stripe.subscription.canceled {at_period_end:false, trialing:true}`. Response `{state:"canceled", charged:false}`. | Section disappears; notice "back on Free". |
| `active` / `past_due` | "You keep everything until &lt;period_end&gt;, then Free. No refund for the current period." + link `/legal/terms#refunds` | `subscriptions.update(id, {cancel_at_period_end:true})`; `app_users.cancel_at`, mirror flag, churn row, cancellation e-mail, audit `{at_period_end:true}`. Response `{state:"cancel_scheduled", activeUntil}`. | Banner **"&lt;plan&gt; cancels on &lt;date&gt; · Resume"**. |
| `cancel_at_period_end` already | — | **Idempotent**: 200 `{state:"cancel_scheduled", alreadyScheduled:true}`; no Stripe write, no churn row, no e-mail. | Same banner; **Resume** → `POST /api/stripe/reactivate` (lists all statuses, clears the flag, mirrors it). |
| reseller-managed (wholesale-provisioned) | "managed by your reseller partner" note | The section is not rendered (portal is 403 by D3-CISO-06). | — |
| Free / no customer / only canceled subs | no section, no button | **404 `no_subscription`** (never 500). Anonymous → 401. | — |

The confirm dialog is the existing exit survey (`components/churn/exit-survey.tsx`
— reason required, note optional). Save offers (coupons / pause) apply only
to paying subscriptions; a trial always cancels.

Audit action names are fixed by `lib/audit/manifest.ts`
(`stripe.subscription.canceled`, `stripe.subscription.reactivated`); the
trial path is distinguished by `fields.trialing = true`.

## Trial truth

* `plans.trial_days` (7 for Starter/Growth and Scout/Firm/Program/Fund; 14
  for the Cohort/Intake rungs; 0 for Index API / Enterprise / Free) is what
  checkout passes as `trial_period_days`. `lib/billing/subscription-state.test.ts`
  asserts, for every plan with a trial, that a subscription minted with that
  span reports exactly `trial_days` days.
* `GET /api/stripe/trial-status` now also returns `trialDays`
  (Stripe's `trial_start→trial_end` span), `firstChargeOn` (= `trial_end`
  while trialing and not cancelling; `null` once a cancel is scheduled) and
  `currentPeriodEnd`.
* The trial banner counts **down**: > 4 days left neutral, 3–4 amber,
  ≤ 2 red (the thresholds were inverted before). Its "Cancel trial" link
  opens the billing page's confirm flow.

## Webhook parity

* `customer.subscription.updated` mirrors `status`, `trial_end`,
  `current_period_end` and `cancel_at_period_end`; the plan stays on
  `app_users` until the period actually ends. `plan_id` now falls back to
  the subscription metadata (`plan_id` / `blockid_plan`) and is **omitted**
  (not nulled) when unknown.
* `customer.subscription.deleted` (fires at the period end, or immediately
  for a cancelled trial) sets `app_users.plan = free`, mirror
  `status = canceled`, revokes the add-on and sends the cancelled e-mail.

## Tests

* `web/src/lib/billing/portal-config.test.ts` — list/create-once/cache/503.
* `web/src/app/api/stripe/portal/route.test.ts` — configuration passed
  explicitly; 503 `portal_configuration_unavailable`.
* `web/src/app/api/stripe/cancel/route.test.ts` — every row of the table
  above.
* `web/src/app/api/stripe/webhook/route.test.ts` — cancel parity block.
* `web/tests/live-qa/32-billing.spec.ts` — Free account: page 200, no
  cancel button, `POST /api/stripe/cancel` → 404 `no_subscription`,
  anonymous → 401, portal → 404 (no customer). No real subscription can be
  created in live-qa (spend is off), so the trialing / active rows are
  covered by the unit tests only.
