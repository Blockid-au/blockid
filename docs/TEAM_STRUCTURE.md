# BlockID.au — Team Structure (AI-Augmented Solo Founder + Agent Fleet)

> Doc rev: 4.1 | Platform build: **v0.6.0 / web v3.3.2+** (2026-08-13)
> Roster source of truth: `web/content/team-roster.json` (11 active C-Level agents)
> Operating model: **1 human founder + autonomous agent fleet** (no employees yet; ESOP pool 12% reserved for first hires — see [`../ESOP_DESIGN.md`](../ESOP_DESIGN.md)).

BlockID.au runs as an **AI-augmented solo-founder organization**. Aus Dvl (founder, admin@blockid.au) is the sole human; every C-Level role is played by a specialised AI agent that runs its own research/build/report cron and reports to a CEO orchestrator agent. The founder reviews via Telegram + `/dashboard/admin` and gives strategic approvals; the fleet executes.

**Key implication:** headcount planning, salary benchmarks and ESOP-grant flows in `docs/TEAM_STRUCTURE.md` and the CHRO agent describe **future** hires. Today the company runs on cron loops, not people.

---

## Org Chart

```mermaid
graph TD
  Founder(["👤 Founder<br/>Aus Dvl<br/>Telegram + dashboards"])
  CEO["🎯 CEO Orchestrator<br/>ceo-orchestrator.ts<br/>routes strategic asks, owns roadmap"]

  Founder <-->|approvals · goals| CEO

  CEO --> COO["🛠️ COO<br/>ops · daily reports"]
  CEO --> CTO["⚙️ CTO<br/>platform · infra · NBA engine"]
  CEO --> CFO["💰 CFO<br/>valuation · projections · ESOP"]
  CEO --> CPO["🧭 CPO<br/>product · SCN journey · UX"]
  CEO --> CMO["📈 CMO<br/>growth · SEO · content pillars"]
  CEO --> CRO["🎯 CRO<br/>conversion · A/B · sales pipeline"]
  CEO --> CLO["⚖️ CLO<br/>ASIC · ESIC · R&D · term sheets"]
  CEO --> CHRO["👥 CHRO<br/>team · salary · ESOP admin"]
  CEO --> CISO["🛡️ CISO<br/>security · SOC2-lite · Essential Eight"]
  CEO --> CDO["📊 CDO<br/>data quality · cohort percentile"]
  CEO --> CS["🤝 Customer Success<br/>onboarding · NPS · churn"]

  CISO --> GUARDIAN["🔔 Guardian cron<br/>10-min health + auto-rollback"]
  COO --> QA["✅ QA<br/>vitest 20 011 tests · Playwright 11"]
  COO --> AUTODEPLOY["🚀 Auto-Deploy<br/>agent-deploy cron · 11-gate pipeline"]

  classDef leadership fill:#312e81,stroke:#818cf8,color:#eef2ff;
  classDef ops fill:#065f46,stroke:#34d399,color:#ecfdf5;
  classDef safety fill:#7c2d12,stroke:#fb923c,color:#fff7ed;
  class CEO,Founder leadership;
  class COO,CTO,CFO,CPO,CMO,CRO,CLO,CHRO,CDO,CS ops;
  class CISO,GUARDIAN,QA,AUTODEPLOY safety;
```

---

## C-Level Roster

| Role | Domain | Key files / tools | Reports to |
|------|--------|-------------------|-----------|
| **CEO** | Strategy + orchestration of all C-Level agents | `lib/agents/ceo-orchestrator.ts`, `.claude/goals/30day-validation-mvp.md` | Founder |
| **COO** | Operations + daily reporting template enforcement | `api/cron/clevel-daily-reports`, `dashboard/admin/30day` | CEO |
| **CTO** | Platform, infra, next-best-action engine | `lib/agents/cto-next-best-action.ts`, `lib/agents/cto-cost-modeling.ts` | CEO |
| **CFO** | Valuation engine, financial projections, ESOP scoring | `lib/agents/cfo-valuation.ts`, `lib/agents/cfo-projection-norms.ts`, `lib/agents/cfo-esop-scoring.ts`, `lib/agents/deep-valuation.ts` (v2.3), `lib/agents/scn-action-plan.ts` (v2.4) | CEO |
| **CMO** | Marketing benchmarks, content pillars, SEO insights | `lib/agents/cmo-market-research.ts`, content pillar tracker | CEO |
| **CPO** | Product/customer journey, SCN context detection | `lib/scn-detect.ts`, dashboards | CEO |
| **CDO** | Data quality, cohort benchmarks, percentile model | `lib/agents/cdo-data-quality.ts`, `lib/agents/cohort-percentile.ts` (v2.5) | CEO |
| **CISO** | Security posture, Essential Eight scanner | `lib/agents/ciso-security.ts`, daily security brief | CEO |
| **CLO** | Compliance (ASIC, ESS, ESIC, R&D Tax Incentive) | `lib/agents/clo-compliance.ts`, `lib/compliance-checker.ts`, term sheet AI | CEO |
| **CRO** | Conversion, A/B testing, sales pipeline | `lib/agents/cro-conversion.ts`, sales pipeline + NPS widget | CEO |
| **CHRO** | Team benchmarks, salary data, ESOP | `lib/agents/chro-team.ts`, `/dashboard/team` (v2.4) | CEO |
| **CSO** | Pricing strategy, A/B test infra | `lib/pricing-data.ts`, `platform-config.ts` | CEO |
| **R&D** | Tooling, experiments, evidence vault, AI providers | `lib/rnd-input.ts`, evidence-vault, AI client config | CEO |
| **IR** | Investor relations, accelerator deadlines | `/dashboard/accelerator` (v2.4), data room readiness | CEO |
| **QA** | Daily healthcheck, unit tests | `api/cron/agent-healthcheck`, vitest suite (109 tests) | COO |
| **Guardian** | Production monitor + auto-fix + Telegram alerts | `api/cron/agent-guardian` (10-min cron, 2h fail window) | CISO |

---

## v2.6 — Recently Shipped Modules + Owner

| Module | Path | Owner | Version |
|---|---|---|---|
| Maturity detector (established-company guard) | `lib/agents/maturity-detector.ts` | CDO + CFO | v2.5 |
| Real cohort percentile (svi_index_snapshots) | `lib/agents/cohort-percentile.ts` | CDO | v2.5 |
| SCN action plan generator (5-layer + 30/60/90) | `lib/agents/scn-action-plan.ts` | CFO + CPO | v2.4 |
| Deep valuation (4-lens triangulation) | `lib/agents/deep-valuation.ts` | CFO | v2.3 |
| Project name extractor | `lib/project-name-extractor.ts` | CPO | v2.3 |
| Admin drill-down detail pages | `app/dashboard/admin/detail/[metric]/page.tsx` | COO | v2.6 |
| SVI explainer card (radar + per-dim guide) | `components/dashboard/svi-explainer-card.tsx` | CPO + CFO | v2.6 |

---

## Reporting Cadence

| Cron | Endpoint / script | Frequency | Purpose |
|------|----------|-----------|---------|
| CEO orchestrator | `bash $RUN agent-orchestrator` | 12/14/16/18 UTC (8× daily total) | research → plan → upgrade → code → test → deploy → QA → fix → report |
| Daily C-Level briefs | `api/cron/clevel-daily-reports` | every 24h | Each C-Level posts an EOD report to `web/content/reports/<role>-daily-YYYY-MM-DD.md` |
| Guardian healthcheck | `api/cron/agent-guardian` | every 10 min | Resource + cron-fail watcher, 2h rolling window, auto-rollback triggers |
| Healthcheck | `api/cron/agent-healthcheck` | every 1h | TypeScript / lint / test / SSL / disk gates |
| Blockchain sync | `api/cron/blockchain-sync` | every 15 min | Skips log if no pending transaction (noop:true) |
| Auto-deploy | `api/cron/agent-deploy` | 12/14/16/18 UTC | Picks up shipped commits, runs bare-metal `web/scripts/deploy-live.sh` (9 gates) |
| Watchdog | `web/scripts/watchdog.sh` | every 2 min | Restarts Next standalone server if `/data/releases/<id>/server.js` dies |
| Uptime 24/7 guardian | `scripts/cron/uptime-24x7-guardian.sh` | every 2 min | External uptime probe + Telegram alert |
| AI-token guardian | `web/scripts/ai-token-guardian.sh` | every 30 min | Rotates / auto-discovers free model providers on rate-limit |
| Nightly self-upgrade | `web/scripts/self-upgrade-agent.sh` | 18:30 UTC | Auto-upgrade → check → fix → deploy → verify → report |

### Autonomous goal loops (long-running, self-terminating)

Each loop reads a goal file, picks the current frontier task, ships work, appends to a history JSONL, commits + pushes. Every loop has a **kill switch env** and **must self-disable when its goal plan is complete** (see memory `feedback_loops_stop_condition.md`).

| Loop | Cron | Goal doc | History log | Kill switch |
|------|------|----------|-------------|-------------|
| **Reseller module** (Track A + B wholesale) | every 5 min | `docs/plans/reseller-module-goal.md` | `web/content/reports/reseller-goal-history.jsonl` | `RESELLER_AUTONOMOUS_LOOP=off` |
| **Atlassian standard mapping** | 7,17,27,37,47,57 * * * * | `docs/plans/atlassian-standard-mapping-goal.md` | `web/content/reports/atlassian-goal-history.jsonl` | `ATLASSIAN_GOAL_LOOP=off` |
| **UX/IA startup flow** | offset every 10 min | `docs/plans/ux-ia-startup-flow-goal.md` | — | (comment cron line) |

Reseller channel also runs these support crons:
- Reseller commissions clearance — nightly 03:15 UTC
- Reseller Stripe promotion-code drift check — weekly Sun 03:30 UTC
- Reseller monthly reconciliation CSV — 1st of month 03:45 UTC
- Reseller monthly KPI report — 1st of month 04:00 UTC
- Reseller weekly digest — Mon 04:15 UTC
- Reseller manifest drift check — daily 04:30 UTC
- Reseller monitor (uptime) — every minute

---

## Founder Workflow

1. **Telegram chat** for strategic input → CEO orchestrator routes to the relevant C-Level agent
2. **Dashboards** at `blockid.au/dashboard/admin` for live KPI + drill-downs (v2.6)
3. **Roadmap + Architecture + Team** docs auto-updated on each minor version bump — canonical index at `/ROADMAP.md`
4. **Pricing / feature flags** in `platform-config.ts` — single source of truth, hot-swap via `/admin/config` (no redeploy)
5. **Deploy = bare-metal only** via `web/scripts/deploy-live.sh` (9-gate CI). Root `deploy.sh` is a docker wrapper that does NOT reach prod — see `HARDENING_LESSONS_2026-06-18.md`
6. **Multi-startup context** — every analysis / cron / report must include `startup_id`; one founder owns many startups

---

## Growth Plan (post-fundraise)

The ESOP pool exists so that when we hire, the fleet-to-human handoff is clean.

| Trigger | First hire | ESOP grant | Reference |
|---------|-----------|-----------|-----------|
| Post-Antler / pre-seed close | Senior full-stack engineer (T0097 ESOP UI + platform velocity) | 0.5–1.5% | `ESOP_DESIGN.md` §Allocation |
| A$10K MRR | GTM / founding customer-success | 0.25–0.75% | `ESOP_DESIGN.md` §Allocation |
| Series A (target Dec 2026) | CTO advisor → CTO, RevOps, 2 more eng | 1–2% each | `SVI_BLOCKID_ANALYSIS.md` §Recommendations |

Until then, the AI fleet + founder is the org.
