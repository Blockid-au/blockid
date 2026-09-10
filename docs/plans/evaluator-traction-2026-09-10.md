# Evaluator Traction — pricing + positioning for investors, accelerators, incubators, consulting & service firms — Goal Doc

> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](./SOURCE-OF-TRUTH.md) — consult that file first.
> **Goal ID:** G12 · **Opened:** 2026-09-10 · **Owner:** CEO (Do Van Long) · **Status:** plan approved 2026-09-10; ledger tasks T0268–T0275 pending; **no code yet**.
> **Companion:** [`money-finder-2026-09-10.md`](./money-finder-2026-09-10.md) (G11 — Money Finder / Founder Radar; the Evaluator Progress Radar consumes G11 signals).
> **Founder decisions (2026-09-10):** D1 evaluator trial = 7 days, **card required** (same Stripe mechanism as founders) · D2 public rungs = **Scout A$79 · Firm A$149 · Program A$349** (re-using `investor_angel / investor_advisor / investor_vc_small`) · D3 **A$3 = full Trust BizReport** for founders and evaluators, A$5.50 SKU retired · D4 doctoral-research wording **approved** (never "PhD") · data principle **approved**: "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case — not to train models for anyone else. Founder-consented access tiers control who sees what." (provider check at T0275).
> **Entity:** Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW.

Founder request (2026-09-10), verbatim intent: research and plan traction for investors, accelerators, incubators, consulting firms and service providers who evaluate startups and want regular progress updates; 7-day free trial after registering; A$3 per report per startup they enter; founder pricing unchanged (1 free → A$3 full Trust BizReport → A$29 subscription); most attractive price structure for this group; clear differentiation from competitors and from "just ask ChatGPT" (BlockID has its own flow, 11 C-Level expert agents, domain knowledge + internal expert methodology from doctoral research inside the engine, valuation on the startup's own accumulated data, AU startup process/legal/market/customer-behaviour research); attractive, easy-to-sell, easy-to-understand messaging; merge with the upgrade plan; no code.

---

## 0. Context

**Founder request (2026-09-10):** win traction with the people who *evaluate* startups and want regular progress on them — investors, accelerators, incubators, consulting firms, service providers. Give them a 7-day free trial after registering, plus **A$3 per report for each startup they enter**. Keep founder pricing as-is (1 free analysis → A$3 full Trust BizReport → A$29 subscription). Build the most attractive price structure for evaluators, state clearly what BlockID does that competitors and "just ask ChatGPT" cannot, and make the message easy to sell and easy to understand.

**Why now (from the source review):** the B2B ladder already exists in code but is invisible and unsellable — `plans.csv` has Angel A$79 · Advisor A$149 · VC Small A$349 · Cohort Starter A$500 · Growth A$1,500 · Enterprise A$3,500 (all `public:false`, no Stripe price env vars, excluded from `/signup`, every CTA lands on a contact form that drops the plan parameter). The investor workspace (deal-flow, watchlist, portfolio, weekly digest, TBR share links, per-investor link tracking, cohort dashboard, quarterly LP export, reseller/mentor console with consent tiers, partner API) is largely built. The gap is packaging, self-serve entry, a "startups I evaluate" object, and positioning.

**Outcome:** a self-serve **Evaluator** ladder (trial → A$3/report → Scout / Firm / Program subscriptions → Contact Sales), a positioning that owns "one rubric, a whole C-suite, the startup's own evidence, Australian context, A$3", and a 90-day traction sequence into AU angel groups, accelerators and advisory firms.

---

## 1. What exists (reuse, don't rebuild)

| Asset | Where | State |
|---|---|---|
| Evaluator plans | [`web/src/config/pricing/plans.csv:7-13`](../../web/src/config/pricing/plans.csv#L7-L13) investor_angel 7900 · investor_advisor 14900 · investor_vc_small 34900 (5 seats) · investor_vc_ent · accelerator_starter 50000 (14-day trial) · growth 150000 · enterprise 350000; flags `investor.dealflow`, `investor.watchlist`, `advisor.clients`, `white_label`, `investor.portfolio`, `investor.lp_export`, `cohort_dashboard`, `cohort_reports`, … | exist, hidden (`plans-v2.ts` `public:false` L213-328; `pricing-matrix.tsx:75` routes investor/advisor/accelerator to contact) |
| Stripe | `stripe.ts:33-79` map has only `accelerator`; investor rows have no price ids; checkout resolves `dbPlan.stripe_price_id ?? STRIPE_PRICE_MAP` | **human-blocked: mint prices** |
| Trial | `trial-copy.ts` "7-day, card required"; checkout `trial_period_days` + `payment_method_collection:"always"`; `/signup` allow-list = founder_* only (`signup/page.tsx:30-34`, `register-with-card/route.ts:60-65`, `account_type` enum founder/investor/journalist) | founder-only; **no no-card trial state** (onboarding "Continue without card — 14-day evaluation" writes nothing) |
| Workspace | `/workspace/investor` (dealflow · watchlist · portfolio · preferences · digest), `/workspace/accelerator` (cohort, quarterly LP report → `/api/reports/quarterly`), `/workspace/advisor` (roster, notes), `lib/investor-portal.ts` (`getDealFlow`, `getWatchlist`, `getPortfolio`…) | built; tables `investor_portfolio`, `watchlist_digest`, `advisor_client_roster` **have no migrations** (pages degrade to empty) |
| Third-party startup creation | `lib/plans/startup-limit.ts:22-32` multi-startup account types (investor, advisor, accelerator, incubator, reseller…); `api/reseller/create-startup` provisions a startup + attribution + magic link; mentor consent tiers `lib/mentor/access-tiers.ts` (`attributed_only → reports_shared → full_mentor`) | reseller-only; investor plans lack `profiles` limit (fallback 1) |
| Reports | A$3 `ONE_CLICK_REPORT_3AUD` (guest, 8-dim scorecard + AUD valuation range); `TRUST_REPORT_5AUD` A$5.50 (never sold); credits `svi_analysis 0.50`, `full_report_standard 2.00`, `enhanced_report_standard 3.00` (13-criteria multi-agent), `enhanced_report_investor 10.00` | live |
| Progress mechanics | `svi-snapshot` weekly, `svi_readiness_snapshots`, `watchlist-digest` (≥5 pt move or stage change, daily), `investor-weekly-digest` (top-5 movers, Sunday), TBR share + `tbr_leads` + Telegram, `investor_link_views` | live |
| Reseller module | wholesale/retail, 0/10/20/30/40 % tiers, codes, credits budget, monthly reconciliation, mentor console | shipped (G1) — this is the **consulting/service-provider channel** |
| Partner API | `POST /api/v1/analyze` Bearer `bk_live_…`, credit-metered | live (flag `api.access` on VC Ent / Enterprise) |
| Positioning copy | `/team` "11 AI-Agent C-Levels"; how-it-works "Thirteen criteria across eight dimensions… Berkus, VC method, DCF, comparables in AUD"; `svi-entrance.tsx:1411` "ChatGPT and Claude are great for building products… valuing your company needs a purpose-built platform"; comps-wall "valuation data on 500+ Australian SMEs no US competitor has"; 12-phase journey, 8 canonical stages | live; **no "research-backed / doctoral" claim exists yet** |
| Founder credential | `knowledge-base/docs/NVIDIA-Application-Proposal-CV.md:98` — **DBA candidate, SSBM 2023–2027**, research on multi-model startup valuation | citable as "doctoral research" — **wording needs founder sign-off** (never "PhD") |
| Solutions pages | `/solutions/investor` ("Read a founder's data room without asking them for anything"), `/solutions/accelerator` (admits batch scoring + sponsor report "in build"); **no `/solutions/advisor`**; contact form ignores `?plan=`/`?intent=` | partial |

---

## 2. Market facts that shape the offer (research 2026-09-10; full table → goal doc appendix)

- **Price anchors (evaluation of one startup):** AU accountant desktop valuation A$2,985–3,990 + GST · Equidam Advanced US$412 (≈A$635) / Expert US$1,063 · Valutico ~US$7k/yr licence · Kruncher AI analyst ≈US$5/analysis on US$499–2,499/mo · Inodash US$2.49/deck (founder-side) · Crunchbase Pro US$49/mo (7-day trial) · Dealum Investor Plus US$39/mo (10-day trial) · Dealum Network US$119–719/mo · AcceleratorApp US$200–800/mo · Affinity US$2,000–2,700/seat/yr · Techboard (AU) A$1,625 + GST/user/yr · PitchBook US$15–20k/seat.
- **Nobody sells an investor-facing, evidence-backed, per-startup report at A$3 with weekly progress** — the closest are founder-side deck graders (US$2.49) and VC AI analysts (~US$5/credit on a US$499+ floor).
- **Buyer pain (numbers):** associates screen 30–40 decks/day, 200 considered → 4 closed, 118–120 DD hours per closed deal; only ~50 % of portfolio companies send monthly updates; LP quarterlies due 45–60 days after quarter end (20–40 GP hours saved by tooling); accelerators must score hundreds of applications against a rubric and cannot collect alumni data; 85 % of VCs say they use AI daily but only 12 % have a governed workflow.
- **"Why not ChatGPT" evidence:** GPT-4o and Claude give *systematically different verdicts on identical decks*; models hallucinate founder histories and market figures; no persistence, no audit trail, no private data; VC Lab (Jul 2026) warns not to upload confidential docs; multi-agent role separation with evidence tracing is the published remedy (arXiv 2605.13110).
- **AU sizing:** 18 early-stage VC funds (Side Stage/Dealroom 2026) + 135 investor orgs in Cut Through's survey base + ~250 accelerators/incubators (Tracxn) + 5 angel groups (~500+ members; Sydney Angels ~40 applicants × 6 cycles/yr) + 500+ Startmate First Believers alumni + 4,345 accounting firms / 63,865 registered tax practitioners touching ESIC & R&DTI (~15,000 R&DTI claimants/yr). 2025: 390 deals, A$5.4B; Q2 2026 only 31 sub-A$5M rounds — screening quality matters more than ever.

---

## 3. Pricing design — "Evaluator" ladder (founder ladder untouched)

### 3a. Principles (CRO/CFO guardrails)
- Founder ladder stays: Free (1 analysis) → **A$3 full Trust BizReport** → Starter A$29 (Founder Radar per G11) → Growth A$69. *One consequence:* retire the never-sold A$5.50 `TRUST_REPORT_5AUD`; **A$3 = the full Trust BizReport** everywhere (one price, one story).
- Evaluators get the **same A$3 report per startup they enter** — pay-as-you-go, no subscription needed. Subscriptions sell *monitoring + workflow*, not access.
- **7-day trial starts at registration, card required** (founder decision D1, 2026-09-10 — same mechanism as the founder trial): registering as an evaluator starts a 7-day Stripe trial on **Scout** (or the rung chosen on `/pricing`); no charge during the trial; cancel-before-day-7 = nothing billed. Reuses `payment_method_collection:"always"` + `trial_period_days` + `trial-end-reminder` / `trial-charge-warning` crons — no new trial state needed.
- Reuse existing `plans.csv` rows (re-labelled), credit packs (A$5→100 credits at A$0.60–1.00/credit), reseller module for firms. No new tier ids.

### 3b. Ladder

| Rung | Who | Price | What you get | Reuses |
|---|---|---|---|---|
| **Evaluator Trial** | anyone who registers as investor / accelerator / incubator / advisor / service provider | **A$0 for 7 days, card on file** (Stripe trial on Scout by default; converts to A$79/mo on day 8 unless cancelled) | Full Scout workspace: add startups you're evaluating, one rubric across all of them, deal-flow browse, watchlist, **1 free Trust BizReport** on the first startup you enter, weekly progress digest | `register-with-card` + checkout trial (`trial_period_days`), `account_type` extension, `startup-limit.ts` multi-startup types |
| **Pay-as-you-go** | after trial, or without subscribing | **A$3 per Trust BizReport per startup** (= 3 credits; packs 10 → A$25, 50 → A$99 via existing credit packs) · re-score of a startup you already hold: **A$1** (1 credit) | Full 8-dimension / 13-criteria report, AUD valuation range with methods, next-step plan, PDF; the startup profile stays in your workspace; consent tier `attributed_only` | `ONE_CLICK_REPORT_3AUD` pattern, `credits.ts`, TBR |
| **Scout** — `investor_angel` | angels, syndicate members, mentors, solo consultants | **A$79/mo** (A$790/yr) | **10 reports/mo included** (A$30 value), 25 tracked startups, weekly *Progress Radar* (score deltas, stage changes, new evidence, deadline & program signals from G11), deal-flow + watchlist, ICS calendar, share-link tracking | plans.csv row 7; `watchlist-digest`, `investor-weekly-digest` |
| **Firm** — `investor_advisor` | advisory / consulting / accounting / legal firms, mentors with clients | **A$149/mo** (A$1,490/yr) | **30 reports/mo**, 50 tracked startups, **3 seats**, white-label PDF + client roster, consent-based *full mentor* access (founder-approved), R&DTI / ESIC / s708 checks per client, application drafts (credits), monthly client progress pack | plans.csv row 8 (`advisor.clients`, `white_label`), reseller mentor console + access tiers, `cfo-au-tax-incentives.ts` |
| **Program** — `investor_vc_small` | VC teams, accelerators, incubators, university programs | **A$349/mo** (A$3,490/yr) | **100 reports/mo**, 200 tracked startups, **5 seats**, **batch scoring** (score a whole application round or cohort on one rubric), cohort dashboard, quarterly **LP / sponsor report** export, read-only API, custom rubric weights | plans.csv row 9 (`investor.portfolio`, `investor.lp_export`), `cohort_members`, `/api/reports/quarterly`, `/api/v1/analyze` |
| **Contact Sales** | multi-cohort accelerators, funds ≥5 seats, enterprise | Cohort Growth **from A$1,500/mo** · Cohort Enterprise **A$3,500/mo** · VC Enterprise custom · **Reseller/wholesale** (0–40 % tiers, bill-back) | unlimited seats/credits, SSO, white-label reports, dedicated success manager, wholesale provisioning of founder accounts | existing rows 10–13, reseller module |

Unit economics check: a Trust BizReport costs A$0.40–1.20 in model spend at `enhanced_report_standard` depth (`credits.ts:241-244`); A$3 ≈ 60–85 % gross margin on the wedge; included quotas in subscriptions price at A$0.79–1.16/report of list — still ≥ break-even at free-model provider mix. Annual = 2 months free (existing 10× pattern).

### 3c. What changes in code later (sized for the ledger, not built now)
1. `plans.csv`: `public:true` for the 3 rungs, `profiles` limits (25/50/200), `reports_per_month` usage limit (10/30/100), `seats`; `plans-v2.ts` copy re-synced to csv (drift found).
2. Stripe: mint `STRIPE_PRICE_INVESTOR_ANGEL|ADVISOR|VC_SMALL` (+annual) — human-blocked; add to `stripe.ts` map + `sync-stripe-pricing.mjs`.
3. Signup: `/signup?segment=evaluator&plan=investor_angel|investor_advisor|investor_vc_small` → extend `FOUNDER_TRIAL_PLAN_IDS` / `ALLOWED_PLAN_IDS` (`signup/page.tsx:30-34`, `register-with-card/route.ts:60-65`) and the `account_type` enum (`investor, accelerator, incubator, advisor, service_provider`); Stripe trial via existing checkout (`trial_period_days` from `plans.csv trial_days=7`, card required); trial banner + T-3 / T-1 reminders reuse `trial-end-reminder` / `trial-charge-warning`; `TrialBanner` copy for evaluators.
4. "Add a startup" for evaluators: generalise `api/reseller/create-startup` → `POST /api/evaluations` creating a project with `owner_kind='evaluator'`, attribution row, invite-the-founder magic link (consent tier upgrades when founder accepts); rename in UI "Startups I'm evaluating".
5. Missing migrations: `investor_portfolio`, `watchlist_digest`, `advisor_client_roster` (+ `evaluations` table).
6. Report purchase inside workspace: `POST /api/evaluations/[id]/report` → `canAfford('trust_report')` (3 credits) / quota decrement → `orchestrateReport` (13-criteria) → PDF/TBR token.
7. Batch scoring (Program): queue N startups → `enhanced_report_standard` each, off-peak, cohort table view + CSV; sponsor/LP report = extend `/api/reports/quarterly`.
8. Progress Radar for evaluators: extend `watchlist-digest` to evaluator-owned projects; merge G11 Money Radar signals (grant deadlines / program intakes for the startups they track).
9. `/solutions/advisor` page (missing) + `/solutions/investor|accelerator` rewrite; `/pricing` gets an **Evaluator tab** next to Founder; contact form reads `?plan=` and posts Telegram.
10. Founder-side: A$5.50 SKU retired; "Trust BizReport A$3" label unified.

---

## 4. Positioning — what BlockID owns that competitors and ChatGPT don't

### 4a. Six differentiators (each backed by something shipped or cited)
| # | Claim (sales language) | Proof in product | Competitor gap |
|---|---|---|---|
| 1 | **One rubric for every deal.** 8 dimensions × 13 criteria × 12 growth phases, scored the same way for every startup in your pipeline or cohort — so scores are comparable | `evaluation-criteria.ts`, `svi-analysis.ts`, `growth/phase-taxonomy.ts`; how-it-works copy | ChatGPT gives different verdicts on identical decks (developmentcorporate 2026); CRMs have no rubric; deck graders score decks, not companies |
| 2 | **A whole C-suite reviews each startup.** 11 C-Level agents (CFO valuation, CLO legal/ESIC/s708, CMO market, CRO funding readiness, CTO tech, CHRO team…) each with its own domain module and AU knowledge, then an auditor checks the claims | `report-pipeline/` orchestrator, `agent-prompts.ts` `AU_CONTEXT`, `llm-auditor.ts`, `/team` | single-prompt tools lack role separation & evidence tracing (arXiv 2605.13110); Kruncher/Wokelo are single-analyst |
| 3 | **The startup's own evidence, accumulating — and it stays theirs.** Evidence vault, weekly SVI snapshots, score history, data room, founder-side next steps — the company updates itself and you see the delta. Data principle: the startup owns its data; BlockID stores it only to process and to give the AI the fullest context for *that* case, never to train models for others | `svi-snapshot`, `svi_readiness_snapshots`, `watchlist-digest`, TBR, `investor_link_views` | ChatGPT has no private data or memory; Equidam/valuers are one-off; portfolio tools depend on founders emailing updates (~50 % do) |
| 4 | **Built for Australia.** Valuations in AUD (Berkus, VC method, DCF, comparables), 500+ AU SME comps, ESIC / R&DTI / s708 / ASIC baked into the workflow, AU grants & programs (G11) | `cfo-au-tax-incentives.ts`, `au-comparable-raises.ts`, compliance calendar, seeds | Carta (Sydney) = cap tables; Techboard = funding data; PitchBook/Dealroom US/EU-centric; none score readiness |
| 5 | **A$3, not A$3,000.** Institutional-grade rubric at consumer price; 7-day free trial; subscriptions from A$79 | SKU + credits | AU desktop valuation A$2,985+; Equidam A$635; Kruncher US$499/mo floor; Affinity US$2k/seat |
| 6 | **Method, not vibes.** Scoring framework documented in a public 12-chapter guide and grounded in the founder's doctoral research on multi-model startup valuation (DBA, 2023–27) — *wording to be approved by founder; never "PhD"* | `/guide`, `KNOWLEDGE_BASE_INDEX.md` 5-method blend, 8-dimension framework | competitors publish no methodology |

### 4b. "Why not just ask ChatGPT?" — the one-paragraph answer (sales + FAQ)
> ChatGPT gives you an outside-in opinion on whatever you paste, and a different one tomorrow. BlockID runs an inside-out review from the startup's own evidence — the same 8-dimension, 13-criteria rubric for every company, a full C-suite of specialist agents with Australian law and market context, an auditor that flags unsupported claims, and a score that updates every week as the company changes. You don't write forty prompts and stitch the answers together; you add the startup and read the report. Then you watch it move.

Supporting bullets: consistent verdicts (vs model-to-model variance) · no hallucinated founder histories — claims are tied to evidence or marked missing · confidential: founder-consented access tiers, no pasting decks into a public chat — **approved data principle (founder, 2026-09-10):** "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case — not to train models for anyone else. Founder-consented access tiers control who sees what." — T0275 publishes this on /solutions/*, the comparison page and the privacy policy, and verifies each provider policy in the free-model chain so the claim holds end-to-end · time: minutes, not 30–60 min per deck · audit trail for your IC / LP.

### 4c. Messaging pack (EN → VI; speakable per G11 D-5 rules)
- **Investor line:** *"One score across 8 investor dimensions, backed by the startup's own evidence — screen a deal in minutes and watch it move every week."* / *"Một điểm số trên 8 tiêu chí nhà đầu tư, dựa trên chính dữ liệu của startup — sàng lọc deal trong vài phút và theo dõi biến động mỗi tuần."*
- **Accelerator / incubator line:** *"Score the whole cohort on one rubric, then show sponsors the progress — automatically."* / *"Chấm cả cohort trên một bộ tiêu chí, rồi báo cáo tiến độ cho nhà tài trợ — tự động."*
- **Advisor / consulting line:** *"A C-suite review of every client, in AUD, with ESIC and R&D Tax checks — white-labelled, A$3 a report."* / *"Một bản đánh giá cấp C-suite cho mỗi khách hàng, tính bằng AUD, kèm kiểm tra ESIC và R&D Tax — gắn thương hiệu của bạn, A$3 mỗi báo cáo."*
- **Pricing card headline:** *"Evaluate any Australian startup for A$3. Track it for A$79 a month."*
- **Trial CTA:** *"Start evaluating — 7 days free, cancel anytime"* · **Report CTA:** *"Run a Trust Report — A$3"* · **Upgrade nudge (after 3rd A$3 report):** *"You've spent A$9 on 3 reports. Scout gives you 10 a month plus weekly progress for A$79."*
- **Tagline for this segment:** *"The credit score for startups — for the people who back them."*

---

## 5. Traction plan (90 days, sequenced by cheapest trust first)

| Phase | Weeks | Segment | Motion | Target |
|---|---|---|---|---|
| T1 Warm angels | 1–3 | Sydney / Brisbane / Melbourne / Perth Angels members, Startmate First Believers alumni (500+), Innovation Bay | Founder outreach + group offer: "score this cycle's 40 applicants on one rubric" — free 7-day trial, A$3/report; ask 5 for testimonials | 30 trials, 10 Scout, 100 reports |
| T2 Accelerator pilots | 3–8 | 3 programs from our own `programs-au.seed.json` with open intakes (e.g. Plus Eight, Curtin Accelerate, UQ ilab; plus Cicada, EnergyLab) | 14-day **Program** pilot on a live application round (batch scoring), sponsor-report sample; co-marketing on the program's demo day | 3 pilots → 2 paid Program |
| T3 Advisory firms via reseller | 6–12 | R&DTI/ESIC advisors (Rimon-type), CFO-for-hire, startup accountants/lawyers (4,345 firms) | Reseller onboarding (existing 0–40 % tiers): Firm plan + wholesale founder accounts; "Trust Report as a deliverable" playbook; webinar with Yarpa/Kinaway/Business chambers | 10 Firm, 3 resellers |
| T4 Content & proof | 1–12 | all | `/solutions/investor|accelerator|advisor` rewrite, comparison page "BlockID vs ChatGPT vs a valuer", 3 case studies (angel cycle, cohort, advisory client), LinkedIn SVI page posts, Cut Through / Startup Daily pitch | 2 press mentions, 500 evaluator signups |
| KPIs | — | — | trial→Scout ≥ 15 %; reports per evaluator ≥ 4/mo; Program pilot→paid ≥ 50 %; CAC < 1× first-year ARPA; NPS ≥ 40 | GA4 events `evaluator_signup`, `evaluation_added`, `report_purchased`, `evaluator_upgrade` |

---

## 6. Decisions for founder (asked before finalising)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Evaluator trial without card at registration | **Decided 2026-09-10: card-required**, same Stripe trial mechanism as founders (7 days on Scout by default) |
| D2 | Public rung names/prices | **Decided: Scout A$79 · Firm A$149 · Program A$349** re-using `investor_angel / investor_advisor / investor_vc_small`; accelerator rows stay Contact Sales |
| D3 | Retire A$5.50 Trust Report SKU; A$3 = full Trust BizReport for founders and evaluators | **Decided: yes** (one price, one story; re-score A$1) |
| D4 | Doctoral-research wording | **Approved 2026-09-10:** "grounded in the founder's doctoral research (DBA) on startup valuation" — never "PhD" |

---

## 7. Ledger + docs on approval (no code)

- **Goal doc** `docs/plans/evaluator-traction-2026-09-10.md` = this plan + research appendices (competitor table 54 rows, JTBD, ChatGPT critiques, AU sizing) + P↔T map.
- **SOT**: G12 block (§1), rows G12-P1…P8 with ledger IDs (§2), §5 human-blocked (Stripe evaluator prices, D4 wording, CISO/CLO data-handling sentence), §7 marker `update /pricing when T02xx closes`, change log; G11 goal doc §4h gains "Evaluator Progress Radar consumes G11 signals".
- **project-state.json** tasks **T0268–T0275** (agents cro/cpo/cto/cmo/clo; T-id-in-commit rule):
  - T0268 (cro, minor) Evaluator ladder in `plans.csv` public + limits + `plans-v2.ts` sync + `/pricing` Evaluator tab + retire A$5.50 SKU — *Wave A*
  - T0269 (cto, minor) Evaluator signup: card-required 7-day Stripe trial on Scout/Firm/Program, `account_type` extension, `/signup?segment=evaluator`, allow-lists, evaluator trial banner copy — *Wave A*
  - T0270 (cto, minor) `evaluations` object: add-a-startup for evaluators (generalised reseller create-startup), consent tiers, missing migrations (`investor_portfolio`, `watchlist_digest`, `advisor_client_roster`) — *Wave B*
  - T0271 (cfo, minor) In-workspace Trust Report purchase (3 credits / quota) + re-score A$1 + PDF/TBR — *Wave B*
  - T0272 (cpo, minor) Batch scoring + cohort table + sponsor/LP report (Program) — *Wave C*
  - T0273 (cmo, minor) Evaluator Progress Radar digest (extend `watchlist-digest`, merge G11 signals) — *Wave C* (depends G11 T0245)
  - T0274 (cmo, patch) `/solutions/advisor` + investor/accelerator rewrite + "BlockID vs ChatGPT vs a valuer" page + messaging keys EN/VI + GA4 events — *Wave A/B*
  - T0275 (clo, patch) Compliance: provider data-handling sentence, AFSL/general-advice disclaimer for evaluator reports, doctoral-research wording sign-off — *Wave A*
- **Roadmaps**: `feature-upgrade-roadmap-v2.md` Q4 block "Evaluator Traction — G12"; `ROADMAP.md` §4 rows; `pricing-upgrade-plan-2026-07-16.md` amendment (Evaluator ladder = existing investor rows made public; A$5.50 retired; SOT §6 rule 5 bundle lands with T0268).

## 8. Verification (post-implementation)
- Trial: register as evaluator → card captured, Stripe subscription in `trialing` with `trial_end` = +7d, T-3/T-1 emails, workspace shows "Startups I'm evaluating"; day 8 → first charge A$79 (or cancelled → workspace read-only, A$3 pay-as-you-go still works).
- Money: A$3 report from workspace → `credit_transactions.reason="trust_report"`; Scout quota decrements; 11th report in a month charges 3 credits; annual = 10×.
- Batch: Program user scores 20 startups in one run; cohort CSV + sponsor PDF export.
- Copy: every differentiator claim on `/solutions/*` maps to a row in §4a; ChatGPT paragraph reviewed by CLO; no "PhD".
- Traction: GA4 funnel `evaluator_signup → evaluation_added → report_purchased → evaluator_upgrade`; weekly cohort in `/admin`.


---

## Appendix A — Competitor & comparable table (web research 2026-09-10; FX A$1 ≈ US$0.65)

| Product | Category | Buyer | Pricing | Evaluation / progress function | AU |
|---|---|---|---|---|---|
| Carta (cap table, fund admin, LP analytics) | portfolio/admin | founders, VC, LPs | Launch free (<25 stakeholders); US$2,988–11,988/yr; median spend US$15.4k/yr; fund admin US$3k–15k/mo | cap table, 409A, quarterly LP reports, AI extraction of portfolio data | Sydney office Nov 2024 |
| Vauban (Carta) | SPV | angels, syndicates | US$2,000 + 2 % of raise | SPV admin | via Carta |
| AngelList Venture | fund admin | emerging managers | 0.10–0.15 % of fund + US$10–20k/yr; SPV US$8k + 2k | fund admin, portfolio tracking | US-centric |
| Affinity | deal-flow CRM | VC associates | US$2,000–2,700/user/yr; 5–15 seats = US$12–35k | relationship intel, AI notetaker, deck file analyser | none |
| 4Degrees | CRM | small funds | ~US$1,200–1,800/user/yr | pipeline | none |
| Dealroom | data | VCs, gov | US$14,500/yr from 3 seats; no trial | startup DB, benchmarking | data only |
| PitchBook | data | institutional | US$12–30k+/seat/yr | financials, comps | APAC sales |
| Crunchbase Pro | data | angels, associates | US$49/mo annual, US$99 monthly, **7-day trial** | search, alerts, AI predictions | thin pre-seed AU |
| CB Insights | data | corp strategy, VC | US$30k–100k+/yr; 10-day no-card trial | Mosaic health scores | none |
| Tracxn | data | VC, corp dev | from ~US$550/mo | sector maps, AU annual reports | AU reports |
| Harmonic.ai | sourcing + AI | funded VCs | US$20–24k/seat/yr, 3-seat min | Scout AI agent | none |
| Specter · Sourcescrub · Grata | sourcing | VC/PE | quote (Grata median US$155k/yr) | company signals | none |
| Visible.vc | portfolio monitoring | VC funds, accelerators | quote (~US$400–600/mo small) | data requests to portfolio, LP reports | some AU funds |
| Standard Metrics | portfolio monitoring | VC/PE | free small funds → US$15–80k/yr | AI parsing of founder updates, LP reporting | none |
| Rundit · Vestberry | portfolio monitoring | VC, family office | quote; Vestberry from ~US$21.9k/yr (AUM-based) | KPI collection, LP analytics | none |
| Zapflow | CRM + PM | VC/PE | €995/team/mo; €199/fund/mo IR & PM | deal flow, LP portal | none |
| Equidam | valuation | founders; pro licences | free tier; Advanced US$412 (2-month window); Expert US$1,063; 409A US$1,990/yr | 5-method valuation | AU params |
| Valutico | valuation (advisors) | accountants, advisors | ~US$7,000/yr licence | DCF/multiples reports | global |
| Gust | angel-group mgmt | angel groups (350+) | founder US$450–1,250/yr; groups ~US$1–2k/yr | applications, review, syndication | Sydney Angels, Club Investible |
| F6S | accelerator mgmt | accelerators | free basic; enterprise ~€1,000/mo | intake, shortlist, score | many AU programs |
| Dealum | angel/accelerator mgmt | networks, angels | Network US$119–719/mo; Investor Plus US$39/mo (10-day trial) | funnel, voting, company reporting, AI | 214 countries |
| AcceleratorApp | accelerator mgmt | program ops | US$200–800/mo | weighted-rubric scoring, cohort dashboards | none |
| Metabeta · Acterio · Sopact Sense · Vestbee · Village Capital Abaca | accelerator/impact | programs | undisclosed / US$3–15k/yr | KPI/OKR reports, AI rubric scoring, VIRAL readiness scale | none |
| DiligenceVault | DD | allocators | usage-based, free trial | DDQs, AI autofill | none |
| Kruncher | AI DD + CRM | solo GPs, VC | US$499/mo (100 credits) → US$2,499/mo (500); ≈US$5/analysis | AI analyst, 580+ signals, portfolio watch | none |
| Wokelo · DeckMatch · V7 Go · Hebbia/Rogo/AlphaSense | AI DD | PE/VC, consultancies | enterprise, undisclosed | auto diligence reports, deck parsing, data-room Q&A | none |
| Evalyze · SeedBlink review · Inodash · PitchBob | founder-side deck graders | founders | free–US$19.9/mo; Inodash **US$2.49/report** | deck scores 1–1,000 | none |
| Lyzr "ChatGPT for VC" | private LLM | VC firms | quote | anti-ChatGPT positioning (private data, audit trail) | none |
| Perplexity Enterprise · ChatGPT Enterprise | general LLM | firms | US$40/seat/mo · ~US$45–75/seat/mo, ~150-seat min | research / assistant | global |
| Techboard | AU funding data | AU VC, gov | **A$1,625 + GST/user/yr**; no trial | AU funding events since 2017 | Perth |
| Cut Through Venture | AU reports | AU investors | free reports; syndicate | quarterly/annual funding + investor sentiment | AU |
| Startup Genome | ecosystem advisory | gov agencies | membership | GSER rankings | ranks Sydney/Melbourne |
| Airtree Open Source VC | free resources | founders, new investors | free | term sheet, DD guide, investor list | AU |
| SeedLegals (UK) · Cake Equity (AU) | legal/cap table | founders, lawyers | £49–4,990/yr · free–US$80/mo | round docs, cap table, investor portal | UK / Brisbane |
| Investible / Club Investible · Startmate First Believers | angel education / syndicate | AU angels | membership n/p · **A$5,500** per cohort (~70/cohort, 500+ alumni) | deal-by-deal DD, learn-by-investing | AU |
| Founderpath · Kruze/Mosaic | founder finance / accounting | SaaS founders | free dashboards · US$650–3,500/mo | underwriting, FP&A | US |

**Pricing patterns:** per-seat annual sales-led (Affinity, PitchBook, Harmonic, Techboard); self-serve monthly with 7–10-day trial (Crunchbase, Dealum, Perplexity); seat minimums (Dealroom 3, ChatGPT Enterprise ~150); per-fund / per-portfolio-company (Zapflow, Carta, Vestberry, Kruncher Portfolio); AUM-based with free entry (Standard Metrics, AngelList); per-application volume tiers (Dealum, AcceleratorApp); credit metering ≈US$5/analysis (Kruncher, DiligenceVault); per-report micro-pricing founder-side (Inodash US$2.49); time-boxed valuation windows (Equidam); no-card free tiers (Equidam, CB Insights, Carta Launch, Cake).

**One-off evaluation price anchors:** Equidam Advanced ≈A$635 · Expert ≈A$1,635 · 409A ≈A$3,060 · Valutico ~US$7k/yr · Professional Business Valuers (AU) from A$2,985 incl GST · ABVA A$3,990 + GST · AU desktop valuation A$2,000–5,000; comprehensive A$30,000+ · AI deck grade US$2.49 · Kruncher credit ≈US$5.

## Appendix B — Buyer jobs-to-be-done

| Segment | Pays for today | Pain (numbers) | Willingness to pay |
|---|---|---|---|
| Angel / syndicate lead | group dues, Gust/Dealum, Crunchbase, First Believers | Sydney Angels ~40 applicants × 6 cycles/yr, 3.9 % invested; cheques A$25–250k; no shared rubric | A$5,500 (First Believers); US$39–54/mo (Dealum); US$49–99/mo (Crunchbase) |
| VC associate / emerging manager | CRM, data, Harmonic, Kruncher | 200–500 decks/yr, 30–60 min each; 30–40 decks/day; 200 considered → 4 closed; 118–120 DD hrs per close; 85 % use AI daily, 12 % governed | US$1.2–2.7k/user CRM; US$499–2,499/mo AI analyst; US$12–20k/seat data |
| VC portfolio / LP reporting | Visible, Standard Metrics, Rundit, Carta | quarterlies due 45–60 days post-quarter, 15–25 pages; tooling saves 20–40 GP hrs/qtr; ~50 % of portfolio cos send monthly updates; 77 % of AU investors saw layoffs, 46 % shutdowns (2025) | free → US$15–80k/yr; ~US$400–600/mo; €199/fund/mo |
| Accelerator program manager | F6S, AcceleratorApp, Dealum, Sopact | score hundreds of applications on a rubric; weekly ops, monthly progress, end-of-cohort within 2 weeks of demo day; alumni data collection fails | US$119–800/mo; US$3–15k/yr |
| Incubator / university / gov program | Acterio, Sopact, Startup Genome | prove impact to public funders; persistent founder IDs across years | by program complexity |
| Consulting / advisory (CFO-for-hire, R&DTI/ESIC advisors) | Valutico, Equidam licences, Techboard | defensible repeatable reports; AU desktop valuations A$2–5k; ~15,000 R&DTI claimants/yr | US$7k/yr licence; A$1,625/user; clients pay A$3–4k/report |
| Lawyer / accountant service provider | Carta/Cake, SeedLegals | ESIC checks, s708, cap-table hygiene | white-label from US$99/mo (PitchBob precedent) |

## Appendix C — "Why not ChatGPT?" evidence (cite on the comparison page)

- General LLMs give **systematically different verdicts on identical decks** (GPT-4o vs Claude; Claude "underfunds" in 79 % of evaluations); hallucinated founder histories, competitors and market figures; thin-footprint founders look like no track record; 85 % of VCs use AI daily but only 12 % have governed workflows — developmentcorporate.com (2026).
- MicroVentures: AI "can hallucinate or invent facts", confirmation bias, "limited information on how it came to those conclusions"; use only with human intervention.
- Krause (SSRN 2023): private firms disclose little standardised data → limits ChatGPT as a DD tool.
- VC Lab (Jul 2026): general models "can confidently produce wrong information"; do not upload confidential docs without checking data policies.
- V7: text-only models return nothing for revenue slides shown as graphics; no routing to human review.
- SSFF (arXiv 2405.19456): hallucination, overgeneralisation, fuzzy semantics limit predictive reliability. VCBench (arXiv 2509.14448): LLMs can beat human precision **only** with a consistent, anonymised rubric.
- Multi-agent VC DD framework (arXiv 2605.13110): single-prompt LLMs lack role separation and evidence tracing — supports the 11-agent + auditor design.
- Vendor copy already positioning against ChatGPT: Lyzr (private data, audit trail), WorkWise (no deal data, no auditability), Kruncher ("a generic Kruncher is worth a fraction of a configured one"), SeedBlink (10k decks + VC interviews), 4Degrees ("a ChatGPT prompt in a Slack channel").
- Cost anchor: ChatGPT Enterprise ~US$45–75/seat/mo with ~150-seat minimum; Perplexity Enterprise Pro US$40/seat/mo — neither gives a rubric, AU legal context or an evidence-linked report.

## Appendix D — Australia sizing inputs

| Metric | Value | Source |
|---|---|---|
| AU deals 2025 | 390 deals, A$5.4B (+31 %); top 20 = 58 % of capital | Cut Through Venture 2025 |
| Medians 2025 / H1 2026 | Angel+pre-seed A$1.0M → A$1.3M; Seed A$2.5M → A$4.0M; A A$11M → A$18.6M | Cut Through |
| Q2 2026 | 64 venture rounds + 5 accelerator rounds; only 31 sub-A$5M rounds (lowest since 2020) | Cut Through Q2 2026 |
| Investor survey base | 135 investor orgs (Q2 2026); ~1,000 contributors annual | Cut Through |
| Early-stage VC funds | ~18 (Side Stage / Dealroom 2026); first-time managers −30 % since 2023; 41 % of sub-US$15M rounds had overseas investors | Forbes AU |
| VC AUM | A$65B+; ~A$5B deployed 2024 | AVCAL via nuvc.ai |
| Accelerators / incubators | ~249 (Tracxn; Sydney 90, Melbourne 50); 56 leading; 24 most active | Tracxn, Failory, SmartCompany |
| Angel groups | Sydney Angels ~100 members, 1,302 applications 2014–21; Brisbane, Melbourne, Perth Angels; Club Investible 200+ | sydneyangels.net.au, Investible |
| New-angel pipeline | First Believers ~70/cohort, 500+ alumni | Startmate |
| Advisory universe | 63,865 registered tax practitioners; 36,717 accounting-services businesses; 4,345 accounting firms HQ'd in AU; ~15,000 R&DTI claimants/yr (~A$3B) | TPB, IBISWorld, RevenueBase, Rimon |
| Techboard | 2,700+ companies profiled; A$1,625 + GST/user/yr | Techboard |
| LP reporting cadence | quarterly, due 45–60 days after quarter end | valueaddvc, Papermark |

**Serviceable market (conservative):** a few hundred paying organisations at the observed US$119–719/mo network band and US$1.2–2.7k/user CRM band; the A$3 report is the acquisition wedge feeding Scout/Firm/Program, mirroring Dealum (free → US$39/mo), Crunchbase (trial → US$49/mo) and Standard Metrics (free → US$15k+).

**Not sourced (flag):** exact registered-ESVCLP count (list at business.gov.au), Club Investible / Sydney Angels membership fees, official Visible/Rundit/Vestberry/Specter/Wokelo price lists, AU-specific hours-per-screen survey.
