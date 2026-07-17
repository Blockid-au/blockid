# BlockID.au v2.1 → GA — Master Implementation Plan (v3)

**Chief Architect:** Senior PM consolidation of C-Level workstream inputs
**Date:** 2026-07-17
**Baseline:** `v2.0.0-beta.6` (Phases 0-4 complete, /roadmap /changelog /status live, CSP nonce, lifecycle RPC)
**Duration:** 6 weeks, 5 phases (A → E), 3 fortnight releases (`v2.1.0-beta.1`, `v2.1.0-beta.2`, `v2.1.0-rc.1`)
**GA target tag:** `v2.1.0` — end of Week 6
**Rollout flag:** `NEXT_PUBLIC_UPGRADE_V2` currently at 100% (kill-switch retained); new gates: `NEXT_PUBLIC_UPGRADE_V2_COHORT_PCT`, `NEXT_PUBLIC_CAPTABLE_V2`, `NEXT_PUBLIC_DATAROOM_V2`, `NEXT_PUBLIC_VALUATION_V2`, `NEXT_PUBLIC_SVI_INDEX_PUBLIC`.

---

## 1. Executive Summary

- **Ship in v2.1:** (a) close 3 deferred audit findings from beta.5 (SES bounce classifier + suppression, cohort staged rollout, /security-audit public page); (b) 5 SEO `/vs/[competitor]` compare pages + `<SVIScoreV2>` 13-criteria explainer + missing legal MDX consumer pages; (c) Cap Table + ESOP grant depth with hash-chain audit trail and Division 83A generator; (d) Data Room + Investor Pack PDF with revocable share links; (e) Valuation V2 (VC/Berkus/comps) and Google-Sheets export; (f) Public SVI Index (blockchain-agnostic) with saved searches, watchlist and digest emails.
- **GA-gate for v2.1.0:** zero P0 open audit findings; 100 active founders; ≥30 cap-table adopters; ≥50 ESOP grants recorded; ≥200 investor share-link opens across cohort; trial→paid ≥ 25% on rolling 30d; p95 /pricing ≤ 400 ms; Lighthouse mobile ≥ 85 on 4 core surfaces; Playwright regression + audit-chain nightly green 7 days consecutive.
- **What we deliberately defer to v3:** on-chain tokenization sync, dividend distribution, exit-marketplace, LP portal — see §10.

---

## 2. Ordered Task List (Phase A → E)

Task IDs `T-05xx` (Phase A) → `T-09xx` (Phase E). Effort: S ≤ 4h, M ≤ 1d, L ≤ 3d. All IDs new; no reuse of `T-01xx..T-0499` from v2.

### Phase A — Close deferred audit + hardening (Weeks 1-2) — release `v2.1.0-beta.1`

| ID | Task | Owner | Effort | Deps | Files touched |
|----|------|-------|--------|------|---------------|
| T-0501 | SES/SMTP permanent-bounce classifier lib (`Permanent`, `Transient`, `Complaint`, `Delayed`) parses DSN + SES SNS payloads | CISO+CTO | M | — | `web/src/lib/email/bounce-classify.ts`, `+__tests__/bounce-classify.test.ts` |
| T-0502 | `POST /api/webhooks/ses` — SNS signature verify + write `email_bounces` | CISO | M | T-0501, mig 0082 | `web/src/app/api/webhooks/ses/route.ts` |
| T-0503 | Suppression-list table + guard in `lifecycle-mailer` cron (skip if address suppressed) | CDO+CTO | M | T-0502, mig 0082 | `web/src/lib/email/suppression.ts`, `web/src/app/api/cron/lifecycle-mailer/route.ts` |
| T-0504 | `POST /api/email/unsubscribe` — one-click RFC 8058 header + token verify + suppression insert | CDO | S | T-0503 | `web/src/app/api/email/unsubscribe/route.ts`, `web/src/emails/*/footer.tsx` |
| T-0505 | Lifecycle email template audit: `List-Unsubscribe` + `List-Unsubscribe-Post` headers on all 7 templates | CMO+CDO | S | T-0504 | `web/src/emails/lifecycle/*.tsx`, `web/src/lib/email/send.ts` |
| T-0506 | Cohort staged rollout: bucket by hash(user_id) < `NEXT_PUBLIC_UPGRADE_V2_COHORT_PCT`; ship `cohortResolve()` helper | CRO+CTO | M | — | `web/src/lib/feature-flags.ts`, `web/src/lib/rollout/cohort.ts`, `+__tests__` |
| T-0507 | Wire cohort gate into `/pricing`, `/onboarding`, `<UpgradeModal>` (fallback = v1 surface) | CRO+CPO | M | T-0506 | `web/src/app/pricing/page.tsx`, `web/src/app/onboarding/page.tsx`, `web/src/components/upsell/UpgradeModal.tsx` |
| T-0508 | Cohort admin toggle in `/admin/pricing-metrics` (read-only display of active pct + rollout log) | CRO+CFO | S | T-0506 | `web/src/app/admin/pricing-metrics/page.tsx` |
| T-0509 | `/vs/[competitor]` route + MDX loader, 5 seed pages (cake, carta, foundersuite, visible, angellist) | CMO+CTO | L | — | `web/src/app/(marketing)/vs/[competitor]/page.tsx`, `web/content/marketing/vs/*.mdx` |
| T-0510 | `/security-audit` public page — reads `web/content/reports/security/latest.md`, shows SOC2 roadmap + CSP status | CISO+CMO | M | — | `web/src/app/security-audit/page.tsx`, `web/content/reports/security/latest.md` |
| T-0511 | `<SVIScoreV2>` — 13-criteria breakdown accordion; per-criterion score + evidence + fix hint | CPO+CDO | L | mig 0083 | `web/src/components/svi/ScoreV2.tsx`, `web/src/lib/svi/criteria.ts` |
| T-0512 | `/svi/methodology` public page — methodology, criteria matrix, revision history | CPO+CMO | M | T-0511 | `web/src/app/svi/methodology/page.tsx`, `web/content/marketing/svi-methodology.mdx` |
| T-0513 | Legal consumer MDX: `/legal/disclaimers/{not-financial-advice, equity-offer, share-issuance, trial-terms}` × EN | CLO | M | — | `web/src/app/legal/disclaimers/[kind]/page.tsx`, `web/content/legal/disclaimers/*.mdx` |
| T-0514 | Legal MDX (VI translations of T-0513) — [VERIFY-COUNSEL] | CLO+CMO | M | T-0513 | `web/content/legal/disclaimers/*.vi.mdx` |
| T-0515 | Audit-chain daily verify report → `/security-audit` "Chain integrity" tile | CISO | S | T-0510 | `web/scripts/verify-audit-chain.ts`, `web/content/reports/security/latest.md` |
| T-0516 | Playwright regression subset for Phase A surfaces (5 vs pages + /security-audit + /svi/methodology) | QA | M | T-0509..T-0512 | `web/tests/e2e/regression/phase-a.spec.ts` |
| T-0517 | Phase A retro + release notes for `v2.1.0-beta.1` | COO | S | all A | `web/CHANGELOG.md`, `web/content/reports/version.json` |

### Phase B — Cap Table + ESOP depth (Weeks 2-3) — release rides `v2.1.0-beta.2`

| ID | Task | Owner | Effort | Deps | Files touched |
|----|------|-------|--------|------|---------------|
| T-0601 | Migration `0083_cap_table_events.sql` — hash-chained event log | CTO+CISO | M | — | `web/supabase/migrations/0083_cap_table_events.sql` |
| T-0602 | `web/src/lib/captable/events.ts` — `appendCapTableEvent()` (prev_hash chaining, HMAC salt), `replayCapTable()` | CTO | L | T-0601 | `+__tests__/events.test.ts` |
| T-0603 | Migration `0084_esop_grants.sql` — grants, vesting schedules, acceptance records | CTO+CLO | M | T-0601 | `web/supabase/migrations/0084_esop_grants.sql` |
| T-0604 | `web/src/lib/esop/vesting.ts` — cliff+monthly linear + custom-schedule support | CTO+CFO | M | T-0603 | `+__tests__/vesting.test.ts` |
| T-0605 | `POST /api/captable/events` — validated intake for issue/transfer/cancel; RLS-guarded | CTO+CISO | M | T-0602 | `web/src/app/api/captable/events/route.ts` |
| T-0606 | `GET /api/captable/state` — replayed current holders + fully-diluted table | CTO | S | T-0605 | `web/src/app/api/captable/state/route.ts` |
| T-0607 | `<CapTableView>` — grouped-by-class holder table + fully-diluted toggle + hash-chain "verified" badge | CPO+CTO | L | T-0606 | `web/src/components/captable/CapTableView.tsx` |
| T-0608 | `<CapTableEventLog>` — chronological event list with prev_hash tooltip | CPO | M | T-0606 | `web/src/components/captable/EventLog.tsx` |
| T-0609 | `/workspace/founder/captable` — CapTableView + EventLog + add-event modal (gated by `CAPTABLE_V2`) | CPO+CTO | L | T-0607, T-0608 | `web/src/app/workspace/founder/captable/page.tsx` |
| T-0610 | `POST /api/esop/grants` — issue grant, generate acceptance token, write audit event | CTO+CLO | M | T-0603 | `web/src/app/api/esop/grants/route.ts` |
| T-0611 | `GET /api/esop/grants/[id]/vesting` — schedule + cliff + vested-to-date | CTO | S | T-0604 | `web/src/app/api/esop/grants/[id]/vesting/route.ts` |
| T-0612 | `POST /api/esop/grants/[id]/accept` — token verify + consent hash + immutable acceptance record | CTO+CLO+CISO | M | T-0610 | `web/src/app/api/esop/grants/[id]/accept/route.ts` |
| T-0613 | `<ESOPGrantsAdmin>` — founder view: issue, revoke, view acceptance state, download 83A pack | CPO+CTO | L | T-0611 | `web/src/components/esop/GrantsAdmin.tsx` |
| T-0614 | `<ESOPGrantAccept>` — employee-facing acceptance surface at `/esop/accept/[token]` (no login required) | CPO+CLO | M | T-0612 | `web/src/app/esop/accept/[token]/page.tsx` |
| T-0615 | `<VestingSchedule>` — visual timeline (recharts SVG) with cliff marker + monthly buckets | CPO+CDO | M | T-0611 | `web/src/components/esop/VestingSchedule.tsx` |
| T-0616 | `web/src/lib/esop/div83a.ts` — Division 83A tax-year aggregator (grant qty, market value at grant, deferred taxing point) | CLO+CFO | L | T-0604 | `+__tests__/div83a.test.ts` |
| T-0617 | `GET /api/esop/reports/div83a` (?year=YYYY) — CSV + PDF export of Division 83A report | CFO+CLO | M | T-0616 | `web/src/app/api/esop/reports/div83a/route.ts` |
| T-0618 | Migration `0085_captable_share_links.sql` — revocable share tokens + view-log | CTO+CISO | M | T-0601 | `web/supabase/migrations/0085_captable_share_links.sql` |
| T-0619 | `POST /api/captable/share` — mint token (expires_at, allowed_scopes) | CTO+CISO | S | T-0618 | `web/src/app/api/captable/share/route.ts` |
| T-0620 | `POST /api/captable/share/[token]/revoke` — mark revoked; audit_event | CTO+CISO | S | T-0619 | `web/src/app/api/captable/share/[token]/revoke/route.ts` |
| T-0621 | `GET /api/captable/share/[token]/view` — record view, return read-only state | CTO | S | T-0619 | `web/src/app/api/captable/share/[token]/view/route.ts` |
| T-0622 | `/captable/shared/[token]` public read-only view + open-count chip | CPO | M | T-0621 | `web/src/app/captable/shared/[token]/page.tsx` |
| T-0623 | `<ShareLinkAnalytics>` — opens count, unique IPs (hashed), last-opened per link | CPO+CDO | M | T-0621 | `web/src/components/captable/ShareLinkAnalytics.tsx` |
| T-0624 | Playwright: cap-table issue → transfer → replay hash-chain verification | QA | M | T-0606 | `web/tests/e2e/regression/captable.spec.ts` |
| T-0625 | Playwright: ESOP grant → accept → vesting timeline → 83A CSV | QA | M | T-0617 | `web/tests/e2e/regression/esop.spec.ts` |
| T-0626 | Phase B release: enable `CAPTABLE_V2=on` for cohort 25% + retro | COO+CRO | S | all B | `web/CHANGELOG.md`, `web/content/reports/version.json` |

### Phase C — Data Room + Investor Pack (Weeks 3-4) — rides `v2.1.0-beta.2`

| ID | Task | Owner | Effort | Deps | Files touched |
|----|------|-------|--------|------|---------------|
| T-0701 | Migration `0086_data_room.sql` — folders, documents, share_links, access_log, virus_scan_status | CTO+CISO | M | — | `web/supabase/migrations/0086_data_room.sql` |
| T-0702 | `web/src/lib/data-room/storage.ts` — signed upload URL (Supabase Storage), max-size + MIME allowlist | CTO+CISO | M | T-0701 | `+__tests__/storage.test.ts` |
| T-0703 | `POST /api/data-room/documents` — signed URL issuance; server records metadata only | CTO | S | T-0702 | `web/src/app/api/data-room/documents/route.ts` |
| T-0704 | `POST /api/data-room/documents/[id]/scan` — server-side ClamAV wrapper; updates virus_scan_status | CISO | M | T-0703 | `web/src/app/api/data-room/documents/[id]/scan/route.ts` |
| T-0705 | `<DataRoomBrowser>` — folder tree + upload + rename + delete (soft) + scan-status chip | CPO+CTO | L | T-0703 | `web/src/components/data-room/Browser.tsx` |
| T-0706 | `<DataRoomAccessLog>` — chronological log per document (who / when / IP hash / user agent hash) | CPO+CDO | M | T-0701 | `web/src/components/data-room/AccessLog.tsx` |
| T-0707 | `/workspace/founder/data-room` (gated by `DATAROOM_V2`) | CPO+CTO | M | T-0705 | `web/src/app/workspace/founder/data-room/page.tsx` |
| T-0708 | `POST /api/data-room/share` — mint token, granular per-folder scopes, expiry (max 30d) | CTO+CISO | M | T-0701 | `web/src/app/api/data-room/share/route.ts` |
| T-0709 | `POST /api/data-room/share/[token]/revoke` + email notify all recorded viewers | CTO+CDO+CISO | S | T-0708 | `web/src/app/api/data-room/share/[token]/revoke/route.ts` |
| T-0710 | `/data-room/shared/[token]` — password-optional read-only viewer + view logging | CPO+CTO | M | T-0708 | `web/src/app/data-room/shared/[token]/page.tsx` |
| T-0711 | Migration `0087_investor_pack.sql` — pack builds, sections, share_links (references cap-table + SVI snapshots) | CTO | M | T-0601, T-0701 | `web/supabase/migrations/0087_investor_pack.sql` |
| T-0712 | `web/src/lib/pdf/investor-pack.ts` — @react-pdf renderer: cover, SVI 13-criteria, cap-table, traction, documents, disclaimers | CPO+CFO+CLO | L | T-0607, T-0511 | `+__tests__/investor-pack.test.ts` |
| T-0713 | `POST /api/investor-pack/build` — snapshot cap-table state + SVI score + traction metrics; render PDF | CFO+CTO | M | T-0712 | `web/src/app/api/investor-pack/build/route.ts` |
| T-0714 | `GET /api/investor-pack/[id]/download` — signed URL; watermark viewer email | CTO+CISO | S | T-0713 | `web/src/app/api/investor-pack/[id]/download/route.ts` |
| T-0715 | `<InvestorPackBuilder>` — section toggles + preview + build → share-link modal | CPO+CFO | L | T-0713 | `web/src/components/investor-pack/Builder.tsx` |
| T-0716 | `/workspace/founder/investor-pack` (list past builds, download, share-link mgmt) | CPO+CTO | M | T-0715 | `web/src/app/workspace/founder/investor-pack/page.tsx` |
| T-0717 | `POST /api/investor-pack/share` + `/[token]/view` + `/[token]/revoke` | CTO+CISO | M | T-0711 | `web/src/app/api/investor-pack/share/**` |
| T-0718 | `/investor-pack/shared/[token]` — public viewer + PDF download with per-viewer watermark | CPO+CTO | M | T-0717 | `web/src/app/investor-pack/shared/[token]/page.tsx` |
| T-0719 | Investor-view analytics tile in `/workspace/founder` — opens per pack, unique viewer count | CPO+CDO | M | T-0717 | `web/src/app/workspace/founder/page.tsx` |
| T-0720 | Playwright: upload → scan → share → view logging → revoke round-trip | QA | M | T-0710 | `web/tests/e2e/regression/data-room.spec.ts` |
| T-0721 | Playwright: build investor pack → share → viewer opens with watermark | QA | M | T-0718 | `web/tests/e2e/regression/investor-pack.spec.ts` |
| T-0722 | Phase C release: enable `DATAROOM_V2=on` cohort 25% + retro | COO+CRO | S | all C | `web/CHANGELOG.md`, `web/content/reports/version.json` |

### Phase D — Valuation V2 (Weeks 4-5) — rides `v2.1.0-rc.1`

| ID | Task | Owner | Effort | Deps | Files touched |
|----|------|-------|--------|------|---------------|
| T-0801 | Migration `0088_valuation_snapshots.sql` — methods, inputs, outputs, comparable-set refs | CFO+CTO | M | — | `web/supabase/migrations/0088_valuation_snapshots.sql` |
| T-0802 | `web/src/lib/valuation/vc-method.ts` — VC method (exit value / target multiple, ownership discounting) | CFO | M | — | `+__tests__/vc-method.test.ts` |
| T-0803 | `web/src/lib/valuation/berkus.ts` — Berkus method (5 factors × 0-A$500K each) | CFO | S | — | `+__tests__/berkus.test.ts` |
| T-0804 | `web/src/lib/valuation/comps.ts` — comparable-comps engine reads SVI index anonymised aggregates | CFO+CDO | L | — | `+__tests__/comps.test.ts` |
| T-0805 | `web/src/lib/valuation/blend.ts` — weighted-blend of 3 methods + confidence-interval band | CFO | M | T-0802..T-0804 | `+__tests__/blend.test.ts` |
| T-0806 | `POST /api/valuation/compute` — run all 3 methods for a startup snapshot | CFO+CTO | M | T-0805, T-0801 | `web/src/app/api/valuation/compute/route.ts` |
| T-0807 | `GET /api/valuation/history` — timeline of snapshots for a startup | CFO+CTO | S | T-0801 | `web/src/app/api/valuation/history/route.ts` |
| T-0808 | `<ValuationV2>` — method breakdown cards + blended band SVG chart + inputs form | CPO+CFO+CDO | L | T-0806 | `web/src/components/valuation/ValuationV2.tsx` |
| T-0809 | `<ValuationHistoryChart>` — SVG timeline with milestone annotations (from SVI events) | CPO+CDO | M | T-0807 | `web/src/components/valuation/HistoryChart.tsx` |
| T-0810 | `/workspace/founder/valuation` (gated by `VALUATION_V2`) — new surface swapping the v1 single-method view | CPO+CTO | L | T-0808, T-0809 | `web/src/app/workspace/founder/valuation/page.tsx` |
| T-0811 | `web/src/lib/valuation/gsheets-export.ts` — Google Sheets API client (service-account auth) | CFO+CTO | M | — | `+__tests__/gsheets-export.test.ts` |
| T-0812 | `POST /api/valuation/export/gsheets` — write inputs + methods + blend to new tab | CFO+CTO | M | T-0811, T-0806 | `web/src/app/api/valuation/export/gsheets/route.ts` |
| T-0813 | `<GSheetsExportButton>` — OAuth-consent → export → returns spreadsheet URL | CPO+CFO | M | T-0812 | `web/src/components/valuation/GSheetsExportButton.tsx` |
| T-0814 | Legal disclaimer stamping on ValuationV2 surface + PDF export ("not a valuation report per APES 225") | CLO | S | T-0808 | `web/src/components/valuation/Disclaimer.tsx` |
| T-0815 | Playwright: compute → history → gsheets export smoke | QA | M | T-0813 | `web/tests/e2e/regression/valuation.spec.ts` |
| T-0816 | Phase D release: enable `VALUATION_V2=on` cohort 25% + retro | COO+CRO | S | all D | `web/CHANGELOG.md`, `web/content/reports/version.json` |

### Phase E — Public SVI Index + GA (Weeks 5-6) — release `v2.1.0`

| ID | Task | Owner | Effort | Deps | Files touched |
|----|------|-------|--------|------|---------------|
| T-0901 | `web/src/lib/svi/index-listing.ts` — anonymised opt-in projection of startup profile fields | CDO+CLO | M | T-0511 | `+__tests__/index-listing.test.ts` |
| T-0902 | `POST /api/svi/index/opt-in` — founder-controlled opt-in with consent hash | CDO+CLO+CISO | M | T-0901 | `web/src/app/api/svi/index/opt-in/route.ts` |
| T-0903 | `GET /api/svi/index/listings` — paginated, filter by segment/stage/score-band | CDO+CTO | M | T-0901 | `web/src/app/api/svi/index/listings/route.ts` |
| T-0904 | `<SVIIndexTable>` — filterable table + score badge + last-updated | CPO+CDO | L | T-0903 | `web/src/components/svi-index/Table.tsx` |
| T-0905 | `/svi/index` public page (gated by `SVI_INDEX_PUBLIC`) — index landing + table | CPO+CMO | M | T-0904 | `web/src/app/svi/index/page.tsx` |
| T-0906 | `/svi/index/[slug]` public startup detail page — anonymised card (or full name if opted-in) | CPO+CMO | M | T-0903 | `web/src/app/svi/index/[slug]/page.tsx` |
| T-0907 | `POST /api/svi/watchlist` — investor watchlist add/remove | CTO | S | — | `web/src/app/api/svi/watchlist/route.ts` |
| T-0908 | `<SVIWatchlist>` — investor-workspace tile with saved rows + note | CPO+CTO | M | T-0907 | `web/src/components/svi-index/Watchlist.tsx` |
| T-0909 | `POST /api/svi/saved-search` — save query params + name; cap 10 per investor | CTO+CDO | M | — | `web/src/app/api/svi/saved-search/route.ts` |
| T-0910 | `<SVISavedSearches>` — investor-workspace: list, edit, run, delete | CPO+CTO | M | T-0909 | `web/src/components/svi-index/SavedSearches.tsx` |
| T-0911 | Weekly digest cron `web/src/app/api/cron/svi-digest/route.ts` — batches new listings matching saved searches | CDO+CRO | M | T-0909 | `+__tests__/svi-digest.test.ts` |
| T-0912 | React Email template: SVI weekly digest with new listings + score-change deltas | CMO+CRO | M | T-0911 | `web/src/emails/svi/digest.tsx` |
| T-0913 | Sitemap + hreflang wiring for public SVI index + methodology + vs pages | CMO+CTO | S | T-0905 | `next-sitemap.config.js`, `web/content/marketing/seo-map.json` |
| T-0914 | Structured data JSON-LD (`Organization`, `Dataset`) on /svi/index for SEO | CMO | S | T-0905 | `web/src/app/svi/index/page.tsx` |
| T-0915 | Playwright: opt-in → listing appears → investor watchlist → digest send simulation | QA | M | T-0911 | `web/tests/e2e/regression/svi-index.spec.ts` |
| T-0916 | Lighthouse mobile audit — /pricing /roadmap /svi/index /workspace/founder ≥ 85 | QA+CTO | M | all | `web/tests/lighthouse/*.json` |
| T-0917 | Nightly Playwright regression full run for 7 consecutive nights (GA gate) | QA+COO | L | all | `scripts/qa-release-gate.sh` |
| T-0918 | GA cutover: flip all `*_V2` cohort flags to 100%; retire fallback code path shims | COO+CTO | M | T-0917 | env; `deploy-live.sh` |
| T-0919 | GA announcement (insights article, LinkedIn, F6S, VN Zalo) | CMO+COO | M | T-0918 | `web/content/marketing/launch/2026-08-ga.md` |
| T-0920 | Post-GA retro + investor update + v3 kickoff brief | COO+CEO | S | T-0918 | `knowledge-base/upgrade-plan-2026-07-16/v2-1-retro.md` |

**Total: 84 tasks.** Blocking chain: `T-0501..T-0508` (audit close + cohort) unblock the cohort-gated Phase B/C/D/E releases; `T-0601 → T-0602 → T-0607` (cap-table hash chain) unblocks investor-pack (T-0712) and valuation blend (T-0805).

---

## 3. Migration Order (`0082 → 0088`, additive only)

All migrations applied via `docker exec supabase-db psql` + `NOTIFY pgrst, 'reload schema'`. No drops. Every column `if not exists`; every table guarded.

### `0082_email_bounces_and_suppression.sql`
- `email_bounces` — `id bigserial pk`, `email citext`, `kind text check in ('permanent','transient','complaint','delayed')`, `dsn_code text`, `raw_payload jsonb`, `received_at timestamptz default now()`
- `email_suppression` — `email citext pk`, `reason text`, `source text check in ('bounce','complaint','unsubscribe','manual')`, `created_at timestamptz default now()`
- indices: `email_bounces_email_idx`, `email_bounces_received_at_idx`
- RLS: service-role write-only; select restricted to admin.

### `0083_svi_criteria_scores.sql`
- `svi_criteria_scores` — `id bigserial pk`, `startup_id uuid`, `criterion text` (one of 13), `score numeric(5,2)`, `evidence text`, `fix_hint text`, `computed_at timestamptz default now()`
- `svi_score_versions` — `id bigserial pk`, `startup_id uuid`, `overall numeric(6,2)`, `methodology_version text`, `snapshot jsonb`, `computed_at timestamptz default now()`
- index: `svi_criteria_scores_startup_idx`
- RLS: owner + read to cap-table share-link viewers.

### `0084_cap_table_events.sql` (Phase B)
- `cap_table_events` — `id bigserial pk`, `startup_id uuid`, `kind text check in ('issue','transfer','cancel','convert','split')`, `payload jsonb`, `prev_hash bytea`, `hash bytea`, `actor_id uuid`, `created_at timestamptz default now()`
- `share_classes` — `id bigserial pk`, `startup_id uuid`, `name text`, `rights jsonb`, `created_at timestamptz default now()`
- index: `cap_table_events_startup_created_idx`
- RLS: owner + share-token scoped read.

### `0085_esop_grants.sql` (Phase B)
- `esop_grants` — `id bigserial pk`, `startup_id uuid`, `grantee_email citext`, `qty integer`, `strike_price_cents integer`, `grant_date date`, `cliff_months integer`, `vesting_months integer`, `custom_schedule jsonb`, `status text check in ('draft','issued','accepted','revoked')`, `acceptance_token text`, `accepted_at timestamptz`
- `esop_acceptance_records` — `id bigserial pk`, `grant_id bigint`, `consent_hash bytea`, `ip_hash bytea`, `user_agent_hash bytea`, `accepted_at timestamptz default now()`
- index: `esop_grants_startup_status_idx`, unique `esop_grants_acceptance_token_key`
- RLS: owner-write; grantee-view via signed token.

### `0086_captable_share_links.sql` (Phase B)
- `captable_share_links` — `id bigserial pk`, `startup_id uuid`, `token text unique`, `scopes jsonb`, `expires_at timestamptz`, `revoked_at timestamptz`, `created_by uuid`, `created_at timestamptz default now()`
- `captable_share_views` — `id bigserial pk`, `share_link_id bigint`, `ip_hash bytea`, `user_agent_hash bytea`, `viewed_at timestamptz default now()`
- index: `captable_share_views_link_viewed_idx`
- RLS: owner-read views; anonymous read of link-by-token via SECURITY DEFINER function.

### `0087_data_room.sql` (Phase C)
- `data_room_folders` — `id bigserial pk`, `startup_id uuid`, `parent_id bigint null`, `name text`, `deleted_at timestamptz null`
- `data_room_documents` — `id bigserial pk`, `folder_id bigint`, `filename text`, `mime text`, `size_bytes bigint`, `storage_key text`, `virus_scan_status text default 'pending'`, `uploaded_by uuid`, `uploaded_at timestamptz default now()`, `deleted_at timestamptz null`
- `data_room_share_links` — `id bigserial pk`, `startup_id uuid`, `token text unique`, `folder_scope bigint[]`, `password_hash bytea null`, `expires_at timestamptz`, `revoked_at timestamptz`
- `data_room_access_log` — `id bigserial pk`, `share_link_id bigint`, `document_id bigint`, `ip_hash bytea`, `user_agent_hash bytea`, `viewed_at timestamptz default now()`
- indices: `data_room_documents_folder_idx`, `data_room_access_log_link_idx`

### `0088_valuation_snapshots.sql` (Phase D)
- `valuation_snapshots` — `id bigserial pk`, `startup_id uuid`, `method text check in ('vc','berkus','comps','blend')`, `inputs jsonb`, `outputs jsonb`, `blend_weight numeric(4,3)`, `computed_at timestamptz default now()`
- `valuation_comps_pool` — materialised view over anonymised `svi_score_versions` × `plans` × sector aggregates
- index: `valuation_snapshots_startup_computed_idx`

All migrations rehearse on staging Supabase; `verify-audit-chain` runs against Phase B tables post-apply.

---

## 4. New API Routes (T-0502 → T-0599 slice)

Route table (all Next 16 App Router, `route.ts`, zod-validated, entitlement-gated where noted).

| Route | Method | Task | Entitlement | Notes |
|-------|--------|------|-------------|-------|
| `/api/webhooks/ses` | POST | T-0502 | none (SNS-signed) | signature verify + confirmation subscribe |
| `/api/email/unsubscribe` | POST/GET | T-0504 | token | RFC 8058 one-click compat |
| `/api/captable/events` | POST | T-0605 | `captable.write` | RLS + hash-chain append |
| `/api/captable/state` | GET | T-0606 | `captable.read` | replay events |
| `/api/captable/share` | POST | T-0619 | `captable.share` | mint token |
| `/api/captable/share/[token]/revoke` | POST | T-0620 | owner only | soft revoke |
| `/api/captable/share/[token]/view` | GET | T-0621 | token | write view-log |
| `/api/esop/grants` | POST/GET | T-0610 | `esop.write` | issue grant |
| `/api/esop/grants/[id]/vesting` | GET | T-0611 | grantee or owner | schedule |
| `/api/esop/grants/[id]/accept` | POST | T-0612 | signed token | acceptance |
| `/api/esop/reports/div83a` | GET | T-0617 | owner | CSV + PDF |
| `/api/data-room/documents` | POST/GET | T-0703 | `dataroom.write` | signed upload URL |
| `/api/data-room/documents/[id]/scan` | POST | T-0704 | service-role | ClamAV callback |
| `/api/data-room/share` | POST | T-0708 | owner | mint token |
| `/api/data-room/share/[token]/revoke` | POST | T-0709 | owner | revoke + notify |
| `/api/investor-pack/build` | POST | T-0713 | `pack.write` | render snapshot |
| `/api/investor-pack/[id]/download` | GET | T-0714 | owner or token | signed URL |
| `/api/investor-pack/share` | POST | T-0717 | owner | mint token |
| `/api/investor-pack/share/[token]/view` | GET | T-0717 | token | log view |
| `/api/investor-pack/share/[token]/revoke` | POST | T-0717 | owner | revoke |
| `/api/valuation/compute` | POST | T-0806 | `valuation.compute` | run 3 methods |
| `/api/valuation/history` | GET | T-0807 | owner | timeline |
| `/api/valuation/export/gsheets` | POST | T-0812 | owner + oauth | write sheet |
| `/api/svi/index/opt-in` | POST | T-0902 | owner + consent | publish to index |
| `/api/svi/index/listings` | GET | T-0903 | public | paginated |
| `/api/svi/watchlist` | POST/DELETE/GET | T-0907 | investor tier | per-investor |
| `/api/svi/saved-search` | POST/DELETE/GET | T-0909 | investor tier | cap 10 |
| `/api/cron/svi-digest` | POST | T-0911 | `CRON_SECRET` | weekly Monday 09:15 UTC |

Rate limits: default 60 rpm per user; upload endpoints 10 rpm; share-view endpoints 300 rpm per token.

---

## 5. Cross-Cutting

- **CSP tightening (2-milestone plan):**
  - v2.1.0: retain `style-src 'unsafe-inline'` for Tailwind runtime only; audit inline styles; add `require-trusted-types-for 'script'` in report-only mode.
  - v2.2.0 (post-GA): move Tailwind to `<style nonce=...>` build-emitted; deprecate `unsafe-inline` on `style-src`; ship Trusted Types enforce.
- **Mobile-first `/workspace/*` pass:** deliverable per surface — tap targets ≥ 44px, viewport-friendly tables (horizontal scroll on cap-table, DataRoomBrowser folder-tree collapses on < 640px), navigation via bottom-sheet on < 768px. Owner: CPO. Gate: Lighthouse mobile ≥ 85 for founder workspace after each phase lands.
- **a11y sweep after each surface:** axe-core Playwright test file `web/tests/e2e/a11y/[surface].spec.ts` per new page; must pass with 0 WCAG 2.1 AA violations. Owner: QA. Blocking for phase release.
- **Observability:** every new API route adds a `perf_events` row (p50/p95 latency, error class); dashboards in `/admin/pricing-metrics` extended with a "Feature health" band per phase.
- **Backward compat:** every cohort-gated surface has a documented v1 fallback path; roll-back is a single flag flip.

---

## 6. Rollout Gates

Each phase must pass all four before its release tag ships.

### Phase A — `v2.1.0-beta.1`
- Smoke: `curl -s https://blockid.au/security-audit` returns 200; `/api/webhooks/ses` returns 200 on signed sample; cohort helper unit tests green.
- Regression: Playwright `phase-a.spec.ts` full green.
- Perf: k6 pricing.js p95 < 400 ms with cohort router active.
- Sec: `security-audit` skill run zero critical + zero H findings on Phase A diff.

### Phase B — cap-table `CAPTABLE_V2=on` 25% cohort
- Smoke: `curl -s -H "Authorization: Bearer $CI_TOKEN" /api/captable/state?startup_id=$T` returns valid state; hash-chain verify script exits 0.
- Regression: `captable.spec.ts` + `esop.spec.ts` green.
- Perf: `/api/captable/state` p95 < 300 ms at 100 events.
- Sec: RLS matrix test — non-owner cannot read events; share-token scope enforced.

### Phase C — `DATAROOM_V2=on` 25% cohort
- Smoke: upload → scan → download round-trip via `scripts/data-room-smoke.sh`; investor-pack build < 15 s wall.
- Regression: `data-room.spec.ts` + `investor-pack.spec.ts` green.
- Perf: PDF render p95 < 8 s; share-view p95 < 400 ms.
- Sec: virus-scan blocks EICAR file; expired token rejected; revoked-link rejected.

### Phase D — `VALUATION_V2=on` 25% cohort
- Smoke: compute → history → gsheets export round-trip.
- Regression: `valuation.spec.ts` green.
- Perf: compute p95 < 900 ms; gsheets export p95 < 3 s.
- Sec: OAuth token scope minimally `spreadsheets`; never persisted server-side beyond request.

### GA — `v2.1.0`
- Smoke: all above smoke scripts green in single `scripts/qa-release-gate.sh` run.
- Regression: 7 consecutive nights green.
- Perf: Lighthouse mobile ≥ 85 on `/pricing /roadmap /svi/index /workspace/founder`.
- Sec: zero P0 open findings across all Phase A-E surfaces; audit-chain nightly verify green 14 days.

---

## 7. Risk Register (Top 8, WSJF-scored)

WSJF = (user_value + time_criticality + risk_reduction) / job_size. Scale 1-10 each; job_size 1 = trivial, 10 = massive.

| # | Risk | Category | Prob | Impact | Owner | Mitigation | WSJF |
|---|------|----------|------|--------|-------|------------|------|
| 1 | Cap-table hash-chain corruption from race on concurrent event append | Technical | 3 | 5 | CTO | `pick_lifecycle_due` pattern re-applied: `FOR UPDATE SKIP LOCKED` on `cap_table_events` insert path; nightly `verify-cap-table-chain.ts` cron | (9+9+9)/3 = 9.0 |
| 2 | ESOP grant Division 83A miscalculation produces incorrect ATO figures | Regulatory | 3 | 5 | CLO+CFO | tax-expert review of `div83a.ts` before Phase B ship; unit tests against 5 published ATO worked examples; `[VERIFY-COUNSEL]` gate on report export | (10+8+8)/3 = 8.7 |
| 3 | Data-room virus-scan false-negative allows malware distribution via share-link | Security | 2 | 5 | CISO | ClamAV + secondary heuristic; block download until scan complete; per-download SHA256 log; user-agent quarantine on repeated scan-fail attempts | (8+9+9)/3 = 8.7 |
| 4 | Investor-pack PDF renderer regression re-triggers @react-pdf tracer bug from beta.6 | Technical | 3 | 4 | CTO | pin `serverExternalPackages` list in `deploy-live.sh`; smoke test PDF render in every CI run; canary render on deploy | (7+7+9)/3 = 7.7 |
| 5 | Valuation V2 reads mis-aggregate SVI comps producing misleading numbers | Data | 3 | 4 | CDO+CFO | anonymised comps require n ≥ 5 startups per bucket; blend confidence band width proportional to n; APES 225 disclaimer stamped | (8+7+7)/3 = 7.3 |
| 6 | Public SVI index opt-in leaks personally identifying data despite anonymisation | Privacy | 2 | 5 | CLO+CDO+CISO | k-anonymity ≥ 5 per (segment,stage,score-band); consent-hash reject flow; per-field opt-in checkboxes | (7+8+8)/3 = 7.7 |
| 7 | Cohort rollout hash-bucket instability re-buckets users on deploy | Product | 4 | 3 | CRO+CTO | bucket on stable `user_id` + salted with `NEXT_PUBLIC_ROLLOUT_SALT` (never rotated); rollout-log table records first bucket; sticky-bucket enforced on subsequent visits | (7+7+7)/3 = 7.0 |
| 8 | 6-week timeline slippage from single-engineer bottleneck on cap-table replay code | Capacity | 4 | 4 | COO+CTO | pair CTO agent with tester agent on T-0602..T-0606; time-box replay to 3 days; fallback stub allowing Phase C to unblock even if Phase B slips 1 wk | (6+8+7)/3 = 7.0 |

Risks 1-3 above threshold 8.0 — active weekly review. Contingency reserve 15% of total nominal effort budgeted for the top 4 risks.

---

## 8. What OWNERS Should Read Now (Phase A briefs)

### CTO
Phase A drops your hardening backlog: SES bounce classifier + suppression list (T-0501..T-0505), cohort router with stable-bucket semantics (T-0506..T-0508). Then Phase B is your critical path — the hash-chain replay code in `web/src/lib/captable/events.ts` is the load-bearing piece for the entire investor-pack surface downstream. Priority: unblock T-0602 within Week 2. Files: `web/src/lib/email/*`, `web/src/lib/rollout/*`, `web/src/lib/captable/*`. Read: `docs/AUDIT-CHAIN-RUNBOOK.md`.

### CDO
Own analytics for cohort rollout tracking (T-0508 admin tile), the suppression-list write path (T-0503), and later the SVI index anonymised projection (T-0901). Phase A ask: define the exact event shape for bounce/complaint/unsubscribe so the CFO admin dashboard has trustworthy deliverability metrics. Files: `web/src/lib/analytics/events.ts`, `web/src/app/admin/pricing-metrics/page.tsx`. Watch: k-anonymity for SVI index projection is a P0 risk (row 6).

### CFO
Cohort tile in `/admin/pricing-metrics` (T-0508). Phase B: partner with CLO on Division 83A generator (T-0616, T-0617) — this is your regulatory compliance surface and must match ATO worked examples before ship. Phase D: valuation V2 blend + Google Sheets export is your primary founder-adoption lever. Priority now: source 5 ATO Division 83A worked examples for unit-test fixtures. Files: `web/src/lib/esop/div83a.ts`, `web/src/lib/valuation/*`.

### CRO
Cohort rollout is your instrument (T-0506..T-0508). Every subsequent phase (B/C/D) gates its release through your `NEXT_PUBLIC_*_V2` cohort dial. Phase A ask: define exit criteria per phase (conversion delta thresholds vs v1 fallback) before beta.1 ships. Files: `web/src/lib/rollout/*`, `web/config/experiments.json`. Watch: risk 7 (bucket instability) — your test plan must exercise deploy → same user re-visit → same bucket.

### CISO
Phase A: T-0502 SNS signature verification, T-0510 `/security-audit` public page + T-0515 audit-chain integrity tile. Phase B: RLS matrix for cap-table share-link scopes (T-0618..T-0623) — non-owner + expired-token + revoked-token must all reject. Phase C: virus-scan gate is a P0 (risk row 3). Priority: sign off cap-table event `prev_hash` verification path before Phase B ship. Files: `web/src/proxy.ts`, `web/src/lib/audit.ts`, `web/scripts/verify-audit-chain.ts`.

### CLO
Phase A: 4 consumer-facing legal MDX surfaces × EN (T-0513), VI translation (T-0514). Phase B: Division 83A `[VERIFY-COUNSEL]` sign-off on `div83a.ts`; ESOP acceptance workflow legally binding (T-0612); tax-year aggregator matches ATO reporting timeline. Phase D: APES 225 disclaimer on valuation V2 (T-0814) — this must be counsel-approved wording. Phase E: k-anonymity threshold for public SVI index (risk row 6). Files: `web/content/legal/**`, `web/src/lib/esop/div83a.ts`, `web/src/components/valuation/Disclaimer.tsx`.

---

## 9. Success Metrics + GA Gate

Beta-milestone realistic targets (no fabricated traction). "Active founder" = signed in ≥ 3 days in last 30 with ≥ 1 SVI compute + workspace visit.

| Metric | v2.1.0 GA target | Measured via | Reviewed |
|--------|------------------|--------------|----------|
| Active founders (30d) | ≥ 100 | `analytics_events` rollup | weekly |
| Trial → paid conversion (30d rolling) | ≥ 25% | `subscription_trial_state` + `revenue_events` | weekly |
| Cap-table adopters | ≥ 30 startups with ≥ 3 events | `cap_table_events` distinct startup | phase B+ |
| ESOP grants recorded | ≥ 50 grants across all customers | `esop_grants` | phase B+ |
| Data-room documents uploaded | ≥ 200 | `data_room_documents` | phase C+ |
| Investor share-link opens | ≥ 200 total across cohort | `captable_share_views` + `investor_pack_share_views` | phase C+ |
| Valuation V2 runs | ≥ 60 compute events across cohort | `valuation_snapshots` | phase D+ |
| SVI Index public listings | ≥ 40 opted-in startups | `svi_index_listings` where opted_in | phase E |
| Churn (30d) | < 8% | `churn_events` / active-subs | weekly |
| p95 `/pricing` | ≤ 400 ms | k6 | per phase |
| p95 `/api/captable/state` | ≤ 300 ms | `perf_events` | phase B+ |
| PDF render (investor pack) | ≤ 8 s p95 | server log | phase C+ |
| Lighthouse mobile — 4 core surfaces | ≥ 85 | CI | phase D+ |
| Open P0 audit findings | 0 | `security-audit` skill | GA blocker |
| Audit-chain nightly verify | green 14 consecutive nights | cron report | GA blocker |
| Playwright regression | green 7 consecutive nights | CI | GA blocker |
| a11y WCAG 2.1 AA — new surfaces | 0 violations | axe-core | per phase |

**GA-gate hard requirements to tag `v2.1.0`:**
1. Zero P0 audit findings open across all Phase A-E surfaces.
2. 100 active founders (30d).
3. ≥ 30 cap-table adopters.
4. ≥ 50 ESOP grants recorded.
5. ≥ 200 investor share-link opens.
6. Trial→paid ≥ 25% rolling 30d.
7. p95 `/pricing` ≤ 400 ms.
8. Lighthouse mobile ≥ 85 on the 4 core surfaces.
9. Playwright regression green 7 consecutive nights.
10. Audit-chain nightly verify green 14 consecutive nights.

Any of 1-10 red = ship as `v2.1.0-rc.N`, not GA. No exceptions.

---

## 10. Deliberately NOT Shipped in v2.1 — deferred to v3

The following surfaces are scoped out of v2.1 and will be addressed in the v3 plan (Phases 6-8 of the platform roadmap). Trying to ship these inside 6 weeks will slip the GA gate.

- **On-chain tokenization sync** (platform phase 6). Off-chain scaffold exists; Cosmos SDK + CosmWasm work + AFSL wholesale gating + wallet integration remain. Deferred to v3.
- **Dividend distribution flows** (platform phase 7). Requires holder-of-record snapshot, GST/withholding handling, ATO reporting, bank/pay-rail integration.
- **Exit-marketplace / secondary-share flows** (platform phase 8). Buyer/seller matching, escrow, KYC uplift, AFSL Ch7 uplift.
- **LP portal for accelerators** — LP quarterly report exists (v2 Phase 3 T-0421); an LP-facing surface with per-LP capital-call, distribution notice and K-1-equivalent statement is deferred.
- **Seven-figure investor syndicate flows** — SPV creation, waterfall calculators, GP/LP splits.
- **Blockchain explorer read integration into cap-table** — Anvil chainId 420 explorer exists; cap-table event mirror to on-chain contract is v3.
- **Vietnamese full workspace localisation** — VI covered for legal MDX (T-0514) and marketing MDX only; workspace UI remains EN-only in v2.1.
- **Advisor + Accelerator workspace v2 depth** — v2 Phase 3 T-0420 / T-0421 shipped MVPs; deeper CRM-style workflows (task assignment, engagement scoring, cohort applications inbox) deferred to v3.

v3 kickoff brief will land 1 week post-GA (T-0920 output).

---

*End of `IMPLEMENTATION-PLAN-v3.md`. Owned by Senior PM. Reviewed by COO weekly. Next revision: after Phase A retro (`v2.1.0-beta.1` ship).*
