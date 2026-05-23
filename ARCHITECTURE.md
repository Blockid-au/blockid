# BlockID.au — Microservices Architecture Plan

## Phase 1: Strangler Fig — AI Gateway + Billing Service

### Directory Structure
```
blockid.au/
├── services/
│   ├── ai-gateway/          ← NEW: Standalone AI provider routing
│   │   ├── src/
│   │   │   ├── index.ts         # Fastify server
│   │   │   ├── routes/
│   │   │   │   └── generate.ts  # POST /generate — unified AI call
│   │   │   ├── providers/
│   │   │   │   ├── claude.ts
│   │   │   │   ├── openai.ts
│   │   │   │   ├── gemini.ts
│   │   │   │   ├── groq.ts
│   │   │   │   ├── openrouter.ts
│   │   │   │   └── ollama.ts
│   │   │   ├── budget.ts        # $100/mo budget tracking
│   │   │   └── health.ts        # GET /health
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── billing/             ← NEW: Stripe + Credits service
│       ├── src/
│       │   ├── index.ts         # Fastify server
│       │   ├── routes/
│       │   │   ├── checkout.ts  # POST /checkout
│       │   │   ├── webhook.ts   # POST /webhook (Stripe)
│       │   │   ├── portal.ts    # POST /portal
│       │   │   ├── credits.ts   # GET/POST /credits
│       │   │   ├── cancel.ts    # POST /cancel
│       │   │   ├── change.ts    # POST /change-plan
│       │   │   └── coupon.ts    # POST /coupon/validate, /coupon/redeem
│       │   ├── lib/
│       │   │   ├── stripe.ts    # Stripe client
│       │   │   ├── credits.ts   # Credit balance logic
│       │   │   └── plans.ts     # Plan definitions
│       │   └── health.ts
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
├── web/                     ← EXISTING: Next.js monolith (frontend + remaining APIs)
└── chain/                   ← EXISTING: Cosmos blockchain
```

### Service Communication
- Monolith → AI Gateway: `POST http://ai-gateway:4010/generate`
- Monolith → Billing: `POST http://billing:4011/credits/check`, etc.
- Docker network: all services on `blockid_network`

### Port Allocation
| Service | Internal Port | External (dev) |
|---------|--------------|----------------|
| web (Next.js) | 3000 | 4000 |
| ai-gateway | 4010 | — |
| billing | 4011 | — |
| redis | 6379 | — |

### AI Gateway API Contract
```
POST /generate
Headers: X-Internal-Key: <shared secret>
Body: { system, user, maxTokens?, timeoutMs?, tools? }
Response: { ok, text, provider, model, estimatedTokens }

GET /health
Response: { ok, providers: [...], budget: { spent, limit, percent } }

GET /providers
Response: { providers: [{ name, status, cooldownUntil }] }
```

### Billing API Contract
```
POST /credits/check
Body: { userId, feature }
Response: { allowed, balance, cost }

POST /credits/spend
Body: { userId, feature, metadata? }
Response: { ok, balance, transactionId }

POST /credits/grant
Body: { userId, amount, reason }
Response: { ok, balance }

GET /credits/balance?userId=xxx
Response: { balance, lifetime_earned, lifetime_spent }

POST /checkout
Body: { userId, plan, email }
Response: { ok, url }

POST /webhook (Stripe)
Body: Stripe webhook payload
Response: { ok }

POST /portal
Body: { userId }
Response: { ok, url }

POST /cancel
Body: { userId }
Response: { ok }

POST /coupon/validate
Body: { code }
Response: { ok, discount_pct, label }
```
