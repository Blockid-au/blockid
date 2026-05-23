# Goal: Modular Architecture — Independent Build & Deploy Per Module

## Problem
Current state: ONE Next.js monolith. Any change to any file requires full rebuild (90-120s Docker) and redeploy of entire system. This means:
- A CSS fix in pricing page → full AI engine rebuild
- A new cron job → full auth system rebuild
- An email template change → full SVI scoring rebuild
- Risk: any build failure blocks ALL features

## Target Architecture
Split into independent modules that can be built, deployed, and scaled independently.

```
┌─────────────────────────────────────────────────────────────────┐
│                    NGINX REVERSE PROXY                          │
│  blockid.au/* → routes to appropriate module                   │
└──────────┬──────────┬──────────┬──────────┬─────────────────────┘
           │          │          │          │
     ┌─────▼────┐ ┌───▼────┐ ┌──▼───┐ ┌───▼─────┐
     │  WEB APP │ │  API   │ │ CRON │ │ WORKERS │
     │ (Next.js)│ │(Routes)│ │(Jobs)│ │  (AI)   │
     │ Pages,UI │ │REST API│ │Sched.│ │ Reports │
     │ SSR,CSR  │ │ Auth   │ │Daily │ │ Emails  │
     └──────────┘ └────────┘ └──────┘ └─────────┘
           │          │          │          │
           └──────────┴──────────┴──────────┘
                          │
                   ┌──────▼──────┐
                   │  SUPABASE   │
                   │ (PostgreSQL)│
                   │  Shared DB  │
                   └─────────────┘
```

## Phase 1: Route Groups (NOW — No infrastructure change)

Split the Next.js app into logical route groups. This doesn't change deployment but improves maintainability and enables future splitting.

### Current Modules (by API route prefix)

| Module | Routes | Purpose | Can Be Independent? |
|--------|--------|---------|-------------------|
| **auth** | /api/auth/* (8 routes) | Authentication, sessions | Yes — standalone service |
| **svi** | /api/svi/* (14 routes) + /api/rnd/* (2) | SVI scoring, R&D reports | Yes — core product |
| **evidence** | /api/evidence/* (4 routes) | Evidence vault, analysis | Yes — data service |
| **equity** | /api/cap-table/*, /api/equity/*, /api/vesting/*, /api/share-structure, /api/dividends | Equity management | Yes — separate service |
| **billing** | /api/credits/*, /api/stripe/* (7 routes) | Payments, credits | Yes — billing service |
| **cron** | /api/cron/* (10 routes) | Scheduled jobs | Yes — worker service |
| **oauth** | /api/oauth/* (4 routes) | GitHub, LinkedIn connectors | Yes — integration service |
| **admin** | /api/admin/* (5 routes) | Admin panel | Yes — internal tool |
| **blockchain** | /api/blockchain/* (4 routes), /api/tokenization | Chain integration | Yes — separate service |
| **content** | /api/journal/*, /api/lead, /api/contact | Content & CRM | Yes — content service |

### Shared Libraries (used across modules)

| Library | Used By | Can Be Shared Package? |
|---------|---------|----------------------|
| `lib/auth.ts` | ALL modules | Yes — `@blockid/auth` |
| `lib/supabase.ts` | ALL modules | Yes — `@blockid/db` |
| `lib/credits.ts` | svi, evidence, billing | Yes — `@blockid/credits` |
| `lib/ai-client.ts` | svi, evidence, cron | Yes — `@blockid/ai` |
| `lib/svi-analysis.ts` | svi, evidence | Yes — `@blockid/svi` |
| `lib/email.ts` | auth, cron, svi | Yes — `@blockid/email` |

## Phase 2: API Route Isolation (Next Sprint)

### Step 1: Isolate heavy modules into separate Docker containers

Priority order (by build impact):

**Container 1: blockid-web** (Pages + Light API)
- All pages (SSR/CSR)
- Auth API routes
- Credits API
- Admin API
- Light/fast routes
- Build time: ~40s (reduced from 90s)

**Container 2: blockid-ai** (AI-Heavy Routes)
- /api/rnd/* (SSE streaming, AI calls)
- /api/svi/* (scoring, reports)
- /api/evidence/analyze
- /api/website-tech-audit
- AI client + all AI provider integrations
- Build time: ~30s
- Can scale independently (more AI load → more containers)

**Container 3: blockid-cron** (Background Workers)
- /api/cron/* (10 cron jobs)
- Nurture emails
- Agent self-upgrade scheduler
- SVI snapshots
- Build time: ~20s
- Runs on schedule, no user-facing latency

**Container 4: blockid-equity** (Equity Engine)
- /api/cap-table/*
- /api/equity/*
- /api/vesting/*
- /api/blockchain/*
- Build time: ~20s
- Independent data model, minimal coupling

### Step 2: Shared packages via npm workspace

```
blockid.au/
├── packages/
│   ├── @blockid/auth/        — Session, user management
│   ├── @blockid/db/          — Supabase client, migrations
│   ├── @blockid/credits/     — Credit system, pricing
│   ├── @blockid/ai/          — AI client, provider chain
│   ├── @blockid/svi/         — SVI scoring engine
│   ├── @blockid/email/       — Email templates, delivery
│   └── @blockid/types/       — Shared TypeScript types
├── apps/
│   ├── web/                  — Next.js frontend + light API
│   ├── ai-service/           — AI routes (standalone)
│   ├── cron-worker/          — Cron jobs (standalone)
│   └── equity-engine/        — Equity management (standalone)
└── package.json              — npm workspace root
```

## Phase 3: Hot Module Replacement (Future)

For development: use Next.js Turbopack (already enabled) — only rebuilds changed modules.

For production: each container is independently deployable:
```bash
# Only rebuild AI service (30s instead of 90s)
bash scripts/deploy-module.sh ai-service

# Only rebuild cron worker
bash scripts/deploy-module.sh cron-worker

# Only rebuild web app
bash scripts/deploy-module.sh web
```

## Implementation Priority

### NOW (Phase 1 — Code Organization)
- [x] Create `src/modules/` directory (9 modules created) structure mirroring the module split
- [x] Move shared code to `src/lib/shared/` (barrel exports) with clear exports
- [x] Document module boundaries (README per module) in each module's README
- [ ] Ensure each module only imports from `shared/` or its own directory

### Next Sprint (Phase 2a — Cron Worker Extraction)
- [ ] Extract cron routes into standalone Express/Hono service
- [ ] Separate Dockerfile for cron worker
- [ ] Deploy as `blockid-cron` container
- [ ] Test: changing a cron job doesn't require full rebuild

### Following Sprint (Phase 2b — AI Service Extraction)
- [ ] Extract AI routes into standalone service
- [ ] Separate Dockerfile with AI-specific dependencies
- [ ] Deploy as `blockid-ai` container
- [ ] Test: AI model changes don't affect web frontend

### Q4 2026 (Phase 2c — Full Split)
- [ ] npm workspace setup with shared packages
- [ ] Per-module CI/CD pipelines
- [ ] Independent scaling (AI service: 2-3 replicas)
- [ ] Module-specific health checks and monitoring

## Agent Assignments

| Agent | Task | Priority |
|-------|------|----------|
| CTO | Architecture design, module boundaries | P0 |
| COO | Deploy pipeline per module | P1 |
| CISO | Security review of inter-module communication | P1 |
| CDO | Data flow documentation between modules | P2 |

## Immediate Win: Nginx Route-Based Splitting

Even without code changes, nginx can route different API paths to different containers:

```nginx
# Split heavy AI routes to dedicated container
location /api/rnd {
    proxy_pass http://blockid-ai:3001;
}
location /api/svi {
    proxy_pass http://blockid-ai:3001;
}
location /api/evidence/analyze {
    proxy_pass http://blockid-ai:3001;
}

# Cron routes to cron container
location /api/cron {
    proxy_pass http://blockid-cron:3002;
}

# Everything else to main web app
location / {
    proxy_pass http://blockid-web:3000;
}
```

This allows gradual migration without breaking anything.