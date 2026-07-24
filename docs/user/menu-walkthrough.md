# What changed in the menu (July 2026)

We reorganised BlockID's navigation so the platform gets out of your way and lets you focus on the ONE next step in your startup journey. Nothing was removed — everything you used yesterday is still one or two clicks away.

## Three things you'll notice today

### 1. A "Demo" link at the top of every page

Wherever you are — logged in or logged out, marketing site or workspace — the top nav now has a **Demo** entry. Click it to open the live Atlassian walkthrough (`/showcase/atlassian?step=1`). It shows you what the platform does end-to-end: SVI report, data room, cap table, valuation, growth phases — all narrated with a real founder journey.

Why: new visitors kept asking "what does this actually do?" — now the answer is one click from anywhere.

### 2. A 12-phase step ladder on your dashboard

Below the existing 6-phase Journey Bar, you'll now see the **canonical 12-phase ladder** (Vision → Validate → Research → MVP → PMF → Revenue → Growth → Team → Funding-Ready → Fundraise → Scale → Exit). Your current phase pulses in blue. Completed phases are green checks (clickable — they jump to the feature that phase uses). Future phases dim to grey with a lock icon and a tooltip that says "Unlocks after phase N".

Why: your reports, analytics, and case studies all use this 12-phase model. Your dashboard now matches.

### 3. The public top nav is cleaner

The marketing shell nav (Product / For / Pricing / Demo / Compare / Docs) now sits at 6 items — down from 7 — and everything is grouped by intent. On the older doc pages (`/docs`, `/team`, `/benchmarks`), Benchmarks + Insights + Version + Changelog moved into a single **Resources** dropdown so the top row stays under 7 items.

Why: menu bars over 7 items force the eye to slow-scan. Miller's Law is real — cognitive limit is 7±2.

## Three things that DID NOT change

- **Nothing is hidden.** If a feature was accessible yesterday, it's accessible today. Later-phase features look dimmer if you're not there yet, but you can still click them — access rules haven't changed.
- **Your muscle memory works.** The sidebar groups (Overview, Build & Validate, Ownership & Equity, Fundraise, Grow & Scale, Account) are unchanged. Only the top-nav grouping and the dashboard visual moved.
- **The "Next step" tile is untouched.** The single-next-action card that tells you exactly what to do next is exactly where it was.

## Also shipped in Round 5.13 (July 2026)

- **Sidebar: progressive disclosure got quieter.** Groups more than +3 phases ahead of your current phase now collapse into a single **"Later phases (N)"** disclosure — click to expand. Every locked row shows a small lock glyph + a `Unlocks after Phase N: <phase name>` tooltip so you always know when it opens up. Nothing is hidden.
- **Sidebar order follows your role.** Founders see Overview → Build → Ownership → Fundraise → Grow. Investors, advisors, accelerators, resellers, and journalists each get their own priority order + relevant top-bar extras (e.g. the Reseller Console link surfaces automatically for resellers, Admin gear for admins). The overlay logic lives in `web/src/lib/nav/role-menu-overlay.ts`.
- **A11y hardened.** NavV2 dropdown triggers now expose `aria-haspopup="menu"` + `aria-label="<group> menu"`; the workspace `<nav>` is a labelled landmark (`aria-label="Workspace navigation"`); the Later-phases collapse is a real disclosure button with `aria-expanded`/`aria-controls`. E2E tests pin all three contracts.

## Coming next (waiting on your review)

Only one thing is still open: your call on the four IA questions below. All four are marked `blocking: false` — nothing in the code path is gated on your answer; we'll adjust once you decide.

- **Q1** — How many phase-clusters should appear as top-nav CTAs vs. collapsed under a single "My Startup" menu? (Recommendation: 5 visible.)
- **Q2** — Should "Demo" always be a top-nav link, or a floating CTA on landing pages? (Recommendation: top-nav for now.)
- **Q3** — Should the mobile step ladder show all 12 phases or just current + next 2 with a "Show all" toggle? (Recommendation: current + next 2 on mobile.)
- **Q4** — For returning founders at phase 6+, should we render a "Skip to current phase" shortcut? (Recommendation: yes — anchor at first sight of the ladder.)

Reply on the goal doc PR or send admin@blockid.au your call.

## Where the change lives (for engineers)

- Goal doc: [`docs/plans/ux-ia-startup-flow-goal.md`](../plans/ux-ia-startup-flow-goal.md)
- New component: `web/src/components/dashboard/journey-step-ladder.tsx`
- Nav edits: `web/src/components/landing/nav-v2.tsx`, `web/src/components/site/navbar.tsx`, `web/src/components/workspace/workspace-layout.tsx`
- Footer edits: `web/src/components/site/footer.tsx`, `web/src/components/marketing/marketing-footer.tsx`
- E2E: `web/tests/e2e/nav/menu-structure.spec.ts`
