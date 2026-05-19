---
name: stripe-test
description: Test all Stripe payment endpoints on BlockID — checkout, webhook, portal, cancel, change-plan, reactivate, billing page. Use when the user says "test stripe", "test payments", or "stripe test".
---

# Stripe Payment Integration Test — BlockID.au

Test all Stripe-related endpoints and billing functionality.

## Tests to Run

### 1. Unauthenticated Tests (should all reject)
```bash
# All should return 401
POST /api/stripe/checkout {"plan":"founder"} → 401
POST /api/stripe/portal → 401
POST /api/stripe/cancel → 401
POST /api/stripe/change-plan → 401
POST /api/stripe/reactivate → 401
```

### 2. Webhook Security
```bash
# No signature → 400
POST /api/stripe/webhook {} → 400 "Missing stripe-signature header"

# Fake signature → 400
POST /api/stripe/webhook (with stripe-signature: fake) → 400 "Invalid signature"
```

### 3. Checkout Edge Cases (with auth)
Create a test user + session, then test:
```bash
POST /api/stripe/checkout {"plan":"free"} → 400 (can't buy free)
POST /api/stripe/checkout {"plan":"nonexistent"} → 400
POST /api/stripe/checkout {} → 400
POST /api/stripe/checkout {"plan":"founder"} → 200 + Stripe URL
POST /api/stripe/checkout {"plan":"growth"} → 200 + Stripe URL
POST /api/stripe/checkout {"plan":"founding50"} → 200 + Stripe URL
```

### 4. Portal (no subscription)
```bash
POST /api/stripe/portal → 404 (no stripe_customer_id)
```

### 5. Billing Page
```bash
GET /workspace/billing (no auth) → 307 redirect
GET /workspace/billing (with auth) → 200
```

### 6. Checkout Success Page
```bash
GET /checkout/success?plan=founder → 200
GET /checkout/success?plan=growth → 200
```

### 7. Stripe Products Verification
Use Stripe API to verify all 5 products + prices exist:
- Founding 50: $49 AUD one-time
- Founder: $99 AUD/month
- Growth: $499 AUD/month
- Pilot: $5,000 AUD one-time
- Accelerator: $20,000 AUD/year

### 8. Database Check
Verify `stripe_customer_id` column exists on `app_users`:
```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d app_users" | grep stripe
```

## Clean Up
Delete any test users/sessions created during testing.

## Report
Table format: Endpoint | Payload | Expected | Actual | PASS/FAIL