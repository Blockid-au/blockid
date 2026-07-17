# BlockID.au Changelog

## v2.0.0-beta.6 — 2026-07-17 (Phase 8 public surfaces + deferred audit fixes)

**Ships /roadmap, /changelog, /status public pages and closes 3 deferred findings from the Phase 6 audit sweep. 4 agents ran in parallel on strictly disjoint file domains.**

### Public surfaces
- `/roadmap` — 8-stage platform journey (Founder Vision → Valuation → Equity → ESOP → Cap Table → Tokenization → Dividend → Exit) with "in progress" chip; current-milestone card + top-5 task IDs from `version.json`; Phase 0-4 checklist derived from the parsed `v2.0.0-beta.N` counter.
- `/changelog` — reads `web/CHANGELOG.md` via `fs.readFileSync` with multi-path fallback; inline minimal markdown renderer (no `marked` dep); sticky right-hand release jump-list.
- `/status` + `/api/status` — aggregator over `healthz` + `deploy-log.jsonl` (tail 30) + `cron-health.jsonl` (tail 200); overall pill, per-service tiles, SLO tiles vs plan §13.3 budgets, last 10 deploys with GitHub commit links, cron table.

### Deferred audit fixes closed
- **H1 code + M6 code** — migration `0081_lifecycle_rpc.sql` adds `pick_lifecycle_due()` (with `FOR UPDATE SKIP LOCKED` — blocks two overlapping cron ticks from picking the same row) + `advance_lifecycle()` (atomic UPDATE — closes the history-append race). `lib/conversion/lifecycle.ts` refactored to call the RPCs; public API unchanged. Migration applied to prod DB.
- **H4 sec** — `web/src/proxy.ts` (Next 16 proxy convention — renamed from middleware) generates a fresh 128-bit nonce per request and builds CSP with `'nonce-…' 'strict-dynamic'`; dropped `'unsafe-inline'` and `'unsafe-eval'` on `script-src`. Root layout reads `x-nonce` via `headers()` and threads it onto `GoogleAnalytics` `<Script>` tags. Tailwind `style-src 'unsafe-inline'` retained.

### Deploy pipeline
- `deploy-live.sh` — added 20 `@react-pdf` transitive peer deps to the `serverExternalPackages` copy list (`fontkit`, `restructure`, `tiny-inflate`, `abs-svg-path`, `parse-svg-path`, `normalize-svg-path`, `svg-arc-to-cubic-bezier`, `color-string`, `unicode-properties`, `unicode-trie`, `brotli`, `dfa`, `clone`, `media-engine`, `queue`, `js-md5`, plus 6 `@react-pdf/*`). Prevents Next 16 standalone tracer from under-counting transitive deps.

### Tests
- `lib/conversion/__tests__/lifecycle.test.ts` — 4 vitest cases covering the RPC integration (empty result, transition composition, done-step no-op, error surfacing).

## v2.0.0-beta.5 — 2026-07-17 (Phase 6 audit sweep)

**Applied all critical + easy medium findings from parallel security-audit (T-0442) + code-review (T-0443) agents against the Phase 3–4 milestone.**

### Security fixes
- **H1** `api/stripe/cancel` — whitelist `save_offer.coupon` (COMEBACK30 / DOWNGRADE_STARTER50), `.kind`, and `.href` (same-origin allowlist); zod-strict body with length caps. Blocks a user from replaying admin coupons on their own subscription.
- **H2** `api/cron/lifecycle-mailer` + `api/cron/weekly-retention` — fail-closed when `CRON_SECRET` env var is missing (was fail-open).
- **H3** migration `0080` — `ON CONFLICT DO NOTHING` (was `DO UPDATE`, which silently mutated `disclaimer_registry.hash` and would break consent-chain integrity on repeat runs).
- **M1** cancel-flow `pause_30d` — reject if `pause_collection` already set; prevents billing deferral by hitting the endpoint every 29 days.
- **M4** `api/legal/current-versions` — length cap + `[A-Z]{2}|GLOBAL` regex on `jurisdiction` query param.

### Correctness fixes
- **H2** `lib/conversion/triggers` — session cap counts only prior `shown` rows whose OWN trigger is `countsAgainstSessionCap=true`. Soft banners no longer burn hard-gate slots.
- **H3** `api/stripe/cancel` — track `applied` boolean inside try; `churn_events` + JSON response now reflect actual Stripe outcome (was lying with `accepted_coupon=true` when Stripe threw).
- **H4** `/admin/pricing-metrics` — drop bogus `runwayMonths` tile (was always ≈1.67 regardless of ARR); rename `MRR` → "Revenue (30d, net)"; drop derived ARR tile.
- **H5** `upgrade-modal` — real focus trap; Tab / Shift-Tab wraps within the dialog descendants.
- **M7** `startLifecycle` preserves existing history on re-entry.
- **M10** cancel-flow logs `churn_events` insert error and returns `audit_warn: "churn_row_write_failed"` for CFO reconciliation.

### Deferred (TODO markers added)
- H1 code (lifecycle-mailer double-send) → Postgres `pick_lifecycle_due` RPC with `FOR UPDATE SKIP LOCKED`.
- M6 code (`advance()` history race) → same RPC scope.
- M8 code (permanent bounce classification) → SES / SMTP status parsing lib.

## v2.0.0-beta.4 — 2026-07-17

**Phase 3 (CRO stack) + Phase 4 partial (Legal/QA infra) landed. Ready for staged rollout gated by `NEXT_PUBLIC_UPGRADE_V2`.**

### CRO stack
- T-0410 `lib/conversion/{triggers,experiments,lifecycle}` + `config/experiments.json` (4 launch A/Bs)
- T-0412 `<UpgradeModal>` + `<UpgradeBanner>` + `useUpgradePrompt` — 1-per-session cap + 24h cool-down per trigger
- T-0413 `api/conversion/track` + `api/experiments/expose` — 202 impression recorder + variant resolver
- T-0414 Lifecycle email templates day0/day3/day5/day6/day7/day14/winback (day5 subject A/B: curiosity/benefit/personalised)
- T-0415 `api/cron/lifecycle-mailer` — every 15 minutes drip send
- T-0416 `scripts/seed-stripe-coupons.ts` — idempotent COMEBACK30 + DOWNGRADE_STARTER50
- T-0417 `<ExitSurvey>` + `<DowngradeOffer>` + cancel-flow save-offer paths (coupon / pause / book_call) with `churn_events` writes
- T-0418 `api/cron/weekly-retention` per segment — Mon 09:15 UTC snapshots

### Workspaces (T-0419 to T-0421)
- Investor: `dealflow` filterable table, `watchlist` + notes, `digest` timeline
- Advisor: `roster` client table, `notes` engagement timeline
- Accelerator: `cohort` founder grid, `quarterly-report` 4-KPI LP summary

### CFO admin (T-0422)
- `/admin/pricing-metrics` — MRR (net), ARR, GST accrual, active subs, trialing, trial→paid, churn events, runway proxy

### Legal (T-0424 to T-0428)
- Migration `0080_disclaimer_registry_seed.sql` — 10 canonical disclaimers × AU/GLOBAL with sha256 body hashes
- `lib/pdf/disclaimer-footer.ts` — PDF/DOCX footer stamper (pdf-lib as soft dependency)
- `<withDisclaimer>` HOC, `<AutoRenewNotice>` (ACL s31), `<PrivacyBanner>` (APP cookie consent)
- `api/legal/current-versions` — GET newest active disclaimer per kind for jurisdiction
- ToS v2 + Privacy v2 MDX (ACL non-excludable guarantees, APPs 1-13, NSW jurisdiction, 12-month liability cap)

### QA + release gate (T-0431/T-0433/T-0436/T-0438/T-0439)
- `scripts/verify-equity-gate.sh` — grep gate blocking blockchain-sync / tokenization without `legal_review_passed`
- `scripts/stripe-mock-webhook.mjs` — HMAC v1 signed synthetic events + `--at T+Nd` clock offset
- Regression Playwright specs: `credits.spec.ts` + `equity-request-call.spec.ts`
- k6 load: `pricing.js` (100 VU, p95<400ms), `checkout.js` (20 VU, p95<800ms)
- `scripts/qa-release-gate.sh` — grep+equity gates → tsc → vitest → Playwright regression → audit-chain verify

### Fixes
- CLO daily cron regression: restored full 20-item `AU_COMPLIANCE_CHECKLIST` after cron truncated it to 10; kept the new research topics + numeric helpers (ESIC 20% offset, Privacy Act penalties, IP Australia fees, ASIC guidance)

## v2.0.0-beta.3 — 2026-07-17 (earlier)

See git log for prior release notes.
