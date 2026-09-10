# Traction kit — September 2026 (G11/G12 T1–T2 + G4 #5 ProductHunt)

> **Back-links:** [`docs/plans/evaluator-traction-2026-09-10.md`](../../plans/evaluator-traction-2026-09-10.md) §4 (positioning), §5 (90-day sequence, KPIs) · [`docs/plans/money-finder-2026-09-10.md`](../../plans/money-finder-2026-09-10.md) §4i D-3 (messaging pack), D-5 (hero one-liners) · [`docs/plans/SOURCE-OF-TRUTH.md`](../../plans/SOURCE-OF-TRUTH.md).
> **Task:** S6-C · **Opened:** 2026-09-10 · **Owner:** CEO (Do Van Long) · **Entity in outward copy:** PPL Food PTY LTD (no ABN/ACN).
> **Product truth as of 2026-09-10 (release `fea2aa62b`):** Evaluator ladder Scout A$79 / Firm A$149 / Program A$349, 7-day card-required trial, A$3 Trust BizReport, batch scoring + cohort CSV + sponsor/LP report live, `/solutions/investor|accelerator|advisor`, `/compare/chatgpt`.

## 1. What this kit is

Five ready-to-send documents for the first 90 days of evaluator traction, plus the ProductHunt launch. Everything in them is checked against the live product pages listed above — the numbers (8 dimensions, 13 criteria, 12 growth phases, 11 C-Level agents + auditor), the prices, the trial mechanics and the data sentence are copied from `en.json` / `plans.csv`, not paraphrased. If the product changes, change the kit the same day.

| File | Motion | Segment | Window |
|---|---|---|---|
| [`t1-angel-groups.md`](./t1-angel-groups.md) | T1 warm angels — 3-touch email + LinkedIn DM + group offer + FAQ | Sydney / Brisbane / Melbourne / Perth Angels, Innovation Bay, Startmate First Believers alumni | Weeks 1–3 |
| [`t2-accelerator-pilots.md`](./t2-accelerator-pilots.md) | T2 accelerator pilots — 14-day Program pilot on a live intake | 5 programs from `programs-au.seed.json` with live/upcoming rounds | Weeks 3–8 |
| [`producthunt-launch-kit.md`](./producthunt-launch-kit.md) | G4 #5 ProductHunt launch — listing, maker comment, Q&A, assets, 7-day follow-up | founders + evaluators, global | Week 5 (launch Tue 13 Oct) |
| [`linkedin-posts-week1.md`](./linkedin-posts-week1.md) | 5 founder-voice posts, one per day, one CTA per segment | all | Week 1 (15–19 Sep) |
| `web/public/producthunt/README.md` | asset naming for the media-studio / tour-capture step | — | before launch |

**Fixed wording (do not paraphrase):**
- Doctoral sentence: *"grounded in the founder's doctoral research (DBA) on startup valuation"* — never "PhD".
- Data sentence: *"Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what."* — nothing about training, either way.
- "Why not ChatGPT" paragraph: the one on `/compare/chatgpt` and every `/solutions/*` FAQ (reproduced verbatim in `t1-angel-groups.md` §5).
- Prices: Free · A$3 · Starter A$29 · Growth A$69 · Scout A$79 · Firm A$149 · Program A$349. No other amount appears anywhere in the kit.
- Social proof: **none yet.** Every place a quote, metric or logo would go is marked `[[placeholder — collect from pilot]]`. Do not fill one in without a written OK from the named person or program.

## 2. The 90-day sequence (starts Tuesday 2026-09-15)

| Week | Dates | Motion | What happens | Owner |
|---|---|---|---|---|
| 1 | 15–21 Sep | T1 touch 1 · LinkedIn D1–D5 | Founder sends intro email to 6 angel-group contacts + 20 First Believers alumni; posts 1–5 go out daily; tracking sheet opened | founder |
| 2 | 22–28 Sep | T1 touch 2 · T2 pre-outreach | Follow-ups; T2 emails to Catalysr (closes 30 Sep) and Kinesis (closes 4 Oct) — these two rounds close before T2 formally starts, so their outreach is pulled forward | founder |
| 3 | 29 Sep–5 Oct | T1 touch 3 (group offer) · T2 starts | "Score this cycle's applicants on one rubric" offer to each group; Kinesis pilot on the closing round; Flinders Venture Dorm pilot booked for the 6 Oct cohort start | founder + CPO for batch runs |
| 4 | 6–12 Oct | T2 pilots 1–2 live · PH prep | Flinders cohort scored at intake; Cicada Elevate rolling pilot; 5 gallery images captured on localhost:4001; hunter confirmed | founder + media-studio |
| 5 | 13–19 Oct | **ProductHunt launch Tue 13 Oct** | Launch day (see kit), day 1–7 follow-up plan; T1 results reviewed against the week-3 target | founder |
| 6 | 20–26 Oct | T2 pilot 3–4 · T3 opens | Antler applicant-pool pilot; Startmate pilot scheduled for the last two weeks of their round; first advisory-firm reseller conversations (T3 kit is a separate deliverable) | founder |
| 7–8 | 27 Oct–9 Nov | T2 pilot 5 (Startmate, closes 8 Nov) · pilot conversions | Batch-score the Startmate round in its final fortnight; convert 2 of 3+ pilots to paid Program; demo-day co-marketing asks confirmed | founder + CPO |
| 9–10 | 10–23 Nov | T3 advisory firms · T4 content | Reseller onboarding; first case-study interviews with consenting pilots (still placeholders until signed off) | founder + CMO |
| 11–12 | 24 Nov–7 Dec | T3/T4 · review | Cut Through / Startup Daily pitch with whatever real numbers exist; 90-day review against KPIs | founder |
| 90 | 13 Dec | — | Close-out: KPIs, learnings into the goal doc §9, next sequence | founder |

## 3. KPIs (from the plan §5, unchanged)

| Motion | Target | Measured by |
|---|---|---|
| T1 warm angels | 30 trials · 10 Scout · 100 reports | GA4 `evaluator_signup` with `utm_campaign=t1`; `report_purchased`; Stripe subscriptions on `investor_angel` |
| T2 accelerator pilots | 3 pilots → 2 paid Program | `utm_campaign=t2`; Stripe subscriptions on `investor_vc_small`; batch runs in `/admin` |
| ProductHunt | signups by `utm_source=producthunt`; placement is not a KPI | GA4 `evaluator_signup` / founder signups with `utm_campaign=ph` |
| Funnel health | trial→Scout ≥ 15 % · reports per evaluator ≥ 4/mo · pilot→paid ≥ 50 % · CAC < 1× first-year ARPA · NPS ≥ 40 | GA4 funnel `evaluator_signup → evaluation_added → report_purchased → evaluator_upgrade`; weekly cohort in `/admin` |
| T4 content | 2 press mentions · 500 evaluator signups (by day 90) | manual log + GA4 |

## 4. UTM scheme and tracking sheet

Every link in this kit carries UTM parameters. Never send a bare `blockid.au` link in outreach.

```
utm_source   = angel_group | accelerator | advisor | producthunt
utm_campaign = t1 | t2 | t3 | ph
utm_medium   = email | linkedin | dm | listing        (optional, add when known)
utm_content  = <group or program slug>                (optional, e.g. sydney_angels, startmate)
```

Canonical links:
- T1 trial: `https://blockid.au/signup?plan=investor_angel&trial=1&utm_source=angel_group&utm_campaign=t1`
- T2 pilot: `https://blockid.au/signup?plan=investor_vc_small&trial=1&from=pilot&utm_source=accelerator&utm_campaign=t2`
- PH: `https://blockid.au/?utm_source=producthunt&utm_campaign=ph` (founders) and `https://blockid.au/solutions/investor?utm_source=producthunt&utm_campaign=ph` (evaluators)
- Comparison page for objections: `https://blockid.au/compare/chatgpt?utm_source=<source>&utm_campaign=<campaign>`

`plan=investor_angel` / `plan=investor_vc_small` alone puts `/signup` into the evaluator segment with that rung pre-selected (`resolveSignupSegment` in `web/src/lib/plans/signup-plans.ts`); `trial=1` and `from=pilot` are inert on the form and exist for the sheet.

**Tracking sheet columns** (one Google Sheet, tab per motion):

| Column | Values |
|---|---|
| `date_sent` | ISO date |
| `motion` | t1 / t2 / t3 / ph |
| `org` | group / program / firm name |
| `contact_name`, `contact_role`, `channel` | email / linkedin_dm / intro / event |
| `touch` | 1 / 2 / 3 (T1) · outreach / call / pilot_start / pilot_end (T2) |
| `utm_content` | slug used in the link |
| `reply` | none / declined / interested / booked |
| `trial_started` | date or blank |
| `plan` | investor_angel / investor_advisor / investor_vc_small |
| `reports_run` | count (from `/admin`) |
| `converted` | date paid or blank |
| `testimonial_status` | not_asked / asked / received / approved_in_writing |
| `notes` | free text |

## 5. Founder does personally vs templated

**Founder must do personally (not delegable):**
- Send every T1 touch-1 email and LinkedIn DM from his own account — these go to people who will look him up; the doctoral sentence and the method belong in his voice.
- Every T2 pilot call, the pilot agreement conversation, and the demo-day ask.
- The ProductHunt maker comment and the first 3 hours of replies on launch day.
- All five LinkedIn posts (founder voice, own profile; the company page reshares).
- Testimonial requests and written sign-off — no quote is used without the person's written approval.

**Templated / delegable (CMO agent, media-studio, CPO for batch runs):**
- Follow-up emails (touch 2 and 3) and the FAQ attachment.
- Pilot batch-scoring runs, cohort CSV and sponsor/LP report export (CPO agent runs the batch; founder reviews before it goes to the program).
- Gallery images (media-studio + `scripts/tour-capture.mjs`), thumbnail, PH listing fields.
- Tracking sheet upkeep and the weekly KPI read from GA4 / `/admin`.

## 6. Claims that must not be made (until true)

- No user counts, no "X startups scored", no "trusted by" — G10 truth rule.
- No "SOC 2", no "ISO 27001". The trust badges the product shows are: Privacy Act 1988 (APP 1–13 controls), Essential Eight ML1 (ACSC-aligned baseline), Stripe verified merchant (PCI DSS via Stripe), GST-registered (ATO tax invoice on every charge).
- No "formal valuation". A Trust BizReport is a screening and tracking instrument; the report says so on every page.
- No "we never train" / "we train" — the data sentence is the whole statement.
- No accelerator, angel group or investor name used as an endorsement without written consent; naming them as an outreach *target* inside this folder is fine.

## 7. Known gaps to fix before sending (product side, not in this kit's scope)

- `/solutions/*` disclaimers, the trust-badge strip (`evaluator-page-props.ts` TRUST_BADGES) and `/contact` still print **Auschain PTY LTD / ABN 79 659 615 111**; the founder decision (2026-09-10) is PPL Food PTY LTD with no ABN in copy. This kit uses PPL Food PTY LTD throughout; the pages need the S0 entity sweep before an evaluator lands on them from these links.
- `/contact` does not read `?intent=` or `?plan=`, so the pilot CTA on `/solutions/accelerator` and every T2 link go to `/signup?plan=investor_vc_small&trial=1&from=pilot` instead.
- `/workspace/evaluations` is behind login — the ProductHunt gallery image for it needs a seeded evaluator session (see the launch kit §5).
