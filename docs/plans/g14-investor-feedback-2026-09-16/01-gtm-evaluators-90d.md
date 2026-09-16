# G14 · 01 — Evaluator GTM, 90 days (CMO)

> **Back-links:** [`../g14-investor-feedback-2026-09-16.md`](../g14-investor-feedback-2026-09-16.md) §0 C9 / §4 S33 / §5 · [`../SOURCE-OF-TRUTH.md`](../SOURCE-OF-TRUTH.md) § G14 · reuses [`docs/marketing/traction-kit-2026-09/`](../../marketing/traction-kit-2026-09/README.md) verbatim (T1 angel groups, T2 accelerator pilots, LinkedIn week 1, ProductHunt) — **only the pilot offer changes and one instrument is added.**
> **Opened:** 2026-09-16 · **Owner:** CEO (founder sends every email; CMO agent drafts follow-ups) · **Window:** 2026-09-16 → 2026-12-15 (D0 → D90).
> **Rules carried from the kit:** doctoral sentence verbatim (never "PhD"); data sentence verbatim; no social proof until written consent (`[[placeholder — collect from pilot]]`); every link carries UTM; outward entity PPL Food PTY LTD; no user counts / "trusted by" / SOC 2 / formal-valuation claims.

## 1. Why the GTM changes after the pitch (cluster C9)

Judges asked where the customer research was and who the buyer is. Answer: the buyer is the evaluator (angel screening committee, program manager, advisory firm), and we have not yet interviewed ten of them on the record. The next 90 days therefore run **three motions at once**: (a) 10 structured interviews with the instrument in [`docs/research/evaluator-interviews-2026-09.md`](../../research/evaluator-interviews-2026-09.md); (b) the pilot offer v2 below (free cohort scoring, comped by admin credit grant); (c) the **intake wedge** — the paying side hands out an `/apply/<slug>` link, founders apply into a scored inbox (G14 S35), so the two-sided market starts from the payer.

## 2. Named targets (public names — outreach targets, never endorsements)

| Segment | Target | City | Motion | Note |
|---|---|---|---|---|
| Angel group | Sydney Angels | Sydney | interview + Scout/Firm offer; "~40 applicants a cycle" example on deck S2 | T1 kit touch 1–3 |
| Angel group | Melbourne Angels | Melbourne | interview + group offer | T1 |
| Angel group | Brisbane Angels | Brisbane | interview + group offer | T1 |
| Angel group | Perth Angels | Perth | group offer | T1 |
| Angel group | Southern Angels | Adelaide | group offer | new in G14 |
| Angel group | Capital Angels | Canberra | group offer | new in G14 |
| Angel network | Scale Investors | Melbourne / national | interview (women-led deal flow; committee process) | new in G14 |
| Angel network | Club Investible | Sydney / national | interview + Firm offer | new in G14 |
| Angel network | Innovation Bay | Sydney / national | interview | T1 |
| Angel (1-1) | First Believers alumni (Startmate) | national | 1-1 Scout trials (20 contacts) | T1 |
| Program | Startmate Accelerator | Sydney + Melbourne | pilot v2 on the round closing **8 Nov 2026** | T2 #1 |
| Program | Antler Australia | Sydney / Melbourne / Brisbane | pilot v2 on the applicant pool (rolling) | T2 reserve → active |
| Program | Cicada Innovations — Deep Tech Elevate | Sydney | pilot v2, rolling, 4 streams (custom weights) | T2 #5 |
| Program / hub | Stone & Chalk | Sydney / Melbourne / Adelaide | **Intake link** offer (A$249/mo) — residents apply via `/apply/<slug>` | new in G14 (S35) |
| University program | UNSW Founders | Sydney | pilot v2 at intake + interview | new in G14 |
| University program | Melbourne Accelerator Program (MAP) | Melbourne | pilot v2 at intake | new in G14 |
| University program | iAccelerate (UOW) | Wollongong | pilot v2 | new in G14 |
| University program | UQ Ventures / ilab | Brisbane | interview now; next round Apr–Jun 2027 (seed) | pilot later |
| Program | Plus Eight / Curtin Accelerate | Perth | interview now; rounds Apr–Jun 2027 (seed) | pilot later |
| University program | Flinders NVI Venture Dorm | Adelaide | pilot v2 on the **6 Oct 2026** cohort | T2 #4 |

**Caveat — Techstars Australia:** not listed as a target. Verify on techstars.com whether an Australian program is still active before any outreach; do not cite it on a slide or in an email until verified.

Advisory / R&DTI-ESIC firms (T3 motion, 2 interviews): pick from the reseller pipeline and `programs-au.seed.json` partners; they are interviewed for WTP on Firm A$149 and the reseller 0–40 % path, not pitched a pilot.

## 3. Pilot offer v2 — "Free cohort scoring for one intake"

Replaces the 14-day-inside-trial offer in `t2-accelerator-pilots.md` §2 (amended 2026-09-16; §3 success criteria unchanged).

| Term | Value |
|---|---|
| What | one live intake or cohort, **≤ 60 applicants**, scored on the 8-dimension / 13-criteria rubric; cohort table + CSV; sponsor/LP report sample; Investor Dossier per startup |
| How long | **30 days** from the first batch run |
| Price | **free** — comped by an **admin credit grant** on the program's Program-tier workspace (never a Stripe coupon; Stripe is untouched; card not required for the comp) |
| In return (all four) | (a) **LOI** to Cohort 25 at **A$5,000/yr** or Program at **A$349/mo** if ≥ 5 of the 7 success criteria pass · (b) a **named case study** after day 30 (written approval, placeholders until then) · (c) the committee **ranks its own top-10 before seeing the SVI table** (feeds backtest S39 and success criterion 2) · (d) **one 45-minute interview** on the instrument |
| Cap | **5 pilots**; the sixth pays list price |
| Intake link | offered in the same email: the program hands out `/apply/<slug>`; applicants land scored in the inbox (S35, Wave B — until it ships, applicants are added by the program or via claim link as today) |
| Not included | formal valuation, investment advice, cross-startup evidence sharing, SSO / white-label, discounts after the pilot (one list price) |

Success criteria = `t2-accelerator-pilots.md` §3 (7 rows) unchanged; LOI trigger = ≥ 5/7. Data sentence on the first call and in the agreement, verbatim.

## 4. The intake wedge (how the two-sided market starts)

1. Program buys Intake link (A$249/mo, 60 profiles, 40 reports/mo, 3 seats) or gets it inside Program / Cohort (flag `intake.manage`).
2. Program creates `/apply/<slug>` and puts it on its application page / email.
3. Founder applies: 3 fields + deck + consent (data sentence verbatim). Free score runs (or "Score now" by the evaluator — F-4 default off).
4. Evaluator inbox shows SVI / coverage / status / dossier link; committee ranks; verdicts recorded (G13 S-D2).
5. Founders the program passes on receive "What investors said" once k ≥ 3 / ≥ 2 orgs (S34) — the reason a founder tolerates being scored.
6. Every scored startup grows the index; the program's next intake is benchmarked against a real cohort (S40 `cohortFromRegisters` until then).

## 5. Metrics D30 / D60 / D90

| Metric | D30 (16 Oct) | D60 (15 Nov) | D90 (15 Dec) | Source |
|---|---|---|---|---|
| Evaluator interviews completed | 10 | 12 | 15 | `evaluator-interviews-2026-09.md` rollup |
| LOIs (Cohort 25 / Program / Fund) | 2 | 6 | 8 | signed emails; SOT §5 |
| Pilots started (cap 5) | 2 | 4 | 5 | admin credit grants log |
| Pilot → paid | — | ≥ 50 % | ≥ 50 % | Stripe subscriptions on `investor_vc_small` / `accelerator_starter` |
| Evaluator signups | 120 | 300 | 500 | GA4 `evaluator_signup` by `utm_campaign` |
| Reports per paying evaluator / month | ≥ 3 | ≥ 4 | ≥ 4 | `traction-snapshot.json` (S33) |
| Intake links live (≥ 1 submission) | 1 | 3 | 6 | `program_intakes` (S35) |
| Evaluator MRR | A$1.5K | A$5K | A$10K | Stripe reconcile in S33 snapshot |

All eight rows are read from the S33 traction snapshot once it runs daily; until then the founder's tracking sheet (`traction-kit README` §4) is the source. No number from this table goes on a slide unless it is in `traction-snapshot.json`.

## 6. Calendar (fits the kit's 90-day sequence; changes in bold)

| Week | Dates | What changes vs the kit |
|---|---|---|
| 1 | 16–21 Sep | T1 touch 1 + LinkedIn D1–D5 as written; **book 4 angel-committee interviews** (Sydney, Melbourne, Brisbane, Scale/Investible) |
| 2 | 22–28 Sep | **Pilot v2 email** (not the 14-day trial email) to Catalysr, Kinesis, Flinders; **2 program-manager interviews** |
| 3–4 | 29 Sep–12 Oct | Pilots 1–2 start with **admin credit grants**; committee top-10 collected **before** the table; **2 more program interviews + 2 R&DTI/ESIC advisor interviews** → D30 rollup |
| 5 | 13–19 Oct | ProductHunt as written; interview rollup into `00-pitch-feedback.md` §3 (what changed) |
| 6–8 | 20 Oct–9 Nov | Pilots 3–5 (Antler, Cicada, Startmate final fortnight); **first LOIs**; Stone & Chalk intake-link offer once S35 is live |
| 9–12 | 10 Nov–15 Dec | Case-study approvals; T3 advisory firms; D90 review → SOT § G14 KPIs; deck S9 `[[LOI placeholder]]` filled only with written consent (F-9) |
