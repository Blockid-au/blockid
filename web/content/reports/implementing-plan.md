# Implementing Plan — BlockID.au

**Version:** v3.16.0  ·  **Updated:** 2026-09-19T23:57:37.926Z  ·  **Decided by:** ceo (2026-09-10T12:04:03.482Z)

> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.

## Active tasks
| ID | Agent | Task | Impact | Status |
|----|-------|------|--------|--------|
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
| T0199 | RND | Add GPT-4o to AI provider chain for founder narrative generation | minor | ⬜ pending |
| T0258 | CTO | First-Principles Redesign | minor | ⬜ pending |
| T0259 | CLO | SCN Report + PDF Redesign | major | ⬜ pending |
| T0260 | CRO | Implement VC Method Valuation & Pricing Strategy | minor | ⬜ pending |
| T0262 | CFO | Refine Startup Valuation Engine for PitchBook benchmark comparison | minor | ⬜ pending |
| T0277 | CFO | G14 Wave A · Pricing ladder v4 (evaluator-first): plans.csv +investor_fund A$999 / accelerator_intake A$249 / index_api A$299, Cohort 25/100 public + real usage_limits, plans-v2.ts + tier-ladder + signup allow-list, stripe.ts keys + .env.example 6 vars, seed-stripe tax_behavior inclusive, sync-stripe-pricing rows, migration 0400_sync_plan_rows_v4.sql, pricing page 3rd tab programs + FAQ + ContactSalesRow, v3-skus dead ladder deleted, credit = A$1 list, docs/pricing-upgrade-plan-2026-07-16.md § v4 | minor | ⬜ pending |
| T0278 | COO | G14 S33 · Traction snapshot + GA4 truth + investor update: lib/traction/snapshot.ts (Zod, excludes qa-*/erased), cron /api/cron/traction-snapshot → content/reports/traction-snapshot.json + traction-history.jsonl, admin/traction tile, /api/status.traction, web/scripts/investor-update.mjs, 8 money events emitted server-side (trust_report_purchased, funding_report_paid, evaluator_trial_started, subscription_created, tbr_share_created, dossier_view, assessment_submitted, feedback_letter_opened) + GA4_AUDIT_EVENTS, /api/platform-stats reads snapshot, crontab + docs/ops/crontab-setup.md | minor | ⬜ pending |

## Recently shipped
- ✅ `T0280` **CMO** — G14 GTM · 10 evaluator interviews in 30 days (4 angel screening-committee, 4 program managers, 2 R&DTI/ESIC advisors) on the 8-question instrument docs/research/evaluator-interviews-2026-09.md; anonymised records + rollup (WTP, budget owner, current spend, top pain, quote approvals); pilot offer v2 outreach (free cohort scoring, admin credit grant, cap 5) per 01-gtm-evaluators-90d.md; D30/D60/D90 metrics read from the S33 snapshot (`edce34a30`)
- ✅ `T0279` **COO** — G14 docs merge (opened 2026-09-16): goal doc docs/plans/g14-investor-feedback-2026-09-16.md + companion folder (01-gtm-evaluators-90d.md, README), docs/research/evaluator-interviews-2026-09.md, t2-accelerator-pilots.md pilot offer v2, SOT rev.319 (§ G14, register G14-S33…S40, G12 pricing-v4 pointer, §5 human-blocked, change-log), ROADMAP Phase 3.3, GOALS Phase 5, roadmap-v2 Q4 G14 block, unicorn-masterplan Pre-Seed row (3 buckets, pre-money A$2.5–4.0M)
- ✅ `T0276` **IR** — G14 Wave A · Deck v3 "Startup Value Index" (evaluator-first, pre-seed A$500K): web/content/pitch/pitch-deck-v3.md (12 slides + 3-minute cut + provenance), web/scripts/generate-pitch-deck-v3.ts → PPTX + appendix + HTML preview, generate-pitch-deck-v3.test.ts (speakability, provenance, forbidden words), SUPERSEDED banners on deck v1 / pitch-deck-v2-investor.md / video-assets slides, executive-summary.md rewrite, 00-pitch-feedback.md (19 verbatim comments + traceability) (`edce34a30`)
- ✅ `T0275` **CLO** — S1 Compliance: one privacy policy (/legal/privacy canonical, /privacy 301), AI provider list = actual chain (groq/cerebras/sambanova/deepinfra/anthropic/openrouter/ollama), approved data sentence (no training claim either way), general-advice disclaimer on evaluator reports, doctoral-research sentence, PPL Food PTY LTD entity (`95b7033ef`)
- ✅ `T0274` **CMO** — S1/S4 Solutions + comparison: real /solutions/advisor (Firm A$149) + /for/advisor 301, /solutions/investor|accelerator rewrite (6 differentiators), /investors + /docs stale pricing copy removed, "BlockID vs ChatGPT vs a valuer" page (S4), evaluator messaging EN/VI, GA4 evaluator funnel, contact form reads ?plan= + Telegram (`448b17784`)
- ✅ `T0273` **CMO** — Evaluator Progress Radar digest: extend watchlist-digest to evaluator-owned projects, merge G11 Money Radar signals (grant deadlines, program intakes) for tracked startups (`25dd6b1b0`)
- ✅ `T0272` **CPO** — Program batch scoring: queue N startups off-peak, cohort table + CSV, sponsor/LP report export (extend /api/reports/quarterly), custom rubric weights
- ✅ `T0271` **CFO** — In-workspace Trust BizReport purchase for evaluators: POST /api/evaluations/[id]/report (3 credits or plan quota) + re-score A$1 + PDF/TBR token (`333219b1c`)
- ✅ `T0270` **CTO** — S3 Evaluations object: "Startups I am evaluating" — POST /api/evaluations (owner_kind evaluator, attribution, invite-the-founder magic link, consent tiers) + migrations for investor_portfolio, watchlist_digest, advisor_client_roster, engagement_notes, advisor_notes, advisor_portal, evaluations (`7cf6e564d`)
- ✅ `T0269` **CTO** — S1 Evaluator signup: account_type enum + DB CHECKs (investor, accelerator, incubator, advisor, service_provider→advisor segment), app_users.segment set from account_type, trial_days from plan, card-required 7-day Stripe trial on Scout/Firm/Program, trial-end-reminder copy fixed, evaluator TrialBanner copy (`dcd9e5603`)

## Milestones
- **M030** v3.16.0 — G15 Reliability + G16 First dollar + G17 Unicorn homepage + G18 truth sweep (founder-led sessions, 2026-09-18 → 19) (2026-09-19, 0 tasks)
- **M029** v3.15.0 — CMO: Implement Startup Percentile/Positioning Model (2026-09-19, 1 tasks)
- **M028** v3.14.1 — CTO: AI provider chain audit — Codex subscription expired + ai-token-guardian Codex refresh broken (2026-09-18, 1 tasks)
- **M027** v3.14.0 — IR: G14 Wave A · Deck v3 "Startup Value Index" (evaluator-first, pre-seed A$500K): web/content/pitch/pitch-deck-v3.md (12 slides + 3-minute cut + provenance), web/scripts/generate-pitch-deck-v3.ts → P (2026-09-16, 2 tasks)
- **M026** v3.13.2 — CRO: CISA alerts integration (2026-09-15, 1 tasks)
- **M025** v3.13.1 — CRO: ACSC alerts integration (2026-09-14, 1 tasks)
- **M024** v3.13.0 — CMO: AU startup percentile/positioning model integration (2026-09-13, 1 tasks)
- **M023** v3.12.1 — CTO: Fix orchestrator stageUpdateArtifacts — agent commit match closes pending tasks prematurely (2026-09-12, 1 tasks)
- **M022** v3.12.0 — CTO: Update Essential Eight Vulnerabilities to reflect ACSC alerts (2026-09-11, 1 tasks)
- **M021** v3.11.0 — CPO: /funding/report/[id] (cards, 12-month SVG Gantt, actions, disclaimers) + PDF + lib/dataroom/save-deliverable.ts + /workspace/funding + nav leaf validate.discover + recommender secondary money lan (2026-09-10, 9 tasks)
- **M020** v3.9.0 — CFO: Implement Top-Down/Bottom-Up TAM/SAM/SOM Calculator; CFO: Build Top-Down/Bottom-Up TAM/SAM/SOM Calculator (2026-08-31, 2 tasks)
- **M019** v3.8.1 — CFO: Sector-Specific Revenue Multiple Library (2026-08-30, 1 tasks)
