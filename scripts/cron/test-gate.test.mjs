// Colocated tests for the autonomous-loop test gate.
//
// `pairChangedFilesWithTests` is pure given an injected `exists` predicate, so
// it is tested against an in-memory file set. `runTestGate` is tested against a
// real throwaway git repo with an injected runner — the git side (reverting
// exactly the right files) is the part that must be real; spawning vitest 20
// times would test vitest, not the gate.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  MAX_GATED_TEST_FILES,
  TEST_GATE_TIMEOUT_MS,
  pairChangedFilesWithTests,
  runTestGate,
} from './test-gate.mjs'

/** Build an `exists` predicate from a list of repo-relative paths. */
const fileset = (...paths) => {
  const set = new Set(paths)
  return (p) => set.has(p)
}

// ---------------------------------------------------------------------------
// pairChangedFilesWithTests — pure
// ---------------------------------------------------------------------------

describe('pairChangedFilesWithTests', () => {
  it('pins the documented budgets', () => {
    expect(TEST_GATE_TIMEOUT_MS).toBe(180_000)
    expect(MAX_GATED_TEST_FILES).toBe(12)
  })

  it('pairs a changed module with its colocated sibling test', () => {
    const exists = fileset('web/src/lib/agents/cmo-market-research.test.ts')
    expect(
      pairChangedFilesWithTests(['web/src/lib/agents/cmo-market-research.ts'], exists),
    ).toEqual([
      {
        source: 'web/src/lib/agents/cmo-market-research.ts',
        test: 'web/src/lib/agents/cmo-market-research.test.ts',
        changedSource: true,
        changedTest: false,
      },
    ])
  })

  it('returns nothing when the changed module has no colocated test', () => {
    expect(
      pairChangedFilesWithTests(['web/src/lib/agents/uncovered.ts'], fileset()),
    ).toEqual([])
  })

  it('is a no-op on an empty or whitespace-only change list', () => {
    expect(pairChangedFilesWithTests([], fileset())).toEqual([])
    expect(pairChangedFilesWithTests(['', '   ', '\n'], fileset())).toEqual([])
    expect(pairChangedFilesWithTests(undefined, fileset())).toEqual([])
  })

  it('ignores everything outside web/src/', () => {
    const exists = fileset(
      'scripts/cron/goal-loop.test.ts',
      'web/tests/e2e/smoke.test.ts',
      'web/scripts/ci/thing.test.ts',
    )
    expect(
      pairChangedFilesWithTests(
        [
          'scripts/cron/goal-loop.mjs',
          'web/tests/e2e/smoke.ts',
          'web/scripts/ci/thing.ts',
          'docs/plans/SOURCE-OF-TRUTH.md',
          'web/content/reports/deploy-log.jsonl',
        ],
        exists,
      ),
    ).toEqual([])
  })

  it('ignores non-TypeScript sources under web/src/', () => {
    const exists = fileset('web/src/lib/style.test.ts', 'web/src/lib/data.test.ts')
    expect(
      pairChangedFilesWithTests(['web/src/lib/style.css', 'web/src/lib/data.json'], exists),
    ).toEqual([])
  })

  it('ignores declaration files', () => {
    const exists = fileset('web/src/types/globals.test.ts')
    expect(pairChangedFilesWithTests(['web/src/types/globals.d.ts'], exists)).toEqual([])
  })

  it('prefers a .test.tsx sibling for a .tsx component, falling back to .test.ts', () => {
    expect(
      pairChangedFilesWithTests(
        ['web/src/components/Card.tsx'],
        fileset('web/src/components/Card.test.tsx'),
      )[0].test,
    ).toBe('web/src/components/Card.test.tsx')

    expect(
      pairChangedFilesWithTests(
        ['web/src/components/Card.tsx'],
        fileset('web/src/components/Card.test.ts'),
      )[0].test,
    ).toBe('web/src/components/Card.test.ts')
  })

  it('gates a changed test file and finds its source for the revert', () => {
    expect(
      pairChangedFilesWithTests(
        ['web/src/lib/thing.test.ts'],
        fileset('web/src/lib/thing.ts', 'web/src/lib/thing.test.ts'),
      ),
    ).toEqual([
      {
        source: 'web/src/lib/thing.ts',
        test: 'web/src/lib/thing.test.ts',
        changedSource: false,
        changedTest: true,
      },
    ])
  })

  it('gates a changed test file with no source (a pure test module)', () => {
    expect(
      pairChangedFilesWithTests(['web/src/lib/contract.test.ts'], fileset()),
    ).toEqual([
      {
        source: null,
        test: 'web/src/lib/contract.test.ts',
        changedSource: false,
        changedTest: true,
      },
    ])
  })

  it('collapses a module and its test changed together into one entry', () => {
    const exists = fileset('web/src/lib/thing.ts', 'web/src/lib/thing.test.ts')
    expect(
      pairChangedFilesWithTests(['web/src/lib/thing.ts', 'web/src/lib/thing.test.ts'], exists),
    ).toEqual([
      {
        source: 'web/src/lib/thing.ts',
        test: 'web/src/lib/thing.test.ts',
        changedSource: true,
        changedTest: true,
      },
    ])
  })

  it('deduplicates repeated paths', () => {
    const exists = fileset('web/src/lib/thing.test.ts')
    expect(
      pairChangedFilesWithTests(
        ['web/src/lib/thing.ts', 'web/src/lib/thing.ts'],
        exists,
      ),
    ).toHaveLength(1)
  })

  it('orders entries by test path so gate runs are deterministic', () => {
    const exists = fileset(
      'web/src/lib/a.test.ts',
      'web/src/lib/b.test.ts',
      'web/src/lib/c.test.ts',
    )
    expect(
      pairChangedFilesWithTests(
        ['web/src/lib/c.ts', 'web/src/lib/a.ts', 'web/src/lib/b.ts'],
        exists,
      ).map((p) => p.test),
    ).toEqual(['web/src/lib/a.test.ts', 'web/src/lib/b.test.ts', 'web/src/lib/c.test.ts'])
  })

  it('does not treat a .test.ts sibling of a .test.ts as a source', () => {
    // `foo.test.ts` must not be paired with a hypothetical `foo.test.test.ts`.
    const exists = fileset('web/src/lib/foo.test.test.ts')
    expect(
      pairChangedFilesWithTests(['web/src/lib/foo.test.ts'], exists).map((p) => p.test),
    ).toEqual(['web/src/lib/foo.test.ts'])
  })
})

// ---------------------------------------------------------------------------
// runTestGate — real git repo, injected runner
// ---------------------------------------------------------------------------

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`)
  return r.stdout
}

describe('runTestGate', () => {
  /** @type {string} */
  let repo

  const write = (rel, body) => {
    const abs = join(repo, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body, 'utf8')
  }
  const read = (rel) => readFileSync(join(repo, rel), 'utf8')

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'test-gate-'))
    git(repo, ['init', '--quiet', '--initial-branch=master'])
    git(repo, ['config', 'user.email', 'gate@test.local'])
    git(repo, ['config', 'user.name', 'Gate Test'])
    git(repo, ['config', 'commit.gpgsign', 'false'])
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  const commitAll = () => {
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', 'baseline'])
  }

  /** Runner stub: fail the named tests, pass everything else. */
  const runnerFailing = (...failing) => {
    const set = new Set(failing)
    return (_root, testPath) => ({
      status: set.has(testPath) ? 1 : 0,
      output: set.has(testPath) ? `FAIL ${testPath}\n  expected 6 exports, got 0` : 'ok',
      runnable: true,
    })
  }

  const seed = () => {
    write('web/src/lib/agents/cmo-market-research.ts', 'export const GOOD = 1\n')
    write('web/src/lib/agents/cmo-market-research.test.ts', 'test stub\n')
    write('web/src/lib/agents/cfo.ts', 'export const CFO = 1\n')
    write('web/src/lib/agents/cfo.test.ts', 'test stub\n')
    commitAll()
  }

  it('reverts only the source behind a failing test', () => {
    seed()
    const original = read('web/src/lib/agents/cmo-market-research.ts')
    write('web/src/lib/agents/cmo-market-research.ts', 'export const ONLY_ONE = 1\n')

    const r = runTestGate(repo, {
      runner: runnerFailing('web/src/lib/agents/cmo-market-research.test.ts'),
    })

    expect(r.pairs).toBe(1)
    expect(r.ran).toEqual(['web/src/lib/agents/cmo-market-research.test.ts'])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].source).toBe('web/src/lib/agents/cmo-market-research.ts')
    expect(r.failed[0].output).toContain('expected 6 exports')
    expect(r.reverted).toEqual(['web/src/lib/agents/cmo-market-research.ts'])
    expect(read('web/src/lib/agents/cmo-market-research.ts')).toBe(original)
  })

  it('keeps the rest of the tick when one module fails', () => {
    seed()
    const cmoOriginal = read('web/src/lib/agents/cmo-market-research.ts')
    const goodEdit = 'export const CFO = 1\nexport const EXTRA = 2\n'
    write('web/src/lib/agents/cmo-market-research.ts', 'broken\n')
    write('web/src/lib/agents/cfo.ts', goodEdit)

    const r = runTestGate(repo, {
      runner: runnerFailing('web/src/lib/agents/cmo-market-research.test.ts'),
    })

    expect(r.passed).toEqual(['web/src/lib/agents/cfo.test.ts'])
    expect(r.reverted).toEqual(['web/src/lib/agents/cmo-market-research.ts'])
    expect(read('web/src/lib/agents/cmo-market-research.ts')).toBe(cmoOriginal)
    // The unrelated, passing edit survives.
    expect(read('web/src/lib/agents/cfo.ts')).toBe(goodEdit)
  })

  it('reverts both halves when the module and its test changed together', () => {
    seed()
    const srcOriginal = read('web/src/lib/agents/cfo.ts')
    const testOriginal = read('web/src/lib/agents/cfo.test.ts')
    write('web/src/lib/agents/cfo.ts', 'broken\n')
    write('web/src/lib/agents/cfo.test.ts', 'also broken\n')

    const r = runTestGate(repo, { runner: runnerFailing('web/src/lib/agents/cfo.test.ts') })

    expect(r.reverted.sort()).toEqual([
      'web/src/lib/agents/cfo.test.ts',
      'web/src/lib/agents/cfo.ts',
    ])
    expect(read('web/src/lib/agents/cfo.ts')).toBe(srcOriginal)
    expect(read('web/src/lib/agents/cfo.test.ts')).toBe(testOriginal)
  })

  it('leaves an unchanged source alone when only its test changed and failed', () => {
    seed()
    const srcOriginal = read('web/src/lib/agents/cfo.ts')
    write('web/src/lib/agents/cfo.test.ts', 'newly added failing assertion\n')

    const r = runTestGate(repo, { runner: runnerFailing('web/src/lib/agents/cfo.test.ts') })

    expect(r.reverted).toEqual(['web/src/lib/agents/cfo.test.ts'])
    expect(read('web/src/lib/agents/cfo.ts')).toBe(srcOriginal)
  })

  it('reverts nothing when every gated test passes', () => {
    seed()
    const edit = 'export const GOOD = 1\nexport const MORE = 2\n'
    write('web/src/lib/agents/cmo-market-research.ts', edit)

    const r = runTestGate(repo, { runner: runnerFailing() })

    expect(r.failed).toEqual([])
    expect(r.reverted).toEqual([])
    expect(read('web/src/lib/agents/cmo-market-research.ts')).toBe(edit)
  })

  it('is a no-op when no changed file has a colocated test', () => {
    seed()
    write('web/src/lib/agents/orphan.ts', 'export const X = 1\n')
    write('docs/plans/notes.md', 'hello\n')
    git(repo, ['add', '-A'])

    let ran = false
    const r = runTestGate(repo, {
      runner: () => {
        ran = true
        return { status: 0, output: '', runnable: true }
      },
    })

    expect(ran).toBe(false)
    expect(r.skipped).toBe('no_colocated_tests')
    expect(r.reverted).toEqual([])
  })

  it('dryRun reports failures without reverting', () => {
    seed()
    const broken = 'broken\n'
    write('web/src/lib/agents/cfo.ts', broken)

    const r = runTestGate(repo, {
      dryRun: true,
      runner: runnerFailing('web/src/lib/agents/cfo.test.ts'),
    })

    expect(r.failed).toHaveLength(1)
    expect(r.reverted).toEqual([])
    expect(read('web/src/lib/agents/cfo.ts')).toBe(broken)
  })

  it('treats an unrunnable vitest as no verdict — never reverts', () => {
    seed()
    const edit = 'possibly broken\n'
    write('web/src/lib/agents/cfo.ts', edit)

    // Simulates a missing binary or a timeout kill (status null).
    const r = runTestGate(repo, {
      runner: () => ({ status: null, output: '', runnable: false }),
    })

    expect(r.unrunnable).toEqual(['web/src/lib/agents/cfo.test.ts'])
    expect(r.ran).toEqual([])
    expect(r.failed).toEqual([])
    expect(read('web/src/lib/agents/cfo.ts')).toBe(edit)
  })

  it('survives a runner that throws', () => {
    seed()
    write('web/src/lib/agents/cfo.ts', 'edit\n')

    const r = runTestGate(repo, {
      runner: () => {
        throw new Error('spawn ENOENT')
      },
    })

    expect(r.unrunnable).toEqual(['web/src/lib/agents/cfo.test.ts'])
    expect(r.failed).toEqual([])
  })

  it('caps the number of gated test files', () => {
    for (let i = 0; i < 5; i += 1) {
      write(`web/src/lib/m${i}.ts`, 'export const X = 1\n')
      write(`web/src/lib/m${i}.test.ts`, 'stub\n')
    }
    commitAll()
    // Offset so every file's content genuinely differs from the baseline —
    // an unchanged file would not appear in `git diff --name-only HEAD`.
    for (let i = 0; i < 5; i += 1) write(`web/src/lib/m${i}.ts`, `export const X = ${i + 100}\n`)

    const r = runTestGate(repo, { maxFiles: 2, runner: runnerFailing() })

    expect(r.pairs).toBe(5)
    expect(r.ran).toHaveLength(2)
    expect(r.skipped).toBe('truncated_to_2_of_5')
  })

  it('reads changed paths from git when none are supplied', () => {
    seed()
    write('web/src/lib/agents/cfo.ts', 'edit\n')

    const seen = []
    runTestGate(repo, {
      runner: (_root, t) => {
        seen.push(t)
        return { status: 0, output: '', runnable: true }
      },
    })

    expect(seen).toEqual(['web/src/lib/agents/cfo.test.ts'])
  })

  it('honours an explicitly supplied changed-path list', () => {
    seed()
    write('web/src/lib/agents/cfo.ts', 'edit\n')
    write('web/src/lib/agents/cmo-market-research.ts', 'edit\n')

    const r = runTestGate(repo, {
      changedPaths: ['web/src/lib/agents/cfo.ts'],
      runner: runnerFailing(),
    })

    expect(r.ran).toEqual(['web/src/lib/agents/cfo.test.ts'])
  })

  it('truncates enormous test output in the report', () => {
    seed()
    write('web/src/lib/agents/cfo.ts', 'broken\n')

    const r = runTestGate(repo, {
      dryRun: true,
      runner: () => ({ status: 1, output: 'x'.repeat(20_000), runnable: true }),
    })

    expect(r.failed[0].output.length).toBeLessThan(5000)
    expect(r.failed[0].output.startsWith('…')).toBe(true)
  })
})
