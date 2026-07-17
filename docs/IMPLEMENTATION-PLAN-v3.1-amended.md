# BlockID.au v2.1 — Implementation Plan v3.1 (Amendment to v3)

**Chief of Staff amendment to `docs/IMPLEMENTATION-PLAN-v3.md`**
**Date:** 2026-07-17 (late-day, post 6xC-Level review)
**Baseline:** v2.0.0-beta.6 (git sha `8816cef`, release-id `phase8-public-surfaces-rpc-csp`)
**Delta scope:** merges the 5 C-Level reviews (CTO, CFO, CDO, CISO, CRO+CMO) written today into the v3 plan; does NOT re-derive Phase A–E. Splice, don't rewrite.
**Prioritisation model:** WSJF = (business_value + time_criticality + risk_reduction) / effort_size (S=1, M=2, L=3). Scores 1–5 per column.

This is an amendment. Sections v3 §1–§10 remain the trunk; sections below either extend a trunk section or add a new one. Task IDs `T-10xx` are net-new; they do not renumber the `T-05xx..T-09xx` set already in v3.

---

## 1. What changed since v3 was written (real events, 2026-07-17)

15 concrete deltas between v3's timestamp (2026-07-17 morning) and this amendment (same-day evening):

1. **Fintech-unicorn hero landed** — v2 luxury homepage active in prod for beta.3 through beta.6; `NEXT_PUBLIC_UPGRADE_V2` gate at 100% but the false-branch (`<SVIEntrance />`) is still dead-weight in the tree.
2. **404 sweep closed 11 dead links** — public marketing surfaces reconciled against nav-v2 dropdown; 5 `Compare` dropdown entries now point at `/pricing?compare=<slug>` (still not real `/vs/[competitor]` pages — see T-1015).
3. **CSP nonce end-to-end** — `web/src/proxy.ts` emits `'nonce-…' 'strict-dynamic'` on `script-src`; legacy `next.config.ts` override removed after CISO wire-check flagged both headers were shipping (H4 close for real).
4. **DMARC `rua=mailto:admin@blockid.au` dropped** — the admin@ mailbox was routing Microsoft aggregate reports to a personal inbox; policy now `p=none` with no aggregate visibility (opens a 30-day visibility gap — see T-1011).
5. **Full node_modules symlink baked into deploy-live** — CTO Fix #2 shipped; the 40-package `serverExternalPackages` whitelist at `deploy-live.sh:429-466` is replaced with a closure symlink; no more `ERR_MODULE_NOT_FOUND` on transitive `@react-pdf` bumps.
6. **6 C-Level reviews written today** — CTO, CFO, CDO, CISO, CRO+CMO (single file). CLO review referenced by v3 §8 but no CLO-specific review artifact was produced today; folded into cross-cutting §2 below.
7. **Three live-impact bugs surfaced** — (a) all 10 CRO triggers dead (never `.request()`-called), (b) all 4 A/B experiments dead (no client callers of `/api/experiments/expose`), (c) `/pricing` and `/founding-50` missing canonical + OG image. Canonical + OG now fixed on both pages; triggers and A/Bs remain open (T-1001, T-1002).
8. **Audit chain has zero rows** — `select count(*) from audit_events` = 0. Trigger + HMAC secret installed via migration `0076`, but no writer path has produced a genesis row. Nightly `verify-audit-chain.ts` returns `chain length = 0` — false-green risk.
9. **agent-guardian cron ran red 30+ times before noticing** — cron widespread failure this morning (~08:30 UTC) took `trial-end-reminder`, `dunning-retry`, `milestone-report`, `performance-audit`, `traffic-report`, `publish-insight` down with `Internal Server Error`; fixed via node_modules symlink, but no alert path existed (T-1016).
10. **Publish-insight cron stale 26 days** — last successful run 2026-06-20 21:30; broken by a JSON parse error on truncated LLM completion; 6 canonical founder-SEO articles queued (item 7 CRO+CMO §7) but pipeline dark.
11. **PricingPage canonical + OG shipped mid-review** — CRO+CMO flag #1 closed; `/pricing?compare=<slug>` still fanning traffic to unfocused base page.
12. **Two independent `trackEvent` implementations discovered** — `web/src/lib/analytics.ts` (client, 76 typed keys) and `web/src/lib/analytics/events.ts` (server, 20 typed keys) with ZERO overlap; 27 typed-but-dark keys on client side; 3 events (`equity_wizard_started/ai_suggest/completed`) fire via a local shim bypassing the PII guard (T-1003).
13. **Deploy-manifest.json now present** — `web/.deploy-manifest.json` shipped as part of standalone integrity guard.
14. **Migration numbering settled** — 0073..0081 applied to prod; 0082 reserved (email suppressions, was CTO Fix #1 / v3 T-0501; also claimed by CFO ledger — collision resolved by renumbering CFO ledger to 0082A, see §3 T-1008).
15. **v3 written before reviews shipped** — v3's Phase A carries T-0501..T-0517 that overlap with 6 of the 17 new T-10xx tasks below; §5 lists which v3 tasks are absorbed vs which T-10xx tasks are net-new work.

---

## 2. Cross-cutting themes from the C-Level reviews

8 themes appearing in ≥2 reviews. Synthesised, not paraphrased.

**Theme 1 — Analytics catalog drift.** CTO Fix #5, CDO §1, CRO+CMO §2/§3 all triangulate on the same root: three independent catalogs (client typed union, server discriminated union, dashboards SQL by string) drift silently. Fix requires ONE registry driving codegen for all three. Every downstream conversion metric depends on this landing.

**Theme 2 — Wired-but-dead product surfaces.** CRO+CMO §2 (10/10 triggers dead), §3 (4/4 experiments dead), CDO §1b (27/76 typed events dark), CISO §2 (0 audit_events rows). The pattern: infrastructure is present, contract is defined, no producer calls the contract. v2.1 W1 must ship producers, not new consumers.

**Theme 3 — Consent chain integrity.** CTO Drift 2.3 (two-source disclaimer versions), CDO §2 (client `trackEvent` never posts to ingest so no `consent_granted` propagates), CISO §2 (zero audit rows means nightly verifier is false-green). The three converge on one architectural risk: legal-defensibility is deferred to hand-maintained parallel arrays.

**Theme 4 — Deploy-time fragility.** CTO Drift 2.4 (whitelist chase, shipped as Fix #2), CISO §3 (deployed CSP contained `'unsafe-inline'` despite proxy code being nonce-only), CRO+CMO §8 (cron widespread failure 2026-07-17 08:30 UTC). Root cause: no `verify-deploy-imports.mjs` gate between build and port-flip.

**Theme 5 — Real-money metrics that lie.** CFO §3 (Revenue-30d tile mis-labelled as MRR; annual up-fronts distort), CFO §6 (runway proxy dropped in beta.5 but no replacement), CFO §7 (no refund/chargeback tile). Board-readout accuracy is not blocked on infrastructure — it is blocked on 3 SQL views and 1 admin tile rewrite.

**Theme 6 — Missing regulatory surfaces.** CISO §4 (DMARC visibility gap post-admin-drop), CISO §7 (`security.txt` 404), CISO §9 (4 of 5 runbook slots empty), CFO §2.2 (no GST registration watcher). Each is a low-code, high-legal-defensibility win.

**Theme 7 — Mobile-first debt.** CRO+CMO §1 (60%+ of AU founder audience is mobile; unaudited), CTO nav walk (workspace pages not audited on mobile), v3 §5 mentions Lighthouse-mobile-≥85 gate but no audit of current state. Retrofitting after Phase C ships is 2–3x the cost of shipping mobile-first from Phase A.

**Theme 8 — SEO conversion loop stalled.** CRO+CMO §6 (2 flags cleared today), §7 (6 canonical articles queued but publish-insight cron dead 26 days), §9 (0 `/vs/[competitor]` pages ship despite nav promise). One cron-fix + one static route unblocks the entire organic-inbound-to-trial funnel.

---

## 3. New / re-prioritised task list T-10xx

WSJF-scored. Effort: S=1 (≤4h), M=2 (≤1d), L=3 (≤3d). Business value / time criticality / risk reduction: 1–5 each. Score = (bv + tc + rr) / effort. Sorted by score desc within severity.

| id | task | owner | effort | bv | tc | rr | wsjf | source review | file/dir target |
|----|------|-------|--------|----|----|----|------|---------------|-----------------|
| T-1001 | Wire `useUpgradePrompt().request()` into new `<FeatureGate>` + client-side trial-day-N watcher; make `feature_gate_hit` / `trial_day_5|6|7` non-dead | CRO+CTO | M | 5 | 5 | 4 | 7.0 | `cro-cmo-review-v2.0.0-beta.6.md` §2 | `web/src/components/entitlement/gate.tsx`, `web/src/hooks/useUpgradePrompt.ts`, `web/src/app/workspace/layout.tsx` |
| T-1002 | Wire `/api/experiments/expose` client calls at 3 exposure sites (pricing hero, upgrade modal, day5 email variant); 4 experiments become live | CRO+CTO | M | 5 | 5 | 3 | 6.5 | `cro-cmo-review-v2.0.0-beta.6.md` §3 | `web/src/components/landing/pricing.tsx`, `web/src/components/upsell/upgrade-modal.tsx`, `web/src/app/api/cron/lifecycle-mailer/route.ts` |
| T-1003 | Unify analytics catalog — single JSON registry drives client union + server union + dashboards SQL; kill 27 dark keys; retire equity-wizard shim | CTO+CDO | L | 5 | 4 | 5 | 4.67 | `cto-review-v2.0.0-beta.6.md` Fix #5 + `cdo-review-v2.0.0-beta.6.md` §1 | `web/src/lib/analytics/events.registry.json` (new), `web/src/lib/analytics/events.generated.ts` (new), `web/src/lib/analytics.ts`, `web/src/lib/analytics/server.ts`, `docs/analytics/dashboards.md` |
| T-1004 | SES bounce classifier + `email_suppressions` table + wrap `sendEmail()`; closes deferred M8 | CTO+CISO | M | 4 | 5 | 5 | 7.0 | `cto-review-v2.0.0-beta.6.md` Fix #1 + `ciso-review-v2.0.0-beta.6.md` §8 | `web/supabase/migrations/0082_email_suppressions.sql`, `web/src/lib/email/{suppression,classify}.ts`, `web/src/app/api/cron/lifecycle-mailer/route.ts:96-100` |
| T-1005 | Retire `NEXT_PUBLIC_UPGRADE_V2` dual-branch — delete `<SVIEntrance />`, strip page.tsx gate, sweep 4 known callsites | CTO | S | 3 | 3 | 3 | 9.0 | `cto-review-v2.0.0-beta.6.md` Fix #3 | `web/src/app/page.tsx:43,97-101`, `web/src/app/workspace/investor/page.tsx:41`, `web/src/components/landing/hero-v2.tsx:17`, `web/src/app/globals.css:507`, `web/src/components/svi/svi-entrance.tsx` |
| T-1006 | DB-backed `DISCLAIMER_VERSIONS` — build-time codegen from `disclaimer_registry` + runtime require-fresh guard in `instrumentation.ts` | CTO+CLO | M | 4 | 3 | 5 | 6.0 | `cto-review-v2.0.0-beta.6.md` Fix #4 | `scripts/gen-disclaimer-versions.ts` (new), `web/src/lib/legal/versions.generated.ts` (new), `web/src/lib/legal/versions.ts`, `web/src/instrumentation.ts` |
| T-1007 | Real MRR view `v_mrr_active` + admin/pricing-metrics tile rewrite (3 tiles: MRR, ARR, Cash-inflow); drop misleading "Revenue 30d" label | CFO+CTO | M | 5 | 4 | 3 | 6.0 | `cfo-review-v2.0.0-beta.6.md` §3 | `web/supabase/migrations/0083_v_mrr_active.sql` (new), `web/src/app/admin/pricing-metrics/page.tsx:45-71,145-151` |
| T-1008 | `cfo_ledger` singleton table (cash / burn / inflow) + real runway formula + `/admin/cfo-ledger` seed page | CFO+CTO | M | 4 | 3 | 3 | 5.0 | `cfo-review-v2.0.0-beta.6.md` §6 | `web/supabase/migrations/0082a_cfo_ledger.sql` (new — renumber from 0082 collision), `web/src/app/admin/cfo-ledger/page.tsx` (new) |
| T-1009 | 6 new analytics events wired in producer code: `svi_score_computed`, `criterion_score_updated`, `investor_pack_generated`, `share_link_view`, `entitlement_upgrade_intent`, `saved_search_hit` | CDO+CTO | M | 5 | 4 | 3 | 6.0 | `cdo-review-v2.0.0-beta.6.md` §4 | `web/src/lib/analytics/events.registry.json` (new — added by T-1003), producers in `web/src/lib/svi/*`, `web/src/lib/pdf/*`, `web/src/lib/captable/share.ts`, `web/src/components/entitlement/gate.tsx`, `web/src/app/api/cron/svi-digest/route.ts` |
| T-1010 | BQ export script `web/scripts/bq-export-events.ts` + cron `15 2 * * *`; MERGE-on-event_id idempotency; `australia-southeast1` region | CDO+CTO | M | 3 | 3 | 3 | 4.5 | `cdo-review-v2.0.0-beta.6.md` §5 | `web/scripts/bq-export-events.ts` (new), `web/scripts/crontab.production` |
| T-1011 | `dmarc-reports@blockid.au` distribution alias + re-enable DMARC `rua=` at `p=none` for 30 days; document stair-step to `p=quarantine` | CISO | S | 3 | 4 | 5 | 12.0 | `ciso-review-v2.0.0-beta.6.md` §4 + §8 | `web/scripts/dns/update-dmarc.sh`, Google Workspace admin |
| T-1012 | `security.txt` per RFC 9116 at `/.well-known/security.txt`; publish `security-audit` public page in same cut | CISO+CMO | S | 3 | 3 | 4 | 10.0 | `ciso-review-v2.0.0-beta.6.md` §7 + §8 | `web/public/.well-known/security.txt` (new), `web/public/security.txt` (new), v3 T-0510 for `/security-audit` |
| T-1013 | Wire `WholesaleGate` in front of `/workspace/equity-offer` intake CTA + call `assertLegalReviewPassed()` at intake handler | CISO+CLO+CTO | M | 4 | 4 | 5 | 6.5 | `ciso-review-v2.0.0-beta.6.md` §5 | `web/src/components/legal/wholesale-gate.tsx`, `web/src/app/workspace/equity-offer/page.tsx`, `web/src/app/api/equity/request/route.ts:200` |
| T-1014 | 4 missing security runbooks: `secret-leak.md`, `privacy-act-breach.md`, `rls-bypass.md`, `wholesale-gate-breach.md` | CISO | M | 3 | 3 | 5 | 5.5 | `ciso-review-v2.0.0-beta.6.md` §9 | `docs/runbooks/{secret-leak,privacy-act-breach,rls-bypass,wholesale-gate-breach}.md` (new) |
| T-1015 | Ship `/vs/cake` pilot compare page (bespoke content + canonical + JSON-LD `SoftwareApplication` + `FAQPage`); retarget nav dropdown to `/vs/[slug]` — 4 more compare pages queued for v2.2 | CMO+CTO | L | 4 | 4 | 3 | 3.67 | `cro-cmo-review-v2.0.0-beta.6.md` §9 (also v3 T-0509) | `web/src/app/(marketing)/vs/[competitor]/page.tsx` (v3 T-0509 dir), `web/content/marketing/vs/cake.mdx`, `web/src/components/landing/nav-v2.tsx:96-100` |
| T-1016 | Cron widespread-failure detector + auto-alert (Telegram + Slack) when >2 crons fail in a row; `cron-health.jsonl` tail scanner runs every 15 min | COO+CTO | M | 4 | 5 | 5 | 7.0 | `cro-cmo-review-v2.0.0-beta.6.md` §8 (agent-guardian ran red 30+ times) | `web/src/app/api/cron/cron-health-watchdog/route.ts` (new), `web/scripts/crontab.production` |
| T-1017 | 3 mobile-first passes on `/workspace/*`, `/pricing`, `/svi`; Lighthouse mobile ≥ 85 gate per page before v3 phase D ships | CPO+CTO | L | 4 | 4 | 3 | 3.67 | `cro-cmo-review-v2.0.0-beta.6.md` §1 (mobile is 60%+ of AU founder audience, unaudited) + v3 §5 (mobile gate mentioned but not measured) | `web/src/app/workspace/**`, `web/src/app/pricing/page.tsx`, `web/src/app/svi/page.tsx`, `web/tests/lighthouse/*.json` |
| T-1018 | Genesis audit row + writer-path smoke rows (`audit.genesis`, `deploy.verified`, `cron.audit.verified`); nightly verifier exit-code piped to `cron-health.jsonl` | CISO+CTO | S | 3 | 3 | 5 | 11.0 | `ciso-review-v2.0.0-beta.6.md` §2 | `web/scripts/verify-audit-chain.ts`, `web/scripts/deploy-live.sh`, `web/content/reports/cron-health.jsonl` |
| T-1019 | Publish-insight cron unstick + JSON parse guard + retry-with-backoff; queue 6 canonical founder-SEO articles (ESIC, cap-table, s708, ESOP tax, SAFE-vs-note, pre-revenue valuation) | CMO+CTO | M | 4 | 4 | 3 | 5.5 | `cro-cmo-review-v2.0.0-beta.6.md` §7 + §8 | `web/src/app/api/cron/publish-insight/route.ts`, `web/content/marketing/topic-queue.json` |
| T-1020 | Trial-day-3 in-app activation modal (no email dependency); persist wizard step to `onboarding_progress`; render `<CompletionBar>` in wizard shell | CRO+CPO | M | 4 | 4 | 3 | 5.5 | `cro-cmo-review-v2.0.0-beta.6.md` §5A/§5C | `web/src/app/workspace/layout.tsx`, `web/src/components/onboarding/completion-bar.tsx` (new), `web/supabase/migrations/0084_onboarding_progress.sql` (new) |
| T-1021 | Fix csv-vs-ts pricing drift: credit grants (starter/growth/scale), enterprise+VC-enterprise pricing floor, accelerator annual discount (all 3 create refund risk per CFO §1.2) | CFO+CTO | M | 4 | 4 | 4 | 6.0 | `cfo-review-v2.0.0-beta.6.md` §1.2 | `web/src/config/pricing/plans.csv`, `web/src/lib/plans-v2.ts` |
| T-1022 | GST registration watcher (rolling A$75k turnover); create `gst_config` singleton + nightly job; alarm at 80% ($60k), auto-register at 100% | CFO+CTO | M | 3 | 3 | 4 | 5.0 | `cfo-review-v2.0.0-beta.6.md` §2.2 + §8.2 | `web/supabase/migrations/0085_gst_config.sql` (new), `web/src/app/api/cron/gst-turnover-watch/route.ts` (new) |
| T-1023 | Restrict `COMEBACK30` coupon to founder_starter/growth + investor_angel via `applies_to.products`; instrument `save_offer_events` view; alarm on true-save rate < 25% | CFO+CRO | S | 3 | 3 | 4 | 10.0 | `cfo-review-v2.0.0-beta.6.md` §4.2 + §8.3 | `web/scripts/seed-stripe-coupons.ts`, `web/supabase/migrations/0086_save_offer_events.sql` (new) |
| T-1024 | RLS *policy body* audit (not just RLS-enabled); assert no `USING (true)` outside `disclaimer_registry`, no INSERT on `audit_events`/`revenue_events`/`stripe_webhook_events` from `authenticated` role, every user-scoped policy filters `auth.uid()` | CISO+CTO | M | 3 | 3 | 5 | 5.5 | `ciso-review-v2.0.0-beta.6.md` §6 + Appendix B #13 | `web/supabase/migrations/0073..0081` (audit only), `web/tests/rls/matrix.spec.ts` (new) |
| T-1025 | Recursive PII walker + `z.string().max(1024)` on any params leaf; move `containsPii` from `analytics/events.ts` to shared `analytics/pii.ts`; add `company_name`, `startup_name`, `founder_name`, `first_name`, `last_name`, `full_name` to blocklist | CDO+CISO | S | 3 | 3 | 5 | 11.0 | `cdo-review-v2.0.0-beta.6.md` §3 | `web/src/lib/analytics/pii.ts` (new), `web/src/app/api/analytics/ingest/route.ts:35-45` |

25 tasks, capped per prompt. High-severity (WSJF ≥ 6.0): T-1005 (9.0), T-1011 (12.0), T-1012 (10.0), T-1018 (11.0), T-1023 (10.0), T-1025 (11.0), T-1001 (7.0), T-1004 (7.0), T-1016 (7.0), T-1013 (6.5), T-1002 (6.5), T-1007 (6.0), T-1009 (6.0), T-1021 (6.0), T-1006 (6.0). 15 H-tasks.

---

## 4. New goal proposals (Goal 5 — beyond v3 scope)

Goal 4 in the platform roadmap is the trial→paid activation loop (see `.claude/plans/project_growth_phases.md`). Goal 5 is what v2.1 unlocks but v3 does not schedule.

### Goal 5A — Autonomous quality gate

- **Rationale line 1:** Today's 6-C-Level review process is manual; each cycle discovered live-impact bugs (dead triggers, dead A/Bs, silent crons) that v3 would have shipped without noticing.
- **Rationale line 2:** Automating a nightly review pipeline (each C-Level agent runs against `HEAD`, writes to `content/reports/<role>-nightly.md`) surfaces regressions the morning after they land, not at v3.0 code-freeze.
- **Rationale line 3:** Reuses the parallel-agent execution model from beta.4-beta.6 (per CTO review §4.a) on strictly disjoint file domains; the review agents already exist as skills.
- **Success metric:** ≥ 1 regression caught per week by the nightly review that would otherwise have shipped to prod.
- **Size:** 2 weeks (1 week to wire the review harness into `crontab.production`; 1 week to tune false-positive rate).

### Goal 5B — Investor-pack v2

- **Rationale line 1:** v3 Phase C ships a `<InvestorPackBuilder>` component (T-0715) that requires the founder to compose sections manually. A one-click "generate my investor pack from workspace state" flow removes 15 minutes of friction at the moment of highest founder intent.
- **Rationale line 2:** Combines SVI 13-criteria score (v3 T-0511), cap-table snapshot (v3 T-0606), traction chart (needs 6 new events per T-1009), and a one-page teaser (new).
- **Rationale line 3:** Directly monetisable — the pack is the artefact that justifies the Growth/Scale tier upsell, and the `investor_pack_generated` event (T-1009) makes it the first measurable conversion moment beyond `checkout_completed`.
- **Success metric:** ≥ 20% of `founder_growth`/`founder_scale` subscribers generate at least 1 pack in the first 30 days.
- **Size:** 3 weeks (rides on v3 Phase C infrastructure; delivers a `POST /api/investor-pack/one-click` endpoint + a workspace CTA).

### Goal 5C — AU-startup public index

- **Rationale line 1:** The SVI Index thesis (per `project_unicorn_goal.md` and `project_core_mission.md`) is a public discovery surface — `blockid.au/index` (searchable, Nikkei-style uncapped composite score) and `blockid.au/listings/[ticker]` (per-startup card).
- **Rationale line 2:** v3 Phase E T-0901..T-0906 sketches the opt-in path but does not commit to a public canonical URL scheme; this goal ships `/index` + `/listings/[ticker]` as first-class SEO surfaces with JSON-LD `Dataset` schema.
- **Rationale line 3:** Every listing is an inbound funnel — a founder Googles "how did competitor X score" and lands on `blockid.au/listings/x` which upsells "score yours".
- **Success metric:** ≥ 100 opted-in listings + ≥ 30 organic sessions/day to `/listings/*` within 60 days of launch.
- **Size:** 4 weeks (2 weeks route + JSON-LD + sitemap; 1 week search; 1 week per-listing card polish).

### Goal 5D — Vietnamese-Australian founder cohort

- **Rationale line 1:** Per `.claude` memory (`business_entity.md`, `reference_directory_listings.md`), the AU-VN diaspora is a stated positioning wedge but has zero Vietnamese-language surface today; v3 T-0514 ships legal MDX in VI but workspace UI remains EN-only.
- **Rationale line 2:** Zalo is the dominant Vietnamese distribution channel with no BlockID presence; a Telegram+Zalo dual-post cron would reach ~200k VN-AU professionals with near-zero CAC.
- **Rationale line 3:** Accelerator partnerships (Startmate VN cohort, VVA — Vietnamese Venture Association) are unaddressed; a cohort-specific onboarding path with VN founder ICP validates the diaspora thesis.
- **Success metric:** ≥ 20 VN-language sign-ups + 1 signed accelerator partnership within 90 days.
- **Size:** 6 weeks (2 weeks VI onboarding + workspace strings; 2 weeks Zalo integration + cron; 2 weeks accelerator BD).

---

## 5. What we drop / defer from v3

v3's Phase A T-0501..T-0505 (SES suppression list) is absorbed by T-1004 — same code, better-scoped. v3 T-0506..T-0508 (cohort staged rollout) is deferred to v3.2: with `NEXT_PUBLIC_UPGRADE_V2` at 100% and T-1005 retiring the flag, the cohort-router pattern is over-engineered for a single-code-path world. Phase B/C (cap-table + data-room) proceeds as-scoped but T-1013 (WholesaleGate wiring) is prerequisite. Phase D (Valuation V2 + Google Sheets export) proceeds as-scoped but T-1017 mobile pass is prerequisite for the Lighthouse gate to be meaningful. Phase E T-0901..T-0906 (SVI Index) is partially replaced by Goal 5C — deferred until Goal 5C lands as its own multi-week deliverable in v3.2. Vietnamese full workspace localisation, on-chain tokenization sync, dividend distribution, exit-marketplace remain deferred to v4 (unchanged from v3 §10).

---

## 6. Ordering + release cadence

Phase A of v3 (Weeks 1-2, release `v2.1.0-beta.1`) absorbs the high-severity T-10xx tasks that unblock everything downstream:
- **Week 1:** T-1005 (S, unblocks refactoring), T-1011 (S), T-1012 (S), T-1018 (S), T-1023 (S), T-1025 (S) — six S-effort quick wins. T-1004 (M, replaces v3 T-0501..T-0505), T-1001 (M), T-1002 (M), T-1016 (M), T-1013 (M) — five M-effort producers. Plus v3 T-0509 (retargeted through T-1015 pilot on Cake) and v3 T-0510 (rides T-1012).
- **Week 2:** T-1003 (L, unifies catalog — largest single dependency for T-1007 and T-1009), T-1006 (M), T-1007 (M), T-1009 (M), T-1021 (M), T-1019 (M), T-1020 (M). Ship as `v2.1.0-beta.1`.

Phase B of v3 (Weeks 2-3, release rides `v2.1.0-beta.2`) absorbs:
- **Week 3:** T-1015 (L, `/vs/cake` pilot), T-1008 (M, cfo_ledger), T-1010 (M, BQ export), T-1024 (M, RLS body audit), T-1014 (M, runbooks). Plus v3 T-0601..T-0626 cap-table work as scheduled.

Phase C of v3 (Weeks 3-4, rides `v2.1.0-beta.2`) absorbs:
- **Week 4:** T-1022 (M, GST watcher), T-1017 (L, mobile pass — must land before Phase D Lighthouse gate is meaningful). Plus v3 T-0701..T-0722 data-room + investor-pack as scheduled.

Phase D of v3 (Weeks 4-5, rides `v2.1.0-rc.1`) proceeds as-scheduled; T-1017 mobile pass is prerequisite for the Lighthouse ≥ 85 gate at v3 T-0916.

Phase E of v3 (Weeks 5-6, release `v2.1.0`) proceeds as-scheduled; Goal 5C (public index) forks off as v3.2 rather than blocking GA.

Splice guide: read `docs/IMPLEMENTATION-PLAN-v3.md` §2 (task tables per phase) as the trunk; interleave the T-10xx tasks above at the week they land. No v3 task is deleted; T-0501..T-0505 are replaced in-place by T-1004; T-0506..T-0508 are defer-annotated (see §5).

---

## 7. Success gate for v3.1 amendment closure

5 numeric thresholds — measurable in Postgres or CI. All must be green at `v2.0.0-beta.9` (roughly 3 beta cuts after this amendment) for v3.1 to close cleanly.

1. **≥ 8 of the 15 H-severity T-10xx tasks (WSJF ≥ 6.0) shipped and green in CI regression.** Measured by grep on `web/CHANGELOG.md` entries between beta.6 and beta.9 for the T-10xx IDs.
2. **0 dead CRO triggers.** Measured by `select count(distinct trigger_id) from conversion_events where kind = 'shown' and ts >= now() - interval '7d'` returning 10 (all triggers in the registry).
3. **MRR tile shows real MRR (not 30d-rev proxy).** Measured by the tile source query joining `subscription_trial_state` × `plans` per CFO §3.2, and the label reads "MRR (recurring)" not "Revenue (30d, net)".
4. **`audit_events` has ≥ 1 genesis row + ≥ 3 writer-path smoke rows.** Measured by `select count(*) from audit_events where action in ('audit.genesis','deploy.verified','cron.audit.verified')` returning ≥ 4.
5. **At least 1 `/vs/[X]` page live and indexed.** Measured by `curl -sI https://blockid.au/vs/cake` returning 200 AND `sitemap.xml` including `<loc>https://blockid.au/vs/cake</loc>`.

No traction numbers (user counts, MRR values, conversion rates) are set as gates — those are v3 §9's job. The v3.1 gate is about *the plumbing being real*, not about the numbers being big.

---

## 8. Owner-brief per C-Level

### CTO

Read: `cto-review-v2.0.0-beta.6.md` in full — five drift findings and five fix sketches map 1:1 to your v3.1 backlog. Fix #2 (node_modules symlink) already shipped as event #5 in §1 above.
What changes for you in v3.1: Fix #3 (T-1005) is your S-effort quick win to run first. Fix #5 (T-1003 — analytics catalog) is the largest cross-cutting task; it unblocks CDO T-1009 and CFO T-1007, so pull it forward to Week 2 not Week 4.
Read also: `ciso-review-v2.0.0-beta.6.md` §3 for the CSP wire-check story — you and CISO co-own T-1018 (audit-chain smoke rows) since the writer paths are yours to instrument.

### CFO

Read: `cfo-review-v2.0.0-beta.6.md` §1.2 (three pricing csv-vs-ts drift bugs, all refund-risk), §3 (MRR tile is a cash-inflow proxy, not MRR), §6 (runway needs `cfo_ledger`).
What changes for you in v3.1: T-1007 (real MRR view) + T-1008 (cfo_ledger) + T-1021 (pricing drift) + T-1022 (GST watcher) + T-1023 (save-offer scoping) are all yours. Sequence: T-1021 first (it's a refund liability), then T-1007 for the board readout, then T-1008 seed row for the runway tile.
Read also: `cro-cmo-review-v2.0.0-beta.6.md` §4 — CRO wants 5 numbers from you before beta.7 (contribution margin, blended payback, discount stacking rule, blended CAC, concurrent-offer rules). Ship those in a `cfo-numbers-2026-07-18.md` companion file before Phase A close.

### CDO

Read: `cdo-review-v2.0.0-beta.6.md` in full — §1 (27 dark keys), §2 (client tracker never posts to ingest), §4 (6 missing moat events), §5 (BQ export absent).
What changes for you in v3.1: T-1003 (analytics registry unification — you co-own with CTO) is the load-bearing task; T-1009 (6 new events) and T-1010 (BQ export) depend on it. Do NOT ship T-1009 or T-1010 before T-1003 lands.
Read also: `cto-review-v2.0.0-beta.6.md` Fix #5 — same task from CTO's lens; align on registry schema before Week 2 kickoff.

### CISO

Read: `ciso-review-v2.0.0-beta.6.md` in full — 14-finding table in Appendix B is your v3.1 backlog. §2 (audit_events = 0), §3 (CSP wire-vs-code drift, closed today per §1 event #3), §4 (DMARC visibility gap), §7 (security.txt 404), §9 (4 missing runbooks).
What changes for you in v3.1: five S-effort tasks (T-1011, T-1012, T-1018, T-1023, T-1025) go in Week 1 — collectively they close 6 of your 14 findings. T-1014 (4 runbooks) and T-1024 (RLS policy body audit) are your Week 2/3 tasks.
Read also: `cfo-review-v2.0.0-beta.6.md` §7 (refund/chargeback surface) — the check-constraint on `revenue_events` there is a defensibility fix you should co-sign.

### CRO

Read: `cro-cmo-review-v2.0.0-beta.6.md` Part A (§1-§5) in full — 10/10 triggers dead, 4/4 experiments dead, 5 numbers you need from CFO.
What changes for you in v3.1: T-1001 (trigger wiring) + T-1002 (experiment wiring) + T-1020 (trial-day-3 modal) are your Week 1 tasks. T-1023 (COMEBACK30 restriction, co-owned with CFO) closes an economic-leak vector. The cohort staged rollout (v3 T-0506..T-0508) is deferred per §5 — you no longer need to build a cohort-router dial for v2.1.
Read also: `cdo-review-v2.0.0-beta.6.md` §4 event #5 (`entitlement_upgrade_intent`) — this is the event your funnel needs to bridge `feature_gate_hit` and `checkout_completed`; T-1009 wires it once T-1003 lands.

### CMO

Read: `cro-cmo-review-v2.0.0-beta.6.md` Part B (§6-§10) in full — sitemap gaps (2 closed today per §1 event #11, `/roadmap`/`/changelog`/`/status`/`/svi` still to add), 6 canonical founder-SEO articles queued, `/vs/[competitor]` route missing, LinkedIn cron unscheduled.
What changes for you in v3.1: T-1015 (`/vs/cake` pilot — co-owned with CTO), T-1019 (publish-insight cron unstick + 6-article pipeline), and T-1012 (security-audit public page as co-owner) are yours. The GA announcement blast (v3 T-0919) is downstream of these three.
Read also: `ciso-review-v2.0.0-beta.6.md` §4 (DMARC + BIMI story) — BIMI is a CMO-adjacent brand-trust surface you should scope for v2.2.

---

*End of `IMPLEMENTATION-PLAN-v3.1-amended.md`. Owned by Chief of Staff. Amendment to v3, not a replacement. Next revision: after Phase A retro (`v2.1.0-beta.1` ship, ETA W2).*
