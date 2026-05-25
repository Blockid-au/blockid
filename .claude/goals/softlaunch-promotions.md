# BlockID.au — Softlaunch Promotions (expires July 1, 2026)

## Goal
Drive early adoption with aggressive promotions keeping cost < A$1 per analysis.
All promotions expire July 1, 2026 (GROWTH_EARLY_BIRD_DEADLINE).

---

## Promotion Mechanisms

### 1. LAUNCH50 Coupon — 50% off Founding 50
- **Code**: `LAUNCH50`
- **Effect**: A$49 → A$24.50 for Founding 50 plan (100 credits)
- **Credit cost per analysis**: A$0.245 (100 credits ÷ A$24.50)
- **Expires**: July 1, 2026
- **Max uses**: 200

### 2. FIRSTFREE Coupon — 5 Free Credits on Signup
- **Code**: `FIRSTFREE`
- **Effect**: Grants 5 bonus credits (on top of 2 free)
- **Credit cost per analysis**: A$0 (7 total free credits = ~14 analyses)
- **Expires**: July 1, 2026
- **Max uses**: 500

### 3. Welcome Bonus — Triple Free Credits
- **Current**: 2 free credits on signup
- **Promo**: 5 free credits on signup (until July 1, 2026)
- **Equivalent**: ~10 SVI analyses free
- **No code needed**: automatic

### 4. Referral Boost — Double Referral Credits
- **Current**: Referrer gets 2 cr, referee gets 1 cr
- **Promo**: Referrer gets 5 cr, referee gets 3 cr (until July 1, 2026)
- **Viral loop**: each referral gives enough credits for ~10 analyses

### 5. Daily Free Analysis
- **Effect**: Every logged-in user gets 1 free SVI analysis per day
- **Implementation**: Check if user analyzed today → skip credit deduction
- **Expires**: July 1, 2026
- **Purpose**: Build habit, show value daily

### 6. Flash Sale Banner
- **Position**: Top of homepage + pricing page
- **Message**: "Early Bird Special — SVI Analysis for A$0.50 (normally A$25). Expires July 1, 2026"
- **Urgency**: countdown timer to July 1, 2026
- **CTA**: "Get Started Free" → direct to SVI input

---

## Pricing Summary (during promo period)

| Action | Normal Price | Promo Price | Per Analysis |
|--------|-------------|-------------|--------------|
| Free signup | 2 credits | **5 credits** | A$0 |
| SVI analysis | 0.50 cr | 0.50 cr | **A$0.50** |
| Founding 50 (LAUNCH50) | A$49 | **A$24.50** | A$0.245 |
| Referral bonus | 2+1 cr | **5+3 cr** | A$0 |
| Credit pack 5 | A$5 | A$5 | **A$1.00** |
| Growth monthly | A$99/mo | A$99/mo | **A$0.50** |

All prices < A$1 per analysis during promo period.

---

## Implementation Plan

### Database: Insert promo coupons
```sql
INSERT INTO coupons (code, discount_pct, credits_grant, max_uses, valid_until, active, description) VALUES
('LAUNCH50', 50, 0, 200, '2026-07-01', true, 'Founding 50 at 50% off — softlaunch'),
('FIRSTFREE', 0, 5, 500, '2026-07-01', true, '5 free credits on signup — softlaunch');
```

### Code changes:
1. `lib/credits.ts` — Increase SIGNUP_BONUS from 2 → 5 (with deadline check)
2. `lib/referrals.ts` — Increase referral credits (with deadline check)
3. Landing page — Add promo banner with countdown
4. Pricing page — Show promo pricing with strikethrough

### Deadline logic:
```typescript
const PROMO_DEADLINE = new Date("2026-07-01T00:00:00+10:00");
const isPromoActive = () => new Date() < PROMO_DEADLINE;
```