# Pricing Page UX Review — CPO Report

## Critical Issue: Data Inconsistency

Two separate pricing components with CONFLICTING data:

| Data Point | Landing embed (`pricing.tsx`) | Dedicated page (`/pricing`) |
|---|---|---|
| Free plan name | "Starter" | "Free" |
| Free credits | 2 free (~4 SVI) | 1 SVI analysis |
| Founder credits | 100 credits | 50 credits |
| Growth CTA | → /contact | → /auth/login?plan=growth |
| Coupon input | ✅ Rendered | ❌ Missing |

**Fix:** Create shared `pricing-data.ts` — single source of truth.

## 5 UX Improvements

1. **Unify pricing data** — shared config file (2-3h)
2. **Add social proof** — testimonials + trust badges (4-6h, +15-25% conversion)
3. **Make credit packs actionable** — add "Buy Now" CTAs (1-2h)
4. **Add PricingCoupon** — partner discount on /pricing page (30min)
5. **Add urgency** — "Only X of 50 remaining", save badges, 30-day guarantee (3-4h)
