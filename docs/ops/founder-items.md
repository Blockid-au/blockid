# Founder items — what still needs a human (G25-B, 2026-09-21)

> **Planning authority — 2026-09-22:** [G30 SOURCE OF TRUTH](../plans/SOURCE-OF-TRUTH.md), proposed and awaiting founder review, owns new priorities and sale gates. This file is an operational inventory, not implementation authorisation. Capacity, payment parity and buyer scope may block the corresponding sale path until verified; other items may have working fallbacks. Do not assume that every item is non-blocking.

The founder decision of 2026-09-21 (Claude CLI subscription fallback, optional Anthropic API key) was implemented in G25-B. The items below require account access, signatures or business decisions, and their current status must be rechecked at the approved implementation baseline.

## Resolved in G25-B (no founder step)

| Was a founder item | Now |
|---|---|
| "Rotate / set a valid `ANTHROPIC_API_KEY`" (S31-A, G14, G24 close notes) | **Optional.** Absent = silent `not_configured`; the Claude CLI subscription is the Anthropic path (fallback after the DeepInfra-first chain). Deploy gate 1 no longer lists the key; nightly review, prompt eval and the term-sheet tool run without it. `docs/ops/ai-providers.md` |
| "Approve the five demo-cohort company names before a public demo" (G24-C) | Delegated register check done: Wattlebyte and Pelicanpay collided → **Banksiabyte Compliance** and **Numbatpay Ledger** (old slugs still resolve). `docs/ops/demo-cohort.md` § "Name check 2026-09-21" |
| "Curate the first funding-announcements CSV" (G24-B) | Committed: `web/content/external-signals/funding-announcements-2026-09.csv` — 33 public AU rounds (Oct 2025 – Sep 2026), every ABN checksum-verified, every row linked to Startup Daily / SmartCompany / Capital Brief / Forbes Australia / the company's own release. The weekly ingest reads repo sheets first, then `~/blockid-data`. |

## Still needs a human

| # | Item | Why a human | Where |
|---|---|---|---|
| 1 | **Stripe dashboard** — set `tax_behavior` (GST-inclusive) on the evaluator monthly prices (Scout / Firm / Program) and the Cohort 25 / 100 monthly prices; mint the missing **annual** Starter / Growth prices (or drop the annual copy); archive the legacy prices on the list; mint `STRIPE_PRICE_~~COHORT_PILOT_25/50~~ (retired with G25 — pilots are not sold) | Stripe account owner only; one blockid.au Stripe, never per-reseller | `docs/ops/pricing-truth.md`, `docs/ops/pilots.md`, weekly `stripe-price-audit` cron reports drift |
| 2 | **Telegram bot token** — the old token answers 401 (alerts fall back to e-mail); revoke it in @BotFather and mint a new one into `web/.env` (`TELEGRAM_BOT_TOKEN`) | BotFather is a personal Telegram session | `docs/ops/slo.md`, `scripts/error-digest.mjs` e-mail fallback |
| 3 | **GitHub token** — `GITHUB_TOKEN` (fine-grained, read-only public repos) so the outcome-signals cron can read release tags and G21 release proposals can post; **revoke the old GitLab PAT** | Minted under the founder's GitHub account; the repo is public so scope it read-only | `lib/outcomes/proposals.ts`, `docs/runbooks/secret-rotation-log.md` |
| 4 | **Legal signatures** — LOIs / first-customer agreements (Cohort plans) with the first evaluator customers, the FI validation interviews (5 interviews · 3 demos · 2 proposals · 1 first paying program), F-1 entity choice on the footer (default keeps both roles) | Contracts and named counterparties | `docs/ops/pilots.md`, `lib/site/legal-entity.ts` |
| 5 | **Google Drive off-site backup OAuth** — run `node --env-file=web/.env scripts/db-backup-offsite-auth.mjs` once in a browser session | Consent screen needs the founder's Google account | `docs/runbooks/db-restore.md` |
| 6 | **Secret rotation** — `STRIPE_WEBHOOK_SECRET`, Supabase service-role key (history was rewritten 2026-09-10; rotation is the belt) | Provider dashboards | `docs/runbooks/secret-rotation-log.md` |
| 7 | **Money / accounts (only if wanted)** — fund an Anthropic API key for a paid trial wave (§3 of `ai-providers.md`); top up OpenRouter above `OPENROUTER_MIN_CREDIT_USD`; GA4 Admin API + service-account Editor; Cloudflare Email Obfuscation off | Spend and account ownership | `docs/ops/ai-providers.md` §3/§6, `docs/ops/analytics.md` |
| 8 | **GrantConnect CSV export** — grants.gov.au 403s non-browser clients; export the Grant Award CSV in a browser and drop it under `~/blockid-data/external-signals/business-gov-grants/` (or commit it as `web/content/external-signals/business-gov-grants-YYYY-MM.csv`) | Browser-only site | `docs/ops/data-sources.md` §5 |
| 9 | **Paid AI capacity** — on 2026-09-21 the whole free chain failed in one run (DeepInfra worker timeouts, Gemini 429/503, Claude CLI 429, Groq 429, **Cerebras 402 = free tier exhausted**, SambaNova 404). The free-report funnel needs at least one funded provider (DeepInfra credit, or OpenRouter top-up) — decide and fund; G29 prunes the dead rungs automatically | Money | `docs/ops/ai-providers.md` § 11–12, `/api/status.ai` (`unfunded` / `dead_rungs`) |
| 10 | **startupvalueindex.com git remote** — the repo at `~/startupvalueindex.com` has no reachable origin (push failed 2026-09-21); its light-template release is committed locally on `main` and deployed. Create a GitHub repo and set `origin` | Account | `git -C ~/startupvalueindex.com remote add origin <url>` |

Keep this file short: when an item is done, delete its row (the runbooks above hold the how-to); when a new one appears, add one row with the *why a human* column filled — if that column is empty, it is not a founder item and an AI session should resolve it.
