# Implementing Plan — BlockID.au

**Version:** v3.12.0  ·  **Updated:** 2026-09-11T16:00:02.024Z  ·  **Decided by:** ceo (2026-09-10T12:04:03.482Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
| T0254 | CMO | AU startup percentile/positioning model integration | minor | ⬜ pending |
| T0214 | CTO | AI provider chain audit — Codex subscription expired + ai-token-guardian Codex refresh broken | patch | ⬜ pending |
| T0216 | CTO | Fix orchestrator stageUpdateArtifacts — agent commit match closes pending tasks prematurely | patch | ⬜ pending |
| T0129 | CTO | Add Security Benchmark Compliance module (Essential Eight, OWASP) to CI pipeline with automated scans and reporting | minor | ⬜ pending |
| T0165 | CFO | Implement Multi-Method Valuation Engine | minor | ⬜ pending |
| T0166 | CFO | Build TAM/SAM/SOM Calculation Framework | minor | ⬜ pending |
| T0171 | RND | Add a new AI insight provider (e.g., GPT‑4o) to the AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0172 | CFO | Integrate VC valuation methods and sector ARR/revenue multiples into the Multi-Method Valuation Engine | minor | ⬜ pending |
| T0174 | RND | Integrate new AI tools and capabilities for founder narrative generation and startup ecosystem analysis | minor | ⬜ pending |
| T0177 | RND | Deploy Founder Pain‑Point Insight Service (API) | minor | ⬜ pending |
| T0179 | CFO | Build Financial Projection Norms Library (Rule of 40, LTV/CAC) | minor | ⬜ pending |
| T0181 | CFO | Implement Financial Projection Norms Library (Rule of 40, LTV/CAC) | minor | ⬜ pending |
| T0182 | CRO | Develop Next-Best-Action/DIRECTION engine for SCN layer sequencing | major | ⬜ pending |
| T0183 | CISO | Integrate ACSC Essential Eight Compliance Scanner | minor | ⬜ pending |
| T0184 | RND | Deploy Founder Pain-Point Insight Service (API) | minor | ⬜ pending |
| T0187 | RND | Deploy Founder Pain-Point Insight API | minor | ⬜ pending |
| T0188 | CFO | Implement Multi-Method Valuation Engine with AU-Specific Logic | minor | ⬜ pending |
| T0190 | CLO | Integrate Privacy Act and ASIC Guidance Compliance Module | minor | ⬜ pending |
| T0191 | CFO | Build Multi-Method Valuation Engine with AU-Specific Logic | minor | ⬜ pending |
| T0192 | CMO | Implement Startup Percentile/Positioning Model | minor | ⬜ pending |
| T0199 | RND | Add GPT-4o to AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0258 | CTO | First-Principles Redesign | minor | ⬜ pending |
| T0259 | CLO | SCN Report + PDF Redesign | major | ⬜ pending |
| T0260 | CRO | Implement VC Method Valuation & Pricing Strategy | minor | ⬜ pending |
| T0262 | CFO | Refine Startup Valuation Engine for PitchBook benchmark comparison | minor | ⬜ pending |
| T0263 | CRO | ACSC alerts integration | patch | ⬜ pending |
| T0265 | CRO | CISA alerts integration | patch | ⬜ pending |

## Recently shipped
- ✅ `T0275` **CLO** — S1 Compliance: one privacy policy (/legal/privacy canonical, /privacy 301), AI provider list = actual chain (groq/cerebras/sambanova/deepinfra/anthropic/openrouter/ollama), approved data sentence (no training claim either way), general-advice disclaimer on evaluator reports, doctoral-research sentence, PPL Food PTY LTD entity (`95b7033ef`)
- ✅ `T0274` **CMO** — S1/S4 Solutions + comparison: real /solutions/advisor (Firm A$149) + /for/advisor 301, /solutions/investor|accelerator rewrite (6 differentiators), /investors + /docs stale pricing copy removed, "BlockID vs ChatGPT vs a valuer" page (S4), evaluator messaging EN/VI, GA4 evaluator funnel, contact form reads ?plan= + Telegram (`448b17784`)
- ✅ `T0273` **CMO** — Evaluator Progress Radar digest: extend watchlist-digest to evaluator-owned projects, merge G11 Money Radar signals (grant deadlines, program intakes) for tracked startups (`25dd6b1b0`)
- ✅ `T0272` **CPO** — Program batch scoring: queue N startups off-peak, cohort table + CSV, sponsor/LP report export (extend /api/reports/quarterly), custom rubric weights
- ✅ `T0271` **CFO** — In-workspace Trust BizReport purchase for evaluators: POST /api/evaluations/[id]/report (3 credits or plan quota) + re-score A$1 + PDF/TBR token (`333219b1c`)
- ✅ `T0270` **CTO** — S3 Evaluations object: "Startups I am evaluating" — POST /api/evaluations (owner_kind evaluator, attribution, invite-the-founder magic link, consent tiers) + migrations for investor_portfolio, watchlist_digest, advisor_client_roster, engagement_notes, advisor_notes, advisor_portal, evaluations (`7cf6e564d`)
- ✅ `T0269` **CTO** — S1 Evaluator signup: account_type enum + DB CHECKs (investor, accelerator, incubator, advisor, service_provider→advisor segment), app_users.segment set from account_type, trial_days from plan, card-required 7-day Stripe trial on Scout/Firm/Program, trial-end-reminder copy fixed, evaluator TrialBanner copy (`dcd9e5603`)
- ✅ `T0268` **CRO** — S1 Evaluator ladder public: plans.csv flags → gate vocabulary (investor.dealflow, watchlist, portfolio, lp_export, advisor_portal, advisor.cohort, white_label, accelerator.cohort, lp_report, api.access), profiles 25/50/200, reports_per_month 10/30/100, public:true, 2-tab /pricing (Founder/Evaluator), A$5.50 SKU re-priced in place to A$3 Trust BizReport, tier-visibility snapshot regenerated (`af0e05644`)
- ✅ `T0251` **IR** — Growth extras: investor reverse-match (getDealFlow inverted), per-grant application_prompts drafts, quarterly expert analysis refresh (`59255c9a1`)
- ✅ `T0250` **CMO** — Hero one-liners: lib/marketing/hero-variants.ts (F1/F2/F3 arms) + GA4 hero_variant + hero-section + layout SITE_DESCRIPTION + messages hero.* (EN/VI) + 5-second test protocol (`f04879155`)

## Milestones
- **M022** v3.12.0 — CTO: Update Essential Eight Vulnerabilities to reflect ACSC alerts (2026-09-11, 1 tasks)
- **M021** v3.11.0 — CPO: /funding/report/[id] (cards, 12-month SVG Gantt, actions, disclaimers) + PDF + lib/dataroom/save-deliverable.ts + /workspace/funding + nav leaf validate.discover + recommender secondary money lan (2026-09-10, 9 tasks)
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
