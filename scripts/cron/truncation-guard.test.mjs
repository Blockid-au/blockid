// Colocated tests for the autonomous-loop truncation guard.
//
// Placement: this file lives next to the module it tests, and
// `web/vitest.config.ts` includes `../scripts/**/*.test.mjs` so it runs under
// the single `npm test` in web/. It stays a `.mjs` (not `.ts`) deliberately —
// web/tsconfig.json's `include` is scoped to web/, so a `.ts` test here would
// be invisible to `tsc --noEmit` while a `.ts` test placed *inside* web/src
// would have to import an untyped `.mjs` across the package boundary and would
// fail Gate 3 of deploy-live.sh.
//
// The guardTruncations() cases build a real throwaway git repo per test — the
// function shells out to git, and mocking spawnSync would test the mock rather
// than the behaviour that actually protects the build.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  MIN_LINES,
  SHRINK_THRESHOLD,
  guardTruncations,
  judgeShrink,
} from './truncation-guard.mjs'

// ---------------------------------------------------------------------------
// judgeShrink — pure
// ---------------------------------------------------------------------------

describe('judgeShrink', () => {
  it('pins the documented thresholds', () => {
    expect(SHRINK_THRESHOLD).toBe(0.4)
    expect(MIN_LINES).toBe(80)
  })

  it('exempts files below MIN_LINES no matter how much they lose', () => {
    expect(judgeShrink(MIN_LINES - 1, 0)).toEqual({ truncated: false, lostPct: 0 })
    expect(judgeShrink(79, 1)).toEqual({ truncated: false, lostPct: 0 })
    expect(judgeShrink(10, 1)).toEqual({ truncated: false, lostPct: 0 })
    expect(judgeShrink(0, 0)).toEqual({ truncated: false, lostPct: 0 })
  })

  it('guards from MIN_LINES upward', () => {
    // 80 -> 40 is exactly 50% lost, over the 40% threshold.
    const verdict = judgeShrink(MIN_LINES, 40)
    expect(verdict.truncated).toBe(true)
    expect(verdict.lostPct).toBeCloseTo(0.5, 10)
  })

  it('treats a loss of exactly SHRINK_THRESHOLD as acceptable', () => {
    // 100 -> 60 loses exactly 40%. The comparison is strictly greater-than, so
    // the boundary is a legitimate refactor, not a truncation.
    const verdict = judgeShrink(100, 60)
    expect(verdict.truncated).toBe(false)
    expect(verdict.lostPct).toBeCloseTo(SHRINK_THRESHOLD, 10)
  })

  it('flags a loss just over SHRINK_THRESHOLD', () => {
    const verdict = judgeShrink(100, 59)
    expect(verdict.truncated).toBe(true)
    expect(verdict.lostPct).toBeCloseTo(0.41, 10)
  })

  it('never flags growth', () => {
    expect(judgeShrink(100, 101)).toEqual({ truncated: false, lostPct: 0 })
    expect(judgeShrink(766, 5000)).toEqual({ truncated: false, lostPct: 0 })
  })

  it('never flags an unchanged line count', () => {
    expect(judgeShrink(500, 500)).toEqual({ truncated: false, lostPct: 0 })
  })

  it('reproduces the historical cfo-valuation.ts truncations', () => {
    // c86b2365: 766 -> 208. b39c5819: 539 -> 151.
    expect(judgeShrink(766, 208).truncated).toBe(true)
    expect(judgeShrink(539, 151).truncated).toBe(true)
  })

  it('lets a substantial but ordinary trim through', () => {
    // 766 -> 500 loses 35% — a real refactor, must not be reverted.
    expect(judgeShrink(766, 500).truncated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// guardTruncations — against a real git repo
// ---------------------------------------------------------------------------

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`)
  }
  return r.stdout
}

/** Deterministic file body of `n` lines. */
function lines(n, tag = 'line') {
  return Array.from({ length: n }, (_, i) => `${tag} ${i + 1}`).join('\n') + '\n'
}

describe('guardTruncations', () => {
  /** @type {string} */
  let repo

  /** Write a file (creating parent dirs) relative to the temp repo. */
  const write = (rel, body) => {
    const abs = join(repo, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body, 'utf8')
  }

  const read = (rel) => readFileSync(join(repo, rel), 'utf8')

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'truncation-guard-'))
    git(repo, ['init', '--quiet', '--initial-branch=master'])
    git(repo, ['config', 'user.email', 'guard@test.local'])
    git(repo, ['config', 'user.name', 'Guard Test'])
    git(repo, ['config', 'commit.gpgsign', 'false'])
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  const commitAll = (msg = 'baseline') => {
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', msg])
  }

  it('restores a truncated tracked source file and reports it', () => {
    write('web/src/lib/agents/cfo-valuation.ts', lines(766, 'export const v'))
    commitAll()
    const committed = read('web/src/lib/agents/cfo-valuation.ts')

    // The subprocess emits a partial rewrite.
    write('web/src/lib/agents/cfo-valuation.ts', lines(208, 'export const v'))

    const { restored, scanned } = guardTruncations(repo)

    expect(scanned).toBe(1)
    expect(restored).toHaveLength(1)
    expect(restored[0].path).toBe('web/src/lib/agents/cfo-valuation.ts')
    expect(restored[0].headLines).toBe(766)
    expect(restored[0].workLines).toBe(208)
    expect(restored[0].lostPct).toBeGreaterThan(SHRINK_THRESHOLD)
    // The committed content is back on disk.
    expect(read('web/src/lib/agents/cfo-valuation.ts')).toBe(committed)
  })

  it('leaves an ordinary edit alone', () => {
    write('web/src/lib/thing.ts', lines(300))
    commitAll()

    const edited = lines(260, 'edited')
    write('web/src/lib/thing.ts', edited)

    const { restored } = guardTruncations(repo)
    expect(restored).toEqual([])
    expect(read('web/src/lib/thing.ts')).toBe(edited)
  })

  it('reverts only the truncated file, preserving the rest of the tick', () => {
    write('web/src/lib/big.ts', lines(400))
    write('web/src/lib/other.ts', lines(400))
    commitAll()

    const goodEdit = lines(420, 'improved')
    write('web/src/lib/big.ts', lines(40))
    write('web/src/lib/other.ts', goodEdit)

    const { restored } = guardTruncations(repo)

    expect(restored.map((r) => r.path)).toEqual(['web/src/lib/big.ts'])
    expect(read('web/src/lib/other.ts')).toBe(goodEdit)
  })

  it('does not guard exempt paths even when they shrink drastically', () => {
    write('web/content/reports/deploy-log.jsonl', lines(900, '{"a":1} //'))
    write('web/src/data/dump.jsonl', lines(900, '{"a":1} //'))
    write('web/content/reports/regen.ts', lines(900))
    write('package-lock.json', lines(900))
    commitAll()

    write('web/content/reports/deploy-log.jsonl', lines(3, '{"a":1} //'))
    write('web/src/data/dump.jsonl', lines(3, '{"a":1} //'))
    write('web/content/reports/regen.ts', lines(3))
    write('package-lock.json', lines(3))

    const { restored, scanned } = guardTruncations(repo)

    expect(restored).toEqual([])
    expect(scanned).toBe(0)
    expect(read('web/content/reports/deploy-log.jsonl')).toBe(lines(3, '{"a":1} //'))
    expect(read('package-lock.json')).toBe(lines(3))
  })

  it('ignores non-source extensions', () => {
    write('docs/plans/big-plan.md', lines(500))
    commitAll()
    write('docs/plans/big-plan.md', lines(10))

    const { restored, scanned } = guardTruncations(repo)
    expect(restored).toEqual([])
    expect(scanned).toBe(0)
  })

  it('does not crash on a brand-new file with no HEAD version', () => {
    write('web/src/lib/seed.ts', lines(200))
    commitAll()
    // Untracked new file alongside a tracked one.
    write('web/src/lib/brand-new.ts', lines(5))
    write('web/src/lib/seed.ts', lines(20))

    let result
    expect(() => {
      result = guardTruncations(repo)
    }).not.toThrow()
    expect(result.restored.map((r) => r.path)).toEqual(['web/src/lib/seed.ts'])
    // The new file survives untouched.
    expect(read('web/src/lib/brand-new.ts')).toBe(lines(5))
  })

  it('does not crash on a staged-but-uncommitted new file', () => {
    write('web/src/lib/seed.ts', lines(200))
    commitAll()
    write('web/src/lib/added.ts', lines(120))
    git(repo, ['add', 'web/src/lib/added.ts'])

    const { restored } = guardTruncations(repo)
    expect(restored).toEqual([])
    expect(read('web/src/lib/added.ts')).toBe(lines(120))
  })

  it('ignores deleted files rather than resurrecting them', () => {
    write('web/src/lib/gone.ts', lines(300))
    commitAll()
    rmSync(join(repo, 'web/src/lib/gone.ts'))

    const { restored } = guardTruncations(repo)
    expect(restored).toEqual([])
  })

  it('dryRun reports without restoring', () => {
    write('web/src/lib/big.ts', lines(500))
    commitAll()
    const truncated = lines(50, 'partial')
    write('web/src/lib/big.ts', truncated)

    const { restored } = guardTruncations(repo, { dryRun: true })

    expect(restored).toHaveLength(1)
    expect(restored[0].path).toBe('web/src/lib/big.ts')
    // Still truncated on disk — dryRun only reports.
    expect(read('web/src/lib/big.ts')).toBe(truncated)
  })

  it('returns clean on an untouched tree', () => {
    write('web/src/lib/big.ts', lines(500))
    commitAll()

    expect(guardTruncations(repo)).toEqual({ restored: [], scanned: 0 })
  })

  it('guards every source extension it claims to', () => {
    for (const ext of ['ts', 'tsx', 'mjs', 'js', 'jsx', 'sql']) {
      write(`web/src/lib/mod.${ext}`, lines(400))
    }
    commitAll()
    for (const ext of ['ts', 'tsx', 'mjs', 'js', 'jsx', 'sql']) {
      write(`web/src/lib/mod.${ext}`, lines(20))
    }

    const { restored } = guardTruncations(repo)
    expect(restored.map((r) => r.path).sort()).toEqual([
      'web/src/lib/mod.js',
      'web/src/lib/mod.jsx',
      'web/src/lib/mod.mjs',
      'web/src/lib/mod.sql',
      'web/src/lib/mod.ts',
      'web/src/lib/mod.tsx',
    ])
  })
})
