# BlockID.au CFO Week 1 Report
**Date:** 2026-05-19
**Period covered:** Inception to date

---

## Task 1: Stripe Product/Price Audit

### Active Products in Stripe (13 total, 7 BlockID-specific)

| Product ID | Name | Type |
|---|---|---|
| prod_UXufKIJkJi5B3h | Founding 50 | BlockID plan |
| prod_UXufx1W4NLTSew | Founder | BlockID plan |
| prod_UXuf1gzUOJIKgE | Growth | BlockID plan |
| prod_UXufxbHSRYj8h6 | Pilot Concierge | BlockID plan |
| prod_UXufGQYpG0VyoL | Accelerator | BlockID plan |
| prod_UXxqDlad5werQD | SVI Analysis Report | BlockID one-off |
| prod_UY2ZsVC1XxhzgG | BlockID Credits | BlockID credits |
| prod_UJfLgxxx62h6bs | BookedAI Service Subscription | Legacy (other platform) |
| prod_US8ecpNCQ9pUNG | 30-min AI Starter Session | Legacy (bookedai.au) |
| prod_US8eL9a1VaY5TG | 1-hour AI Mentor | Legacy (bookedai.au) |
| prod_US8eWTKHE97dQK | 5-Session Package | Legacy (bookedai.au) |
| prod_US8erxlzYOGpyy | 10-Session Package | Legacy (bookedai.au) |
| prod_US8eRom8GEwePe | AI Business Transformation | Legacy (bookedai.au) |

### Active Prices vs. .env Mapping

| .env Key | .env Price ID | Stripe Price | Amount | Interval | MATCH? |
|---|---|---|---|---|---|
| STRIPE_PRICE_FOUNDING50 | price_1TYoqFJ7OAnXQ9sV8W7vWs4n | Founding 50 | A$49.00 | one-time | YES |
| STRIPE_PRICE_FOUNDER | price_1TYoqYJ7OAnXQ9sVXj5MPltZ | Founder | A$99.00/mo | monthly | YES |
| STRIPE_PRICE_GROWTH | price_1TYzjSJ7OAnXQ9sVVHjF1Scs | Growth Early Bird | A$99.00/mo | monthly | YES |
| STRIPE_PRICE_GROWTH_499 | price_1TYoqaJ7OAnXQ9sV6rudCWBE | Growth Standard | A$499.00/mo | monthly | YES |
| STRIPE_PRICE_PILOT | price_1TYoqcJ7OAnXQ9sVduBcszyx | Pilot Concierge | A$5,000.00 | one-time | YES |
| STRIPE_PRICE_ACCELERATOR | price_1TYoqfJ7OAnXQ9sVgUCzOfGs | Accelerator | A$20,000.00/yr | yearly | YES |
| STRIPE_PRICE_SVI_ANALYSIS | price_1TYw4AJ7OAnXQ9sVxcssTn8S | SVI (early-bird) | A$1.00 | one-time | YES |
| STRIPE_PRICE_SVI_ANALYSIS_25 | price_1TYrv9J7OAnXQ9sVvghMoCOh | SVI (standard) | A$25.00 | one-time | YES |
| STRIPE_PRICE_CREDITS_5 | price_1TYwUpJ7OAnXQ9sVhuDdKGKE | 5 Credits | A$5.00 | one-time | YES |
| STRIPE_PRICE_CREDITS_10 | price_1TYwV0J7OAnXQ9sV26XcGdQx | 10 Credits | A$9.00 | one-time | MISMATCH |
| STRIPE_PRICE_CREDITS_25 | price_1TYwV0J7OAnXQ9sVnc50rrZE | 25 Credits | A$20.00 | one-time | MISMATCH |
| STRIPE_PRICE_CREDITS_50 | price_1TYzYxJ7OAnXQ9sVV8NoiRxx | 50 Credits | A$15.00 | one-time | MISMATCH |
| STRIPE_PRICE_CREDITS_100 | price_1TYzYyJ7OAnXQ9sVqvtaonAm | 100 Credits | A$25.00 | one-time | YES |

### MISMATCHES FOUND

**CRITICAL: Credit pack prices in Stripe do NOT match what the codebase advertises.**

| Pack | Code (credits.ts) | Stripe Actual | Landing Page (pricing.tsx) |
|---|---|---|---|
| 5 credits | N/A (not in CREDIT_PACKS) | A$5.00 | A$5 (listed as 5 credits) |
| 10 credits | A$5.00 (500 cents) | A$9.00 (900 cents) | A$9 (listed as 10 credits) |
| 25 credits | A$9.00 (900 cents) | A$20.00 (2000 cents) | A$20 (listed as 25 credits) |
| 50 credits | A$15.00 (1500 cents) | A$15.00 (1500 cents) | A$35 (listed as 50 credits) |
| 100 credits | A$25.00 (2500 cents) | A$25.00 (2500 cents) | N/A |

**Issue 1 -- Credit pack pricing discrepancy (Stripe vs. credits.ts):**
- `credits_10` (price_1TYwV0J7OAnXQ9sV26XcGdQx) is A$9.00 in Stripe, but `credits.ts` says A$5.00
- `credits_25` (price_1TYwV0J7OAnXQ9sVnc50rrZE) is A$20.00 in Stripe, but `credits.ts` says A$9.00

The code comments in `credits.ts` say `A$5 = 10 credits` and `A$9 = 25 credits` but the Stripe prices are A$9 and A$20 respectively. The Stripe prices appear to have been updated but the code comments were not. Since Stripe is what actually charges users, the Stripe prices are the source of truth. **The code comments are misleading but functionally harmless** because the actual Checkout session uses the Stripe price ID, not the `priceAudCents` field.

**Issue 2 -- Landing page credit pack vs. reality:**
- Landing page shows 4 packs: 5/A$5, 10/A$9, 25/A$20, 50/A$35
- But the `CREDIT_PACKS` constant in `credits.ts` defines: 10/A$5, 25/A$9, 50/A$15, 100/A$25
- Stripe has 7 credit prices active (including a duplicate 50-credit at A$35)
- There is a stale/duplicate price `price_1TYwV0J7OAnXQ9sVlwpn5FdO` for "50 Credits" at A$35.00 that is NOT mapped in .env but is active in Stripe

**Issue 3 -- Orphan "5 Credits" price:**
- `STRIPE_PRICE_CREDITS_5` (price_1TYwUpJ7OAnXQ9sVhuDdKGKE, A$5.00) is mapped in .env and stripe.ts
- But `CREDIT_PACKS` in `credits.ts` starts at 10 credits, so the purchase API rejects amount=5
- The landing page pricing.tsx shows 5 credits for A$5 but has no Stripe integration for it (href goes to billing page anchor)

**Issue 4 -- Founder plan naming confusion:**
- `STRIPE_PRICE_FOUNDER` maps to Stripe's "Founder" product at A$99/mo (monthly subscription)
- But the pricing page calls the A$49 one-time plan "Founder" and routes to `/founding-50`
- The actual `founding50` plan in the checkout flow is the A$49 one-time plan
- The Stripe "Founder" A$99/mo subscription product exists but appears unused in the current pricing page

### Coupons

| Coupon ID | Name | Discount | Duration | Max Redemptions | Used |
|---|---|---|---|---|---|
| STARTUP25 | Startup25 - Free SVI Report | 100% off | once | unlimited | 0 |
| FOUNDING50 | Founding 50 - Free Account | 100% off | forever | 50 | 0 |
| WSTI | WSTI Partner Discount | 50% off | forever | unlimited | 0 |

All 3 coupons have **zero redemptions**. The FOUNDING50 coupon with 100% off forever and a max of 50 redemptions is aligned with the Founding 50 product strategy.

### Recommendations (Stripe Audit)
1. **Deactivate** the orphan A$35 50-credit price (`price_1TYwV0J7OAnXQ9sVlwpn5FdO`) in Stripe
2. **Fix** `credits.ts` comments to match actual Stripe prices (A$9 for 10 credits, A$20 for 25 credits)
3. **Decide** on the `credits_5` product: either add 5 to `CREDIT_PACKS` or deactivate the Stripe price
4. **Clarify** Founder vs Founding 50 naming to avoid confusion
5. **Consider** deactivating the 5 legacy BookedAI products if that platform is discontinued

---

## Task 2: Revenue Baseline

### Current State: PRE-REVENUE

| Metric | Value |
|---|---|
| Total Stripe customers | 0 |
| Active subscriptions | 0 |
| Payment intents | 0 |
| Charges (succeeded) | 0 |
| Total revenue to date | **A$0.00** |
| Stripe balance (available) | A$0.00 |
| Stripe balance (pending) | A$0.00 |
| Coupon redemptions | 0 |

**Interpretation:** BlockID is in pre-launch / product development phase. No customers have been onboarded to Stripe yet. The Stripe account is fully configured with products, prices, and coupons, but no transactions have occurred.

---

## Task 3: AI API Cost Analysis

### Provider Priority Chain
1. Claude CLI OAuth token (free -- uses developer's personal subscription)
2. Anthropic API Key (ANTHROPIC_API_KEY)
3. Claude Proxy (ANTHROPIC_PROXY_API_KEY -- third-party multi-key)
4. OpenAI (gpt-4o-mini)
5. Google Gemini (gemini-2.0-flash -- free tier fallback)

### Models Used Per Feature

| Feature | Model | Token Budget | Estimated Tokens/Call |
|---|---|---|---|
| SVI Analysis | claude-haiku-4-5-20251001 (default) | 4,096 output | ~3,000 in + 2,000 out |
| SVI AI Score | claude-haiku-4-5-20251001 | 1,024 output | ~2,000 in + 500 out |
| SVI Research | claude-haiku-4-5-20251001 | 4,096 output | ~3,000 in + 2,000 out |
| R&D Report (Standard) | claude-haiku-4-5-20251001 | 4,096 output x 3 batches | ~9,000 in + 6,000 out total |
| R&D Report (Deep Dive) | claude-haiku-4-5-20251001 | 8,192 output x 4 batches | ~16,000 in + 12,000 out total |
| Term Sheet Analysis | claude-sonnet-4-6 (hardcoded) | 8,192 output | ~6,000 in + 4,000 out |
| Growth Insights (cron) | claude-haiku-4-5-20251001 | 4,096 output | ~3,000 in + 2,000 out |
| Publish Insight (cron) | claude-haiku-4-5-20251001 | 4,096 output x 3 calls | ~6,000 in + 4,000 out |

### Cost Per Model (from ai-client.ts COST_PER_1K)

| Model | Cost/1K tokens | Notes |
|---|---|---|
| claude-haiku-4-5-20251001 | $0.001 | Primary model for most features |
| claude-sonnet-4-6 | $0.015 | Term sheet analysis only |
| gpt-4o-mini | $0.0003 | Fallback |
| gemini-2.0-flash | $0.0001 | Free tier fallback |

### Estimated Cost Per Feature (Anthropic API pricing)

| Feature | Estimated Tokens | Est. Cost (Haiku) | Est. Cost (Sonnet) |
|---|---|---|---|
| 1x SVI Analysis | ~5,000 | **$0.005** | N/A |
| 1x SVI AI Score | ~2,500 | **$0.0025** | N/A |
| 1x SVI Research | ~5,000 | **$0.005** | N/A |
| 1x R&D Standard (10-page) | ~15,000 (3 batches) | **$0.015** | N/A |
| 1x R&D Deep Dive | ~28,000 (4 batches) | **$0.028** | N/A |
| 1x Term Sheet Analysis | ~10,000 | N/A | **$0.15** |

### Monthly Budget Cap
- Hard limit: **$100/month** (set in `ai-client.ts` line 59)
- Budget file: `/tmp/blockid-ai-budget.json` (currently does not exist -- no AI calls made in production)
- Budget auto-resets each calendar month
- When exceeded, all AI calls are refused until the next month

### Estimated Monthly AI Costs at Various Usage Levels

| Scenario | SVI Analyses | R&D Standard | R&D Deep | Term Sheets | Monthly AI Cost |
|---|---|---|---|---|---|
| Early (10 users) | 50 | 10 | 2 | 5 | ~$1.58 |
| Growth (100 users) | 500 | 100 | 20 | 50 | ~$15.81 |
| Scale (1000 users) | 5,000 | 1,000 | 200 | 500 | ~$158.10 |

Note: The $100/month budget cap would be hit at approximately 600 active users at the "Growth" usage pattern. This cap needs to be raised before scaling.

---

## Task 4: Unit Economics & P&L Template

### Current Unit Economics (Pre-Revenue Estimates)

Since revenue is A$0, these are **projected** figures based on the pricing and cost structure.

#### Revenue Per Feature (Credit Model)

| Feature | Credit Cost | Credit Value (at A$0.50/credit) | AI COGS |
|---|---|---|---|
| SVI Analysis | 0.50 credits | A$0.25 | ~$0.005 (0.3 US cents) |
| R&D Standard Report | 1.00 credit | A$0.50 | ~$0.015 (1.5 US cents) |
| R&D Deep Dive | 1.50 credits | A$0.75 | ~$0.028 (2.8 US cents) |
| Term Sheet Analysis | 1.00 credit | A$0.50 | ~$0.15 (15 US cents) |
| AI Score Enhancement | 0.25 credits | A$0.125 | ~$0.003 |
| Research | 0.50 credits | A$0.25 | ~$0.005 |

#### Gross Margin Per Feature

| Feature | Revenue (AUD) | AI COGS (USD->AUD ~1.5x) | Gross Margin |
|---|---|---|---|
| SVI Analysis | A$0.25 | ~A$0.008 | **96.8%** |
| R&D Standard | A$0.50 | ~A$0.023 | **95.5%** |
| R&D Deep Dive | A$0.75 | ~A$0.042 | **94.4%** |
| Term Sheet | A$0.50 | ~A$0.225 | **55.0%** |

Note: Term Sheet uses the more expensive claude-sonnet-4-6 model, significantly impacting its margin. All other features using Haiku have excellent gross margins.

#### Plan-Level Economics

| Plan | Price | Credits Granted | Credit Face Value | Gross Revenue/User |
|---|---|---|---|---|
| Free | A$0 | 2 | A$1.00 | -A$1.00 (subsidy) |
| Founding 50 | A$49 (lifetime) | 100 | A$50.00 | A$49 one-time |
| Growth | A$99/mo | 200/mo | A$100.00 | A$99/mo recurring |

#### Projected Unit Economics (Founding 50 Plan)

| Metric | Value | Notes |
|---|---|---|
| ARPU | A$49 | One-time payment |
| Credits granted | 100 | Lifetime |
| Max AI cost to serve 100 credits | ~A$1.50 | If all credits used on Haiku features |
| Max AI cost if term sheets | ~A$22.50 | If all 100 credits used on term sheets |
| **Blended AI COGS estimate** | ~A$3-5 | Realistic mixed usage |
| **Gross margin** | **~90-94%** | A$44-46 per customer |

#### Projected Unit Economics (Growth Plan)

| Metric | Value | Notes |
|---|---|---|
| Monthly ARPU | A$99 | Recurring |
| Credits granted | 200/mo | Monthly recurring |
| Max AI cost/month | ~A$3.00 | If all credits used on Haiku features |
| Max AI cost if term sheets | ~A$45.00 | If all 200 on term sheets |
| **Blended AI COGS estimate** | ~A$6-10/mo | Realistic mixed usage |
| **Gross margin** | **~90-94%** | A$89-93 per customer/month |

### P&L Template (Monthly)

```
BLOCKID.AU -- PROJECTED MONTHLY P&L
====================================

REVENUE
  Founding 50 one-time sales        A$  ___
  Growth subscriptions (MRR)        A$  ___
  Credit pack purchases             A$  ___
  SVI Analysis one-off purchases    A$  ___
  Pilot/Accelerator enterprise      A$  ___
  ---------------------------------
  TOTAL REVENUE                     A$  0.00  (current)

COST OF GOODS SOLD (COGS)
  AI API costs (Anthropic/OpenAI)   A$  ___   (~3-7% of feature revenue)
  Stripe processing fees (1.75%+30c)A$  ___
  Supabase hosting                  A$  ___
  Vercel/hosting                    A$  ___
  ---------------------------------
  TOTAL COGS                        A$  ___

GROSS PROFIT                        A$  ___
GROSS MARGIN                            ~85-90% (target)

OPERATING EXPENSES
  Infrastructure
    Domain & DNS                    A$  ___
    SSL/CDN                         A$  ___
    Email service (Resend)          A$  ___
  Marketing & Sales
    Ads / paid acquisition          A$  ___
    Content marketing               A$  ___
    Partnership costs               A$  ___
  R&D / Engineering
    Developer time                  A$  ___
    AI tooling (Claude Code etc.)   A$  ___
  General & Admin
    Legal / compliance              A$  ___
    Accounting                      A$  ___
    Insurance                       A$  ___
  ---------------------------------
  TOTAL OPEX                        A$  ___

NET INCOME (LOSS)                   A$  ___

KEY METRICS
  MRR                               A$  0.00
  ARR                               A$  0.00
  Paying customers                      0
  Free users                            0
  CAC                                   N/A (no spend / no customers)
  LTV                                   N/A
  LTV:CAC ratio                         N/A (target: >3:1)
  Churn rate                            N/A
  AI cost per dollar of revenue         ~$0.03-0.07
```

---

## Summary of Key Findings

### Critical Issues
1. **Credit pack pricing mismatch**: `credits.ts` comments do not match Stripe prices for 10-credit and 25-credit packs. While functionally harmless (Stripe is the billing source of truth), this is confusing for developers.
2. **Orphan Stripe price**: An active A$35 "50 Credits" price exists in Stripe but is not mapped anywhere in the codebase.
3. **Landing page vs. reality**: The pricing.tsx landing page shows different credit packs (5/10/25/50) than what `CREDIT_PACKS` in credits.ts defines (10/25/50/100).
4. **No revenue**: Zero customers, zero transactions, zero subscriptions. The platform is fully configured but has not processed any payments.

### Positive Observations
1. **Excellent gross margins**: AI COGS at 3-7% of revenue yields 93-97% gross margin on most features. Only Term Sheet Analysis (55% margin due to Sonnet usage) is lower.
2. **Budget guardrail in place**: $100/month hard cap on AI spending prevents runaway costs.
3. **Multi-provider fallback**: AI client gracefully degrades across 5 providers, ensuring uptime.
4. **Well-structured pricing tiers**: Clear progression from free to enterprise.
5. **Credit system is sound**: Fractional credits with atomic transactions and audit logging.

### Recommended Next Steps (CFO Priority)
1. Fix the credit pack pricing alignment (code comments vs. Stripe vs. landing page)
2. Deactivate orphan Stripe prices
3. Set up Stripe tax configuration (all prices show `tax_behavior: "unspecified"`)
4. Prepare to raise the $100/month AI budget cap once users start onboarding
5. Instrument cost tracking per feature to validate gross margin assumptions
6. Consider repricing Term Sheet Analysis (currently 1.0 credit = A$0.50 revenue vs A$0.225 AI cost = 55% margin; should be 2-3 credits)
