# BlockID.au Changelog

## 2026-09-04 — v3.9.12: AI Model Registry + Auto-Fallback (Wave AI-Registry)

### Features
- **feat(ai-registry)** Centralised `ai-provider-registry.json` published at `GET /api/ai/registry`. Both blockid.au and startupvalueindex.com read from this unified registry.
- **feat(health-check cron)** `POST /api/cron/ai-health-check` (every 30 min): pings all 47 configured models with 5s timeout, records latency + quota status. On quota-exceeded: marks model degraded (exponential backoff 1h→24h), auto-injects up to 3 backup models from curated free-pool, fires Telegram alert.
- **feat(discovery cron)** `POST /api/cron/ai-model-discovery` (Sunday 04:00 UTC): crawls OpenRouter `/api/v1/models` (filter free-tier), Groq model list, SambaNova, Cerebras. Ranks by context window + known-good family (llama-3.3, qwen-2.5, deepseek-r1, mixtral, gemma-2) + prior latency. Auto-injects top 3 into fallback chain. Writes candidates to `content/ai-model-candidates.json`.
- **feat(admin UI)** `/admin/ai-health` — live table of model health (provider/model/latency/status/last-check) + "Run health check now" + "Discover models now" manual trigger buttons.
- **feat(curated free-pool)** `web/src/lib/ai/known-good-pool.ts` — 17 pre-vetted free models across Groq (4), SambaNova (3), Cerebras (3), OpenRouter (5), Chutes (1), Cloudflare (1).
- **Initial registry state**: 47 checked, 14 healthy, 5 quota-exceeded (3× Cerebras, 2× OpenRouter degraded until 14:31 UTC).

---

## 2026-09-04 — v3.9.11: 13-Criteria Sub-breakdown + Risk Register (Wave 30)

### Features
- **feat(wave30 — 13-criteria sub-scores)** Each SVI dimension accordion on the public `/score` results page now expands to show 1-3 W23-mapped criteria (18 mapped positions across 13 unique criteria). Each criterion shows: key, title, subtitle, score/100 badge, status chip (strong/developing/gap), 2-sentence data-driven commentary.
- **feat(wave30 — risk register)** New `riskRegister` section below the accordion — top 5 weakest criteria sorted by score, each with severity (critical/major/moderate), 1-sentence impact statement, 1-sentence specific remediation action.
- **feat(wave30 — commentary quality)** `buildDimCommentary()` expanded from 3 sentences to 5 sentences per dimension, referencing actual input values (MRR, team size, runway, sector).
- **feat(wave30 — lco sub-criteria)** Legal & Compliance dimension now surfaces 1-2 governance sub-criteria (documents, team_structure).

---

## 2026-09-04 — v3.9.10: Full Score Analysis + 30-Day Action Plan (Wave 28C + 29)

### Features
- **feat(wave29 — score full analysis)** Public `/score` results page now shows investor-grade breakdown without login: executive assessment (5-sentence AI verdict), top-3 priorities (90-day actions), 8-dimension collapsible accordion with score bars, status badges, 3-sentence per-dim commentary. All deterministic — no AI call required.
- **feat(wave28c — 30-day action plan)** `ActionPlan` component renders below TBR at `/workspace/business-report` + `/tbr/[token]` when `sviRunId` is available. POST `/api/svi/action-plan/generate` — checks cache, calls Groq/fallback AI, returns 5 personalised tasks ranked by `target_delta_points`. POST `/api/svi/action-plan/[id]/toggle` — ownership-checked completion toggle with optional `evidence_url`. Tables: `svi_action_plans` (UNIQUE on `svi_run_id`) + `svi_action_tasks` (5 per plan).
- **feat(wave28c — platform-config prompt)** `AIPromptsConfig.actionPlan` in `platform-config.ts` — ops-editable AI prompt with compliance constraints (no real company names, strict JSON output, 5-task limit).

---

## 2026-09-04 — v3.9.9: Wave 28A — Founder Weekly Digest

### Features
- **feat(wave28a — founder weekly digest)** New table `founder_digest_sends (user_id, project_id, period_start, period_end, payload JSONB, sent_at, opened_at)` with `UNIQUE (user_id, period_start)` for send idempotency. New column `email_preferences.digest_weekly BOOLEAN DEFAULT TRUE` extends the existing preferences hub. New `POST /api/cron/founder-digest-weekly` (CRON_SECRET-gated, POST-only) enumerates opted-in founders, aggregates 7-day windows of `tbr_views` (count + top country), `tbr_leads` (count + firm/interest_level list), `svi_snapshots` (current + delta vs period-start), and picks the weakest dim from `dim_results` for a top action recommendation. Skips silent weeks (no views + no leads + no SVI movement). New `GET /api/digest/preview` runs the same aggregator for the authenticated user and returns the rendered subject + HTML.
- **feat(wave28a — preferences UI)** `/workspace/notifications/preferences` gains a "Weekly digest email" toggle alongside the existing categories plus a "Preview my next digest" button linking to `/api/digest/preview`. `POST /api/unsubscribe` now accepts `digest_weekly` as a settable key; `updateEmailPreferences()` type widened accordingly.
- **feat(wave28a — email template)** New pure renderer `lib/digest/email-template.ts` emits inline-CSS HTML + text mirror. Subject: `📊 Your BlockID week — <views> views, <leads> new leads`. Sections: header greeting, views count + top country, leads list with interest chips, SVI card with signed delta, "How to improve your SVI" action block (weakest dim + one CTA), share-link footer, notifications-inbox link, AFSL disclaimer.

### Ops
- **crontab.production**: appended `0 23 * * 0 curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/founder-digest-weekly` (23:00 UTC Sunday = 09:00-10:00 Australia/Sydney depending on DST).
- Migration `20260904_wave28a_founder_digest.sql` is fully additive (new table + `ADD COLUMN IF NOT EXISTS`).

---

## 2026-09-04 — v3.9.8: Investor lead capture + sector benchmarks + notification hub (Wave 27 A–C)

### Features
- **feat(wave27a — investor lead capture)** New table `tbr_leads` (share_token, project_id, investor_name/email/firm/role, interest_level [exploring/warm/ready_to_talk], message, viewer_country). New `POST /api/tbr/[token]/lead` — anon, rate-limited 3/IP/24h, resolves founder from share_token → inserts lead → fire-and-forget Telegram + email notify (subject: "🎯 New investor lead on your BlockID report") via reused `sendTelegram()` in `web/src/lib/telegram.ts` + `sendEmail()`. New client `<TbrLeadModal>` slide-in modal that appears after 30s dwell on `/tbr/[token]` (skipped when `document.hidden`, dismissal persists to `localStorage`). Founder-side `GET /api/svi/report/leads?projectId=<pid>` returns leads list. "Investor Leads" section rendered in TBR only when `shareToken && !pdfMode && authenticated && total_leads > 0`.
- **feat(wave27b — sector benchmarks)** New table `svi_sector_benchmarks` (sector PK, dim_medians/top_quartile/bottom_quartile JSONB, sample_size, updated_at) seeded with 9 sectors (saas/marketplace/fintech/healthtech/climatetech/hardware/consumer/deeptech/default). New sector mapper `web/src/lib/svi/sector-map.ts` normalises free-form industry strings. New cron route `POST /api/cron/refresh-sector-benchmarks` (CRON_SECRET-gated) queries anonymised `svi_snapshots` grouped by sector, computes 25/50/75 percentiles per dim from `dim_results` JSONB, UPSERTs with `sample_size` (skips sectors with <5 samples to avoid noisy medians). New anon `GET /api/svi/benchmarks/[sector]` (cached s-maxage=3600). Cohort Compare in `business-report-client.tsx` now fetches per-sector benchmarks on mount, falls back to seeded defaults on error.
- **feat(wave27c — notification hub)** New table `founder_notifications` (user_id, project_id, kind, payload JSONB, read_at). Notification writers plumbed into 5 hot paths: view-start (throttled 1/token/hour), qa, share, dimensions/stream done, lead. New APIs `GET /api/founder-notifications` (paginated feed + `unread_only` count mode) + `POST /api/founder-notifications/read` (mark by ids OR all). New page `/workspace/notifications` — full inbox with filter chips (all/unread/kind), row action links, mark-all-read. Email preferences moved to `/workspace/notifications/preferences` (linked from header).

### Reused / infrastructure
- Telegram notifier: existing `web/src/lib/telegram.ts` (`sendTelegram()` + `mdEscape()`).
- Email: existing `sendEmail()` (Nodemailer SMTP → Resend fallback).
- Nav catalogue unchanged — tier-nav golden snapshots pass unchanged.

### Deploy notes
- Commit `caa43a24a` (22 files, +1997/-49). Three additive migrations run at boot. `tsc --noEmit`: 0 errors. tier-nav-integration.test.ts: 20/20 pass.
- **Manual step**: add crontab entry for `POST /api/cron/refresh-sector-benchmarks` at ~03:30 UTC. Until then the seeded default rows serve.
- Route `/workspace/notifications` is now the activity feed (was: email prefs). Old-URL bookmarks land on new UI with prominent link to `/workspace/notifications/preferences`.

---

## 2026-09-04 — v3.9.7: Investor engagement + founder retention (Wave 26 A–C)

### Features
- **feat(wave26a — TBR view analytics)** New table `tbr_views (share_token, viewer_ip, viewer_country, viewer_ua, viewer_device, referrer, viewed_at, read_ms, ended_at)`. Two anon beacon endpoints: `POST /api/tbr/[token]/view-start` (called on mount, extracts IP from `x-forwarded-for` + country from Cloudflare `cf-ipcountry` header) and `POST /api/tbr/[token]/view-end` (called on unload/blur with read duration). Founder-side `GET /api/svi/report/views?projectId=<pid>` returns aggregate stats (total views, unique countries, total read time) plus recent 20 anonymised views (country flag + device class only — never raw IP). New "Investor Views" section rendered in the TBR only when `shareToken && !pdfMode && authenticated`.
- **feat(wave26b — AI Q&A chat)** New `POST /api/svi/report/qa`: reader submits a question, server fetches snapshot, constructs a system prompt binding the LLM to only cite dim scores + criterion assessments + valuation + cohort data from that specific report. Rate-limited via in-memory Map (5 per token/hour anon; 20 per user/hour auth) — Redis fallback transparent. Floating chat widget `<TbrQaChat>` mounted on both `/workspace/business-report` and `/tbr/[token]`. Opens a compact panel with 3 suggested questions ("What are my biggest risks?" / "Is this valuation realistic?" / "What should I do this week?"). Hidden in `pdfMode` for print-safety.
- **feat(wave26c — SVI trend dashboard)** New page `/workspace/svi-trend` fetches last 12 snapshots via `GET /api/svi/history/full?projectId=<pid>` and renders: (1) hero with current SVI + 30-day delta pill, (2) full-width SVG line chart of overall SVI over time with area fill, (3) 4-column grid of 8 dim sparklines, (4) delta table (rows=dates, columns=8 dims + overall, cells show score + arrow), (5) "Run new analysis" CTA (enabled if last snapshot > 7 days). Empty state guides first-time users to run analysis. Nav entry "SVI Trend" added to `nav-groups.ts`.

### Privacy
- Founder never sees raw IP addresses of TBR viewers — only country + device class.
- Public `/tbr/[token]` footer discloses view tracking with anonymisation.

### Deploy
- Commit `89c052cb8` (14 files, +1750 lines). Migration `20260904_wave26a_tbr_views.sql` is additive (new table + index). tsc --noEmit: 0 errors.

---

## 2026-09-03 — v3.9.6: Wave 25C — AI overlap + deck cache + peer-5 match + TBR onboarding tour

(Bundled with the previously-committed v3.9.5 Wave 25B changes because the v3.9.5 build was interrupted before publishing.)

### Features (Wave 25C)
- **feat(wave25c1 — AI overlap)** `synthesizeCriteria()` now kicks off as soon as 6 of 8 dimensions complete instead of waiting for all 8. Dims 7 & 8 run concurrently with synthesis, and any material score shift emits a `criterion_addendum` SSE event that the client merges into the persisted state. Wall-clock drops from ~72s → **~57s** (-21%) on the standard AU seed-stage deck.
- **feat(wave25c2 — deck-hash cache)** New migration `20260904_wave25c_deck_cache.sql` adds `svi_deck_cache` (deck_hash TEXT PK + user_id + dim_results + criterion_results + 24h TTL). The stream endpoint hashes incoming `deckText` (SHA-256); on a cache hit within 24h it emits a `cache_hit` event and replays the cached results as `dimension_complete` + `criteria_synthesis` before `done` — **1–3s response** vs 57s cold. Cache write is fire-and-forget.
- **feat(wave25c3 — peer-5 match)** New `GET /api/svi/report/peers?projectId=<pid>` (auth) or `?token=<t>` (public via TBR share). Returns 5 anonymised peer startups sorted by cosine similarity on the 8-dim vector, filtered to same industry+stage bucket with a top-200 candidate pool. Response is a strict whitelist — no startup_name, founder, email, or ABN. Codenames "Startup A"…"E". New "Peer-5 Similarity Match" section rendered in the TBR between Cohort Compare and Methodology.
- **feat(wave25c4 — TBR onboarding tour)** `TbrOnboardingSteps` component added to the pitchdeck-analyze done-state (svi-stream-analysis.tsx). Five-step guided panel: (1) open TBR, (2) share with investor + copy URL, (3) download PDF, (4) email-copy notice, (5) monthly SVI trend link. Per-step click tracked via `trackEvent("tbr_onboard_step_clicked")`; completion persisted to `localStorage["tbr-onboard:<projectId>"]` so panel only shows on first done state per project.

### Deploy notes
- Cumulative bundle picks up Wave 25B commit `9205da11d` (auto-email + sample TBR + Vietnamese) that shipped in the interrupted v3.9.5 build, plus Wave 25C commit `9185f076e`.
- Two additive migrations: `20260904_wave25b_report_email.sql` + `20260904_wave25c_deck_cache.sql`. No ALTER on hot tables — safe rolling.
- New SSE events (`cache_hit`, `criterion_addendum`) are additive; existing clients ignore them via the switch default.

---

## 2026-09-03 — v3.9.5: Auto-email + public sample TBR + Vietnamese localisation (Wave 25B)

### Features
- **feat(wave25b1 — auto-email report)** After the SSE stream emits `done` and criteria synthesis succeeds, the endpoint fires a background task that: mints a share token if none exists, fetches the server-generated PDF via loopback `/api/svi/report/pdf?token=<t>`, and sends an HTML email to the founder (subject: "Your BlockID SVI report — <SviScore>/100 <Band>") with the PDF attached. Uses existing `sendEmail()` from `web/src/lib/email.ts` (Nodemailer SMTP priority 1, Resend fallback). New migration adds `svi_snapshots.report_email_sent_at TIMESTAMPTZ` for idempotency — no duplicate emails on repeat runs.
- **feat(wave25b2 — public sample TBR)** New public page `/sample-business-report` renders a canonical fictional "Corella HR" seed-stage AU SaaS example: SVI 63/100, developing band, full 8-dim + 13-criterion analysis, three-case valuation, cohort compare, methodology. Marketing banner CTA back to `/score`. Added to sitemap (priority 0.9). CTAs added on `/score` and `/startup-index` ("See sample").
- **feat(wave25b3 — Vietnamese TBR)** New i18n table `web/src/lib/i18n/tbr-strings.ts` (EN + VI). `BusinessReportClient` accepts `locale: "en" | "vi"` prop and swaps all shell copy (section titles, TOC labels, band names, methodology paragraphs). Two new route entries: `/vi/workspace/business-report` (authenticated founder view) and `/vi/tbr/[token]` (public share). Header now has EN/VI toggle button that navigates to the sibling route. AI-generated content (verdict/strengths/gaps/next_action) stays in English — model output not translated.

### Refactor
- SSE route endpoint dynamically imports `@/lib/svi/email-report` so the email module is lazy-loaded on first send.

### Deploy
- Commit `9205da11d`. Migration `20260904_wave25b_report_email.sql` runs at boot. Playwright chromium already installed on prod (verified: chromium-1228 + 1234 in `~/.cache/ms-playwright/`).

---

## 2026-09-03 — v3.9.4: TBR persistence + public share link + server PDF export (Wave 25A)

### Features
- **feat(wave25a1 — Supabase persistence)** New migration adds `criterion_results JSONB`, `dim_results JSONB`, and `report_share_token TEXT UNIQUE` columns to `svi_snapshots`. The stream endpoint now UPSERTs full analysis output server-side after criteria synthesis. `/workspace/business-report` fetches from `GET /api/svi/report/[projectId]` as fallback when localStorage is empty — founders no longer lose their 10-page report after the 30-minute localStorage TTL.
- **feat(wave25a2 — public share link)** New `POST /api/svi/report/share` mints a `nanoid(24)` share token (idempotent) and stores it on the snapshot row. New public page `/tbr/[token]` (no auth, no navbar chrome) renders the same 10-page investor memo sourced from the DB row. Founder gets a copy-able URL: `https://blockid.au/tbr/<token>`. "Share with Investor" button added to the TBR header.
- **feat(wave25a3 — server-side PDF export)** New `GET /api/svi/report/pdf?token=<t>` route uses Playwright chromium (already installed, versions 1228/1234 on prod) to render `/tbr/<token>?pdf=1` to A4 PDF with 16/14/14/20mm margins. Returns `application/pdf` with `Content-Disposition: attachment; filename="BlockID-Business-Report.pdf"`. Replaces the client-side `window.print()` with a real download. Graceful 503 fallback if chromium missing.

### Refactor
- `BusinessReportClient` now accepts `initialData`, `shareToken`, `pdfMode` props so it can be reused across the auth'd workspace page and the public `/tbr/[token]` page and PDF snapshot.
- `svi-stream-analysis.tsx` `onDone` signature extended to forward criterion + dim results into the DB persistence layer.

### Deploy
- Release includes commit `0105fa198` (Wave 25A). Playwright chromium already on prod; no extra install needed. Migration `20260903_wave25a_tbr_persistence.sql` runs at boot.

---

## 2026-09-03 — v3.9.3: Full 13-Criteria Analyst Report + 10-page Business Report (Wave 24 A–F)

### Features
- **feat(wave24a — criteria synthesis)** After all 8 SVI dimension analyses complete, the stream endpoint now runs a single batched AI call (`synthesizeCriteria()`) that receives all dim results + all 13 criterion definitions and outputs per-criterion assessments: score/100, 2–3 sentence evidence-grounded verdict, 2 strengths (citing deck fragments), 2 gaps (specific missing signals), and 1 concrete next-week action. Falls back to deterministic score derivation if the AI call fails — no report breakage.
- **feat(wave24b — criteria SSE events)** Two new SSE event types: `criteria_synthesis_start` (signals spinner) and `criteria_synthesis` (delivers the 13-item array). Both are handled in `svi-stream-analysis.tsx`, persisted to localStorage alongside `criterionStates[]` and `stage`, and available to `/workspace/business-report` without a re-run.
- **feat(wave24c — 13-criteria section in TBR)** `/workspace/business-report` now includes a "Full 13-Criteria Analyst Assessment" section with 13 detailed criterion cards: Idea & Innovation, Market Opportunity, Founder Profile, Code & Git, Website & Digital Presence, Team Composition, Customer Base & Traction, Go-to-Market Strategy, Key Documents, Data Room, Team Structure & Governance, Product Roadmap, Revenue & Unit Economics. Each card shows score/100, verdict, strengths panel (green), gaps panel (red), and next action (brand). Fallback CTA shown when synthesis cache is empty.
- **feat(wave24d — cohort compare section)** New "Cohort Comparison" table in the report: all 8 SVI dimensions side-by-side against AU seed-stage median + top-quartile benchmarks (BlockID cohort + PitchBook AU 2024–2026). Delta vs median shown per row in green/red. Footer cites data sources and notes industry/stage context.
- **feat(wave24e — methodology appendix)** New "Methodology & Appendix" section: SVI scoring explanation (0–100, 8 dims, what bands mean), 8 dimension definitions with % weights, 13 criteria overview, valuation method explanations (Berkus/Scorecard/Comparable/DCF), AI chain disclosure (Groq/SambaNova/Cerebras/Claude), report usage notice.
- **feat(wave24f — full report CTA on /score)** Results panel now shows a prominent "Full 10-Page Analyst Report" CTA (brand-outlined card with FileText icon, links to `/workspace/business-report`) above the existing Public Trust Report card. Visible immediately after score calculation.

### Report structure (≥10 pages)
`/workspace/business-report` now renders: (1) Executive Summary, (2) SVI Weighted Score Breakdown, (3) Directional Pre-Money Valuation, (4–11) 8 Dimension Analysis, (12) Full 13-Criteria Analyst Assessment, (13) Risk Register, (14) Improvement Roadmap, (15) Cohort Comparison, (16) Methodology & Appendix — totalling **16 named sections across ≥10 pages of investor-grade content**.

### Deploy
- Commit `655d6930d` + `score-form` CTA follow-up — deployed via `bash web/scripts/deploy-live.sh` (11/11 gates).

---

## 2026-09-03 — v3.9.2: Analyst-desk streaming + Trusted Business Report (Wave 23 A–E shipped)

### Features
- **feat(wave23a — running SVI hero)** During the `/workspace/pitchdeck-analyze` SSE stream, a "Business SVI" hero above the fold now counts up dimension-by-dimension as each score lands. Weighted running total (uses the same 8-dim weights as the final composite) with a smooth animated count-up + pulse on each tick — founders see the score materialise instead of a blank spinner.
- **feat(wave23b — valuation method selector)** New method selector directly in the streaming panel: **Berkus** (pre-revenue $0–2.5M cap), **Scorecard** (angel median × factor), **Comparable** (AU seed/A comps), **DCF** (10-yr FCF + terminal). Chosen method + its rationale is disclosed and applied to the three-case pre-money cards in the done state — no more black-box formula.
- **feat(wave23c — AU market benchmark per dim)** Each SSE `dim_done` event now carries an AU cohort benchmark (median + top-quartile) sourced from the anonymised `/api/index/svi?bucket=sector` aggregate. Founders see e.g. "Team 68 vs SaaS median 61 (top 34%)" inline, per dimension, as it streams.
- **feat(wave23d — Trusted Business Report)** New page `/workspace/business-report` and workspace nav entry ("Business Report (TBR)"). Single-page investor memo composed from the latest SVI snapshot + evidence completeness + valuation cards + cohort compare — one link founders can send investors instead of shipping a raw dashboard.
- **feat(wave23e — analyst persona + decision log)** During the stream, a persona banner ("Reviewed by BlockID Analyst Desk — AU seed-stage panel") plus a live decision log ("Applied Berkus cap because pre-revenue signal detected", "Down-weighted Team on missing-founder-bio evidence") is rendered under the hero. Turns the SSE from a progress bar into an audit trail investors can cite.

### Deploy
- **release** Gzmc35fHoY8FWSrjYcDRx (sha 4eebcd8f) — 11/11 gates via `bash web/scripts/deploy-live.sh`. Post-deploy hydrated Playwright smoke: 11/11. Cloudflare + nginx caches purged.
- **404-sweep** Post-deploy full crawl of 282 blockid.au routes + 22 startupvalueindex.com routes: **0 404s, 0 5xx, 0 auth-redirect chain failures**. All routes return 200 (via `curl -L`).

---

## 2026-09-03 — v3.9.1: Pitchdeck valuation flow + evidence-grounded scoring (Waves 11-18 shipped)

### Features
- **feat(pitchdeck-w11)** New founder route `/workspace/pitchdeck-analyze`: drag-drop PDF/DOCX upload (or paste text) → AI classifies coverage across all 8 SVI dimensions (`strong` / `partial` / `missing`) → per-cell selection with credit gating (strong+partial free, missing = 0.50-1.00 cr each). New DB table `pitchdeck_analyses` + `POST /api/pitchdeck/classify` + `POST /api/pitchdeck/analyze`.
- **feat(commerce-w12)** Commerce polish on the flow: credit balance chip in header (linked to `/workspace/billing`), drag-drop upload dropzone with drag-over feedback, "Try a sample deck" one-click pastes a canned AU seed pitch, bulk selection controls (select all 8 / free-only / clear), inline speculative-cost tally with balance comparison, dedicated insufficient-credits panel with direct Billing CTA on `HTTP 402`.
- **feat(snapshot-w13)** `POST /api/pitchdeck/save-snapshot` writes a `svi_snapshots` row when the streaming `done` event lands. Repeat-visit score-delta banner (Wave 10a) reads from here — founders now see "Up +7 from your last stored SVI" on subsequent runs.
- **feat(ux-w14)** Progressive-value UX: 3-step breadcrumb ("Upload deck → Pick dimensions → Analyse & score"), post-classify value-teaser card ("X strong · Y partial · Z missing. Baseline SVI on the free dims alone ≈ NN/100"), investor-ready gap nudge in done state.
- **feat(criteria-w15)** Sequential SSE mode (300 ms breather per dim) + prompts now carry the 13 canonical investor criteria from `lib/evaluation-criteria` (idea, market, team, product, revenue, cap table, legal, moat…) bound to each SVI dimension. No more parallel rate-limit bursts on Cerebras/Groq; deeper per-dim reasoning.
- **feat(valuation-w16)** Three-case pre-money valuation cards (worst / average / best AUD) in the done state. Client-side deterministic formula: stage-anchored base × sector adjust × SVI curve × case spread. Each card renders as a ±20 % band (e.g. "A$3.2 M – A$4.8 M") so it reads like a VC quote.
- **feat(evidence-w17)** Evidence-grounded per-dim scoring: strict system prompt requires every strength/gap to quote a deck fragment (≤15 words) or explicitly say "not in deck", forbids fabricating numbers, defaults to 30-45 when the deck is silent on a dimension. Deck excerpt embedded in-prompt with triple-quote fence.
- **feat(eta-w18)** Pre-run ETA ("Estimated total ~72s (~8s per dimension)"), during-run rolling countdown ("~24s remaining · 40s elapsed"), and browser Notification opt-in checkbox — analysis fires a native notification if the tab is not focused when it completes.
- **feat(sample-svi-card)** `/index` (Startup Index landing) now shows a "Sample SVI report" card between the Stage indices and the gradient CTA — realistic 63/100 developing-band example so first-time founders can preview the whole flow before signing up.
- **feat(cohort-compare)** Done state adds "Your SVI 63 vs SaaS median 58 — top 42% of 24 peers" using the anonymised `/api/index/svi?bucket=sector` aggregate; falls back to platform-wide comparison when the founder's industry isn't known.
- **feat(deep-link-fix)** `/workspace/svi-evidence?dim=<key>` deep-link now scrolls + focuses the matching completeness card in the heatmap (previously silently landed at the page top).

### Bugfixes
- **fix(score-redirect)** `/score` was 301-redirecting to `/index` because of a leftover consolidation entry in `next.config.ts` — this shadowed the real ScoreForm and dropped every "Get your real SVI" CTA on the marketing exchange page. Redirect removed; `/score` now serves the analyser form.
- **fix(csp-fonts)** `startupvalueindex.com` CSP (nonce-based, promoted from Report-Only) was silently blocking `fonts.googleapis.com` + `fonts.gstatic.com` — site rendered with fallback fonts. Both hosts added to `style-src` + `font-src`. `[csp-report]` violations dropped to zero post-fix.
- **fix(agent-guard)** Deploy-live `Gate 2.5` self-heal expanded from `cro-conversion.ts` alone to the full 8 C-suite domain modules (cro, ciso, cfo, cmo, cto, clo, chro, cdo) after `ciso-security.ts` was overwritten by the same auto-improve pipeline that hit `cro-conversion.ts` earlier. `FROZEN_AGENTS` set now covers all 8 domains.
- **fix(status-redaction)** `/api/status` no longer leaks `sha`, `release_id`, `disk_pct`, `mem_pct`, or the full cron catalogue to unauthenticated callers. Full telemetry gated behind `Bearer STATUS_FULL_TOKEN` (or `CRON_SECRET` fallback).
- **fix(anvil-leak)** Cleaned 138 GB of leaked Anvil state (`/home/dovanlong/.foundry/anvil/tmp/…`) after an old `anvil` PID without `--prune-history` had been running for a month. Root filesystem 71 % → 18 %.

### Security
- **security(csp-nonce)** `startupvalueindex.com` CSP promoted from Report-Only to enforcing after a 24 h monitor window recorded zero violations. Nonce-based `strict-dynamic`, no more `unsafe-inline` / `unsafe-eval`. New `POST /api/csp-report` endpoint accepts both legacy and Reporting API v1 payloads and journal-logs each violation for future drift telemetry.
- **security(cookie)** `svi_locale` cookie is now `HttpOnly; Secure; SameSite=lax` (was JS-readable). Client-side `document.cookie` write dropped; middleware re-derives the locale from the URL path on every navigation.

### Deploy
- Multiple `11/11` gate deploys through `bash web/scripts/deploy-live.sh`. Latest release id shown in `/api/status.last_deploy` (public payload redacts SHA — use `STATUS_FULL_TOKEN` for the full manifest).

---

## 2026-08-16 — v3.6.3: CRO/CDO/CPO/CTO feature sprint (5 tasks shipped)

### Features
- **feat(cdo-t1009)** Wire 5 dark analytics events into server paths: `svi_score_computed` (after SVI INSERT), `checkout_completed` + `trial_activated` (Stripe webhook), `feature_gate_hit` (typed `emitEvent()` in `can()`), `investor_pack_generated` (type-registered). `/api/cron/bq-export` already wired — no changes needed. 84/84 analytics tests pass.
- **feat(cro-t1020)** Upgrade trigger pipeline: `shouldFire()` wired into `can()` entitlement gate + lifecycle mailer cron. New `GET /api/conversion/pending-trigger` read-path for client modal. Founders hitting paywalls now receive upgrade nudges.
- **feat(cro-t1301)** Submit-Your-Startup: `/submit` public marketing form + `POST /api/index/submit` (Zod + IP rate-limit + `public_index_submissions` table + Telegram alert). "Startup Index" + "Submit startup" CTA added to nav. 13/13 tests.
- **feat(cpo-t1203)** Investor Pack v2 one-click PDF: `POST /api/investor-pack/one-click` assembles SVI + cap table + founder profile → PDF → share token in `investor_pack_shares`. `GET /api/investor-pack/download/[shareId]` serves PDF with 30-day expiry. Workspace tile updated with live SVI grade + share link display. Migration `20260816140000_investor_pack_shares.sql`. 3/3 tests.
- **feat(cto-t1101)** Nightly C-Level quality gate full ship: `nightly-clevel-review.mjs` rewrote from stub to production mode — git diff 24h → 6 parallel C-Level agent reviews → RED/YELLOW/GREEN digest → Telegram. Date-based report filenames, 7-report retention per role. Cron route updated to non-blocking spawn. First run: 7 reports generated (144 files reviewed). Crontab at 04:30 UTC already scheduled.
- **fix(404-500)** 3 dead links (`/agents`, `/login`, `/legal/mentor-access-policy`) + 2 server errors (`/index/listings` InvariantError via segment rename + rewrites, `/startup/[slug]` DYNAMIC_SERVER_USAGE via `force-dynamic`).

### Deploy
- Deployed: **2026-08-16** — see manifest for SHA + timestamp.

---

## 2026-08-16 — v3.6.2: Reseller M3 (Stripe attribution) + SVI dimension chart + startup-package tour

### Features
- **feat(reseller M3)** Stripe checkout attribution + `reseller_commissions` ledger (20% ex-GST).
  - New migration `20260816120000_checkout_session_reseller_commissions.sql` — checkout-session-keyed commission rows (avoids conflict with invoice-event table from migration 0094).
  - `lib/reseller/checkout-commission.ts` → `recordResellerCommission()`: idempotent upsert on `stripe_session_id`, commission = `round(gross/1.1*0.2)`.
  - Wired into `api/stripe/webhook/route.ts` `checkout.session.completed` handler after plan activation; fires when `session.metadata` carries `reseller_id` + `reseller_code`.
  - Test coverage: `checkout-commission.test.ts` validates 14900 → 2709 and edge cases.
- **feat(dashboard)** SVI dimension bar chart — visual breakdown of the 8 scoring dimensions with AU benchmark overlay.
- **feat(startup-package)** Register feature tour (sub-goal 11) + mark Ship 1 as recently landed in roadmap.

### Deploy
- Deployed: **2026-08-16** — see manifest for exact timestamp + SHA.

---

## 2026-08-16 — v3.6.1: Build fixes + 7x 404 page fixes (deployed live)

### Build fixes
- **fix** `next.config.ts`: added `@remotion/renderer`, `@remotion/bundler`, `@remotion/compositor-linux-x64-gnu`, `@rspack/binding`, `@rspack/core`, `esbuild` to `serverExternalPackages` — webpack was crashing on native `.node` binaries from Remotion pitch-video route.
- **fix** `marketing-footer.tsx`: replaced `node:fs` + `readFileSync` with static `import versionData from "version.json"` — eliminates "fs not found" crash when the footer is bundled into a client component tree.

### 404 pages resolved (7 total)
- `/register` → 301 redirect to `/signup`
- `/legal` → legal docs index page (Terms / Privacy / Disclaimers cards)
- `/how-it-works` → HowItWorksSection + SVI explainer page
- `/reports/samples` → 301 redirect to `/guide/reports`
- `/guide` → chapter index grid (11 guide sections)
- `/solutions` → persona card index (Founders / Investors / Advisors / Accelerators)
- `/index/listings` → fail-soft wrapper (graceful 500 → Explore CTA)

### Test suite (v3.6.0 fixes, gate-blocking)
- **fix** `cmo-market-research.ts`: `AU_MARKET_DATA` canonical 7-key object; `generateGtmStrategy` + `generateCompetitorAnalysis` + `generatePricingTiers` made async with `callAI` + deterministic fallbacks
- **fix** `cdo-data-quality.ts`: restored original `assessAnalyticsMaturity` capability-object signature + `AI_GOVERNANCE_CHECKLIST` export
- **fix** `competitors/ai-fill` route test: updated mock to support `.order().limit().maybeSingle()` chain
- **fix** tier-nav golden snapshots: updated with "Code & Web Analyzer" nav item
- Result: **27,533 tests pass, 0 failures**

### Deploy
- Deployed: **2026-08-16 03:09 UTC** — 11/11 CI gates passed (Playwright hydrated smoke ✅)
- Git SHA: `45e17b830` | Release: `y3VWxpZaC2WG-MlBjy_YG`

---

## 2026-08-15 — v3.6.0: CAPITAL Funding Readiness scorecard + CDO data-quality benchmarks

### New feature: CAPITAL investor readiness scorecard (`/dashboard/fundraise`)
- **feat** `components/fundraise/capital-score-card.tsx` (new): interactive CAPITAL framework scorer with arc gauge, 6-pillar bar breakdown (Traction / Team / Governance / Data Room / Investor Materials / Stage Fit), priority action cards (P1/P2/P3), weakest-pillar callout. All inputs in a compact single-page form — MRR, active users, MoM growth, team strength, ESOP pool %, data room %, checklists.
- **feat** `dashboard/fundraise/page.tsx`: CapitalScoreCard inserted above the existing AU checklist. Page now shows CAPITAL framework score + AU checklist + comparable raises in one scroll.
- **feat** Arc gauge with glow shadow effect; verdict badge (Investor Ready / Near Ready / Warming Up / Not Ready); each action shows expected point lift and effort level.
- **chore** `fundraising-readiness-client.tsx`: removed duplicate h1/subtitle (now owned by the page server component).

### CDO enhancement
- **feat** `cdo-data-quality.ts`: `BenchmarkComparison` interface added — `marketAverage`, `percentile`, `gap`, `region` (Global / Australia); enhanced with 2024 AU market benchmark data.

### Ops
- 15 C-Level daily reports for 2026-08-15 committed (auto-generated by overnight cron pipeline).

---

## 2026-08-15 — v3.5.0: Code & Website Analyzer — PTD sub-score + valuation adjuster

---

## 2026-08-15 — v3.4.0: Visual upgrade (dashboard/email/PDF) + auth UX + Stripe credits fix

### Auth UX — cross-tab session sync
- **feat** Login page (`/auth/login`) is now a server component: shows "Already signed in" card with avatar, plan badge, and "Continue to Dashboard" CTA when a session cookie is present — no more re-prompting logged-in users.
- **feat** `LogoutButton` client component — broadcasts `SIGNED_OUT` to all open tabs via BroadcastChannel before POSTing `/api/auth/logout`. Replaced all 5 plain `<form action="/api/auth/logout">` buttons (navbar desktop/mobile, workspace-layout, admin-layout, admin/rnd).
- **feat** `broadcastAuthEvent()` utility added to `auth-sync-logic.ts` — called after Google sign-in and email/password sign-in so peer tabs call `router.refresh()` immediately.
- **feat** `AuthSyncClient` detects `?logged_in=true` (appended by magic-link verify route) and broadcasts `SIGNED_IN` so other tabs update without a reload.
- **fix** Login form client-side guard: fetches `/api/auth/me` on mount and redirects if already signed in (catches edge cases where cookie was fresh at SSR time).

### Dashboard — visual redesign
- **feat** `health-score-widget.tsx` fully rewritten: 2-column layout, glowing arc gauge, startup valuation estimate from SVI score, colour-coded priority action cards (cyan/green/amber), Share Score CTA.
- **feat** `value-impact-banner.tsx` (new): "BlockID Value Delivered" banner — SVI score delta, estimated valuation gain (AUD), investor readiness %, and milestones completed. Wired into `dashboard/page.tsx` after `ScnPositionHero`.

### Email templates — brand redesign
- **feat** `emails/lifecycle/render.ts` fully rewritten with BlockID navy (#0B0F2A) header, 3-stat table grid, SVI progress bars, value-focused copy, and consistent brand palette across all 7 lifecycle steps (day0/3/5/6/7/14 + winback).
- **feat** `sendSVIReport` in `email.ts`: added 8-dimension bar chart (table-based for Outlook) + 3-stat summary grid (SVI / Est. Value / Stage).

### PDF report — cover page upgrade
- **feat** `svi-report-pdf.tsx` cover page: 3-stat row (Est. Value range / Cohort Rank / Confidence score) inserted above the tagline.

### Stripe / Credits fixes
- **fix** `credit-reset/route.ts`: replaced raw `credit_transactions` batch insert (left `credit_balances` stale) with `grantCredits()` — monthly refills are now immediately spendable.
- **feat** `stripe-pricing-audit.ts`: v2 SKU rows auto-derived from `GENERATED_PLANS`; legacy plans (founding50/growth/growth_annual) remain canonical.
- **chore** `0305_legacy_plans_seed.sql`: seeds growth/growth_annual/founding50 into plans table (idempotent `on conflict do nothing`).

---

## 2026-08-15 — v3.5.0: Code & Website Analyzer — PTD sub-score + valuation adjuster

### New feature: `/dashboard/analyzer`
- **feat** `lib/analyzer/github.ts` — deterministic GitHub signal collector (commits/month, contributors, stars, tests, CI, license, README). No LLM calls — pure HTTP + REST v3.
- **feat** `lib/analyzer/website.ts` — website signal collector (HTTPS, TTFB, Lighthouse perf/SEO/a11y via PSI or heuristic fallback, sitemap, robots, meta tags).
- **feat** `lib/analyzer/score.ts` — pure scoring engine: GitHub side 8 weighted signals, website side 8 weighted signals; combined PTD sub-score 0–100; valuation adjuster −10/0/+5/+12%.
- **feat** `lib/analyzer/svi-adjustments.ts` — hooks sub-score into SVI PTD dimension.
- **feat** `api/analyzer/run` — POST endpoint (auth required, 5/hr rate limit); parallel signal collection, persist to `analyzer_runs` table, fail-soft if DB unavailable.
- **feat** `dashboard/analyzer/page.tsx` + `analyzer-form.tsx` — full-page UI: startup selector, GitHub + website URL inputs, visual results panel with arc gauge, side-by-side bar chart, valuation adjuster badge, strengths/gaps list (icons + colour-coded).
- **feat** `supabase/migrations/20260815120000_analyzer_runs.sql` — `analyzer_runs` table (startup_id scoped, RLS policies). Applied to production DB.
- **feat** `nav-groups.ts` — "Code & Web Analyzer" added to Build → Strategy section (beta badge).
- **docs** `docs/analyzer/CODE_WEBSITE_ANALYZER.md` — full design spec.

---

## 2026-08-07 — v3.3.4: Clean-code P2B + security hardening + SEO

### Security
- **fix(P0)** `/api/admin/users/manage` + `/api/admin/users/[id]/plan` now refuse `founding50` grants post-cutover (2026-09-01) — admin backdoor fully closed.
- **fix(P1)** `/api/svi-accounts` default plan changed from `"founding50"` to `"free"` — new SVI accounts no longer silently inherit the promo plan after cutover.
- **fix(security)** Removed 4 PII-leaking `console.log` calls in nps, testimonial, rnd, and data-room routes.

### Clean Code
- **feat** Founding 100 promo auto-cutover (`FOUNDING_PROMO_END = 2026-09-01`) — checkout 410, page redirect, webhook guard, reconcile guard, and guardrail cron all wired end-to-end.
- **refactor(clean-p2b)** 422 `digest-snapshot-per-*` modules moved to `digest-snapshot-per-modules/` subdir — top-level `reseller/` now shows ~12 files.
- **chore(cleanup)** Removed 8 stray `console.log` calls in cron routes; promoted 13 `console.log` → `console.info` for structured log levels.
- **fix(playwright)** Removed `waitForTimeout` calls and hardcoded prod URLs from 3 spec files.

### Testing
- **test** 21,932 vitest cases (was ~20,955) across 826 test files — all green.

### SEO / UX
- **feat(seo)** Added `metadata` to `/showcase`, `/showcase/atlassian`, `/showcase/canva`, `/showcase/xero`, `/showcase/safetyculture`, and `/contact`.
- **feat(nextjs)** Added `loading.tsx` skeletons for `/founding-50` and `/svi`; error boundary for `(app)` segment.

### Docs
- **feat(docs)** `ARCHITECTURE.md` + `TEAM_STRUCTURE.md` with Mermaid diagrams — v4.0 edition.

---

## 2026-08-07 — v3.3.3: Code-review sweep (5 stale-copy fixes + earlier checkout guard)

Post-v3.3.2 code review turned up 5 places the A$5 / 50-credit correction hadn't reached, plus one prod-safety tightening on the checkout guard. All shipped in one patch.

- **copy** `credit-gate.tsx:325` CTA "Get Founding 100 for A$1" → "**A$5**" (stale from the 2026-06-17 A$1 launch).
- **copy** `svi/rnd-page-lock.tsx:38` link button "A$1 (unlimited)" → "**A$5 (50 credits, lifetime)**". The sibling per-page unlock button (`Unlock — A$1`) is a different SKU and stays.
- **copy** `pricing-data.ts:274` (FAQ answer): "one-off A$5 payment for 100 full-page analyses" → **50**.
- **copy** `pricing-data.ts:242` (`COMPARISON_ROWS` SVI row) — founding column "100 (lifetime)" → "**50 (lifetime)**"; matching pin-test at `pricing-data.test.ts:460` realigned.
- **safety** `/api/stripe/checkout` — the HTTP 410 `founding50` guard moved BEFORE `resolvePromoCode()`. Post-cutover requests no longer burn a Supabase promo-code lookup on a doomed checkout.
- **hygiene** `cron/stripe-reconcile/route.ts:11` doc comment updated to reference `PLAN_CREDITS.founding50.amount` instead of a hard-coded "100 credits" — avoids the same drift recurring.
- **tests** 20,175 / 20,175 vitest tests green. `tsc --noEmit` clean.

Flagged for a follow-up ticket (NOT fixed in this release):
- **loop pollution** — `web/src/lib/reseller/digest-snapshot-per-*.ts`: 396 near-identical auto-generated files from the PTSNGM / PT*NNM dispersion loop. Recommend a consolidation pass.

## 2026-08-07 — v3.3.2: Founding 100 auto-cutover (2026-09-01) + full-site copy sweep

- **cutover** New helper `lib/founding-promo.ts` — `isFoundingPromoActive()` hard-gated to `2026-09-01T00:00:00Z`. Deliberately hard-coded (not in `platform_config`) so a Supabase outage cannot accidentally re-open the promo window.
- **cutover** `/founding-50` landing page — server-side `redirect("/pricing")` after the promo window closes.
- **cutover** `POST /api/stripe/checkout` — refuses `planId=founding50` with HTTP 410 + `"The Founding 100 A$5 promo ended on 2026-08-31. Please select the Growth plan (A$99/mo)."` after cutover.
- **cutover** `tiersForNewSignup(tiers, now)` in `pricing-data.ts` — drops `founding50` from every new-signup pricing surface once the promo ends. Grandfathered Founding 100 buyers keep their access (they're on the legacy plan).
- **copy** Site-wide sweep of the Founding 100 offer copy — A$1 / 100 credits stale references replaced with A$5 / 50 credits across: `investors/page.tsx`, `credit-gate.tsx`, `upgrade-prompt.tsx`, `svi/svi-entrance.tsx` (card + paywall option C), `api/cron/onboarding-sequence/route.ts` (subject + body + CTA), `pdf/pitch-deck-pdf.tsx`, `remotion/scripts/pitch-3min.ts`, `remotion/compositions/PitchAntler.tsx`, `remotion/compositions/PitchVideo3Min.tsx`.
- **stripe** No Stripe API mutation required — `STRIPE_PRICE_FOUNDING50` already points at the A$5 price and `STRIPE_PRICE_GROWTH` at A$99/mo. Cutover is handled entirely in the code path.
- **tests** 6 new tests for `founding-promo` (edge cases: −1s active, exact tick inactive, +1h inactive). Fixed pre-existing TS strict errors in `api/lead/route.test.ts` (`insertMock` signature + 8 `as unknown as` casts).

## 2026-08-07 — v3.3.1: Founding 100 pricing correction (A$5 / 50 credits until Aug 31, then A$99)

- **pricing** Founding 100 credit grant lowered from **100 → 50** in the three sources of truth: `platform-config.ts` (`founding_credits: 50`), `credits.ts` (`PLAN_CREDITS.founding50.amount = 50`), and `plans.ts` (`DEFAULT_FOUNDING_CREDITS = 50`).
- **pricing** Founding 100 tier subtitle + urgency copy rewritten across the static `PRICING_TIERS` and the config-driven `applyPlatformConfigToPricing()` helper: "A$5 until Aug 31, 2026 · reverts to A$99 · lifetime access" (subtitle) + "A$5 promo until Aug 31, 2026 — then A$99" (urgency on the static row; helper keeps spots-based urgency for admin overrides).
- **pricing** Feature list updated: "50 SVI analyses (lifetime)" (was 100 — aligned to the reduced credit grant).
- **email** Founder Day-7 nurture email subject rewritten: "50 credits for A$5 — here's what Founding 100 members get".
- **tests** `platform-config.test.ts`, `pricing-data.test.ts`, `plans.test.ts`, and `email.test.ts` realigned to the new 50-credit constant — 235/235 pass.
- **note** The A$5 promo is time-boxed to 2026-08-31; standard pricing after that date is A$99 (admin can flip the constant via `/admin/config` when the promo window closes).

## 2026-08-07 — v3.3.0: Team refresh, expanded early-bird, redirects

- **team** About page team card refreshed to reflect the full 11-member C-Level AI agent roster (CTO, CFO, CPO, CMO, CRO, CLO, CHRO, CISO, CDO, COO + Customer Success lead) — was hard-coded at 8.
- **pricing** Early-bird deadline extended to Dec 31, 2026 in the Growth monthly + annual tier urgency copy (the 2026-08-01 date had already expired; `platform-config.ts` default is admin-overridable via `/admin/config`).
- **routing** `/founding-100` now permanently redirects to `/founding-50` — matches the trademarked Founding 100 offer at A$5 lifetime.
- **routing** `/login` → `/auth/login` temporary redirect fixes the 404 on the common short URL.
- **version** Version history page + `project-state.json` pinned to `3.3.0` (project-state was drifted at `3.1.0`).
- **release-notes** Version history entry for 3.3.0 added to `/version` page under `VERSION_HISTORY`.

## 2026-07-31 — v3.0 upgrade: Verified Business Identity foundation

BlockID v3.0 lands the first-half of the Master Upgrade Plan (`h-y-k-t-h-p-n-ng-hazy-sutton.md`) — six phases across paywall, verified identity surface, verification ladder, evidence pipeline, AI orchestration, programme+marketplace, and the Unicorn framework. Approx. 40 feature commits from ten parallel agents.

- **Report paywall** — A$5.50 inc-GST one-off or 200 credits, 9-state lifecycle (`0270_report_orders`), confirm-before-charge modal, Stripe webhook + reconciliation, and a 2-minute worker cron draining the generation queue (`0272_report_generation_queue`).
- **Verified Business ID surface** — public SEO-indexable `/id/[slug]` profile (migration `0273`) with PII whitelist, JSON-LD, and `/embed/badge` SVG widget for external sites.
- **5-level verification ladder + ABR adapter** — `POST /api/verification/abr` with JSONP + Zod normalisation and a verification-level engine backed by the `0202_business_profile` view.
- **Evidence pipeline with versioning + extraction** — migrations `0210_evidence` / `0211_evidence_versions` / `0212_evidence_extractions`, hash-verify, state-machine transitions.
- **AI orchestration** — prompt registry with `0230_prompt_versions` + `0231_ai_runs`, canonical Zod output contracts, canary→prod prompt swap, and a `callStructured` wrapper for typed LLM outputs.
- **Consent-based sharing + revocation** — `0250_consents` + `consent_state_events` + `0251_share_packages` + `0252_revocations` (BCR-004) enforced by middleware on every read path.
- **Programme + marketplace + partner API** — `0290_programme_cohorts` + `0291_marketplace_opportunities` + `0292_oauth2_partners` with `verifyPartnerBearer` guarding `GET /api/v1/id/[slug]`.
- **Unicorn framework S0-S5** — migration `0280_unicorn_stages`, framework + goals decomposition libs, `<UnicornPathDashboard/>` server component, 2 nightly crons.
- **Reseller promo codes (IFV / DVL prefixes)** — schema extension, seed script, and `resolvePromoCode` runtime helper landed (Agent K). Roster view + `?ref=` first-touch capture + signup validate endpoint also landed (Agents L / M); dashboard page + Stripe checkout attribution still in flight.
- **HeroV3 + PersonaRail + JourneySidebar** — "One Business. One Trusted Identity." locked v3 messaging behind `NEXT_PUBLIC_UPGRADE_V3`, six personas across eight journey groups, SSO-aware CTA via cookie hint.

Master plan: `/home/dovanlong/.claude/plans/h-y-k-t-h-p-n-ng-hazy-sutton.md`.

## 2026-07-25 — Startup Package (Ship 1)

- **startup-package** New guided founder journey — A$149 one-off unlock (+ 25 pre-loaded credits), 8-step interview auto-fed to CEO/CMO/CFO/CTO agents, day-0 dataroom seed, public `/startup/[slug]` listing, phase-aware weekly progress emails.
- **startup-package** Public `/docs/startup-package` guide covering the 5-step overview, pricing, the 8-step interview timeline, the 12-phase journey binding, and the 14-task unicorn playbook derived from the Atlassian / Canva / Xero / Airwallex / Culture Amp fixtures.
- **workspace/nav** New "Get Investor-Ready" cluster under the "Now" pillar for the founder segment linking to `/startup-package` (feature-gated on `startup_package`, `beta` lifecycle).

## Unreleased — 2026-07-24

### Features

- **reseller** P11.48 cron wiring for per-reseller |pct| spotlight (`0495bc4`)
- **exits** P11-acquisition-wizard pure helper — 90/10 deal-shape checker (`8349353`)
- **reseller** P11.47 per-reseller pct-change spotlight grouped per reseller (`37ed814`)
- **reseller** P11.46 wire per-reseller pct-change coverage into weekly digest cron (`958958f`)
- **atlassian-goal** P11-acquisition-pattern Chapter 11 section (`875e6a0`)
- **reseller** P11.45 per-reseller pct-change coverage pure lib (`1d4da77`)
- **reseller** P11.44 wire per-metric pct-change coverage into weekly digest cron (`4003c39`)
- **atlassian-goal** P10-s708counter-adapter share-register→S708OfferEvent normaliser (`6d758a3`)
- **reseller** P11.43 per-metric pct-change coverage summary pure lib (`e299f24`)
- **atlassian-goal** P12b-tile /dashboard/exit-readiness founder tile (`87a1441`)
- **reseller** P11.42 wire per-metric pct-change coverage spotlight into weekly digest (`8c32ed6`)
- **compliance** P1n-s708-form founder-facing s708(1) small-scale counter form (`334b716`)
- **compliance** P1n-gst-form founder-facing GST threshold form (`c832dd0`)
- **reseller** P11.40 wire per-(reseller × metric) pct-change drill-down into weekly digest cron (`895969c`)
- **reseller** P11.39 per-(reseller × metric) pct-change drill-down of P11.37 portfolio pct-change (`81e0472`)
- **compliance** P1n-esic-route /compliance/{esic,s708,gst,rd} deep-link pages (`aa11769`)
- **compliance** P10-s708counter s708(1) small-scale personal-offer counter (`0110952`)
- **reseller** P11.38 wire metric pct-change delta into weekly digest cron (`02e6bd8`)
- **reseller** P11.37 metric percent-change delta pure lib (`5a68161`)
- **investor-pack** P5-cohort-wire traction cohort section (`4459a6e`)
- **reseller** P11.36 register contribution_margin_pct in snapshot registry (`1354909`)
- **reseller** P11.35 contribution_margin_pct cron wiring (`ce1586d`)
- **guide** Ch8 ShipIt + Pledge 1% culture callouts (P8-shipit + P8-pledge1) (`ec04c75`)
- **reseller** P11.34 contribution_margin_pct digest section (pure lib) (`f4c1d5c`)
- **reseller** P11.33 cron-wire per-reseller direction-streaks into weekly digest (`b6062b2`)
- **market** P3b /api/abs/lookup route wrapper (`ac77cc5`)
- **reseller** P11.32 per-reseller sustained-direction streak detector (`9265125`)
- **market** P3a AU industry-size ANZSIC lookup module (`528f956`)
- **reseller** P11.31 digest snapshot direction-streaks cron wiring (`2b1b3c4`)
- **reseller** P11.30 digest snapshot direction-streak detector (`501fff1`)
- **compliance** P1n-form WGEA + Modern Slavery detail-page forms (`e31c002`)
- **traction** P5-cohort cohort retention chart auto-draw component (`d848c7a`)
- **reseller** P11.29 cron-wire top-movers-per-reseller into weekly digest (`583dfb6`)
- **atlassian** P12b-cfo wire AU exit benchmark into CFO valuation (`37613d1`)
- **reseller** P11.28 pure-lib top-movers-per-reseller (`2e4cf6f`)
- **atlassian** P12b wire AU exit benchmark into ch09+ investor pack (`5d4af69`)
- **reseller** P11.27 top-movers-per-metric cron wiring (`6d05016`)
- **reseller** P11.26 top-mover per metric pure lib (`eaced53`)
- **atlassian** P12a AU comparable-exits data source (`adf61d9`)
- **reseller** P11.25 top-N movers cron wiring (`1ed2507`)
- **phase-2** P2b mint AU Customer Discovery Interview Log template (`a4d823d`)
- **reseller** P11.24 top-N movers headline pure lib (`efb39cd`)
- **reseller** P11.23 per-reseller rolling trend cron wiring (`76a1350`)
- **atlassian-goal** P2a AU Customer Letter of Intent template (`db95649`)
- **atlassian-goal** P6a-ir-pack ship-marker — Div 83A tests wired into ch09 pack (`c55a19f`)
- **reseller** P11.22 per-reseller rolling N-week trend pure lib (`f1689a0`)
- **reseller** P11.21 wire rolling-N-week trend into weekly digest cron (`c29350c`)
- **atlassian-goal** P6b-test wholesale-only fundraise gate helpers + vitest (`bd42ee5`)
- **reseller** P11.20 digest snapshot rolling N-week trend (`ba53993`)
- **atlassian-goal** P5b mount InvestorReadinessTile on /dashboard/svi (`31aaaf0`)
- **reseller** P11.19 digest snapshot history walker (`bf0b411`)
- **atlassian-goal** P7a founder-side weekly digest cron (`49d4863`)
- **orchestrator** platform auto-upgrade 2026-07-24 (`a02a9b6`)
- **reseller** P11.18 wire per-reseller metric delta into weekly digest cron — 963/963 (`36bcb8a`)
- **reseller** P11.17 per-reseller headline-metric delta drill-down — 963/963 (`f65977c`)
- **atlassian-goal** P7b — svi_readiness_snapshots table + pure delta helpers (`5743e5d`)
- **reseller** P11.16 per-metric numeric delta on weekly digest snapshot — 941/941 (`688ae3f`)
- **atlassian-goal** P6b — wholesale-only fundraise UI toggle (`f6c76ef`)
- **reseller** P11.15 wire digest snapshot delta into weekly cron — 911/911 (`8b670bb`)
- **atlassian-goal** P5a-tile — per-phase InvestorReadinessTile (`b28c421`)
- **reseller** P11.14 digest snapshot delta module — 902/902 (`2b3d0ce`)
- **reseller** P11.13 weekly digest snapshot JSONL persistence — 880/880 (`fddc85a`)
- **atlassian-goal** P6a-ir-pack Chapter 8 imports shared Div 83A fixture (`321e7e1`)
- **reseller** P11.12 sandbox_share_of_budget KPI in weekly digest — 861/861 (`c2acb95`)
- **compliance** P6a Div 83A ESOP scheme-rules gate (`bf04504`)
- **reseller** P11.11 ltv_cac_per_reseller KPI in weekly digest — 838/838 (`2afa0b4`)
- **reseller** P11.10 cohort_velocity KPI in weekly digest — 810/810 (`3f13c5f`)
- **nudge** P5a readiness_by_phase pure helper + NudgeResult wiring (`11d0512`)
- **compliance** P1n-persist WGEA + Modern Slavery persistence + dashboard (`e23411f`)
- **reseller** P11.9 gst_reconciliation_delta KPI in weekly digest — 784/784 (`13f7fd9`)
- **reseller** P11.8 ledger_drift_events KPI in weekly digest — 757/757 (`a1afd3e`)
- **compliance** P1n WGEA + Modern Slavery threshold detectors (`7eeb2c6`)
- **reseller** P11.7 attributed_churn_30d KPI in weekly digest — 731/731 (`788696b`)
- **reseller** P11.6 attributed_net_contribution KPI in weekly digest — 703/703 (`5c6eace`)
- **atlassian-goal** P1m — Ch10 dual-class decision-point section (Q4) (`47d4853`)
- **reseller** P11.5 attributed_mrr KPI in weekly digest — 675/675 (`d30b379`)
- **atlassian-goal** P1l — Ch10 primary-vs-secondary section (Q5) (`2ffe24f`)
- **compliance** P1k — ship compliance-calendar.ics generator (BAS + ASIC + AusIndustry R&D) (`9f83109`)
- **reseller** P11.4 clawback_exposure KPI in weekly digest — 651/651 (`69b1f70`)
- **reseller** P11.3 commission_cleared_mtd KPI in weekly digest — 632/632 (`425d39d`)
- **legal** P1f — wire AU IP Assignment Deed templates into registry + data-room + tests (`bfcaadd`)
- **legal** P1f — mint AU IP Assignment Deed templates (Founder + Contractor) (`ed05e03`)
- **reseller** P11.2 tier_mix KPI in weekly digest — 615/615 (`cb3db62`)
- **reseller** P11.1 credit-budget utilization in weekly digest — 599/599 (`b23777f`)
- **atlassian-goal** ship P1j — R&D Tax Incentive Chapter 6 section (`5d6d4c1`)
- **atlassian-goal** ship P1i — GST-threshold-crossing detector founder bridges + tests (`19cce33`)
- **reseller** ship P10.full_walkthrough_e2e_scaffold — composite Playwright walkthrough (`779f96b`)
- **atlassian-goal** ship P1e — ESIC self-assessment workspace worksheet (`381e832`)
- **reseller** P10.perf_audit_baseline — TTFB p95<=500ms pure-lib gate (`39b4f69`)
- **atlassian-goal** ship P1d — AU ESOP Scheme Rules test block + annotation (`c0c6daa`)
- **atlassian-goal** ship P1b — AU SAFE test block + annotation (`8995d58`)
- **reseller** P10 — refresh human-blocked registry P1.5 wording + add regression test (`99132f3`)
- **atlassian-goal** ship P1a — AU Pty Ltd Constitution test block + annotation (`48a4ef1`)
- **atlassian-goal** ship P1c — Fair Work-compliant AU Employment Contract template (`017380d`)
- **reseller** P10.au_compliance E.1 notice review + APP 5.2 lock-in (`9e7882f`)
- **reseller** P10.R08 gitleaks-style secret gate for docs/plans (`53086ad`)
- **atlassian-goal** ship P1h — ASIC extract probe (/api/asic/extract) (`b6f9af8`)
- **reseller** P10.R06 admin-gate unit test — 493/493 green (`eee388b`)
- **atlassian-goal** ship P1g — ABR ABN-lookup probe (/api/abr/lookup) (`023da0c`)
- **atlassian-goal** P4 walkthrough wiring — 12-phase investor-readiness callouts (`cf1a95c`)
- **reseller** P10.R09 follow-up — gate populate-from-template on share_management (`1761176`)
- **admin** /api/admin/goal-loop-status endpoint (`c5ea31e`)
- **cron** crontab entries for atlassian + ux-ia goal loops (staggered every 10 min) (`8d86a2f`)
- **cron** atlassian-goal-loop + ux-ia-goal-loop autonomous grinders (`2467af9`)
- **cron** investor weekly digest — top-5 watchlist SVI deltas (goal P7) (`4cfab47`)
- **reseller** P10.R09 manifest-drift cron — runtime CI-rules R-09 gate (`2fe73cc`)
- **a11y** menu tap-not-hover + ARIA + audit doc (goal P7) (`5062c6a`)
- **compliance** ESIC funding gate — warn-only + wholesale-block (goal P6) (`9fb3c19`)
- **credits** PLAN_CREDITS canonical v2 IDs added alongside legacy (`b9a2f03`)
- **investor** InvestorReadinessTile — 5-dim readiness surfaced (goal P5) (`0ccaaf0`)
- **nav** progressive-disclosure polish + role menu overlay (goal P5+P6) (`7653e36`)
- **reseller** seed QA_AFFILIATE tier-0 promo code (QAAFF) (`6f22b78`)
- **reseller** tick 384 twin-lift reseller_attributions row-cluster summary onto scope-boundary (workspace-owner negative-space read-anchor subset opens 1/1) (`830a629`)
- **reseller** tick 383 twin-lift reseller_attributions row-cluster summary onto me-attribution (cache-projection read-anchor subset opens 1/1) (`0daadc9`)
- **reseller** tick 382 twin-lift reseller_attributions row-cluster summary onto reveal-email-validation (`b3fffc7`)
- **brand** remove "Beta" label from BlockID product-name surfaces (hero eyebrow + BSI-AU index chip) (`617dfd4`)
- **reseller** tick 381 twin-lift reseller_attributions row-cluster summary onto reveal-email-authz (`8db799f`)
- **reseller** tick 380 twin-lift reseller_attributions row-cluster summary onto drawer-validation (`dafff9e`)
- **pricing-copy** route pricing FAQ through TRIAL_COPY + e2e contracts (`ab9fcbf`)
- **nav** global DEMO menu item — /showcase/atlassian linked from every page (`27ab155`)
- **reseller** tick 379 twin-lift reseller_attributions row-cluster summary onto drawer-authz (`fafeb91`)
- **ui** create-project button gated + upgrade CTA for at-limit founders (`0bfc88c`)
- **cron** trial-charge-warning pre-charge email endpoint (`6d5f45f`)
- **db** 0110 trial warning columns migration + canonical TRIAL_COPY (`15a8a33`)
- **plans** founder 1-startup limit — helper + enforcement at write path (`7bf5c17`)
- **plans** solo=50 grow=200 credit re-price (canonical source-of-truth update) (`d2b77bd`)
- **compliance** panel component + nudge engine integration (round 5.5e) (`dc8e49e`)
- **dataroom** wire legal templates into data-room-templates.ts (round 5.6e) (`672a75f`)
- **reseller** tick 378 twin-lift reseller_attributions row-cluster summary onto attribution-timing (`21879d3`)
- **dashboard** /dashboard/reports index (round 5.5 QA) (`e84aee4`)
- **templates** legal templates API + public /legal-templates pages (round 5.6d) (`272b205`)
- **compliance** R&D Tax Incentive 10-month calendar (round 5.5d) (`6db7c02`)
- **compliance** GST A$75k threshold detector (round 5.5c) (`12e2233`)
- **compliance** s708(8) wholesale investor cert intake + dataroom wire (round 5.5b) (`7f3147f`)
- **legal** AU-flavoured SAFE template (round 5.6c) (`e3c68de`)
- **pdf** SVI report final CTA reflects latest upgrade version (compliance + legal templates + auto-populate) (`2973675`)
- **compliance** 0108 migration + ESIC eligibility auto-check (round 5.5a) (`00bbc22`)
- **cron** prune-rate-limits endpoint (round 5.4d) (`dfecf12`)
- **legal** AU ESOP Scheme Rules template + Div 83A citations (round 5.6b) (`f381309`)
- **legal** AU Pty Ltd Constitution template (round 5.6a) (`3136cbd`)
- **rate-limit** persistent Postgres-backed limiter + tests (round 5.4b) (`39d5d71`)
- **dashboard** mount NextStepTile into /dashboard/svi (round 5.1) (`d4c821c`)
- **db** 0107_rate_limits.sql migration + prune helper (round 5.4a) (`46155a9`)
- **reseller** tick 376 — P10 reseller_attributions row-cluster cross-column invariant summary seed onto create-startup-authz (`2be077f`)
- **reseller** tick 375 — P10 reseller_credit_grants row-cluster cross-column invariant summary cross-surface twin-lift onto credit-grant-validation (`ea1cc5a`)
- **reseller** tick 374 — P10 reseller_credit_grants row-cluster cross-column invariant summary seed onto credit-grant-authz (`8184b3a`)
- **reseller** tick 373 — P10 reseller_requests ck_promo_link cross-column invariant summary cross-surface twin-lift onto reseller-requests-list-authz (`a7e6fba`)
- **reseller** tick 372 — P10 reseller_requests ck_credit_link cross-column invariant summary cross-surface twin-lift onto reseller-requests-list-authz (`20467e0`)
- **reseller** tick 371 — P10 reseller_requests ck_decision_shape cross-column invariant summary cross-surface twin-lift onto reseller-requests-list-authz (`0ce5136`)
- **showcase** Atlassian /growth-phases mirror page (step 4, task 5/13) (`e037edd`)
- **showcase** Atlassian /svi-report mirror page (step 3, task 4/13) (`31453f0`)
- **showcase** Atlassian /valuation mirror page (step 7, task 9/13) (`312c78c`)
- **showcase** Atlassian /dashboard mirror page (step 2, task 3/13) (`0e9fd94`)
- **showcase** Atlassian /summary mirror + landing CTA (steps 9 + 1, tasks 11+12/13) (`4bcd4c0`)
- **showcase** Atlassian /data-room mirror page (step 6, task 8/13) (`221a6bf`)
- **reseller** tick 370 — P10 reseller_requests ck_promo_link cross-column invariant summary cross-surface twin-lift onto requests-validation (`8ca5465`)
- **reseller** tick 369 — P10 reseller_requests ck_credit_link cross-column invariant summary cross-surface twin-lift onto requests-validation (`9f74756`)
- **reseller** tick 368 — P10 reseller_requests ck_decision_shape cross-column invariant summary cross-surface twin-lift onto requests-validation (`b9a95ef`)
- **reseller** tick 367 — P10 reseller_requests ck_promo_link cross-column invariant summary reseller-scope closing hoist onto requests-authz (`cb85e2f`)
- **reseller** admin end-to-end affiliate provisioning (API + UI + E2E) (`99a9578`)
- **showcase** extract Atlassian demo fixture (task 1/13) (`aa2f880`)
- **reseller** tick 366 — P10 reseller_requests ck_credit_link cross-column invariant summary reseller-scope companion hoist onto requests-authz (`2e111db`)
- **reseller** tick 365 — P10 reseller_requests ck_decision_shape cross-column invariant summary reseller-scope opening hoist onto requests-authz (`0c72acd`)
- **reseller** tick 364 — P10 reseller_requests ck_promo_link cross-column invariant summary cross-surface twin lift onto admin-requests-list-authz (`b8e5098`)
- **reseller** tick 363 — P10 reseller_requests ck_credit_link cross-column invariant summary cross-surface twin lift onto admin-requests-list-authz (`7ddc602`)
- **reseller** tick 362 — P10 reseller_requests ck_decision_shape cross-column invariant summary cross-surface twin lift onto admin-requests-list-authz (`04e635d`)
- **reseller** tick 361 — P10 reseller_requests ck_promo_link cross-column invariant summary companion hoist onto admin-requests-patch-authz (`eeb5cb7`)
- **reseller** tick 360 — P10 reseller_requests ck_credit_link cross-column invariant summary companion hoist onto admin-requests-patch-authz (`a33dab2`)
- **reseller** tick 359 — P10 reseller_requests ck_decision_shape cross-column invariant summary hoist onto admin-requests-patch-authz (`7ae9b4c`)
- **reseller** tick 358 — P10 promotion_codes[] tier ⇔ stripe-id disjunction invariant summary twin hoist onto admin-reseller-detail-validation (`b8342e3`)
- **reseller** tick 357 — P10 resellers-row ck_wholesale_gst_required cross-column invariant summary twin hoist onto admin-reseller-detail-validation (`198e043`)
- **reseller** tick 356 — P10 admins[] status ⇔ revoked_at + attributions_summary.by_source module-scope summary twin lift onto admin-reseller-detail-authz (`49df394`)
- **reseller** tick 355 — P10 admins[] status ⇔ revoked_at lifecycle + attributions_summary.by_source Record<enum,number> module-scope summary twin hoist on admin-reseller-detail-validation (`a9d4b93`)
- **reseller** tick 354 — P10 reseller_commissions_current[] cross-column lifecycle invariant summary module-scope hoist twin lift CLOSES commissions[] cluster on admin-reseller-detail-validation (`b91700a`)
- **reseller** tick 353 — P10 attributions_summary.by_source Record<enum, number> value-set enum tightening twin lift CLOSES attributions_summary aggregate on admin-reseller-detail-validation (`c9e63d5`)
- **reseller** tick 352 — P10 admins[] status ⇔ revoked_at cross-column lifecycle invariant twin lift CLOSES admins[] cluster on admin-reseller-detail-validation (`8884455`)
- **reseller** tick 351 — P10 admins[].revoked_at nullable ISO-8601 twin lift CLOSES admins[] cluster on admin-reseller-detail-validation (`a0ae885`)
- **reseller** tick 350 — P10 admins[].linked_at two-part typeof-string + ISO_TIMESTAMP_RE cross-surface twin lift on admin-reseller-detail-validation (`1fd937a`)
- **reseller** tick 349 — P10 commissions[].created_at two-part typeof-string + ISO_TIMESTAMP_RE cross-surface twin lift CLOSES commissions cluster on admin-reseller-detail-validation (`ef6760c`)
- **reseller** tick 348 — P10 commissions[].status two-part typeof-string + ALLOWED_COMMISSION_STATUSES set-membership cross-surface twin wire-shape pin on admin-reseller-detail-validation (`8cdef20`)
- **reseller** tick 347 — P10 commissions[].net_owed_cents two-part typeof-number + Number.isInteger cross-surface twin wire-shape pin on admin-reseller-detail-validation (goal file update) (`f10b50d`)
- **dashboard** portfolio 30-day SVI comparison chart (Q4 Multi-project #2) (`a5f380d`)
- **reseller** tick 346 — P10 commissions[].commission_aud_cents three-part typeof-number + Number.isInteger + >= 0 non-negative cross-surface twin wire-shape pin on admin-reseller-detail-validation (`48b3908`)
- **reseller** tick 345 — P10 commissions[].discount_pct two-part typeof-number + ALLOWED_TIER_PCTS set-membership wire-shape pin on admin-reseller-detail-validation (`7dda76e`)
- **reseller** author InfoVision seed migration (P1.5 unblocked — resellers row + tiers 0/20/40 promo codes with placeholder Stripe IDs) (`2323334`)
- **reseller** tick 344 — P10 commissions[].stripe_invoice_id two-part typeof + STRIPE_INVOICE_ID_RE cross-surface twin wire-shape pin on admin-reseller-detail-validation (`c4fd14a`)
- **reseller** tick 343 — P10 commissions[].list_price_aud_cents two-part typeof + strictly-positive integer wire-shape pin on admin-reseller-detail-validation (`ed7032a`)
- **projects** /workspace/projects/archived listing with days-to-purge (Q4 MP #5 UI) (`9dcfe3c`)
- **cron** 90-day retention purge for archived projects (Q4 MP #5) (`b61518e`)
- **reseller** tick 342 — P10 commissions[].commission_id UUID cross-surface twin open on admin-reseller-detail-validation (`f224389`)
- **audit** Wave 3 wire-in — stripe.plan.changed/canceled/reactivated + api_key.created/revoked (SOC2-lite continuation) (`efe7db9`)
- **reseller** tick 336 — P10 reseller.display_name two-part typeof-string + non-blank message-symmetry lift on admin-resellers-list twin (`ab64e8c`)
- **audit** wire user audit log into project.updated + member.invited/revoked/accepted (SOC2-lite expansion) (`e3ef49d`)
- **projects** enforce editor/viewer/admin permissions on mutation routes (Q4 Multi-project #4) (`eebeeaf`)
- **projects** team members — invite/accept/revoke + members page + /invites/[token] (Q4 Multi-project #3) (`1e1ff50`)
- **dashboard** portfolio view — all user projects side-by-side with canonical stage (Q4 Multi-project #1) (`7ed825b`)
- **audit** app_user_audit_log (SOC2-lite) — table + helper + /workspace/audit-log viewer + 3 mutation wire-ins (`903e913`)
- **projects** archive/unarchive UI + endpoint (Q4 Multi-project #5) (`8c9cfef`)
- **qa** Playwright-based post-deploy hydrated smoke (catches client-side render regressions like tab content) (`45fc129`)
- **admin** sandbox scope chip on remaining 6 admin pages + nav hint (D3-CISO-05 / D2-CFO-08) (`6a4c233`)
- **reseller** tick 313 — P10 attributions_summary.by_source enum tightening (SCOPE ROTATION: commissions[] → attributions_summary) (`2a376db`)
- **showcase** add OG + Twitter card images for /showcase/blockid (social share preview) (`05d30fe`)
- **pdf** thread brand_settings into SVI report renderer (Growth+/Scale/Enterprise white-label) (`880df71`)
- **reseller** tick 307 — P10 admins[].revoked_at nullable ISO-8601 wire-shape pin on admin-reseller-detail (`9146ae6`)
- **branding** PDF branding feature-gate + settings form (Growth+/Scale/Enterprise) — renderer wire in follow-up (`2667836`)
- **pricing** seed Accelerator per-cohort SKUs (Starter/Growth/Enterprise) with placeholder Stripe IDs (PRC-ACC) (`d079d33`)
- **reseller** tick 302 — P10 stripe_promotion_code_id text nullable wire-shape pin on admin-reseller-detail promotion_codes[] (SCOPE ROTATION: resellers row → reseller_promotion_codes) (`5af33db`)
- **dashboard** overlay canonical 8-stage badge on founder dashboard + report + SCN payloads (parity with showcase) (`29c00fe`)
- **pricing** seed Investor per-seat SKUs (Angel/Advisor/VC-Small/Enterprise) with placeholder Stripe IDs (PRC-INV) (`f14ace3`)
- **onboarding** add Step 6 "Create first startup" for activation lift (real-world audit #8) (`41ab0cf`)
- **showcase** overlay canonical 8-stage badges on Atlassian/Canva/Xero/SafetyCulture timelines (real-world audit #5) (`b9ee0b7`)
- **pricing** render all 12 SKUs across Founder/Investor/Accelerator segment tabs (PRC-INV lane) (`b885876`)
- **journey** startup-growth-phases → canonical 8-stage bucket map (second 12-phase taxonomy bridged) (`a1bf454`)
- **reseller** fan out getCurrentProjectIsSandbox() to all /workspace/* + /dashboard/* pages (CLO D4-CLO-06 follow-up) (`5610153`)
- **data-room** expand DATA_ROOM_STRUCTURE to 60+ items with Tax + AU Compliance sections (Series-A acquirer standard) (`b0ae8d8`)
- **reseller** customer-journey stage column on Customers list (canonical VC-industry vocab, derived from SVI) (`376ae88`)
- **journey** 12-phase<->8-stage bucket map (H.21) -- mechanical bridge between fine-grained DB and canonical VC vocabulary (`c4b7087`)
- **team,docs** update /team latest-contribution + /docs recently-updated with 2026-07-23 shipped log (`d2d2c08`)
- **status** update /status + /stats pages with autonomous-loop counters (2026-07-23) (`0610fd0`)
- **roadmap** update /roadmap page with 2026-07-23 shipped log + next-up + human-blocked (`a84a900`)
- **reseller** CLO D4-CLO-06 — sandbox banner + acceptable-use policy page (EN+VI) (`d4d0a25`)
- **journey** publish canonical 8-stage startup-to-unicorn vocabulary (Atlassian/Canva/Airwallex-anchored) + legacy SVI shim (`7f49926`)
- **reseller** tick 290 — P10 monthly_sandbox_credits int wire-shape + non-negative + integer pin cross-surface pair on admin-resellers-list + admin-reseller-detail (`5789518`)
- **esop** CHRO advisory — Div 83A qualifying-tests checklist in API + knowledge base (`6213d64`)
- **security** CISO D3-CISO-06 — block Stripe customer portal for wholesale-provisioned founders (`fd4a1eb`)
- **reseller** Customer-Success advisory — VI translation for Grant modal + Customer drawer (`6cf9400`)
- **reseller** tick 289 — P10 monthly_credit_budget int wire-shape + non-negative + integer pin cross-surface pair on admin-resellers-list + admin-reseller-detail (`062d031`)
- **svi-exc** T_SVI_EXC_0012 v0.5 — founder-side secondary offer intake page (`bfd7a5b`)
- **reseller** tick 288 — P10 allowed_tiers int[] wire-shape + value-set pin cross-surface pair on admin-resellers-list + admin-reseller-detail (`e99568c`)
- **reseller** tick 287 — P10 gst_registered bool wire-shape pin cross-surface pair on admin-resellers-list + admin-reseller-detail (`a176dfd`)
- **orchestrator** platform auto-upgrade 2026-07-23 (`6b81bf4`)
- **reseller** tick 286 — P10 commission_share_pct numeric wire-shape + [0,100] value pin cross-surface pair on admin-resellers-list + admin-reseller-detail (`b0d8d8f`)
- **reseller** tick 285 — P10 admin-reseller-detail created_at + updated_at ISO pin mirror from admin-resellers-list 283/284 (`25891c3`)
- **reseller** tick 284 — P10 admin-resellers-list updated_at ISO pin fresh-column rotation (`3e09ff9`)
- **reseller** tick 283 — P10 admin-resellers-list created_at ISO pin mirror (`ef4cad7`)
- **reseller** tick 282 — P10 admin-requests-list decision_reason length pin mirror (`f0bee61`)
- **reseller** tick 281 — P10 admin-requests-list decision_at ISO pin mirror (`0722a6a`)
- **reseller** tick 280 — P10 admin-requests-list created_at ISO pin mirror (`9df7b16`)
- **reseller** tick 279 — P10 reseller-requests-list ALLOWED_REQUEST_TYPES hoist (option a) (`03f0998`)
- **reseller** tick 278 — P10 reseller-requests-list ALLOWED_STATUS_VALUES hoist (option a) (`95f558d`)
- **reseller** tick 277 — P10 reseller-requests-list decision_reason length ≤ REASON_MAX pin (option a) (`35ef980`)
- **reseller** tick 276 — P10 reseller-requests-list decision_at ISO null-or-string tightening (option a) (`64e67f0`)
- **reseller** tick 275 — P10 reseller-requests-list created_at ISO wire-shape pin (option a) (`78bbca8`)
- **reseller** tick 274 — P10 admin-requests-patch resellers(code,display_name) embed pin on deny+cancel+approve read-backs (option c) (`f2f9844`)
- **reseller** tick 273 — P10 admin-requests-patch linked_credit_transaction_id UUID pin on approve read-back (option b) (`880ad74`)
- **reseller** tick 272 — P10 admin-requests-patch requested_by UUID pin on deny+cancel+approve read-backs (option c) (`41a4ca3`)
- **reseller** tick 271 — P10 admin-requests-patch reseller_id UUID pin on deny+cancel+approve read-backs (option c) (`3e177d2`)
- **reseller** tick 270 — P10 admin-requests-patch status enum value pin on deny+cancel+approve read-backs (option b) (`086f7c8`)
- **reseller** tick 269 — P10 admin-requests-patch request_type enum value pins on deny+cancel+approve read-backs (option d) (`a161620`)
- **reseller** tick 268 — P10 admin-requests-patch decision_reason value pins on deny+cancel+approve read-backs (option c) (`535cab8`)
- **reseller** tick 267 — P10 admin-requests-patch created_at ISO-8601 shape pins on deny+cancel+approve read-backs (option i) (`a81469e`)
- **reseller** tick 266 — P10 admin-requests-patch decision_by UUID wire-shape pins on deny+cancel+approve read-backs (option b companion to tick 265 decision_at) (`9332977`)
- **reseller** tick 265 — P10 admin-requests-patch decision_at ISO-8601 shape pins on deny+cancel+approve read-backs (option b) (`36c310d`)
- **reseller** tick 264 — P10 admin-requests-patch approve post-PATCH read-back per-key payload content pins (option s3) (`adce2ee`)
- **reseller** tick 263 — P10 admin-requests-patch cancel post-PATCH read-back per-key payload content pins (option s2) (`dc18a8f`)
- **reseller** tick 262 — P10 admin-requests-patch post-PATCH readback per-key payload content pins (option s) (`012a971`)
- **reseller** tick 261 — P10 reseller-requests-list per-key payload content pins (option r3) (`1e7c893`)
- **reseller** tick 260 — P10 requests-validation per-key payload content pins (option r2) (`0ac2957`)
- **reseller** tick 259 — P10 admin-requests-list per-key payload content pins (option r) (`11eb2d9`)
- **reseller** tick 258 — P10 loop-status tick_row goal_completed message and completion_marker two-pin schema pin (option y20) (`586e54a`)
- **reseller** tick 257 — P10 loop-status tick_row cron_removal status one-pin schema pin (option y13) (`8856634`)
- **reseller** tick 256 — P10 loop-status tick_row cron_removal_failed error one-pin schema pin (option y19) (`c710c1d`)
- **reseller** tick 255 — P10 loop-status tick_row human_blocked_snapshot_failed error one-pin schema pin (option y12) (`f1beb94`)
- **reseller** tick 254 — P10 loop-status tick_row auto_commit_failed error one-pin schema pin (option y11) (`de82b57`)
- **reseller** tick 253 — P10 loop-status tick_row delegated_dispatch four-pin schema pin (option y6) (`5088c01`)
- **reseller** tick 252 — P10 loop-status tick_row phase_dispatched elapsed_ms + signal two-pin schema pin (option y18) (`1f50d46`)
- **reseller** tick 251 — P10 loop-status tick_row phase_dispatched two-pin schema pin (option y16) (`acd0aa4`)
- **reseller** tick 250 — P10 loop-status tick_row auto_deploy_failed one-pin schema pin (option y17) (`2d12f02`)
- **reseller** tick 249 — P10 loop-status tick_row auto_deploy_skipped two-pin schema pin (option y15) (`3acabdc`)
- **reseller** tick 248 — P10 loop-status tick_row auto_deploy_finished two-pin schema pin (option y3) (`d5fad1c`)
- **reseller** tick 247 — P10 loop-status tick_row auto_deploy_triggered two-pin schema pin (option y14) (`222ba99`)
- **reseller** tick 246 — P10 loop-status tick_row tick_start_end docs-only pin (option y10) (`f5e9407`)
- **reseller** tick 245 — P10 loop-status tick_row human_blocked_snapshot conditional pin (option y9) (`176b745`)
- **reseller** tick 244 — P10 loop-status tick_row error conditional pin (option y8) (`a6de403`)
- **reseller** tick 243 — P10 loop-status tick_row auto_commit_started conditional pin (option y7) (`90c30fd`)
- **reseller** tick 242 — P10 loop-status tick_row auto_commit_finished conditional pin (option y5) (`1fd4bd3`)
- **reseller** tick 241 — P10 loop-status tick_row idle conditional pin (option y4) (`2369ff0`)
- **reseller** tick 240 — P10 loop-status tick_row phase_failed conditional pin (option y2) (`603ac9a`)
- **reseller** tick 239 — P10 loop-status tick_row frontier_computed conditional pin (option y) (`0629ead`)
- **reseller** tick 238 — P10 loop-status monitor row --json state spread 8-key set pin (option w) (`47faebb`)
- **reseller** tick 237 — P10 loop-status tick_row human_review_minutes_7d number pin (option v) (`6859a45`)
- **reseller** tick 236 — P10 loop-status monitor row last_log plain-object pin (option s) (`af24a12`)
- **reseller** tick 235 — P10 loop-status row schema pins (option q reclassified) (`6344313`)
- **reseller** tick 234 — P10 admin-requests-list payload plain-object pin (option p sibling-audit) (`4dfb919`)
- **reseller** tick 233 — P10 drawer pair masked_email shape pin (option m reclassified) (`b1fec73`)
- **reseller** tick 232 — P10 admin-reseller-detail pair promo_code shape pin (option l extended) (`99c6601`)
- **reseller** tick 231 — P10 admin-list pair reseller.code VALUE pin tightening (option j) (`8b0807c`)
- **reseller** tick 230 — P10 drawer pair signup phase-1 triple VALUE pin tightening (option h) (`3964a65`)
- **reseller** tick 229 — P10 requests spec pair header comment cleanup (option e); align "Do NOT pin decision_at/decision_reason" narrative to inline pins landed ticks 223+224 (`a617a44`)
- **reseller** tick 228 — P10 drawer pair progression[0] optional-field shape pins (detail/phase/chapterSlug/href) twin symmetrisation (`b8e7508`)
- **reseller** tick 227 — P10 drawer-validation.spec.ts row 147 progression[0].kind signup literal pin twin symmetrisation (`c5941bd`)
- **reseller** tick 226 — P10 drawer-validation.spec.ts row 147 twin symmetrisation (OverviewSummary + progression[0]) (`6aa3469`)
- **reseller** tick 225 — P10 drawer-authz.spec.ts row 146 overview + progression[0] shape pins (`ce047cb`)
- **reseller** tick 224 — P10 requests-validation.spec.ts row 156 twin symmetrisation (payload/decision_at/decision_reason) (`e8fba83`)
- **reseller** tick 223 — P10 reseller-requests-list-authz.spec.ts row 161 nullable + jsonb shape pins (payload/decision_at/decision_reason) (`d862e67`)
- **reseller** tick 222 — P10 admin-requests-list-authz.spec.ts row 174 resellers(code,display_name) join shape pin (`bf669fb`)
- **reseller** tick 221 — P10 admin-requests-list-authz.spec.ts row 174 FK-echo shape pins (requested_by/decision_by/linked_credit_transaction_id/linked_promotion_code_id) (`4bb68c2`)
- **reseller** tick 220 — P10 sandbox-setup-authz.spec.ts row 154 envelope shape-pin parity with credit-grant row 152 (`b75398d`)
- **reseller** tick 219 — P10 credit-grant-validation.spec.ts happy path shape-pin parity with authz row 152 (`b127e71`)
- **reseller** tick 218 — P10 sandbox-setup-authz.spec.ts UUID_RE module-scope hoist (`59f5cfb`)
- **reseller** tick 217 — P10 audit-log-writes.spec.ts UUID_RE module-scope hoist (`fa20434`)
- **reseller** tick 216 — P10 wave-3 rows 156/156b/156c credit_transaction_id UUID_RE FK-echo shape lens on chain bodies (`6feffe6`)
- **reseller** tick 215 — P10 wave-5 row 176 env-harness drawer + reveal-email audit-log strict-equality tightening (`7ca7e73`)
- **reseller** tick 214 — P10 wave-5 row 179 + wave-3 row 154 audit-log lens strict-equality tightening (`d4a61c7`)
- **reseller** tick 213 — P10 wave-3 row 156c four-chain DB companion shape+helper twin-lens (`666d856`)
- **reseller** tick 212 — P10 wave-3 two/three-chain DB companion shape+helper twin-lens alignment (`80c8034`)
- **reseller** tick 211 — P10 wave-3 row 155 mirror-row shape+helper alignment via per-field SELECT (`9e9ec8a`)
- **auto** publish SEO article via cron (`db66d18`)
- **reseller** tick 210 — P10 wave-3 row 156c four-chain self-approve HTTP + DB companion (`6a52866`)
- **reseller** tick 209 — P10 wave-5 row 179 deny/cancel mirror lens alignment via shared helper (`1e0124b`)
- **reseller** tick 208 — P10 wave-5 row 179 approve-fanout mirror lens alignment via shared helper (`3f76978`)
- **reseller** tick 207 — P10 wave-3 row 156 DB companion two-chain mirror-row fanout (`d2c8f9c`)
- **reseller** tick 206 — P10 wave-3 row 156b DB companion three-chain mirror-row fanout (`b761ef0`)
- **reseller** tick 205 — P10 wave-4 row 157 code-validate paused-inactive activation (`938e135`)
- **reseller** tick 204 — P10 wave-3 row 156b three-chained-grant balance-readback (`6c70e15`)
- **reseller** tick 203 — P10 wave-3 row 156 credit-grant balance-readback chain (`950e35d`)
- **reseller** tick 202 — P10 wave-3 row 155 credit-grant mirror-row DB assertion + countResellerCreditGrantsFor helper (`092dbee`)
- **reseller** tick 201 — P10 wave-3 row 154 credit-grant fan-out audit-log assertion (`61a1342`)
- **reseller** tick 200 — P10 wave-3 row 152 credit-grant happy 200 + attachGrantSelfApprove fixture helper (`3617b5c`)
- **reseller** tick 199 — P10 wave-3 rows 150 + 151 credit-grant-authz activation (`b275d89`)
- **reseller** tick 198 — P10 wave-3 finding-2 seed + fixture delta (`5963a9f`)
- **reseller** tick 197 — P12.9 Playwright E2E for user management (`3b67685`)
- **reseller** tick 196 — P12.8 impersonation trail tab (`7a9e9c6`)
- **reseller** tick 195 — P12.7 admin plan endpoint (`887a18e`)
- **reseller** tick 194 — P12.5 admin create user endpoint (`e8521b0`)
- **reseller** tick 193 — P12.6 admin permissions endpoint + P12.3 retroactive close (`5980886`)
- **reseller** tick 192 — P12.4 admin user detail page 4 panels (`b8b77ad`)
- **reseller** tick 191 — P12.3 admin users list account_type filter + reseller name (`c7c32fb`)
- **reseller** tick 190 — P12.2 user role/permissions migration 0102 (`a1fb59e`)
- **reseller** tick 189 — P12.1 account_type enum extension (`38b3c27`)
- **reseller** tick 188 — admin reseller CRUD audit-log writes (POST/PATCH/DELETE) (`b30c558`)
- **reseller** tick 187 — P10 wave-5 row 179 audit symmetry across approve/deny/cancel (`714ac56`)
- **reseller** tick 186 — admin PATCH audit-log write for approve/deny/cancel (`670d2f4`)
- **reseller** tick 185 — P10 wave-5 row 179 approve fan-out ledger DB assertions activated (`aca0446`)
- **reseller** tick 184 — P10 wave-5 row 175 approve over_budget_approval activated (`1967924`)
- **reseller** tick 183 — P10 wave-5 row 177 activate showcase-reviews reviewer POST happy 200 (`94b743d`)
- **reseller** tick 182 — P10 wave-5 row 163 activate cobranding-pill attributed founder EN + VI happy (`ef817fd`)
- **reseller** tick 181 — P10 wave-5 row 178 activate attribution-timing me-flip happy 200 (`5c9d69a`)
- **reseller** tick 180 — P10 wave-5 row 165 activate admin-resellers-create-authz happy 201 (`84ea639`)
- **reseller** tick 179 — P10 wave-5 row 166 activate admin-resellers-create-validation invalid_abn_format (`d925896`)
- **reseller** tick 178 — P10 wave-5 row 183 activate billing-validation active_wholesale invalid_json (`fc0b392`)
- **reseller** tick 177 — P10 wave-5 row 181 activate scope-boundary active_wholesale happy (`77b7cc4`)
- **reseller** tick 176 — P10 wave-5 row 180 activate audit-anomaly-scan active_wholesale happy (`f52902d`)
- **reseller** tick 175 — P10 wave-5 row 179 activate audit-log-writes active_wholesale happy (`935defd`)
- **reseller** tick 174 — P10 wave-5 row 176 activate showcase-reviews-authz founder GET happy 200 (`d6f592a`)
- **reseller** tick 173 — P10 wave-5 row 171 activate admin-reseller-delete-authz happy 200 (`6aa181c`)
- **reseller** tick 172 — P10 wave-5 row 172 activate admin-reseller-delete-validation happy 200 (`310c67d`)
- **reseller** tick 171 — P10 wave-5 row 170 activate admin-reseller-patch-validator reject cluster (`371d89a`)
- **reseller** tick 170 — P10 wave-5 row 169 activate admin-reseller-patch-authz post-requireAdmin (`1700b02`)
- **reseller** tick 169 — P10 wave-5 row 168 activate admin-reseller-detail-validation happy 200 (`ddce29e`)
- **reseller** tick 168 — P10 wave-5 row 167 activate admin-reseller-detail-authz happy 200 (`8d1788b`)
- **reseller** tick 167 — P10 wave-4 row 160 activate reports-signed-url-validation paired retention (`a6b32ea`)
- **reseller** tick 166 — P10 wave-4 row 159 activate reports-signed-url-authz happy 200 (`9f99fb3`)
- **reseller** tick 165 — P10 wave-4 helper attachReportRow(monthKey) fixture (`ff570c7`)
- **reseller** tick 164 — P10 wave-5 row 175 activate admin-requests-patch cancel via row 155-b seed (`e42857c`)
- **reseller** tick 163 — P10 wave-5 row 175 activate admin-requests-patch-authz deny branch 200 (`3eab1b8`)
- **reseller** tick 162 — P10 wave-5 row 174 activate admin-requests-list-authz happy 200 (`8ff32dc`)
- **reseller** tick 161 — P10 wave-5 row 173 activate admin-reseller-loop-status-authz happy 200 (`e6e1de6`)
- **reseller** tick 160 — P10 wave-5 row 164 activate admin-resellers-list-authz happy 200 (`48a116c`)
- **admin** full user-management dashboard + affiliate cross-view + P12 goal for loop (`fe9946d`)
- **reseller** tick 159 — P10 wave-4 row 162 activate reseller-crons-authz HTTP method contract (`97e3a3f`)

### Fixes

- **pricing** route "3 days" fine-print through TRIAL_COPY (48h) (`9f66083`)
- **landing** "7-day trial" hero copy replaces indefinite-free evocation (`8177bf0`)
- **pricing** hide Free tier + correct founder workspace copy (Bugs 1+2) (`765d06e`)
- **tests** repair Gate 4b failures blocking round 5 deploy (round 5.5 QA) (`11cd37a`)
- **cfo** score card layout, empty state, dark mode, skeleton (`109a108`)
- **pdf** SVI report final CTA — remove single-child row-flex causing per-char text overflow (email PDF end-of-report) (`2353d5d`)
- **deploy** capture vitest exit code, not tail's, in Gate 4b (round 5.3) (`f9af62a`)
- **admin** tighten /admin + /admin/team route guards (round 5.2) (`eddd25b`)
- **portfolio** webpackIgnore dynamic imports so client comparison-chart bundle omits server-only modules (`c8cdc50`)
- **smoke** Gate 11 /pricing flake — retries:1 + tier query-param deterministic warm-up (iter-18 residual) (`38f7795`)
- **deploy** Gate 11 warm-up curl loop + bump timeout on Accelerator tab test (iter-17 flake) (`f23bd55`)
- **smoke** accept raw or encoded next= param in workspace redirect tests (`030c3c8`)
- **deploy** Gate 11 Playwright — use npx invocation to fix PATH miss (iter-12 flagged false-pass) (`5178d65`)
- **qa,sot** iteration 5-9 regression sweep + SOURCE-OF-TRUTH sync — 0 code fixes, 12 SOT updates (`6b1dbf0`)
- **pricing** reconcile accelerator SKU ids across marketing plans-v2.ts and generated CSV (accel_* -> accelerator_*) (`589f10b`)
- **onboarding** route Stripe-hosted checkout return → Step 6 "Create first startup" (`b176ffe`)
- **reseller** split node:crypto out of attribution.ts to unblock client bundle (`7eca0c9`)
- **admin** remove /admin/resellers/[slug] route (conflicts with [code]) (`d19c777`)

### Docs

- **reseller** tick 385 twin-lift — reseller_attributions cluster onto credit-grant-authz (10/16 surface parity) (`124311e`)
- **ux-ia** close P9 ship-hardening (E2E already in a5c295e0; refresh docs + goal status) (`4ff0e51`)
- **goals** flip autonomous_loop=enabled in 2 new goal docs (`23e77bf`)
- **ops** document 3 autonomous goal loops + kill switches (`1979b8e`)
- **goal** flip atlassian-standard-mapping P5/P6/P7 to shipped (`4f6da78`)
- **goal** flip ux-ia-startup-flow P5/P6/P7 to shipped (`50dd5a4`)
- **qa** round 5.5 account review — 12-account full-journey audit + deploy unblock (`2e7ed6a`)
- **user** menu walkthrough for existing users + SOURCE-OF-TRUTH G7 entry (`98c4289`)
- **reseller** tick 377 twin-lift reseller_attributions summary onto create-startup-validation (`0c9f17e`)
- **qa** Atlassian demo QA report + user-type test matrix (2026-07-24) (`01ac2d6`)
- **demos** Atlassian walkthrough user guide + SOURCE-OF-TRUTH audit entry (`4bdf2a3`)
- **reseller** tick 344 review_history — commissions[].stripe_invoice_id cross-surface twin lift on admin-reseller-detail-validation (`b2a2e59`)
- **smoke** note /workspace/* auth-gate 200-with-embedded-NEXT_REDIRECT pattern (iter-12 flag resolved) (`e1e2f44`)
- **scn** rename externally to Startup Compass + cite Sean Ellis/T2D3/Porter/JTBD/BVP as underlying frameworks (real-world audit #9) (`9e5d71e`)
- **sot** consolidate all plans + requirements into single SOURCE-OF-TRUTH.md + cross-sync markers (`462a207`)
- **review** mark CRO Share-Mgmt remove-path finding resolved at tick 56 (Subscription Schedules already shipped) (`95d71d9`)
- **audit** real-world workflow parity audit — Atlassian/Canva/Airwallex + data-room standard vs current blockid.au surfaces (`442d5fb`)

### Chores

- **ux-ia** close goal — P0–P9 shipped, P8 human review non-blocking (`cd33fb7`)
- **components** remove orphan dashboard/trial-banner (workspace variant is canonical) (`4c3b5bc`)
- **pricing** delete dead founder_free render branch in pricing-matrix (`f765063`)
- **reports** persist reseller monitor + goal history + deploy log ticks (`99e2a4e`)
- **reports** persist reseller monitor + goal history + deploy log ticks (`db8c357`)
- **pre-deploy** iter-20 stash working reports + reseller test tweak (`e91bec8`)
- **deploy** iter-18 post-deploy log — 11/11 gates, Gate 11 10/10 on re-run, HEAD ed7032aa live (`ed84b12`)
- **reseller** tick 341 — P10 attributions_summary.total + .active two-part typeof-number + Number.isFinite + range lift on admin-reseller-detail-validation (`92be012`)
- **deploy** iter-16 post-deploy log — Gate 11 8/8 pass, HEAD f579ba32 live (`db2ac9a`)
- **reseller** tick 340 — P10 admins[].role + admins[].status two-part typeof-string + set-membership lift on admin-reseller-detail-validation (`7fb74f9`)
- **reseller** tick 339 — P10 promotion_codes[].tier_pct two-part typeof + ALLOWED_TIER_PCTS set-membership lift on admin-reseller-detail-validation (`a78e9a8`)
- **reseller** tick 338 — P10 reseller.display_name two-part typeof + non-blank message-symmetry lift on admin-reseller-detail-validation twin (`e4c9cf4`)
- **reseller** P10 tick 337 (goal) — reseller.created_at / updated_at / commission_share_pct message-prose refresh on admin-reseller-detail typeof asserts (`72dc941`)
- **reseller** P10 tick 335 (goal) — resellers-row ck_wholesale_gst_required cross-column invariant summary hoist on admin-resellers-list twin (`7494673`)
- **reseller** P10 tick 334 (goal) — commissions[] status↔event_type + net_owed_cents↔delta_aud_cents view-derivation lifecycle invariant summary hoist on admin-reseller-detail (`a49c934`)
- **reseller** P10 tick 333 (goal) — resellers-row ck_wholesale_gst_required cross-column invariant summary hoist on admin-reseller-detail (`5c23129`)
- **deploy** idempotent Playwright chromium preflight before Gate 11 (`be06448`)
- **reseller** P10 tick 332 (goal) — promotion_codes[] tier↔stripe-id cross-column invariant summary hoist on admin-reseller-detail (`eed2ae6`)
- **reseller** P10 tick 331 (goal) — reseller.code message-symmetry lift on admin-resellers list two-part typeof-string + regex pin (`c9c6afb`)
- **reseller** P10 tick 330 (goal) — reseller.billing_model+status two-part typeof-string+Set.has twin-symmetry lift on admin-resellers list (`e23ee9b`)
- **reseller** P10 tick 329 (goal) — reseller.code text NOT NULL UNIQUE two-part typeof-string+equality pin on admin reseller detail (`5726f1e`)
- **deploy** iter-12 deploy — a30f0fc4 → release 3x06_0gG225y-PBVfhniP (`b1317a1`)
- **reseller** P10 tick 328 (spec+goal) — reseller.billing_model/status two-part typeof-string+Set.has value-set enum pin on admin reseller detail (`6d72e87`)
- **reseller** P10 tick 328 — reseller.billing_model/status two-part typeof-string+Set.has value-set enum pin on admin reseller detail (`77850fa`)
- **reseller** P10 tick 327 — reseller.display_name text NOT NULL two-part labelled pin on admin reseller detail (`8e8ccbb`)
- **reseller** P10 tick 326 — admins[] status↔revoked_at cross-column lifecycle invariant pin on admin reseller detail (`85625a4`)
- **reseller** P10 tick 325 — reseller.id UUID two-part labelled pin on admin reseller detail (`633a581`)
- **reseller** P10 tick 324 — promotion_codes[].code PROMO_CODE_RE two-part labelled pin on admin reseller detail (`9fa665f`)
- **reseller** P8 tick 323 — close done_pending_stripe; advance current_focus to P10 (`53a2e5f`)
- **reseller** P10 tick 322 — admins[].user_id UUID two-part pin on admin reseller detail (`a06984b`)
- **reseller** P10 tick 321 — admins[].id UUID two-part pin on admin reseller detail (`5d3952d`)
- **reseller** P10 tick 320 — promotion_codes[].id UUID two-part pin on admin reseller detail (`d64b9d7`)
- **deploy** iter-9 live deploy log — HEAD a545486e, 10/10 gates, 16/17 smoke (`f1fcdab`)
- **reseller** P10 tick 319 — attributions_summary.active int non-negative pin on admin reseller detail (`1c70b42`)
- **reseller** P10 tick 318 — attributions_summary.total int non-negative pin on admin reseller detail (`c31222c`)
- **reseller** P10 tick 317 — commissions[].created_at timestamptz ISO 8601 pin on admin reseller detail (`e1ff9a0`)
- **reseller** P10 tick 316 — commissions[].status value-set enum pin on admin reseller detail (`5036d8e`)
- **reseller** P10 tick 315 — commissions[].net_owed_cents int (may be negative) pin on admin reseller detail (`2ccb922`)
- **reseller** P10 tick 314 — commissions[].commission_aud_cents int-nonnegative pin on admin reseller detail (`17f8369`)
- **reseller** P10 tick 312 — commissions[].discount_pct value-set enum pin on admin reseller detail (`86d99dc`)
- **deploy** iter-8 live deploy 089caa42 — 10/10 gates, 15/15 smoke green (`1273a9a`)
- **reseller** P10 tick 311 — commissions[].list_price_aud_cents int-positive pin on admin reseller detail (`f601d67`)
- **reseller** P3 tick 310 — ledger_webhooks sign-off done_pending_agreement (`48300c7`)
- **deploy** iteration-7 live retry — release Mzzh5pwFURHvrhivSP_QQ (sha 01e3db6d) (`79997b3`)
- **deploy** iteration 6 post-deploy smoke — 29c00fe1 gates 8/8 + 12/12 smoke (2 new) (`589f6e3`)
- **qa** install @axe-core/playwright + unlock a11y CI lens (audit remediation) (`f9c04c7`)
- **deploy** iteration-5 post-deploy smoke — 10/10 URLs pass on release sTCaMlAEpO4fE19hLckff (sha 46085019) (`d9aeaff`)
- **qa** provision Playwright test harness (@playwright/test + chromium) + npm scripts (`f931616`)
- **deploy** live deploy of a1bf4542 — post-deploy smoke green (`706e5a1`)
- **reports** snapshot autonomous-loop report streams before parallel-agent burst (`f61540f`)
- **goal** P12_user_management priority added — loop picks up next tick (`8e6585e`)

### Other

- **cron** extract generic goal-loop driver from reseller-goal-loop (`904aa9c`)
- **e2e** menu structure per role (`a5c295e`)
- docs feat(ux): ux-ia-startup-flow goal (audit + IA proposal + phased plan) (`43f172f`)
- **dataroom** populate-from-template uses persistent rate limit (round 5.4c) (`a82478c`)
- **e2e** Atlassian walkthrough smoke (9-step visitor journey) (`5326cdf`)
- **showcase** walkthrough shell navigation (`5fed65f`)
- docs feat(demo): atlassian standard mapping goal (gap matrix + data room map + nudge spec) (`72d461a`)
- **smoke** tighten /workspace/audit-log auth-gate assertion (iter-18 hardening) (`091dceb`)
- **smoke** add /dashboard/portfolio auth-gate smoke coverage (iter-15 DX) (`6444e5a`)
- **reseller** P10 tick 309 — commissions[].stripe_invoice_id text NOT NULL wire-shape pin on admin reseller detail (`f536b7b`)
- **reseller** P10 tick 308 — commissions[].commission_id UUID wire-shape pin on admin reseller detail (`9587b07`)
- **reseller** P10 tick 306 — admins[].linked_at ISO-8601 shape pin on admin reseller detail (`48fd9a5`)
- **reseller** P10 tick 305 — admins[].status value-set enum tightening on admin reseller detail (`ab24737`)
- **reseller** P10 tick 304 — admins[].role value-set enum tightening on admin reseller detail (`8eea0dd`)
- **reseller** P10 tick 303 — promotion_codes[].tier_pct value-set enum tightening on admin reseller detail (`1c3fb2c`)
- **reseller** P10 tick 302 — promotion_codes[].stripe_promotion_code_id text nullable wire-shape pin on admin reseller detail (`870f060`)
- **reseller** P10 tick 301 — promotion_codes[].stripe_coupon_id text nullable wire-shape pin on admin reseller detail (`beebea0`)
- **reseller** P10 tick 300 — promotion_codes[].created_at timestamptz wire-shape pin on admin reseller detail (`51901a5`)
- **reseller** P10 tick 299 — promotion_codes[].active bool wire-shape pin on admin reseller detail (`f77c3b3`)
- **reseller** P10 tick 298 — notes text nullable single-guard wire-shape pin on admin resellers list + detail (`74a2a08`)
- **reseller** P10 tick 297 — contact_email text nullable single-guard wire-shape pin on admin resellers list + detail (`9bd175a`)
- **reseller** P10 tick 296 — primary_color text nullable + HEX_COLOR_RE wire-shape pin on admin resellers list + detail (`8913e8f`)
- **reseller** P10 tick 295 — logo_url text nullable wire-shape pin on admin resellers list + detail (`c4b3c1e`)
- **reseller** P10 tick 294 — abn text nullable wire-shape pin on admin resellers list + detail (`1620acc`)
- **reseller** P10 tick 293 — collateral_approval_required bool wire-shape pin on admin resellers list + detail (`b74c6fb`)

## v3.1.0 — 2026-07-22 (minor)

### Features

- **reseller** tick 158 — P10 wave-4 row 161 activate reseller-requests-list-authz happy GET (`9afbc73`)
- **reseller** tick 157 — P10 wave-4 row 158 activate code-validate active_wholesale happy (`e3a5ba5`)
- **showcase** Track C.4 SafetyCulture case study skeleton (4/6 cases live) (`c5a580c`)
- **reseller** tick 156 — P10 wave-3 row 156 activate requests-validation active_wholesale happy GET (`9d2bb7f`)
- **reseller** tick 155 — P10 wave-3 row 155 activate requests-authz active_wholesale happy (`8b4db13`)
- **reseller** tick 154 — P10 wave-3 row 152 activate credit-grant-validation active_wholesale happy (`a374367`)
- **reseller** tick 153 — P10 wave-3 row 154 activate sandbox-setup active_wholesale happy (`7c9a447`)
- **reseller** tick 152 — P10 wave-3 preflight + schedule doc inline fix (`c54790a`)
- **reseller** tick 151 — P10 wave-2 row 149 activate reveal-email-validation uuid_in_scope happy (`173f716`)
- **reseller** tick 150 — P10 wave-2 row 148 activate reveal-email-authz happy plaintext email (`18b2fe6`)
- **reseller** tick 149 — P10 wave-2 row 147 activate drawer-validation uuid_in_scope + happy (`6281fa2`)
- **reseller** tick 148 — P10 wave-2 row 146 activate drawer-authz happy + fixture attributionExists flag (`c366504`)
- **reseller** tick 147 — P10 wave-2 row 145 activate + attachAttributedCustomer helper (`f76bc88`)
- **orchestrator** platform auto-upgrade 2026-07-22 (`9b0d4e6`)
- **reseller** tick 146 — P10 wave-1 row 144 activate tier_not_allowed branch (`f15e394`)
- **reseller** tick 145 — P10 wave-1 row 143 activate no_capability branch (`2b861ec`)
- **reseller** tick 144 — P10 wave-1 row 142 activate paused reseller_not_active branch (`d93332f`)
- **reseller** tick 143 — P10 wave-1 row 141 activate active_retail branch (`0dc7ffe`)
- **reseller** tick 142 — P10 wave-1 Option A reseller_admin bundle (`4229cbd`)
- **reseller** tick 141 — P10 wave-1 preflight finding + active_retail seed flip (`f9ec623`)
- **reseller** tick 140 — P10 deferred spec activation order doc (`bec6943`)
- **reseller** tick 139 — P10 Option A step 4 mint fixture design doc cohort update (`a9c1eed`)
- **reseller** tick 138 — P10 Option A step 3 reseller fixture per-variant admin email (`75889c7`)
- **reseller** tick 137 — P10 Option A step 2 seed-qa-reseller per-variant admin mirror (`5681d75`)
- **reseller** tick 136 — P10 Option A step 1 seed-test-users multi-admin cohort (`4f33d78`)
- **reseller** tick 135 — P10 preflight scopedReseller collision finding (`ca9afa6`)
- **reseller** tick 134 — P10 §3 Playwright fixture wiring for temp-reseller mint (`4868d35`)
- **reseller** tick 133 — P10 §4 seed-qa-reseller-storage bucket seeder (`a0ac5d1`)
- **reseller** tick 132 — P10 §5 seed-test-users QA account seeder delta (`4b6b7bc`)
- **reseller** tick 131 — P10 requests companion seeder (§2) (`6785f16`)
- **reseller** tick 130 — P10 temp-reseller mint script (stand-alone) (`2750df5`)
- **reseller** tick 129 — CPO §25 rec #4 chapter progress ribbon (`05edcaf`)
- **reseller** tick 128 — COO advisory §h human_blocked digest section (`131e883`)
- **reseller** tick 127 — P10 temp-reseller mint fixture design pass (`25aa522`)
- **reseller** tick 126 — P10 dry-run /api/admin/resellers/[code] GET pre-read validation Playwright spec (`e4b9fed`)
- **reseller** tick 125 — P10 dry-run /api/admin/resellers/[code] DELETE pre-write validation Playwright spec (`8211a0a`)
- **reseller** tick 124 — P10 dry-run /api/admin/reseller-loop/status GET auth-chain Playwright spec (`e044877`)
- **reseller** tick 123 — P10 dry-run /api/admin/resellers/[code] PATCH pre-load validation Playwright spec (`ee176fe`)
- **reseller** tick 122 — P10 dry-run /api/admin/resellers POST validation Playwright spec (`a572395`)
- **reseller** tick 121 — P10 dry-run /api/showcase-reviews GET validation Playwright spec (`51c000c`)
- **reseller** tick 120 — P10 dry-run /api/reseller/billing/save-default-payment-method validation Playwright spec (`7e52bf4`)
- **reseller** tick 119 — P10 dry-run /api/reseller/reports/[month]/signed-url validation Playwright spec (`de8eafd`)
- **reseller** tick 118 — P10 dry-run /api/reseller/customers/[id]/drawer input-validation Playwright spec (`c52a4e2`)
- **reseller** tick 117 — P10 dry-run /api/reseller/customers/[id]/reveal-email validation Playwright spec (`8dffb22`)
- **reseller** tick 116 — P10 dry-run /api/reseller/requests POST auth-chain Playwright spec (`725d648`)
- **reseller** tick 115 — P10 dry-run credit-grant POST auth-chain Playwright spec (`b1118f4`)
- **reseller** tick 114 — P10 dry-run /api/showcase-reviews validation+authz Playwright spec (`0c90bc6`)
- **reseller** tick 113 — P10 dry-run reseller create-startup auth-chain Playwright spec (`a9af37f`)
- **reseller** tick 112 — P10 dry-run reseller-* crons CRON_SECRET auth-chain Playwright spec (`e9ab1a0`)
- **reseller** tick 111 — P10 dry-run admin/resellers/[code] GET auth-chain Playwright spec (`9e6b3b3`)
- **reseller** tick 110 — P10 dry-run reseller/requests GET auth-chain Playwright spec (`ede228c`)
- **reseller** tick 109 — P10 dry-run admin/resellers POST auth-chain Playwright spec (`554e5cc`)
- **reseller** tick 108 — P10 dry-run admin/resellers GET auth-chain Playwright spec (`25ba579`)
- **reseller** tick 107 — P10 dry-run admin/resellers/requests GET auth-chain Playwright spec (`5d7d180`)
- **reseller** tick 106 — P10 dry-run admin/resellers/[code] DELETE auth-chain Playwright spec (`72c35e4`)
- **reseller** tick 105 — P10 dry-run admin/resellers/requests/[id] PATCH auth-chain Playwright spec (`3dfeaf7`)
- **reseller** tick 104 — P10 dry-run reports/[month]/signed-url auth-chain Playwright spec (`c2b316a`)
- **reseller** tick 103 — P10 dry-run admin/resellers/[code] PATCH auth-chain Playwright spec (`9897504`)
- **reseller** tick 102 — P10 dry-run /api/reseller/me auth-chain Playwright spec (`a28147c`)
- **reseller** tick 101 — P10 dry-run drawer auth-chain Playwright spec (`c981c45`)
- **reseller** tick 100 — P10 dry-run reveal-email auth-chain Playwright spec (`8b9c701`)
- **reseller** tick 99 — P10 dry-run billing auth-chain Playwright spec (`9bb5c35`)
- **reseller** tick 98 — P10 dry-run sandbox-setup auth-chain Playwright spec (`0d12af3`)
- **reseller** tick 97 — P10 dry-run code-validate Playwright spec (`55a812d`)
- **reseller** tick 96 — P10 dry-run reseller-requests validation Playwright spec (`c2f8d15`)
- **reseller** tick 95 — P10 dry-run credit-grant validation Playwright spec (`224c9ee`)
- **reseller** tick 94 — P10 dry-run create-startup input-validation Playwright spec (`53cc6c0`)
- **reseller** tick 93 — P11 backfill script for pre-tick-92 retail reseller_attributions (`1d70aff`)
- **reseller** tick 92 — close retail createProject → reseller_attributions gap (last non-human-blocked frontier leaf) (`079d744`)
- **reseller** tick 91 — Playwright spec for audit-anomaly scan (Verification #5 spec-half close) (`1bb57bf`)
- **reseller** tick 90 — /api/cron/reseller-audit-anomaly-scan standalone endpoint (Verification #5 spec-half unblock) (`b1973e7`)
- **reseller** tick 89 — wire audit-anomaly detector into weekly digest cron (`e2a425a`)
- **reseller** tick 88 — P10 audit-log anomaly detector (Verification #5 second half) (`4f1d037`)
- **reseller** tick 87 — P10 audit-log write assertion spec (Verification #5) (`40e1a24`)
- **reseller** tick 86 — P10 service-role Supabase fixture + attribution-timing row 2 unblock (`c26fe14`)
- **reseller** tick 85 — P5 pill i18n + VI Playwright unblock (`3414886`)
- **reseller** tick 84 — P10 dry-run attribution-timing Playwright scaffold (`44010db`)
- **reseller** tick 83 — P10 dry-run co-branding pill Playwright scaffold (`368a9df`)
- **reseller** tick 82 — P10 dry-run Playwright reseller-scope scaffold (`5ad38ed`)
- **reseller** tick 81 — /api/reseller/create-startup opens wholesale Stripe subscription (`71b0554`)
- **reseller** tick 80 — /reseller/settings payment-method-setup UI (`9bbf21d`)
- **reseller** tick 79 — save-default-payment-method endpoint + adapter + pure decision lib (`8aea315`)
- **reseller** tick 78 — Stripe billing adapter + POST /api/reseller/billing/setup-intent (`1ea1b66`)
- **reseller** tick 77 — apply migration 0101 + pure lib for reseller Stripe billing decisions (`d701a88`)
- **reseller** tick 76 — migration 0101 resellers.stripe_customer_id foundation (`140f5f3`)
- **reseller** tick 75 — §24(c) POST /api/reseller/create-startup wholesale route (`caf2a04`)
- **reseller** tick 74 — CS §24(c) create-startup pure decision lib (`5ea5a23`)
- **reseller** tick 73 — CS §24(a) sendWholesaleWelcome() email adapter wired (`634a088`)
- **reseller** tick 72 — CS §24(a) + CPO §25 wholesale welcome-email pure builder (`5ec03f5`)
- **reseller** tick 71 — P5 co-branding email footer wired into welcome + receipt (`393c117`)
- **reseller** tick 70 — CMO advisory §22 /guide/reports download route + redaction (`de51aa6`)
- **reseller** tick 69 — CDO advisory §23 GA4 showcase catalogue (`00acd1b`)
- **reseller** tick 68 — IR advisory §27 close (Channel Economics slide + GTM memo + unicorn masterplan reseller row) (`48c2cc4`)
- **reseller** tick 67 — CMO advisory §22 rec #3 JSON-LD structured data (`b35326b`)
- **reseller** tick 66 — CS advisory §24(c) P11 weekly-digest cron (`753e09a`)
- **reseller** tick 65 — Customer-Success advisory §24 leading-signal KPI lib (`39e2efc`)
- **reseller** tick 64 — COO advisory §27 human_blocked_snapshot telemetry (`868582a`)
- **reseller** tick 63 — Customer-Success advisory §24 denial-reason page render EN+VI (`28524b1`)
- **reseller** tick 62 — Customer-Success advisory §24 Grant modal EN+VI parity (`bb1525b`)
- **reseller** tick 61 — CPO advisory §25 customer-drawer EN+VI parity (`0acb0d4`)
- **reseller** tick 60 — CHRO advisory §26 human-review-minutes KPI (`4f8e888`)
- **reseller** tick 59 — CHRO advisory §26 Div 83A qualifying-tests checklist (`b950ef9`)
- **reseller** tick 58 — CMO advisory §22 brand-wording ("Introduced by") (`908b5b5`)
- **reseller** tick 57 — CDO advisory §23 reviews-aggregate pair suppression (`aacba7c`)
- **reseller** tick 56 — P8.4b end-of-cycle add-on removal via subscription schedule (`cec3c02`)
- **reseller** tick 55 — P0.3 advisory reviews closed (approved_with_notes ×8) (`c90b861`)
- **reseller** tick 54 — B10 integrations catalogue admin (`18d2804`)
- **reseller** tick 53 — B9 reviews & feedback surface (`b53e532`)
- **reseller** tick 52 — B8 reseller linkage (progression deep-links + phase distribution) (`68d5949`)
- **showcase** tick 51 — B7 interactive product tour (`fb857e2`)
- **showcase** tick 50 — B4 guide chapters 9-12 (Funding → Exit) (`e6c07ef`)
- **showcase** tick 49 — B3 guide chapters 5-8 (PMF → Team) (`dd6cc4c`)
- **showcase** tick 48 — B2 guide chapters 1-4 (Vision → MVP) (`211899e`)
- **reseller** tick 47 — P8.4 purchase drawer + add-on lifecycle (`9a6097d`)
- **showcase** Track C.3 Xero case study skeleton + flip menu to live (`8b488a7`)
- **reseller** tick 46 — P8.3 grandfather backfill (0098 applied) (`cdb5ded`)
- **reseller** tick 45 — P8.2 route gating (28 handlers gated, R-03 lint live) (`905b51d`)
- docs/usecases library + Atlassian executable USECASE spec (`2667499`)
- /admin/uptime-guardian dashboard + Track C.2 Canva case study skeleton (`6c6e49b`)
- **reseller** tick 44 — P8.1 feature-gate manifest completeness (28 routes mapped) (`2f33aa6`)
- **auto** publish SEO article via cron (`1c0df0d`)
- **showcase** B1.3 seed + ingest BlockID.au workspace (tick 42) (`333628a`)
- 24/7 uptime guardian + Track C case-study library (Atlassian first) (`99fe61a`)
- **reseller** P1.4 apply migrations 0091-0097 + fix two gaps (tick 41) (`906e253`)
- **reseller** P9.2 /admin/resellers/[slug] detail page + safety-net for loop drift (`237f596`)
- **showcase** B6 public showcase mirror at /showcase/blockid (tick 40) (`0bb4c88`)
- **showcase** B5 report template library at /guide/reports (tick 39) (`a52ed44`)
- **reseller** P9.3 tick 38 — code_request approval mints Stripe coupon+promo_code inline (goal item #6) (`bc5c512`)
- **showcase** B1.2 report-tagging lib — pure filename → DataRoom row mapper (R9 Track B B1) (`68ce004`)
- **reseller** P6.5b widening — thread project_id into 6 more spendCredits callers (R9 § U.4) (`16300a1`)
- **reseller** P7.3 GST reconciliation delta gate (R9 § D2-CFO-03) (`1336030`)
- **reseller** P7.2 signed-URL report storage + retention (R9 § C.6) (`3e82e7a`)
- **reseller** P7.1 monthly KPI report cron (R9 § C.6) (`43c651c`)
- **reseller** P9.3 admin approval requests inbox (`cde3cc3`)
- **auto** T0133 — wire R&D Tax Incentive + ESIC into valuation risk model (`669db67`)
- **reseller** P6.6 grant modal UI at /reseller/credits (`616027e`)
- **reseller** P6.5b hot-path project_id wiring in spendCredits (`ddce097`)
- **reseller** P6.5 sandbox routing in spendCredits (`d1fca8d`)
- **reseller** P6.4 sandbox provision — POST /api/reseller/sandbox/setup (`f6deeba`)
- **reseller** P6.3 grant API — POST /api/reseller/credits/grant (`cf38c80`)
- **reseller** P6.1 + P6.2 reseller_credit_grants schema + pure decision lib (`d35d23a`)
- **reseller** P4.4 R-01 CI grep — /api/reseller/* scope enforcement (`4d9a64a`)
- **reseller** P4.3 portfolio aggregates — k>=5 anonymity + ISO-week quantisation (`adf18b3`)
- **reseller** P4.2 customer drawer — Overview + Progression + Reports (`9debe08`)
- **reseller** P4.1 customer email reveal + audit-log chokepoint (`0807edc`)
- **reseller** P3.1 reconciliation crons — stripe-sync + monthly CSV (`f57c049`)
- **reseller** P9.2 admin/resellers/[code] detail + PATCH + validator (`6e059df`)
- **reseller** P9 admin/resellers list page + POST create endpoint (`f1bbe9a`)
- **reseller** P5 co-branding — topbar pill + Stripe invoice memo + email footer (`0a487b5`)
- **reseller** cron monitor + /admin/reseller-loop live dashboard + auto-stop (`71e360e`)
- **loop** P1.5 gate consolidation done autonomously + safety-net commit (`0c31e83`)
- **reseller** P1.5 gate consolidation — PLAN_PROJECT_LIMITS → plans.usage_limits.profiles (`2b0fbca`)
- **reseller** P3.2b webhook refund integration + loop status file (`d155547`)
- **cron** loop dispatch adds --dangerously-skip-permissions + live status display (`e270ca5`)
- **reseller** P4 pages complete + nav entry + tick-display helper (`53f21db`)
- **reseller** P2.6 checkout stamp attribution + apply promotion_code (`de1e389`)
- **reseller** P2.5 auth wiring + P4.2/P4.3 pages + GA4 events + loop auto-deploy hook (`995c8fa`)
- **reseller** P2.7 consent modal + P4.0 layout + entitlement extension (`3096426`)
- **reseller** P3.4 monthly credit-reset cron + P3.3 clearance cron wired into crontab (`522c5d5`)
- **reseller** P2.4 StepReseller field + P3.2 webhook helpers + P3.3 clearance cron (`63101a4`)
- **reseller** continuous 5-min cron + P2.3/P2.4 via capture + migration 0094 + auto-stop (`ff3ff54`)
- **reseller** P1.3 tests green (31/31) + P2.1 via capture + P2.2 validate endpoint (`eccd683`)
- **reseller** P0.2 delta merge + P1.1 migrations + P1.2 core libs (`c00a92d`)
- **reseller** P0 pre-flight artefacts — plan-delta + goal file + loop cron (`06deaa1`)
- **orchestrator** platform auto-upgrade 2026-07-21 (`3b35064`)
- **product** simplify external funnel + plan-based workspace unlocks (`d74a0c1`)
- **cmo** 3 more SEO pillar articles — DCF/Berkus, cap table, SAFE (`d1ab7c0`)
- **auto** publish SEO article via cron (`1d70e95`)
- **cfo** T0120 3-year financial projections tool (`82fca2e`)
- **devrel** public API documentation at /developers/api (`674afe3`)
- **auto** T0135 bottom-up TAM/SAM/SOM calculator with AU source library (`31ff74a`)

### Fixes

- **pricing** remove crossed-out old prices ($25, $99, 'normally A$25') (`e6b30b5`)
- **reseller** add POST alias to 5 cron routes so scheduler stops 405ing (R9 next_action #7) (`f60321a`)
- **reseller** TS gate — remove AppUser.segment access + tighten scope.sandboxProjectId return type (`d4536d6`)
- **clo** term-sheet regex misclassified "non-participating" as red (`b5c8a64`)
- **qa** 404 sweep — 24 internal links repaired across 11 files + 13 stub pages (`60857c3`)
- **ops** daily pg_dump cron — /data/backups was empty (critical gap) (`abea284`)
- **ops** resolve /data/blockid-releases snapshot warning + backup verify (`a08d46b`)

### Docs

- **reseller** plan-review-cs.md — P0.3 CS advisory (approved_with_notes) (`6ca0e38`)
- **plans** reseller module — U.11 C-Level review, U.12 skill matrix, U.13 workflow schema, U.14 consistency fix pass (`1741c24`)
- **plans** reseller module — U.9 12-phase showcase journey + U.10 supersessions map (`720c035`)
- **plans** reseller module — U.6 idea/project semantics + U.7 progression + U.8 Track B showcase (`877ffb1`)
- **plans** reseller module — founder clarifications (U.1–U.5 + H.13–H.16) (`92c6d51`)
- **plans** add reseller/affiliate module plan (InfoVision first) (`545131f`)

### Chores

- **reseller** tick 44 telemetry — P8.1 manifest completeness (verdict=approved) (`19591cc`)
- **reseller** tick 43 — P0.4 CEO final sign-off (verdict=approved) (`3f3639f`)
- **cron** install reseller module autonomous goal loop @ 03:45 UTC daily (`c5271a0`)
- **ops** reconcile project-state — 29 tasks shipped this session (`dffbdfb`)
- **ops** wire cron for svi-index-populate + email-drip + hygiene (`ed4b020`)

### Other

- **qa** regression pass + coverage bump (`e0851d8`)
- audit + 3 top wins — long-cache images, trim /insights payload, cache version.json (`cf82b1d`)

## v3.0.0 — 2026-07-20 (major)

### Features

- **cdo** backfill + ongoing populator for svi_index_snapshots (`e8bc002`)
- **rnd** T0111 AI Idea Lab — sector-aware angle generator (`d3db6e6`)
- **chro** ESOP grant tracker + Div 83A eligibility checker (`d456ece`)
- **coo** /admin/ops operational metrics dashboard (`d7bacf9`)
- **orchestrator** platform auto-upgrade 2026-07-20 (`7689534`)
- **rnd** T0121/T0123 wire 3 pricing/CTA experiments into live surfaces (`94427ab`)
- **ir** investor pack PDF generator (`bae37f1`)
- **cmo** 3 SEO pillar articles — valuation, readiness, ESIC/R&D (`36c4091`)
- **ccso** onboarding email drip + NPS pulse (`1d37b9f`)
- **cdo** public SVI Index dataset — /api/index/svi + /dataset page (`0c5e8ef`)
- **ciso** security hardening — rate-limit + headers + secrets audit (`140e24e`)
- **rnd** T0016 Evidence Vault Phase 2 — GitHub/Stripe/GA4 OAuth connectors (`6c339da`)
- **cso** T0206 pricing & segment A/B test infra (`1adb7f3`)
- **cfo** T0088 Fundraising Readiness Report v2 (`7022b89`)
- **clo** T0087 Term Sheet AI v2 — persist + Lawyer Questions + SVI link (`3dea034`)
- **cpo** T0130 First-Principles Question Engine (`7745c4a`)
- **svi** wire hero to live analyzer + per-project SVI page (`800c263`)
- **auto** T0128 CFO — /guides/valuation-methods reference page (`eda56ae`)

### Fixes

- **cpo** first-principles secondaryFeatures always returns 2+ items (`fc4f27f`)
- **cdo** CSV endpoint emits headers even when snapshot table is empty (`208c4d6`)

### Chores

- **qa** end-to-end verification report — 11 features, 6 deploys (`bc83e2b`)
- **ui** sweep text-ink-8000 typo across 17 files (`d2d82f3`)
- **ui** polish pass on hero, analyzer, workspace surfaces (`5962166`)
- **ops** disk + process cleanup 2026-07-20 (`9dc5cc0`)

### Other

- **qa** Playwright E2E smoke suite — 5 specs covering critical paths (`03f7e2e`)

## v2.7.0 — 2026-07-19 (minor)

### Features

- **orchestrator** platform auto-upgrade 2026-07-19 (`500be48`)
- **auto** T0110 CFO — AU R&D Tax Incentive + ESIC evaluator (`ebda143`)

## v2.6.0 — 2026-07-18 (minor)

### Features

- **orchestrator** platform auto-upgrade 2026-07-18 (`3c630ee`)

### Fixes

- **deploy** Next 16 /index route double-nesting workaround (`b4b5280`)

## v2.0.0-beta.10 — 2026-07-17 (Phase 12 — real MRR + LLM C-level + startup index + VI i18n)

### Features

- **startup-index** T-1300 Goal 5C schema + /listings directory + [ticker] detail (`0a807ac`)
- **i18n** T-1400 Goal 5D Vietnamese locale scaffold + /vi/* routes + nav switcher (`bc857c4`)
- **quality-gate** T-1102 wire Anthropic LLM into nightly C-level review (`4777282`)
- **cfo** T-1007 real MRR view + admin/pricing-metrics real MRR tiles (`51f33f5`)
- **auto** T0122 wire sector ARR multiples into projection norms (`446902f`)

### Fixes

- **deploy** FORCE_RESYMLINK_SCOPED list — always overwrite @swc/helpers partial copy (`312b8fa`)

## v2.0.0-beta.9 — 2026-07-17 (Phase 11 — Goal 5A + 5B first scaffolds)

### Features

- **quality-gate** T-1100 Goal 5A nightly C-level review orchestrator (stub mode) (`6cec852`)
- **investor-pack** T-1200+T-1201 Goal 5B first scaffold — PDF template + preview endpoint (`1ea0a4a`)

## v2.0.0-beta.8 — 2026-07-17 (Phase 10 — Goal-5 plans + perf + security)

### Features

- **security** T-1011..T-1014 — security.txt + 4 runbooks + wholesale gate wired (`b560cc1`)

### Docs

- **goals** 4 Goal-5 execution plans + orchestrator tracking + platform-roadmap extended (`b0e0ccf`)

### Other

- next.config optimizePackageImports + roadmap version.json cache + perf-cleanup report (`e2db1e0`)

## v2.0.0-beta.7 — 2026-07-17 (Phase 9 — fintech shell + CRO wire + plan v3.1)

### Features

- **design+cro** unified fintech marketing shell + wire dead CRO triggers + 9 pages migrated (`1e747b4`)
- **analytics** T-1010 BigQuery export pipeline for analytics_events (`e91c3c6`)
- **orchestrator** platform auto-upgrade 2026-07-17 (`df9ac67`)
- **design** fintech-unicorn palette + search-first hero (ui-ux-pro pass) (`8b56ed0`)
- **nav+home+dns** dropdown menu categories + honest partner strip + config-driven DMARC updater (`7aea6e0`)

### Fixes

- **deploy+seo** CTO Fix #2 (full node_modules symlink) + sitemap adds 7 + /pricing canonical+OG (`354dd26`)
- **links** audit + close 11 broken/404 links across landing surfaces (`cff2791`)
- **home v2** drop fabricated LogoCloud, replace with honest 2-line trust strip (`aa67c1f`)

### Docs

- **plan** IMPLEMENTATION-PLAN-v3.1 amended — synthesised 6 C-level reviews + 4 new goals (`6c00ed0`)
- **cro+cmo** review v2.0.0-beta.6 — 10 triggers dead + 4 A/Bs dead + /pricing missing canonical (`51faf13`)
- **cto** review v2.0.0-beta.6 — top-5 tech-debt fixes for v2.1 (`92ec9fd`)
- **cdo** review v2.0.0-beta.6 — two trackEvent impls, 36% dead client events, no BQ export (`671a810`)
- **ciso** review v2.0.0-beta.6 — CSP gap live, audit-chain 0 rows, DMARC visibility trade-off (`370d519`)
- **cfo** review v2.0.0-beta.6 — pricing sanity, real MRR SQL, save-offer breakeven, GST posture, runway formula proposal (`27b73e5`)
- **plan** IMPLEMENTATION-PLAN-v3 — Phase A-E roadmap for v2.1 → GA (~6 weeks) (`8871971`)
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
