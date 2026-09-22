# G30 B01 nonpack Stripe price parity — read-only inventory

Checked 2026-09-22T07:31:51.065Z through 2026-09-22T07:35:34.916Z UTC.

Used the active serving-state PID/startTicks attestation before reading process configuration in memory. Requested only Stripe Price resources with expanded Product (24 distinct configured price IDs, deduplicated within each disjoint monthly/annual batch) and one Tax Settings retrieval. All returned HTTP 200. No IDs, keys, customer data or addresses are included. No checkout, payment, invoice, subscription, mutation or fulfilment was attempted.

**Result:** All 24 source-active/configured nonpack prices match canonical base amounts and billing cadence. Every price and expanded product is active; all prices are live AUD. Recurring intervals are exactly one month or one year. This establishes catalogue parity, not successful live purchase or fulfilment.

| Source family | Cadence | Expected AUD | Stripe AUD | Price tax behavior | Public catalogue amount |
|---|---|---:|---:|---|---|
| founder_starter | month | 29.00 | 29.00 | inclusive | A$29 |
| founder_growth | month | 69.00 | 69.00 | inclusive | A$69 |
| investor_angel | month | 79.00 | 79.00 | unspecified | A$79 |
| investor_advisor | month | 149.00 | 149.00 | unspecified | A$149 |
| investor_vc_small | month | 349.00 | 349.00 | unspecified | A$349 |
| accelerator_starter | month | 500.00 | 500.00 | unspecified | A$500 |
| accelerator_growth | month | 1,500.00 | 1,500.00 | unspecified | A$1500 |
| founder_package | one_time | 149.00 | 149.00 | inclusive | Not a subscription card |
| investor_fund | month | 999.00 | 999.00 | inclusive | A$999 |
| accelerator_intake | month | 249.00 | 249.00 | inclusive | A$249 |
| index_api | month | 299.00 | 299.00 | inclusive | A$299 |
| trust_report | one_time | 3.00 | 3.00 | inclusive | Not a subscription card |
| one_click_report | one_time | 3.00 | 3.00 | unspecified | Not a subscription card |
| funding_report | one_time | 3.00 | 3.00 | inclusive | Not a subscription card |
| equity_addon | month | 59.00 | 59.00 | inclusive | Not a subscription card |
| equity_addon | year | 590.00 | 590.00 | inclusive | Not a subscription card |
| investor_angel | year | 790.00 | 790.00 | unspecified | A$790 |
| investor_advisor | year | 1,490.00 | 1,490.00 | unspecified | A$1490 |
| investor_vc_small | year | 3,490.00 | 3,490.00 | unspecified | A$3490 |
| accelerator_starter | year | 5,000.00 | 5,000.00 | inclusive | A$5000 |
| accelerator_growth | year | 15,000.00 | 15,000.00 | inclusive | A$15000 |
| investor_fund | year | 9,990.00 | 9,990.00 | inclusive | A$9990 |
| accelerator_intake | year | 2,490.00 | 2,490.00 | inclusive | A$2490 |
| index_api | year | 2,990.00 | 2,990.00 | inclusive | A$2990 |

## Canonical and advertised semantics

- Subscription/setup expectations: `web/src/config/pricing/plans.csv`, through `web/src/lib/pricing/stripe-map.ts::stripeMapRows`. Annual rows are admitted only where their annual environment mapping exists in `stripe-price-catalogue.json.prices`. The eight configured subscription annual prices were separately retrieved; no annual price was inferred from its monthly counterpart.
- Public subscription figures in `web/src/lib/plans-v2.ts` agree with the matching CSV/Stripe amounts above. Annual cards in `web/src/components/landing/pricing-matrix.tsx::PlanCard` render the complete `annual_aud` amount with `/yr` and “Billed annually”; these are annual totals, not monthly equivalents billed annually. Program text explicitly lists A$2,490 / A$5,000 / A$15,000 a year. These totals equal ten monthly base payments (about 16.7% below twelve monthly payments).
- `web/src/app/(marketing)/pricing/page.tsx` passes server-resolved `annualAvailable` and `purchasable` into the card switch. `web/src/lib/plans/annual-available.ts` derives these from cached database plan rows. Founder Starter/Growth retain A$290/A$690 annual values in the static catalogue, but their annual environment mappings are absent; the intended card behavior is monthly fallback unless a database annual mapping exists. Database plan overrides and actual rendered live checkout links were not inspected in this bounded task; configuration presence alone does not prove which CTA a visitor receives.
- Three one-off report SKUs all cost A$3 under `web/src/lib/pricing/v3-skus.ts`; the legacy `STRIPE_PRICE_TRUST_REPORT_5AUD` variable name does not mean the current charge is A$5. Stripe currently agrees with A$3.
- Equity add-on is A$59/month or A$590/year; setup package is A$149 once. Earlier source comments about unprovisioned add-on annual billing are stale relative to the configured active annual price observed here.

## Tax: observed configuration, unresolved checkout proof

Stripe Tax Settings GET returned HTTP 200, live=True, status=active, defaults.tax_behavior=`inferred_by_currency`. The installed Stripe SDK documents the read-only `/v1/tax/settings` retrieval; no account access was broadened.

Some prices explicitly say `inclusive`, while others say `unspecified` (see table). The public pricing page promises “AUD pricing, GST-inclusive”. The account default is now known rather than assumed; this audit does not resolve its effective treatment for a particular checkout, tax registration, customer location or tax status. Do not equate `unspecified` with an observed extra charge, and do not claim final checkout GST parity from base-price parity. A controlled final-charge/tax assertion remains necessary before marking the sale flow verified.

## Scope boundaries and next checks

- Retired founder_scale, free/custom enterprise rows, and configured legacy aliases are excluded because this task follows source-active sold mappings; their runtime reachability is not proved absent by this audit.
- Existing pack audit remains `/tmp/g30-credit-pack-price-parity.md`; its services/billing 50/100 credit display drift is a separate unresolved issue.
- Next bounded sale verification should resolve the actual database plan mapping plus server review/checkout cadence, tax presentation and receipt/credit fulfilment contract. No live purchase, credit grant/spend, refund, invoice or webhook replay was performed here.
- No claim of transaction atomicity, exactly-once credit delivery, charge success or production UI visual parity is supported by these resource reads.

Machine-readable sanitized observations: `/tmp/g30-nonpack-price-parity.json`.
