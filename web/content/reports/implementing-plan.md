# Implementing Plan — BlockID.au

**Version:** v3.9.0  ·  **Updated:** 2026-09-05T12:04:03.149Z  ·  **Decided by:** ceo (2026-09-05T12:04:03.149Z)

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
| T0169 | CFO | Integrate Australian R&D Tax Incentive data into the Multi-Method Valuation Engine | minor | ⬜ pending |
| T0170 | CRO | Implement Funding Readiness Scoring (CAPITAL framework) with automated recommendations | minor | ⬜ pending |
| T0171 | RND | Add a new AI insight provider (e.g., GPT‑4o) to the AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0172 | CFO | Integrate VC valuation methods and sector ARR/revenue multiples into the Multi-Method Valuation Engine | minor | ⬜ pending |
| T0173 | CRO | Develop and integrate the Next-Best-Action/DIRECTION engine to sequence founder actions by weakest SCN layer and stage | minor | ⬜ pending |
| T0174 | RND | Integrate new AI tools and capabilities for founder narrative generation and startup ecosystem analysis | minor | ⬜ pending |
| T0176 | CRO | Implement Pricing Psychology Engine for subscription tier optimization | minor | ⬜ pending |
| T0177 | RND | Deploy Founder Pain‑Point Insight Service (API) | minor | ⬜ pending |
| T0179 | CFO | Build Financial Projection Norms Library (Rule of 40, LTV/CAC) | minor | ⬜ pending |
| T0181 | CFO | Implement Financial Projection Norms Library (Rule of 40, LTV/CAC) | minor | ⬜ pending |
| T0182 | CRO | Develop Next-Best-Action/DIRECTION engine for SCN layer sequencing | major | ⬜ pending |
| T0183 | CISO | Integrate ACSC Essential Eight Compliance Scanner | minor | ⬜ pending |
| T0184 | RND | Deploy Founder Pain-Point Insight Service (API) | minor | ⬜ pending |
| T0185 | CFO | Implement AU R&D Tax Incentive & ESIC logic into Valuation Engine | minor | ⬜ pending |
| T0186 | CRO | Implement DIRECTION engine for SCN layer sequencing | major | ⬜ pending |
| T0187 | RND | Deploy Founder Pain-Point Insight API | minor | ⬜ pending |
| T0188 | CFO | Implement Multi-Method Valuation Engine with AU-Specific Logic | minor | ⬜ pending |
| T0189 | CRO | Develop DIRECTION Engine for SCN Layer Sequencing | major | ⬜ pending |
| T0190 | CLO | Integrate Privacy Act and ASIC Guidance Compliance Module | minor | ⬜ pending |
| T0191 | CFO | Build Multi-Method Valuation Engine with AU-Specific Logic | minor | ⬜ pending |
| T0192 | CMO | Implement Startup Percentile/Positioning Model | minor | ⬜ pending |
| T0194 | CRO | Implement Funding Readiness Scoring (CAPITAL framework) | minor | ⬜ pending |
| T0198 | CFO | Integrate AU R&D Tax Incentive & ESIC logic into Valuation Engine | minor | ⬜ pending |
| T0199 | RND | Add GPT-4o to AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0202 | CMO | AU Startup Ecosystem Analysis | major | ⬜ pending |
| T0203 | CTO | First-Principles Redesign | minor | ⬜ pending |
| T0204 | CLO | SCN Report + PDF Redesign | major | ⬜ pending |

## Recently shipped
- ✅ `T0193` **CFO** — Build Top-Down/Bottom-Up TAM/SAM/SOM Calculator (`557222041`)
- ✅ `T0180` **CFO** — Implement Cap Table Dilution & Round Sizing Simulator (`a4aa14f01`)
- ✅ `T0178` **CFO** — Implement Top-Down/Bottom-Up TAM/SAM/SOM Calculator (`557222041`)
- ✅ `T0175` **CMO** — Create Competitor Feature Release Tracker module (`cdfc4bf3a`)
- ✅ `T0167` **CFO** — Sector-Specific Revenue Multiple Library (`abb12f4c6`)
- ✅ `T0236` **RND** — T0111 AI Idea Lab — sector-aware angle generator
- ✅ `T0235` **CDO** — Fix /api/index/svi?format=csv — emit header row when snapshot empty
- ✅ `T0234` **CPO** — Fix first-principles secondaryFeatures — always returns 2+ items
- ✅ `T0233` **OPS** — Wire cron for svi-index-populate + email-drip + hygiene
- ✅ `T0232` **CPO** — Wire hero to live analyzer + per-project SVI page

## Milestones
- **M020** v3.9.0 — CFO: Implement Top-Down/Bottom-Up TAM/SAM/SOM Calculator; CFO: Build Top-Down/Bottom-Up TAM/SAM/SOM Calculator (2026-08-31, 2 tasks)
- **M019** v3.8.1 — CFO: Sector-Specific Revenue Multiple Library (2026-08-30, 1 tasks)
- **M018** v3.8.0 — CFO: Implement Cap Table Dilution & Round Sizing Simulator (2026-08-29, 1 tasks)
- **M017** v3.7.0 — CMO: Create Competitor Feature Release Tracker module (2026-08-28, 1 tasks)
- **M016** v3.1.0 — CFO: Implement R&D Tax Incentive & ESIC Valuation Modifier (2026-07-22, 1 tasks)
- **M015** v3.0.0 — RND: Evidence Vault Phase 2 — OAuth connectors (GitHub, Stripe, Google Analytics); CLO: Term Sheet AI v2 — persist analyses, Lawyer Questions, SVI link; CFO: Fundraising Readiness Report v2 — checklis (2026-07-20, 9 tasks)
- **M014** v2.7.0 — CFO: R&D Tax Incentive and ESIC data integration (2026-07-19, 1 tasks)
- **M013** v2.6.0 — CFO: Integrate sector ARR/revenue multiples for valuation benchmarking (2026-07-18, 1 tasks)
- **M020** v2.2.0 — T0102-T0110 Batch 9: ESOP scoring engine, governance API, knowledge base API, SVI roadmap widget, ESOP checklist SEO tool, data room readiness API (2026-06-14, 7 tasks)
- **M019** v2.1.0 — T0094–T0101 ESOP + SVI + Data Room + Knowledge Base — investor-ready documents, ESOP Manager UI live (2026-06-14, 8 tasks)
- **M018** v2.0.0 — Feature Batch 8 (T0086–T0090): Financial Projection Norms calculator, Term Sheet AI v2 persistence, Fundraising Report v2, Google Analytics evidence connector, SVI Cohort Benchmark page (2026-06-13, 6 tasks)
- **M017** v1.9.0 — T0084 — C-Level blended valuation engine + BlockID self-analysis financial model (2026-06-13, 1 tasks)
