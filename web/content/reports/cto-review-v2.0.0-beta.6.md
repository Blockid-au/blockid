# CTO Technical Review — v2.0.0-beta.6

Date: 2026-07-17
Author: CTO agent
Release under review: v2.0.0-beta.6 (git sha `8816cef`)
Release id: `phase8-public-surfaces-rpc-csp`
Prior context: beta.4 (Phase 3 CRO stack + Phase 4 Legal/QA infra), beta.5 (Phase 6 audit sweep — H1 through H5 sec/correctness), beta.6 (Phase 8 public surfaces + deferred audit fixes)

The review is a single input to the v2.1 milestone plan. It answers three questions: what actually landed, where the code has drifted from its own stated contract, and which top-5 fixes are worth taking on in the first week of v2.1. The observations section at the end folds in what went well (or badly) about the parallel-agent execution model used to ship beta.4 through beta.6 in a single day.

---

## 1. Ship summary — what landed today across Phase 3 through Phase 8

- **Phase 3 CRO stack (beta.4)**: `lib/conversion/{triggers,experiments,lifecycle}` + `config/experiments.json` (4 launch A/Bs), `<UpgradeModal>` / `<UpgradeBanner>` / `useUpgradePrompt` with 1-per-session cap and 24h per-trigger cool-down, `api/conversion/track` (202 impression recorder) and `api/experiments/expose` (variant resolver). Session cap counts prior `shown` rows with `countsAgainstSessionCap=true` only — soft banners cannot burn hard-gate slots (H2 correctness fix rolled forward from beta.5).
- **Phase 3 lifecycle mailer (beta.4)**: 7 templates (day0/day3/day5/day6/day7/day14/winback) with a day-5 subject A/B (curiosity / benefit / personalised) driven by `api/cron/lifecycle-mailer` every 15 minutes; idempotent `seed-stripe-coupons.ts` for COMEBACK30 and DOWNGRADE_STARTER50. Templates live in `web/src/emails/lifecycle/` and are rendered by `renderLifecycleEmail()` before hitting `sendEmail()`.
- **Phase 3 save-offer + churn attribution (beta.4)**: `<ExitSurvey>`, `<DowngradeOffer>` and the `api/stripe/cancel` save-offer paths (coupon / pause / book_call) with `churn_events` writes; `api/cron/weekly-retention` Mon 09:15 UTC snapshots per segment. On Stripe throw the endpoint sets `applied=false` and records `audit_warn: "churn_row_write_failed"` for CFO reconciliation (H3 correctness in beta.5).
- **Phase 3 role workspaces (beta.4)**: Investor `dealflow` filterable table + `watchlist` + `digest` timeline (T-0419), Advisor `roster` + `notes` engagement timeline (T-0420), Accelerator `cohort` founder grid + `quarterly-report` 4-KPI LP summary (T-0421). CFO admin `/admin/pricing-metrics` (T-0422) — Revenue-30d-net + ARR + GST accrual + active subs + trial→paid + churn events (bogus runwayMonths and derived ARR tiles removed in beta.5).
- **Phase 4 legal (beta.4)**: migration `0080_disclaimer_registry_seed.sql` (10 canonical disclaimers × AU/GLOBAL, sha256 body-hash chained; switched to `ON CONFLICT DO NOTHING` in beta.5 to preserve consent-chain integrity), `lib/pdf/disclaimer-footer.ts` (PDF/DOCX stamper reading `disclaimer_registry` with `pdf-lib` as soft dep), `<withDisclaimer>` HOC, `<AutoRenewNotice>` (ACL s31), `<PrivacyBanner>` (APP cookie consent), ToS v2 + Privacy v2 MDX bodies (ACL non-excludable guarantees, APPs 1–13, NSW jurisdiction, 12-month liability cap).
- **Phase 4 QA + release gate (beta.4)**: `verify-equity-gate.sh` (grep-gate on `blockchain-sync` / tokenization callsites without `legal_review_passed`), HMAC-v1 `stripe-mock-webhook.mjs` with `--at T+Nd` clock offset, Playwright regression specs (`credits.spec.ts`, `equity-request-call.spec.ts`), k6 load (`pricing.js` p95 < 400ms at 100 VU; `checkout.js` p95 < 800ms at 20 VU), `qa-release-gate.sh` (grep + equity gates → tsc → vitest → Playwright regression → audit-chain verify).
- **Phase 6 audit sweep (beta.5)**: H1 `api/stripe/cancel` coupon-whitelist zod (`save_offer.coupon` in {COMEBACK30, DOWNGRADE_STARTER50}, `.kind`, same-origin `.href` allowlist, length caps), H2 cron fail-closed on missing `CRON_SECRET` (was fail-open — envelope-of-death for env rotation / staging clones), M1 cancel-flow `pause_30d` rejects if `pause_collection` already set (blocks the "hit endpoint every 29 days" billing-deferral), M4 `api/legal/current-versions` regex-guarded jurisdiction (`[A-Z]{2}|GLOBAL`), H5 upgrade-modal real focus trap (Tab / Shift-Tab wraps within dialog descendants), M7 `startLifecycle` preserves existing history on re-entry.
- **Phase 8 public surfaces (beta.6)**: `/roadmap` (8-stage journey: Founder Vision → Valuation → Equity → ESOP → Cap Table → Tokenization → Dividend → Exit, with in-progress chip on the current milestone and top-5 task IDs from `version.json`), `/changelog` (reads `web/CHANGELOG.md` at request time via multi-path `fs.readFileSync` fallback, inline minimal markdown renderer with no `marked` dep, sticky right-hand release jump-list), `/status` + `/api/status` (aggregator over `healthz` + tail-30 of `deploy-log.jsonl` + tail-200 of `cron-health.jsonl`; overall pill, per-service tiles, SLO tiles vs plan §13.3, last 10 deploys with GitHub commit links, cron table).
- **Phase 8 deferred-audit closures (beta.6)**: migration `0081_lifecycle_rpc.sql` — `pick_lifecycle_due()` (`FOR UPDATE SKIP LOCKED` — blocks overlapping ticks from picking the same row) and `advance_lifecycle()` (atomic history-append UPDATE — closes the M6 read-modify-write race); `lib/conversion/lifecycle.ts` refactored to call the RPCs with public API unchanged so no callsite changes. H4 sec closed by moving CSP into `web/src/proxy.ts` (Next 16 proxy convention — renamed from middleware.ts) with a per-request 128-bit nonce, `'nonce-…' 'strict-dynamic'` on `script-src`, dropping `'unsafe-inline'` and `'unsafe-eval'` on script-src; root layout reads `x-nonce` via `headers()` and threads it onto `GoogleAnalytics` `<Script>` tags. Tailwind `style-src 'unsafe-inline'` retained (documented trade-off — Tailwind's arbitrary-value JIT emits inline `<style>` blocks and moving to a nonced pipeline is a v2.2 conversation).
- **Deploy pipeline (beta.6)**: 20 additional `@react-pdf` transitive peer deps appended to the `serverExternalPackages` copy list in `web/scripts/deploy-live.sh:429-466` — `fontkit`, `restructure`, `tiny-inflate`, `abs-svg-path`, `parse-svg-path`, `normalize-svg-path`, `svg-arc-to-cubic-bezier`, `color-string`, `unicode-properties`, `unicode-trie`, `brotli`, `dfa`, `clone`, `media-engine`, `queue`, `js-md5`, plus 6 `@react-pdf/*` subpackages. Prevents Next 16 standalone tracer from under-counting the transitive graph. This is the fifth iteration of the whitelist (see Fix 2 for the structural response).

---

## 2. Architecture drift — five places where the code shape doesn't match its own comments or plan

Each finding is grounded in a specific file:line so v2.1 planners can verify without re-tracing.

### 2.1 Cron routes call Supabase inline instead of via a lib helper — cross-cutting

- **Where**: `web/src/app/api/cron/weekly-retention/route.ts:102, 121, 135, 150, 163`; `web/src/app/api/cron/growth-insights/route.ts:49, 51, 54, 57, 60, 63, 66, 69, 71, 74, 77, 79, 84, 89, 231, 280`; `web/src/app/api/cron/blockchain-sync/route.ts:23`; `web/src/app/api/cron/dunning-retry/route.ts:59, 133, 180, 189`; `web/src/app/api/cron/watchlist-digest/route.ts:88, 109, 153`; `web/src/app/api/cron/lead-nurture/route.ts:47, 68, 86`; `web/src/app/api/cron/weekly-insights/route.ts:100, 123, 152`.
- **Drift**: `lib/conversion/lifecycle.ts` is the correct model (route calls `loadDue()` / `advance()` and never touches `.from(...)` directly, and the beta.6 RPC refactor to `pick_lifecycle_due` / `advance_lifecycle` was possible precisely because the abstraction existed). The other seven cron routes reach into Supabase inline with hand-rolled `.from("app_users").select("id", { count: "exact", head: true })`-style queries. `growth-insights` alone runs 18 direct `.from()` calls. Comments in the release plan describe cron routes as thin HTTP triggers over lib helpers — that description matches lifecycle-mailer and nothing else.
- **Symptom that will bite**: when we need to swap Supabase for a warehouse-side query (BigQuery mirror is already provisioned per `lib/analytics/server.ts`), or when a cron needs SKIP-LOCKED semantics like lifecycle got, we will have to touch every route individually. Retention snapshots in particular are heavy queries — the CDO agent has already asked for them to move to a materialised view; when we do that, `weekly-retention/route.ts` will need surgery in five places, and there is no compile-time hint that we caught them all.
- **Fix sketch**: extract a `lib/cron/queries/<domain>.ts` module per domain (`retention.ts`, `growth.ts`, `dunning.ts`, `lead-nurture.ts`, `watchlist.ts`, `weekly-insights.ts`). Each exports typed pure functions (`countActiveUsers()`, `getChurnEventsSince(cutoff)`, `snapshotSegmentMetrics(segment, ts)`, etc.) and returns already-shaped domain objects — routes then reduce to orchestration + `NextResponse.json`. Add an ESLint rule (`no-restricted-syntax` targeting `CallExpression[callee.property.name="from"]` inside `app/api/cron/**`) to prevent regressions. Blast radius is contained; the RPC refactor for lifecycle in beta.6 (0081) proves the pattern works and is testable.

### 2.2 `web/src/lib/email.ts` is a 2156-line monolith mixing wrapper, provider fallback, template rendering, PDF attachment, and locale strings

- **Where**: `web/src/lib/email.ts` (2156 lines total). SMTP wrapper + Resend fallback in lines 1–150; per-template functions `sendScoreReady` (188), `sendMagicLink` (227), `sendScoreViewed` (280), `sendSVIWelcome` (321), `sendSVIWeeklyReport` (372), `sendSVIReport` (461), `sendWelcomeWithReport` (569), plus more past the truncation window. Sibling files `email-enhanced.ts` (295 lines) and `email-preferences.ts` (294 lines) already exist but are not the destination for the templates.
- **Drift**: the header comment describes the file as a "wrapper" (line 1: "BlockID email wrapper (server-only)"); the file is actually the entire outbound email system. Inline HTML is duplicated across 8+ templates — identical `shell()`, identical `unsubFooter()`, identical dark-navy table skeleton with `#3B7DD8` / `#0B1220` / `#1F2A44`, identical `escapeHtml` invocations, identical `siteUrl()` computation, identical unsubscribe / preferences URL fetch, identical `renderToBuffer(SVIReportPDF(...))` PDF-attachment try/catch pattern. Vi-locale strings are inlined per template (`isVi ? "..." : "..."` sprinkled through every function body), so adding a third locale would require touching every function.
- **Symptom that will bite**: on the current file, changing the button hex requires 8 edits. Adding a new required field to the `SendResult` union will trigger 8 typescript errors and requires 8 similar patches. A brand refresh on the email surface would be a full-file rewrite. And when Fix 1 (bounce classification) lands and wraps `sendEmail`, we want every template to route through that wrapper; today they all do (good), but the concentration of concerns in one file means any refactor is high-risk.
- **Fix sketch**: keep `sendEmail(...)` in `email.ts` (this is the actual wrapper — SMTP transporter, Resend fallback, `SendResult` union), move each template into `web/src/lib/email/templates/<template>.tsx` returning `{ subject, html, unsubscribeUrl, attachments? }`, promote `shell()` and `unsubFooter()` to `email/layout.ts`, and pull locale bodies out to `email/i18n/<locale>.ts`. The template functions become thin adapters that pick strings from the i18n bundle and render the shared layout. This is a mechanical refactor: no runtime change, just a layout that lets a template land in ~60 lines instead of 250 and lets the CHRO / CMO agent add a locale without touching mail plumbing. Split can be incremental — move one template per PR to keep review bandwidth small.

### 2.3 Disclaimer registry has two sources of truth: `versions.ts` (hard-coded literals) and `disclaimer_registry` (DB)

- **Where**: `web/src/lib/legal/versions.ts:24-32` hard-codes seven `DisclaimerKind` → version-string pairs (`tos: "v2.0-2026-07-16"`, `privacy: "v2.0-2026-07-16"`, `general_advice_warning: "v1.0-2026-07-16"`, etc.); the same versions are re-hydrated via `api/legal/current-versions` off `disclaimer_registry` at `web/src/app/api/legal/current-versions/route.ts:73`; migration `0080_disclaimer_registry_seed.sql` seeds the DB rows with sha256 body hashes; `lib/pdf/disclaimer-footer.ts:38` reads from the DB. Downstream consumers of the hard-coded literal include `components/legal/advice-warning-modal.tsx:19,93,189`, `components/legal/privacy-banner.tsx:15,62`, `components/onboarding/step-trial.tsx:7,103`, `api/legal/wholesale-verify/route.ts:18,121,125`, `api/legal/ack/route.ts:24-25,87,91`, `api/equity/request/route.ts:21,153`, and `lib/legal/surfaces.ts:18,65`.
- **Drift**: `versions.ts:7` explicitly reminds the reader to "Keep in sync with the `disclaimer_registry` table (migration 0076_compliance_and_equity.sql)". This is the drift risk in one sentence — the file itself admits the two must be kept in lock-step by hand. If someone updates the DB row for `tos` without editing this file, `consent_events.disclaimer_version` will record the pinned literal while `disclaimer_registry.body_md_sha256` will hash the new body — the two rows will chain-verify against each other but neither will match what the user actually saw. The beta.5 H3 fix (moving migration `0080` to `ON CONFLICT DO NOTHING`) preserves the chain if nobody touches this literal; it does not protect against a mismatched update.
- **Symptom that will bite**: because the literal is imported into 8 components / API routes, a drift will not fail typecheck. It will silently ship. The bug will surface only when a customer complaint or a legal audit reads a `consent_events` row and cross-references the body — long after the drift.
- **Fix sketch**: See Fix 4 below. Read `disclaimer_registry` at build time and codegen `versions.generated.ts`, keep `versions.ts` as a re-export, add a runtime require-fresh guard in `instrumentation.ts` that warns / hard-fails startup if the DB state diverges from the generated file.

### 2.4 Deploy pipeline maintains an explicit 40-package `serverExternalPackages` copy list — will break again on any `@react-pdf` bump

- **Where**: `web/scripts/deploy-live.sh:429-466`. The list runs `ioredis`, `bcryptjs`, `@anthropic-ai/sdk`, `pptxgenjs`, 10 `@react-pdf/*` packages, `is-url`, `react-pdf`, `fontkit`, `restructure`, `tiny-inflate`, 4 svg-path packages, `color-string`, `unicode-properties`, `unicode-trie`, `brotli`, `dfa`, `clone`, `media-engine`, `queue`, `js-md5`, `gaxios`, `gcp-metadata`.
- **Drift**: the block's own comment (`web/scripts/deploy-live.sh:426-427`) says "Past breakage: bcryptjs missing in v7WPHLwrMWQmVu8_qHf9x deploy (2026-06-19)". This is a whitelist chase, not an architecture. Every new dependency's transitive graph is a landmine; the beta.6 commit added 20 packages after `@react-pdf` shipped a new transitive tree. The changelog explicitly documents this as "Prevents Next 16 standalone tracer from under-counting transitive deps" — which reframes as: we accept the tracer will always under-count, and we fight it by hand. This is directly at odds with the memory rule `.claude/plans/feedback_deploy_no_docker.md` ("Build from src, deploy standalone. NEVER Docker/GitLab CI/GitHub Actions") — the current approach is the standalone build plus a hand-tended patch of the standalone, not a clean standalone.
- **Symptom that already bit**: `bcryptjs` missing in build `v7WPHLwrMWQmVu8_qHf9x` on 2026-06-19 broke auth routes with `ERR_MODULE_NOT_FOUND` in production. Recovery required an emergency LKG restore + a whitelist patch. Since then the same class of issue has recurred at least twice (per commit history) — the beta.6 commit adds 20 packages after `@react-pdf` reshuffled its transitive deps.
- **Fix sketch**: See Fix 2 below. Replace the whitelist with a single symlink of `web/node_modules` into `.next/standalone/node_modules` (or a rsync of the closure of production `dependencies`).

### 2.5 `NEXT_PUBLIC_UPGRADE_V2` dual code paths are still guarded in the tree even though beta.3 through beta.6 have shipped v2 as the default

- **Where**: `web/src/app/page.tsx:43` (`const upgradeV2 = process.env.NEXT_PUBLIC_UPGRADE_V2 === "true";` gates the entire homepage), falling back to `<SVIEntrance />` on the false branch (lines 97-101); `web/src/app/workspace/investor/page.tsx:41` reads the same flag; `web/src/components/landing/hero-v2.tsx:17` documents the gate in its file header ("between them via NEXT_PUBLIC_UPGRADE_V2"); `web/src/app/globals.css:507` scopes CSS under `data-theme="lux"` "gated by NEXT_PUBLIC_UPGRADE_V2 === 'true'".
- **Drift**: commit `d31f756` (`chore(version): stamp v2.0.0-beta.3 (v2 luxury homepage ACTIVE on prod)`) and every subsequent deploy have the flag on. The legacy branches are dead weight — every extra `import` on the false path still lands in the bundle, every future refactor has to reason about a branch that isn't served, and every code review of the homepage has to decide whether a change is meant to apply to the (dead) v1 side. `page.tsx:97-101` still wraps the legacy `<SVIEntrance />` in a `<Suspense>` fallback and instructs future readers to preserve it.
- **Symptom that already bites**: the CRO / CMO agent has to keep asking which surface is live before writing tests. Two agents wrote code against `SVIEntrance` during beta.4-beta.6 work before catching that it wasn't rendered.
- **Fix sketch**: See Fix 3 below. Retire the flag, delete the guarded branches, delete the CSS scoping comment (or just the guard-gate marker), and delete or hard-delete `SVIEntrance` and any component that only rendered on the false side.

---

## 3. Top-5 tech-debt fixes for v2.1 — ranked by impact / effort

### Fix 1 (H, M-effort) — SES/SMTP permanent-bounce classification + suppression table

- **Trigger**: closes deferred `TODO(security-audit M-code-8)` at `web/src/app/api/cron/lifecycle-mailer/route.ts:96-100`. The current code leaves `next_send_at` in place on failure and lets the 15-minute cron retry the same address every tick, which is an IP-reputation risk (Gmail / SES will down-rank the sender on repeated hard bounces).
- **Rationale**: this is the last high-severity finding from the beta.5 audit sweep that has not been closed. It is not blocking beta.6 shipping today, but as trial / drip volume grows it will become a sender-reputation problem within one billing cycle. Cost of the fix is one migration + one wrapper + one classifier module.
- **Sketch**:
  - **Migration `0082_email_suppressions.sql`**: `create table email_suppressions (email citext primary key, reason text not null, added_at timestamptz not null default now(), source text, notes jsonb, unsuppressed_at timestamptz)`. Add `create index on email_suppressions using hash (email)` for hot-path lookup. Add a small helper view `active_email_suppressions` for the CFO admin (excludes rows where `unsuppressed_at is not null`).
  - **New `lib/email/suppression.ts`**: `isSuppressed(email): Promise<boolean>` (hot path, single index lookup on `email = $1 AND unsuppressed_at IS NULL`), `suppress(email, reason, source, notes?)` (idempotent upsert, no-op on duplicate primary key), `unsuppress(email, note)` (admin-only, audit-logged, sets `unsuppressed_at = now()`).
  - **Wrap `sendEmail(args)` in `lib/email.ts`** (currently at line 100) with a first-line `if (await isSuppressed(args.to)) return { ok: false, reason: "suppressed" };`. Extend the `SendResult` union at line 52 with `"suppressed"`. Every callsite (there are ~14 of them in the file) will surface the new case at typecheck time.
  - **Bounce parser `lib/email/classify.ts`**: reads SES DSN (`X-Ses-Bounce-Type: Permanent`, `bounceSubType: General|NoEmail|Suppressed|OnAccountSuppressionList`), SMTP `550`/`553`/`554` (mailbox unknown / relay denied), and Resend `permanent` bounce codes. On permanent, insert into `email_suppressions` and log `audit_events` row (`kind = "email.suppressed"`, `subject = email`, `body = classification_reason`). On soft (transient — `421`, `450`, `451`, `4xx`), do nothing — retry survives.
  - **Update `api/cron/lifecycle-mailer/route.ts:92-102`** to consult the classifier when `send.ok === false` and call `stopLifecycle(userId)` on suppression. Delete the `TODO(security-audit M-code-8)` comment when the wrapper is in place.
  - **Backfill**: one-shot `scripts/backfill-email-suppressions.mjs` that reads any historic SES SNS topic dump (if we've been archiving them) or grep-scans `audit_events` for prior `send_error` reasons that match the permanent-bounce patterns.
  - **Unit tests**: `lib/email/__tests__/classify.test.ts` — table-driven, covers SES/SMTP/Resend cases and asserts the classifier does NOT suppress on soft failures. `lib/email/__tests__/suppression.test.ts` — asserts `isSuppressed` returns false after `unsuppress`, idempotency on repeated `suppress`.
- **Blast radius**: contained. The `sendEmail` wrapper already returns a `SendResult` union, so adding a `"suppressed"` case is compile-checked at every callsite. No template changes. No client-facing UI change; the account-preferences page (`/account/unsubscribe`) can display suppression status but doesn't have to in the first pass.
- **Effort**: M (1 sprint week — schema, wrapper, classifier, backfill from `audit_events` / SES topic if available, unit tests). Depends on nothing else in v2.1.
- **Owner**: CTO (schema + wrapper) with CISO review on the classifier's DSN parsing.

**Schema pseudocode**:

```sql
-- migrations/0082_email_suppressions.sql
create extension if not exists citext;

create table if not exists email_suppressions (
  email citext primary key,
  reason text not null,
  added_at timestamptz not null default now(),
  source text,
  notes jsonb,
  unsuppressed_at timestamptz
);

create index if not exists email_suppressions_email_hash
  on email_suppressions using hash (email);

create or replace view active_email_suppressions as
  select * from email_suppressions where unsuppressed_at is null;
```

**Wrapper pseudocode**:

```ts
// lib/email.ts — top of sendEmail, before transporter fetch
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (await isSuppressed(args.to)) {
    return { ok: false, reason: "suppressed" };
  }
  // ... existing SMTP + Resend fallback ...
}
```

### Fix 2 (H, M-effort) — Replace `serverExternalPackages` whitelist with symlink of `web/node_modules` into `.next/standalone`

- **Trigger**: `web/scripts/deploy-live.sh:429-466` (see drift 2.4). Every dep bump risks breaking a route with `ERR_MODULE_NOT_FOUND` because the tracer under-counts transitive edges.
- **Rationale**: this is a design conversation, not a code-typo conversation. The Next 16 standalone tracer is doing what it can; the peer-dep graph of `@react-pdf` (fontkit → tiny-inflate → …) and `pptxgenjs` (nested SVG paths) is fundamentally not traceable from static analysis alone. Our two options are: (a) keep patching the whitelist forever and pay the recurring outage cost, or (b) accept that the whole flat `node_modules` closure is small on `/data` (a few GB, hardlinked) and ship it wholesale. The `next/` symlink pattern already established at deploy-live.sh:511-520 (comment: "Rather than piecemeal-copy each Next internal, replace the trimmed next/ folder with a symlink to source node_modules/next") is the exact same reasoning applied to `next/` — extending it to every other external package is the consistent move.
- **Sketch**:
  - After gate 6 "Prepare standalone + smoke test" (currently line 396) and before the release-freeze at line 497, add: after `mkdir -p "$STANDALONE/node_modules"`, replace the whitelist loop with a single closure copy. Two options:
    - **Option A (hardlink rsync)**: `rsync -a --link-dest="$WEB_DIR/node_modules" "$WEB_DIR/node_modules/" "$STANDALONE/node_modules/"` after a temp `npm prune --production` in a snapshot dir. Preserves closure, dev-deps excluded, uses `/data` inode-level hardlinks so disk cost is near-zero.
    - **Option B (whole-tree symlink)**: replace the standalone's trimmed `node_modules/` with a symlink to the source `node_modules/`, mirroring the existing `next/` symlink approach. Simpler but ships dev-deps to production. Acceptable given the runtime never `require`s dev-deps at start.
  - Delete the 40-package `for pkg in ...` block at lines 429-466 (retain a one-line comment pointing to the changeset that removed it, for git-blame reachability).
  - Keep the standalone integrity guard at line 484 (`server.js`, `ai-worker.mjs`, `.next/BUILD_ID`, `.next/server`, `MANIFEST_COUNT >= 20`) — these are the checks that matter and they are orthogonal to how `node_modules/` gets populated.
  - Add a size guardrail: `du -sh "$STANDALONE"` fail-if-under-N-MB (where N ~= 50MB for the trimmed pathological case) so a completely trimmed tree can't ship silently.
  - Add a smoke-import check: `scripts/verify-deploy-imports.mjs` that spawns `node -e "require('@react-pdf/renderer'); require('bcryptjs'); require('ioredis'); ..."` inside the release dir before flipping the port. Fail-close on any `ERR_MODULE_NOT_FOUND`.
- **Blast radius**: high in principle (touches deploy hot-path) but recoverable — the deploy script already has an LKG restore path (`restore_lkg_and_fail`) and `.next-backup/` for rollback. Do it on a staging deploy first; run the full smoke gate before flipping.
- **Effort**: M (2-3 days including a full deploy dry-run, size measurement, and updating the "past outage" comments at lines 424-428 and 502).
- **Owner**: CTO (with COO scheduling the staging window during off-peak).

**Deploy script pseudocode** (Option A — hardlink rsync of production closure):

```bash
# scripts/deploy-live.sh — replaces lines 424-471
# Build a production-only closure in a snapshot dir, then rsync into standalone.
SNAP="$(mktemp -d)"
cp -a "$WEB_DIR/package.json" "$WEB_DIR/package-lock.json" "$SNAP/"
ln -s "$WEB_DIR/node_modules" "$SNAP/node_modules"
( cd "$SNAP" && npm prune --production --dry-run > "$SNAP/prune.log" )
rsync -a --link-dest="$WEB_DIR/node_modules" \
    "$WEB_DIR/node_modules/" "$STANDALONE/node_modules/"
rm -rf "$SNAP"

# Verify every external package still resolves.
node scripts/verify-deploy-imports.mjs "$STANDALONE" \
  || restore_lkg_and_fail "Deploy import verification failed."

# Size guardrail — a fully trimmed tree cannot ship.
STANDALONE_MB=$(du -sm "$STANDALONE" | awk '{print $1}')
[ "$STANDALONE_MB" -ge 50 ] || restore_lkg_and_fail "Standalone < 50MB — trim regression."
```

### Fix 3 (M, S-effort) — Retire `NEXT_PUBLIC_UPGRADE_V2` dual code paths

- **Trigger**: v2 has been default for beta.3 through beta.6 (see drift 2.5). The legacy branch is unshipped and adds cognitive tax + bundle weight.
- **Rationale**: this is a hygiene fix but a valuable one because it unblocks confident refactoring of the homepage. Every day the flag stays in the tree, another agent will read `page.tsx:43` and either (a) worry about the fallback branch and skip an otherwise-safe refactor or (b) accidentally edit the legacy side.
- **Sketch**:
  - `web/src/app/page.tsx`: delete the `upgradeV2` gate and the fallback `<Suspense><SVIEntrance /></Suspense>` at lines 42-101. Keep only the v2 tree (`<NavV2>`, `<HeroSearch>`, `<HowItWorks>`, trust strip). Reduce to ~50 lines.
  - `web/src/app/workspace/investor/page.tsx:41`: delete the local `upgradeV2` variable and any conditional it feeds (grep for `upgradeV2` in the file to sweep).
  - `web/src/components/landing/hero-v2.tsx:17`: strip the file-header sentence about the gate.
  - `web/src/app/globals.css:507`: strip the comment referencing the gate; keep the `data-theme="lux"` scope (it's the actual theming mechanism now).
  - Delete `<SVIEntrance />` (`web/src/components/svi/svi-entrance.tsx`) and any component whose only reference was the false branch. Confirm via `rg -F "SVIEntrance"` after the removal; the search must return zero hits.
  - Remove `NEXT_PUBLIC_UPGRADE_V2` from `.env.example`, deploy secrets, the health-check env-audit if any, and the CFO admin's env-audit tile.
  - Grep sweep: `rg -F "UPGRADE_V2"` and `rg -F "upgradeV2"` after — both must return zero. If there are `.env.*` local files on the deploy machine referencing the flag, delete them.
- **Blast radius**: low. All exit-paths already reach v2. Only risk is a stale env in a dev / staging box that expects the false branch — the deletion converges everything to v2.
- **Effort**: S (1 day including a `grep` sweep, a Playwright regression run against `credits.spec.ts` + `equity-request-call.spec.ts`, and a deploy).
- **Owner**: CTO.

### Fix 4 (M, M-effort) — Derive `web/src/lib/legal/versions.ts` from `disclaimer_registry` at build time + runtime require-fresh guard

- **Trigger**: two-source drift (see 2.3). The literal at `versions.ts:24-32` and the DB seeded by migration `0080_disclaimer_registry_seed.sql` must be kept in lock-step by hand; the file comment at line 7 admits this.
- **Rationale**: consent-chain integrity is a legal-defensibility invariant, not just a code-hygiene concern. If the DB and the hard-coded literal disagree, a customer's `consent_events.disclaimer_version` may not match what the customer actually saw — and we have shipped legal-review documents (ToS v2 + Privacy v2 MDX bodies) whose hashes are chained through migration `0080`. This makes the drift risk category-1 for CLO / compliance.
- **Sketch**:
  - **Codegen script** `scripts/gen-disclaimer-versions.ts` — runs during `web/scripts/deploy-live.sh` Gate 5 (`npm run build`) as a pre-step. It connects to the same Supabase the runtime uses, `SELECT kind, current_version, body_md_sha256 FROM disclaimer_registry WHERE active = true`, and writes `web/src/lib/legal/versions.generated.ts` with `export const DISCLAIMER_VERSIONS: Record<DisclaimerKind, string> = { ... }` and `export const DISCLAIMER_HASHES: Record<DisclaimerKind, string> = { ... }`. Fail the build if any row has `current_version = NULL` or the row-set is missing a `DisclaimerKind` key.
  - **Thin re-export** in `web/src/lib/legal/versions.ts`: `export { DISCLAIMER_VERSIONS, DISCLAIMER_HASHES, getCurrentVersion, isKnownDisclaimerKind } from "./versions.generated";`. Keep the `DisclaimerKind` type here (source of truth for the type union — the DB seeds the values but the type contract remains code-authored) and export it.
  - **Runtime require-fresh guard** `lib/legal/versions.audit.ts` that runs on server startup (in `instrumentation.ts`), reads the DB, and warns if the generated file's contents differ from the DB (indicates the build stamped an older DB snapshot). Fail startup in production so the drift never hits users.
  - **Pre-commit hook** `scripts/check-disclaimer-surfaces.ts` — greps `DISCLAIMER_VERSIONS.<kind>` across `web/src/` and fails if any kind not present in the type union appears. Closes the "typo" hole (`DISCLAIMER_VERSIONS.privaccy` today typechecks against `Record<DisclaimerKind, string>` because the property access is `.privaccy: string | undefined`).
  - **Consent-chain hash gate**: extend `qa-release-gate.sh` to verify that `body_md_sha256` in the DB matches the sha256 of `web/content/legal/disclaimers/<kind>.mdx`. Fail the release gate if any hash drifts.
- **Blast radius**: contained by strict typing. Every downstream consumer (advice-warning-modal, privacy-banner, step-trial, wholesale-verify, ack, equity/request, surfaces) already imports `DISCLAIMER_VERSIONS.<kind>` typed, so a generated file with the same shape is a drop-in.
- **Effort**: M (2-3 days including the generator, the audit-guard, a staging deploy dry-run, and the pre-commit hook).
- **Owner**: CTO + CLO (legal signs off that the DB is the source of truth and that build-time codegen is compatible with the consent-chain invariant).

**Generator pseudocode**:

```ts
// scripts/gen-disclaimer-versions.ts
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { KNOWN_KINDS } from "../web/src/lib/legal/kinds";

const rows = await client
  .from("disclaimer_registry")
  .select("kind, current_version, body_md_sha256")
  .eq("active", true);

for (const kind of KNOWN_KINDS) {
  const row = rows.find((r) => r.kind === kind);
  if (!row || !row.current_version) {
    throw new Error(`gen: disclaimer_registry missing active row for '${kind}'`);
  }
}

writeFileSync(
  "web/src/lib/legal/versions.generated.ts",
  emitTs(rows, KNOWN_KINDS),
);
```

**Runtime require-fresh guard**:

```ts
// web/src/instrumentation.ts (excerpt)
export async function register() {
  const generated = await import("@/lib/legal/versions.generated");
  const db = await fetchActiveDisclaimerVersions();
  for (const kind of Object.keys(generated.DISCLAIMER_VERSIONS)) {
    if (db[kind] !== generated.DISCLAIMER_VERSIONS[kind]) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(`disclaimer drift on '${kind}': generated=${generated.DISCLAIMER_VERSIONS[kind]}, db=${db[kind]}`);
      }
      console.warn(`[legal.audit] drift on '${kind}' — regenerate at build time.`);
    }
  }
}
```

### Fix 5 (M, M-effort) — Rewrite `lib/analytics/events.ts` to derive from a single JSON registry

- **Trigger**: the discriminated union at `web/src/lib/analytics/events.ts:31-51` defines the 20 event schemas, `lib/analytics/server.ts` accepts arbitrary `params` (line 22-30) and forwards them, and (per the beta.4 W4 comment) the CDO's dashboards.md ingest queries reference the same event names by string. Three independent representations of the same catalog is one too many.
- **Rationale**: analytics accuracy is a product-strategy dependency, not a nice-to-have. The CRO agent already reads GA4 funnels and BigQuery cohort snapshots to plan the next A/B; when the event catalog is defined in three places, silent drift shows up as "impossible cohorts" (a row in `analytics_events` whose params don't match the union), and we lose the ability to trust any funnel metric that spans a version boundary. Also, the server-side ingest at `lib/analytics/server.ts:98-122` accepts any `params: Record<string, unknown>` — this is a data-quality hole, not a security hole, but it makes drift invisible.
- **Sketch**:
  - **Registry JSON** `web/src/lib/analytics/events.registry.json` — an array of `{ name, description, params: { <key>: { type: "string"|"number"|"boolean"|"enum", required: bool, values?: string[], description } }, consent_required, ga4_forward, source_allowlist: string[] }`.
  - **Codegen** `scripts/gen-analytics-events.ts` reads the JSON at build time and emits `web/src/lib/analytics/events.generated.ts` containing (a) the discriminated union `AnalyticsEvent`, (b) a per-event zod schema map `EVENT_SCHEMAS: Record<AnalyticsEventName, ZodType>`, and (c) `KNOWN_EVENTS: ReadonlySet<AnalyticsEventName>`.
  - **Keep** `lib/analytics/events.ts` as a thin re-export + the `trackEvent()` helper + `containsPii()`. Rewire it to import from `events.generated.ts`.
  - **Strict server-side ingest** in `lib/analytics/server.ts:98-122`: look up `EVENT_SCHEMAS[event_name]` and `.safeParse(params)`. On failure, mark the row `schema_drift = true` (new column) and skip GA4 forward. Metric this so we can measure drift at ingest.
  - **Dashboards codegen** `scripts/dump-dashboards-sql.ts` reads the registry and emits `content/reports/dashboards/<event>.sql` — kept in the repo, machine-consumed by the CDO agent. Any change to the registry regenerates the SQL, and the CDO agent's daily report grabs the fresh files.
  - **Migration `0083_analytics_events_registry.sql`**: `create table analytics_event_registry (name text primary key, params_schema jsonb not null, consent_required bool not null default false, updated_at timestamptz not null default now())`. Populate on deploy via a `scripts/sync-events-registry.mjs` post-deploy hook so the RLS-scoped BQ export can join by name. Add `alter table analytics_events add column schema_drift bool not null default false;` for the ingest-side flag.
  - **Shadow mode**: for the first sprint after the change lands, `strict()` runs but only logs — no rejections. After a week of green metrics ("0 schema_drift rows"), flip to reject-on-drift.
  - **Unit tests** `lib/analytics/__tests__/events.test.ts` — table-driven, one case per event in the registry, asserting the zod schema accepts a valid payload and rejects the obvious drift.
- **Blast radius**: high in scope, low in behaviour change — all callers are already `trackEvent<E>("name", params)` typed via the union, so a generated union of the same shape is a drop-in. Zod-strict server-side ingest is a real change; run it in shadow mode for one sprint (log-only) before enforcing.
- **Effort**: M (3-4 days including the JSON, generator, zod schema wiring, and the dashboards-dump).
- **Owner**: CTO (generator) + CDO agent (registry contents and dashboards SQL).

**Registry pseudocode**:

```json
[
  {
    "name": "sign_up",
    "description": "New account created",
    "params": {
      "segment": { "type": "enum", "values": ["founder","investor","advisor","enterprise","unknown"], "required": true },
      "method":  { "type": "enum", "values": ["google","email","wallet"], "required": true },
      "jurisdiction": { "type": "string", "required": false }
    },
    "consent_required": false,
    "ga4_forward": true
  },
  {
    "name": "subscribe",
    "description": "Paid subscription started",
    "params": {
      "plan": { "type": "enum", "values": ["free","founder_lite","founder_pro","founder_scale","investor_basic","investor_pro","investor_syndicate","advisor_basic","advisor_pro","enterprise_ops","enterprise_platform","custom"], "required": true },
      "price_aud": { "type": "number", "required": true },
      "gst_aud":   { "type": "number", "required": true },
      "interval":  { "type": "enum", "values": ["month","year"], "required": true },
      "via":       { "type": "enum", "values": ["checkout","portal"], "required": false }
    },
    "consent_required": true,
    "ga4_forward": true
  }
]
```

**Server ingest pseudocode**:

```ts
// lib/analytics/server.ts — writeSupabase (excerpt)
import { EVENT_SCHEMAS } from "./events.generated";

for (const e of batch) {
  const schema = EVENT_SCHEMAS[e.event_name as keyof typeof EVENT_SCHEMAS];
  if (!schema) {
    e.schema_drift = true;
    continue;
  }
  const parsed = schema.safeParse(e.params);
  if (!parsed.success) {
    e.schema_drift = true;
    console.warn(`[analytics.server] schema drift on ${e.event_name}:`, parsed.error.message);
  }
}
```

---

## 4. Observations for the next milestone

### 4.a Parallel-agent execution felt good on strict file-domain partitioning, brittle otherwise

Beta.4 through beta.6 shipped in a single day because we ran 3-4 agents in parallel on disjoint file domains — CRO stack in `lib/conversion/`, workspaces under `app/workspace/`, legal under `lib/legal/`, QA scripts under `scripts/`. The changelog for beta.6 explicitly calls this out: "4 agents ran in parallel on strictly disjoint file domains." The pattern works when the partition is real: no agent touched `email.ts` while another was inside `lifecycle.ts`, and typecheck was the merge oracle. It broke down twice in the day when two agents both needed to edit `next.config.ts` and `web/src/proxy.ts` for the CSP fix — we serialised those because a shared file can't be atomically partitioned. The lesson for v2.1: publish a "shared files" list at milestone kickoff and hold a single agent as the writer for each; parallel agents may `read` those files but must send patches to the writer, not commit directly. The obvious candidates for the shared-file list today are `web/next.config.ts`, `web/src/proxy.ts`, `web/CHANGELOG.md`, `web/content/reports/version.json`, `web/AGENTS.md`, `web/scripts/deploy-live.sh`, and `web/package.json`. Any edit to those files should route through a designated writer agent (typically the CTO agent for infra, COO for release notes) to preserve a single-writer invariant.

### 4.b Recurring failure modes: Next 16 breaking changes vs training + deploy tracer misses

Two failure modes recurred across the day. First, Next 16 moved `middleware.ts` to `proxy.ts` (documented in `web/AGENTS.md` — "This is NOT the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code"), and at least one agent's first pass wrote `middleware.ts`; the fix was to grep for the current filename before generating any Next-adjacent file. Similar edges lurk in `generateMetadata`, `useSearchParams` (now requires a `Suspense` boundary), and `params` prop semantics — none of these are in most model training data. Second, the deploy standalone tracer under-counted `@react-pdf` transitive deps, so a build that typechecked cleanly still 500'd on `/api/pdf/*` until the whitelist was extended (see drift 2.4). The pattern is "clean local build not equal to clean deploy" — Fix 2 is the right long-term answer, and until it lands we should keep a `scripts/verify-deploy-imports.mjs` that boots the standalone with `NODE_ENV=production` and hits every route with `--dry-run` before flipping the port. A third recurrence is worth flagging: two agents guessed at `web/CHANGELOG.md` structure and produced entries that broke the sticky-jump-list renderer on `/changelog`. Since beta.6 the renderer is more forgiving, but the tighter answer is a JSON changelog with a rendered markdown view, so agents don't hand-craft the format.

### 4.c What should be added to `web/CLAUDE.md` / `AGENTS.md` as guardrails

The current `web/AGENTS.md` is one useful sentence: "This is NOT the Next.js you know. APIs, conventions, and file structure may all differ from your training data." That is correct but under-specified. v2.1 should add:

- "Middleware is now `proxy.ts` at `web/src/proxy.ts`. Never write `middleware.ts`."
- "Server Components are the default. `use client` requires a business reason (Router hooks, form state, browser API). If you add `use client`, add a one-line justification comment above it."
- "Cron routes go under `web/src/app/api/cron/*` and use `getSupabaseAdmin()` from `@/lib/supabase`. They must return `NextResponse.json` and never touch cookies." (This is enforced by convention today, not by lint.)
- "Direct `.from('<table>').select()` calls inside a cron route are a smell — extract to `lib/cron/queries/<domain>.ts` (see Fix 2.1)."
- "Do not import from `web/src/lib/email.ts` for new email flows until the split from Fix 2 lands — add new templates under `web/src/lib/email/templates/` and register them via `sendEmail(...)`."
- "Do not hard-code disclaimer version strings — always `import { DISCLAIMER_VERSIONS } from '@/lib/legal/versions'` and rely on the codegen (Fix 4)."

Adding these keeps agents self-correcting on the shared file conventions.

### 4.c.i Milestone-scale checklist to embed in `AGENTS.md`

Beyond the per-file guardrails above, the v2.1 kickoff should embed a milestone-scale checklist so every agent knows the invariants they inherit. The current `AGENTS.md` is a single sentence; that has been enough for a one-day sprint, but the failure modes above suggest we need to scale the guardrail message with the size of the codebase. Concrete additions:

- "Migrations are numbered `0073..0081` applied as of 2026-07-17. New migrations start at `0082`. Every migration must be idempotent (`ON CONFLICT DO NOTHING` when seeding, guarded by `IF NOT EXISTS` on DDL). See beta.5 H3 for the reason."
- "All cron routes must fail-closed on missing `CRON_SECRET` (return 401). See beta.5 H2."
- "Never bypass `sendEmail` — always call the wrapper. See Fix 1 for the suppression check being added on top."
- "Every new SQL column that stores user-visible content must have a `sha256` companion column or be traceable to `disclaimer_registry` — the consent-chain invariant applies to all evidence, not just legal text."

### 4.d Test coverage gap by domain — conversion has unit tests, equity/legal/pricing/analytics do not

Verified by `find web/src -name "*.test.ts"` + `find web/src -name __tests__ -type d`. Domain-by-domain:

- Conversion: `web/src/lib/conversion/__tests__/lifecycle.test.ts` (added in beta.6, 4 vitest cases covering the RPC integration). Good.
- SVI / scoring: `web/src/lib/svi-analysis.test.ts`, `web/src/lib/scn-detect.test.ts`, `web/src/lib/score.test.ts` — three units, decent.
- Agents: `web/src/lib/agents/cro-funding-readiness.test.ts`, `cfo-projection-norms.test.ts`, `maturity-detector.test.ts`, `antler-signals.test.ts`, `cfo-valuation.test.ts` — five units. Good for the analyst agents.
- GST: `web/src/lib/__tests__/gst.test.ts`. Single unit.
- PDF: `web/src/lib/pdf/svi-report-pdf.test.ts`. Single unit.
- Report pipeline / ADK: `report-pipeline/llm-auditor.test.ts`, `adk/agents/agents.test.ts`. Two units.

Gaps that need filling before v2.1 ships:

- Legal — zero unit tests under `web/src/lib/legal/`. `gates.ts:147` (version pin), `surfaces.ts:18-65` (disclaimer surface registry), and `versions.ts:34-39` (getCurrentVersion throw path) are all currently only exercised via integration.
- Equity / entitlements — no `lib/entitlements` or `lib/equity` unit tests. `api/equity/request/route.ts:153` (disclaimer version pin) and the `verify-equity-gate.sh` grep-gate need corresponding TypeScript unit coverage so a refactor of the guard can't silently pass.
- Pricing / Stripe — no unit tests for `api/stripe/cancel` coupon whitelist (the H1 fix in beta.5) or the save-offer paths. `stripe-mock-webhook.mjs` covers integration; add unit tests for the coupon zod-strict body validation.
- Analytics — no unit tests for `lib/analytics/events.ts` `containsPii()` (which is exported as `_internal` at line 142 explicitly for tests) or `trackEvent()`. Should ship with Fix 5.

Coverage target for v2.1 is not "100%" — it is "each of the beta.5 audit fixes has a regression unit test so it can't silently regress in a refactor." That's about 12 targeted unit tests, one per audit finding, mechanical to write. Concretely:

- `api/stripe/cancel/__tests__/coupon-whitelist.test.ts` — asserts `COMEBACK30` and `DOWNGRADE_STARTER50` accepted; asserts arbitrary coupon rejected with 400; asserts length-cap on `.href` enforced; asserts same-origin `.href` allowlist.
- `api/stripe/cancel/__tests__/pause-collection.test.ts` — asserts `pause_30d` rejected when `pause_collection` already set (M1 regression guard).
- `api/cron/__tests__/fail-closed.test.ts` — table-driven across every cron route, asserts 401 when `CRON_SECRET` is absent (H2 regression guard).
- `lib/conversion/__tests__/triggers.test.ts` — asserts session-cap counting rule: soft banners (`countsAgainstSessionCap=false`) do NOT count against the hard-gate slot (H2 correctness regression).
- `lib/legal/__tests__/versions.test.ts` — asserts every kind resolves to a non-empty string; asserts `getCurrentVersion("unknown")` throws (contract test).
- `lib/legal/__tests__/gates.test.ts` — asserts unpassed disclaimer blocks the gate; asserts consented user passes.
- `lib/pdf/__tests__/disclaimer-footer.test.ts` — asserts footer text includes the current version from the registry.
- `api/legal/current-versions/__tests__/route.test.ts` — asserts jurisdiction regex `[A-Z]{2}|GLOBAL` enforced (M4 regression guard).
- `lib/entitlements/__tests__/plan-gate.test.ts` — asserts free plan blocked from `investor.dealflow`, `founder_pro` allowed.
- `lib/equity/__tests__/request.test.ts` — asserts equity-request path records `disclaimer_version` from `DISCLAIMER_VERSIONS.equity_offer_disclaimer`.
- `lib/analytics/__tests__/pii.test.ts` — asserts `containsPii()` catches email, phone, credit-card in nested params.
- `lib/analytics/__tests__/schemas.test.ts` — one case per registered event (Fix 5 dependency).

---

## 5. Concrete PRs to open in v2.1 Week 1

- **PR-2101** (S, CTO) — Retire `NEXT_PUBLIC_UPGRADE_V2` gate and delete the legacy homepage branch + `SVIEntrance`. Ships Fix 3. Blocker for cleaner v2.1 landing-page A/Bs.
- **PR-2102** (M, CTO + CISO) — Add `email_suppressions` migration + `lib/email/suppression.ts` wrapper + bounce classifier + wire into `lifecycle-mailer/route.ts`. Ships Fix 1 and closes deferred `TODO(security-audit M-code-8)`.
- **PR-2103** (M, CTO) — Swap `serverExternalPackages` whitelist for a symlink or hardlink closure of `web/node_modules` into `.next/standalone`. Ships Fix 2. Staging deploy first, then production off-peak.

Fixes 4 and 5 are Week 2 — larger scope and better handled after PR-2101 clears the flag noise from the tree and PR-2103 removes the deploy-time friction.

**Suggested Week 2 PRs**:

- **PR-2104** (M, CTO + CLO) — Ship codegen for `versions.generated.ts`, wire runtime require-fresh guard in `instrumentation.ts`, add pre-commit hook. Ships Fix 4.
- **PR-2105** (M, CTO + CDO) — Ship `events.registry.json`, generator, per-event zod schemas, shadow-mode ingest. Ships Fix 5. Enforce reject-on-drift in Week 3 after shadow metrics green.
- **PR-2106** (M, CTO) — Extract cron-route query modules to `lib/cron/queries/<domain>.ts`, add ESLint rule to prevent inline `.from()` in cron routes. Ships drift 2.1.

**Suggested Week 3 PRs** (out of scope for immediate v2.1 planning but tracked for continuity):

- **PR-2107** (M, CTO + CHRO) — Split `web/src/lib/email.ts` monolith into `email/templates/*.tsx` + `email/layout.ts` + `email/i18n/*.ts`. One template per PR is fine; drift 2.2 lists all 8 as candidates.
- **PR-2108** (S, CTO) — Regression unit tests for the beta.5 audit-fix set (12 tests enumerated in Section 4.d).

---

## Appendix — grounding references

- **Release metadata**: `web/content/reports/version.json` (v2.0.0-beta.6, sha `8816cef`, release-id `phase8-public-surfaces-rpc-csp`, dated `2026-07-17T13:10:00Z`).
- **Full ship history**: `web/CHANGELOG.md` — beta.4 through beta.6 entries; earlier releases live in git history per the beta.3 pointer.
- **Deferred TODO markers still open**: `web/src/app/api/cron/lifecycle-mailer/route.ts:96` — `TODO(security-audit M-code-8)` (see Fix 1). No other `TODO(security-audit` or `TODO(next milestone` markers currently in `web/src/`.
- **Deploy pipeline**: `web/scripts/deploy-live.sh` (788 lines). Whitelist block at 429-466. Standalone integrity guard at 484. Release freeze at 497.
- **Migrations applied to prod today**: 0073 through 0081 (per system context). Next available number: 0082 (Fix 1) and 0083 (Fix 5).
- **Runtime environment guardrail**: `web/AGENTS.md` (imported via `web/CLAUDE.md` `@AGENTS.md`).
- **Prior audit findings** (all closed): H1 stripe/cancel coupon whitelist, H2 cron fail-closed, H3 migration idempotency, M1 pause-collection replay, M4 jurisdiction regex, H2 correctness (triggers session cap), H3 correctness (churn_events applied-flag), H4 admin bogus tile, H5 focus trap, M7 lifecycle re-entry, M10 audit_warn on write failure.
- **Prior audit findings closed in this release** (deferred → done): H1 code (lifecycle double-send → 0081 RPC), M6 code (advance history race → 0081 RPC), H4 sec (CSP unsafe-inline → proxy.ts nonce).
- **Prior audit finding still deferred**: M8 code (permanent bounce classification) — planned as Fix 1.

## Appendix — verification checklist for this review

Every claim in the drift and fix sections is grounded in a specific file / line. Reproduce:

- Drift 2.1: `grep -rn "\.from(\"" web/src/app/api/cron/` — expect 40+ hits across weekly-retention, growth-insights, blockchain-sync, dunning-retry, watchlist-digest, lead-nurture, weekly-insights.
- Drift 2.2: `wc -l web/src/lib/email.ts` — expect ~2156.
- Drift 2.3: `grep -rn "DISCLAIMER_VERSIONS\|disclaimer_registry" web/src/` — expect the DB-hydrated route in `api/legal/current-versions/route.ts:73` and 8+ callsites of the hard-coded literal.
- Drift 2.4: `sed -n '429,466p' web/scripts/deploy-live.sh` — expect the 40-package whitelist.
- Drift 2.5: `grep -rn "NEXT_PUBLIC_UPGRADE_V2\|upgradeV2" web/src/` — expect four hits across page.tsx, workspace/investor/page.tsx, hero-v2.tsx, globals.css.
- Fix 1 trigger: `grep -n "TODO(security-audit M-code-8)" web/src/app/api/cron/lifecycle-mailer/route.ts` — expect one hit at line 96.
- Test coverage: `find web/src -name "*.test.ts"` — expect the 13 files listed in Section 4.d.

## Appendix — glossary of internal terms used

- **beta.N**: rolling minor version within v2.0.0-beta. Each beta.N is a same-day deploy; beta.4/beta.5/beta.6 all shipped on 2026-07-17.
- **Phase 3 / Phase 6 / Phase 8**: milestones on the 8-phase platform roadmap (Founder Vision → Valuation → Equity → ESOP → Cap Table → Tokenization → Dividend → Exit).
- **Deferred TODO markers**: comments of the form `TODO(security-audit M-code-N)` — machine-tracked deferred findings from the beta.5 audit sweep.
- **SVI**: Startup Value Index — the core scoring artifact whose evidence chain underpins the disclaimer / consent invariants.
- **Consent chain**: `consent_events.disclaimer_version` linked by hash to `disclaimer_registry.body_md_sha256`. Drift breaks legal defensibility; see drift 2.3 / Fix 4.
- **Standalone tracer**: Next 16's `output: "standalone"` mode ships only files webpack sees as imported. Fails on runtime-only requires (see drift 2.4 / Fix 2).
- **LKG**: Last-Known-Good build snapshot in `.next-backup/` — the deploy script's rollback anchor.
- **Off-peak**: 03:00-05:00 AEST — the crontab window for infra changes per the cloud-routines memory rule.
