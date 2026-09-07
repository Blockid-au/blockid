# BlockID.au — Architecture

**Current release:** `v3.9.23` · `web/package.json` version `3.9.23` · git `8ed44c24a`

## Surface (as-shipped)

| Metric | Count |
|---|---|
| Pages | 339 (`web/src/app/**/page.tsx`) |
| API routes | 495 (`web/src/app/api/**/route.ts`) |
| Supabase migrations | 24 (latest `20260907_sample_listings_seed.sql` — 3 sample listings seeded) |
| Free tools | 17 (`/tools/*`) |
| Guided journey chapters | 12 (`/guide/01-vision`…`/guide/12-funding`) |
| C-Level AI agents | 11 (CEO / CTO / CFO / CMO / CPO / CRO / CLO / CHRO / CISO / COO / CDO) |
| SVI dimensions | 8 (FTV / MPC / PTD / TRE / CGH / IRI / LCO / SVM) |
| Investor pack chapters | 9 (Cover · Exec Summary · SVI Criteria · Cap Table · Traction · C-Level Financial Advisory · Forecast · Exit Strategy · Evidence Completeness) |
| Public pricing rungs | 3 (Free / Growth A$99/mo / Pro A$299/mo) + Contact Sales row |

## Runtime topology

```
                     ┌──────────────────────┐
                     │   blockid.au (web)   │  bare-metal node @ port 4001
                     │   Next 16 standalone │  /data/releases/<id>/server.js
                     │   webpack build      │  systemd watchdog restart */2min
                     └────────┬─────────────┘
                              │
        ┌────────┬────────────┼────────────┬─────────────┐
        │        │            │            │             │
  ┌─────▼────┐  ┌▼─────────┐ ┌▼──────────┐ ┌▼───────────┐ ┌▼──────────────┐
  │ Supabase │  │  Redis   │ │  Anvil    │ │ Otterscan  │ │ AI providers  │
  │  :8000   │  │  :6379   │ │  :8545    │ │  :5173     │ │ (registry)    │
  │ 24 mig.  │  │ rate-lim │ │ EVM 420   │ │ explorer   │ │ 47 models     │
  └──────────┘  └──────────┘ └───────────┘ └────────────┘ └───────────────┘
```

- **Blockchain (current):** private EVM via **Anvil chainId 420** + **Otterscan** explorer at `:5173` — off-chain-first vesting with optional on-chain sync.
- **Blockchain (long-term roadmap):** Cosmos SDK / Tendermint chain for jurisdictional data residency — `chain/` scaffolding retained for future testnet. **Not the current implementation.**

## Deploy

- Bare-metal `web/scripts/deploy-live.sh` (12 gates: tsc, unit, e2e smoke, redirect map, hydrated post-deploy smoke, etc.).
- **No Docker, no GitLab CI, no GitHub Actions in production.** Server IS production.
- Origin remote is GitHub `Blockid-au/blockid.au`; public reverse proxy = system nginx.

---

## Historical: Microservices strangler-fig plan (not shipped)

_The section below is the original 2026-05 microservices split proposal. It remains as historical context — the shipped platform kept the Next.js monolith at `web/` with the extra services below **not** carved out._

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

---

## Version History

### v2.1.0 — 2026-06-14 (T0097 Implementation)

**New: ESOP Manager System**

- `/dashboard/esop` — Full ESOP Manager page (pool status, grant management)
- `/api/esop/pool` — GET/POST ESOP pool for account
- `/api/esop/grants` — GET/POST ESOP grants
- `/api/esop/grants/[id]` — GET/PATCH individual grant
- `components/esop/` — UI component library:
  - `EsopPoolStatus` — Pool summary card with allocation progress
  - `EsopGrantsTable` — Grants listing with vesting progress
  - `EsopGrantForm` — 3-step grant creation wizard
- Database tables: `esop_pools`, `esop_grants`, `esop_vesting_events`, `esop_exercises`
- Nav: "ESOP Manager" added to Fundraise group in WorkspaceLayout

**Features Completed (T0094–T0097):**
- ESOP Design: 12% pool, 4yr/1yr cliff, AU ESS Part 7A compliant
- Legal Templates: ESOP Plan Deed, Offer Letter, Founder Vesting Deed
- Technical Spec: Database schema + API endpoints + vesting engine
- UI Implementation: Pool status, grant form, grants table, dashboard

**C-Level Agent Knowledge Base (T0101):**
- Knowledge base modules injected into all 11 C-Level agents
- ESOP, valuation, data room, SVI scoring expertise
- BlockID.au self-analysis: SVI 68/100, A$440K pre-money valuation
- Location: `/blockid.au/.claude/knowledge-base/`

**SVI Analysis (T0098):**
- BlockID.au SVI: 68/100 (near investor-ready threshold 70)
- Target: 85+ SVI by Antler pitch (July 2026)
- Valuation: A$440K pre-money (conservative case)

**Next Milestones:**
- [ ] ESOP legal sign-off (founder + lawyer by June 30)
- [ ] Data room 70% complete for Antler pitch
- [ ] First paid customer (Founding 50 campaign)
- [ ] SVI upgrade: 75+ by August 2026
