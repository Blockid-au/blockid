# Vesting & Dynamic Share Structure System

## Mission
Build a comprehensive vesting and dynamic share allocation system that enables startups on BlockID to manage equity distribution, monthly vesting schedules, and share valuation — all integrated with SVI scoring and AI-powered recommendations.

## Core Principles

1. **Founder-First**: Founder starts at 100% by default; every addition dilutes proportionally
2. **AI-Assisted**: "Use our AI Agent" button for optimal suggestions (credit-charged)
3. **SVI-Linked**: Share count/price grows with SVI score and evidence input
4. **Monthly Vesting**: Linear vesting with configurable cliff, per-startup overrides
5. **Blockchain-Ready**: On-chain vesting contracts sync with off-chain records

---

## System Overview

### Initial Setup Flow
```
Founder (100%) → Add Co-founders → Add Advisors → Set ESOP Pool
                     ↓                    ↓              ↓
              AI suggests split    AI suggests terms   AI suggests %
              (1.00 credit)        (0.50 credit)       (0.50 credit)
```

### Dynamic Valuation Modes
| Mode | Description | Best For |
|------|-------------|----------|
| Fixed Shares | Total authorized constant (10M), price floats with SVI | Pre-seed → Seed |
| Dynamic Shares | Price fixed at nominal ($0.001), shares increase with SVI | Growth → Scale |

### Role-Based Vesting Defaults
| Role | Vesting | Cliff | Type | Acceleration |
|------|---------|-------|------|--------------|
| Founder | 48 months | 12 months | Linear | Double-trigger |
| Co-founder | 48 months | 12 months | Linear | Double-trigger |
| Advisor | 24 months | 3 months | Linear | None |
| Employee/ESOP | 48 months | 12 months | Linear | Double-trigger |
| Investor | 0 (immediate) | 0 | N/A | N/A |

### SVI → Share Price Formula
```
valuation_aud = computeValuation(sviScore, stage, metrics).midAud
price_per_share = valuation_aud / authorized_shares   [Fixed mode]
authorized_shares = valuation_aud / nominal_price      [Dynamic mode]
```

---

## Credit Pricing for AI Features

| Feature | Credits | Description |
|---------|---------|-------------|
| vesting_setup | 0 | Free — basic manual vesting configuration |
| vesting_compute | 0 | Free — schedule preview/compute |
| ai_equity_split | 1.00 | AI optimal equity split suggestion |
| ai_vesting_schedule | 0.50 | AI vesting schedule per role |
| ai_share_structure | 0.75 | AI share structure mode recommendation |
| ai_esop_pool | 0.50 | AI ESOP pool size suggestion |
| ai_vesting_review | 1.50 | Comprehensive vesting/equity review |

**Rationale**: Basic setup free (drives CGH score improvement → engagement loop). AI features paid (require Claude API, deliver high-value personalized advice).

---

## Database Schema (New Tables)

### `vesting_schedules`
Per-shareholder vesting grant (supports multiple grants per holder):
- `total_shares`, `vesting_months`, `cliff_months`, `vesting_start`
- `vesting_type`: linear | back_weighted | front_weighted | milestone
- `vested_shares`, `vested_pct`, `next_vest_date`
- `single_trigger_acceleration`, `double_trigger_acceleration`
- `milestone_triggers` (JSONB array)
- `status`: active | paused | completed | revoked

### `vesting_events`
Immutable audit log:
- `event_type`: vest | cliff_passed | accelerate | revoke | pause | resume
- `shares_vested`, `cumulative_vested`, `cumulative_pct`
- `trigger_type`: scheduled | milestone | coc_single | coc_double | manual

### `share_structure_config`
Per-company configuration:
- `mode`: fixed_shares | dynamic_shares
- `nominal_price_per_share`, `authorized_shares`, `shares_per_svi_point`
- `last_svi_score`, `last_valuation_aud`, `last_price_per_share`
- `ai_recommended_mode`, `ai_recommendation_reason`

### `vesting_defaults`
Per-company role-based overrides:
- `role`, `vesting_months`, `cliff_months`, `vesting_type`, `double_trigger`

### `ai_equity_recommendations`
Stored AI suggestions:
- `recommendation_type`, `input_data`, `recommendation` (JSONB)
- `credits_charged`, `svi_score`, `svi_stage`, `valuation_aud`
- `accepted`, `accepted_at`

---

## API Endpoints

### Vesting Management
- `GET /api/vesting` — All schedules with computed current state
- `POST /api/vesting` — Create schedule + auto-evidence + optional blockchain sync
- `PUT /api/vesting/[id]` — Update (pause/resume/revoke)
- `POST /api/vesting/[id]/accelerate` — Process acceleration trigger
- `POST /api/vesting/compute` — Pure preview (no DB write)

### Share Structure
- `GET /api/share-structure` — Current config + computed prices
- `POST /api/share-structure` — Create/update config
- `POST /api/share-structure/recompute` — Refresh from latest SVI

### AI Recommendations (credit-charged)
- `POST /api/ai/equity-split` — 1.00 credit
- `POST /api/ai/vesting-schedule` — 0.50 credit
- `POST /api/ai/share-structure` — 0.75 credit
- `POST /api/ai/esop-pool` — 0.50 credit
- `POST /api/ai/vesting-review` — 1.50 credit

### Cron
- `GET /api/cron/vesting-process` — Daily vesting computation + event logging

---

## UI Components

### Equity Setup Wizard (6 steps)
1. Founder starts at 100%
2. Add stakeholders (live dilution pie chart)
3. Configure vesting (AI suggest button)
4. ESOP setup (AI suggest button)
5. Share structure mode selection (AI suggest button)
6. Review + optional blockchain deployment

### Vesting Dashboard
- Overview cards (total vested/unvested, next vest date)
- Per-shareholder vesting progress bars
- Monthly timeline chart (stacked area)
- Event log (chronological history)
- Acceleration trigger buttons

### AI Recommendation Modals
- Contribution analysis breakdown
- Suggested split with rationale
- Benchmark comparison ("Top 25% of AU seed startups...")
- Accept/modify/dismiss actions

---

## Integration Points

| System | Integration |
|--------|-------------|
| SVI Engine | CGH dimension +15pts when vesting configured; auto-evidence creation |
| Valuation | `computeValuation()` feeds share price calculation |
| Credit System | `canAfford()`/`spendCredits()` for AI features |
| Blockchain | `grantVesting()`/`revokeVesting()` sync via wallet.ts |
| Cap Table | Vesting schedules link to shareholders table |
| Evidence | Auto-insert `svi_evidence` when vesting created |
| Notifications | Email on cliff passed, monthly vest, acceleration |

---

## Implementation Phases

| Phase | Weeks | Owner | Deliverables |
|-------|-------|-------|--------------|
| 1. Core DB + Compute | W1-2 | CTO | Migration, vesting.ts, API endpoints |
| 2. Share Structure + SVI | W2-3 | CTO + CPO | share-structure.ts, SVI integration, cron |
| 3. Setup Flow UI | W3-4 | CPO + CTO | Equity wizard, dashboard, charts |
| 4. AI Recommendations | W4-5 | CTO + CFO | ai-equity.ts, 5 AI endpoints, credit gates |
| 5. Blockchain Sync | W5-6 | Blockchain Expert | On-chain vesting, MetaMask flow |
| 6. Polish + QA | W6-7 | COO + QA | E2E tests, notifications, PDF export |

---

## Success Criteria

- [ ] Founder can set up full equity structure in <5 minutes
- [ ] AI suggestions accepted >60% of the time
- [ ] CGH dimension score improves by +15 when vesting configured
- [ ] Monthly vesting processes automatically via cron
- [ ] Blockchain vesting syncs within 30s of DB creation
- [ ] All AI features properly charge credits
- [ ] Vesting acceleration handles CoC + milestone triggers
- [ ] Share price auto-updates when SVI changes by >5 points

---

## C-Level Ownership

| Agent | Responsibility |
|-------|---------------|
| **CTO** | Database schema, API endpoints, vesting compute engine, AI integration |
| **CPO** | UX flows, setup wizard, dashboard design, user testing |
| **CFO** | Credit pricing, unit economics, revenue projections |
| **COO** | Sprint planning, QA, deployment, cron monitoring |
| **CRO** | Conversion optimization, AI feature adoption, upsell flows |
| **Blockchain Expert** | Smart contract vesting, MetaMask integration, on-chain sync |

## Sub-Goals
- `goals/sub-vesting-cto.md` — Technical implementation
- `goals/sub-vesting-cpo.md` — Product & UX design
- `goals/sub-vesting-cfo.md` — Pricing & economics
- `goals/sub-vesting-coo.md` — Sprint execution & QA
- `goals/sub-vesting-cro.md` — Conversion & monetization
- `goals/sub-vesting-blockchain.md` — On-chain sync & smart contracts