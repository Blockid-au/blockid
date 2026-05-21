# COO Sub-Goal: Vesting & Share Structure — Sprint Execution & QA

## Parent Goal
`goals/vesting-share-structure.md`

## Mission
Plan and execute the 6-phase vesting system delivery across 7 weeks, ensuring quality gates, test coverage, and smooth deployment at each phase.

---

## Sprint Allocation

### Sprint S2026-11 (Jun 2-13): Phase 1 — Core DB + Compute
| Day | Task | Owner | Status |
|-----|------|-------|--------|
| D1-2 | Migration 0032 + apply to staging | CTO | Pending |
| D2-3 | vesting.ts computation library + tests | CTO | Pending |
| D3-4 | share-structure.ts + tests | CTO | Pending |
| D4-5 | API endpoints: /api/vesting CRUD | CTO | Pending |
| D5-6 | API endpoints: /api/share-structure | CTO | Pending |
| D6-7 | Extend credits.ts with new costs | CTO | Pending |
| D7-8 | Integration tests for all endpoints | QA | Pending |
| D9 | Sprint review: demo vesting compute | All | Pending |
| D10 | Retrospective + Phase 2 planning | COO | Pending |

### Sprint S2026-12 (Jun 16-27): Phase 2 + Phase 3 Start
| Day | Task | Owner | Status |
|-----|------|-------|--------|
| D1-2 | SVI evidence auto-creation | CTO | Pending |
| D2-3 | Enhance extractSignals() for DB vesting | CTO | Pending |
| D3-4 | Vesting cron endpoint | CTO | Pending |
| D4-5 | Equity Setup Wizard (Steps 1-3) | CPO+CTO | Pending |
| D5-7 | Equity Setup Wizard (Steps 4-6) | CPO+CTO | Pending |
| D7-8 | Vesting Dashboard page | CPO+CTO | Pending |
| D8-9 | VestingProgressBar + TimelineChart | CPO | Pending |
| D9 | Sprint review: demo wizard + dashboard | All | Pending |
| D10 | Retrospective | COO | Pending |

### Sprint S2026-13 (Jun 30 - Jul 11): Phase 4 — AI Engine
| Day | Task | Owner | Status |
|-----|------|-------|--------|
| D1-2 | ai-equity.ts library + prompts | CTO | Pending |
| D2-3 | /api/ai/equity-split endpoint | CTO | Pending |
| D3-4 | /api/ai/vesting-schedule + share-structure | CTO | Pending |
| D4-5 | /api/ai/esop-pool + vesting-review | CTO | Pending |
| D5-6 | AI Recommendation Modals (UI) | CPO+CTO | Pending |
| D6-7 | Credit gate integration + testing | CTO | Pending |
| D7-8 | A/B test setup for pricing experiments | CRO | Pending |
| D9 | Sprint review: demo AI suggestions | All | Pending |
| D10 | Retrospective | COO | Pending |

### Sprint S2026-14 (Jul 14-25): Phase 5 + 6 — Blockchain + Polish
| Day | Task | Owner | Status |
|-----|------|-------|--------|
| D1-3 | Blockchain vesting sync (grant/revoke) | Blockchain | Pending |
| D3-4 | MetaMask flow for vesting deployment | Blockchain | Pending |
| D4-5 | Acceleration trigger processing | CTO | Pending |
| D5-6 | Email notifications (cliff, vest, complete) | CTO | Pending |
| D6-7 | E2E testing full flow | QA | Pending |
| D7-8 | Performance optimization + load testing | CTO | Pending |
| D8-9 | PDF export for vesting schedules | CTO | Pending |
| D9 | Sprint review: full E2E demo | All | Pending |
| D10 | Retrospective + launch checklist | COO | Pending |

---

## Quality Gates

### Per-Sprint Definition of Done
- [ ] All new code has TypeScript strict mode compliance
- [ ] Unit test coverage >80% for new libraries
- [ ] Integration tests pass for all new API endpoints
- [ ] No critical/high security issues (RLS tested)
- [ ] Responsive design verified on mobile/tablet
- [ ] Performance: LCP <1.5s, API p95 <300ms
- [ ] Code review completed by at least 1 other agent

### Pre-Launch Checklist (before Phase 6 deploy)
- [ ] Full E2E test: new user → equity setup → vesting → AI suggest → blockchain
- [ ] Load test: 100 concurrent vesting schedule creations
- [ ] Security audit: RLS policies, input validation, credit bypass prevention
- [ ] Cron reliability: run vesting-process 3 consecutive days without failure
- [ ] Error handling: graceful degradation when blockchain is unavailable
- [ ] Monitoring: alerts on cron failure, API errors, credit spending anomalies
- [ ] Documentation: API docs updated, user-facing help text in wizard

---

## Deployment Strategy

### Phase 1-2: Feature flag rollout
- Deploy behind `FEATURE_VESTING_V2` flag
- Enable for internal accounts first
- 48h internal testing before wider rollout

### Phase 3-4: Gradual rollout
- Enable for Founding 50 members
- Monitor error rates and performance
- If error rate >1% → pause rollout

### Phase 5-6: Full launch
- Remove feature flag
- Enable for all accounts
- Announce via in-app banner + email

---

## Monitoring & Alerting

### New Alerts to Configure
| Alert | Threshold | Channel |
|-------|-----------|---------|
| Vesting cron failure | Any failure | Slack #ops |
| API error rate (vesting) | >2% over 5min | Slack #ops |
| AI recommendation timeout | >10s response | Slack #ops |
| Credit spending anomaly | >5x normal rate | Slack #finance |
| Blockchain sync failure | Any failure | Slack #ops |

### Dashboards
- Vesting processing metrics (daily): schedules processed, events created, completions
- AI recommendation metrics: calls, latency, acceptance rate, revenue
- Feature adoption funnel: setup started → completed → AI used → blockchain deployed

---

## Cross-Team Dependencies

| Dependency | From | To | Blocker? |
|------------|------|-----|----------|
| DB migration approval | CTO | COO | Yes (Day 1) |
| Credit pricing finalized | CFO | CTO | Yes (before Phase 4) |
| UI mockups approved | CPO | CTO | Yes (before Phase 3) |
| Blockchain testnet ready | Blockchain | CTO | No (parallel) |
| Analytics events defined | CRO | CTO | No (can add later) |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Migration breaks existing cap table | Low | Critical | Test on staging clone first |
| AI prompts return unparseable JSON | Medium | Medium | Fallback to defaults, retry once |
| Cron misses a vest date | Low | High | Idempotent processing, catch-up logic |
| Blockchain unavailable during sync | Medium | Low | Async retry queue, DB is source of truth |
| Sprint velocity drops (7 weeks tight) | Medium | Medium | Cut Phase 5 if needed (blockchain can follow) |

---

## Skills Used
- `/coo` — Sprint planning, cross-team coordination
- `/deploy` — Feature flag deployment, staged rollout
- `/qa` — Test coverage enforcement, E2E testing

## Success Metrics
- [ ] All 4 sprints achieve >80% completion rate
- [ ] Zero P0/P1 bugs in production after launch
- [ ] Lead time from commit to staging <2h
- [ ] Cron processes all active schedules daily without failure for 30 days
- [ ] Feature adopted by >50% of cap table users within 30 days of launch