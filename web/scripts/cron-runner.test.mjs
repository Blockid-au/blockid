// cron-runner.sh — the per-job flock must be free the moment a run exits.
//
// 27/09 health sweep: the overall watchdog `( sleep N && kill … ) &` forked
// a `sleep` that inherited the lock fd (9); the EXIT trap killed only the
// subshell, so the orphaned `sleep` held /tmp/blockid-cron.<job>.lock for
// the full watchdog window. report-order-drain (*/2) then ran every ~10 min.
//
// The runner is executed for real against a throwaway WEB_DIR: a stub
// g30-serving-state.py (serving port), a stub `curl` on PATH (a noop JSON
// body — no network, no health-log row) and a private text log. Nothing
// here touches the production crontab, logs or services.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const RUNNER = new URL('./cron-runner.sh', import.meta.url).pathname;
const hasFlock = spawnSync('bash', ['-c', 'command -v flock'], { stdio: 'ignore' }).status === 0;

let dir;
let endpoint;
let lockFile;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blockid-cron-runner-test-'));
  mkdirSync(join(dir, 'web', 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'bin'));
  copyFileSync(RUNNER, join(dir, 'web', 'scripts', 'cron-runner.sh'));
  writeFileSync(join(dir, 'web', 'scripts', 'g30-serving-state.py'), 'print(4001)\n');
  writeFileSync(join(dir, 'bin', 'curl'), '#!/bin/sh\nprintf \'{"ok":true,"noop":true}\'\n');
  chmodSync(join(dir, 'bin', 'curl'), 0o755);
  endpoint = `vitest-watchdog-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  lockFile = `/tmp/blockid-cron.${endpoint}.lock`;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(lockFile, { force: true });
});

function runRunner(timeoutS) {
  return spawnSync('bash', [join(dir, 'web', 'scripts', 'cron-runner.sh'), endpoint, '--timeout', String(timeoutS)], {
    // No pipes: an orphaned child holding stdout would make spawnSync wait.
    stdio: 'ignore',
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      CRON_SECRET: 'test-secret',
      BLOCKID_CRON_LOG: join(dir, 'cron.log'),
      BLOCKID_CRON_HEALTH_LOG: join(dir, 'cron-health.jsonl'),
    },
  });
}

function lockIsFree() {
  return spawnSync('flock', ['-n', lockFile, '-c', 'true'], { stdio: 'ignore' }).status === 0;
}

function watchdogSleepAlive(seconds) {
  return spawnSync('pgrep', ['-f', `^sleep ${seconds}$`], { stdio: 'ignore' }).status === 0;
}

describe.skipIf(!hasFlock)('cron-runner.sh watchdog', () => {
  it('releases the per-job lock as soon as the run exits', () => {
    const res = runRunner(517);
    expect(res.status).toBe(0);
    expect(readFileSync(join(dir, 'cron.log'), 'utf8')).toContain(`${endpoint}: ok [noop]`);
    expect(existsSync(join(dir, 'cron-health.jsonl'))).toBe(false); // noop → no health row
    expect(lockIsFree()).toBe(true);
  });

  it('does not leave the watchdog sleep running after the run', async () => {
    const res = runRunner(523); // watchdog = 523 + 30 = 553 s
    expect(res.status).toBe(0);
    let alive = true;
    for (let i = 0; i < 20 && alive; i += 1) {
      alive = watchdogSleepAlive(553);
      if (alive) await new Promise((r) => setTimeout(r, 100));
    }
    expect(alive).toBe(false);
  });

  it('a second run right after the first is not skipped for lock contention', () => {
    expect(runRunner(529).status).toBe(0);
    expect(runRunner(529).status).toBe(0);
    const log = readFileSync(join(dir, 'cron.log'), 'utf8');
    expect(log.match(/: ok \[noop\]/g)?.length).toBe(2);
    expect(log).not.toContain('skip (previous run still holding lock)');
  });
});
