// ai-token-guardian.sh — W1 (pricing v5 §7.2 #6).
//
// The script runs for real against a throwaway HOME: a fake `claude` on PATH
// (noop, or one that rewrites expiresAt), a fake alert command that records
// its calls, no web/.env (so no health ping / network). Nothing here touches
// the real credentials, crontab or ops alert channels.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('./ai-token-guardian.sh', import.meta.url).pathname;
const NOW = 1_800_000_000_000;

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ai-token-guardian-test-'));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'web'));
  writeFileSync(join(dir, 'alert.sh'), `#!/bin/sh\nprintf '%s\\n' "$1" >> "${dir}/alerts.log"\n`);
  chmodSync(join(dir, 'alert.sh'), 0o755);
  claude('noop');
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function claude(kind) {
  const body = kind === 'refresh'
    ? `#!/bin/sh\nprintf '{"claudeAiOauth":{"accessToken":"t","expiresAt":${NOW + 8 * 3_600_000}}}' > "${dir}/creds.json"\n`
    : '#!/bin/sh\nexit 0\n';
  writeFileSync(join(dir, 'bin', 'claude'), body);
  chmodSync(join(dir, 'bin', 'claude'), 0o755);
}

function creds(expiresAt) {
  writeFileSync(join(dir, 'creds.json'), JSON.stringify({ claudeAiOauth: { accessToken: 't', ...(expiresAt === undefined ? {} : { expiresAt }) } }));
}

function run() {
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      HOME: dir,
      CRED_FILE: join(dir, 'creds.json'),
      WEB_DIR: join(dir, 'web'),
      GUARDIAN_STATE_DIR: join(dir, 'state'),
      GUARDIAN_NOW_MS: String(NOW),
      GUARDIAN_ALERT_CMD: join(dir, 'alert.sh'),
      GUARDIAN_REREAD_SLEEP: '0',
    },
  });
  return r.stdout + r.stderr;
}

const alerts = () => (existsSync(join(dir, 'alerts.log')) ? readFileSync(join(dir, 'alerts.log'), 'utf8').trim().split('\n').filter(Boolean) : []);

describe('ai-token-guardian.sh', () => {
  it('never restarts a docker container (the container no longer exists)', () => {
    expect(readFileSync(SCRIPT, 'utf8')).not.toMatch(/^[^#]*docker restart/m);
  });

  it('a missing / zero expiresAt is "unknown" — never "-29874690 min"', () => {
    creds(0);
    const out = run();
    expect(out).toContain('expiry unknown');
    expect(out).not.toMatch(/-\d{5,}min/);
    expect(alerts()).toEqual([]);
    creds(undefined);
    expect(run()).toContain('expiry unknown');
  });

  it('a healthy token logs the minutes left', () => {
    creds(NOW + 120 * 60_000);
    expect(run()).toContain('Claude OK — 120min remaining');
  });

  it('a failed CLI refresh alerts once per UTC day and stays quiet on the next runs', () => {
    creds(NOW - 5 * 60_000);
    const first = run();
    expect(first).toContain('expired 5min ago');
    expect(first).toContain('ops alerted (once today)');
    const second = run();
    expect(second).not.toContain('CLI refresh failed');
    expect(alerts()).toEqual(['Claude CLI token refresh failed']);
  });

  it('a successful CLI refresh is logged and does not alert', () => {
    creds(NOW + 5 * 60_000);
    claude('refresh');
    expect(run()).toContain('Claude token refreshed (expires in 5min) — 480min remaining');
    expect(alerts()).toEqual([]);
  });
});
