# Ready to sale — release readiness (2026-09-22, v3.27.2)

One page the founder can read before selling. Everything below is live unless marked.

## What a buyer gets today
| Segment | Entry | What is live |
|---|---|---|
| Founder / guest | `/analyze` → e-mail + consent → **first two full Trusted Business Reports free** (v3 document, PDF by e-mail + signed link); third → A$3 quote-then-pay | G25-C, G28-C; v3.27.1 fixed the run budget (P1) |
| Founder | Starter A$29 / Growth A$69 (7-day card-required trial) via `/checkout/review` → Pay | G18 ladder, G25-D review step |
| Evaluator | Scout A$79 / Firm A$149 / Program A$349 (trial), `/workspace/evaluations` + BlockID Cohort (import, filters, overrides, snapshots, Cohort Report, demo-day pack, demo cohort at zero cost) | G12, G21–G24 |
| Program | Cohort 25 / 100 annual ("Start a cohort" → sign-up → review → Pay), onboarding kit, validation tracker, Cohort proposal PDF | G25-A |
| Institution | read-only API `/api/v1/institutional/*`, `/docs/api/institutional` | G21 P3, G22 |

## Trust surface
- Trusted Business Report **v3**: dashboard → investment view (A–D rubric) → key points → valuation → 8 identical chapters → risk matrix → 90-day plan → appendix + Evidence cited; web = PDF = DOCX; EN + VI; never-say + benchmark-n guards; print rules. `/tbr/demo?band=A–D`.
- Grounding: auto-citer, claim gate, computed + knowledge rows with provenance, critic sees the whole submission. **KPI `groundedShare ≥ 0.85` is pinned in tests, last live measurement 0.82** (2026-09-21 11:34); three later runs degraded on a provider outage.
- Light template on every page (guard enforcing, page-sweep light check); startupvalueindex.com matches.
- Review before pay on every Stripe hand-off (guard over all seven session routes).

## QA gates at this release
- Unit 41 382 / pdf 236 / tsc clean (v3.27.0 tree); elevated live-qa **306 / 0**; link-check 400 pages · 0 broken; page sweep 140 · 0 defects (1 report-only CSP line on `/ja` login); contrast + print smoke 6 / 6; 12-gate deploy 12 / 12; read-only review + ui-ux-pro-max check after every release (findings fixed in v3.27.1 / v3.27.2).

## Known gaps (honest)
1. **Provider fragility** — the free AI chain failed end-to-end once on 2026-09-21; a free report then fails after 3 attempts and the grant is released. Mitigation shipped (stage timeouts, run strikes, W4 reserve); the fix is funded capacity (founder item 9) + dead-rung pruning (G29).
2. **0.85 grounding KPI not verified live** since the G28-A rules — first healthy showcase run confirms it (`node --env-file=.env scripts/run-self-analysis.mjs --report --audit-dump`).
3. **Free-report real run not exercised on production** (live-qa 43 real-run case runs only with `LIVE_QA_SPEND_OK=1`, ≈ US$0.07) — do once providers are healthy.
4. Evaluator seat on a Program plan still sees founder-phase copy in places; `/startup-index` sample movers logic; cookie/feedback pills overlap on long phone pages (UX notes, G29 candidates).

## Founder items
`docs/ops/founder-items.md` — Stripe tax_behavior + annual prices, Telegram token, GitHub token, legal/LOIs, Drive backup OAuth, secret rotation, **paid AI capacity (#9)**, **SVI repo remote (#10)**, GrantConnect CSV.

## Where things are
`/version` + `web/CHANGELOG.md` (v3.27.2), `docs/plans/SOURCE-OF-TRUTH.md` § G24–G28, `docs/ops/feature-inventory.md`, `docs/ops/pricing-truth.md` (§ 12 review before pay, § 13 free allowance), `docs/ops/free-reports.md`, `docs/ops/reports.md`, `docs/ops/ai-providers.md` § 11, `docs/ops/demo-cohort.md`, `docs/design/unicorn-template.md` v2, `docs/design/tbr-v3-investor-report-spec.md`.
