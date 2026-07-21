# Link audit — 2026-07-17

Scope: every internal `href`, `redirect()`, `router.push()/replace()` under
`web/src/**`. Dynamic hrefs (backtick templates) were spot-checked; the app
routes for `/s/[slug]`, `/insights/[slug]`, `/tools/[slug]`, `/legal/[doc]`,
`/dashboard/admin/detail/[metric]`, `/workspace/reports/[id]`,
`/admin/accelerator/[slug]`, `/admin/users/[id]`, `/verify/[id]` all resolve.

## Raw enumeration

### Static href="…"
`/`, `/about`, `/admin`, `/admin/accelerator`, `/admin/ai-keys`,
`/admin/architecture`, `/admin/growth`, `/admin/roadmap`, `/admin/users`,
`/api/*`, `/auth/login`, `/benchmarks`, `/changelog`, `/contact`,
`/dashboard`, `/dashboard/admin`, `/dashboard/admin/30day`,
`/dashboard/admin/detail/users`, `/dashboard/admin/pricing-test`,
`/dashboard/admin/stripe-sync`, `/dashboard/admin/usage`,
`/dashboard/benchmark`, `/dashboard/data-room`, `/dashboard/esop`,
`/dashboard/integrations`, `/dashboard/investor-links/new`,
`/dashboard/referral`, `/dashboard/reports/lp-quarterly`, `/dashboard/svi`,
`/demo`, `/developers`, `/founding-50`, `/index`, `/index/listings`,
`/insights`, `/investors`, `/legal/disclaimers`, `/legal/privacy`,
`/legal/terms`, `/onboarding`, `/pricing`, `/privacy`, `/roadmap`, `/score`,
`/security-audit`, `/settings`, `/signup`, `/status`, `/terms`, `/tools`,
`/tools/equity-split`, `/tools/funding-plan`, `/tools/idea-valuation`,
`/tools/term-sheet`, `/workspace/*` (24 paths).

### redirect("…")
`/admin`, `/admin/accelerator`, `/auth/login`, `/dashboard`,
`/dashboard/onboarding`, `/dashboard/svi`, `/login`, `/workspace/cap-table`.

### router.push/replace("…")
`/account/billing`, `/admin/accelerator`, `/dashboard`, `/score`,
`/workspace/cap-table`, `/workspace/evidence`.

## Classification

| path | exists | callers | fix |
|------|--------|---------|-----|
| /dashboard/investor-links/new | NO | dashboard/investor-links/page.tsx | STUB created |
| /dashboard/referral | NO | components/nps/nps-widget.tsx | RETARGET → /workspace/referrals |
| /dashboard/reports/lp-quarterly | NO | workspace/accelerator/page.tsx | STUB created |
| /settings | NO | workspace/accelerator/cohort/page.tsx, workspace/advisor/roster/page.tsx | RETARGET → /workspace/notifications |
| /workspace/accelerator/cohort/add | NO | workspace/accelerator/cohort/page.tsx | STUB created |
| /workspace/advisor/roster/invite | NO | workspace/advisor/roster/page.tsx | STUB created |
| /workspace/investor/portfolio | NO | workspace/investor/page.tsx | STUB created |
| /workspace/investor/preferences | NO | workspace/investor/dealflow/page.tsx, workspace/investor/digest/page.tsx | STUB created |
| /account/billing | NO | components/legal/auto-renew-notice.tsx | RETARGET → /workspace/billing |
| /login | (n/a — substring in HTML analyser, not a hyperlink) | lib/rnd-input.ts | IGNORED (false positive) |

Everything else in the enumeration resolves either to a static `page.tsx`
under `web/src/app/`, or to an existing dynamic route (`[doc]`, `[metric]`,
`[slug]`, `[id]`). Dashboard/workspace paths gated on auth are fine — they
redirect to `/auth/login?next=…` when unauthed.

### Nav v2 walk-through
`web/src/components/landing/nav-v2.tsx` entries all resolve. Compare items
already point at `/pricing?compare=<vendor>` (single route, query param) — no
`/vs/[competitor]` route required.

### Sitemap
`/security-audit`, `/roadmap`, `/changelog`, `/status`, `/founding-50`,
`/legal/{terms,privacy,disclaimers}` already listed. Added `/svi` and `/demo`
(both existed as pages but were missing from the sitemap).

## Verifications
- `web && npx tsc --noEmit` → clean.
- `bash web/scripts/verify-equity-gate.sh` → OK.

## Broken-link count fixed
9 unique dead paths fixed (of ~80 unique internal targets scanned).
