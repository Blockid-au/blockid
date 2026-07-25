# Role Design — Reseller / Affiliate

Target surface: `/reseller/*` (already scaffolded). Entitlement gate: `reseller.console`.
Payments constraint (memory `feedback_reseller_no_stripe`): reseller NEVER touches Stripe. All commissions/coupon usage are read from BlockID's own DB via `resellerSupabase()` and displayed as reports; payouts are settled off-platform by BlockID.

## Persona

Partner-channel operator running a bounded book of attributed founders. Splits time between (a) *sales* — minting tier coupons, closing net-new signups, chasing over-budget grant approvals — and (b) *mentor* — keeping attributed founders warm through SVI phases so their commission tail (or wholesale seat count) survives the first 90 days. Motivated by tier-4 commission share and the reputational proof of building a portfolio of graduating startups; measured on attributed MRR, active-last-7d ratio, average SVI band lift, and cohort retention. Never touches Stripe: reads coupon usage and commission stats out of BlockID's own DB via the `resellerSupabase` wrapper.

## Top goals

1. Mint and distribute tier-appropriate promotion codes (0/10/20/30/40) without over-provisioning.
2. Watch attributed founders progress through SVI phases and flag disengagement before churn.
3. Grant sandbox credits inside the 20k/month soft cap and route over-budget requests to admin.
4. Provision new startups directly (create-startup) for pre-signup founders they closed offline.
5. Pull auditable monthly KPI + commission reports for accounting and quarterly QBRs.

## First 7 days

| Day | Goal | Actions |
| --- | --- | --- |
| 1 | Land in the console and understand what's mine | Complete first-run tour; read Reseller Console header; open `/reseller/settings` to confirm billing_model + allowed_tiers + commission_share_pct |
| 2 | Mint the sales toolkit | Visit `/reseller/codes`; confirm one active promo code per allowed tier; copy code URLs into outreach templates |
| 3 | Close net-new — provision a test founder | Use `/reseller/create-startup` to onboard one real founder from your pipeline; verify they appear in `/reseller/customers` masked |
| 4 | Learn the credit budget | Open `/reseller/credits`; grant a small pilot bundle to your test founder; note the MTD bar |
| 5 | Set the mentor rhythm | Open `/reseller/mentor`; log the first check-in on the test founder; set a 14-day cadence |
| 6 | Preview month-end reporting | Open `/reseller/reports`; download last month's KPI CSV (or note "not yet generated" if new) |
| 7 | Escalation muscle | Try a deliberately over-budget grant to see the 402 flow; watch it land in `/reseller/requests` with a decision_reason |

## Daily workflow

- Scan `/reseller` KPI tiles (attributed customers, active last 7d, active codes, billing model) — 30 seconds.
- Filter `/reseller/mentor?filter=overdue` for cold/cool founders; pick 1-3 to check-in on.
- Open a mentee at `/reseller/mentor/[founderId]/overview`; log a note or schedule the next check-in.
- Sweep `/reseller/customers` for stage regressions; reveal-email only when action is imminent (audit-logged).
- Approve or resend a promo code from `/reseller/codes` if a sales conversation is live.
- Check `/reseller/requests` for admin decisions on prior over-budget escalations.
- End of day: if any credit grant needed, do it from `/reseller/credits` (MTD bar keeps you honest).

## Menu groups (max 4)

### Overview
- Dashboard — `/reseller` — `reseller.console`
- Monthly reports — `/reseller/reports` — `reseller.console`

### Sales
- Promotion codes — `/reseller/codes` — `reseller.console`
- Customers — `/reseller/customers` — `reseller.console`
- Approval requests — `/reseller/requests` — `reseller.console`

### Mentor
- Mentee roster — `/reseller/mentor` — `reseller.console`
- Cohort roll-up — `/reseller/mentor/cohort` — `reseller.console`

### Account
- Create startup — `/reseller/create-startup` — `reseller.create_startup`
- Credit budget — `/reseller/credits` — `reseller.grant_credits`
- Reseller settings — `/reseller/settings` — `reseller.console`

Everything else (Validate / Build / Fundraise / Scale & Exit workspace routes) is HIDDEN — matches the existing `role-menu-overlay.ts` reseller entry (`hiddenGroups: ["Validate", "Build", "Fundraise", "Scale & Exit"]`).

## Feature map

| Feature | BlockID surface | Status | Notes |
| --- | --- | --- | --- |
| Reseller KPI dashboard | `/reseller` (`web/src/app/reseller/page.tsx`) | exists | k>=5 anonymity + ISO-week quantisation baked in |
| Promotion code catalogue | `/reseller/codes` (`web/src/app/reseller/codes/page.tsx`) | exists | 5 tiers 0/10/20/30/40; tier-0 has no Stripe object |
| Attributed customer list | `/reseller/customers` (`web/src/app/reseller/customers/page.tsx`) | exists | masked emails + audit-logged reveal + drawer |
| Create net-new startup | `/reseller/create-startup` (`web/src/app/reseller/create-startup/page.tsx`) | exists | gated `reseller.create_startup` |
| Sandbox credit grants | `/reseller/credits` (`web/src/app/reseller/credits/page.tsx`) | exists | 20k/mo soft cap; over-budget 402 → admin |
| Mentor roster (engagement view) | `/reseller/mentor` (`web/src/app/reseller/mentor/page.tsx`) | exists | phase + heat + next-step recommendation |
| Cohort roll-up | `/reseller/mentor/cohort` | exists | aggregate view for organised cohorts |
| Per-founder mentor console | `/reseller/mentor/[founderId]/{overview,notes,check-ins,goals,reports}` | exists | notes / check-ins / access-request routes gated |
| Monthly KPI CSV archive | `/reseller/reports` (`web/src/app/reseller/reports/page.tsx`) | exists | signed URL, 24h TTL |
| Admin approval queue | `/reseller/requests` (`web/src/app/reseller/requests/page.tsx`) | exists | decision_reason surfaced on denials |
| Reseller org profile | `/reseller/settings` (`web/src/app/reseller/settings/page.tsx`) | exists | read-only org fields + editable payment method |
| Reseller-facing commission ledger | (none — commission stats derived, no dedicated view) | partial | Values live in `reseller_attribution` + monthly report CSV; no per-transaction UI |
| Payout schedule / statement | none | missing | Payouts are off-platform; no statement page exists |
| Coupon-usage timeseries | none (only aggregate KPIs) | missing | No dedicated per-code redemptions view |
| Referral link builder with UTM | `/reseller/codes` exposes code only | partial | No branded landing URL builder |
| Marketing collateral library | none | missing | No shared decks, one-pagers, email templates |
| In-console messaging to attributed founders | none | missing | Mentor writes notes internally; no outbound send |

## Missing features

1. Per-code redemption timeline (weekly bar of coupon uses vs signups vs first-paid) so the reseller can attribute revenue to specific outreach batches.
2. Commission ledger page (`/reseller/commissions`) showing monthly commission earned, expected payout date, and a running YTD total — read-only, derived from the same DB the CSV export uses.
3. Payout statement PDF (`/reseller/payouts/[month]`) generated when BlockID settles off-platform, so resellers get a receipt without emailing admin.
4. Branded referral link builder that wraps a promo code in a UTM-tagged landing URL and returns a copy-and-QR block.
5. Collateral vault (`/reseller/collateral`) with tier-appropriate pitch decks, one-pagers, and email templates supplied by BlockID marketing.
6. Outbound message-a-mentee action from the mentor console that logs to `reseller_audit_log` and drops a rate-limited email through BlockID's transactional sender (reseller never gets founder's raw email).
7. Cohort creation wizard — cohort roll-up exists but there is no UI to define a new cohort or move founders between them.
8. Onboarding wizard entry for `reseller` / `affiliate` account_types — `step-segment.tsx` only exposes 5 segments, so reseller accounts must be provisioned by admin today.

## Onboarding tour steps

1. **welcome-reseller** — Welcome to the Reseller Console — "This console never shows workspace content. You see attributed customers, coupon usage, and mentor activity — nothing that would breach a founder's data room." — anchor `header h1`, cta `/reseller`.
2. **kpis** — Your KPI header — "Attributed customers, active last 7 days, active promotion codes, and your billing model. k>=5 anonymity is enforced — small buckets show as <5." — anchor `section:has(> .grid.grid-cols-1)`, cta `/reseller`.
3. **codes** — Your promo codes — "One row per tier you're allowed to sell. Tier 0 has no Stripe object (0-value coupons are illegal). BlockID owns the single Stripe account — you never touch it." — anchor `a[href='/reseller/codes']`, cta `/reseller/codes`.
4. **customers** — Attributed customers — "Emails are masked by default. Reveal is one click but audit-logged. Open the drawer for progression + reports." — anchor `a[href='/reseller/customers']`, cta `/reseller/customers`.
5. **mentor** — Mentor roster — "Engagement-first view of your book. Filter by overdue check-ins and log notes without leaving the row." — anchor `a[href='/reseller/mentor']`, cta `/reseller/mentor`.
6. **credits-and-reports** — Credits and month-end — "Grant sandbox credits inside your 20k/mo budget; over-budget prompts an admin request. Download last month's KPI CSV from Reports." — anchor `a[href='/reseller/credits']`, cta `/reseller/credits`.

## Guiding copy

- **Landing hero**: "Your channel console — attributed customers, coupon usage, mentor activity, and monthly KPI exports in one place."
- **Empty state (no attributed customers yet)**: "No attributed customers yet. Mint a tier code from Promotion codes, or provision a founder directly with Create startup."
- **Next-step recommender pattern**: "You have {N} overdue check-in{s}. Start with {founderName} — {phase}, {heat}, last activity {daysAgo}d ago."
