# BlockID Startup Index — Strategic Vision

**Version:** v1.0 · **Date:** 2026-06-13 · **Owner:** CEO

---

## Vision

> **BlockID Startup Index (BSI)** — Australia's first real-time composite index of startup health, value and momentum. Like the ASX200 or Nikkei for public markets, but for private startups.

The index aggregates anonymised SVI scores from consenting founders into a sector-weighted composite that tracks the health of the Australian startup ecosystem in real time.

---

## Why this is a category-defining moat

| Moat | Mechanism |
|------|-----------|
| **Data network effect** | More founders → richer index → more value for each founder |
| **Media anchor** | "The BlockID Startup Index fell 3pts this quarter" becomes a press quote |
| **VC/LP signal** | Funds use BSI to benchmark portfolio health without revealing positions |
| **Government/CSIRO** | Grants body uses BSI to measure impact of policy on startup formation |
| **Recurring revenue** | API subscriptions for VC data teams, journalists, accelerators |

---

## Product phases

### Phase 1 — Data Foundation (Current → M020)
- Every SVI analysis contributes an anonymised data point to the index
- Store: `{sector, stage, svi_score, region, date}` — no PII
- Schema: `svi_index_snapshots` table in Supabase
- Target: 500 data points before public launch

### Phase 2 — Index Engine (M020 → M025)
- Compute BSI-AU composite: sector-weighted mean SVI score
- Sub-indices: BSI-SaaS, BSI-FinTech, BSI-DeepTech, BSI-Consumer
- Weekly publication via `/api/index/latest`
- Public dashboard: `blockid.au/index`

### Phase 3 — Market Product (M025 → M030)
- **API subscription**: A$299/mo for raw data feed (VCs, accelerators, media)
- **"Benchmark My Startup"**: compare your SVI against the index by sector/stage
- **Index Report**: quarterly PDF (PDF exported, paid A$29)
- **Press release**: partner with AFR, Startup Daily, Crunchbase AU for coverage

### Phase 4 — Index Authority (M030+)
- Annual "State of Australian Startups" report (free, gated by email)
- Government/university research partnerships
- International expansion: BSI-NZ, BSI-SG, BSI-IN

---

## Revenue model

| Product | Price | Target volume | ARR |
|---------|-------|---------------|-----|
| API subscription | A$299/mo | 10 VCs/funds | A$35K |
| Index quarterly report | A$29/download | 500/yr | A$15K |
| Benchmark My Startup (premium) | 5 credits | 200/mo | ~A$1K |
| Media/research licence | A$999/yr | 5 outlets | A$5K |
| **Year 1 target** | | | **A$56K ARR** |

---

## Data schema (Phase 1)

```sql
create table if not exists svi_index_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  sector text not null,        -- 'saas' | 'fintech' | 'deeptech' | 'consumer' | 'other'
  stage text not null,         -- 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'growth'
  region text not null,        -- 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'AU-other'
  svi_score integer not null,  -- 100-1000
  evidence_count integer,      -- number of evidence items attached
  has_revenue boolean,
  has_team boolean,
  week_number integer,         -- ISO week for aggregation
  year integer
);
-- RLS: insert-only for service role, no direct user reads (privacy)
alter table svi_index_snapshots enable row level security;
create policy "service_role_only" on svi_index_snapshots
  using (auth.role() = 'service_role');
```

---

## C-Level ownership

| Role | Responsibility |
|------|---------------|
| CEO | Index strategy, press, partnerships |
| CDO | Data pipeline, anonymisation, accuracy |
| CMO | Media outreach, AFR/Startup Daily, quarterly report |
| CTO | API endpoint, dashboard, schema migration |
| CFO | API subscription pricing, API billing via Stripe |

---

## Next actions (Task IDs)

- **T0055** (CTO): Supabase migration — `svi_index_snapshots` table
- **T0056** (CTO): Hook SVI analysis endpoint to write anonymised snapshot on every analysis run
- **T0057** (CEO): Draft "BlockID Startup Index" landing page copy for `/index`
- **T0058** (CMO): Reach out to 3 AU VC funds for beta data-feed partnership
