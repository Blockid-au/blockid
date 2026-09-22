# B01/B02 credit-pack price parity — 2026-09-22 07:24 UTC

Read-only inventory using the active web process configuration after PID/startTicks verification. Five Stripe Price GET requests with expanded Product completed HTTP200. No Checkout session, purchase, payment, refund, webhook, grant or Stripe configuration write was created. No customer data, Stripe IDs or secret values are included. Sanitized machine evidence: `/tmp/g30-credit-pack-price-parity.json`.

| Credits | Canonical web AUD | Actual Stripe AUD | Billing-service catalogue AUD | Result |
| --- | ---: | ---: | ---: | --- |
| 5 | 5.00 | 5.00 | 5.00 | Web/Stripe match |
| 10 | 9.00 | 9.00 | 9.00 | Web/Stripe match |
| 25 | 20.00 | 20.00 | 20.00 | Web/Stripe match |
| 50 | 35.00 | 35.00 | 15.00 | Service catalogue is stale by A$20 |
| 100 | 60.00 | 60.00 | 25.00 | Service catalogue is stale by A$35 |

All five actual Stripe prices: AUD, live mode, active, one_time; expanded products also active. All five `tax_behavior` values are **unspecified**. No credit-related product metadata was present. The source-of-truth web catalogue is `web/src/lib/credit-packs.ts`; `web/src/lib/credits.ts` re-exports it. `web/src/lib/stripe.ts` maps the five runtime price configuration names. The independent `services/billing/src/lib/credits.ts:109` still advertises retired A$15/25 offers and 70%/75% savings for the larger packs.

The service checkout implementation uses configured Stripe price references in line_items, not its catalogue amount as inline price_data. Thus stale service display/expectations do not by themselves prove it would charge A$15/25; actual service price mappings would need inspection if re-enabled. Earlier attested topology audit found BILLING_URL unset in active web, so the remote credit-service path is currently disabled.

The web checkout sets server-generated `blockid_credits` from the validated pack selection in Checkout metadata. Product metadata cannot independently verify credit quantity here because it is absent; purchase receipt/fulfillment verification still needs exact configured price mapping and immutable economic inputs. Correct Stripe base prices do not prove correct credits granted or atomic fulfillment.

`/api/credits` enables automatic_tax and describes pack prices as GST-inclusive, while these Stripe prices report unspecified tax behavior. This audit did not inspect account default tax behavior, jurisdiction-dependent checkout calculation or an actual invoice. Therefore base amount parity is established, but final-tax/total parity is **unverified**. No claim that tax is wrong or that the checkout total necessarily equals the displayed amount.

## Other configured sold families for the next audit

Active process configuration was compared with source `web/src/config/pricing/plans.csv`, `web/src/lib/pricing/stripe-map.ts`, `web/src/lib/stripe.ts`, and report SKU mappings. Configuration presence and source catalogue eligibility identify audit candidates; runtime database plan overrides, eligibility gates and successful purchases were not exercised.

| Family | Configured source mapping | Bounded observation |
| --- | --- | --- |
| Founder subscriptions | STRIPE_PRICE_FOUNDER_STARTER, STRIPE_PRICE_FOUNDER_GROWTH | Source catalogue active; corresponding *_ANNUAL environment settings absent. Do not infer annual availability or its fallback behavior. |
| Investor subscriptions | STRIPE_PRICE_INVESTOR_ANGEL, INVESTOR_ADVISOR, INVESTOR_VC_SMALL, INVESTOR_FUND (all STRIPE_PRICE_ prefix), each with *_ANNUAL | Source catalogue active; monthly/yearly keys configured. |
| Accelerator subscriptions | STRIPE_PRICE_ACCEL_STARTER, ACCEL_GROWTH, ACCEL_INTAKE, each with *_ANNUAL | Source catalogue active; monthly/yearly keys configured. |
| Index/API subscription | STRIPE_PRICE_INDEX_API and STRIPE_PRICE_INDEX_API_ANNUAL | Source active; mapping also reused for SVI API team. Institutional key absent from observed configured list. |
| Business setup package | STRIPE_PRICE_STARTUP_PACKAGE | Source founder_package active, one-off mapping. |
| Report purchases | STRIPE_PRICE_TRUST_REPORT_5AUD, STRIPE_PRICE_ONE_CLICK_REPORT, STRIPE_PRICE_FUNDING_REPORT | Explicit managed report SKU mappings; configured. Amounts not fetched in this narrow audit. |
| Equity/share-management add-on | STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY and STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL | Both configured and referenced in stripe-map. Older stripe.ts prose says annual unprovisioned/monthly-only; that comment contradicts current configuration and newer mapping. Verify actual UI cadence, amount and entitlements next. |

Configured keys are not automatically currently sold SKUs. In particular FOUNDER_SCALE is configured but source catalogue inactive. Legacy FOUNDER, GROWTH, GROWTH_ANNUAL, GROWTH_499, ACCELERATOR, FOUNDING50, PILOT, SVI_ANALYSIS and SVI_ANALYSIS_25 remain configured; the active checkout map explicitly removes/remaps retired legacy plan keys. Preserve grandfathered webhook recognition, and do not advertise those as new-sale products merely because environment settings exist.

## Next bounded acceptance work

Keep the web five-pack catalogue and Stripe base amounts unchanged unless an approved pricing decision changes them. Remove service-catalogue drift before re-enabling that service, and test shared pack/entitlement mapping. Check actual tax defaults and final checkout/invoice totals in an appropriate safe test flow; this inventory did not create one. Extend parity to source-active nonpack families, database overrides, annual cadence, trials, coupons and entitlements in separate bounded audits. Atomic grant/receipt, idempotency and webhook retry remain the next implementation requirement; price parity alone closes none of those transaction risks.

## Source correction after inventory

The future foundation candidate aligns the disabled billing-service catalogue to the existing web/Stripe50-pack A$35 (30%) and100-pack A$60 (40%). A read-only parser comparison of all five source entries confirms amounts and savings match. This is a catalogue correction, not a new price decision, Stripe mutation or service activation. Standalone service deployment/build and fulfillment remain outside this change; keep remote mutations disabled until atomic receipt coverage passes.
