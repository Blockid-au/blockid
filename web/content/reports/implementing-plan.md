# Implementing Plan — BlockID.au

**Version:** v3.1.0  ·  **Updated:** 2026-07-29T14:00:02.446Z  ·  **Decided by:** ceo (2026-07-25T12:04:02.737Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0102 | CMO | AU startup percentile/positioning model integration | minor | ⬜ pending |
| T0211 | CMO | LinkedIn page launch — Startup Value Index (linkedin.com/company/startup-value-index) | minor | ⬜ pending |
| T0213 | CPO | SVI brand landing page at startupvalueindex.com | minor | ⬜ pending |
| T0214 | CTO | AI provider chain audit — Codex subscription expired + ai-token-guardian Codex refresh broken | patch | ⬜ pending |
| T0216 | CTO | Fix orchestrator stageUpdateArtifacts — agent commit match closes pending tasks prematurely | patch | ⬜ pending |
| T0129 | CTO | Add Security Benchmark Compliance module (Essential Eight, OWASP) to CI pipeline with automated scans and reporting | minor | ⬜ pending |
| T0134 | CDO | Build 'Next-Best-Action' Analytics Engine | major | ⬜ pending |
| T0165 | CFO | Implement Multi-Method Valuation Engine | minor | ⬜ pending |
| T0166 | CFO | Build TAM/SAM/SOM Calculation Framework | minor | ⬜ pending |
| T0167 | CFO | Sector-Specific Revenue Multiple Library | patch | ⬜ pending |
| T0169 | CFO | Integrate Australian R&D Tax Incentive data into the Multi-Method Valuation Engine | minor | ⬜ pending |
| T0170 | CRO | Implement Funding Readiness Scoring (CAPITAL framework) with automated recommendations | minor | ⬜ pending |
| T0171 | RND | Add a new AI insight provider (e.g., GPT‑4o) to the AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0172 | CFO | Integrate VC valuation methods and sector ARR/revenue multiples into the Multi-Method Valuation Engine | minor | ⬜ pending |
| T0173 | CRO | Develop and integrate the Next-Best-Action/DIRECTION engine to sequence founder actions by weakest SCN layer and stage | minor | ⬜ pending |
| T0174 | RND | Integrate new AI tools and capabilities for founder narrative generation and startup ecosystem analysis | minor | ⬜ pending |
| T0175 | CMO | Create Competitor Feature Release Tracker module | minor | ⬜ pending |
| T0176 | CRO | Implement Pricing Psychology Engine for subscription tier optimization | minor | ⬜ pending |
| T0177 | RND | Deploy Founder Pain‑Point Insight Service (API) | minor | ⬜ pending |

## Recently shipped
- ✅ `T0236` **RND** — T0111 AI Idea Lab — sector-aware angle generator
- ✅ `T0235` **CDO** — Fix /api/index/svi?format=csv — emit header row when snapshot empty
- ✅ `T0234` **CPO** — Fix first-principles secondaryFeatures — always returns 2+ items
- ✅ `T0233` **OPS** — Wire cron for svi-index-populate + email-drip + hygiene
- ✅ `T0232` **CPO** — Wire hero to live analyzer + per-project SVI page
- ✅ `T0231` **CTO** — Perf audit + top 3 wins — image caching, /insights payload, version.json cache
- ✅ `T0230` **PRODUCT** — Simplify external funnel + plan-based workspace unlocks
- ✅ `T0229` **CMO** — 3 more SEO pillar articles — DCF/Berkus, cap table, SAFE
- ✅ `T0228` **OPS** — Fix /data/blockid-releases snapshot warning + backup verify
- ✅ `T0227` **OPS** — Daily pg_dump cron — /data/backups was empty (critical gap)

## Milestones
- **M016** v3.1.0 — CFO: Implement R&D Tax Incentive & ESIC Valuation Modifier (2026-07-22, 1 tasks)
- **M015** v3.0.0 — RND: Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics); CLO: Term Sheet AI v2 — persist analyses, Lawyer Questions, SVI link; CFO: Fundraising Readiness Report v2 — checklis (2026-07-20, 9 tasks)
- **M014** v2.7.0 — CFO: R&D Tax Incentive and ESIC data integration (2026-07-19, 1 tasks)
- **M013** v2.6.0 — CFO: Integrate sector ARR/revenue multiples for valuation benchmarking (2026-07-18, 1 tasks)
- **M020** v2.2.0 — T0102-T0110 Batch 9: ESOP scoring engine, governance API, knowledge base API, SVI roadmap widget, ESOP checklist SEO tool, data room readiness API (2026-06-14, 7 tasks)
- **M019** v2.1.0 — T0094–T0101 ESOP + SVI + Data Room + Knowledge Base — investor-ready documents, ESOP Manager UI live (2026-06-14, 8 tasks)
- **M018** v2.0.0 — Feature Batch 8 (T0086–T0090): Financial Projection Norms calculator, Term Sheet AI v2 persistence, Fundraising Report v2, Google Analytics evidence connector, SVI Cohort Benchmark page (2026-06-13, 6 tasks)
- **M017** v1.9.0 — T0084 — C-Level blended valuation engine + BlockID self-analysis financial model (2026-06-13, 1 tasks)
- **M016** v1.8.0 — T0075–T0083 — Onboarding flow, score confidence, SAFE calculator, investor email, GitHub evidence, /tools hub, SVI history, SEO content, AU comparables (2026-06-13, 9 tasks)
- **M007** v0.8.0 — Founding 50 conversion prompt (T0017) — UpgradePrompt banner in workspace when balance===1, CTA to founding50 checkout (2026-06-13, 1 tasks)
- **M006** v0.7.0 — Article pipeline fixed (T0015): 38 articles live, cron-runner auto-sync. T0011/T0013/T0014 verified done. Full self-analysis report generated. New tasks: T0016 (Evidence Vault), T0017 (Founding 50 conversion). (2026-06-13, 4 tasks)
- **M005** v0.6.0 — Berkus method 5th valuation for pre-revenue (T0010) + onboarding verified (T0012) + plan/agent sync (2026-06-13, 2 tasks)
