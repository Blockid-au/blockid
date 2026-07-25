# Consolidated Role Taxonomy — role-based-2026-07-25 / CPO Phase 0

**Owner:** CPO consolidation agent
**Date:** 2026-07-25
**Status:** Locked (Phase 0). Downstream build phases (menu items, onboarding wiring, DB migration) inherit this table.

Single source of truth for the 6 canonical blockid.au audience roles. Every row here is enforced in code by:

- `web/src/lib/roles/role-taxonomy.ts` — `ROLE_SPECS` map (key, label, landingHref, menuGroupIds, tourSlug).
- `web/src/lib/nav/role-menu-overlay.ts` — `ROLE_OVERLAY_TABLE` (sidebarOrder, hiddenGroups, topNavExtras).
- `web/src/lib/product-tour/feature-tours.ts` — per-role `*-first-run` tour slugs.

Menu-group IDs match `NAV_GROUPS[].id` in `web/src/components/workspace/nav-groups.ts` (`home`, `validate`, `build`, `fundraise`, `scale-exit`, `roles`, `account`). This phase does **not** add new top-level `NAV_GROUPS` entries — role-specific route trees (`/reseller/*`, `/innovator/*`, `/workspace/accelerator/*`) live under the existing `roles` group's subgroups or as dedicated top-nav bridges.

## 1. Role × landing × tour × sidebar

| Role | Label | Landing href | Tour slug | Sidebar (order) |
|---|---|---|---|---|
| `founder` | Founder / Startup Member | `/dashboard` | `founder-first-run` | home → validate → build → fundraise → scale-exit → roles → account |
| `advisor` | Independent Advisor | `/dashboard/advisor` | `advisor-first-run` | home → roles → build → fundraise → account |
| `mentor` | Program Mentor | `/reseller/mentor` | `mentor-first-run` | home → roles → account (+ top-nav "Mentor · Console") |
| `accelerator` | Accelerator Program Manager | `/workspace/accelerator` | `accelerator-first-run` | home → roles → fundraise → scale-exit → account |
| `innovator` | Corporate Innovator | `/innovator` | `innovator-first-run` | home → roles → account (+ top-nav "Innovator · Console") |
| `reseller` | Reseller / Affiliate | `/reseller` | `reseller-first-run` | home → roles → account (+ top-nav "Reseller · Console") |

## 2. Role × top goals (source of truth for tour + landing copy)

| Role | Top 3 goals |
|---|---|
| `founder` | Get a quotable SVI · Ship a DD-ready data room from Day-0 templates · Land the next investor meeting |
| `advisor` | Live portfolio SVI view · 30-second engagement notes · Warm-intro clients with attribution |
| `mentor` | Spot cold/overdue mentees · Log weekly check-ins · Roll up cohort for program lead |
| `accelerator` | Onboard cohort via one intake link · Assign + read mentors · Ship quarterly LP PDF |
| `innovator` | SVI leaderboard per thesis sector · Watchlist + weekly digest · POC pipeline → board pack |
| `reseller` | Mint tier-appropriate promo codes · Grant sandbox credits inside 20k/mo cap · Monthly KPI CSV |

## 3. Role × primary feature status (aggregated from the 6 role designs)

Legend: E = exists · P = partial · M = missing.

| Role | Primary console | Status | Deepest gap (build phase target) |
|---|---|---|---|
| `founder` | `/dashboard` + `/workspace/*` | E | Investor CRM + AU-law SAFE generator + runway alerts |
| `advisor` | `/dashboard/advisor` + `/workspace/client-roster` | P | Portfolio SVI trend chart · advisory-equity tracker · advisor tour slug |
| `mentor` | `/reseller/mentor/*` | P | Goals-tab write API · cohort heat map · mentor tour slug · onboarding path |
| `accelerator` | `/workspace/accelerator/*` | P | Cohort SVI line chart · branded intake form · Demo Day mode |
| `innovator` | `/innovator/*` | **M** | Entire route tree greenfield · kanban primitive · SSO · thesis definitions |
| `reseller` | `/reseller/*` | E | Per-code redemption timeline · commission ledger · onboarding segment |

## 4. Menu groups referenced

Every `menuGroupIds` value maps to an **existing** `NAV_GROUPS[].id`:

```
home · validate · build · fundraise · scale-exit · roles · account
```

No new top-level groups are declared in this phase. Role-specific subgroups (Advisor, Mentor, Accelerator, Reseller) already exist under the `roles` group (see `nav-groups.ts:ROLES_SUBGROUPS`). Innovator does **not** yet have a subgroup under `roles` — the follow-up build phase adds `roles.innovator` alongside the existing `roles.advisor` / `roles.mentor` / `roles.accelerator` / `roles.reseller` entries.

## 5. Role × new tour slugs

| Slug | Route | Status |
|---|---|---|
| `founder-first-run` | `/dashboard` | Added |
| `advisor-first-run` | `/dashboard/advisor` | Added |
| `mentor-first-run` | `/reseller/mentor` | Added |
| `accelerator-first-run` | `/workspace/accelerator` | Added |
| `innovator-first-run` | `/innovator` | Added |
| `reseller-first-run` | `/reseller` | Added |

Existing deep-dive tours (`svi`, `dataroom`, `dashboard-nav`, `exit-readiness`) remain reachable from `/guides/features/*` and re-surface when their target route is opened.

## 6. Downstream deliverables (next phases, out of scope for Phase 0)

1. `NAV_GROUPS` — add `roles.innovator` subgroup with the 4 innovator items (`/innovator`, `/innovator/watchlist`, `/innovator/pipeline`, `/innovator/reports`).
2. Onboarding wizard — extend `step-segment.tsx` to expose the 6 roles (currently 5), routing each new signup to `ROLE_SPECS[role].landingHref`.
3. DB migration — extend `app_users.account_type` CHECK constraint with `mentor` and `innovator`.
4. Route tree — greenfield `/innovator/*` (see `docs/plans/role-based-2026-07-25/innovator.md` for full spec).
5. Feature tour anchors — ensure every `anchor` selector in the new tours exists on its target page (unit tests in Phase 1).
