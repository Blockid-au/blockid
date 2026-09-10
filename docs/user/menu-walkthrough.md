# Menu walkthrough — what unlocks, when, and why

> **Audience:** founders using BlockID. The same content is published at [blockid.au/docs/unlocks](https://blockid.au/docs/unlocks).
> **Companion spec (engineers):** [`docs/plans/unlock-next-level-2026-07-31.md`](../plans/unlock-next-level-2026-07-31.md) §2a, §2c, D2.
> **Last refresh:** 2026-09-10 (G8-P8). The two tables marked *generated* are rendered from code by `node web/scripts/docs/render-unlock-matrix.mjs`; `web/scripts/docs/unlock-matrix.test.ts` fails when the code changes and this file is not re-rendered. Edit the prose freely — never the generated blocks.

BlockID's menu is not static. It grows with your startup. As you finish evidence and cross **phase exit gates**, new tools appear in the sidebar — Cap Table when equity matters, Data Room when investors show up, Exit modelling once you have a real market.

**Gates are advisory.** You can move to the next phase manually whenever you decide you are ready; nothing in the product stops you. What the gate controls is the *badge* on your profile and the investor-facing trust score — both follow the evidence, not the phase you declared. So a founder who skips ahead sees the tools, but investors see a phase without the evidence behind it.

This page tells you exactly what you'll see, at which phase, on which plan.

---

## 1. Phase × plan — what the sidebar shows / Giai đoạn × gói — thanh menu hiển thị gì

The spine is 12 growth phases (`vision` → `funding`). The sidebar groups them into six workflow steps (Ideate → Validate → Build → Fundraise → Grow → Exit); each growth phase belongs to exactly one step, and a sidebar group opens the moment its step is reached.

How to read a cell:

- A group name on its own (e.g. **Home**) — the group is open and every row is usable on that plan.
- **Validate (8 upgrade)** — the group is open, but 8 of its rows are dimmed with a lock and an *Upgrade* chip because your plan is below the row's minimum. Click any dimmed row to compare plans.
- **(2 add-on)** — rows dimmed with an *Add-on* pill: a purchasable feature (Share Management for ESOP / Vesting) rather than a plan change.
- **Later phases: …** — the group is folded under a "Later phases" expander with a *Locked* pill so you can preview it. This only happens while you are more than three steps away from it.
- A group that is missing from the cell is **hidden** — either your phase has not reached it yet (progress-locked) or it belongs to a different audience (evaluator overlays hide founder groups, and vice versa).

Three groups are **always present** for founders: **Home**, **Validate**, **Account**. The **Roles** group only carries content for evaluator accounts (Investor / Advisor / Accelerator / Reseller / Mentor); for founders it resolves to nothing and is not rendered.

<!-- BEGIN GENERATED: unlock-matrix (node web/scripts/docs/render-unlock-matrix.mjs) -->
| # | Phase | Free | Starter | Growth | Package | Evaluator Scout | Evaluator Firm | Evaluator Program |
|---|---|---|---|---|---|---|---|---|
| 1 | `vision` — Vision & Mission | Home · Validate (8 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Account (5 upgrade) | Home · Validate · Account (4 upgrade) | Home · Validate (8 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Account (5 upgrade) | Home · Roles · Account (4 upgrade) | Home · Roles · Account (3 upgrade) |
| 2 | `customer_dev` — Customer Development | Home · Validate (8 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Account (5 upgrade) | Home · Validate · Account (4 upgrade) | Home · Validate (8 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Account (5 upgrade) | Home · Roles · Account (4 upgrade) | Home · Roles · Account (3 upgrade) |
| 3 | `revenue_model` — Revenue & Business Models | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Account (5 upgrade) | Home · Roles (1 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Account (4 upgrade) | Home · Roles · Account (3 upgrade) |
| 4 | `pitch` — Pitch Mastery | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Account (5 upgrade) | Home · Roles (1 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Account (4 upgrade) | Home · Roles · Account (3 upgrade) |
| 5 | `mentor_review` — Mentor Idea Review | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Account (5 upgrade) | Home · Roles (1 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Account (4 upgrade) | Home · Roles · Account (3 upgrade) |
| 6 | `legal_equity` — Legal & Equity | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Roles · Fundraise · Account (3 upgrade) |
| 7 | `go_to_market` — Go-to-Market & Scale | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Roles · Fundraise · Account (3 upgrade) |
| 8 | `product_dev` — Product Development | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Roles · Fundraise · Account (3 upgrade) |
| 9 | `investor_review` — Investor Progress Review | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Fundraise (2 upgrade) · Scale & Exit (6 upgrade) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Fundraise · Scale & Exit (1 upgrade) · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Roles · Fundraise · Account (3 upgrade) |
| 10 | `team` — Co-Founders & Team | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Fundraise (2 upgrade) · Scale & Exit (6 upgrade) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Fundraise · Scale & Exit (1 upgrade) · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Roles · Fundraise · Account (3 upgrade) |
| 11 | `growth` — Growth | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Fundraise (2 upgrade) · Scale & Exit (6 upgrade) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Fundraise · Scale & Exit (1 upgrade) · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Roles · Fundraise · Account (3 upgrade) |
| 12 | `funding` — Funding | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Validate (1 upgrade) · Build (4 upgrade, 2 add-on) · Fundraise (2 upgrade) · Scale & Exit (6 upgrade) · Account (5 upgrade) | Home · Validate · Build (2 upgrade, 2 add-on) · Fundraise · Scale & Exit (1 upgrade) · Account (4 upgrade) | Home · Validate (8 upgrade) · Build (13 upgrade, 2 add-on) · Fundraise (15 upgrade) · Scale & Exit (7 upgrade) · Account (5 upgrade) | Home · Roles (1 upgrade) · Fundraise (2 upgrade) · Account (5 upgrade) | Home · Roles · Build (3 upgrade, 2 add-on) · Fundraise · Account (4 upgrade) | Home · Roles · Fundraise · Account (3 upgrade) |

Column key: **Free** = Free (anonymous) (founder, tier `free`) · **Starter** = Starter (founder, tier `starter`) · **Growth** = Growth (founder, tier `growth`) · **Package** = Startup Package (founder, tier `free`) · **Evaluator Scout** = Scout (investor_angel, tier `angel`) · **Evaluator Firm** = Firm (advisor, tier `advisor`) · **Evaluator Program** = Program (investor_vc, tier `vc_small`)
<!-- END GENERATED: unlock-matrix -->

Notes:

- **Before your first SVI run** the sidebar treats you as pre-phase (workflow step 0). You see Home, Validate and Account, plus a "Later phases" expander previewing Scale & Exit. Run one analysis and the matrix above applies.
- **Package** is the one-off Startup Package: the menu is the Free menu plus the *Startup Package* row and the Money Finder / Grant Finder features. Rows that need Starter or above stay dimmed until you subscribe.
- **Evaluators** (Scout / Firm / Program) never see the founder Validate / Build / Scale & Exit groups; they get Roles → Investor / Advisor / Accelerator instead, and Fundraise once the startup they are viewing reaches that step. Reseller and Mentor consoles are feature-gated (`reseller.console`), not plan-gated, so they are not in this table.

---

## 2. How to unlock the next level / Cách mở khoá cấp tiếp theo

Every phase has an exit gate built from the same 13 evidence criteria that feed your SVI score. A phase is *cleared* when **all three** hold:

1. Each required criterion is rated at least **good** on the quality ladder `incomplete → basic → good → strong → exceptional`.
2. Each SVI dimension floor for the phase is met (0–100 per dimension).
3. The phase's deliverables are marked complete (only checked when you track deliverables).

The dashboard **Next unlock** card reads this table for you: it shows how far through the gate you are (`completionPct`, partial credit — 2 of 4 conditions met = 50%), the top three blockers ranked worst-first, and one next action. If you have moved on manually, the card keeps scoring the phase you are actually in.

<!-- BEGIN GENERATED: unlock-rules (node web/scripts/docs/render-unlock-matrix.mjs) -->
| # | Phase | Required evidence (≥ good) | SVI dimension floor | Sidebar groups that appear when you move on |
|---|---|---|---|---|
| 1 | `vision` — Vision & Mission | Idea & Innovation (`idea`), Founder Profile (`founder_profile`) | Market & Problem (MPC) ≥ 40 | nothing new — same groups as `customer_dev` |
| 2 | `customer_dev` — Customer Development | Market Opportunity (`market`), Customer Base & Traction (`customer_size`) | Market & Problem (MPC) ≥ 55 | Build (from `revenue_model`) |
| 3 | `revenue_model` — Revenue & Business Models | Revenue & Unit Economics (`revenue`), Go-to-Market Strategy (`gtm_strategy`) | Traction & Revenue (TRE) ≥ 40 | nothing new — same groups as `pitch` |
| 4 | `pitch` — Pitch Mastery | Key Documents (`documents`), Website & Digital Presence (`website`) | Investor Readiness (IRI) ≥ 45 | nothing new — same groups as `mentor_review` |
| 5 | `mentor_review` — Mentor Idea Review | Product Roadmap (`roadmap`) | — | Fundraise (from `legal_equity`) |
| 6 | `legal_equity` — Legal & Equity | Team Structure & Governance (`team_structure`), Key Documents (`documents`) | Cap Table & Governance (CGH) ≥ 50, Legal & Compliance (LCO) ≥ 45 | nothing new — same groups as `go_to_market` |
| 7 | `go_to_market` — Go-to-Market & Scale | Go-to-Market Strategy (`gtm_strategy`), Customer Base & Traction (`customer_size`) | Traction & Revenue (TRE) ≥ 55 | nothing new — same groups as `product_dev` |
| 8 | `product_dev` — Product Development | Code & Git Repository (`code_git`), Website & Digital Presence (`website`) | Product & Technical (PTD) ≥ 55 | Scale & Exit (from `investor_review`) |
| 9 | `investor_review` — Investor Progress Review | Data Room (`dataroom`), Key Documents (`documents`) | Investor Readiness (IRI) ≥ 65 | nothing new — same groups as `team` |
| 10 | `team` — Co-Founders & Team | Team Composition (`team`), Team Structure & Governance (`team_structure`) | Founder & Team (FTV) ≥ 60 | nothing new — same groups as `growth` |
| 11 | `growth` — Growth | Revenue & Unit Economics (`revenue`), Customer Base & Traction (`customer_size`) | Traction & Revenue (TRE) ≥ 70 | nothing new — same groups as `funding` |
| 12 | `funding` — Funding | all 13 criteria | Investor Readiness (IRI) ≥ 75, Cap Table & Governance (CGH) ≥ 65 | Final phase — everything is already open |
<!-- END GENERATED: unlock-rules -->

The last column is what *actually* changes in the sidebar when you step into the next phase, computed from the same catalogue as table 1 — so "nothing new" is an honest answer, not a gap: several consecutive phases share a workflow step, and the new tools for that step already opened at its first phase.

**SVI dimensions:** FTV = Founder & Team · MPC = Market & Problem · PTD = Product & Technical · TRE = Traction & Revenue · CGH = Cap Table & Governance · IRI = Investor Readiness · LCO = Legal & Compliance · SVM = valuation multiplier (never a floor).

---

## 3. The 13 evaluation criteria / 13 tiêu chí đánh giá (§2a)

Every phase gate reads from the same 13 evidence criteria. Weights sum to 100 and feed the SVI score directly.

| Criterion | Weight | Primary SVI dimension | What it means in plain English |
|---|---|---|---|
| `market` | 12 | MPC | Is the market real, big, and reachable? |
| `idea` | 10 | MPC | Is the problem sharp and the solution differentiated? |
| `customer_size` | 10 | TRE | Do you know your ICP and TAM/SAM/SOM? |
| `revenue` | 10 | TRE | Recurring revenue, ARPU, unit economics — with numbers. |
| `founder_profile` | 8 | FTV | Founder-market fit; why *you* for *this*. |
| `team` | 8 | FTV | Co-founders, roles, and coverage of the skills matrix. |
| `gtm_strategy` | 8 | TRE | Channels, CAC, activation — a plan, not a hope. |
| `documents` | 7 | IRI | Pitch, one-pager, model, memo — investor-grade. |
| `code_git` | 6 | PTD | Real repo, real commits, real reviewers. |
| `roadmap` | 6 | PTD | 6-quarter product roadmap tied to milestones. |
| `website` | 5 | PTD | Live product surface / marketing site — not a Notion page. |
| `dataroom` | 5 | IRI | Structured data room, permissioned, up to date. |
| `team_structure` | 5 | CGH | Cap table clean, ESOP pool sized, vesting on paper. |

---

## 4. Tier-locked vs phase-locked (Decision D2) / Khoá theo gói vs khoá theo giai đoạn

Two different reasons a menu item can be unavailable — and they look different on purpose.

- **Progress-locked (phase not reached)** → the group is **hidden entirely**. No dim, no lock icon, no visual noise. It appears the moment you reach its workflow step. Rationale: nothing pollutes the sidebar with tools you can't actually use yet. (The one exception is the "Later phases" preview for groups more than three steps away.)
- **Tier-locked (plan upgrade needed)** → the row stays **visible but dimmed**, with a lock icon and an **Upgrade** chip; add-on rows show an **Add-on** pill instead. Rationale: preserves upsell discovery — you can see what a higher plan unlocks and click through to compare pricing.

This is the **hybrid policy** decided on 2026-07-31. Neither pure-hide nor pure-dim on its own worked — pure-hide killed upsell discovery, pure-dim (the pre-G8 behaviour) buried the sidebar in 7 groups of locked pills the day you signed up.

**Route access unchanged.** Hidden ≠ blocked. A deep link you already hold still resolves; route-level entitlement remains authoritative. Hiding is about menu clarity, not permission.

---

## 5. Where to see your current unlock status / Xem trạng thái mở khoá hiện tại

Open **Dashboard → Next unlock** card. It shows:

- Your current growth phase (order + EN label) and a "How unlocks work" link to this page
- `completionPct` — partial credit for how far you are through the current gate
- Top 3 blockers ranked worst-first, with a single next action

---

## Where the rules live (for engineers)

- Canonical taxonomy: [`web/src/lib/growth/phase-taxonomy.ts`](../../web/src/lib/growth/phase-taxonomy.ts)
- Gate engine: [`web/src/lib/growth/phase-gate.ts`](../../web/src/lib/growth/phase-gate.ts) — `PHASE_EXIT_RULES`
- Nav catalogue + gates: [`web/src/components/workspace/nav-groups.ts`](../../web/src/components/workspace/nav-groups.ts)
- Live renderer (group hide / later-preview / item dim): [`web/src/components/workspace/workspace-layout.tsx`](../../web/src/components/workspace/workspace-layout.tsx) — `decideGroupVisibility()`, `resolveGroup()`
- Visibility decision: [`web/src/lib/nav/hide-when-locked.ts`](../../web/src/lib/nav/hide-when-locked.ts) — `decideVisibility()` returns `"show" | "show_dimmed" | "hide"`
- Audience overlays: [`web/src/lib/nav/role-menu-overlay.ts`](../../web/src/lib/nav/role-menu-overlay.ts)
- 13 evaluation criteria: [`web/src/lib/evaluation-criteria.ts`](../../web/src/lib/evaluation-criteria.ts)
- SVI dimensions: [`web/src/lib/svi-analysis.ts`](../../web/src/lib/svi-analysis.ts)
- Matrix builder + drift test: [`web/scripts/docs/unlock-matrix.ts`](../../web/scripts/docs/unlock-matrix.ts), [`web/scripts/docs/render-unlock-matrix.mjs`](../../web/scripts/docs/render-unlock-matrix.mjs), `unlock-matrix.test.ts`; JSON at `web/content/generated/unlock-matrix.json`

- Sidebar phase resolver (S7-A): [`web/src/lib/nav/founder-phase.ts`](../../web/src/lib/nav/founder-phase.ts) — `navPhaseFromSvi()`, `navPhaseFromGrowthPhase()`, `resolveFounderNavPhase()`, `getFounderNavContext()`; published to every founder page by [`(app)/(founder)/layout.tsx`](../../web/src/app/(app)/(founder)/layout.tsx) through `FounderNavContextProvider`

**The bridge (S7-A, G8 follow-up — previously a documented seam):** the sidebar gates on a coarse 0–5 `currentPhase`. It is now ONE number for every founder page: `resolveFounderNavPhase()` = **max** of the SVI band (`navPhaseFromSvi()`: <30 → 0, ≤50 → 1, ≤70 → 2, ≤85 → 3, ≤120 → 4, else 5 — the table that used to be `/dashboard`'s private `computePhase()`) and the declared `projects.growth_phase_current` (`navPhaseFromGrowthPhase()`, the 12-phase id bucketed onto the six steps exactly as Table 1 shows: 1–2 → validate, 3–5 → build, 6–8 → fundraise, 9–11 → grow, 12 → exit — the bucketing declared on [`workflow-steps.ts`](../../web/src/lib/nav/workflow-steps.ts) `currentPhaseToStep()`). Max means a founder never loses menu by having a lower SVI than their declared phase, or the reverse. The `(founder)` route-group layout resolves it once per request and every `WorkspaceLayout` under it reads it from context, so `/dashboard`, `/workspace/funding` and the ~130 pages that never passed `currentPhase` (and used to fall back to phase 0, hiding Build / Fundraise / Scale & Exit) now render the same groups. An explicit `currentPhase` prop still wins over the context. Table 1 is generated from the same `GROWTH_PHASE_TO_WORKFLOW_STEP` table the resolver uses, so it shows the growth-phase half of the rule; a higher SVI band only ever opens more.
