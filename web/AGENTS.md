<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Autonomous loop guard rails

`scripts/cron/goal-loop.mjs` runs a Claude CLI subprocess each tick, then does
`git add -A` + commit + push as a safety net (the server runs a periodic
`git reset --hard`, so uncommitted edits are lost). That safety net has
repeatedly committed destructive subprocess output — `cfo-valuation.ts` went
766 → 208 lines at `c86b2365` and sat broken for five days, causing 137 of 151
TypeScript errors, which failed Gate 3 of `deploy-live.sh`, which aborted every
deploy. Two guards now run between the subprocess and `git add -A`. Both are
non-fatal: they veto the destructive part of a tick and let the rest commit.

## 1. Truncation guard — `scripts/cron/truncation-guard.mjs`

Compares each modified tracked source file's working-tree line count against
its committed count. A file is reverted (`git checkout --`) when **both** hold:

- it had **≥ 80 lines** at HEAD (`MIN_LINES` — churn on small files is normal), and
- it lost **more than 40%** of them (`SHRINK_THRESHOLD`, strictly greater-than,
  so an exactly-40% loss is allowed).

Only `.ts .tsx .mjs .js .jsx .sql` are guarded. Exempt: `web/content/reports/`,
any `.jsonl`, `*.lock`, `package-lock.json`, `web/.next/`, `node_modules`.
Deleted paths and new files with no HEAD version are ignored.

**To shrink a file on purpose: commit the shrink yourself in the same tick.**
The guard only ever looks at uncommitted working-tree changes — anything you
have already committed is invisible to it. Leaving a large deletion
uncommitted for the loop's safety net to pick up is what gets reverted.

## 2. Test gate — `scripts/cron/test-gate.mjs`

The truncation guard only catches a file that got *smaller*. It does not catch
a confident, complete rewrite that deletes half a module's public API — which
is what happened to `cmo-market-research.ts` at `d3953e1e`, six exports deleted
three hours after `d9cc2878` landed the 31-case suite pinning them. The suite
was sitting in the repo and the loop never ran it.

The gate pairs every changed `web/src/**` `.ts`/`.tsx` file with its colocated
`<name>.test.ts(x)` sibling and runs each pair's test in its own `vitest run`
(180s budget, 12 files max). If a test fails, only the changed files behind
that test are reverted; every other edit in the tick still commits.

**Colocated tests are authoritative.** If you change a module's public
surface, update its colocated test *in the same tick* — otherwise the gate
reverts your change. Changing the test alone puts that module under the gate
too, so you cannot land a failing test either. If vitest is unrunnable
(missing binary, timeout, spawn error) the gate records "no verdict" and
reverts nothing — a broken toolchain must never silently undo work.

## Checking whether a guard fired

Both guards log to the loop's history JSONL
(`web/content/reports/<loop>-history.jsonl`, e.g. `atlassian-goal-history.jsonl`,
`reseller-goal-history.jsonl`). Grep for these `stage` values:

| stage | meaning |
| --- | --- |
| `truncation_guard_reverted` | files restored; each entry has `path`, `head_lines`, `work_lines`, `lost_pct` |
| `truncation_guard_failed` | the guard itself errored — the tick committed unguarded |
| `test_gate_reverted` | a colocated test failed; `failed[]` carries the vitest output tail, `reverted[]` the paths put back |
| `test_gate_passed` | tests ran clean (or were unrunnable); nothing reverted |
| `test_gate_failed` | the gate itself errored — the tick committed ungated |

```sh
grep -h 'truncation_guard_reverted\|test_gate_reverted' web/content/reports/*-history.jsonl | tail
```

Both guards are covered by colocated tests (`scripts/cron/*.test.mjs`), pulled
into `npm test` by the `../scripts/**/*.test.mjs` entry in `web/vitest.config.ts`.
Each also has a CLI for manual inspection:

```sh
node scripts/cron/truncation-guard.mjs --dry-run .   # report, do not restore
node scripts/cron/test-gate.mjs --dry-run .          # run tests, do not revert
```
