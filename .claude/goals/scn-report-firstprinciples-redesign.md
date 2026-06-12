# SCN Report Redesign — First-Principles Navigation + Conversion

> **Goal:** Rebuild the SVI report (on-screen + PDF) around the SCN framework so
> it (a) names the founder's REAL problem, (b) shows BlockID's value as a
> *Startup Navigation System*, and (c) uses first-principles questions + CTAs to
> pull the founder deeper into the product and to paid. Extends
> [[report-v2-compelling]], [[progressive-report-monetization]],
> [[first-impression-excellence]], [[idea-stage-action-system]].
> Built on [[scn-startup-navigation-system]].

## The spine: First-Principles → SCN → Next Feature

Every report is a guided reflection. Each step asks a first-principles question,
answers it with the founder's data, then routes to the BlockID feature that
advances them — turning the report into a navigation system, not a static PDF.

| Step | First-principles question | SCN need | Highlight | Routes to feature / CTA |
|------|---------------------------|----------|-----------|-------------------------|
| 1 Problem | "Strip every assumption — what is the ONE real problem you solve, for whom?" | Validation | **The problem + is it worth solving** | SVI analysis / Evidence Vault |
| 2 Why-now/you | "Why now? What unfair insight do you have?" | Validation | Timing + edge | Evidence Vault |
| 3 Position | "Where are you really?" | **Position** | **Startup Index NN/100 · Stage · Top X% of AU** (the hero) | SVI history / percentile |
| 4 Proof | "What is the smallest proof someone will pay?" | Validation | Traction gaps | Evidence Vault / Metrics |
| 5 Value | "Given your position, what are you worth — and what moves it?" | Value | Estimated $ + value drivers | Valuation engine |
| 6 Direction | "What is the single highest-leverage next action?" | **Direction** | **You are here → Next → Then** (the differentiator) | Action Plan / Roadmap |
| 7 Capital | "What makes you investor-ready?" | Capital | Funding Readiness % + gaps | Data Room / Pitch Deck / Cap Table |

## Value proposition to make explicit in the report
"Crunchbase/PitchBook/Carta give you data. **BlockID tells you WHERE YOU ARE and
WHAT TO DO NEXT** — your Startup Navigation System, from idea to funded." Lead
with the founder's problem and the value BlockID adds, not features.

## Report structure (reorder existing sections to SCN)
Keep section IDs in `web/src/lib/report-sections.ts`; reorder + reframe to SCN:
1. **Hook** (new, free): problem framing + first-principles reflection + the
   Position hero (Index + Stage + Top X%). This replaces a dry "Executive Summary"
   opener — it must grab the founder in the first screen.
2. Validation (market + proof) → 3. Position → 4. Value (traction/valuation) →
   5. Direction (Next Best Action) → 6. Capital (cap_table/gtm/dataroom).
Each section: a first-principles question (callout) → the analysis → a **single
Next Best Action** → a **contextual CTA** to the relevant feature.

## PDF upgrade (web/src/lib/pdf/svi-report-pdf.tsx)
Reuse components: ScoreGauge, MetricCard, InsightBox, ActionItem, DimensionBar.
- **Cover:** startup name + big `ScoreGauge` (Startup Index) + "Top X% of AU
  startups" + current stage + the value-prop line.
- **Per section:** first-principles question in an `InsightBox`, key metrics in
  `MetricCard`, the next step as a prominent `ActionItem`.
- **Navigation page:** "You are here → Next → Then" visual (Google-Maps style).
- Mentoring tone (free = 10 pages teaser, paid = full — per [[report_tone_structure]]).
- Visuals required (charts/gauges/flow), per [[report_visuals]].

## CTAs + conversion (lead login → keep using → pay)
- **Every section ends with a contextual CTA** routing deeper: "→ Continue in
  Evidence Vault", "→ Build your Cap Table", "→ Generate your Pitch Deck".
- **Free report = teaser:** show Position + ONE next action; lock Direction +
  Capital depth behind: "🔑 Log in to unlock your full Navigation" / "Unlock the
  Direction & Capital roadmap (N credits)". Progressive monetization.
- **End CTA:** "Your next 3 actions are ready — log in to start" → drives login +
  return usage. Re-engagement: email/Telegram nudge with the #1 next action.

## Success criteria (for the autonomous builder to verify)
- Report opens with the problem + Position hero + a first-principles question.
- Each SCN section has a question, a Next Best Action, and a CTA to a feature.
- PDF cover shows Index + Top X% + stage; sections use the visual components.
- Free report locks deeper SCN layers behind clear login/pay CTAs.
Ship incrementally: ONE section/feature per gated deploy; never break the report.
