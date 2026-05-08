# BlockID.au — Individual Idea-Phase Layer
## Supplementary Requirements & Prioritized Implementation Plan v1

**Date:** 2026-05-08
**Owner:** admin@blockid.au
**Status:** Draft for review
**Related artifacts:**
- `blockid_upgrade_solution_plan_v2.md` — wedge v2 (post-incorporation founders)
- `customer_journey_individual_idea.html` — 7-phase journey already designed
- `blockid_gtm_sales_first_v1.md` — Pilot Concierge AUD $5k SKU

---

## 1. Strategic Context & Alignment

### 1.1 Why this layer
The v2 wedge targets **post-incorporation Australian founders raising AUD $200k–$5M**. That is too late in the funnel to be the *only* acquisition path. Pre-incorporation individuals at idea phase ("Spark") are the cheapest and most defensible top-of-funnel for the same future customers, 6–18 months ahead of their first raise.

The four free calculators (`idea-valuation`, `equity-split`, `cofounder-match`, `funding-plan`) and the customer journey HTML for individuals already exist. They are **not yet a funnel** — they are isolated calculators with sessionStorage state and no lead capture, no PDF, no shareable link, no account bridge.

### 1.2 Strategic role (chosen 2026-05-08)
**Top-of-funnel only.** Idea-phase remains 100% free, gated only by email/Persistent BlockID account creation. No paid SKU at idea phase. The conversion event that matters is **Persistent BlockID account created with Cap Table v0 saved**. Upsell into Pilot Concierge AUD $5k happens 6–18 months later when the same individual incorporates and prepares to raise.

### 1.3 Wedge protection rules
- Idea-phase work must not consume more than **20% of engineering capacity** in any sprint while the v2 wedge is still pre-30 paying logos.
- No new ICP segmentation, no separate brand, no separate roadmap.
- All idea-phase output must produce an artifact that is reusable by the wedge product (Cap Table v0 → wedge cap table; Founder Pack PDF → wedge data room; Persistent BlockID → wedge account).
- AI valuation must remain framed as **range + confidence + "estimate based on assumptions"** per v2 plan §AI Valuation Engine. Never "definitive."

---

## 2. Current State Snapshot (as of 2026-05-08)

| Capability | State | Path |
|---|---|---|
| Idea valuation (Berkus + Scorecard, 9 inputs) | ✓ Live, sessionStorage only | `web/src/app/tools/idea-valuation/idea-valuation-tool.tsx` |
| Equity split (weighted points, ≤5 founders) | ✓ Live, sessionStorage only, "Save snapshot" disabled | `web/src/app/tools/equity-split/equity-split-tool.tsx` |
| Cofounder match (form + anonymized directory) | ✓ Live, persists to Supabase, no nurture | `web/src/app/tools/cofounder-match/`, `web/src/app/api/cofounder-match/route.ts` |
| Funding plan (burn + cap stack + dilution) | ✓ Live, sessionStorage only | `web/src/app/tools/funding-plan/funding-plan-tool.tsx` |
| Customer journey for individuals | ✓ Designed (7 phases), phase 7 (Persistent BlockID) not built | `customer_journey_individual_idea.html` |
| Lead capture in valuation/equity/funding | ✗ Missing | — |
| PDF export anywhere | ✗ Missing | — |
| Shareable `/s/[slug]` for idea-phase artifacts | ✗ Missing | — |
| Persistent BlockID account | ✗ Missing | — |
| Cross-tool shared state in Supabase | ✗ Missing (only sessionStorage) | — |
| AI-generated narrative / follow-up questions | ✗ Missing | — |
| Email nurture sequence | ✗ Missing | — |

---

## 3. Supplementary Requirements

### 3.1 Deeper Idea Evaluator (R-IDEA-1)
Extend `idea-valuation-tool.tsx` from **9 sliders** to **9 sliders + 19 new questions** organised in 4 dimensions, with Claude AI generating a written narrative and 3–5 personalised follow-up questions.

**New question dimensions (full bank in §4):**
- Problem-Solution Fit (PSF) — 6 questions
- Market Timing — 4 questions
- Distribution Edge — 5 questions
- Founder–Market Fit deep-dive — 4 questions

**Scoring contribution:**
- Existing Berkus+Scorecard: 60% of valuation band
- New 19-question quantitative: 25% of valuation band
- Qualitative Claude narrative confidence flag: ±15% band-width modifier (high confidence narrows band, low confidence widens)

**AI layer (Claude `claude-sonnet-4-6`):**
- Input: full intake (28 questions) + AUD valuation band
- Output (structured JSON via tool use):
  - `narrative` (250–400 words, AU investor tone)
  - `top_3_strengths` (bulleted)
  - `top_3_risks` (bulleted)
  - `follow_up_questions` (3–5 personalised, designed to push the founder to clarify weakest dimension)
  - `confidence` (`low` | `medium` | `high`)
  - `next_action` (one of 5 canned recommendations: validate-customer, find-cofounder, refine-pricing, prove-distribution, prepare-raise)
- **Mandatory caching:** system prompt + question definitions cached (changes <1×/week). Target cache hit rate ≥80%.
- **Cost ceiling:** ≤AUD $0.10 per run.

**Acceptance criteria:**
- 28 questions complete in ≤7 min median (UX timing).
- Narrative renders within 6 s p95 from submit.
- Valuation band stays within ±20% of current Berkus+Scorecard output for an unchanged 9-input baseline (regression guard).
- Output never claims "definitive valuation" — assertion validated in Claude system prompt + post-generation regex check.

### 3.2 Co-founder Role / Responsibility / Contribution Capture (R-EQUITY-1)
Augment `equity-split-tool.tsx` per-founder card with 3 new structured fields:

| Field | Type | Purpose |
|---|---|---|
| `responsibilities` | textarea, 3–5 bullets, 280 chars | Captured into Founder Agreement seed PDF |
| `commitments_next_12mo` | textarea, 280 chars | Drives vesting acceleration suggestion |
| `unique_contribution_narrative` | textarea, 500 chars | Feeds Claude justification of split fairness |

**New AI layer:** after split is computed, Claude generates a 150–250 word **fairness narrative** explaining why the split is defensible given the captured roles/contributions. Surfaces 1–2 fairness flags if narrative cannot reasonably justify the points.

**Acceptance criteria:**
- Existing weighted-points engine output unchanged (no math regression).
- New fields are optional — split still computes if blank.
- Fairness narrative renders only when ≥2 founders have all 3 fields filled.
- Founder Agreement seed PDF uses the captured responsibilities verbatim under each founder.

### 3.3 Founder Pack v0 — Unified Output (R-PACK-1)
Single artifact that bundles outputs from all 4 tools into one shareable PDF + `/s/[slug]` link. This is the **conversion artifact** — the thing the founder wants badly enough to give us their email.

**Contents (one PDF, 4–6 pages):**
1. Cover: founder name, idea name, AUD valuation band, date, BlockID watermark
2. Idea valuation summary (band, 3 strengths, 3 risks, narrative excerpt)
3. Co-founder roster (names, roles, responsibilities, equity %)
4. Equity split table + vesting schedule + fairness narrative
5. Funding plan summary (capital needed, raise scenario, dilution preview)
6. Next-steps checklist (link to incorporate, link to upgrade to BlockID Pro)

**Shareable link:** `/s/[slug]` reuses the existing pattern from `web/src/app/s/[slug]/*`. View tracking enabled (founder sees who opened).

**Acceptance criteria:**
- PDF generation ≤8 s p95.
- PDF file size ≤500 KB.
- `/s/[slug]` page renders Founder Pack as scrollable web view + "Open as PDF" button.
- View tracking writes to existing analytics table (reuse wedge plumbing).

### 3.4 Lead Capture & Persistent BlockID Account (R-AUTH-1)
The "Save Founder Pack" CTA is the gate. No friction before, hard gate at the moment of value delivery.

**Account model (lightweight):**
- Magic-link email auth via Supabase Auth (no password).
- One account = one Persistent BlockID profile.
- Profile holds: idea valuation runs (history), equity splits (history), funding plans (history), Founder Packs (versioned), cofounder match profile if any.
- Account is free forever at idea phase.

**Auth flow:**
1. User clicks "Save my Founder Pack" → modal with email field.
2. POST email → magic link sent (Resend, reuse existing template plumbing).
3. Click magic link → account provisioned, all sessionStorage state migrated to Supabase, Founder Pack PDF generated, `/s/[slug]` minted.
4. Land on `/dashboard` (new route) showing the Founder Pack + history.

**Acceptance criteria:**
- Magic link delivered in <30 s p95.
- Zero data loss during sessionStorage → Supabase migration.
- Account creation rate ≥25% of users who complete all 4 tools (target).

### 3.5 CTA Architecture (R-CTA-1)
Three layers of CTA, each with explicit copy and placement.

#### Layer A — In-tool nudges (soft, free)
After each tool completes, a **non-blocking** card appears:

| Tool | Card copy | Action |
|---|---|---|
| idea-valuation | "Your idea is worth AUD {{low}}–{{high}}. Want to lock this in and add a co-founder split?" | → equity-split (state hydrates) |
| equity-split | "Your split is set. Add a funding plan to see your dilution." | → funding-plan |
| funding-plan | "You've built a complete Founder Pack. Save it as a PDF and shareable link." | → Layer B (gate) |
| cofounder-match | "Found a potential co-founder? Run the equity split together." | → equity-split |

#### Layer B — Post-tool unified gate (the conversion moment)
Triggered when a user has completed ≥2 of the 4 tools. Full-screen modal (dismissible, but reappears on next tool completion):

> **Save your Founder Pack**
> AUD {{valuation_mid}} valuation • {{n}} co-founders • {{raise_amount}} planned raise
>
> Get the full PDF, a shareable link with view tracking, and a free BlockID account to come back anytime.
>
> [ email field ]  → **Send me the link**
>
> *No password. No spam. Free forever.*

#### Layer C — Email nurture sequence (5 touches over 14 days)
Triggered by account creation. Sent via Resend.

| Day | Subject | Purpose |
|---|---|---|
| 0 | "Your Founder Pack is ready (and a heads-up)" | Deliver PDF link, set expectation for sequence |
| 2 | "The 3 weakest signals in your pitch (and how to fix them)" | Personalised from Claude top-3 risks |
| 5 | "AU founders raising in 2026: 4 lessons from our pilot users" | Social proof, position BlockID Pro |
| 9 | "Your equity split — sanity-check from a lawyer" | Soft pitch: lawyer review add-on (Pilot signal) |
| 14 | "When you incorporate, here's what changes" | Bridge into wedge product, Pilot Concierge mention |

**Acceptance criteria:**
- Layer B modal CTR ≥35% of users who see it.
- Email open rate ≥40% (industry benchmark for warm signups is 35–50%).
- Day-14 → "interested in Pilot" reply rate ≥3%.

### 3.6 Persistence — Supabase Schema (R-DATA-1)
New tables (all RLS-protected, owner = `auth.uid()`):

```sql
-- Idea evaluations (one row per submit)
create table idea_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  inputs jsonb not null,           -- 28 question answers
  valuation_low_aud int not null,
  valuation_mid_aud int not null,
  valuation_high_aud int not null,
  ai_narrative text,
  ai_strengths jsonb,
  ai_risks jsonb,
  ai_follow_ups jsonb,
  ai_confidence text check (ai_confidence in ('low','medium','high')),
  created_at timestamptz default now()
);

-- Equity splits (versioned per founder set)
create table equity_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  founders jsonb not null,         -- array with role/resp/contribution
  esop_pct numeric,
  vesting jsonb,
  allocations jsonb not null,
  fairness_narrative text,
  fairness_flags jsonb,
  created_at timestamptz default now()
);

-- Funding plans
create table funding_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  burn_inputs jsonb not null,
  cap_stack jsonb not null,
  result jsonb not null,
  created_at timestamptz default now()
);

-- Founder Packs (the bundled artifact)
create table founder_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  slug text unique not null,       -- /s/[slug]
  evaluation_id uuid references idea_evaluations(id),
  split_id uuid references equity_splits(id),
  funding_id uuid references funding_plans(id),
  pdf_storage_path text,
  view_count int default 0,
  last_viewed_at timestamptz,
  created_at timestamptz default now()
);
```

Migration filename: `web/supabase/migrations/0005_idea_phase.sql` (next slot after existing 0001/0002/0003_investor_links/0004_cofounder_match).

### 3.7 Bridge to Paid Product (R-BRIDGE-1)
When the user later returns and indicates they have incorporated (new field on dashboard: "I've incorporated → enter ABN"), automatically:
1. Convert their Founder Pack data into the wedge product's intake (Investor-Ready Score v2).
2. Pre-fill the Score intake from their idea_evaluations + equity_splits + funding_plans.
3. Surface Pilot Concierge AUD $5k offer with a personalised note: "You've been with us X months. Here's how Pilot accelerates your raise."

This is the **single most important conversion path** for the entire idea-phase layer. It must work flawlessly.

---

## 4. Question Bank — 19 New Evaluation Questions

### 4.1 Problem-Solution Fit (PSF) — 6 questions
| # | Question | Format |
|---|---|---|
| PSF-1 | How frequently does your target user encounter this problem? | 1=Once a year ↔ 5=Multiple times per day |
| PSF-2 | What do they currently do to solve it? | Multi-select: Nothing / Manual workaround / Competitor product / Internal tool / Don't know |
| PSF-3 | How much would they pay to solve it (per month, AUD)? | Numeric input with bands |
| PSF-4 | How many target users have you spoken to in the last 30 days? | 0 / 1–5 / 6–15 / 16–30 / 30+ |
| PSF-5 | Do you have written evidence of the problem (interview notes, surveys)? | Yes/No + count |
| PSF-6 | What % of users you spoke to said they'd pay for your solution? | 0% / 1–25% / 26–50% / 51–75% / 76–100% |

### 4.2 Market Timing — 4 questions
| # | Question | Format |
|---|---|---|
| MT-1 | Why is now the right time (vs. 3 years ago)? | Open text 280 chars |
| MT-2 | What recent enabler makes this possible? | Multi-select: New regulation / New tech (AI/cloud/etc) / Behaviour shift / Cost shift / None |
| MT-3 | Are competitors emerging in the last 12 months? | None / 1–2 / 3–5 / 6+ |
| MT-4 | What's the wave you're riding (AU-specific)? | Multi-select: AU AI policy / Open Banking / CDR / Compliance shift / SaaS adoption / Other |

### 4.3 Distribution Edge — 5 questions
| # | Question | Format |
|---|---|---|
| DIST-1 | What's your primary acquisition channel? | Single-select: Direct sales / Content/SEO / Paid ads / Partnerships / Community / Marketplace / Cold outbound |
| DIST-2 | Do you have an unfair edge in this channel? | Yes/No + 280 char explanation |
| DIST-3 | Estimated CAC (AUD) for first 100 customers | Numeric |
| DIST-4 | Do you already have an audience (newsletter/community/followers)? | None / <500 / 500–5k / 5k–50k / 50k+ |
| DIST-5 | First 10 paying customers — do you know who they will be by name? | Yes (list) / Yes (general) / No |

### 4.4 Founder–Market Fit Deep-Dive — 4 questions
| # | Question | Format |
|---|---|---|
| FMF-1 | Years of direct experience in this market | <1 / 1–3 / 3–7 / 7–15 / 15+ |
| FMF-2 | Do you have proprietary insight others don't? | Open text 280 chars |
| FMF-3 | Have you previously built or sold something in this space? | Yes (sold) / Yes (built, didn't sell) / No |
| FMF-4 | If you fail at this, what's your fallback? | Single-select: Return to job / Try a different idea / Continue iterating / Don't know |

**Scoring weights** (sum to 25% of overall valuation):
- PSF: 10% (most predictive)
- Distribution: 8%
- FMF: 4%
- Market Timing: 3%

---

## 5. CTA Copy & Placement Spec

### 5.1 In-tool nudges (Layer A) — design rules
- Always **non-blocking** (card, not modal).
- Always **state-preserving** (clicking nudge hydrates next tool with current state).
- Never gates value already delivered.

### 5.2 Save Founder Pack modal (Layer B) — full spec
- Triggered: after completing ≥2 of 4 tools, OR explicit click on "Save Founder Pack" button.
- Dismissible (X in corner, no dark pattern).
- Re-triggers: max 1× per session, max 3× per user lifetime if dismissed.
- Field validation: email regex client + server.
- Magic link sent immediately on submit (loading spinner, success state).

### 5.3 Email nurture (Layer C) — voice
- AU spelling, founder-to-founder tone, no marketing jargon.
- Personalised with `{{first_name}}`, `{{idea_name}}`, `{{valuation_mid}}`, `{{top_risk}}`.
- All emails reference the user's saved Founder Pack `/s/[slug]` URL.
- Day-14 email is the only one with explicit Pilot Concierge mention.

---

## 6. Prioritized Implementation Plan

Plan is divided into **P0 (must ship first, blocks funnel), P1 (improves conversion), P2 (nice-to-have)**. Estimates assume 1 full-time engineer with Claude Code assistance.

### P0 — Foundation (Sprint 1–2, ~3 weeks)
**Goal: working funnel, even if narrative is basic.**

| ID | Task | Files | Est. (days) | Dependencies |
|---|---|---|---|---|
| P0-1 | Supabase migration `0003_idea_phase.sql` (4 tables + RLS) | `web/supabase/migrations/0003_idea_phase.sql` | 1 | — |
| P0-2 | Magic-link auth via Supabase Auth + Resend template | `web/src/app/auth/`, `web/src/lib/auth.ts` | 2 | P0-1 |
| P0-3 | Persist idea_evaluations, equity_splits, funding_plans (write APIs + sessionStorage migration on signup) | `web/src/app/api/idea-eval/route.ts`, `web/src/app/api/equity-split/route.ts`, `web/src/app/api/funding-plan/route.ts`, `web/src/lib/persist.ts` | 2 | P0-1, P0-2 |
| P0-4 | Founder Pack PDF generator (server-side, reuse score PDF stack) | `web/src/lib/founder-pack/pdf.ts`, `web/src/app/api/founder-pack/route.ts` | 3 | P0-3 |
| P0-5 | `/s/[slug]` route for Founder Pack with view tracking | `web/src/app/s/[slug]/founder-pack/page.tsx` | 1.5 | P0-4 |
| P0-6 | Save Founder Pack modal (Layer B CTA) | `web/src/components/save-founder-pack-modal.tsx` | 1.5 | P0-4 |
| P0-7 | `/dashboard` route (list of saved packs, idea evals, splits, plans) | `web/src/app/dashboard/page.tsx` | 2 | P0-3 |

**P0 exit criteria:**
- A user can complete idea-valuation + equity-split, click "Save Founder Pack", create an account via magic link, receive a PDF and `/s/[slug]` URL, and see their saved pack on `/dashboard`.
- All sessionStorage state migrates without loss.
- ≥10 dogfood Founder Packs created internally.

### P1 — Evaluation depth + conversion (Sprint 3–4, ~3 weeks)
**Goal: AI narrative + 19 new questions + nurture sequence.**

| ID | Task | Files | Est. (days) | Dependencies |
|---|---|---|---|---|
| P1-1 | 19 new evaluation questions in idea-valuation tool (UI + state) | `web/src/app/tools/idea-valuation/idea-valuation-tool.tsx`, `web/src/lib/idea-eval/questions.ts` | 2.5 | P0-3 |
| P1-2 | Updated scoring formula (60/25/15 weights + regression guard) | `web/src/lib/idea-eval/score.ts` | 1.5 | P1-1 |
| P1-3 | Claude AI narrative + follow-ups (structured tool use, prompt caching) | `web/src/lib/idea-eval/ai.ts`, `web/src/app/api/idea-eval/narrative/route.ts` | 3 | P1-1 |
| P1-4 | 3 new equity-split fields (responsibilities, commitments, contribution) + fairness narrative | `web/src/app/tools/equity-split/equity-split-tool.tsx`, `web/src/lib/equity-split/ai.ts` | 2 | P0-3 |
| P1-5 | Founder Pack PDF v2 (incorporates AI narrative, fairness, follow-ups) | `web/src/lib/founder-pack/pdf.ts` | 1.5 | P1-3, P1-4 |
| P1-6 | In-tool nudges (Layer A) for all 4 tools | each tool's tsx + `web/src/components/cta-nudge.tsx` | 1.5 | P0-3 |
| P1-7 | Email nurture sequence (5 emails, Resend templates + cron trigger) | `web/src/lib/nurture/`, Supabase scheduled function | 2.5 | P0-2, P0-7 |

**P1 exit criteria:**
- Claude narrative renders for ≥95% of evaluations.
- Cache hit rate ≥80% on Claude calls.
- Email open rate ≥40% on day-0 email (measured over first 50 sends).
- Layer B modal CTR ≥35%.

### P2 — Polish & bridge (Sprint 5+, ~2 weeks)
**Goal: bridge to wedge, optimisation.**

| ID | Task | Files | Est. (days) | Dependencies |
|---|---|---|---|---|
| P2-1 | Bridge to Investor-Ready Score (pre-fill from idea_evaluations + equity_splits + funding_plans) | `web/src/app/score/intake/page.tsx`, `web/src/lib/score/prefill.ts` | 2 | P0-7 |
| P2-2 | Dashboard "I've incorporated" flow + Pilot Concierge offer | `web/src/app/dashboard/page.tsx`, `web/src/components/incorporated-cta.tsx` | 1.5 | P2-1 |
| P2-3 | View-tracking analytics on `/s/[slug]` (who opened, when, from where) | reuse existing wedge plumbing | 1 | P0-5 |
| P2-4 | Conversational follow-up: AI asks 1 follow-up question after narrative, refines valuation | `web/src/app/tools/idea-valuation/follow-up.tsx` | 2 | P1-3 |
| P2-5 | A/B test framework on Layer B modal copy | `web/src/lib/experiments.ts` | 1.5 | P0-6 |
| P2-6 | Cofounder-match → equity-split bridge (pre-fill founder cards from matched profiles) | `web/src/app/tools/equity-split/equity-split-tool.tsx` | 1 | P0-3 |

**P2 exit criteria:**
- ≥1 idea-phase user has converted to Pilot Concierge enquiry via the bridge.
- A/B test framework operational with ≥1 live test on Layer B copy.

### 6.1 Sprint timeline
- Sprint 1 (week 1–1.5): P0-1 → P0-4
- Sprint 2 (week 2–3): P0-5 → P0-7, dogfood + fixes
- Sprint 3 (week 4–5): P1-1 → P1-3, P1-6
- Sprint 4 (week 5–6): P1-4 → P1-5, P1-7
- Sprint 5+ (week 7–8): P2 batch

**Total to ship full layer: ~8 weeks. P0 alone (functional funnel) ships in ~3 weeks.**

### 6.2 Capacity check vs wedge
At ≤20% capacity ceiling, ~1 day per week per engineer goes to idea-phase. With 1 dedicated engineer this estimate is realistic. With shared capacity, multiply timeline by 5×.

**Recommendation:** dedicate one engineer for the 8-week build, then reabsorb into wedge work. Idea-phase requires no ongoing engineering after launch beyond minor tuning.

---

## 7. Success Metrics (track from day 1)

| Metric | Target (90 days post-launch) | Measurement |
|---|---|---|
| Tool starts (any of 4 tools) | 1,500 / month | Analytics event |
| Tool completions (any of 4) | 600 / month (40% completion) | Analytics event |
| Founder Packs saved | 150 / month (25% of completions) | `founder_packs` row count |
| Persistent BlockID accounts | 150 / month (1:1 with packs) | `auth.users` count |
| Day-14 email reply rate | ≥3% | Resend webhook |
| Bridge → Pilot enquiry | ≥5 / month | Manual tag in CRM |
| Cost per Founder Pack (Claude) | ≤AUD $0.10 | Anthropic billing / pack count |

---

## 8. Open Decisions & Risks

### 8.1 Open decisions (need answer before P0 ships)
1. **Magic link domain** — Use `blockid.au` or subdomain `app.blockid.au`?
2. **PDF watermark** — Always-on BlockID logo + "draft" mark, or remove watermark on paid upgrade later?
3. **Founder Pack visibility default** — Public link with view tracking (anyone with URL can view) vs. password-gated?
4. **Idea-name uniqueness** — Allow same user to save multiple Packs with same idea name (versioning) or force unique?

### 8.2 Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Wedge focus drifts to idea-phase because it gets traction first | Medium | Hard 20% capacity cap, monthly review |
| AI narrative produces overconfident/legally risky valuation language | Medium | System prompt + post-generation regex check + AU-specific disclaimer in PDF footer |
| Magic-link delivery failures hurt conversion | Low–Medium | Resend monitoring, fallback to verification code on UI |
| Founder Pack PDF becomes load-bearing for a use case it wasn't designed for (e.g. submitted as actual investor doc) | Medium | Clear "v0 — pre-incorporation draft" stamp on every page |
| 19 new questions hurt completion rate | Medium | Make all 19 optional with "skip for now" + show value preview after each section |
| Idea-phase users never incorporate, sequence churns | High | Acceptable — they were never going to be wedge customers; cost is minimal once built |

### 8.3 Explicitly out of scope (for v1)
- No marketplace / private listings (per v2 plan deferral)
- No tokenized ownership at idea phase
- No mentor matching beyond cofounder-match directory
- No paid SKU at idea phase
- No multi-language UI (English only, AU spelling)
- No mobile app (web-responsive only)

---

## 9. Definition of Done — Layer ships when:
- [ ] All P0 tasks merged and deployed
- [ ] All P1 tasks merged and deployed
- [ ] ≥50 external Founder Packs created (not internal)
- [ ] Day-14 email sequence has fired ≥30 times
- [ ] At least 1 documented bridge from idea-phase → wedge enquiry
- [ ] Capacity audit shows wedge velocity not degraded by >20% during the build
- [ ] Customer journey HTML for individuals updated to reflect shipped Persistent BlockID phase
