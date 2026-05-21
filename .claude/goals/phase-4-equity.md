# Phase 4: Equity & Cap Table — ACCELERATED (Q3-Q4 2026)

> **Note**: Vesting system has been accelerated into Phase 2-3 timeline due to strategic priority.
> See [Vesting & Dynamic Share Structure](vesting-share-structure.md) for the comprehensive plan.

## Goal: Persistent cap table with vesting, ESOP, AI-powered equity recommendations, and dynamic share valuation

### Sub-goal 4.1: Unified Cap Table Engine ✅ PARTIALLY BUILT
- [x] Persistent cap_tables table (versioned, audit trail) — `0029_cap_table.sql`
- [x] Workspace cap table page (/workspace/cap-table)
- [x] Workspace shareholders page (/workspace/shareholders)
- [ ] Tool-to-Workspace bridge ("Save to Workspace" on all tools)
- [x] Dilution scenario modeling — `cap-table.ts` computeDiff()
- [x] Cap table to SVI feed (auto-set hasCapTable, hasVesting signals)
- **Acceptance:** Cap table persists across sessions, feeds SVI

### Sub-goal 4.2: Vesting Schedule Manager ⚡ IN PROGRESS
- [x] Basic vesting fields in shareholder data (cliff, total, start)
- [ ] **First-class vesting_schedules table** (multi-grant per holder)
- [ ] **Monthly linear vesting compute engine** (4 types: linear, back/front weighted, milestone)
- [ ] **Vesting timeline visualization** (progress bar + stacked area chart)
- [ ] **Cliff alerts and milestone notifications**
- [ ] **Acceleration triggers** (single/double trigger, milestone-based)
- [ ] **Daily vesting cron** (process all active schedules)
- [ ] **AI vesting recommendations** (0.50 credit per suggestion)
- **Acceptance:** User can see real-time vesting progress, receive notifications, trigger acceleration
- **Details:** [sub-vesting-cto.md](sub-vesting-cto.md), [sub-vesting-cpo.md](sub-vesting-cpo.md)

### Sub-goal 4.3: ESOP Management ⚡ IN PROGRESS
- [x] ESOP pool configuration (total, granted, unallocated) — `esop_pool` table
- [ ] Individual grant tracking linked to vesting_schedules
- [x] ESOP dilution preview before granting
- [ ] **AI ESOP pool sizing recommendation** (0.50 credit)
- **Acceptance:** Full ESOP lifecycle managed with AI-assisted pool sizing

### Sub-goal 4.4: Dynamic Share Valuation (NEW)
- [ ] **Share structure config table** (fixed_shares vs dynamic_shares mode)
- [ ] **SVI-to-share-price formula** (valuation / authorized_shares)
- [ ] **Auto-recompute on SVI change** (>5 point delta triggers update)
- [ ] **AI share structure mode recommendation** (0.75 credit)
- [ ] **Share price history tracking** (sparkline on dashboard)
- **Acceptance:** Share price updates automatically as SVI improves
- **Details:** [sub-vesting-cto.md](sub-vesting-cto.md)

### Sub-goal 4.5: AI Equity Recommendations (NEW)
- [ ] **AI equity split suggestion** (1.00 credit) — Slicing Pie + benchmarks
- [ ] **AI comprehensive vesting review** (1.50 credit) — full audit
- [ ] **Recommendation storage** (ai_equity_recommendations table)
- [ ] **Accept/modify/dismiss flow** with one-click apply to cap table
- [ ] **Benchmark comparison** ("Top 25% of AU seed startups...")
- **Acceptance:** >60% acceptance rate on AI suggestions
- **Details:** [sub-vesting-cfo.md](sub-vesting-cfo.md), [sub-vesting-cro.md](sub-vesting-cro.md)

### Sub-goal 4.6: Equity Setup Wizard (NEW)
- [ ] **6-step progressive wizard** (founder 100% → add stakeholders → vesting → ESOP → shares → review)
- [ ] **Live dilution animation** (pie chart updates as user types)
- [ ] **AI Suggest buttons at every decision point** (credit-gated)
- [ ] **Deploy to Blockchain CTA** (optional MetaMask integration)
- **Acceptance:** Founder completes full equity setup in <5 minutes
- **Details:** [sub-vesting-cpo.md](sub-vesting-cpo.md)

### Sub-goal 4.7: Blockchain Vesting Sync (NEW)
- [ ] **VestingVault.sol** — Multi-grant smart contract
- [ ] **Off-chain → on-chain sync service** (<30s latency)
- [ ] **Claim flow** — Team members claim vested tokens via MetaMask
- [ ] **Acceleration on-chain** — CoC/milestone triggers
- **Acceptance:** On-chain state mirrors off-chain within 30s
- **Details:** [sub-vesting-blockchain.md](sub-vesting-blockchain.md)

---

## Implementation Timeline

| Phase | Sprint | Deliverables |
|-------|--------|--------------|
| 1. Core DB + Compute | S2026-11 | Migration, vesting.ts, API |
| 2. SVI + Share Structure | S2026-12 | SVI integration, cron, share pricing |
| 3. UI Setup Wizard | S2026-12 | Wizard, dashboard, charts |
| 4. AI Engine | S2026-13 | 5 AI endpoints, recommendation modals |
| 5. Blockchain | S2026-14 | VestingVault.sol, MetaMask flow |
| 6. Polish + QA | S2026-14 | E2E tests, notifications, PDF export |

## Credit Pricing Summary
| Feature | Credits | Free/Paid |
|---------|---------|-----------|
| Manual vesting setup | 0 | Free |
| AI equity split | 1.00 | Paid |
| AI vesting schedule | 0.50 | Paid |
| AI share structure | 0.75 | Paid |
| AI ESOP pool | 0.50 | Paid |
| AI vesting review | 1.50 | Paid |