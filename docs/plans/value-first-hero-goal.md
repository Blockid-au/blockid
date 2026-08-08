# Value-First Hero — User Outcome Copy Enforcement (Machine-Readable Goal)

> **Source of truth: [SOURCE-OF-TRUTH.md](./SOURCE-OF-TRUTH.md)** — this file is a specialised view; consult the source-of-truth first for status.

```yaml
---
goal_id: value-first-hero-v1
status: open
version: 2026-08-08.1
owner: admin@blockid.au
created: 2026-08-08
loop_flag_env: VALUE_FIRST_HERO_LOOP
kill_switch: env VALUE_FIRST_HERO_LOOP=off
autonomous_loop: disabled  # reference/enforcement goal — no ticking loop; tasks are run by a human or on-demand agent

principle: |
  "User Value First" — every hero section must lead with what the user GETS
  and what hard problem it SOLVES. Marketing/pricing CTAs are lower priority.
  The hero is not the place for product identity or category labels.

success_criteria:
  - SC1: Every public tool page hero (/tools/*) leads with (a) a concrete user
      outcome ("Get a defensible valuation in 60 seconds", "Know exactly what
      your startup is worth") AND (b) the hard problem it solves (equity split
      confusion, investor-readiness gaps, idea-stage uncertainty) — NOT the
      product name or a category label.
  - SC2: The landing page hero sub-headline quantifies user benefit with numbers
      (time saved, AUD value, percentage, or count).
  - SC3: No tool page hero uses the word "tool" or "calculator" as the first
      word of the H1.
  - SC4: CTA buttons on tool pages say what the user gets ("Get my valuation",
      "Clarify my idea") — not what the system does ("Submit", "Calculate",
      "Continue").
  - SC5: Dashboard first-view shows a live metric the user cares about within
      the fold — not a welcome banner.

file_boundary_safe_zones:
  - web/src/app/tools/*/page.tsx                      # header copy only — no logic changes
  - web/src/components/landing/hero-v3.tsx            # numbers strip addition only
  - web/src/app/dashboard/page.tsx                    # additive metric card only
  - docs/plans/value-first-hero-goal.md               # THIS doc

file_boundary_do_not_touch:
  - web/src/lib/**                                    # no logic changes
  - web/src/components/landing/nav-v2.tsx             # owned by ux-ia goal (G7)
  - web/src/app/pricing/**                            # owned by Pricing agent (G5)
  - migrations/**                                     # no schema changes
  - docker/**                                         # no infra changes
  - .github/**                                        # no CI changes

phased_tracks:
  P0_audit:
    status: open
    description: |
      Review all /tools/* page.tsx files for H1 copy compliance with SC1 and SC3.
      Produce a compliance table: file path | current H1 | compliant? | suggested outcome-first H1.
      No code changes in this phase — audit only.
  P1_tool_hero_copy:
    status: open
    description: |
      Update non-compliant tool page H1s and sub-descriptions to outcome-first copy.
      Each H1 must name (a) the concrete user outcome and (b) the hard problem solved.
      Scope: web/src/app/tools/*/page.tsx — copy strings only, no JSX structure changes.
  P2_cta_language:
    status: open
    description: |
      Update CTA button copy on all tool pages from action-language ("Submit",
      "Calculate", "Continue") to outcome-language ("Get my valuation",
      "Clarify my idea", "See my equity split").
      Scope: web/src/app/tools/*/page.tsx — button label strings only.
  P3_landing_hero:
    status: open
    description: |
      Add a "numbers strip" below the H1 in HeroV3 (hero-v3.tsx).
      Example: "2,700+ AU startups benchmarked · A$850K average idea-stage
      valuation · 60 seconds to your number".
      Numbers must be real or defensible — pull from platform-config.ts or
      a static constant; do NOT fabricate. Additive only — no existing copy removed.
  P4_dashboard_metric:
    status: open
    description: |
      Add a live "Your startup at a glance" metric card to the dashboard
      first-view (web/src/app/dashboard/page.tsx), positioned above the
      step ladder. Card must show ≥1 live metric the logged-in user cares
      about (e.g., SVI score, valuation estimate, days-since-last-update).
      Additive only — no existing dashboard components removed or reordered.

open_questions:
  Q1:
    text: "Which live metric is highest priority for the dashboard metric card — SVI score, valuation estimate, or cap-table completeness?"
    recommendation: "SVI score + valuation estimate as a two-stat card (most founder-relevant; already computed)."
    human_owner: admin@blockid.au
    blocking: true   # blocks P4 start
  Q2:
    text: "Should the numbers strip in HeroV3 auto-update from the DB or be a static constant updated manually each quarter?"
    recommendation: "Static constant in platform-config.ts for now — avoids a DB query on the landing page critical path."
    human_owner: admin@blockid.au
    blocking: false

references:
  - https://www.useronboard.com/features/value-proposition/ — outcome-first copy patterns
  - https://copyhackers.com/2019/10/jobs-to-be-done/ — JTBD framing for SaaS hero copy
  - https://nngroup.com/articles/headlines-plain-language/ — NNG: users scan for outcomes, not labels
---
```

---

## §A — Principle: Why "Value First"

Startup and business founders arrive at /tools/* with a specific hard problem in mind — not a desire to "use a tool". If the hero section leads with a product name or category label ("Cap Table Calculator"), the user must do extra cognitive work to map the product to their problem. When the hero leads with the outcome ("Know exactly who owns what after your next funding round"), the user immediately understands the value and is far more likely to engage.

The same logic applies to CTAs: "Submit" is what the system does. "Get my equity split" is what the founder wants.

This goal enforces outcome-first copy across all public-facing hero sections — permanently, as a product standard.

---

## §B — Audit Checklist (P0)

For each file matching `web/src/app/tools/*/page.tsx`, record:

| File | Current H1 | Starts with "tool" or "calculator"? | Names a concrete outcome? | Names a hard problem? | Compliant? |
|------|-----------|--------------------------------------|--------------------------|----------------------|------------|
| (populate in P0) | | | | | |

---

## §C — Copy Standards Reference

### C.1 Outcome-first H1 pattern

```
[Verb] [concrete user outcome] [in/within timeframe or qualifier]
```

Examples:
- "Get a defensible valuation in 60 seconds"
- "Know exactly what your startup is worth before you pitch"
- "Clarify your idea — and your co-founder agreement — before you build"
- "Model every funding scenario before you sign the term sheet"

### C.2 Hard-problem framing (sub-headline)

The sub-headline (or H2/paragraph immediately below the H1) must name the pain:

```
[Target persona] struggle with [hard problem]. [Product] [how it solves it].
```

Examples:
- "Idea-stage founders guess their equity split — and regret it at Series A. BlockID runs the maths so you don't have to."
- "Most startups don't know their valuation until an investor tells them (and by then it's too late to negotiate). Get your number first."

### C.3 CTA language table

| Current (bad) | Replacement (outcome-first) |
|---------------|-----------------------------|
| Submit        | Get my valuation            |
| Calculate     | See my equity split         |
| Continue      | Show my investor-ready score |
| Start         | Start my 60-second valuation |
| Get started   | Get my startup score        |

### C.4 Numbers strip format (P3)

```
[Stat 1] · [Stat 2] · [Stat 3]
```

Example: `2,700+ AU startups benchmarked · A$850K average idea-stage valuation · 60 seconds to your number`

Rules:
- All numbers must be real or defensible (sourced from platform-config.ts, DB aggregates, or publicly stated figures).
- Use AU locale formatting (A$ prefix, commas for thousands, "+" suffix for minimums).
- Maximum 3 stats — more than 3 dilutes impact.

---

## §D — Non-Goals

- No visual redesign of any page (layout, component structure, colours, spacing).
- No changes to business logic, data models, or API routes.
- No A/B testing infrastructure (copy changes ship as direct updates; test with analytics retrospectively).
- No changes to the nav or footer (owned by G7 — ux-ia-startup-flow-goal).
- No changes to /pricing (owned by G5).
- No new npm dependencies.
- No migrations or CI changes.
