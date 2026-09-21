# TBR v3 wireframes (companion to `docs/design/tbr-v3-investor-report-spec.md`)

Light template: white surface, sunken grey panels, dark ink, navy `#1B2A5E` accent, cyan `#0891B2` links. Mono figures.

## W1 — Page 1: Dashboard (≥ 1024 px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ STARTUP VALUE INDEX · TRUSTED BUSINESS REPORT              21 Sep 2026 · v2026.09     │
│ BlockID.au (Auschain PTY LTD)          Verified ABN L2 ✓   Stage 3 · Early Traction   │
│ SaaS / Software · Phase: Go-to-Market & Scale                                         │
├──────────────────┬──────────────────┬──────────────────┬─────────────────────────────┤
│ SVI INDEX        │ EVIDENCE CONF.   │ VERDICT          │ VALUATION (A$, pre-money)   │
│ 135              │ 64 %             │ B · With         │ 3.0M – 6.6M                 │
│ ● Strong  ▲ +4   │ connected src.   │   conditions     │ 5 of 7 methods · ask —      │
│ composite 82/100 │ conviction: med. │ 2 conditions ↓   │ 2 revenue methods not run   │
├──────────────────┴──────────────────┴──────────────────┴─────────────────────────────┤
│ 8 DIMENSIONS vs STAGE MEDIAN BAND (p25–p75, n = 42, benchmark)                        │
│                                                                                       │
│ Traction & Revenue   ░░░░░░████████████▌46 ░░░░░░│░░░░░░                              │
│ Market Pull          ░░░░░░░░░░░░░░░░░░░░░░░░░░░░│███████▌87                         │
│ Founder & Team       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░│████████████ 100                   │
│ Product & Tech       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░│████████████ 100                   │
│ Capital & Governance ░░░░░░░░░░░░░░░░░░░░░░░░░░░░│████████████ 100                   │
│ Investor Readiness   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░│████████████ 100                   │
│ Legal & Compliance   — / 100  ○ Pending (no evidence yet)                             │
│ Strategy & Moat      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░│████████████ 100                   │
│                      0                   50                    100                    │
│ ■ your score   ░ stage band p25–p75   │ p50 median            [table view ▾]          │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ TOP STRENGTH  Founder & Team 100/100 (+34 vs median)  ·  TOP GAP  Traction 46 (−19)   │
│ Unverified material claims: 2  ·  Last updated 21 Sep 2026  ·  Methodology v2026.09   │
│ General information, not financial product advice. Evaluators make the decision.      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Tile order is fixed (SVI · Evidence · Verdict · Valuation). Bars: navy fill, sunken band, 2 px muted p50 tick. Pending dim = no bar, text only.

## W2 — Page 2: Investment view

```
┌ 2  INVESTMENT VIEW ───────────────────────────────────────────────────────────────────┐
│ ┃ B · INVESTABLE WITH CONDITIONS                       Evidence confidence 64 % · med. │
│ ┃ Based on the evidence supplied and the SVI rubric. BlockID structures the evidence;  │
│ ┃ evaluators and founders make the decision.                                           │
│                                                                                        │
│ Summary paragraph(s) — executive.structured.summary (≤ 3 × 60 words)                   │
│                                                                                        │
│ CONDITIONS                                                                             │
│  1. Lift Traction & Revenue to the Go-to-Market floor of 55 (now 46)                   │
│  2. Verify 2 self-declared material claims (documents or connected sources)            │
│                                                                                        │
│ ┌ WHY BACK ────────────────────────┐  ┌ WHAT WEIGHS AGAINST ──────────────────────┐   │
│ │ 01 Proprietary data moat  ¹      │  │ ▲ 01 Pre-revenue, 0 MRR  ²      +8 SVI    │   │
│ │    svm · 100/100                 │  │      tre · 46/100                          │   │
│ │ 02 Founder domain expertise ²    │  │ ▲ 02 Solo-founder key-person risk  +6 SVI  │   │
│ │ 03 ESIC eligibility ³            │  │ ▲ 03 No customer interviews  ⁴    +7 SVI   │   │
│ └──────────────────────────────────┘  └────────────────────────────────────────────┘   │
│ WHERE YOU ARE  Go-to-Market & Scale · blocker: … · what it takes: …                    │
│ ┆ Analyst synthesis (CEO agent): "Back with conditions — …"  (shown only if ≠ band)    │
└────────────────────────────────────────────────────────────────────────────────────────┘
┌ 3  KEY POINTS ─────────────────────────────────────────────────────────────────────────┐
│ • ① headline  • ② top reason  • ③ top gap +lift  • ④ consensus A$3.0–6.6M, 5 methods   │
│ • ⑤ verdict B — first condition                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

## W3 — Section 4: Valuation

```
┌ 4  VALUATION (A$, pre-money) ──────────────────────────────────────────────────────────┐
│ RANGE   low 3.0M ├────────────●────────────┤ 6.6M high      ● mid 4.8M   ◆ ask (if any) │
│ Consensus confidence 35 % · revenue source: none (pre-revenue) · growth: assumed        │
│                                                                                         │
│ METHOD              APPLICABLE  WEIGHT     LOW     MID    HIGH  RATIONALE               │
│ Berkus                  ✓         0.30    2.0M   2.5M    3.0M  5 pillars: 4 of 5 met    │
│ Scorecard (Payne)       ✓         0.25    3.1M   4.4M    5.8M  vs AU stage median n=27  │
│ Risk-factor summation   ✓         0.20    …                                             │
│ Stage baseline          ✓         0.15    …                                             │
│ Comparables             ✓         0.10    …      n = 12 (indicative)                    │
│ Revenue multiple        —         0       —       —       —    needs revenue            │
│ DCF proxy               —         0       —       —       —    needs revenue            │
│ CONSENSUS                                 3.0M   4.8M    6.6M                           │
│                                                                                         │
│ WHAT MOVES IT   ▸ Connect Stripe → revenue multiple + DCF run (+2 methods)              │
│                 ▸ Verified ABN → risk-factor row "legal" moves one step                 │
│ CROSS-CHECKS    AU pre-seed median (Cut Through 2025, n = 118) · sector multiples · …   │
│ Narrative (≤ 200 words, footnoted) · audit line                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## W4 — One dimension chapter (identical × 8)

```
┌ 5  TRACTION & REVENUE EVIDENCE ── Dimension 1/8 · weight 20 % ─────────────────────────┐
│  46 / 100   ● Developing    stage median 65 (n = 42, benchmark) · p25 50 · p75 80      │
│             30th percentile · Go-to-Market floor 55 ✗                                   │
├───────────────────────────────────────────────┬─────────────────────────────────────────┤
│ VERDICT (≤ 60 words)                          │ EVIDENCE USED                           │
│ Your score is 19 points below the stage       │ Stripe connector · connected · partial ⁵│
│ median …²  The ledger shows …⁵                │ GA4 funnel · connected · evidenced ⁶    │
│                                               │ Startup description · self-declared ⁷   │
│ STRENGTHS                                     │ +4 more in the evidence register        │
│ ✓ 182 startups analysed ⁵                     │                                         │
│ ✓ Pricing live for three tiers ⁷              │ WHAT TO IMPROVE                         │
│                                               │ ▸ Connect Stripe, 5 trial→paid  +8 SVI  │
│ RISKS / GAPS                                  │   this week · evidence: bank/invoice    │
│ ▲ 0 MRR, no paying evaluator ⁶                │ ▸ 30-day Scout trial to 10 accounts     │
│ ▲ No cohort retention data   [unverified]     │   +5 SVI · 30 d                         │
├───────────────────────────────────────────────┴─────────────────────────────────────────┤
│ CRITERIA         SCORE  QUALITY   ONE-LINE VERDICT                                      │
│ Customer base      46   Basic     Strong usage, no monetisation yet ⁵                   │
│ Revenue & unit ec. 46   Basic     Pre-revenue; pricing live, no MRR ⁶                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ ┃ INVESTOR TAKEAWAY  Traction is neutral: 46/100; conditions attach until first MRR.    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ ▸ How this score was built (ledger)                    cro · grounded · llm-auditor ✓   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

Pending variant: header `— / 100  ○ Pending`, one card: "Pending — not assessed. No evidence has been supplied … not a low score. Add: [Connect Stripe +10] [Upload bank statement +8]", takeaway "No view on Legal & Compliance until evidence is supplied."

## W5 — Risk matrix + improvement plan

```
┌ 13  RISK MATRIX ───────────────────────────────┐ ┌ 14  90-DAY IMPROVEMENT PLAN ───────────────┐
│           impact LOW   MED    HIGH             │ │ #  ACTION                LIFT  WIN  DIM    │
│ lklhd HIGH   0       1      2 ■■              │ │ 1  Connect Stripe        +8   wk   tre     │
│       MED    1       2      0                  │ │ 2  10 evaluator intvws   +7   30d  mpc     │
│       LOW    2       0      0                  │ │ 3  Verify ABN            +8   wk   lco     │
│                                                │ │ 4  Advisory board (2)    +6   90d  ftv     │
│ RISK                  L     I    MITIGATION    │ │ 5  Cohort retention tbl  +5   30d  tre     │
│ ▲ 0 MRR (tre)        high  high  Stripe/trial │ │ ranked by lift ÷ effort · lifts as listed  │
│ ▲ Floor 55 unmet     high  high  see plan #1  │ │ in the catalogue, not cumulative           │
│ ▲ 2 unverified claims med   med  upload docs  │ └────────────────────────────────────────────┘
└────────────────────────────────────────────────┘
```

## W6 — 375 px behaviour

```
┌──────────────────────────┐
│ ▤ TOC ▾   Trusted Report │  sticky select
├──────────────────────────┤
│ SVI INDEX      135 ●Strong│  tiles stack, full width
│ EVIDENCE CONF   64 % med. │
│ VERDICT   B · conditions  │
│ VALUATION  A$3.0M–6.6M    │
├──────────────────────────┤
│ 8 DIMENSIONS (n = 42)     │
│ Traction & Revenue     46 │  label above bar
│ ░░░████████▌░░│░░         │
│ Market Pull            87 │
│ ░░░░░░░░░░░░░░│████▌      │
│ …                         │
├──────────────────────────┤
│ VALUATION METHODS  ⇠ ⇢    │  overflow-x-auto, sticky 1st col
│ │Method     │Wt │Low │Mid│ │
│ │Berkus     │.30│2.0M│…  │ │
└──────────────────────────┘
```

## W7 — Print pagination (A4)

```
p1  Dashboard                  p3  Key points + Valuation      p5–12 one chapter each
p2  Investment view            p4  Valuation (cont.)           p13 Risk matrix · p14 Plan
p15 Money on the table         p16+ Appendix (method, phase-gate matrix, ledger, register,
                                    audit log, Evidence cited, disclaimers)
Rules: h2/h3 never last line on a page; tables/figures/callouts/tiles unbreakable;
thead repeats; footer "Startup Value Index · {startup} · {date} · p. X · Not financial advice."
Free tier (10 pages): p1–3 as above, chapters 1–4 (p4–7), locked cards for 5–8 (p8),
risk grid + plan (p9), appendix counts + disclaimers (p10).
```
