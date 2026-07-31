// test-gate — make the autonomous loop run the colocated tests for the
// modules it just edited, and revert the edits that break them.
//
// WHY THIS EXISTS
// ---------------
// The truncation guard catches a subprocess that emits *less* of a file than
// it should. It does not catch a subprocess that emits a confident, complete,
// well-formatted rewrite that happens to delete half the module's public API.
//
// That is exactly what happened to `web/src/lib/agents/cmo-market-research.ts`:
//
//   d9cc2878  2026-07-30 18:13  test: 31-case suite pinning the public surface
//   d3953e1e  2026-07-30 21:01  loop rewrites the module, six exports deleted
//
// The test that would have caught it was sitting in the repo, three hours old,
// and the loop never ran it. `git add -A` committed the regression and pushed.
//
// WHAT IT DOES
// ------------
// After the truncation guard and before `git add -A`: look at the files the
// tick changed, pair each changed `web/src/**` module with its colocated
// `<name>.test.ts(x)` sibling, and run those tests. Every test file runs in
// its own vitest invocation so a failure is attributable to one module —
// there is no reliable way to map a single exit code back to a file. On
// failure, `git checkout --` only the changed files behind that test; the rest
// of the tick still commits.
//
// Every failure mode here is non-fatal by design. A missing vitest binary, a
// hung suite, a git error — none of them may wedge the cron. The gate reports
// what it did and the loop carries on.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Per-test-file wall clock budget. A hung suite must not wedge the cron. */
export const TEST_GATE_TIMEOUT_MS = 180_000

/** Upper bound on gated files — a sweeping refactor should not stall the tick. */
export const MAX_GATED_TEST_FILES = 12

/** Only source under here is gated. */
const GATED_PREFIX = 'web/src/'

const TEST_SUFFIX_RE = /\.test\.tsx?$/
const SOURCE_EXT_RE = /\.tsx?$/

function isDeclaration(path) {
  return path.endsWith('.d.ts')
}

function isTestPath(path) {
  return TEST_SUFFIX_RE.test(path)
}

function isGatedPath(path) {
  return path.startsWith(GATED_PREFIX) && SOURCE_EXT_RE.test(path) && !isDeclaration(path)
}

/** `a/b/foo.ts` -> [`a/b/foo.test.ts`, `a/b/foo.test.tsx`] */
function testCandidates(sourcePath) {
  const stem = sourcePath.replace(SOURCE_EXT_RE, '')
  return sourcePath.endsWith('.tsx')
    ? [`${stem}.test.tsx`, `${stem}.test.ts`]
    : [`${stem}.test.ts`, `${stem}.test.tsx`]
}

/** `a/b/foo.test.ts` -> [`a/b/foo.ts`, `a/b/foo.tsx`] */
function sourceCandidates(testPath) {
  const stem = testPath.replace(TEST_SUFFIX_RE, '')
  return testPath.endsWith('.tsx')
    ? [`${stem}.tsx`, `${stem}.ts`]
    : [`${stem}.ts`, `${stem}.tsx`]
}

/**
 * Pair the tick's changed files with the colocated tests that cover them.
 *
 * Pure given `exists` — inject a predicate in tests, pass a real filesystem
 * probe in production. Mirrors how `truncation-guard.mjs` exports
 * `judgeShrink` so the decision is testable without a git tree.
 *
 * A changed test file is paired with its own source, so rewriting either half
 * of a module/test pair puts that module under the gate.
 *
 * @param {string[]} changedPaths repo-relative paths from `git diff --name-only HEAD`
 * @param {(path: string) => boolean} exists repo-relative existence probe
 * @returns {Array<{source: string|null, test: string, changedSource: boolean, changedTest: boolean}>}
 *   deduped by test path, ordered by test path
 */
export function pairChangedFilesWithTests(changedPaths, exists = existsSync) {
  const changed = new Set(
    (changedPaths ?? []).map((p) => String(p).trim()).filter((p) => p.length > 0),
  )

  /** @type {Map<string, {source: string|null, test: string, changedSource: boolean, changedTest: boolean}>} */
  const byTest = new Map()

  const record = (test, source) => {
    const prev = byTest.get(test)
    const entry = prev ?? { source: null, test, changedSource: false, changedTest: false }
    if (source && !entry.source) entry.source = source
    if (source && changed.has(source)) entry.changedSource = true
    if (changed.has(test)) entry.changedTest = true
    byTest.set(test, entry)
  }

  for (const path of changed) {
    if (!isGatedPath(path)) continue

    if (isTestPath(path)) {
      // The test itself changed — run it, and note its source for the revert.
      const source = sourceCandidates(path).find((c) => exists(c)) ?? null
      record(path, source)
      continue
    }

    const test = testCandidates(path).find((c) => exists(c))
    if (!test) continue
    record(test, path)
  }

  return [...byTest.values()].sort((a, b) => (a.test < b.test ? -1 : a.test > b.test ? 1 : 0))
}

/**
 * Default runner: one `vitest run <test>` per file, from web/.
 *
 * @param {string} repoRoot
 * @param {string} testPath repo-relative
 * @returns {{ status: number|null, output: string, runnable: boolean }}
 */
function defaultRunner(repoRoot, testPath) {
  // vitest's root is web/, so paths are passed relative to it.
  const rel = testPath.startsWith('web/') ? testPath.slice('web/'.length) : testPath
  const r = spawnSync('npx', ['vitest', 'run', rel], {
    cwd: join(repoRoot, 'web'),
    encoding: 'utf8',
    timeout: TEST_GATE_TIMEOUT_MS,
    env: { ...process.env, CI: '1' },
  })

  // No binary / spawn failure / killed by the timeout — not a test failure.
  const runnable = !r.error && r.status !== null
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  return { status: r.status, output, runnable }
}

/** Keep loop history lines bounded — vitest output can be enormous. */
function tail(text, max = 4000) {
  if (!text || text.length <= max) return text ?? ''
  return `…${text.slice(-max)}`
}

/**
 * Run the colocated tests for everything the tick changed; revert what fails.
 *
 * Never throws for an expected failure mode — inspect the returned `skipped`
 * and `errors` fields instead.
 *
 * @param {string} repoRoot
 * @param {{
 *   changedPaths?: string[],
 *   dryRun?: boolean,
 *   runner?: (repoRoot: string, testPath: string) => {status: number|null, output: string, runnable: boolean},
 *   exists?: (path: string) => boolean,
 *   maxFiles?: number,
 * }} [opts]
 * @returns {{
 *   pairs: number, ran: string[], passed: string[],
 *   failed: Array<{test: string, source: string|null, output: string}>,
 *   reverted: string[], unrunnable: string[], skipped: string|null,
 * }}
 */
export function runTestGate(repoRoot, opts = {}) {
  const dryRun = Boolean(opts.dryRun)
  const runner = opts.runner ?? defaultRunner
  const exists = opts.exists ?? ((p) => existsSync(join(repoRoot, p)))
  const maxFiles = opts.maxFiles ?? MAX_GATED_TEST_FILES

  const empty = {
    pairs: 0,
    ran: [],
    passed: [],
    failed: [],
    reverted: [],
    unrunnable: [],
    skipped: null,
  }

  let changedPaths = opts.changedPaths
  if (!changedPaths) {
    const diff = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    if (diff.status !== 0) return { ...empty, skipped: 'git_diff_failed' }
    changedPaths = (diff.stdout ?? '').split('\n')
  }

  const pairs = pairChangedFilesWithTests(changedPaths, exists)
  if (pairs.length === 0) return { ...empty, skipped: 'no_colocated_tests' }

  const gated = pairs.slice(0, maxFiles)
  const result = {
    pairs: pairs.length,
    ran: [],
    passed: [],
    failed: [],
    reverted: [],
    unrunnable: [],
    skipped: pairs.length > maxFiles ? `truncated_to_${maxFiles}_of_${pairs.length}` : null,
  }

  for (const pair of gated) {
    let run
    try {
      run = runner(repoRoot, pair.test)
    } catch (err) {
      result.unrunnable.push(pair.test)
      continue
    }

    if (!run || !run.runnable) {
      // Missing binary, spawn error, or timeout kill — never a verdict.
      result.unrunnable.push(pair.test)
      continue
    }

    result.ran.push(pair.test)
    if (run.status === 0) {
      result.passed.push(pair.test)
      continue
    }

    result.failed.push({ test: pair.test, source: pair.source, output: tail(run.output) })

    if (dryRun) continue

    // Revert only what this tick touched behind the failing test. An unchanged
    // file is left alone; a pre-existing failure is not ours to undo.
    const toRevert = [
      pair.changedSource ? pair.source : null,
      pair.changedTest ? pair.test : null,
    ].filter((p) => typeof p === 'string' && p.length > 0)

    for (const path of toRevert) {
      const co = spawnSync('git', ['checkout', '--', path], { cwd: repoRoot, encoding: 'utf8' })
      if (co.status === 0) result.reverted.push(path)
    }
  }

  return result
}

// CLI: `node scripts/cron/test-gate.mjs [--dry-run] [repoRoot]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const repoRoot = argv.find((a) => !a.startsWith('--')) ?? process.cwd()

  const r = runTestGate(repoRoot, { dryRun })
  console.log(
    `test-gate: ${r.pairs} pair(s), ${r.passed.length} passed, ${r.failed.length} failed, ` +
      `${r.unrunnable.length} unrunnable${r.skipped ? ` (${r.skipped})` : ''}`,
  )
  for (const f of r.failed) {
    console.error(`  FAIL ${f.test}${f.source ? ` (source: ${f.source})` : ''}`)
  }
  if (r.reverted.length > 0) console.error(`  reverted: ${r.reverted.join(', ')}`)
  process.exit(r.failed.length > 0 && dryRun ? 1 : 0)
}
