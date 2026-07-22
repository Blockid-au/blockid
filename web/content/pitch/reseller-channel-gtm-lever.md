# BlockID.au — Reseller Channel as a GTM Lever

*Data-room one-pager · Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111) · Sydney NSW*

*Version 1.0 — 2026-07-22 · Owner: Investor Relations · Cross-referenced with `docs/plans/reseller-module-plan.md` and `docs/plans/reseller-module-goal.md`.*

---

## 1. Why this memo exists

Diligence readers ask two questions about any reseller programme: (a) **who is the seller of record?** and (b) **where does margin actually land?** This one-pager answers both against the shipped implementation, so a Series-A partner can validate the channel-mix story without wading through the plan file.

## 2. Seller-of-record rationale

- **Auschain PTY LTD** stays seller-of-record on every invoice, including wholesale seats resold through partners like InfoVision. There is **no Stripe Connect**, no split ledger, no founder-personal-bank ambiguity.
- One ABN (79 659 615 111) on every invoice → one ATO GST remitter → one revenue-recognition entity → one clean bank-statement audit trail for due diligence.
- Invoice memo carries `Reseller: <partner name>` (Stripe `invoice_creation.invoice_data.custom_fields`) and recurring subscriptions carry `Introduced by <partner name>` (Stripe `subscription_data.description`) — the co-branding is visible to the customer without displacing Auschain as the merchant.
- Design decision resolved as **H.13** in the goal file (`admin@blockid.au` recommended as the Stripe dashboard owner) and locked in the plan at §U.1 / §U.15.5.

## 3. Two channel models, one platform

| | Wholesale (InfoVision-style) | Retail (referral partners) |
|---|---|---|
| Who owns CAC | Reseller | BlockID |
| Who runs support | Reseller | BlockID |
| BlockID commission rate | **0%** | **40% of list** |
| BlockID gross retention per A$99 seat | **A$99.00** (pre-GST-remit) | **A$59.40** (pre-GST-remit, invariant across tiers 0/10/20/30/40) |
| GST remitter | Auschain | Auschain |
| Best-fit partner | Accelerators, incubators, corporate innovation programmes that already carry founder relationships | Individual advisors, angel scouts, ecosystem influencers |
| Design-partner reference | **InfoVision** (seed row in the reseller module; 20,000 credits/mo soft cap; 500 sandbox credits/mo) | To be signed after Wholesale channel demonstrates unit economics |

Both models sit behind one `resellers` table with a `billing_model` discriminator; the DB CHECK constraint `list − discount − commission = 0.60 × list` is relaxed to a per-row branch (retail rows enforce the 60/40 split; wholesale rows enforce `commission = 0 AND list = amount_paid` unless a promo code applied). Ledger drift is caught nightly by `/api/cron/reseller-monthly-reconciliation` with a A$1 GST tolerance (`GST_TOLERANCE_CENTS=100`).

## 4. Commission truth-table — retail, A$99 SKU

Plan §H truth-table reproduced verbatim; BlockID gross is column-constant at A$59.40 across every tier. Auschain remits per-tier GST to the ATO regardless of commission — GST does not come out of the reseller's cut.

| Tier | List (AUD) | Discount | Customer paid | Commission owed | **BlockID gross (invariant)** | ATO GST remit | BlockID net after GST |
|---|---|---|---|---|---|---|---|
| 0% | 99.00 | 0.00 | 99.00 | 39.60 | **59.40** | 9.00 | 50.40 |
| 10% | 99.00 | 9.90 | 89.10 | 29.70 | **59.40** | 8.10 | 51.30 |
| 20% | 99.00 | 19.80 | 79.20 | 19.80 | **59.40** | 7.20 | 52.20 |
| 30% | 99.00 | 29.70 | 69.30 | 9.90 | **59.40** | 6.30 | 53.10 |
| 40% | 99.00 | 39.60 | 59.40 | 0.00 | **59.40** | 5.40 | 54.00 |

The A$59.40 invariant is enforced at three layers: (i) TypeScript pure lib at `web/src/lib/reseller/commission.ts` with a 19/19 truth-table vitest; (ii) DB CHECK constraint on `reseller_commissions` insert; (iii) monthly reconciliation cron that folds `revenue_events.gst_aud_cents` against `stripe.invoices.total_taxes[].amount` and emails `admin@blockid.au` on drift.

## 5. InfoVision as design-partner reference

- **Seed row** — `code=INFOVISION`, `billing_model=wholesale`, `allowed_tiers=[0,10,20,30,40]`, `monthly_credit_budget=20000`, `monthly_sandbox_credits=500`, `can_create_startups=true`, `can_grant_credits=true`, `commission_share_pct=40.00` (H.20 resolution — ABN + GST confirmation currently the only remaining human-blocked step for physical INSERT).
- **Rationale** — InfoVision already carries founder relationships in-market and can front-run BlockID CAC. The wholesale model lets them capture 100% of the customer margin outside the Stripe rail while BlockID collects a predictable A$99/mo/seat with 0% commission overhead. This is the **strongest single line-item for the "path to A$1M ARR" slide** — a 100%-margin SaaS channel with the CAC carried by a partner.
- **Ledger evidence** — every wholesale invoice writes a `reseller_commissions` row with `commission_aud_cents=0` and a linked `commission_share_pct=40.00` for reference; the row exists purely for reconciliation, not for payout. This preserves auditability without cash movement.

## 6. Forward pipeline (retail-partner categories)

Ranked by ecosystem fit to Auschain's Sydney-anchored, AU-first thesis:

1. **Accelerators & incubators** — Startmate, Antler AU, LaunchVic-funded programmes. Retail 40% commission maps cleanly onto their alumni-referral incentive model; annual cohort scale means single sign-up amortises across 20-30 startups.
2. **Corporate venture / innovation programmes** — Telstra Muru-D, NAB Ventures scout networks, industry-vertical accelerators. Wholesale model preferred; behaves like InfoVision.
3. **Angel-investor networks** — Sydney Angels, Melbourne Angels, individual scouts through AAAI. Retail 10-20% tier for lightweight introductions.
4. **Fintech / SaaS advisors and consultancies** — solo operators who introduce their clients to BlockID during onboarding conversations. Retail 40% top tier as a loyalty-lever.
5. **VC scout programmes** — Blackbird / AirTree / Square Peg scouts, when they act as pre-check operators for portfolio hopefuls. Attribution-only (tier 0%) suffices — the scout gets the co-branding badge without a commission tie.

Each category can be onboarded through the existing `/admin/resellers` surface; no additional schema work is required to sign the next reseller. The R-01 scope-boundary lint enforces at CI-time that no future `/api/reseller/**` route can accidentally cross the tenant boundary.

## 7. Diligence-readiness artefacts (already shipped)

- **Append-only commission ledger** — `reseller_commissions` + `reseller_commission_events` (migration 0094) enforce append-only writes via mutation triggers; refund clawbacks book compensating events rather than mutating history. Statute-of-limitations retention (6 years for reseller clawback per H.9) is enforced at the row level, not the archive level.
- **Append-only reveal audit** — `reseller_audit_log` (migration 0093) writes a row on every customer-email reveal, customer-drawer open, credit grant, sandbox provisioning, and monthly report download; default-deny RLS blocks external SELECT.
- **Signed-URL report delivery** — 24h TTL (`SIGNED_URL_TTL_SECONDS=86400`), 12-month exposed window, 24-month hard retention; every mint writes an audit row **before** returning the URL (D4-CLO-07).
- **Monthly reconciliation cron** — `/api/cron/reseller-monthly-reconciliation` emails `admin@blockid.au` with a CSV attachment; GST-delta section flags any drift outside A$1 tolerance.

## 8. What to link from the deck

- Hero traction link: **[/showcase/blockid](https://blockid.au/showcase/blockid)** — live public mirror of BlockID.au's own workspace, refreshed on every page load. Label as "live dogfood, updated by autonomous loop".
- Data-room index entry: this memo.
- Deck slide reference: **Slide 8 — Channel Economics** in `web/content/pitch/pitch-deck-v1.md`.

## 9. Cross-references

- Plan file: `docs/plans/reseller-module-plan.md` (§U.1, §U.3, §U.15, §G.2, §H, §H.11, §H.17).
- Goal file: `docs/plans/reseller-module-goal.md` (H.13, H.20 InfoVision seed).
- IR advisory review: `docs/plans/reviews/plan-review-ir.md` (recs #1–#5 all addressed above).
- Unicorn masterplan: `.claude/goals/unicorn-masterplan.md` — Reseller Channel revenue row + Channel Economics section.
- Pitch deck: `web/content/pitch/pitch-deck-v1.md` — Slide 8 (Channel Economics).
