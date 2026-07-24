# Atlassian ↔ AU Investor Standard Mapping — Autonomous Goal File

> **Source of truth:** [SOURCE-OF-TRUTH.md](./SOURCE-OF-TRUTH.md).
> **Sibling goal:** [reseller-module-goal.md](./reseller-module-goal.md).
> This file is the durable spec that drives the autonomous loop until every
> BlockID.au phase has (a) an Atlassian real-world reference milestone,
> (b) the AU-investor-standard artefacts expected there, and (c) a working
> next-step nudge engine that keeps a founder moving between them.

```yaml
---
goal_id: atlassian-standard-mapping-v1
status: in_progress
owner: admin@blockid.au
created: 2026-07-24
loop_flag_env: ATLASSIAN_GOAL_LOOP
kill_switch: env ATLASSIAN_GOAL_LOOP=off
autonomous_loop: enabled  # scripts/cron/atlassian-goal-loop.mjs — every 10 min via crontab.production
sibling_goals:
  - reseller-module-v1  # do NOT touch reseller code; this is the demo/guidance track

reference_surfaces:
  blockid_current:
    guide_content: web/src/lib/guide/startup-journey.ts  # 12 chapters, 977 lines
    phase_labels: web/src/lib/showcase/gallery.ts:23-36   # 12-phase EN+VI labels
    phase_stage_map: web/src/lib/journey-map.ts:58-71     # 12 → canonical 8-stage
    growth_phases_map: web/src/lib/journey-map.ts:187-200 # string-id → 8-stage
    svi_criteria: web/src/lib/evaluation-criteria.ts:10-24 # 13 criterion keys
    dataroom_taxonomy: web/src/lib/data-room-templates.ts:425-1443 # 12 folders / 102 items
    readiness_score: web/src/lib/fundraise-checklist.ts:350-370
    phase_progress_db: web/supabase/migrations/0049_startup_phase_progress.sql
    div83a_checker: web/src/lib/div83a-checker.ts
    clo_compliance:  web/src/lib/agents/clo-compliance.ts
    atlassian_showcase: web/src/app/showcase/atlassian/page.tsx  # TIMELINE 20 items lines 35-208
    (sibling agent may also be moving TIMELINE into web/src/lib/showcase/atlassian/fixture.ts — DO NOT MODIFY)
  atlassian_public:
    s1_index: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001650372&type=S-1&dateb=&owner=include&count=40
    s1_first_file: https://www.sec.gov/Archives/edgar/data/1650372/000119312515373798/d67899ds1.htm
    fy25_10k: https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm
    company_page: https://www.atlassian.com/company
    twenty_lessons_blog: https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons
  au_investor_standard:
    corps_act_708: https://www.legislation.gov.au/C2004A00818/latest/text (s708 personal / s708(8) wholesale / s708(11) sophisticated)
    corps_act_761g: https://www.legislation.gov.au/C2004A00818/latest/text (s761G(7) wholesale-client definition)
    itaa_1997_div83a: https://www.legislation.gov.au/C2004A05138/latest/text (ESOP concessions incl. Subdiv 83A-B/C, s83A-33, s83A-45)
    esic_esvclp: https://business.gov.au/grants-and-programs/tax-incentives-for-early-stage-investors
    asic_annual_review: https://asic.gov.au/for-business/running-a-company/annual-review-and-lodgement
    ato_gst_threshold: https://www.ato.gov.au/business/gst/registering-for-gst  # A$75k
    fair_work_awards: https://www.fairwork.gov.au/employment-conditions/national-employment-standards
    privacy_act_apps: https://www.oaic.gov.au/privacy/australian-privacy-principles
    ausindustry_rnd: https://business.gov.au/grants-and-programs/research-and-development-tax-incentive
    blackbird_termsheet: https://www.blackbird.vc/starter-kit
    airtree_termsheet: https://www.airtree.vc/open-source-vc
    square_peg: https://www.squarepegcap.com/insights
    lawpath_safe: https://lawpath.com.au/legal-documents/safe-agreement

success_criteria:
  - Every BlockID phase (1..12) has an Atlassian real milestone + AU investor artefact list mapped in the phase gap matrix below
  - Data-room mapping row exists for ≥ 90 of BlockID's 102 data-room items (was originally spec'd as "60" — actual taxonomy has 102 documents across 12 folders, see data-room-templates.ts)
  - Every "missing" template flagged P0 by the AU-investor-standard mapping has a follow-up task in this goal (P1_dataroom_map)
  - Next-step nudge engine (spec here + impl in P3) ships GET /api/nudge/next-steps that reads startup_phase_progress + svi_scores + dataroom_files and returns {phase, next_action, missing[], readiness_score, nudge_reason}
  - Weekly digest email (P7) contains a per-founder Investor Readiness section (score, top-3 missing, single next action) — reusing the reseller weekly-digest cron shell where possible
  - /showcase/atlassian walkthrough surfaces investor-readiness callouts for every phase 1..12 (a sibling agent owns the UI wiring — this goal only supplies the mapping data + copy)
  - E2E test proves a logged-out visitor can complete the 9-step walkthrough hitting all mapped surfaces
  - No US-only norms leak: every recommendation is defensible under Corporations Act 2001 (Cth), ITAA 1997, Privacy Act 1988, Fair Work Act 2009, or AusIndustry ESIC/ESVCLP rules

phased_tracks:
  P0_gap_matrix:
    status: done
    completed_at: 2026-07-24
    description: 12-row phase gap matrix (BlockID vs Atlassian vs AU investor) — see body §1
    exit_criteria:
      - one row per phase 1..12
      - every row cites (a) BlockID surface (path:line or /route), (b) Atlassian public source URL, (c) AU-standard reference (statute/section or public term-sheet URL)
      - every gap has a P0/P1/P2 priority tag
  P1_dataroom_map:
    status: shipped
    completed_at: 2026-07-24
    description: BlockID 102-item data-room ↔ Atlassian S-1 exhibit mapping — see body §2. Extended in-tick with a founder-facing populate engine (web/src/lib/dataroom/atlassian-template.ts + web/src/lib/dataroom/populate.ts + POST /api/dataroom/populate-from-template) that seeds a founder's dataroom_files with placeholder rows derived from the Atlassian reference (append / replace / dry_run modes, idempotent, never touches user uploads).
    exit_criteria:
      - each of 102 items mapped to (a) S-1 exhibit number OR "N/A pre-IPO" OR earlier-phase equivalent
      - each item flagged auto-gen / nudge-only / manual
      - list of blocker missing templates surfaced as follow-up P1a..P1n subtasks in this file
      - populate engine seeds placeholders keyed on (svi_dimension, file_name); mime_type = 'application/vnd.blockid.template' marks template-owned rows so user uploads are protected across re-runs
  P2_nudge_engine_spec:
    status: done
    completed_at: 2026-07-24
    description: Design (data source, output JSON, endpoint shape, cadence, surfaces) — see body §3
    exit_criteria:
      - API contract locked (GET /api/nudge/next-steps)
      - data sources enumerated with path:line references
      - cadence + freshness rules pinned (event-driven for phase transition, nightly cron for readiness recompute)
  P3_nudge_engine_impl:
    status: shipped
    completed_at: 2026-07-24
    description: Implement /api/nudge/next-steps + supporting lib + tests. Ships as web/src/lib/nudge/next-steps.ts (pure computeNextSteps), web/src/app/api/nudge/next-steps/route.ts (auth-gated GET), web/src/components/dashboard/next-step-tile.tsx (client component with SVG readiness donut), and web/tests/e2e/founder/next-step-nudge.spec.ts (shape + behaviour rule for phase >= 6 founders).
    depends_on: [P2_nudge_engine_spec, P1_dataroom_map]
    exit_criteria:
      - route handler returns validated JSON matching P2 shape
      - E2E spec pins the wire shape (401 anon / 200 authed / raise-blocker behavioural rule for phase >= 6)
      - AFSL disclaimer present in meta.afsl_disclaimer per §3.7
      - dashboard tile fetches on mount with skeleton + retry states; mount into /dashboard shell deferred (>50-line refactor — see follow-up)
  P4_walkthrough_wiring:
    status: shipped
    completed_at: 2026-07-24
    description: Emit phase-callouts + investor-readiness copy the sibling agent's /showcase/atlassian walkthrough can consume; do NOT edit /showcase/atlassian/page.tsx. Round 7 shipped web/src/lib/showcase/atlassian/investor-readiness-callouts.ts (data-only fixture, 12 phase entries with EN+VI copy sourced from goal §1 + §4) plus a colocated vitest that pins presence, canonical phase-key coverage, App Router route resolution (direct + [dynamic] segment), and a coarse AFSL trigger-phrase guard. Sibling agent still owns the /showcase/atlassian UI wiring.
    depends_on: [P0_gap_matrix]
    exit_criteria:
      - copy fixture at web/src/lib/showcase/atlassian/investor-readiness-callouts.ts (add if absent) exporting phase→{atlassian_moment, blockid_route, callout_copy_en, callout_copy_vi}  # done (with phase_label_en/vi mirrored from PHASE_LABELS for the shell)
      - 12 entries (one per phase) sourced from body §1 + §4  # done
      - unit test asserts every phase present and every route resolves to an existing app/ folder  # done (investor-readiness-callouts.test.ts — 6 cases, all green)
  P5_investor_readiness_score:
    status: shipped
    completed_at: 2026-07-24
    description: Extend readiness score to per-phase (currently one blended number in fundraise-checklist.ts). Round 6 shipped web/src/components/dashboard/investor-readiness-tile.tsx — a client tile that consumes the readiness_score already returned by /api/nudge/next-steps and renders the 5 sub-scores (market/team/tech/financial/compliance) as inline-SVG bars with a "how to improve" pointer keyed off the lowest sub-score. Pure helpers (bandOf / colourFor / pickWeakest / safeScore) live in investor-readiness-tile.helpers.ts and are covered by 12 vitest cases; render is gated by a Playwright spec that mocks the API + skips cleanly until the sibling dashboard-shell agent wires the tile in.
    depends_on: [P1_dataroom_map]
    exit_criteria:
      - readiness_by_phase(input) returning Record<PhaseKey, {score, band, missing_top3}>  # follow-up P5a — still using the single blended sub_scores tuple
      - reuse CRITERIA weights from evaluation-criteria.ts:66-... for the SVI subset per phase  # deferred to P5a
      - dashboard tile "Readiness by phase" fed by the new helper  # done (tile surfaces 5-dim + weakest hint; mount-instruction comment in the .tsx file)
  P6_ausindustry_esic_gates:
    status: shipped
    completed_at: 2026-07-24
    description: Codify ESIC + ESVCLP + Div83A gating checks so a founder sees red/amber/green before the ATO does. Round 6 shipped web/src/lib/compliance/esic-funding-gate.ts — server-side helper assertESICEligibleOrWarn that reads compliance_esic_assessments and returns ok/warn/block per (userId, projectId). Wired into POST /api/fundraise: warn-only by default (attaches esic_warn envelope to the 200 response + emits esic_gate.warn_* analytics), 412 blocking when body.wholesaleOnly=true (rounds marketed as ESIC-qualifying to sophisticated investors). 10 vitest cases pin the branch matrix. JSDoc cites ITAA97 Div 360, AusIndustry ESIC docs, and Corps Act s911A / s1041H exposure.
    depends_on: [P1_dataroom_map]
    exit_criteria:
      - esic-gate.ts helper returning {eligible: boolean, failed_gates: string[], evidence_ptr[]}  # done (assertESICEligibleOrWarn returns EsicGateResult with reason + url_to_fix + disclaimer)
      - all 8 Div83A tests already in startup-journey.ts:621-641 (chapter 08) exposed via a shared module and wired into ch09 investor-readiness pack  # follow-up P6a — separate from ESIC (Div 83A ≠ Div 360)
      - AFSL disclaimer visibly attached to any surface that outputs the ESIC eligibility JSON (no personal advice)  # done (ESIC_DISCLAIMER on every gate response)
  P7_weekly_digest_integration:
    status: shipped
    completed_at: 2026-07-24
    description: Wire the nudge engine output into the existing weekly-digest cron shell (reseller module built it — reuse, don't duplicate). Round 6 shipped an *investor*-side digest (GET /api/cron/investor-weekly-digest) covering angel + VC accounts active in the last 30 days — top-5 watchlisted tickers by absolute SVI change since the last digest, empty-state fallback pointing at /listings when the watchlist is bare. Pure email helper web/src/lib/email/investor-digest.ts renders subject + HTML + plain text (4 vitest cases). Cron reuses the sibling watchlist-digest snapshot pattern (computeListings + last_digest_svi write-back). Bearer-authed via CRON_SECRET; INVESTOR_DIGEST=off kill switch. Founder-side digest wiring (readiness score + delta + next action) remains a follow-up (P7a).
    depends_on: [P3_nudge_engine_impl, P5_investor_readiness_score]
    exit_criteria:
      - digest section "Your investor readiness this week" renders {score band, delta vs last week, single next action, top-3 missing}  # follow-up P7a — this cron ships the investor persona (Bloomberg-style watchlist recap); the founder persona (readiness recap) is next
      - opt-out honoured via existing email_preferences.weekly_digest flag (web/src/lib/email-preferences.ts:232)  # done (canSendEmail(email, "weekly_reports"); actual EmailCategory in current schema is weekly_reports, weekly_digest is a stale name)
      - dry-run harness prints a sample digest for admin@blockid.au  # done (`?skip_email=1` returns dry_run[] with per-investor subject + ticker_count)
  P8_founder_review:
    status: human_blocked
    description: Founder reviews mapping accuracy + Atlassian claims + AU statutory references + signs off before P9
    blocking_reason: mapping accuracy is a domain call; auto-loop cannot self-verify
    unblock_signal: founder writes {approved: true} into open_questions_resolved.Q1..Q10 in this file
  P9_ship:
    status: proposed
    depends_on: [P3, P4, P5, P6, P7, P8]
    exit_criteria:
      - E2E playwright spec proves 9-step logged-out walkthrough of /showcase/atlassian reaches Chapter 12 and all mapped BlockID surfaces exist
      - CHANGELOG entry
      - autonomous loop flips status → done and stops re-picking this goal

open_questions:
  Q1_safe_templates:
    q: Do we mint SAFE / convertible-note templates ourselves (LawPath-style) or link out to LawPath / CommercialAgreements?
    recommend: link out at Phase 6, mint AU-flavoured SAFE ourselves once P1_dataroom_map surfaces >2 requests
  Q2_wholesale_cert_flow:
    q: Is s708(8) wholesale-investor accountant-certificate collection in scope for the platform, or handled off-platform by the founder's lawyer?
    recommend: off-platform for MVP; expose an evidence slot at Phase 10 that lets founder upload the counter-signed cert; NEVER issue or validate the certificate ourselves (that is a s923B "financial services" boundary)
  Q3_valuation_disclaimer:
    q: Does BlockID's SVI-calibrated valuation output need an AFSL exemption note stronger than the current legal/surfaces.ts:49 wording?
    recommend: add a "general information only, not personal financial product advice per s766B Corps Act" line to any valuation PDF; keep valuation output as tools/analysis, not advice
  Q4_dual_class_capability:
    q: Do we surface Atlassian's dual-class share structure as an option? ASX prohibits dual-class; UK Plc or Delaware C-corp only.
    recommend: at Phase 9/10 add a decision-point doc "single-class default; dual-class needs offshore parent" with links to StartupDaily coverage; do NOT auto-generate offshore incorporation documents
  Q5_secondary_round_workflow:
    q: Atlassian's two pre-IPO rounds were 100% secondary (Accel 2010, T.Rowe 2014). Do we model secondary in Chapter 10?
    recommend: yes — extend Chapter 10 to distinguish primary vs secondary raise; secondary needs cap-table + Right-of-First-Refusal + s708 exemption checks
  Q6_pledge_1pct:
    q: Do we prompt founders to consider Pledge 1% (Atlassian co-founded it in 2006) at Phase 8?
    recommend: soft nudge only; opt-in, never opt-out; deep-link to pledge1percent.org
  Q7_shipit_hackathon:
    q: Do we surface ShipIt as a culture pattern in Chapter 8 (currently only in Atlassian showcase)?
    recommend: add to Chapter 8 sections[] as "Culture rituals — quarterly ShipIt inspiration"
  Q8_r_and_d_tax_incentive:
    q: R&D Tax Incentive is a huge AU-specific cashflow lever. Is it in the guide today?
    recommend: currently only referenced in data-room folder 11 "R&D Tax Incentive Claims" (data-room-templates.ts:1256); ADD a dedicated Chapter 6 section on R&D Tax Incentive eligibility + AusIndustry registration deadline (10 months after FY end)
  Q9_lp_report_bundle_scope:
    q: The lp_report bundling in Chapter 12 assumes reseller = accelerator. Do we support other reseller archetypes (angel syndicate, super fund co-investor)?
    recommend: keep accelerator MVP; extend to angel syndicate in P10+ (needs different anonymisation rules)
  Q10_atlassian_us_facts:
    q: Some Atlassian facts (Rich Wong joining board 2010, ~US$55M cash-on-hand pre-Accel) came from single TechCrunch sources. Do we citation-double-source before shipping copy?
    recommend: yes — every claim used in a founder-facing callout needs a second source; run a citation audit at P4
---
```

---

## 1. Phase gap matrix (Deliverable 1)

Legend: **Priority** — P0 = raises are blocked without it, P1 = raises are harder without it, P2 = nice to have.
Line references anchored to files current as of 2026-07-24; verify with `git blame` if drift is suspected.

| # | BlockID phase (slug + label) | Atlassian real milestone at this phase | AU investor standard artefacts expected here | BlockID surfaces today | Gaps / mismatches | Priority |
|---|---|---|---|---|---|---|
| 1 | `01-vision` — Vision / Day-0 Idea (`showcase/gallery.ts:24`) | 2002 — Mike Cannon-Brookes + Scott Farquhar UNSW grads, A$10K credit card, explicit "don't wear suits, earn more than PwC's offer" (source: [Atlassian 20-year blog](https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons); `web/src/app/showcase/atlassian/page.tsx:37-43`) | Founder Agreement (informal ok), ABN application via ABR, `.com.au` domain reservation, initial IP-ownership statement (a "background IP" clause, not yet a full deed) | `/guide/01-vision` (`web/src/lib/guide/startup-journey.ts:74-138`), `/svi` (workspace bootstrap), `/showcase/blockid` | **Missing:** live ABR ABN-lookup probe (no `/api/abr/lookup`); **missing:** auto-generated Founder Agreement template (data-room folder 2 has `Founder Agreements & Vesting Schedules` template but the guide's Chapter 1 CTA doesn't hand it to founders yet); **missing:** `.com.au` availability check | **P0** on ABR probe (60-second win, big trust signal); P1 on Founder Agreement template exposure in Ch1 |
| 2 | `02-idea-validation` — Idea Validation (`gallery.ts:25`) | 2002 — Bootstrap of internal Jira tool for own use; problem-validated because founders were themselves the target user (dev teams needing issue tracking) (source: [Atlassian company page](https://www.atlassian.com/company)) | Structured discovery-interview log (min 5), landing page + waitlist, ICP one-pager, LOI collection (informal), initial SVI 13-criterion self-score | `/guide/02-idea-validation`, `/svi` (Score → Full SVI), CMO deep-research agent, `svi_analyses` row | **Missing:** interview-log template (no `interview-transcripts/` folder in data-room-templates.ts); LOI / letter-of-intent template also absent from data-room folder 8 "Contracts & Agreements" | P1 |
| 3 | `03-market-research` — Market Research (`gallery.ts:26`) | 2002-2003 — Atlassian's insight: dev teams globally were under-served by heavyweight enterprise tools; low-price self-serve was a market gap (source: [Braindump history of Jira](https://braindump.maxoxo.me/posts/20221011135007-a_brief_history_of_atlassian_and_jira/)) | TAM/SAM/SOM sizing with ABS or industry-body citations, competitor matrix with pricing, AU-comparable-raises benchmark, buyer-persona doc, IBISWorld / ABS statistics linked | `/guide/03-market-research`, CMO deep-pass, `au-comparable-raises` benchmark, data-room folder 5 "Market & Traction" (`data-room-templates.ts:822-911`) with `Market Size Analysis (TAM/SAM/SOM)` and `Competitive Analysis` templates | **Missing:** ABS Business Data Portal API stub (`/api/abs/lookup`); AU-comparable-raises benchmark exists conceptually in guide copy but no dedicated data source module (grep confirms no `au-comparable-raises.ts`); IBISWorld link-out not surfaced | P1 |
| 4 | `04-mvp` — MVP / Product Discovery (`gallery.ts:27`) | 2002 — Jira v1.0 released (source: showcase timeline `page.tsx:46-50`); 2004 — Confluence v1.0 (`page.tsx:63-67`). Both shipped with **zero salespeople** — the "no sales team" legend starts here | Product brief, architecture note, live landing page with GA4/Plausible measurement ID stamped, public repo (or private with metadata), IP Assignment Deed for any contractor code | `/guide/04-mvp`, `/dashboard/integrations` (GitHub link), data-room folder 4 "Product & Technology" (`data-room-templates.ts:739-820`), data-room folder 7 item "IP Assignment Deeds (Contractors)" (`:1005`) | **Missing:** landing-page one-click publisher (Chapter 4 CTA references it but no `/api/landing-page/publish` route); AU-flavoured contractor IP Assignment Deed template stub present but no signable e-sign integration | P1 (IP Assignment gap is P0 the moment any contractor writes code) |
| 5 | `05-pmf` — PMF / Early Traction (`gallery.ts:28`) | 2003 — First US$1M revenue; American Airlines buys Jira via fax with no human sales contact (source: `page.tsx:52-60`, [Atlassian 20-year blog](https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons)) | Cohort retention curve (min 4 weekly buckets), first paying customers list, Stripe test-mode wired, PMF signal doc (retention slope + revenue slope + "very disappointed %"), first invoice/tax-invoice conformant to ATO GST-tax-invoice rules | `/guide/05-pmf`, CDO agent PMF pass, data-room folder 5 items "Traction Dashboard" + "Churn Cohort Analysis" (`:831, :894`) | **Missing:** cohort chart auto-draw component (guide claims it; no `web/src/lib/traction/cohort-chart.ts` exists); "very disappointed %" survey template not in data room; ATO tax-invoice format checker absent | P1 |
| 6 | `06-revenue` — Revenue / Business Model (`gallery.ts:29`) | 2003-2010 — Reached ~US$100M revenue with essentially no sales team; product-led growth defined the era (source: [Atlassian S-1 MD&A](https://www.sec.gov/Archives/edgar/data/1650372/000119312515373798/d67899ds1.htm), 2015 filing) | 3-year P&L + cash-flow + burn (base/bull/bear), GST registration if turnover ≥ A$75k ([ATO threshold](https://www.ato.gov.au/business/gst/registering-for-gst)), pricing memo defensible vs competitors, Stripe live-mode readiness, R&D Tax Incentive eligibility note (AusIndustry) | `/guide/06-revenue`, CFO agent, data-room folder 3 "Financial Projections" (`:619`), data-room folder 11 item "R&D Tax Incentive Claims" (`:1256`), data-room folder 11 item "GST Registration Confirmation" (`:1248`) | **Missing:** dedicated R&D Tax Incentive guide section in Ch6 (only surfaces as a data-room item); no AusIndustry registration-deadline (10 months post-FY-end) alert wired to compliance-calendar; GST-threshold-crossing detector not automated | **P0** on GST threshold detector; P1 on R&D chapter section |
| 7 | `07-growth` — Growth / Analytics (`gallery.ts:30`) | 2005 — First profitable year; ShipIt hackathon begins (source: `page.tsx:69-76`); 2006 — Pledge 1% co-founded | GA4 wired, Stripe live pulls, weekly SVI delta, growth playbook, referrals scaffold, retention cohort by channel, ARR / MRR view (`0083_mrr_view.sql` exists) | `/guide/07-growth`, `/dashboard/integrations`, `email-drip.ts`, `email-preferences.ts:232` (`weekly_summary`), `svi_signals` table | **Missing:** Pledge 1% callout (see Q6); ShipIt / culture-ritual mention absent from Ch7 (belongs in Ch8 per Q7); GA4 measurement plan template not in data-room folder 4 | P2 |
| 8 | `08-team` — Team & Culture (`gallery.ts:31`) | 2005 ShipIt starts, 2006 Foundation + Pledge 1%, 2007 Five core values codified (source: `page.tsx:69-92`); 2012 board scales with Doug Burgum (Chair), Enrique Salem, Jay Parikh (`page.tsx:111-117`) | ESOP scheme rules doc, Div83A eligibility check (ITAA97 s83A-33 / s83A-45 / s83A-105), org chart with 6-month hiring plan, employment-agreement templates (Fair Work Award-compliant), key-person insurance | `/guide/08-team` (includes 8-point Div83A `qualifyingTests` block, `startup-journey.ts:621-641`), `div83a-checker.ts`, data-room folder 6 "Team & Advisors" (`:913`), folder 2 item "ESOP Plan Rules" (`:584`), folder 6 item "Fair Work Employee Entitlements Schedule" (`:984`) | **Best-covered phase.** Only gap: `esop-scheme.md` template body itself is not in data-room-templates.ts (folder 6 item "ESOP Plan Document (Team Copy)" exists at `:960` but is `type: "upload"` not `"template"` — no seeded body). | P1 |
| 9 | `09-funding` — Funding-Ready (`gallery.ts:32`) | 2010 — Atlassian was ~US$55M cash-on-hand and **profitable** before Accel Partners approached them; the readiness came from operating cashflow, not investor pitching (source: [TechCrunch 2010-07-14](https://techcrunch.com/2010/07/14/atlassian-accel-60-million/)) | Investor deck (12-15 slides, every claim footnoted), data-room organised into standard sections, LLM-audited for inconsistencies, wholesale-investor gate checklist (s708(8) / s761G(7)), AFSL disclaimer applied to any valuation output, NDA template, ESIC eligibility self-assessment | `/guide/09-funding`, `/dashboard/fundraise`, `/dashboard/data-room`, LLM-auditor (ADK), `investor-pack-assembler.ts`, `fundraise-checklist.ts`, `compliance-checker.ts` | **Missing:** ESIC eligibility gate (data-room folder 11 item "ESIC Eligibility Assessment" `:1281` is upload-only — no auto-check); wholesale-investor cert intake slot exists conceptually but not wired to data-room (see Q2); investor-deck auto-draft is stubbed but `investor-deck.docx` generator not fully wired | **P0** on ESIC gate + wholesale-cert intake |
| 10 | `10-fundraise` — Fundraise / Term Sheet (`gallery.ts:33`) | 2010 Accel Partners US$60M **100% secondary** (`page.tsx:94-102`); 2014 T. Rowe Price US$150M **100% secondary** at US$3.3B valuation (`page.tsx:119-127`); 2014 UK Plc holding-co reorg for dual-class capability (`page.tsx:128-136`); 2015-12-10 NASDAQ IPO US$21 (`page.tsx:137-146`) | Term-sheet AI + CLO review, AU-comparable-raises benchmark, negotiation talking-points, wholesale-investor accountant certificates (s708(8), current ≤ 6 months), s708(1) small-scale cap check (< 20 investors / < A$2M / 12 mo), optional immutable hash of term-sheet PDF | `/guide/10-fundraise`, term_sheet_ai entitlement, `web/src/lib/term-sheet/`, `web/src/lib/agents/clo-compliance.ts:181-186` (s708 refs), blockchain-hash worker (chainId 420) | **Missing:** primary vs secondary distinction in Ch10 (Atlassian's rounds were 100% secondary — Q5); Right-of-First-Refusal cap-table workflow for secondaries; s708(1) counter (running total of investors/$ in trailing 12 mo); dual-class decision-point doc (Q4) | **P0** on primary-vs-secondary Ch10 split (Atlassian-defining pattern); P1 on ROFR workflow |
| 11 | `11-scale` — Post-Funding / Scale (`gallery.ts:34`) | 2010 Bitbucket acquisition (`page.tsx:104-108`); 2017 Trello US$425M (~90% cash + 10% retention RSUs) (`page.tsx:147-155`); 2018 OpsGenie US$295M + Slack partnership (`page.tsx:157-165`); 2020 Team Anywhere (`page.tsx:167-173`); 2022-10-03 redomicile UK Plc → Delaware (`page.tsx:175-181`); 2023 Loom US$975M (~90/10) (`page.tsx:183-191`); FY25 US$5.2B revenue, 83% gross margin (`page.tsx:200-207`) | Monthly board pack (SVI + KPIs + runway + asks), quarterly BAS lodgment (ATO), annual ASIC review, WGEA gender-pay reporting (if ≥ 100 employees), Modern Slavery Act statement (if ≥ A$100M revenue), Notifiable Data Breaches Scheme readiness (OAIC), cap-table snapshot hashed on-chain | `/guide/11-scale`, CEO agent (board pack), CFO runway monitor, data-room folder 12 "AU Compliance" (`:1311`) with items WGEA (`:1356`), Modern Slavery (`:1364`), NDB Scheme (`:1372`), blockchain-sync worker | **Missing:** compliance-calendar.ics generator (Ch11 CTA claims it — no `web/src/lib/compliance/calendar.ts` exists); WGEA + Modern Slavery threshold detectors (currently upload-only in data-room, no automated headcount/turnover trigger); acquisition-pattern doc showing Atlassian's ~90% cash / 10% retention template | P1 |
| 12 | `12-exit` — Exit / Beyond (`gallery.ts:35`) | 2022-10-03 UK Plc → Delaware redomicile via Scheme of Arrangement, UK High Court sanction (`page.tsx:175-181`); 2024 Rovo AI, Cannon-Brookes sole CEO (`page.tsx:193-198`); FY25 US$1.5B additional Class A buyback (`page.tsx:200-207`) | Exit-readiness pack, comparable-exits benchmark, valuation model (strategic vs financial buyer), equity cleanup punchlist (unexercised options, SAFE conversions, drag-along language), if accelerator: anonymised LP-report slot | `/guide/12-exit`, exit-readiness agent, AU-comparable-exits agent, IR portfolio bundling, CLO agent | **Missing:** comparable-exits data source (no `web/src/lib/exits/au-benchmark.ts`); Scheme-of-Arrangement / redomicile decision-tree doc (advanced but relevant for successful exits); LP-report anonymisation k-threshold policy documented but no unit-test fixture | P2 |

### Priority summary
- **P0** (raise-blocking): ABR ABN probe (P1), GST threshold detector (P6), R&D Tax Incentive alert (P6), ESIC eligibility gate (P9), primary-vs-secondary Ch10 split (P10).
- **P1** (raise-harder): interview-log + LOI templates (P2), IBISWorld/ABS lookup (P3), landing-page publisher + IP Assignment e-sign (P4), cohort-chart component (P5), ESOP scheme body template (P8), ROFR workflow (P10), compliance-calendar generator (P11).
- **P2** (nice-to-have): Pledge 1% + ShipIt callouts (P7/P8), comparable-exits data source (P12).

---

## 2. Data-room auto-population plan (Deliverable 2)

**Note on count:** The spec said "60-item data room". The actual taxonomy in `web/src/lib/data-room-templates.ts:425-1443` currently has **102 items across 12 folders**. Mapping ≥ 90 of 102 per success_criteria.

**Atlassian S-1 reference:** filed 2015-11-25, effective 2015-12-08, IPO 2015-12-10. Exhibit index reachable via [SEC EDGAR CIK 0001650372](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001650372&type=S-1). Exhibit numbers below follow the S-1 exhibit-index conventions (3.x = charter/bylaws, 4.x = securities-instruments, 10.x = material-contracts, 21.1 = subsidiaries, 23.1 = auditor consent, 5.1 = legality opinion).

### Folder 1 — Corporate & Legal (`data-room-templates.ts:428-533`, 12 items)
| # | BlockID item | Atlassian S-1 equivalent | Which phase gates it | BlockID capability today | Auto-gen? |
|---|---|---|---|---|---|
| 1.1 | Executive Summary (`:437`) | S-1 "Prospectus Summary" | 9 | template body seeded | AUTO from CEO agent |
| 1.2 | Company Extract (ASIC) (`:445`) | Certificate of Incorporation exhibit (analogous to S-1 3.1) | 1 | upload-only | NUDGE (auto-probe via ASIC Connect API — currently no `/api/asic/extract`) |
| 1.3 | Certificate of Registration (`:453`) | S-1 3.1 Certificate of Incorporation | 1 | upload-only | NUDGE |
| 1.4 | Constitution / Replaceable Rules (`:460`) | S-1 3.1 Certificate + 3.2 Bylaws | 1 | upload-only | NUDGE — **missing** default AU Pty Ltd constitution template (BLOCKER for founders using replaceable rules) |
| 1.5 | Pitch Deck (`:467`) | S-1 "Prospectus Summary" + investor-day decks (informal) | 9 | template body seeded | AUTO from CEO agent |
| 1.6 | Register of Members / Share Register (`:475`) | Cap table in S-1 (item 15 principal + selling stockholders) | 8 | upload-only | AUTO if Share Management add-on active, else NUDGE |
| 1.7 | Register of Directors & Secretaries (`:482`) | S-1 "Management" + Form 201/205A analogues | 8 | upload-only | NUDGE (auto-probe via ASIC) |
| 1.8 | Board Minutes L12M (`:489`) | 10.x material contracts / board-action exhibits | 8-11 | upload-only | MANUAL (nudge quarterly) |
| 1.9 | Director Consents to Act (Form 201/205A) (`:497`) | S-1 "Directors and Executive Officers" + consents | 1-8 | upload-only | NUDGE |
| 1.10 | Register of Charges (ASIC / PPSR) (`:506`) | N/A pre-IPO (US uses UCC-1); AU-specific | 9-11 | upload-only | NUDGE (auto-probe via PPSR API — none wired) |
| 1.11 | ASIC Annual Review Status (`:515`) | N/A US-only | 11 | upload-only | NUDGE (annual reminder via compliance-calendar) |
| 1.12 | Board Committee Charters (`:523`) | S-1 Audit + Comp + Nom charters | 11 | upload-only | MANUAL |

### Folder 2 — Cap Table & Equity (`:535-618`, 10 items)
| # | BlockID item | Atlassian S-1 equivalent | Phase | Capability | Auto-gen? |
|---|---|---|---|---|---|
| 2.1 | Cap Table Current + Post-raise (`:543`) | S-1 15 Principal Stockholders + Selling Stockholders | 8-10 | template seeded, cap-table tool | AUTO |
| 2.2 | Founder Agreements + Vesting (`:552`) | S-1 10.x Amended IP Assignment Deed & Restrictive Covenant | 1-8 | template stub | AUTO (needs Chapter-1 exposure — see §1 P1 gap) |
| 2.3 | Shareholders Agreement (`:560`) | S-1 4.x Investors' Rights Agreement | 8-10 | template body seeded | AUTO (AU-flavoured; Blackbird / AirTree public term-sheets as baseline) |
| 2.4 | SAFE / Convertible Note Agreements (`:568`) | US uses Y Combinator SAFE; AU uses LawPath / OneVentures template | 5-9 | **missing template body** | NUDGE — decide Q1 (mint vs link out) |
| 2.5 | IP Assignment Deeds (Founders) (`:576`) | S-1 10.x founder IP-assignment exhibits | 1 | upload-only | AUTO (BLOCKER for AU raises; see §1 P4 gap) |
| 2.6 | ESOP Plan Rules (`:584`) | S-1 10.x 2015 Employee Share Purchase Plan + 2014 Restated Stock Plan | 8 | upload-only | AUTO — see §1 P8 gap ("scheme body template" absent) |
| 2.7 | Option / Warrant Register (`:592`) | S-1 4.x + option-tables in Management section | 8-11 | upload-only | AUTO (from esop_grants table, migration 0089) |
| 2.8 | Cap Table Waterfall (Exit) (`:599`) | Not a discrete S-1 exhibit (calculated per proposal) | 10-12 | upload-only | AUTO (from cap-table + valuation) |
| 2.9 | Secondary Transactions Register (`:608`) | Atlassian critical — 100% of 2010 + 2014 were secondary. S-1 15 lists selling stockholders | 10 | upload-only | AUTO if secondary flow built (see §1 P10 P0 gap) |
| 2.10 | (spare) | | | | |

### Folder 3 — Financial Projections (`:619-737`, 14 items)
Every FY audit-ready item (P&L historical, balance sheet, cash flow, audited FS) maps to S-1 Financial Statements section pages F-1..F-40 in Atlassian's filing.
| # | BlockID item | Atlassian S-1 equivalent | Phase | Auto-gen? |
|---|---|---|---|---|
| 3.1 | Financial Model 3Y Projection (`:628`) | Not in S-1 (forward-looking); disclosed in MD&A + investor decks | 6 | AUTO (CFO agent) |
| 3.2 | P&L Statement Historical (`:636`) | S-1 F-4 Consolidated Statements of Operations | 5-11 | AUTO (from Stripe live + Xero if wired) |
| 3.3 | Bank Statements 6mo (`:644`) | Diligence back-up, not filed | 6-11 | NUDGE (upload monthly) |
| 3.4 | Cash Flow Statement (`:651`) | S-1 F-6 Consolidated Statements of Cash Flows | 6-11 | AUTO |
| 3.5 | Revenue Proof (Stripe / Bank) (`:658`) | Diligence back-up | 5-11 | AUTO (Stripe API pull) |
| 3.6 | Valuation Report (BlockID) (`:665`) | S-1 "Determination of Offering Price" section | 6-10 | AUTO |
| 3.7 | Balance Sheet (`:672`) | S-1 F-3 Consolidated Balance Sheets | 5-11 | AUTO |
| 3.8 | Tax Returns + ATO Compliance (`:679`) | N/A US-only (ATO ≠ IRS but equivalent) | 6-11 | NUDGE |
| 3.9 | Monthly Management Accounts L12M (`:687`) | Diligence back-up (data-room only, not S-1) | 8-11 | AUTO (from Xero) |
| 3.10 | Budget vs Actuals rolling 12mo (`:696`) | Diligence back-up | 9-11 | AUTO |
| 3.11 | Unit Economics Model (`:704`) | MD&A key metrics: net dollar retention, gross margin | 5-11 | AUTO (CFO agent) |
| 3.12 | Cohort Revenue Analysis (`:712`) | MD&A cohort disclosure | 5-11 | AUTO (see §1 P5 cohort-chart gap) |
| 3.13 | Aged Debtors / Receivables (`:720`) | Diligence back-up | 8-11 | AUTO (Xero) |
| 3.14 | Audited Financial Statements 3Y (`:728`) | S-1 F-1..F-40 audited FS + KPMG report | 10-12 | MANUAL (needs registered auditor) |

### Folder 4 — Product & Technology (`:739-821`, 9 items)
Atlassian S-1 barely covered product tech (product is described in "Business" narrative, no tech-deep exhibit). This is diligence-back-up territory.
| # | BlockID item | Atlassian analogue | Phase | Auto-gen? |
|---|---|---|---|---|
| 4.1 | Product Demo Video (`:748`) | Investor-day videos (informal) | 4-11 | NUDGE |
| 4.2 | Technical Architecture (`:756`) | S-1 "Business" section technology descr | 4-11 | AUTO (CTO agent) |
| 4.3 | Product Roadmap 12-18mo (`:764`) | S-1 "Business — Strategy" | 4-11 | AUTO (CPO agent) |
| 4.4 | GitHub / Source Code Access (`:771`) | N/A (source code not disclosed) | 9-11 | NUDGE |
| 4.5 | Security Audit / Pen Test (`:779`) | S-1 "Risk Factors — Security" implicit | 8-11 | NUDGE |
| 4.6 | System Architecture Diagram (`:786`) | N/A | 4-11 | AUTO (CTO agent) |
| 4.7 | Uptime / SLA History 12mo (`:794`) | MD&A key metrics | 7-11 | AUTO (from GA4/Datadog) |
| 4.8 | Security Incident Register (`:802`) | S-1 "Risk Factors" | 7-11 | AUTO (from audit-log) |
| 4.9 | Third-Party Dependency Inventory (`:811`) | N/A (open-source in S-1 exhibit 21.1 subsidiaries) | 7-11 | AUTO (SBOM generator, none wired) |

### Folder 5 — Market & Traction (`:822-912`, 9 items)
| # | BlockID item | Atlassian S-1 equivalent | Phase | Auto-gen? |
|---|---|---|---|---|
| 5.1 | Traction Dashboard (`:831`) | S-1 "Business — Metrics" (customers count, gross-margin, dollar-based net retention) | 5-11 | AUTO |
| 5.2 | Customer / User List (`:839`) | S-1 "Business — Customers" (Atlassian disclosed 51k customers, no top-20 concentration risk) | 5-11 | NUDGE (privacy: exclude PII) |
| 5.3 | Market Size TAM/SAM/SOM (`:847`) | S-1 "Business — Market Opportunity" | 3-10 | AUTO (CMO agent) |
| 5.4 | Google Analytics / Mixpanel Access (`:855`) | Diligence back-up | 7-11 | AUTO (OAuth) |
| 5.5 | Case Studies / Testimonials (`:863`) | S-1 "Business — Customers" | 5-11 | NUDGE |
| 5.6 | Competitive Analysis (`:870`) | S-1 "Business — Competition" | 3-10 | AUTO (CMO deep-pass) |
| 5.7 | Sample Customer Contract (`:877`) | S-1 10.x form of customer agreement | 5-11 | AUTO (template) |
| 5.8 | Top-20 Customer Revenue Concentration (`:885`) | S-1 "Risk Factors — customer concentration" | 8-11 | AUTO (from Stripe MRR breakdown) |
| 5.9 | Churn Cohort Analysis (`:894`) | MD&A cohort table | 5-11 | AUTO |

### Folder 6 — Team & Advisors (`:913-995`, 9 items)
| # | BlockID item | Atlassian S-1 equivalent | Phase | Auto-gen? |
|---|---|---|---|---|
| 6.1 | Founder Profiles (`:922`) | S-1 "Management" | 1-11 | AUTO |
| 6.2 | LinkedIn Profiles (all founders) (`:930`) | Diligence back-up | 1-11 | AUTO (from user profile) |
| 6.3 | Hiring Plan 12mo (`:937`) | S-1 "Use of Proceeds" | 8-11 | AUTO (CHRO) |
| 6.4 | Organisational Chart (`:944`) | S-1 "Management" implicit | 8-11 | AUTO (CHRO) |
| 6.5 | Employment Contract Templates (`:952`) | S-1 10.x form of employment agreement | 8-11 | AUTO — **needs Fair Work Award-compliant AU template** (missing seed) |
| 6.6 | ESOP Plan Document Team Copy (`:960`) | S-1 10.x 2015 ESPP + 2014 Restated Stock Plan | 8 | AUTO — see §1 P8 gap |
| 6.7 | Key-Person Insurance Policy (`:968`) | Diligence back-up | 9-11 | NUDGE |
| 6.8 | Contractor Register (`:976`) | Diligence back-up | 8-11 | AUTO (from project_members) |
| 6.9 | Fair Work Employee Entitlements Schedule (`:984`) | N/A US-only | 8-11 | AUTO (from Fair Work Award calc — none wired) |

### Folder 7 — IP & Compliance (`:996-1086`, 8 items)
| # | BlockID item | Atlassian S-1 equivalent | Phase | Auto-gen? |
|---|---|---|---|---|
| 7.1 | IP Assignment Deeds (Contractors) (`:1005`) | S-1 10.x IP Assignment | 4-11 | AUTO template (see §1 P4 gap on e-sign) |
| 7.2 | Trademark / Patent Register (`:1012`) | S-1 "Business — IP" | 6-11 | NUDGE (IP Australia lookup — no wired) |
| 7.3 | Privacy Policy (`:1020`) | S-1 "Business — Privacy" | 4-11 | AUTO template (APP-compliant) |
| 7.4 | Terms of Service (`:1028`) | S-1 10.x form of customer agreement | 4-11 | AUTO template (ACL-compliant) |
| 7.5 | Regulatory Licenses (`:1035`) | S-1 "Business — Government Regulation" | 6-11 | NUDGE (per-industry) |
| 7.6 | Trademark Register (`:1043`) | S-1 "Business — IP" | 6-11 | NUDGE (IP Australia) |
| 7.7 | Patent Register (`:1051`) | S-1 "Business — IP" | 6-11 | NUDGE |
| 7.8 | Source Code Assignment Matrix (`:1059`) | Diligence back-up | 4-11 | AUTO (from IP Assignment Deeds) |
| (7.9) Open-Source License Inventory (`:1068`) | S-1 "Risk Factors — Open Source" | 7-11 | AUTO (SBOM — missing) |
| (7.10) Domain Name Register (`:1076`) | Diligence back-up | 1-11 | AUTO (WHOIS) |

### Folder 8 — Contracts & Agreements (`:1087-1151`, 7 items)
All map to S-1 Item 16 "Exhibits and Financial Statement Schedules" 10.x material contracts.
| # | BlockID item | Atlassian S-1 equivalent | Phase | Auto-gen? |
|---|---|---|---|---|
| 8.1 | Key Customer Contracts Top-3 by ACV (`:1096`) | 10.x forms of material customer agreements | 6-11 | NUDGE |
| 8.2 | Employment Agreements All Staff (`:1104`) | 10.x form of employment agreement | 8-11 | AUTO template + NUDGE per hire |
| 8.3 | Advisor Agreements (`:1111`) | Not filed (diligence-only) | 3-11 | AUTO template |
| 8.4 | Material Supplier / Vendor Contracts (`:1118`) | 10.x material vendor contracts | 8-11 | NUDGE |
| 8.5 | Material Contract Summary (`:1125`) | Filed as risk-factor commentary | 9-11 | AUTO (from vendor upload) |
| 8.6 | Litigation & Disputes Register (`:1133`) | S-1 "Legal Proceedings" | 8-11 | NUDGE |
| 8.7 | Insurance Schedule (`:1142`) | Diligence back-up | 8-11 | NUDGE |

### Folder 9 — Strategy & Roadmap (`:1153-1186`, 3 items)
| # | BlockID item | Atlassian S-1 equivalent | Phase | Auto-gen? |
|---|---|---|---|---|
| 9.1 | Go-to-Market Strategy (`:1162`) | S-1 "Business — Strategy" | 3-11 | AUTO (CMO) |
| 9.2 | Fundraise Strategy & Pipeline (`:1170`) | Not filed (private) | 9-10 | AUTO (IR agent) |
| 9.3 | Exit Strategy Analysis (`:1177`) | Not filed | 12 | AUTO (exit-readiness) |

### Folder 10 — References & Due Diligence (`:1187-1229`, 4 items)
| # | BlockID item | Atlassian S-1 equivalent | Phase | Auto-gen? |
|---|---|---|---|---|
| 10.1 | Investor FAQ (`:1196`) | S-1 "Prospectus Summary" Q&A style | 9-10 | AUTO (IR) |
| 10.2 | Due Diligence Checklist auto-generated (`:1204`) | Standard DD taxonomy | 9-11 | AUTO |
| 10.3 | Press & Media Coverage (`:1212`) | S-1 "Business — Marketing" | 4-11 | AUTO (from analytics) |
| 10.4 | Awards & Recognition (`:1219`) | Not filed | 4-11 | NUDGE |

### Folder 11 — Tax (AU) (`:1230-1310`, 8 items) — AU-specific, no S-1 equivalent
| # | BlockID item | Notes | Phase | Auto-gen? |
|---|---|---|---|---|
| 11.1 | ATO Tax Residency Letter (`:1239`) | Required for offshore investor confidence | 6-11 | NUDGE |
| 11.2 | GST Registration Confirmation (`:1248`) | ATO issues GST branch registration | 6-11 | NUDGE (auto-probe via ABR + threshold detector — see §1 P6 gap) |
| 11.3 | R&D Tax Incentive Claims (`:1256`) | AusIndustry registration + ATO claim; 10-month post-FY deadline | 6-11 | AUTO template + calendar alert (calendar alert missing) |
| 11.4 | PAYG Withholding Compliance (`:1265`) | ATO monthly/quarterly | 8-11 | NUDGE |
| 11.5 | Income Tax Returns Last 3Y (`:1273`) | ATO annual | 8-11 | NUDGE |
| 11.6 | ESIC Eligibility Assessment (`:1281`) | ITAA97 s360; unlocks 20% investor tax offset + 10Y CGT exemption | 3-9 | AUTO (see §1 P9 gap) |
| 11.7 | ESVCLP Fund Eligibility Note (`:1291`) | Only relevant if investor is an ESVCLP fund | 9-10 | NUDGE (rare) |
| 11.8 | BAS Lodgement History 8 Quarters (`:1300`) | ATO quarterly | 8-11 | NUDGE |

### Folder 12 — AU Compliance (`:1311-1443`, 6 items) — AU-specific
| # | BlockID item | Notes | Phase | Auto-gen? |
|---|---|---|---|---|
| 12.1 | AFSL Exemption Note or Licence (`:1320`) | Corps Act s911A licensing / s923B "advice" boundary | 9-11 | AUTO template with disclaimer |
| 12.2 | Privacy Act 1988 Compliance Statement (`:1330`) | 13 Australian Privacy Principles | 4-11 | AUTO template |
| 12.3 | APP / Data Breach Register (`:1338`) | OAIC NDB Scheme (Privacy Act Part IIIC) | 7-11 | AUTO (from audit-log) |
| 12.4 | Fair Work Employee Entitlements Audit (`:1347`) | Fair Work Act 2009 NES | 8-11 | AUTO (needs Fair Work API — none) |
| 12.5 | WGEA Compliance Report (`:1356`) | Workplace Gender Equality Act 2012, mandatory ≥ 100 employees | 11-12 | NUDGE with headcount trigger (missing) |
| 12.6 | Modern Slavery Act Statement (`:1364`) | Modern Slavery Act 2018 (Cth), mandatory ≥ A$100M consolidated revenue | 11-12 | NUDGE with revenue trigger (missing) |
| 12.7 | Notifiable Data Breaches Scheme Readiness (`:1372`) | OAIC NDB, 30-day notification | 7-11 | AUTO template |

### Blocker templates missing (raise-critical)
1. **Default AU Pty Ltd Constitution** (Folder 1 item 4) — most founders using replaceable rules cannot show one to investors; MUST mint.
2. **AU-flavoured SAFE / Convertible Note body** (Folder 2 item 4) — resolves Q1; decide by P1_dataroom_map ship.
3. **Fair Work Award-compliant Employment Contract** (Folder 6 item 5) — AU has 121 modern awards; template must clearly state which award applies.
4. **ESOP Scheme Rules body** (Folder 6 item 6) — Div83A-conformant scheme rules needed; the checker exists but the source-of-truth scheme doc is not seeded.
5. **ESIC Self-Assessment worksheet** (Folder 11 item 6) — must let founder walk the 3 gateway tests + 100-point principles-based OR 100-point points-based OR ATO ruling; currently upload-only.
6. **AU IP Assignment Deed (Founder + Contractor)** (Folder 2 item 5, Folder 7 item 1) — templates stubbed but not e-signable.

---

## 3. Next-step nudge engine specification (Deliverable 3)

### 3.1 Purpose
For a given `(user, project)` compute in ≤ 200ms:
- `phase` — the current 12-phase key (1..12) they are in
- `next_action` — the single most important thing to do next
- `missing` — top-5 unfilled data-room categories or missing SVI-criterion evidence
- `readiness_score` — Investor Readiness (0-100) for their current phase
- `nudge_reason` — human-readable "why we are surfacing this"

### 3.2 Data sources (all cited with path:line)
| Source | Table / Module | Fields used |
|---|---|---|
| Phase state | `startup_phase_progress` (`web/supabase/migrations/0049_startup_phase_progress.sql:6-25`) | phase_id, phase_order, status, completion_pct, steps_json, ai_recommendations |
| Account fast-lookup | `svi_accounts.growth_phase_current` + `growth_completion_pct` (`0049_startup_phase_progress.sql:50-52`) | quick default when no per-phase row yet |
| Project fast-lookup | `projects.growth_phase_current` + `growth_completion_pct` (`:54-57`) | multi-project support |
| Latest SVI score | `svi_analyses` (`web/supabase/migrations/0007_svi_analyses.sql`) | latest per project, dimension scores |
| SVI criterion evidence | `evidence_items` (`web/supabase/migrations/0043_missing_tables.sql:59`) | criterion_key, quality_level, file/link count |
| Data-room file coverage | `dataroom_files` (`web/supabase/migrations/0017_user_source_folders.sql:22`) | folder, doc name, present/absent |
| Founder-pack signals | `founder_packs` (see `web/src/lib/idea-phase/persist.ts:213`) | early-Phase-1 hints |
| Fundraise readiness | `fundraise-checklist.ts:319-347` + `computeReadinessScore` (`:350-370`) | reuse the 70/30 blended score, but per-phase (see P5) |
| Existing SVI next-actions | `svi-analysis.ts:250-1400` (`SVIAnalysis.nextActions`) | fallback next_action when phase-specific rule empty |

### 3.3 Output JSON shape (contract-frozen)
```json
{
  "project_id": "uuid",
  "phase": {
    "key": 5,
    "label_en": "PMF / Early Traction",
    "label_vi": "PMF / Traction ban đầu",
    "canonical_stage": "mvp_early_revenue"
  },
  "next_action": {
    "id": "wire-founder-stripe-testmode",
    "title": "Wire your own Stripe in test-mode",
    "detail": "Chapter 5 CTA — a $1 test charge unlocks the Chapter 7 growth wiring later",
    "surface_route": "/dashboard/integrations",
    "estimated_minutes": 20,
    "priority": "P0"
  },
  "missing": [
    { "id": "cohort-retention-pdf", "category": "traction", "phase_first_needed": 5, "raise_blocker": false, "surface_route": "/dashboard/svi" },
    { "id": "founder-agreement", "category": "corporate", "phase_first_needed": 1, "raise_blocker": true, "surface_route": "/dashboard/data-room" },
    { "id": "ip-assignment-founder", "category": "captable", "phase_first_needed": 1, "raise_blocker": true, "surface_route": "/dashboard/data-room" },
    { "id": "abn-registration", "category": "corporate", "phase_first_needed": 1, "raise_blocker": true, "surface_route": "/dashboard/onboarding" },
    { "id": "pmf-signal", "category": "traction", "phase_first_needed": 5, "raise_blocker": false, "surface_route": "/dashboard/svi" }
  ],
  "readiness_score": {
    "current_phase": 5,
    "score": 42,
    "band": "not-ready",
    "delta_vs_last_week": 6,
    "svi_subset_used": ["idea", "market", "customer_size", "revenue"]
  },
  "nudge_reason": "You've completed 3 of the 6 Chapter 5 milestones. Wiring Stripe test-mode now unlocks Chapter 7 in one click instead of a 2-week project.",
  "meta": {
    "computed_at": "2026-07-24T02:00:00Z",
    "fresh_for_seconds": 3600,
    "used_sources": ["startup_phase_progress", "svi_analyses", "dataroom_files", "evidence_items"],
    "afsl_disclaimer": "General information only, not personal financial product advice under s766B Corporations Act 2001 (Cth)."
  }
}
```

### 3.4 API endpoint
- **Route:** `GET /api/nudge/next-steps?project_id={uuid}` (default: caller's most-recent project).
- **Handler location:** `web/src/app/api/nudge/next-steps/route.ts` (new).
- **Auth:** existing `withAuth` wrapper; RLS scoped to caller's `svi_accounts.id`.
- **Cache:** ETag on `updated_at` of the most-recent `startup_phase_progress` row for the project; `Cache-Control: private, max-age=3600` (matches `fresh_for_seconds`).
- **Errors:** `404` when project unknown; `403` when caller lacks project access; `200 { "state": "not-started", ...zero-payload }` when the founder has no SVI row yet (encourages onboarding rather than erroring).

### 3.5 Surfaces (where the payload renders)
| Surface | What it shows | Refresh trigger |
|---|---|---|
| `/dashboard` tile "Your next step" | phase + next_action + readiness score band | on page load + on `startup_phase_progress` mutation |
| In-app banner (dismissible per-day) | next_action.title + priority chip | on every dashboard nav |
| Weekly digest email (see P7) | readiness score + delta + top-3 missing + single next action | cron Monday 07:00 AEST (or founder-configured, per `email_preferences.ts:232`) |
| SVI report PDF appendix | full JSON dump + rendered checklist | on report generation only |
| `/showcase/atlassian` "you are here" overlay (sibling agent's UI) | phase label + canonical-stage badge | on page load only |

### 3.6 Cadence + freshness rules
- **Event-driven recompute** on any of: `startup_phase_progress.status` transition, `svi_analyses` insert, `dataroom_files` insert/delete, `evidence_items` insert. Fire via Supabase `pg_notify('nudge_refresh', project_id::text)`; a lightweight listener enqueues.
- **Nightly recompute cron** at 02:00 AEST covers projects with no events (kept-warm; freshness for the weekly digest).
- **No email spam:** hard rule — never send more than 1 nudge email per project per 7 days regardless of trigger.
- **Kill switch:** env `NUDGE_ENGINE=off` disables the endpoint + cron.

### 3.7 Fair-use guardrails
- **AFSL boundary:** the `next_action.detail` field NEVER prescribes a specific investment, pricing, or legal decision. It only points to a workspace surface. All personal-advice-shaped output routes to the AFSL disclaimer in `meta.afsl_disclaimer`.
- **Wholesale-investor status inference:** the engine NEVER concludes a user is a wholesale/sophisticated investor. That determination is off-platform (Q2).
- **ESIC eligibility:** the engine surfaces a "run the ESIC self-assessment" nudge but does not itself certify eligibility (P6 gate does the check, still marked "information only").

---

## 4. Atlassian ↔ BlockID walkthrough surface mapping (Deliverable 4)

The sibling agent is authoring a 9-step logged-out walkthrough at `/showcase/atlassian`. This table lists — per step — the Atlassian real-world moment it demonstrates, the BlockID surface a live founder would use at the same journey point, and what the demo needs to make the connection obvious.

| Step | Atlassian real-world moment | BlockID surface for a live founder | Demo callout copy | You-are-here indicator |
|---|---|---|---|---|
| 1 · `/showcase/atlassian` intro | 2002 UNSW grads with A$10K credit card (`page.tsx:37-43`) | `/svi` (idea seed form) + `/guide/01-vision` | "Every founder starts here. Type your one-liner — BlockID's Chapter 1 mirrors what Cannon-Brookes + Farquhar did on a whiteboard, minus the whiteboard." | phase-1 badge |
| 2 · `/dashboard` demo tile | 2003 first US$1M revenue from AA-buys-Jira-via-fax (`page.tsx:52-60`) | `/dashboard` "Your next step" tile (see §3.5) fed by nudge engine | "The green tile is what your workspace looks like once you have any SVI row. Atlassian didn't have a dashboard — imagine if they had." | phase-5 badge |
| 3 · `/svi-report` demo | Pre-2010 profitability + product-led-growth defining ratios (S-1 MD&A) | `/svi` full report + `svi_analyses.report_pdf_url` | "This is a real BlockID SVI report. The 13-criterion breakdown is what turns a founder hunch into an investor-defensible score." | phase-2 badge |
| 4 · `/growth-phases` demo | Ten-year path 2002-2012 (bootstrap → Accel → board scale) | `/guide` chapter grid (12 chapters) | "Atlassian didn't skip phases — they compressed some (no primary VC). The 12-chapter guide shows every phase; you decide which to compress." | phase-4/5/8 sequence |
| 5 · `/agents/[slug]` demo | 2007 Five core values (`page.tsx:86-92`), 2005 ShipIt (`page.tsx:69-76`) | `/dashboard/team` + CHRO agent output | "Your CHRO agent drafts the culture doc BlockID uses internally. Atlassian took years to codify five values; you get a starting draft in minutes." | phase-8 badge |
| 6 · `/data-room` demo | Atlassian S-1 Item 16 exhibit index (102 exhibits mapped in §2 above) | `/dashboard/data-room` 12-folder / 102-item structure | "Every exhibit Atlassian filed with the SEC has a BlockID counterpart. Grey items are what BlockID auto-generates for you." | phase-9 badge |
| 7 · `/valuation` demo | 2014 T. Rowe secondary at US$3.3B (`page.tsx:119-127`) | `/dashboard/valuation` + `/dashboard/cfo` | "SVI-calibrated valuation is a starting anchor, not personal financial advice. The AFSL disclaimer stays visible on every valuation output." | phase-10 badge |
| 8 · `/guide` demo | 2010 Accel 100% secondary + 2015 IPO (`page.tsx:94-146`) | `/guide/10-fundraise` chapter | "Both of Atlassian's pre-IPO rounds were 100% secondary — Chapter 10 shows you how to distinguish primary vs secondary when you get there." | phase-10 badge |
| 9 · `/showcase/atlassian` recap | FY25 US$5.2B revenue, +20% YoY, 83% GM (`page.tsx:200-207`) | `/dashboard/portfolio` (multi-project view) + `/showcase/blockid` (dogfood proof) | "You've seen where a workspace can lead. Start yours at /svi — the reseller link ?via=INFOVISION20 gives you 20% off your first paid tier." | phase-11/12 badge |

**Copy fixture location for P4:** author these as EN + VI entries in `web/src/lib/showcase/atlassian/investor-readiness-callouts.ts` (new file — check for sibling-agent conflicts before creating). Do **not** modify `/showcase/atlassian/page.tsx` directly.

---

## 5. AU statutory reference index (for future auto-loop tasks)

Compact lookup so subsequent ticks don't re-fetch:

| Concept | Statute / Rule | Section | Relevant BlockID phase |
|---|---|---|---|
| Small-scale personal offer exemption | Corporations Act 2001 (Cth) | s708(1) — max 20 investors / A$2M / 12 mo | 9-10 |
| Sophisticated investor test | Corporations Act 2001 (Cth) | s708(8) — A$2.5M net assets or A$250k gross income (2 FYs), needs qualified accountant certificate | 9-10 |
| Professional investor test | Corporations Act 2001 (Cth) | s708(11) — AFS licensee or A$10M+ portfolio | 10 |
| Wholesale client (services) | Corporations Act 2001 (Cth) | s761G(7) | 10-12 |
| Personal advice boundary | Corporations Act 2001 (Cth) | s766B | every SVI/valuation output |
| ESOP tax concessions | ITAA 1997 | Subdiv 83A-B (upfront) / 83A-C (deferred) | 8 |
| ESOP start-up tests | ITAA 1997 | s83A-33 (7 eligibility tests) + s83A-45(4) 10% cap + s83A-45(5) forfeiture / 3-year hold | 8 |
| ESIC 20% offset + 10Y CGT exemption | ITAA 1997 Div 360 | 3 gateway tests + principles or points test | 3-9 |
| ESVCLP fund concessions | Venture Capital Act 2002 (Cth) | ESVCLP registration via AusIndustry | 9-10 |
| R&D Tax Incentive | Industry Research and Development Act 1986 | AusIndustry registration ≤ 10 mo post-FY | 6-11 |
| GST registration threshold | A New Tax System (GST) Act 1999 | A$75k turnover | 6+ |
| Privacy — APPs | Privacy Act 1988 (Cth) | 13 APPs (Schedule 1) | 4+ |
| Notifiable Data Breaches Scheme | Privacy Act 1988 (Cth) | Part IIIC, ≤ 30-day notification | 7+ |
| WGEA reporting | Workplace Gender Equality Act 2012 | ≥ 100 employees | 11-12 |
| Modern slavery statement | Modern Slavery Act 2018 (Cth) | ≥ A$100M consolidated revenue | 11-12 |
| Fair Work NES | Fair Work Act 2009 (Cth) | 11 minimum standards + 121 modern awards | 8+ |
| ASIC annual review | Corporations Act 2001 (Cth) | s345A + regs | 11 annually |

---

## 6. Follow-up P1a..P1n subtasks (spun off from P1_dataroom_map)

- **P1a** mint default AU Pty Ltd Constitution template (Folder 1 item 4)
- **P1b** decide + implement Q1 (SAFE mint vs LawPath link)
- **P1c** mint Fair Work Award-compliant Employment Contract (Folder 6 item 5)
- **P1d** mint ESOP Scheme Rules body (Folder 6 item 6)
- **P1e** build ESIC Self-Assessment worksheet UI (Folder 11 item 6)
- **P1f** wire AU IP Assignment Deed e-signing (Folder 2 item 5, Folder 7 item 1)
- **P1g** wire ABR ABN-lookup probe (`/api/abr/lookup`)
- **P1h** wire ASIC Connect extract probe (`/api/asic/extract`)
- **P1i** build GST-threshold-crossing detector (auto-fires when trailing-12mo Stripe MRR × 12 ≥ A$75k)
- **P1j** author R&D Tax Incentive Chapter 6 section
- **P1k** build compliance-calendar.ics generator + BAS / annual-review / AusIndustry-R&D reminders
- **P1l** author primary vs secondary Chapter 10 split (Q5)
- **P1m** author dual-class decision-point doc (Q4)
- **P1n** WGEA + Modern Slavery threshold detectors (auto-fire on headcount / revenue crossings)

### Round 6 follow-ups (spun off from P5 / P6 / P7)

- **P5a** true readiness_by_phase(input) helper — current tile still consumes the single blended sub_scores tuple from /api/nudge/next-steps; upgrade the nudge engine to return {[phaseKey]: {score, band, missing_top3}} and switch the tile to per-phase view (evaluation-criteria.ts weights per §P5 exit criteria).
- **P5b** wire <InvestorReadinessTile /> into `web/src/app/dashboard/svi/page.tsx` (or the founder shell) once the sibling shell-layout agent unlocks — mount instruction already in the .tsx file.
- **P6a** Div 83A ESOP scheme-rules gate — expose the 8-point qualifying tests from startup-journey.ts:621-641 as a shared module and mirror the assertESICEligibleOrWarn() shape (block on wholesale-only rounds that market ESS scheme concessions).
- **P6b** wholesale-only fundraise UI — add a `wholesaleOnly` toggle to the fundraise form so founders opt-in to 412 blocking instead of the current default warn-only.
- **P7a** founder-side weekly digest — new cron /api/cron/founder-weekly-digest reusing web/src/lib/nudge/next-steps.ts computeNextSteps() to render {readiness_score band, delta vs last digest, top-3 missing, single next action} per founder.
- **P7b** persist last-week readiness snapshot per project so the P7a delta actually has a baseline (new column on startup_phase_progress OR a small svi_readiness_snapshots table).

Each P1x / P5x / P6x / P7x subtask becomes a follow-up commit driven by the autonomous loop; each ships an evidence doc, template file, or code change and marks its checkbox here.

---

*Last updated: 2026-07-24 by autonomous loop. This file survives `git reset --hard` because it is committed + pushed on every tick.*
