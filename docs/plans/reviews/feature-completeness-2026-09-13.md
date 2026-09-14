# S31-B — Feature-completeness review and polish pass (2026-09-13)

Scope: `web/src/app/(app)/**`, `web/src/app/(marketing)/**`, `web/src/components/**`, plus the top-level founder routes (`/svi`, `/analyze`, `/signup`, `/pricing`, `/checkout/success`) — reviewed against the free-founder journey (signup → onboarding → first SVI analysis → dashboard → upgrade) before the trial-user wave. Third-party partner connections (QuickBooks, Xero app, SSO, Slides, Discord) were **deferred by brief**; the pass makes their UI honest, it does not build them.

Baseline: `c71a43455`. Ten `fix(polish)` commits on `worktree-agent-a089c24717db84a77`, not pushed. `tsc --noEmit` clean; eslint 0 errors on every changed file (pre-existing warnings only); guard suites green (`audit/coverage`, `projects.scope-guard`, `projects.pages-scope-guard`, `client-safe-graph`, `server-calls-client-export`, `entitlements`, `nav`, `seo`, `feature-gates.manifest` — 29 files / 491 tests); vitest over every touched directory 82 files / 1,299 tests green.

## 1. Inventory (ranked)

Severity: **P1** blocks or dead-ends a trial user · **P2** confusing · **P3** cosmetic. "Fixed" = in this pass, with the SHA in §2.

| # | Route / component | Issue | Sev | Disposition |
|---|---|---|---|---|
| 1 | `/workspace/billing` (billing-client + page) | "Available Plans" grid built from `LEGACY_PLANS`: Free, **Founding 100 A$5** (checkout 410s since 2026-09-01), **Growth A$99** (`platform_config` table does not exist live → 9900 default), Growth Annual A$950. No Starter A$29. This was the only in-app path to Stripe. | P1 | Fixed `cf828a204` |
| 2 | `/pricing` "Start trial" → `/onboarding?trial=1&plan=…` | Onboarded user is `redirect("/dashboard/svi")` — no checkout, no message. Every `requireTierForPage` / `FeatureGate` redirect funnelled here. | P1 | Fixed `cf828a204` |
| 3 | `/signup` for a signed-in user (Money Radar tile, campaign links) | Renders a fresh registration form → always "An account with this email already exists". | P1 | Fixed `cf828a204` |
| 4 | `components/ui/credit-gate.tsx` (zero-credit modal on `/svi` + workspace analyzer) | 10 credits "A$5", 25 "A$9", 50 "A$15" while `/api/credits` charges A$9 / A$20 / A$35; "Founding 100 Lifetime Deal A$5" button → 410 whose text said "Growth (A$99/mo)". | P1 | Fixed `b3d7a2e50` |
| 5 | `components/svi/svi-entrance.tsx` (`/svi` page + paywall) | Public pricing card "Founding 100 Account — A$5 lifetime, only 100 spots"; paywall option C same; navbar "Founding 100" → deleted `/founding-50`; "Sign in" carried `plan=founding50`; "Early Bird: A$0.50 · Expires July 31, 2026"; "5 bonus credits — enough for 10 analyses" (grant is 3). | P1 | Fixed `b3d7a2e50`, `7328961ab` |
| 6 | `/dashboard` first-run panel → `/analyze` | `/analyze` writes `analyses`; dashboard, its onboarding redirect and history read only `svi_analyses` → founder does what the panel says and returns to "Run your first SVI score" (or is bounced into the welcome wizard). | P1 | Fixed `5cb151a03` (read-side bridge) |
| 7 | Sidebar "New Analysis", dashboard Quick Action "Get SVI Score", `computeNextAction` | `href: "/"` — marketing homepage, out of the app shell. `/dashboard/svi` empty CTA and welcome-wizard finish → `/score` (writes `scores`, never read by the dashboard). | P1 | Fixed `5cb151a03` |
| 8 | `/onboarding` 6-step wizard | Never set `onboarding_completed` → Google / magic-link founders finished six steps and were bounced into the 3-step WelcomeWizard. "Continue without card — 14-day evaluation, read-only exports" promised a mode nothing implements (`mode=read_only_trial` read nowhere). | P1 | Fixed `5b52ec993` |
| 9 | `POST /api/onboarding/complete` | Wrote `body.role` ("founder") into `app_users.role`, the **auth** column (`user`/`admin`). One live customer row carries `role='founder'`; an admin running the wizard would demote themselves. | P1 | Fixed `5b52ec993` (+ data follow-up, §3) |
| 10 | `/workspace/advisor/notes` Add-note form | Native `<form method="post">` (form-encoded) into a `request.json()` route → every save is a raw `{"error":"invalid_json"}` page; note never stored. | P1 | Fixed `1f95297f8` |
| 11 | `/checkout/success` | Default plan id `founding50`; `getPlan()` knew only legacy ids, so a Starter/Growth buyer read "joining the BlockID plan" with no features; secondary CTA `/#svi` (anchor not on the homepage). | P1 | Fixed `7328961ab` |
| 12 | `/pricing` | Ignored `?feature=` and `?from=` — a locked founder arrived with no explanation of why. `tier-visibility.ts` even documents a "pricing?feature= landing" that did not exist. | P2 | Fixed `747552ee1` (`PricingFeatureNotice` + resolver) |
| 13 | `/workspace/sso`, `/white-label`, `/applications`, `/weekly-digest` | Hand-rolled "Coming Soon — Estimated: Q3/Q4 2026" (Q3 ends in 17 days); "Scale & Enterprise" (Scale retired 2026-09-08); "Upgrade to Enterprise" → `/workspace/billing` under a feature no plan grants; Vietnamese inline copy. | P2 | Fixed `3c2a24d1a` (`NotAvailableYet`) |
| 14 | `/workspace/listings/new`, advisor page "Opt in (coming soon)" checkbox, revenue QuickBooks "Coming Soon" button, `oauth-connector-card` "Disabled - awaiting configuration" | Dead controls / engineering copy. | P2 | Fixed `3c2a24d1a`, `764bf4461` |
| 15 | `reseller/create-startup` page + form | "$99/mo per attributed startup", "Growth ($99/mo)" (the two live-QA A$99 hits). | P2 | Fixed `7328961ab` |
| 16 | `/workspace/reports/upgrade` (orphan) | Sold "Standard Report 5 credits / $29 AUD one-time" and "Premium 10 credits / $79 AUD/month" — no such SKUs. | P2 | Fixed `7328961ab` (redirect → `/pricing?feature=report.premium`) |
| 17 | `investor-pack/generate` | "Growth or Scale plan required". | P2 | Fixed `7328961ab` |
| 18 | `entitlements/next-best-upgrade.ts` | `data_room.access` still "Upgrade to Growth +A$40" on the dashboard Recommended tile; it moved to Starter 2026-09-09. | P2 | Fixed `7328961ab` |
| 19 | `/workspace/api-keys` + `lib/api-keys.ts` | "Requires Growth plan" while `api.access` is Enterprise-only — a Growth buyer would pay and stay locked. CTA → `/workspace/billing`. | P2 | Fixed `764bf4461` |
| 20 | `branding-client`, `projects-client` (×2), funding `LockedCard`, funding page, `investor-visibility-form` | Gated CTAs → bare `/pricing` or `/workspace/billing` (no `?feature=`). | P2 | Fixed `764bf4461` (visibility-form left: 402 path, P3) |
| 21 | `/signup` footer, password sign-up landing | "No indefinite free tier" contradicts the public Free rung; password sign-up landed on `/workspace/evidence?onboarding=true` (Starter-gated, hidden from the free sidebar; param read nowhere). | P2 | Fixed `7328961ab` |
| 22 | `/dashboard/portfolio` empty CTA | → `/onboarding?step=6` (bounces onboarded users). | P2 | Fixed `7328961ab` → `/workspace/projects?new=1` |
| 23 | `/dashboard` "No reports yet", `living-svi-dashboard` "No history yet", `score/ActionPlan` "No tasks yet" | Text-only empty states on the core path. | P1/P2 | Fixed `5cb151a03`, `1f95297f8` |
| 24 | `churn/downgrade-offer.tsx`, admin `pricing-config.tsx` hints | Typed "A$14.50 instead of A$29"; admin hints presented A$99 / A$950 / A$49 as going rates. | P3 | Fixed `7328961ab` |
| 25 | `/workspace/svi-api` | Typed "A$199 / A$2,000" tiers (source: server-only `svi-api-auth.ts`), `alert()` errors, no `WorkspaceLayout`/auth redirect. Orphan (not nav-linked), separate institutional product. | P2 | **Deferred** — needs a server/client split; not on the founder path |
| 26 | `lib/email.ts` "50 Credits … A$15" (×2), Founding-100 last-call email "A$49/mo" | Email templates with retired prices. Founding template is dead post-promo; the A$15 credit line is in two nurture emails. | P2 | **Deferred** — outside the three swept trees; flag for the email owner |
| 27 | `/api/svi` | Authenticated free founder must afford 0.5 credit (402 at 0) while an anonymous visitor gets 1 free run/day — after three credits a signed-in founder is worse off than logging out. | P2 | **Deferred** — policy call (credits vs. daily floor); CreditGate is now honest about the options |
| 28 | Duplicate route pairs (`esop` / `equity-esop` / `dashboard/esop`; `exit` / `exit-strategy`; `fundraise` / `dashboard/fundraise`; `roadmap` / `roadmap-builder`; `team` / `dashboard/team`; `investor` vs `investors`; `evaluation` vs `evaluations`) | Two or three nav entries for one concept; slugs one letter apart. | P2 | **Deferred** — IA consolidation, needs a product decision + redirects |
| 29 | Orphan routes (`/dashboard/{admin,benchmark,c-level-reports,data-room,integrations,investor-links,mentor-invite,reports}`, `/workspace/{accelerator,advisor,audit-log,competitive-positioning,investor,investor-pack,pitchdeck-analyze,secondary-offer,svi-api,svi-benchmarks,term-sheet}`) | Reachable by URL only. | P3 | **Deferred** — list for the nav owner |
| 30 | ~80 `setError(err.message)` / raw API-slug sites; `alert()` in 8 clients (`journal`, `equity-esop`, `project-members`, `projects`, `investor-links`, `living-svi-dashboard`, `svi-api`) | Raw "Failed to fetch" / `snake_case` slugs shown to users; browser alerts. | P2/P3 | **Deferred** — mechanical but wide; one shared `humaniseApiError()` + sweep in a follow-up |
| 31 | `finance-client` / `revenue-client` entry forms | Server errors rendered in the success colour / neutral text, no `role="alert"`. `journal-client` swallows `ok:false`. | P2 | **Deferred** (same sweep as #30) |
| 32 | `workspace/accelerator/page.tsx:179` | Placeholder KPI values "82% / A$1.4M / 47%" shown as real ("waiting on cohort_outcomes"). | P2 | **Deferred** — needs the data source; flagged |
| 33 | `tier-visibility.ts` `monthlyDeltaAud: 70` on four Growth rows | Stale delta (Growth − Starter is 40). Not consumed by any renderer (the card uses `next-best-upgrade`). | P3 | **Deferred** — snapshot-pinned; fix with the next entitlements change |
| 34 | `nav-groups.ts` `branding` minTier `enterprise` vs page gate Growth; `white-label` minTier `scale` (retired) | Growth users cannot find Custom Branding in the sidebar; White-label is invisible to everyone. | P3 | **Deferred** — nav goldens; the White-label page now points at Branding |
| 35 | `hero-search` mic "coming soon", `evidence-wizard` / `connect-buttons` "(Coming soon)" chips when an OAuth app is not configured | Env-dependent labels. | P3 | Left — already disabled with a label; wording could become "not available yet" |

## 2. What was fixed (commit → substance)

| SHA | Commit |
|---|---|
| `b3d7a2e50` | CreditGate packs from `CREDIT_PACKS`, Starter card from `plans-v2`, Founding-100 removed; `/svi` pricing card + paywall option C → Starter; checkout 410 copy names Starter A$29 / Growth A$69. Tests: `credit-gate.test.tsx`, `svi-entrance.pricing.test.ts`, checkout `route.test.ts`. |
| `cf828a204` | `/workspace/billing` grid = public `plans-v2` ladder per segment (`billing-plans.ts`), legacy ids ranked so grandfathered `growth`/`founding50` are never offered a "Downgrade"; `?plan=` deep link starts checkout; `#plans` anchor. `signedInSignupRedirect()` — `/signup` and `/onboarding` send a signed-in / onboarded user to Billing with the plan. Tests: `billing-plans.test.ts`, `signed-in-upgrade.test.ts`. |
| `747552ee1` | `feature-requirement.ts` resolver (VISIBILITY → catalogue → ladder → plans-v2 price → card anchor) + `<PricingFeatureNotice>` rendered on `/pricing` from `?feature=&from=`. Tests: 11 + 4. |
| `5cb151a03` | `lib/analyses/dashboard-bridge.ts` — dashboard reads the owner's latest `analyses` run (rebuilt with the same `computeSVI(signals)`) when `svi_analyses` is empty; onboarding redirect counts it; every "New Analysis / Get SVI Score / Re-run" CTA → `/analyze`. Tests: bridge (6), dashboard page (+2). |
| `5b52ec993` | `save-progress` stamps `onboarding_completed` on the wizard's terminal shapes; "Continue without a card — stay on Free" is honest and completes; `/api/onboarding/complete` never writes `role`. Tests: +4, +1. |
| `3c2a24d1a` | `<NotAvailableYet>` (reason, what exists today, "Notify me" → `leads` row via `POST /api/lead`, source `feature_interest`); SSO / White-label / Applications / Weekly Digest / listing form rebuilt on it; advisor toggle and QuickBooks button made honest. Tests: component + source pins (7); revenue test updated. |
| `7328961ab` | Reseller $99 ×2, orphan report paywall → redirect, "Growth or Scale", downgrade-offer arithmetic, `next-best-upgrade` data_room → Starter, `credits-public.ts` (FREE_SIGNUP_CREDITS = 3 shared by grant and copy), Early-Bird line removed, signup footer, password sign-up → `/dashboard`, portfolio CTA, checkout success resolves v2 plans, admin hints, 5 nav goldens. |
| `1f95297f8` | Advisor notes JSON form with inline validation/errors; two empty states gain a next step. Test: `add-note-form.test.tsx`. |
| `1136ec27b` | tsc: loosened the bridge's client type (deep-instantiation error), registered `svi_paywall_starter_click`. |
| `764bf4461` | Gated CTAs carry `?feature=…&from=…`; API keys say Enterprise (matching the ladder) both in UI and `lib/api-keys.ts`; connector card copy. Tests updated (2). |

## 3. Deferred, and why

- **Third-party connections** (QuickBooks, SSO/SAML, custom domains, Slides, Discord): out of scope by brief. UI now says "not available yet" with the reason and records interest; nothing sells them.
- **Founder-only data fix**: `update public.app_users set role = 'user' where role = 'founder';` — one live row (a founding50 customer) was written by the bug in #9. Not run from this pass (code-only).
- **`/workspace/svi-api`** (#25): needs a server page wrapper (auth + `WorkspaceLayout`) and a client-safe copy of `SVI_API_TIERS`; separate product, orphan route.
- **Email templates** (#26): `lib/email.ts` and `email-drip.ts` were outside the swept trees; the "50 Credits A$15" line should read `CREDIT_PACKS` and the Founding last-call template should be deleted.
- **Raw-error / `alert()` sweep** (#30–31): ~80 sites; wants one `humaniseApiError()` helper and a scripted pass, not hand edits inside a polish commit.
- **IA duplicates and orphan routes** (#28–29): product decision on canonical pages, then redirects + nav goldens.
- **`/api/svi` free floor** (#27): pricing policy — either grant authenticated free founders the anonymous 1/day floor under `svi.run.limited`, or leave the credit gate (now honest) as the wall.
- **Accelerator placeholder KPIs** (#32): needs `cohort_outcomes`; until then the tile should be hidden — flagged for the accelerator owner.

## 4. The first ten minutes of a trial user (after this pass)

**0:00** Lands on `/` or `/svi`, types an idea, gets a free analysis. The `/svi` page now shows Free / Starter A$29 (from plans-v2) instead of a closed A$5 promo; "3 free credits on signup" matches what the account actually receives.

**1:30** Signs up (password or Google). Password sign-up lands on `/dashboard`, which opens the welcome wizard for a fresh account; Google / magic link lands on the 6-step wizard, which now marks itself complete — no second wizard. "Continue without a card — stay on Free" says what it does.

**3:00** Dashboard: "Run your first SVI score → Score my startup" goes to `/analyze`. After the run the dashboard **sees it** (analyses bridge): score, phase, one-point history, and the Recent Reports card links to `/workspace/analyses`. Sidebar "New Analysis" stays inside the app.

**5:00** Clicks Cap Table in the sidebar (Growth). `requireTierForPage` sends them to `/pricing?feature=cap_table.write&from=/workspace/cap-table`, where the new band reads *"To open Cap Table you need the cap table — it is included from the Growth plan (A$69/mo). See the Growth plan ↓"* and scrolls to the card.

**6:00** Presses "Start trial" on Growth. Being onboarded, they go to `/workspace/billing?plan=founder_growth`, which starts the Stripe checkout immediately; the grid behind it shows Free / Starter A$29 / Growth A$69 — the same numbers as `/pricing`. `/checkout/success` names Growth and lists its features; "Get Your First SVI Score" → `/analyze`.

**8:00** Runs out of credits on a second analysis. The gate offers 10 / 25 / 50 credits at A$9 / A$20 / A$35 — the prices Stripe charges — and the Starter plan, with no dead Founding-100 button.

**Remaining friction** (not fixed here): a signed-in free founder with 0 credits cannot run the daily free analysis an anonymous visitor can (#27); `/workspace/analyses` (the `analyses` list) and `/dashboard/history` (`svi_analyses`) are still two histories; Recent Reports stays empty for `/analyze` runs because the card links into `/workspace/reports/[id]` (svi_analyses ids); a Growth subscriber still cannot find Custom Branding in the sidebar (#34); error strings in the deeper workspace pages are still raw (#30).
