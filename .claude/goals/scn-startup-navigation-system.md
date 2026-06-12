# SCN — Startup Core Needs Framework → "Startup Navigation System"

> **Strategic reframe (CEO directive, 2026-06-12):** BlockID is NOT a Valuation
> Platform, Equity Platform, or Fundraising Platform. It is a **Startup
> Navigation System — "Google Maps for Startups."** SVI evolves into a
> **Startup Positioning Engine**. C-level agents must research each layer deeply
> and the auto-upgrade pipeline must reshape the report/analysis + dashboard
> around this framework.

## The 5 Core Needs (in strict sequence — needs do NOT happen at once)

| # | Need | Founder's question | What it maps to | Market gap |
|---|------|--------------------|-----------------|-----------|
| 1 | **VALIDATION** | "Am I solving the right problem?" | Problem worth solving? Market exists? Anyone paying? | Owned by YC / Lean Startup / Customer Discovery |
| 2 | **POSITION** | "Where am I?" | Stage, percentile, better than peers? | **BIGGEST GAP → this is SVI's opportunity** |
| 3 | **VALUE** | "What is my startup worth?" | Valuation — but an *output*, not the end need | Founders ask most, but it's a symptom |
| 4 | **DIRECTION** | "What do I do next?" | You-are-here → Next → Then (like Google Maps) | **Crunchbase / PitchBook / Carta do NOT do this** |
| 5 | **CAPITAL** | "How do I grow faster?" | Fundraising, Angel, VC, Equity | Only relevant AFTER 1-4 |

Sequence: **Validation → Position → Value → Direction → Capital**. The dashboard
and report must present needs in this order and meet the founder where they are.

## Target output (the hero of every dashboard + report)

```
Startup Index:      73 / 100
Current Stage:      Early Revenue
Estimated Value:    $1.2M
Funding Readiness:  68%
Ranking:            Top 15% of AU Startups
Next Best Action:   Acquire 20 Paying Customers
```

## Feature design — report/analysis + dashboard (for agents to research + build)

1. **POSITION hero (Startup Positioning Engine):** big "Startup Index NN/100" +
   Current Stage + **percentile vs AU peers** ("Top X%"). This is the headline,
   above value. Needs a percentile model (rank a startup's SVI against the cohort
   distribution) and a clear stage label.
2. **VALIDATION panel (need #1, shown first for early startups):** problem-worth,
   market-exists, willingness-to-pay signals → a simple "Validation score" with
   the concrete gaps to close.
3. **VALUE card:** Estimated Value ($) framed as an *output of position*, not the
   pitch — with the driver breakdown.
4. **DIRECTION / Navigation (the differentiator):** Google-Maps-style
   "You are here → Next: <action> → Then: <action> → Then: <action>". A
   prioritized, sequenced **Next Best Action** engine driven by the weakest SCN
   layer + stage. This is what no competitor offers — make it the wow.
5. **CAPITAL / Funding Readiness:** a % readiness gauge + what's missing to be
   investor-ready — surfaced only once Direction is on track.
6. **Narrative reframe across UI/marketing/report copy:** position the product as
   a *Startup Navigation System*, not a valuation/equity tool.

## Pipeline (this is the next GOAL — fully autonomous)

1. **Research (C-level agents):** CEO/CPO/CMO/CRO/CFO research the SCN layers,
   percentile/positioning models, next-best-action frameworks, competitor gaps
   (Crunchbase/PitchBook/Carta) → write findings to `agent_knowledge_base`.
2. **Propose:** distil research into concrete report/dashboard upgrade proposals.
3. **Auto-implement:** `agent-auto-improve` + `self-upgrade-agent` turn the
   proposals + this brief + `ceo-current-plan.json` directives into code, gated
   (tsc/lint/build/smoke/integrity) and deployed off-peak with revert-on-failure.

Success = the live dashboard + report are organised around Validation → Position
→ Value → Direction → Capital, with the Position percentile and Next-Best-Action
navigation as the hero.
