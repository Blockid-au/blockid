// Colocated tests for goal-loop-v2 driver-owned phase flipping.
//
// Placement mirrors truncation-guard.test.mjs / test-gate.test.mjs — the file
// stays a `.mjs` next to the module and is picked up by web/vitest.config.ts's
// `../scripts/**/*.test.mjs` glob so it runs under the single `npm test` in
// web/. Keeping it out of web/src avoids the tsc-visibility trap called out
// in truncation-guard.test.mjs's header comment.
//
// These cases pin the fix for the fail_reason accumulation bug: prior to
// tick 952, flipPhaseStatus ran two separate replaces — the second one used
// /g against `status: toStatus`, so every already-failed phase in the goal
// file collected a fresh fail_reason string on every tick, ballooning the
// file with duplicate entries. See P13.11 note in the reseller goal file.

import { describe, expect, it } from 'vitest'

import { flipPhaseStatusPure } from './goal-loop-v2.mjs'

describe('flipPhaseStatusPure', () => {
  it('flips a single deploy_pending to done with no fail_reason', () => {
    const md = 'P1: {status: deploy_pending, tick: 1}\n'
    const { updated, changed, replaced } = flipPhaseStatusPure(md, 'deploy_pending', 'done')
    expect(changed).toBe(true)
    expect(replaced).toBe(1)
    expect(updated).toBe('P1: {status: done, tick: 1}\n')
  })

  it('flips every deploy_pending occurrence when there are multiple', () => {
    const md = [
      'P1: {status: deploy_pending, tick: 1}',
      'P2: {status: deploy_pending, tick: 2}',
      'P3: {status: done, tick: 3}',
      '',
    ].join('\n')
    const { updated, replaced } = flipPhaseStatusPure(md, 'deploy_pending', 'done')
    expect(replaced).toBe(2)
    expect(updated).toContain('P1: {status: done, tick: 1}')
    expect(updated).toContain('P2: {status: done, tick: 2}')
    expect(updated).toContain('P3: {status: done, tick: 3}')
  })

  it('is a noop when no phase matches fromStatus', () => {
    const md = 'P1: {status: done, tick: 1}\nP2: {status: deploy_failed, tick: 2}\n'
    const { updated, changed, replaced } = flipPhaseStatusPure(md, 'deploy_pending', 'done')
    expect(changed).toBe(false)
    expect(replaced).toBe(0)
    expect(updated).toBe(md)
  })

  it('injects fail_reason only on newly-flipped lines — leaves pre-existing deploy_failed untouched', () => {
    // Regression case for the bug that motivated P13.11: the previous
    // two-step form re-scanned for `status: deploy_failed` and appended
    // fail_reason to every existing occurrence, not just the ones flipped
    // this tick.
    const md = [
      'P1: {status: deploy_pending, tick: 1}',
      'P2: {status: deploy_failed, fail_reason: "deploy-live.sh exit 7", tick: 2}',
      'P3: {status: deploy_failed, fail_reason: "deploy-live.sh exit 1", tick: 3}',
      '',
    ].join('\n')
    const { updated, replaced } = flipPhaseStatusPure(md, 'deploy_pending', 'deploy_failed', 'deploy-live.sh exit 1')
    expect(replaced).toBe(1)
    // P1 gets exactly one fail_reason injected as it was flipped this tick.
    expect(updated).toContain('P1: {status: deploy_failed, fail_reason: "deploy-live.sh exit 1", tick: 1}')
    // P2 keeps its original single fail_reason; no duplicate appended.
    expect(updated).toContain('P2: {status: deploy_failed, fail_reason: "deploy-live.sh exit 7", tick: 2}')
    // P3 keeps its original single fail_reason too.
    expect(updated).toContain('P3: {status: deploy_failed, fail_reason: "deploy-live.sh exit 1", tick: 3}')
    // Whole file contains exactly 3 fail_reason strings (one per line) — pre-fix this would have been 5+.
    expect(updated.match(/fail_reason:/g)?.length).toBe(3)
  })

  it('escapes double-quotes inside fail_reason', () => {
    const md = 'P1: {status: deploy_pending}\n'
    const { updated } = flipPhaseStatusPure(md, 'deploy_pending', 'deploy_failed', 'boom "quoted"')
    expect(updated).toContain('fail_reason: "boom \\"quoted\\""')
  })

  it('handles a standalone `status: ...` line (not just inline maps)', () => {
    const md = [
      'P0_goal:',
      '  status: deploy_pending',
      '  sub_phases:',
      '    P0.1: {status: done, tick: 1}',
      '',
    ].join('\n')
    const { updated, replaced } = flipPhaseStatusPure(md, 'deploy_pending', 'done')
    expect(replaced).toBe(1)
    expect(updated).toContain('  status: done')
    expect(updated).toContain('P0.1: {status: done, tick: 1}')
  })
})
