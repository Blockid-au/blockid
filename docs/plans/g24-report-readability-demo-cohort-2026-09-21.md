# G24 — Report readability · demo cohort for buyer demos · AI-run integrity

**Opened:** 2026-09-21 (standing founder directive: after each deploy → review → test → fix → next phase, continuously).
**Owner:** Claude session loop — worktree lanes → merge → full `--project unit` + pdf → 12-gate deploy → elevated live-qa + link-check + page sweep → read-only review → fixes → close.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G24 · `ROADMAP.md` row G24.
**Status:** OPEN — lanes launching on top of v3.23.0 (`c6e94a033`).
**Sources:** G23-A close notes (the live showcase renders raw `[ev:<uuid>]` / 52 × `[unevidenced]` markers in prose; `ai_runs_prompt_version_id_fkey` fails on every self-report call; `ANTHROPIC_API_KEY` 401 in the cron); the advisor plan's validation Level 2 ("3 workflow demos") — today a demo needs a real cohort with real founders; G21 follow-ups (`funding_round` signal has no feed; benchmark segments publish nothing under n ≥ 10).

## 1. Baseline (v3.23.0)
| Gap | Where | Effect today |
|---|---|---|
| Citation markers rendered raw | `components/tbr/v2/shared.tsx` Prose / Bullets, PDF + DOCX twins | `/showcase/blockid/report` prints `[ev:9f2c…]` and `[unevidenced]` inline — the grounding work made the report *less* readable |
| No way to demo a cohort without real applicants | `/workspace/accelerator` + `/workspace/evaluations` | a program buyer sees an empty cohort until they import their own CSV; the founder cannot run a 10-minute workflow demo |
| `ai_runs` insert fails on every pipeline call | `lib/ai/call-structured.ts` ~L487 (`prompt_version_id` = NIL / unregistered) | no AI-run ledger rows → cost / latency / provider metrics blind for the report pipeline |
| Invalid Anthropic key keeps being tried | provider chain, self-report cron log 401s | wasted calls + noisy logs; the CLI fallback rule says Anthropic is fallback only |
| `funding_round` outcome proposals never fire | `lib/outcomes/signals` — no feed | outcome ledger under-populated for the calibration |

## 2. Lanes (parallel worktrees; each runs the FULL unit suite + pdf + tsc + eslint before reporting; `git merge master` before the final run; lanes never edit SOT/ROADMAP/roadmap-v2)

### A — Evidence citations as footnotes (skills: ui-ux-pro-max before markup, react-expert, svi-scoring, code-reviewer)
Files: `components/tbr/v2/shared.tsx` (+ any Prose/Bullets consumer), `lib/report-v2/{citations,grounding}.ts` (new pure parser), PDF twin `lib/pdf/report-v2-*.tsx`, DOCX twin, `lib/i18n/messages/{en,vi}.json`, `app/showcase/blockid/report`.
1. Pure `parseCitations(text, register)` → segments `{ text } | { cite: { n, id, label, level } } | { unevidenced }`; numbering is stable per report (first appearance order), one number per register row.
2. Prose/Bullets render `[ev:<id>]` as a superscript `<sup><a href="#ev-n">n</a></sup>` (44 px hit target on touch via padding, token colours, focus ring); `[unevidenced]` becomes a small muted chip "unverified" with a title; unknown ids render nothing (never the raw marker).
3. "Evidence cited" appendix section at the end of ReportV2 (and the PDF/DOCX twins): n · label · evidence level · source kind · date; EN + VI copy; the appendix is omitted when nothing is cited.
4. Grounding audit unchanged (it reads the markers before render); a test pins that no `[ev:` / `[unevidenced]` string reaches the DOM / PDF text for the demo fixture.
Live-qa: extend `42-csp-public-routes` or `31-marketing`: `/showcase/blockid/report` body contains no `[ev:` and no `[unevidenced]`, and has ≥ 1 `sup a[href^="#ev-"]` when the showcase has citations (fail-soft when the persisted report predates the lane — assert only the absence of raw markers).

### B — AI-run integrity (skills: debugging-wizard, monitoring-expert, supabase-postgres, postgres-pro)
Files: `lib/ai/call-structured.ts`, `lib/ai/prompt-versions*.ts` (or wherever prompt versions are registered), migration `0435_ai_runs_prompt_version_nullable.sql` only if needed, `lib/ai/provider-health*.ts`, `scripts/run-self-analysis.mjs`, `lib/outcomes/signals/*`, `docs/ops/ai-runs.md`.
1. Root-cause `ai_runs_prompt_version_id_fkey`: register the pipeline's prompt version rows on first use (upsert by `(name, version)`) or write `NULL` when the id is unregistered — never drop the row; a test pins both paths.
2. Provider chain: a 401 / invalid-key response marks the provider "unconfigured" for the process lifetime (health strike, not a retry) and the log says so once; Anthropic stays fallback-only; no key values ever logged.
3. `funding_round` outcome signal: feed from the existing external-signals sources (`external-signals-latest.json` / feed adapters) — proposals only, human confirmation as today; test with a fixture.
4. Error digest: `tbr_quality.status !== "ok"` for > 24 h raises one digest line (no Telegram token needed — e-mail fallback path).
Live-qa: none new (unit + a `scripts/cron-runner.sh` dry-run of the signals endpoint from the merge session).

### C — Demo cohort for buyer demos (skills: cpo, customer-success, playwright-e2e, ui-ux-pro-max, au-compliance)
Files: `lib/evaluations/demo-cohort.ts` (new), `app/api/evaluations/batch/demo/route.ts` (new), `workspace/accelerator/**` + `workspace/evaluations/**` empty states, `lib/svi/demo-register*` (read), `docs/ops/demo-cohort.md`, live-qa `37-cohort`.
1. `POST /api/evaluations/batch/demo` (evaluator entitlement, 1 demo batch per org/user, idempotent): creates a batch flagged `is_demo` (column on `evaluation_batches` via `0436_evaluation_batches_is_demo.sql`, default false) with 5 fictional startups scored from the DEMO register fixtures (no AI call, zero cost, deterministic scores, evidence levels L1–L5 spread, one "conflicting claim", one "stale connector") so every cohort feature (filters, compare, overrides, snapshots, cohort report, demo-day pack, feedback letters) has data.
2. Fictional names + ABN-free, every company card carries a "Demo data — fictional" chip; demo batches are excluded from benchmarks, calibration, the index, org exports and the validation tracker auto rows (pin with tests); "Remove demo cohort" deletes it (owner only).
3. Empty states on `/workspace/accelerator`, `/workspace/evaluations` (Cohorts) and the pilot page offer "Load a demo cohort" next to "Import CSV"; the pilot kit checklist gains "Ran the demo cohort" as a pre-step.
4. `/admin/validation` Level 2 auto row counts demo batches created by external (non-admin) seats as "workflow demo run" evidence.
Live-qa: `37-cohort` (k): demo batch create → 5 items visible with the chip → cohort report 200 → remove → 404; excluded from `/api/v1/institutional/cohorts`.

## 3. Acceptance
0435 (if any) + 0436 applied + ledger; full unit + pdf green; deploy 12/12; elevated live-qa green incl. lanes 37 (k) + 42; showcase report shows footnotes and no raw markers; link-check 0 internal broken; sweep 0; read-only review → fixes; `version.json` v3.24.0; SOT § G24 closed; memory updated.

## 4. Founder-only
~~Rotate / set a valid `ANTHROPIC_API_KEY` (or leave unset — the chain now marks it unconfigured once); approve the demo company names before a public demo (defaults ship).~~ **Resolved G25-B 2026-09-21:** the key is optional (Claude CLI subscription = the Anthropic path, silent `not_configured`), and the demo names passed a delegated register check (two renamed) — `docs/ops/founder-items.md`.
