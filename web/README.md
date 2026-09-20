# `web/` — the BlockID.au Next.js app

> Last verified: 2026-09-19 (v3.16.0, G18-B). The product, pricing and ops overview is in the repo-root
> [`README.md`](../README.md); agent conventions are in [`AGENTS.md`](./AGENTS.md) / [`CLAUDE.md`](./CLAUDE.md).
> This app is **not** deployed with Docker Compose or Caddy any more — that 2026-05 setup is archived under
> `docs/archive/`. Production is a bare-metal standalone build behind system nginx (`docs/ops/deploy.md`).

- **Live:** https://blockid.au (`www` → 301 apex, canonical https enforced by nginx)
- **Stack:** Next.js 16 App Router (webpack, `output: "standalone"`) · React · Tailwind v4 · TypeScript · Vitest ·
  Playwright · self-hosted Supabase Postgres · Stripe · nodemailer
- **Design contract:** `../docs/design/unicorn-template.md` (marketing pages) · `../docs/design-system.md` (tokens)

## Layout

```
web/
  src/app/
    (marketing)/         # public site on the unicorn template: home, product, samples, solutions, pricing, pilot,
                         #   about, team, roadmap, changelog, methodology, compare, insights, funding, legal …
    (app)/               # signed-in workspace + dashboard + admin (persona landings, nav v4, phase gating)
    analyze/ apply/ tbr/ id/ s/       # one-field intake, program intake link, shared reports, Business ID, share links
    docs/  developers/   # public platform docs, /developers/api (registry-driven), /docs/unlocks
    api/                 # 650+ route handlers — api/v1 (partner + Evaluator API), api/cron (CRON_SECRET),
                         #   api/webhooks, api/stripe, api/auth, api/reports, api/index, api/openapi.json …
    vi/ es/ ja/          # locale mirrors (EN ↔ VI is the maintained pair; reserved terms in lib/i18n)
  src/lib/               # domain logic (svi-analysis, report pipeline, agents/, funding/, webhooks/, api-v1/,
                         #   entitlements, credits, project-state, seo/, i18n/, …) — 400+ modules
  src/components/        # marketing/ (template primitives, nav, footer), tbr/, landing/, workspace/, ui/
  src/config/pricing/    # plans.csv → plans.generated.ts (build step) — the price catalogue
  content/               # runtime data the app reads at request time (reports/version.json, project-state.json,
                         #   ai-provider-registry.json, team-roster.json, pilots.json, grants/programs seeds, insights)
  supabase/migrations/   # 0001 … 0412 — applied by hand with scripts/db/apply-migration.sh, never by deploy
  scripts/               # deploy-live.sh (12 gates), qa-live.sh, link-check.mjs, cron-runner.sh, crontab.production,
                         #   error-digest / latency-sample / funnel-report, version-bump.mjs, db/, backtest/, pitch decks
  tests/e2e/             # Playwright: smoke, post-deploy hydrated smoke, a11y, nav, live-qa lanes
  CHANGELOG.md           # rendered by /changelog
```

## Everyday commands

```bash
npm ci
npm run dev                  # http://localhost:4001 — note: the CSP has no unsafe-eval, so dev mode does not
                             #   hydrate client components; verify interactivity on a production build / live
npm run typecheck            # tsc --noEmit with an 8 GB heap — 0 errors before any deploy
npm run lint                 # eslint — 0 errors (warnings allowed); lint:audit / lint:reseller / lint:docs-plans-secrets
npm test                     # vitest — colocated *.test.ts(x) next to the code they pin (~37k tests, `pdf` project 20 s)
npm run e2e:smoke            # Playwright smoke tier; npm run e2e:post-deploy runs the hydrated post-swap smoke
npm run qa:live              # live QA suite against production (docs/ops/live-qa.md) — after every workspace deploy
node scripts/link-check.mjs --base http://127.0.0.1:4001 --no-external     # docs/ops/link-check.md
npm run backtest             # SVI calibration backtest (docs/ops/crontab-setup.md §backtest)
```

## Ship

```bash
DEPLOY_NOTE="what shipped" bash scripts/deploy-live.sh   # gitleaks → env → DB/Redis → tsc → eslint → vitest → build →
                                                          # temp-port smoke + e2e + link check → DB query → port swap →
                                                          # live verify (bundle SHA) → hydrated Playwright smoke
bash scripts/deploy-live.sh --wait                        # one deploy at a time; wait for a peer session
bash scripts/deploy-live.sh --rollback [--dry-run]
```

Rules that bite: the tree must be clean (cron-written `content/**` outputs are gitignored or filtered); a build
carries the SHA it was started on, and gate 11 refuses a live bundle whose SHA does not match; deploys never apply
migrations (`scripts/db/apply-migration.sh`, then commit `content/reports/schema-migrations.json`); after every
deploy, review → test → fix before the next phase.

## Conventions

- **Route handlers:** every mutating route goes through `apiRoute()` (audit row, hash chain, CSRF/edge gate);
  cron routes check `Authorization: Bearer $CRON_SECRET` in constant time; JSON bodies through `readJsonBody`
  (400, never 500). Outbound fetches use the SSRF-guarded fetcher.
- **Money:** spend credits before the run and refund on failure (`lib/credits.ts`, atomic RPC); prices come from
  `plans.csv`, never literals; show cost + word count before charging.
- **Content vs src:** writing under `content/` never triggers a rebuild — crons and the CEO loop write there;
  `src/` changes deploy off-peak.
- **Versioning:** `package.json` + `content/reports/project-state.json` are bumped by the CEO implementing-plan
  loop (`api/cron/agent-orchestrator`); `content/reports/version.json` (→ `/api/status`, footer badge, `/version`,
  `/roadmap`) by `scripts/version-bump.mjs`. Keep them equal (`v3.16.0` today) and add a `CHANGELOG.md` section.
- **Tests:** colocated and authoritative; the `site-meta` sweep pins every indexable page's title ≤ 65 /
  description 70–165 chars; registry tests pin the public API surface (`lib/api-docs-registry.test.ts`).
- **Copy:** evaluator-first; "8 SVI dimensions" is the public term ("13 criteria" is the internal rubric); marketing
  entity PPL Food PTY LTD, billing / legal Auschain PTY LTD; no invented customer counts; no prices on the home page.
