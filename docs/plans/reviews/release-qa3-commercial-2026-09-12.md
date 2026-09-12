> **Disposition (2026-09-12 11:50 UTC):** P0-1 fixed by ops (Startup Package price `price_1UEp1JJ7OAnXQ9sVzzXrzTWO` minted, env set; credit packs 50/100 re-priced to A$35/A$60 in Stripe + env, 0 drift). P0-2/3 + P1/P2 code items → fix agent; P0-4 backups → ops agent (daily pg_dump + Drive offsite + restore test). Founder: off-box uptime monitor account, Telegram/GitLab revocations.

# QA Lane 3 — Commercial & Compliance Readiness — BlockID.au — 2026-09-12 (read-only)

Evidence: repo `/home/dovanlong/blockid.au/web`, live curl of blockid.au, Stripe live API list-only (`node --env-file=.env`), DB read via `docker exec supabase-db psql`. Prod loads `web/.env` (`scripts/deploy-live.sh:236-257`). Stripe facts: 0 subscriptions ever, 5 charges total (A$1–A$9), 22 webhook events in `stripe_webhook_events`.

## Ready-to-sell checklist

### 1. Pricing truth
- ✅ plans.csv ↔ Stripe: Starter A$29 / Growth A$69 (inclusive, active), Scout A$79 / Firm A$149 / Program A$349 (active), Pro A$299 inactive in both, equity add-on A$59/mo + A$590/yr (inclusive), Money Finder A$3 + Trust BizReport A$3 (inclusive), One-Click A$3 — all AUD, amounts match.
- ✅ Unit tests `stripe-pricing-audit`, `credit-packs`, `plans*`, `plans-v2`, `v3-skus`, `gst`, `pricing-data`: 8 files / 398 tests pass.
- ❌ **Startup Package A$149 one-off**: `STRIPE_PRICE_STARTUP_PACKAGE` (`.env:177`) = `price_1Ttznc…` = **same id as `STRIPE_PRICE_INVESTOR_ADVISOR`** (`.env:202`) → Stripe product "BlockID Advisor" A$149/**month** recurring. No "Startup Package" price exists in Stripe at all (products list). Checkout builds `mode:"payment"` (cadence once, `api/stripe/checkout/route.ts:300,407`) with a recurring price → Stripe rejects → checkout 500. `/version` claims "[Fix] STRIPE_PRICE_STARTUP_PACKAGE wired — no longer broken" (`version/page.tsx:178`) — false.
- ❌ Credit packs drift: `sync-stripe-pricing.mjs` (read-only) → 50 credits expected A$35, Stripe **A$15**; 100 credits expected A$60, Stripe **A$25**. UI shows A$35/A$60 (`credit-packs.ts`, `billing-client.tsx:714`), customer is charged A$15/A$25 and webhook grants full credits from `metadata.blockid_credits` → revenue leak + receipt ≠ displayed price.
- ⚠ `tax_behavior=unspecified` on Scout/Firm/Program, all 5 credit packs, Growth legacy, One-Click Report; account default `inferred_by_currency` (→ inclusive for AUD) so GST maths works, but not explicit. Only Starter/Growth/add-on/A$3 reports are `inclusive`.
- ⚠ `public:true` plans with no env price id: `founder_enterprise`, `investor_vc_ent` (custom → contact-sales, OK); `accelerator_*` are `interval=monthly, active=true` with `STRIPE_PRICE_ACCEL_*` unset in `.env` — DB `plans.stripe_price_id` is populated (A$500/1500/3500 mo, verified in Stripe) so DB path works; env fallback would 503 `plan_not_provisioned`. Pricing page shows "from A$500/mo → Contact sales" (consistent).
- ✅ `/pricing`, `/vi/pricing`, `/funding` live prices: A$29, A$69, A$79, A$149, A$349, A$3, A$59/mo, A$500 — all match config; "GST-inclusive" 7×/8×; "Not financial advice" present; no "coming soon"/"beta" strings. Competitor anchors "A$2,985–3,990 + GST" correctly attributed.
- ✅ FAQ JSON-LD prices (A$29/69/79/149/349/3/500) match config. Product JSON-LD Offer A$3 One-Click, SoftwareApplication A$0.
- ⚠ In-app credit-pack grid + plan prices show `A$X` with no GST-inclusive statement (`workspace/billing/billing-client.tsx:714-716,261,470`); Stripe Checkout for credits has **no `automatic_tax`** (`api/credits/route.ts:82-92`) so receipt carries no GST line.
- ⚠ Legacy `growth`/`growth_annual` (A$99/A$950) and `founding50` still in `LEGACY_PLANS`/DB (DB founding50 = 500¢ vs Stripe 300¢); `/api/lead` founding50 gated by `isFoundingPromoActive()` (ended 2026-08-31) ✅ but its `cancel_url` `/founding-50` is 404.
- ⚠ Stripe account is shared with another business (disabled webhook `book.longcare.au`, products "5/10-Session Package"); descriptor "BLOCKID.AU SERVICES" applies to all.

### 2. Checkout flows (code + live GET)
| Flow | Price id | Mode/tax | Success / cancel URL | Webhook + idempotency | Receipt | Entitlement | Verdict |
|---|---|---|---|---|---|---|---|
| Founder Starter/Growth | ✅ live, inclusive | subscription, `automatic_tax`, `tax_id_collection`, `billing_address_collection`, `payment_method_collection:"always"`, trial 7d `missing_payment_method:cancel` | `/checkout/success?plan=` (exists, auth-gated) / `/pricing` ✅ | `claimWebhookEvent` → `stripe_webhook_events` UNIQUE, dup → 200 (`webhook/route.ts:53-60`) | `sendPaymentReceipt` (`:870`) | plan on `checkout.session.completed`/`invoice.paid` | ✅ |
| Evaluator Scout/Firm/Program card-required trial | ✅ live | same as above | same | same | same | same | ✅ (tax_behavior unspecified ⚠) |
| Startup Package A$149 | ❌ wrong id (recurring) | payment | `/checkout/success` | handler exists (`:241,1286`, UNIQUE session id) | ✅ | credits+money_radar | ❌ **broken** |
| Equity add-on A$59 | ✅ inclusive | `subscriptions.update items` (`change-plan/route.ts:215,510`) | n/a | ✅ | ✅ | flag grant | ✅ |
| Credit packs | ✅ ids; 50/100 drift | payment, **no automatic_tax**, idempotencyKey ✅ | `/workspace/billing#credits` ✅ | `type:credit_purchase` | ✅ | `blockid_credits` grant | ⚠ |
| A$3 Money Finder (guest) | ✅ inclusive | payment, automatic_tax, `enforceRateLimit` | `/funding/report/[id]?s=` ✅ / `/funding?canceled=1` ✅ | ✅ | ✅ | report unlock | ✅ |
| A$3 Trust BizReport | ✅ inclusive | payment, automatic_tax, idempotencyKey | `/dashboard/reports/order` ✅ (auth) | ✅ | ✅ | ✅ | ✅ |
| A$3 One-Click (guest) | ✅ | payment, automatic_tax, rate-limited | `/one-click-report/success` 200 ✅ | ✅ | ✅ | ✅ | ✅ |
- ✅ Billing Portal `/api/stripe/portal` POST-only (GET 405), 401 unauth, `portal-gate`, `return_url=/workspace/billing`.
- ✅ Stripe webhook endpoint `https://blockid.au/api/stripe/webhook` enabled, 29 events incl. `charge.refunded`, disputes, `trial_will_end`, invoice.* .
- ⚠ Refund path: `charge.refunded` only runs reseller commission clawback (`lib/reseller/webhook-refund-integration.ts:85`); no credit/entitlement revocation → manual ops; no runbook found beyond `webhook/route.ts:365` "force-refund via dashboard".
- ⚠ `change-plan` one-off branch cancels the active subscription **before** the new Checkout session is paid (`change-plan/route.ts:256-270`) — abandoned checkout = lost sub.
- ⚠ No route-level rate limit on `/api/stripe/checkout`, `/api/stripe/portal`, `/api/credits`, `/api/reports/checkout`, `/api/stripe/change-plan`, `/api/stripe/analysis` (0 hits; `src/proxy.ts:57-82` buckets cover auth-login/register/reset, svi, uploads — not Stripe). All are auth-gated; Stripe idempotency keys limit damage.

### 3. Legal / compliance surfaces
- ✅ `/legal/terms` v2.0 (2026-07-30), `/legal/privacy` **v2.3** (2026-09-12, `/privacy` 301→), `/legal/acceptable-use` 200 — all name Auschain PTY LTD ACN 659 615 111 / ABN 79 659 615 111.
- ❌ **Two live Terms with conflicting refund terms**: legacy `/terms` (`src/app/terms/page.tsx:156-182`, "Last updated 2026-08-23", self-canonical) promises 7-day cooling-off + 14-day pro-rata annual + unused-credit refund; `/legal/terms` (`content/legal/terms-v2.mdx:63-65`) = refunds only where ACL requires. Pricing FAQ (`(marketing)/pricing/page.tsx:75-78` JSON-LD + `landing/faq-v2.tsx:22-23`) promises "7-day money-back guarantee … no questions asked". No standalone refund page (`/refund*` 404).
- ✅ Entity split: marketing footers/hero/team = PPL Food PTY LTD (no ABN); Terms/Privacy/receipt email (`email.ts:2691`)/PDF footer/DOCX = Auschain, correct digits (187 ACN + 138 ABN hits). ⚠ JSON-LD Organization has `legalName` but no `taxID`, email `admin@` (`components/seo/json-ld.tsx:31-36`).
- ✅ GST-inclusive wording on `/pricing`, `/vi/pricing`, `/one-click-report`, `pricing-matrix.tsx:219`, `guest-paid-checkout.tsx`, `ReportPaywallGate.tsx`; ❌ missing in in-app billing (`billing-client.tsx:714-716,261,470`).
- ✅ General-advice / no-AFSL: `components/legal/not-financial-advice.tsx` + `lib/legal/surfaces.ts` on 20 pages; live `/pricing` 3×, `/svi` 3×+AFSL, `/funding` AFSL; PDFs `disclaimer-footer.ts`, valuation-certificate, fundraising, svi-report/summary, DOCX. ❌ No disclaimer in `pdf/financial-projection-pdf.tsx`, `pitch-deck-pdf.tsx`, `gtm-strategy-pdf.tsx`, `score-pdf.tsx`, `founder-pack-pdf.tsx`.
- ✅ Approved data-principle sentence verbatim in `privacy-v2.mdx:98`; no "train on your data" claims.
- ⚠ Support email: MX → Google Workspace, SPF `include:_spf.google.com ~all`; outbound = Gmail SMTP as `info@blockid.au` (`.env:97-100`, Resend key empty → SPF aligned ✅). DMARC `p=none`. `support@` (11 refs), `privacy@`, `legal@`, `security@`, `ops@`, `hello@` — **no doc states these aliases route to a monitored inbox**. `/vi/terms`, `/vi/privacy` 404.
- ✅ Cookie consent: `analytics/consent-banner.tsx` in root `layout.tsx:231`, Consent Mode v2 default denied.
- ⚠ Spam Act: `sendEmail` sets `List-Unsubscribe`/One-Click when `unsubscribeUrl` given (`email.ts:145-147`); `email-drip.ts:640-654`, `email-enhanced.ts:88-106`, lifecycle, nurture-emails route carry Auschain identity + unsubscribe. ❌ `unsubFooter()` (`email.ts:225-245`) has no business name/ABN/address (~45 templates); ❌ marketing `sendNurtureFreeDay1/3/14`, `sendNurturePaidDay14/30` (`email.ts:1662-1837`) have **no unsubscribe**; ❌ `svi/email-report.ts:288`, `funding/reports.ts:276,307`, `evaluations.ts:557`, `cron/trial-end-reminder/route.ts:153`, `pitchdeck/email-report/route.ts:130`, `digest/*` lack unsubscribe and/or identity.
- ⚠ Stripe descriptor: account default "BLOCKID.AU SERVICES" (business_profile name "Auschain", `support_email` **null**); `statement_descriptor` not set in code.

### 4. Sales enablement
- ✅ `/pricing` FAQ prices (A$29/69/79/149/349/3) match config; founder + evaluator tabs render (`pricing-tab-founder|evaluator`); no fake proof anywhere (no testimonials/ratings/"trusted by N"; partner logos gated by `config/marketing-partners.json`). ⚠ dead `landing/hero.tsx:21` `TRUSTED_BY=["aws","stripe","xero",…]` not rendered — delete.
- ❌ FAQ refund promise ≠ Terms (above). ⚠ FAQ "cancel at least 24 hours before trial ends" vs Terms "before end of day 7"; FAQ says accelerators get 7-day trial, plans.csv = 14 days; Terms §3 says all paid plans 7-day.
- ✅ `/solutions/{founder,investor,advisor,accelerator,vn-sme}` + `/compare/{chatgpt,valuers}` all 200; 48 internal CTA hrefs all 200.
- ⚠ `/contact` → `/api/lead` → Supabase `leads` only (`api/lead/route.ts:95`, viewable `/admin/leads`); **no notification to anyone**; no honeypot/Turnstile; `/api/lead` not in `proxy.ts` rate buckets; `?topic=demo` ignored.
- ✅ Demo paths anonymous: `/demo`, `/showcase` (+8), `/sample`, `/sample-business-report`, `/tbr/demo` all 200 (`/tour`, `/examples` 404, unlinked).
- ❌ `/developers` + `/developers/api` live say "API keys available on the **Growth plan ($499/mo)**" (`src/app/developers/api-docs.tsx:314,336,486`) — Growth is A$69 with no `api.access`; API is on Program A$349 / Enterprise / Cohort Enterprise. Batch scoring (`api/evaluations/batch`) + LP export undocumented; webhooks documented (`/docs#webhooks`).
- ✅ `/status` live (`force-dynamic`): "Uptime 24h 99.70% · Target 99.9%" framed as target; no SLA/credit clause sold anywhere. ⚠ guardian data: 1096/1100 healthy since 2026-09-10T22:38Z = 99.64% (< 99.9% target), only ~36h history.

### 5. Ops readiness
- ❌ **DB backups not running**: `scripts/db-backup.sh` exists (pg_dump -Fc → `/data/backups`, 14d) but crontab has no `db-backup` entry (only an unrelated "backup" comment); sole file `/data/backups/db-20260720T214508Z.sql.gz` (2.9 MB, **54 days old**); `backup-health.jsonl` last 2026-07-20. No `pg_restore`/restore runbook anywhere; no off-box copy.
- ⚠ `.env` backups: 5 same-box `.env.bak-*` (latest 2026-09-12 09:55); no off-box/encrypted copy; env files gitignored ✅ (`git ls-files` → only `*.example`).
- ✅ Rollback: `deploy-live.sh --rollback` (`:297-345`) → `.next-previous` (valid symlink to `/data/releases/…`, `server.js` present) → `/data/blockid-releases` snapshot → legacy; deploy-log last 11:09 success 12/12, live pid matches.
- ✅ Monitoring on-box: `uptime-watcher.sh` (1 min) + `uptime-24x7-guardian.sh` (2 min, auto-rollback after 3 fails) → Telegram; last 11:16Z healthy. ❌ No off-box monitor (`docs/UPTIME_GUARD.md` lists UptimeRobot as TODO).
- ⚠ Error tracking: `instrumentation.ts` → `error-tracker.ts`, `SENTRY_DSN` unset → console only; app log `/tmp/blockid-production.log` truncated per deploy, no logrotate (nginx rotate 14 ✅; journald 735 MB unbounded).
- ⚠ Secrets: gitleaks whole-tree noise from `.next/cache`; `web/src` 45 findings (mostly test fixtures, untriaged) + `docs/API-REFERENCE.md` 1; `web/scripts` 0. Rotation recorded for CRON_SECRET/IP_HASH_SALT/HISTORY_INGEST_KEY (2026-09-09), `WEBHOOK_SECRET_KEY` (09-12); **none** for `STRIPE_WEBHOOK_SECRET` (unchanged vs `.env.bak-2026-09-12-webhook`) or Supabase service key; **Telegram token + GitLab PAT still not recorded as revoked** (repo public).
- ✅ Cron auth: 86 `/api/cron/*` routes, all gated (70 `CRON_SECRET` direct + 20 `isCronAuthorised`).
- ⚠ Rate limits: in-memory `checkRateLimit` on login/register/reset/magic-link ✅; none on Stripe checkout/portal/credits/change-plan, funding checkout, `/api/lead`; no nginx `limit_req`.

## Findings (ranked)

### P0 — blocks taking money / misleading
1. **Startup Package A$149 checkout cannot complete** — `web/.env:177` `STRIPE_PRICE_STARTUP_PACKAGE` = Advisor A$149/mo recurring id; no one-off price in Stripe. Fix: `node scripts/sync-stripe-pricing.mjs --fix` after adding a `founder_package` row (14900¢, one-off, inclusive) to its PLANS table, or create Price manually on a "Startup Package" product with `tax_behavior=inclusive`, set env, redeploy; add `founder_package` to `stripe-pricing-audit.ts` so drift is caught; correct `/version` line 178.
2. **Refund policy stated three different ways** (FAQ JSON-LD "7-day money-back no questions asked" / `/terms` §8 cooling-off+pro-rata / `/legal/terms` ACL-only). Misleading under ACL s18/s29(m). Fix: pick one policy, port it into `terms-v2.mdx` (bump v2.1), 301 `/terms`→`/legal/terms`, align `faq-v2.tsx:22-23` + `pricing/page.tsx:75-78`, add `/legal/refunds` anchor.
3. **`/developers` sells API access on "Growth $499/mo"** — wrong plan, wrong price, wrong currency symbol (`api-docs.tsx:314,336,486`). Fix: replace with "Program A$349/mo (inc. GST) · Enterprise" + link `/pricing?segment=evaluator`.
4. **DB backups dead since 2026-07-20, no restore runbook, local-only** — a disk loss loses all paid customers/entitlements. Fix: add `db-backup.sh` + `backup-verify.sh` to `setup-cron.sh` and crontab, `rclone`/`scp` to off-box, write `docs/runbooks/db-restore.md` and test a restore once.

### P1
5. Credit packs 50/100 charge A$15/A$25 vs displayed A$35/A$60 (Stripe drift) — fix: `sync-stripe-pricing.mjs --fix --write-env`, redeploy; then set `automatic_tax:{enabled:true}` in `api/credits/route.ts` and add "inc. GST" to `billing-client.tsx` pack grid.
6. Spam Act gaps — `unsubFooter()` lacks sender identity; `sendNurture*` + report/digest emails lack unsubscribe. Fix: append "Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW" to `unsubFooter`, route all non-transactional sends through `prepareUnsubscribe`.
7. Advice disclaimer missing on 5 PDF exports (financial-projection, pitch-deck, gtm-strategy, score, founder-pack) — import `pdf/disclaimer-footer.ts`.
8. Trial copy inconsistencies (24h cancel window; accelerator 7 vs 14 days; Terms §3) — align FAQ + Terms with plans.csv.
9. `/api/lead` (contact form) has no rate limit/honeypot and notifies nobody — add `["/api/lead","lead"]` bucket in `proxy.ts`, honeypot field, Telegram/email to support@ on `source==="contact"`.
10. No rate limit on Stripe checkout/portal/credits/change-plan/funding-checkout + no nginx `limit_req` — add `checkRateLimit(\`checkout:${userId}\`,10,15m)` and an `/api/` zone.
11. Secrets: Telegram token + GitLab PAT unrevoked; no rotation log for `STRIPE_WEBHOOK_SECRET` / Supabase service key; 45 untriaged gitleaks hits in `web/src`; `.env` has no off-box copy — revoke, add `docs/runbooks/secret-rotation-log.md`, allowlist fixtures, encrypted off-box `.env`.
12. No off-box uptime monitor — add UptimeRobot/Better Stack on `/api/health` → Telegram. Support aliases (`support@`, `privacy@`, `legal@`) have no documented routing; Stripe `support_email` null — document Google Workspace aliases and set Stripe business_profile.support_email.
13. `change-plan` cancels the live subscription before the one-off Checkout is paid (`change-plan/route.ts:256-270`) — cancel in the webhook after `checkout.session.completed` instead.

### P2
14. `tax_behavior=unspecified` on Scout/Firm/Program, credit packs, One-Click, legacy Growth — set `inclusive` on new prices (archive, don't delete). 15. `charge.refunded` does not revoke credits/entitlements; document manual refund runbook. 16. `SENTRY_DSN` unset; app log in `/tmp`, unrotated; journald unbounded. 17. Add `taxID` to Organization JSON-LD; `/vi/terms` + `/vi/privacy`; DMARC → `p=quarantine`. 18. Delete dead `landing/hero.tsx` TRUSTED_BY logos and unused `landing/pricing.tsx` (no-GST price string). 19. `/api/lead` founding50 `cancel_url` `/founding-50` 404; DB `founding50` 500¢ vs Stripe 300¢ — archive legacy plan. 20. Add pre-redirect "A$69 inc. A$6.27 GST" line to `step-payment.tsx`/upgrade modal; document batch scoring + LP export on `/developers`; `/status` wording "internal SLO"; guardian log retention < 7d. 21. Shared Stripe account with another business (longcare products/webhook) — separate accounts or at minimum per-checkout `statement_descriptor_suffix`.
