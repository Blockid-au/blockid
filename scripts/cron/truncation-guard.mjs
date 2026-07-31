// truncation-guard — block the autonomous loop from committing accidental
// file truncations.
//
// WHY THIS EXISTS
// ---------------
// `goal-loop.mjs` runs `git add -A` as a safety net, committing whatever the
// Claude CLI subprocess left in the working tree. That is correct for normal
// edits, but when a subprocess rewrites a large file and only emits a partial
// version, the safety net happily commits the truncation and pushes it.
//
// This has bitten `web/src/lib/agents/cfo-valuation.ts` at least four times:
//
//   fddf8e13  766 lines  (good)
//   c86b2365  208 lines  <- loop tick truncated it, 137 TS errors downstream
//   b93c392e  240 lines  (still broken)
//   8e0d3228  835 lines  (restored)
//
// and earlier: 539 -> 151 at b39c5819, plus commit 8354fe01 literally titled
// "undo accidental truncation". Each occurrence silently broke the build and,
// because Gate 3 of deploy-live.sh requires zero TypeScript errors, blocked
// every deploy until a human noticed.
//
// WHAT IT DOES
// ------------
// Before the loop stages files, compare each modified tracked source file's
// working-tree line count against its committed line count. When a file loses
// more than SHRINK_THRESHOLD of its lines AND was substantial to begin with
// (MIN_LINES), restore it from HEAD and report it. The rest of the tick's work
// still commits — we only veto the destructive part.
//
// Deletions staged deliberately (`git rm`) are untouched: this only inspects
// files that still exist on disk and are modified, never deleted paths.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Fraction of lines a file may lose before we treat it as a truncation. */
export const SHRINK_THRESHOLD = 0.4

/** Files smaller than this are exempt — churn on small files is normal. */
export const MIN_LINES = 80

/** Only guard real source; generated reports and logs shrink legitimately. */
const GUARDED_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.sql']

/** Paths that legitimately rewrite wholesale — never guard these. */
const EXEMPT_PATTERNS = [
  /^web\/content\/reports\//,
  /\.jsonl$/,
  /\.lock$/,
  /package-lock\.json$/,
  /^web\/\.next\//,
  /node_modules/,
]

function isGuarded(path) {
  if (EXEMPT_PATTERNS.some((re) => re.test(path))) return false
  return GUARDED_EXTENSIONS.some((ext) => path.endsWith(ext))
}

function countLines(text) {
  if (text.length === 0) return 0
  // Trailing newline should not inflate the count by one.
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text
  return trimmed.split('\n').length
}

/**
 * Decide whether a single file's shrink counts as a truncation.
 * Pure — exported so the behaviour is unit-testable without a git tree.
 *
 * @param {number} headLines   line count at HEAD
 * @param {number} workLines   line count in the working tree
 * @returns {{ truncated: boolean, lostPct: number }}
 */
export function judgeShrink(headLines, workLines) {
  if (headLines < MIN_LINES) return { truncated: false, lostPct: 0 }
  if (workLines >= headLines) return { truncated: false, lostPct: 0 }
  const lostPct = (headLines - workLines) / headLines
  return { truncated: lostPct > SHRINK_THRESHOLD, lostPct }
}

/**
 * Scan the working tree for truncated source files and restore them.
 *
 * @param {string} repoRoot
 * @param {{ dryRun?: boolean }} [opts] dryRun reports without restoring
 * @returns {{ restored: Array<{path: string, headLines: number, workLines: number, lostPct: number}>, scanned: number }}
 */
export function guardTruncations(repoRoot, opts = {}) {
  const dryRun = Boolean(opts.dryRun)

  // `-M` name-status against HEAD: only files that still exist and changed.
  const status = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const paths = (status.stdout ?? '')
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && isGuarded(p))

  const restored = []

  for (const path of paths) {
    const abs = join(repoRoot, path)
    // Deleted on purpose — not our business.
    if (!existsSync(abs)) continue

    const head = spawnSync('git', ['show', `HEAD:${path}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    // New file (no HEAD version) — nothing to shrink from.
    if (head.status !== 0) continue

    const headLines = countLines(head.stdout ?? '')
    let workLines
    try {
      workLines = countLines(readFileSync(abs, 'utf8'))
    } catch {
      continue
    }

    const { truncated, lostPct } = judgeShrink(headLines, workLines)
    if (!truncated) continue

    if (!dryRun) {
      // Restore the committed version; the tick's other edits are preserved.
      spawnSync('git', ['checkout', '--', path], { cwd: repoRoot, stdio: 'ignore' })
    }
    restored.push({ path, headLines, workLines, lostPct })
  }

  return { restored, scanned: paths.length }
}

// CLI: `node scripts/cron/truncation-guard.mjs [--dry-run] [repoRoot]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const repoRoot = argv.find((a) => !a.startsWith('--')) ?? process.cwd()

  const { restored, scanned } = guardTruncations(repoRoot, { dryRun })
  if (restored.length === 0) {
    console.log(`truncation-guard: clean (${scanned} source file(s) scanned)`)
    process.exit(0)
  }
  console.error(
    `truncation-guard: ${restored.length} truncation(s) ${dryRun ? 'detected' : 'REVERTED'} of ${scanned} scanned:`,
  )
  for (const r of restored) {
    console.error(
      `  ${r.path}: ${r.headLines} -> ${r.workLines} lines (${Math.round(r.lostPct * 100)}% lost)`,
    )
  }
  process.exit(dryRun ? 1 : 0)
}
