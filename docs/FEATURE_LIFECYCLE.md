# BlockID.au — Feature Lifecycle Convention

> Last updated: 2026-06-18 (v2.9 introduced the chip system)

Founder asked: don't show "Coming soon" on the dashboard menu — show **Beta** so users know we're shipping continuously. After stability checks, promote to the next keyword in the startup growth lifecycle.

This file is the source of truth for that convention.

---

## Lifecycle states (in promotion order)

| State | Chip color | Shown? | Meaning |
|---|---|---|---|
| `beta` | amber | yes | Actively iterating, may break, shipped in the last ~2 weeks. **Default for any new feature.** |
| `live` | blue | yes | Running stably for 2+ weeks. No open critical issues. Still tracking error budgets. |
| `stable` | — | no chip | Battle-tested over 30+ days, no chip rendered. **Default mature state.** |

Promotion = `beta → live → stable` (where `stable` means simply remove the `lifecycle` field).
Demotion is rare but legitimate (a hotfix introduced regressions). Be honest with users — re-tagging as `beta` is a signal, not a failure.

---

## Where the chip renders

- `components/workspace/workspace-layout.tsx`: amber/blue badge to the right of every nav item with a `lifecycle` field.
- `components/workspace/metrics-dashboard.tsx`: inline chip in helper text for the connect-data-sources flow.
- `components/dashboard/activity-feed.tsx`: tactical recommendations table.

Group-level state on the sidebar still uses the colored amber pill when the group is gated by `minPhase` (e.g. founder is on Phase 1, the Fundraise group is shown dimmed with a **Beta** chip until they progress).

---

## When to promote — checklist

A feature can move from **Beta → Live** when:

1. ≥ 2 weeks have passed since first ship to production.
2. No critical (P0) bugs have been opened against the feature in the last 7 days.
3. The route is monitored by `agent-guardian` (cron-health includes it) OR has at least 1 vitest covering its core flow.
4. The QA daily report shows GREEN on the relevant gates for 5+ consecutive days.

Then bump `lifecycle: "beta"` → `lifecycle: "live"` in `workspace-layout.tsx`.

A feature can move from **Live → Stable** when:

1. ≥ 30 days running with `live` chip.
2. No P0/P1 incidents in the last 30 days.
3. Telemetry shows steady usage (i.e. not abandoned).
4. The doc set (ROADMAP / VERSION / ARCHITECTURE) treats the feature as part of the canonical product.

Then **delete** the `lifecycle` field entirely.

---

## Beta-tagged features as of v2.9 (2026-06-18)

| Feature | Path | First shipped | Eligible for `live` |
|---|---|---|---|
| Finance P&L | `/dashboard/finance` | 2026-06-16 (v2.6) | 2026-06-30 |
| Team & Salaries | `/dashboard/team` | 2026-06-16 (v2.4) | 2026-06-30 |
| Accelerator Tracker | `/dashboard/accelerator` | 2026-06-16 (v2.4) | 2026-06-30 |
| Content Pillars (admin) | `/dashboard/admin/content-pillars` | 2026-06-16 (v2.6) | 2026-06-30 |
| Stripe Sync (admin) | `/dashboard/admin/stripe-sync` | 2026-06-17 (v2.7) | 2026-07-01 |
| Pricing A/B (admin) | `/dashboard/admin/pricing-test` | 2026-06-17 (v2.8) | 2026-07-01 |

Add a recurring 2-week reminder so the promotion check actually happens. See `web/scripts/check-version-docs.sh` for the pattern.

---

## Anti-patterns

- **Don't** ship a new feature without a `lifecycle: "beta"` chip — silent rollouts erode trust.
- **Don't** leave `beta` on a feature for 60+ days — either promote or kill it. Stagnant beta = unfinished work.
- **Don't** use "Coming soon" anywhere user-visible. If a feature isn't built yet, it doesn't go in the menu. Period.
