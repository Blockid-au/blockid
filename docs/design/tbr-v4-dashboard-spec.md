# TBR v4 — investor dashboard first, detail on drill-down (G34 design spec)

**Status:** DESIGN ONLY (25/09/2026). No code.

- **Parent plan:** [G34](../plans/g34-biz-trust-report-v4-quality-2026-09-25.md) §6
- **Builds on (does not replace):** [G31 Investor Lens spec](investor-lens-report-spec.md) · [G27 TBR v3 spec](tbr-v3-investor-report-spec.md) · [unicorn-template](unicorn-template.md)
- **Evidence:** [G34 research annex](../research/2026-09-25-g34-investor-screening-research.md)

## Design system

The `ui-ux-pro-max` search ("financial research report / investor due diligence") suggested a dark OLED theme, a green accent and IBM Plex Sans. We **rejected** that, as G31 did.

What we use:
- Light-only site (G30 §10.11).
- Navy `#1b2a5e` and cyan-muted `#0e7490`.
- Space Grotesk, Inter and IBM Plex Mono with `tabular-nums`.

What we kept from the search:
- Bullet-style bars.
- Every value is printed as text.
- Status is never shown by colour alone.
- No radar on page 1 (accessibility grade B).

**Public-repo rule:** no numeric dimension weights, either in this repo or on the page. The page shows only the **stage emphasis band** (High / Medium / Low), which comes from private config (G34 D24-f).

## 0. What changes from G31 page 1

| G31 page 1 | v4 page 1 | Why |
|---|---|---|
| 4 tiles (valuation, SVI with Investor Score as a sub-line, evidence, verification) | **5 tiles**: Investor Score gets its own tile | SVI is uncapped (D22), so it can't share a tile with a 0–100 composite |
| 6-signal Priority Matrix with scores | **8-dimension scorecard** with a lead agent per row. The 6 signals become a **status chip row** | Only the 8 dimensions store a score, confidence and owner today. Codex's `buildInvestorScreening` sets `score: null` by design, and a matrix with empty score columns looks broken. The scored matrix comes back once G32 `question_scores` produce a score per signal (G31 C12) |
| "Investable now"-style labels | G31 meeting labels: strong case / worth investigating / major issues / evidence incomplete | Research doc and D21: wording points to further diligence, never to an investment decision |
| — | **Key-metrics strip**: ARR, growth, NRR, gross margin, runway, burn multiple | Every comparable system puts metrics right under the score (research §2) |
| — | **Red-flag panel**, rule-derived | V7 Go / AlphaLens triage pattern; kept separate from grounded deal-breakers |

## 1. Page-1 dashboard

### Desktop 1440

Content max-width is 1200 px on a 12-column grid. The G31 section rail and decision rail appear only after the masthead has scrolled away.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ TRUSTED BUSINESS REPORT (kicker)                               [Download PDF] [Share] [⋯]│
│ Acme Compliance Pty Ltd                                   (h1 Space Grotesk 32)          │
│ B2B SaaS · Seed · NSW · ABN verified                                                     │
│ 25/09/2026 · RPT-8F2A rev 3 · SVI method x.y · report schema v2 · release …          ⓘ   │
├───────────────────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│ INDICATIVE PRE-MONEY      │ SVI INDEX    │ INVESTOR     │ EVIDENCE     │ VERIFICATION    │
│ A$4.2M – A$8.5M  (mono 40)│ 128  ±9      │ SCORE 71/100 │ 64 %         │ L3              │
│ ├──■────●─────■──┤ bar    │ ▲ +3 since   │ Developing   │ ▰▰▰▰▱▱       │ Financials      │
│ base A$6.1M · 3 methods   │ 12/08 (same  │ (composite   │ conviction   │ attested        │
│ ask 12% above range       │ method)      │ of 8 dims)   │ medium       │                 │
├───────────────────────────┴──────────────┴──────────────┴──────────────┴─────────────────┤
│ ◐ WORTH INVESTIGATING · "Recurring revenue is transaction-evidenced; cap table and IP     │
│   assignment are not on file."   Rule: B · 2 unverified material claims ⓘ                 │
│   BlockID organises the evidence; investors decide. General information, not advice.     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ KEY METRICS   ARR A$410K   │ Growth 6.2%/mo │ NRR       │ Gross margin │ Runway │ Burn ×  │
│               Stripe · Sep │ Stripe · 6 mo  │ ○ Not     │ ○ Not        │ ○ Not  │ ○ Not   │
│               ✓ verified T1│ ✓ observed     │ evidenced │ evidenced    │ evid.  │ evid.   │
├────────────────────────────────────────────────────────┬─────────────────────────────────┤
│ 8-DIMENSION SCORECARD                         7 cols   │ ▲ RED FLAGS (rule-derived)  5col│
│ Dimension · lead     Emphasis Score  Evidence  Trend   │ ▲ Ask 12% above valuation range │
│ Traction Revenue Ev.  High ████████░ 78 ✓ ▰▰▰▰▰▱ ▲+4 › │ ▲ No cap table on file          │
│   Lead · CRO                                           │ ▲ 2 material claims founder-    │
│ Market Pull & Cat.    High ██████░░ 64 ◐ ▰▰▰▱▱▱ —   ›  │   stated only                   │
│   Lead · CMO                                           │ ◌ 1 section: written analysis   │
│ Founder Traction Vel. High ███████░ 71 ◐ ▰▰▰▰▱▱ ▲+2 ›  │   unavailable                   │
│ Product-Tech Depth    Med  …  (8 rows, 56 px each)     │ [View all risks → §13]          │
│ Capital Governance    Med  —  ◌ Pending: no evidence › │                                 │
│ … Investor Readiness · Legal Compliance · Strategic Moat│                                │
│ Lead = AI agent role that drafted and scored the chapter (saved provenance, not a sign-off)│
│ Investor signals: Team ✓ · Traction ✓ · Moat ✓ · Liquidity ○ · Capital ○ · IP ◐         │
│ Peer position: p62 of Seed B2B SaaS (n=41)  |  Stage ladder: ●●●○○ Early revenue         │
├─────────────────────────────┬──────────────────────────────┬─────────────────────────────┤
│ ✓ WHY INVESTIGATE (≤3)      │ ▲ WHAT COULD STOP THE DEAL ≤3│ ? ASK BEFORE THE MEETING ≤3 │
│ text · [1] footnote · chip  │ text · chip · "unverified"   │ 1 question · why · signal   │
├─────────────────────────────┴──────────────────────────────┴─────────────────────────────┤
│ NEXT STEP  [Request evidence from founder] (1 navy primary)   Read the full analysis ↓   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Tiles** (column spans 5 · 2 · 2 · 2 · 1):

- **Valuation** is always the largest figure.
  - If a range can't be estimated, show "Not enough evidence to estimate a range" and the evidence that would unlock a method, e.g. "Connect Xero → revenue multiple".
  - Never draw a blurred or placeholder range.
  - Source: the CFO `valuation-core` producer (G32 V04b), per method.
- **SVI** shows the uncapped `cover.svi.total`, never "/100" (D22).
  - Show ± only when SVI v3 publishes uncertainty.
  - Show a trend only if the previous revision used the same method; otherwise show "Method changed ⓘ".
- **Investor Score:** the 0–100 composite (G27 §4, SOT §9.4.6). It feeds the meeting label.
- **Evidence:** evidence confidence % and conviction.
- **Verification:** the highest verification level (L0–L4) and what it covers.

**Key metrics strip** (research §3 TRE/CGH):

- **ARR** comes from `arrAud` only when a non-self-declared evidence row backs it. Chip: "✓ verified T1" (connector/bank), "◐ company-stated T3" or "○ stated T4".
- **Growth** comes from `monthlyGrowthRatePct`. When `growthAssumed` is set, show "Sector median assumed, not observed".
- **NRR, gross margin, runway and burn multiple** show **"○ Not evidenced"** until a CFO/CRO module output with evidence ids supplies them (G34 Q6). Never derive them from assumptions.
- Cells depend on stage:
  - Pre-seed: NRR, GM and burn are replaced by LOIs, paid pilots and waitlist conversion (TRE-02).
  - Series A and later: add CAC payback and magic number.

**Scorecard:**

- Rows follow chapter order. The dimension name is an `<a href="#dim-tre">`, and the whole 56 px row is the click target (via a pseudo-element).
- Each row shows, in order: emphasis band chip → score bar (solid navy) → band chip (icon + text) → confidence meter (6 cyan segments) → trend glyph with text → chevron.
- A pending dimension shows "—" with a dashed chip, never 0.

**Red flags vs deal-breakers** (no item appears in both):

- **Red flags** are deterministic rule outputs:
  - `quality.consistencyIssues`
  - `phaseGates.blockers`
  - unverified material claims
  - ask above the valuation range
  - `quality.degradedSections`
  - stale or contradicted evidence
  - missing cap table
  - ASIC mismatch (Q6)
  - the catalogue red-flag rules in research §3, when their evidence triggers them
- **Deal-breakers** are the grounded `gaps` from `buildInvestorScreening`.
- If an item's evidence id already appears as a red flag, it is removed from the deal-breakers.

**Signal chip row:**

- Source: `buildInvestorScreening().signals[].status`.
- Tapping a chip opens a popover with its `summary` and linked criteria.
- No score is shown until G31 C12.

**Peer position and stage ladder** (Q6):

- **Peer percentile** is shown only when the cohort has n ≥ 10. Otherwise show "Peer set too small (n=6)".
- **Stage ladder:** Idea → Validating → Early revenue → Scaling → Established, derived from verified evidence.
- The ladder is kept separate from quality, following the CB Insights Commercial Maturity pattern.

### Tablet 768–1279

- Masthead as on desktop.
- Tiles on 6 columns: valuation spans the full width, then SVI / Investor Score / Evidence / Verification in a 2×2 grid.
- Key metrics in a 3×2 grid.
- Scorecard at full width. The trend moves under the score and the emphasis band under the name.
- Red flags as a full-width panel below the scorecard.
- The three lists stack as `<details>`, open by default.
- A 48 px sticky bar shows: label · valuation · evidence % · Actions.

### Mobile 375 (risks before strengths)

```
┌ ← Reports      RPT-8F2A rev3  ⋯ ┐
│ Acme Compliance Pty Ltd         │
│ B2B SaaS · Seed · NSW · 25/09   │
├─────────────────────────────────┤
│ A$4.2M – A$8.5M (mono 32)       │
│ base 6.1M · 3 methods · ask +12%│
├───────────────┬─────────────────┤
│ SVI 128 ±9    │ Investor 71/100 │
│ ▲+3 same meth.│ Developing      │
├───────────────┼─────────────────┤
│ Evidence 64%  │ Verified L3     │
│ ▰▰▰▰▱▱ medium │ Financials att. │
├─────────────────────────────────┤
│ ◐ WORTH INVESTIGATING           │
│ "Recurring revenue is …"        │
├─────────────────────────────────┤
│ ▲ Red flags (3)             ▾   │
│ ▲ Could stop the deal (3)   ▾   │
│ ✓ Why investigate (3)       ▾   │
│ ? Ask first (3)             ▾   │
├─────────────────────────────────┤
│ Key metrics 2-col grid, 6 cells │  ← no horizontal scroll
├─────────────────────────────────┤
│ Traction Revenue Ev.    ✓ 78 ›  │  ← 72 px cards
│ ████████░ ▰▰▰▰▰▱ ▲+4 · Lead CRO │
│ …                               │
├─────────────────────────────────┤
│ [Contents ▾]  [PDF]  [Request]  │  ← 56 px + safe area
└─────────────────────────────────┘
```

## 2. The full report after the dashboard

This replaces G31's 16 sections.
- It keeps G31's reading layers L0–L3.
- The backbone is the **8 scored dimensions**.
- G31's six signal chapters (05–10) become **signal blocks inside the owning dimension chapter**, so no finding is written twice.

| # | Section | Source / change |
|---|---|---|
| 1 | Dashboard | G31 01 Snapshot + 02 Priorities + the three lists (why / stop / ask) |
| 2 | Investment thesis and conditions | v3 Investment view + Key points + G31 04 Business (4 cells × ≤60 words). **One-sentence thesis, strongest proof first** (VC memo pattern) |
| 3 | Valuation | G31 11, moved forward. Every method with its applicability and weight. **Methods not used, why, and what evidence would unlock each** (Equidam pattern). IPEV calibration note |
| 4 | Evidence and confidence | G31 03: evidence tiers T1–T4, freshness, the 3 weakest claims. **Calibration disclosure:** backtest ρ + n, "not a substitute for diligence". CDO named once, as evidence officer |
| 5–12 | Dimension chapters (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM, in scorecard order) | Common anatomy below |
| 13 | Risks | All red flags, a 3×3 count table and the top 5 risks. Rank = severity × probability, **not** × confidence (D21) |
| 14 | Questions to ask | G31 13. Seeded from Codex `questions`, the chapter questions and the catalogue red-flag questions. Split into evaluator actions and founder actions |
| 15 | 90-day plan + Money on the table | v3 blocks, unchanged |
| A–E | Appendix | A Evidence register · B Methodology (ledger, **emphasis bands rather than raw weights**, verdict rubric, valuation methods) · C Audit and provenance · D Disclaimers · E Evidence cited |

**Where each signal block goes:**

| Signal block | Chapter |
|---|---|
| Team roster + key-person grid | FTV |
| Traction KPIs | TRE |
| Competitor table | MPC |
| Tech depth | PTD |
| Moat breakdown | SVM |
| IP checklist | LCO |
| Cap table + governance checklist | CGH |
| Liquidity routes | IRI; shows Codex's "No dedicated exit assessment" until a liquidity assessment is recorded |

### Common chapter anatomy (web = PDF = DOCX)

1. **Header**
   - `05 · Dimension 1/8 · emphasis High`, then the title, score, band chip, confidence meter and trend.
   - Benchmark line with n. If n < 10, say so and show no percentile.
   - Byline: `Lead: CRO · with CFO, CMO · Evidence: CDO · Judges: 2 independent model families`.
2. **Headline verdict:** at most 40 words, with the judgement first and footnote markers.
3. **Key metrics:** 2–4 dimension-specific tiles, each with source, date and tier, or "Not evidenced".
4. **Question matrix**
   - One row per catalogue item (FTV-01, …) or guiding question.
   - Columns: question · status · score (0–4 rubric once G32 is active) · evidence tier · **cited source (deck page / file / URL)** · owner role.
   - Status values: ✓ Verified (T1/T2) · ◐ Company/founder-stated (T3/T4) · ○ Missing · ✕ Contradicted · 🔒 In full report.
   - Before G32 the rows are the 13 criteria; after G32 they are the 52 questions plus overlays. **It is one component either way** (Hebbia/AlphaLens pattern).
5. **Evidence:** at most 5 claim rows, then "+N in register → A".
6. **Gaps:** at most 3. An uncited material claim gets an outline "unverified" chip.
7. **Signal block**, if this chapter owns one.
8. **Questions this raises:** at most 2, each linking to §14.
9. **"How this score was built"**
   - Web: a `<details>` element. PDF: a table in appendix B.
   - Shows each question's contribution in points × tier multiplier. No raw dimension weights.
10. **Audit line** (12 px, muted): role · grounded share · judge agreement · auditor stamp.

## 3. States

| State | Trigger | Dashboard |
|---|---|---|
| Loading | Job not final | Skeletons shaped like each block (5 tiles, 8 × 56 px rows, 3 lists), with no layout shift. Stage timeline + ETA (existing SSE) in `role="status"`. No numbers, no spinner mid-page |
| Preliminary | Preview before final | "Preliminary" chip on the masthead and the label. Trend hidden. Share and PDF disabled with the reason "Final report ready in ~N min". Print watermark |
| Degraded | `quality.degradedSections.length > 0` | Banner naming the affected sections. Deterministic tiles and scorecard still render. The affected row shows "◌ Written analysis unavailable". The chapter offers "Re-run this section", with a quote first. Never an empty paragraph |
| Insufficient evidence | Label D or a pending dimension | Valuation tile shows the not-estimable state. Pending rows show "—" with a dashed chip. Metrics show "○ Not evidenced". Primary action: "Add evidence" (founder) or "Request evidence" (evaluator) |
| Locked (free) | `tier=free`, `unlock.mode=buy` | **Page 1 is never locked (D24-b).** Masthead, tiles, label, scorecard scores and bands, and signal *status* all stay visible. Locked chapters show 🔒 "In full report" on the row chevron. Codex's rule applies: the chip reads "Details in full report", and no locked evidence or bullets reach lists, DOM, PDF or email. Lists may show "+N in full report" as a count. One unlock rail with a review step before payment |
| Old revision | Viewing rev < latest | Info banner: "Viewing rev 2 (12/08). Latest rev 3 (25/09) ›". All figures come from that snapshot. Primary action: "Open latest" |
| Shared / public | `/tbr/[token]` | No founder or correction actions. Private evidence shows "Private source — access required". Revision fixed; share date in the masthead. `noindex`. An expired link shows a card, not a 404 |

## 4. Showing agent ownership

- **Scorecard**
  - One muted 12 px line under the dimension name: `Lead · CRO`, as `<abbr title="Chief Revenue Officer agent">`. No avatars.
  - A single footnote under the table: "Lead = AI agent role that drafted and scored the chapter (saved provenance, not a model claim or human sign-off)."
- **Chapter header:** lead + supporting roles, from the G34 module registry. The registry replaces `DIMENSION_OWNERS` as the single owner source (D24-c).
- **Question matrix:** each row shows its `owner` role. When the owner is a supporting agent, the lead is still accountable for the dimension total.
- **Cross-cutting roles:** CDO appears once, in §4. CISO and COO appear only on their own deterministic cards. The llm-auditor stamp appears on audit lines.
- **Mobile:** the role goes on the card's meta line.
- **PDF page 1:** one "Lead" column of 3-letter codes.

## 5. PDF page 1 and email summary

**PDF page 1**

Format: A4 portrait, 12 mm margins, 186 mm content width, minimum 9.5 pt.

Content, top to bottom:
1. Masthead (3 lines).
2. Five tiles in one row. The valuation tile is double width, with an SVG bar.
3. Meeting label + thesis (2 lines).
4. Key metrics as a 6-cell table.
5. Scorecard table (8 rows): dimension · lead · emphasis · score · band text · evidence % · trend · "p. N".
6. Bottom band in two columns: red flags (≤3) | why / stop / ask (top 2 each, "+1 on p. 2").

On every page:
- Footer: `Trusted Business Report · {company} · RPT rev · SVI {method} · {date} · p. X/Y · General information, not financial advice`.
- Icons become characters (✓ ◐ ○ ▲ ✕) with text.
- Rails and buttons are hidden.
- `break-before: page` on each section.

DOCX uses the same order. Tiles become a 1×5 table, and the scorecard table repeats its header row.

**Email summary** (transactional, class T, G34 §9)

It **must contain no promotion**; CI lint enforces this.

Format: 600 px, single column, table-based, inline styles, no images required, plus a plain-text part.

Content, in order:
1. Company · date · revision.
2. Meeting label.
3. The 5 metrics as a 2-column table.
4. 8-dimension mini table: name · score · band text, or "—" when pending.
5. Top red flag.
6. 3 questions.
7. One navy button, "Open report (rev 3)", deep-linked to that exact revision.

Locked free-tier content is never included.

## 6. Accessibility and chart rules

- **Tables before charts**
  - Scorecard, metrics, risks and question matrix are `<table>` elements with a `<caption>`.
  - The only page-1 graphics are the valuation range bar, score bars and confidence meters.
  - Each graphic is `role="img"` with a full `aria-label`, e.g. "Score 78, Strong, evidence 90 percent, up 4 since 12 Aug".
  - No radar, gauge, heatmap or gradient on page 1.
- **Score and confidence use different shapes:** a solid navy bar vs 6 cyan-muted segments.
- **Every status uses three cues:** icon + text + colour.
  - Colour appears only in the icon, a 3 px border and an 8 % background.
  - "Not evidenced" is a dashed outline with ○ and words, never blank or 0.
- **Contrast:** body text ≥4.5:1; segments and borders ≥3:1. No `#22D3EE` / `#0891b2` as text, and no raw hex (existing guard).
- **Numbers:** `font-mono tabular-nums`, locale-formatted (`A$4.2M`, `25/09/2026`), minimum 12 px.
- **Semantics:** one `h1` (the company), `h2` per section, `h3` per card.
- **Keyboard and touch**
  - Scorecard rows are real links; keyboard order matches visual order.
  - Targets 44 px with 8 px gaps.
  - Tooltips open on focus and on tap.
  - Drawers trap focus and close on Esc.
  - Skip link.
- **No motion on figures.** Disclosures animate for 180–200 ms, turned off under `prefers-reduced-motion`.

## 7. Implementation notes (for G34 Q3; not started)

- **New projection:** `lib/report-v2/dashboard-v4.ts`, composed from `buildDashboardView`, `investmentViewFor` and `buildInvestorScreening`.
  - **Extend Codex's `investor-screening.ts`; do not create a parallel `investor-lens.ts`.**
  - It adds no new scores.
  - It returns `tiles`, `keyMetrics`, `scorecard[8]`, `redFlags`, `lists`, `signalChips`, `peer` and `stageLadder`.
  - Web, PDF, DOCX and email all read this one projection.
- **Reuse G31 primitives:** `LensMasthead`, `MetricTile`, `MeetingLabel`, `ScoreBar`, `ConfidenceMeter`, `StatusChip`, `TrendGlyph`.
- **New components:** `DimensionScorecard`, `KeyMetricsStrip`, `RedFlagPanel`, `SignalChipStrip`, `QuestionMatrix`.
- **Flag and tests:** everything sits behind G31's `investorLensMode` build-time flag.
  - The SVI invariance golden test (G31-4) must stay green.
  - The free-tier leak test must pass for DOM, PDF, DOCX and email.
- **Sequencing:** start only after Codex's uncommitted screening UI lands (`dashboard.tsx`, `report.tsx`, `criteria-summary.tsx`, exports), so there are no file conflicts.
