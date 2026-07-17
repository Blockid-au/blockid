# BlockID.au Changelog

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
