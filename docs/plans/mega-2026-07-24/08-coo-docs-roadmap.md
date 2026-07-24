# 08 — COO: Docs / Changelog / Roadmap / Team Refresh

> Parent plan: `docs/plans/SOURCE-OF-TRUTH.md`
> Owner: COO agent · Sprint: mega-2026-07-24
> User ask (VI): "cần update lại các phiên bản đầy đủ history lên version và update các task, roadmap, team member C-Level agent và các feature đã hoàn tất."

## 1. Problem

The public-facing "what have we shipped" surfaces are stale and inconsistent:

- `web/CHANGELOG.md` only has 4 entries (v2.0.0-beta.3..6). We are on `v2.0.0-beta.10` per `web/.deploy-manifest.json` and the git log shows ~7 days of unrecorded shipping (`feat(reseller)` P11.40–P11.45, `feat(compliance)` P1n-*, `feat(atlassian-goal)` P10/P12b, plus continuous `chore(loop)` auto-ticks that must NOT surface).
- `docs/ROADMAP.md` was last updated 2026-06-17 (v2.6) — five weeks of Phase-3/4 work (SVI Exchange v0.9, reseller module P0–P11.45, S708 counter, Atlassian-goal exit-readiness tile, real-world-workflow parity remediation) is missing.
- There is no `/team` page. We have 11 C-Level skills under `.claude/skills/{cdo,cfo,chro,ciso,clo,cmo,coo,cpo,cro,cto,customer-success}` (verified 2026-07-24) but zero public-facing roster — investors, resellers, and founders have no way to see who runs what.
- `/version` route exists but hard-codes marketing copy; it does not read the live `web/.deploy-manifest.json` (git SHA + deploy timestamp + `v2.0.0-beta.10`), so users can't tell which build they're on.

## 2. Deliverable

### 2.1 Regenerate `CHANGELOG.md`

Author: `scripts/docs/regenerate-changelog.mjs` (new).

Algorithm:

1. `git log --pretty=format:'%H%x09%aI%x09%s' --no-merges` from repo root.
2. Drop lines matching `/^chore\(loop\):\s*autonomous tick/` and `/^chore\(loop\):\s*commit uncommitted/` — these are auto-tick noise (risk callout below).
3. Parse conventional-commit prefix `type(scope): subject`. Bucket into `Features (feat)`, `Fixes (fix)`, `Chores (chore, refactor, perf, test)`, `Docs (docs)`. Unknown → `Other`.
4. Version boundary detection: read `web/.deploy-manifest.json` history if we start storing it; for now walk `git tag --sort=-creatordate` if any exist (currently none), else synthesize by scanning commit subjects for `v2.0.0-beta.N` markers and by scanning `web/.deploy-manifest.json`'s prior versions (recover from `git log -p web/.deploy-manifest.json | grep '"version"'`).
5. For each version window, emit a `## vX.Y.Z-<pre> — YYYY-MM-DD (headline)` header. Headline = the highest-signal `feat(...)` subject in the window, or a fallback like `"reseller + compliance + exit-readiness"`.
6. Within each version: `### Features` / `### Fixes` / `### Chores` lists — one bullet per commit, `- **scope** subject (`sha7`)`.
7. Preserve the existing 4 hand-written v2.0.0-beta.3..6 blocks as-is (do not clobber human-authored release notes); the generator only appends versions **newer** than the newest hand-authored one.
8. Write to `web/CHANGELOG.md` (existing consumer path — `web/src/app/changelog/page.tsx` reads it via `path.join(process.cwd(), "..", "CHANGELOG.md")` and `web/CHANGELOG.md` fallback).

Idempotent — re-running produces identical output for the same git history.

### 2.2 Update `docs/ROADMAP.md`

Insert after Phase 2.6 (which ends at v2.17):

- **Phase 2.7 — Reseller module v1 (Completed - July 2026)** — all P0–P11.45 sub-tasks with checkboxes, link back to `docs/plans/reseller-module-goal.md`.
- **Phase 2.8 — Compliance forms (Completed - July 2026)** — GST threshold form, S708(1) small-scale counter form, S708 register adapter.
- **Phase 2.9 — Atlassian goal / exit-readiness (Completed - July 2026)** — `/dashboard/exit-readiness` founder tile (P12b-tile), S708OfferEvent normaliser (P10).
- **Phase 2.10 — Real-world workflow parity (In progress)** — mark items 1–5, 8, 9 shipped; items 6, 7, 10 as "founder review".

Rewrite the "Last updated" header to `2026-07-24 (v2.0.0-beta.10 shipped)`.

Split "Phase 3: Growth (June - July 2026)" list — mark shipped items (PDF branding customisation, share buttons, pricing A/B — already covered in v2.8) with `[x]`.

### 2.3 New `/team` public page

Route: `web/src/app/team/page.tsx` — public marketing page (no auth) that lists all 11 C-Level agents.

Data source: `scripts/docs/regenerate-team-page.mjs` reads:

- `.claude/skills/{cdo,cfo,chro,ciso,clo,cmo,coo,cpo,cro,cto,customer-success}/SKILL.md` → title + one-line description (first paragraph after front-matter).
- `web/content/reports/` — glob `${agent}-daily-*.md` and `${agent}-history.jsonl` → count last-30-days outputs per agent.

The generator writes a static JSON to `web/content/team-roster.json` at build time:

```json
[
  {
    "slug": "cdo",
    "role": "Chief Data Officer",
    "tagline": "Data strategy, analytics quality, AI governance",
    "responsibilities": ["Data moat assessment", "Bias monitoring", "ETL pipelines"],
    "recentOutputs30d": 12,
    "lastReport": "2026-07-23",
    "colorAccent": "sky"
  }
]
```

Page renders:

- Marketing hero: "Meet the AI C-Level team".
- Grid of 11 cards (3-col desktop, 1-col mobile) — role, tagline, recent-output count chip, "View profile →" link.
- Footer CTA strip: link to `/changelog` and `/roadmap`.

Follow the `MarketingShell` / `MarketingHero` / `MarketingCtaStrip` pattern used in `web/src/app/changelog/page.tsx` for visual consistency.

### 2.4 New `/team/[agent]` per-agent profile

Route: `web/src/app/team/[agent]/page.tsx` — dynamic segment matches slug.

Reads the same `web/content/team-roster.json` + a per-agent detail JSON `web/content/team/${agent}.json` written by the regenerator with:

- Full skill description (from `.claude/skills/${agent}/SKILL.md`).
- Recent activity table (last 10 entries from `${agent}-history.jsonl` or `${agent}-daily-*.md`, newest first, columns: date, title, link).
- KPIs owned (parsed from `.claude/goals/*.md` where the agent is assigned).

`generateStaticParams` returns the 11 slugs so it prerenders at build time. `notFound()` on unknown slug.

Per `web/AGENTS.md` — this is not vanilla Next.js. Before writing the file, load the local guide via `node_modules/next/dist/docs/routing.md` (and any params.md sibling) to confirm the dynamic-segment API for our Next 16 fork.

### 2.5 Version page live-data wiring

Edit `web/src/app/version/page.tsx`:

- Add a top card that reads `web/.deploy-manifest.json` (fs, same pattern as `readChangelog` in `changelog/page.tsx`) and shows: `version`, `git_sha` (linked to GitHub commit), `deployed_at` (relative time), and `task_id`.
- `export const dynamic = "force-dynamic"` so the card updates every request without a rebuild.
- Fallback UI when the manifest is missing.

### 2.6 SOURCE-OF-TRUTH append

Append `## 6. Shipped (last 30 days)` section to `docs/plans/SOURCE-OF-TRUTH.md` listing the same feature buckets that land in `ROADMAP.md`, with commit SHAs and back-links to the plan docs. Automation-friendly: the regenerator will rewrite only this section between two sentinel comments (`<!-- shipped:begin -->` / `<!-- shipped:end -->`) so hand edits above are safe.

## 3. Risks

- **`chore(loop)` autonomous-tick noise** — the loop runs every 5–10 min. Without filtering, the changelog would be 90% autonomous-tick spam. The filter regex in §2.1 step 2 handles this; add a unit test in `scripts/docs/__tests__/regenerate-changelog.test.mjs` asserting the filter drops those subjects and keeps `feat(reseller)` ones.
- **Git reset loop** (per user memory `feedback_autonomous_git_reset.md`) — any files this plan writes must be committed and pushed inside the same tick, or a background `git reset --hard` will destroy them.
- **Skill front-matter drift** — if a `.claude/skills/*/SKILL.md` renames its title, the roster page will silently update. Add a `manifest.json` sanity check listing the expected 11 slugs — fail the regenerator if a slug is missing.
- **Next 16 conventions** — per `web/AGENTS.md`, this is not the Next.js the model was trained on. Both new routes must be reviewed against `node_modules/next/dist/docs/` (routing, params, dynamic) before commit.
- **`process.cwd()` in production** — the standalone Next 16 tracer must include `.claude/skills/**` and `web/content/**` in the copy list; verify `deploy-live.sh` already ships these (they are read at request time by the team pages if we ever move away from build-time JSON, but with the static JSON approach at build only, only `web/content/team-roster.json` + `web/content/team/*.json` need shipping — which they will, since they live under `web/content/`).

## 4. Acceptance criteria

1. `web/CHANGELOG.md` contains all versions from `v0.1` through `v2.0.0-beta.10`, grouped by `Features` / `Fixes` / `Chores`, with `chore(loop)` auto-ticks filtered out. `/changelog` renders them via the existing sidebar-jump layout.
2. `/team` renders exactly 11 agent cards in stable slug order (`cdo, cfo, chro, ciso, clo, cmo, coo, cpo, cro, cto, customer-success`).
3. `/team/cdo` (spot check) renders the CDO tagline, last-10 activity table, and KPIs, and returns 404 for `/team/does-not-exist`.
4. `docs/ROADMAP.md` has a clear "Completed" section covering v2.7–v2.10 (reseller, compliance, atlassian-goal, real-world parity) and an "In progress" section that no longer claims June items are future work.
5. `/version` page shows the current `git_sha` (7-char short) and `deployed_at` from `web/.deploy-manifest.json` and updates on redeploy without a rebuild.
6. `docs/plans/SOURCE-OF-TRUTH.md` gains a `## 6. Shipped (last 30 days)` section between sentinel comments; the regenerator overwrites only the sentinel-bounded region.
7. Both regenerator scripts are idempotent — a second run in the same commit produces zero diff.

## 5. Execution order (single tick)

1. `scripts/docs/regenerate-changelog.mjs` → run → commit `web/CHANGELOG.md`.
2. `scripts/docs/regenerate-team-page.mjs` → run → commit `web/content/team-roster.json` + `web/content/team/*.json`.
3. Hand-edit `docs/ROADMAP.md` + append SOURCE-OF-TRUTH shipped section.
4. Write `web/src/app/team/page.tsx` + `web/src/app/team/[agent]/page.tsx` (after reading the Next 16 routing docs).
5. Edit `web/src/app/version/page.tsx` to add the deploy-manifest card.
6. Commit + push before the next `chore(loop)` git-reset tick.
