// disk-pressure-alert.sh — L0-4 (2026-10-20): /data reached 91% while the
// guardian only sampled `/` and blockid-disk-guard.service failed silently
// every 5 minutes (exit 2, StandardOutput=null).
//
// The script runs for real against a throwaway state dir with a fake `df`
// (DF_CMD), a fake `systemctl show` (DISK_GUARD_STATUS_CMD), a fake journal
// and a fake alert sender (OPS_ALERT_CMD) that appends to a file. Nothing here
// reads the real disks, the real unit or sends mail.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('./disk-pressure-alert.sh', import.meta.url).pathname;

let dir;

function exe(name, body) {
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

/** fake `df -P <mount>`: usage per mount from a map. */
function fakeDf(usage) {
  const cases = Object.entries(usage)
    .map(([m, pct]) => `  ${m}) echo "/dev/x 100000000 ${pct}000000 ${100 - pct}000000 ${pct}% ${m}" ;;`)
    .join('\n');
  return exe('fake-df', `mount="\${@: -1}"\necho "Filesystem 1024-blocks Used Available Capacity Mounted on"\ncase "$mount" in\n${cases}\n  *) echo "df: $mount: No such file" >&2; exit 1 ;;\nesac`);
}

function fakeGuard(result, status) {
  return exe('fake-systemctl', `printf 'Result=%s\\nExecMainStatus=%s\\nExecMainExitTimestamp=Tue 2026-10-20 09:57:46 UTC\\n' '${result}' '${status}'`);
}

function run({ usage, guard = ['success', '0'], today = '2026-10-20', extraEnv = {} }) {
  const res = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      DF_CMD: `${fakeDf(usage)} -P`,
      DISK_GUARD_STATUS_CMD: fakeGuard(...guard),
      DISK_GUARD_JOURNAL_CMD: exe('fake-journal', `echo 'Failed to start'\necho '{"action_needed": "x", "residual_pressure": ["/data"], "status": "complete"}'`),
      OPS_ALERT_CMD: exe('fake-alert', `printf '%s | %s\\n' "$1" "$2" >> "${dir}/alerts.txt"`),
      DISK_ALERT_STATE_DIR: join(dir, 'state'),
      DISK_ALERT_LOG: join(dir, 'disk-alert.jsonl'),
      DISK_ALERT_TODAY: today,
      DISK_ALERT_MOUNTS: '/ /data',
      ...extraEnv,
    },
  });
  expect(res.status, res.stderr).toBe(0);
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

const alerts = () => (existsSync(join(dir, 'alerts.txt')) ? readFileSync(join(dir, 'alerts.txt'), 'utf8').trim().split('\n') : []);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blockid-disk-alert-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('disk-pressure-alert.sh', () => {
  it('stays quiet below 85% on every mount', () => {
    const snap = run({ usage: { '/': 40, '/data': 84 } });
    expect(snap.disk_level).toBe('ok');
    expect(snap.disks.map((d) => [d.mount, d.pct, d.level])).toEqual([['/', 40, 'ok'], ['/data', 84, 'ok']]);
    expect(snap.alerts_sent).toEqual([]);
    expect(alerts()).toEqual([]);
  });

  it('warns at 86% on /data (not only /) and logs one jsonl line', () => {
    const snap = run({ usage: { '/': 40, '/data': 86 } });
    expect(snap.disk_level).toBe('warn');
    expect(snap.alerts_sent).toEqual(['data.warn']);
    const sent = alerts();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^Disk warn: \/data at 86%/);
    const log = readFileSync(join(dir, 'disk-alert.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ key: 'data.warn', day: '2026-10-20' });
  });

  it('goes critical at 93% and dedupes per (mount, level, day)', () => {
    run({ usage: { '/': 40, '/data': 93 } });
    const again = run({ usage: { '/': 40, '/data': 93 } });
    expect(again.disk_level).toBe('critical');
    expect(again.alerts_sent).toEqual([]);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatch(/^Disk critical: \/data at 93%/);
    // escalation the same day is a new level → alerts once more
    run({ usage: { '/': 93, '/data': 93 } });
    expect(alerts()).toHaveLength(2);
    // next day → reminder again
    const tomorrow = run({ usage: { '/': 40, '/data': 93 }, today: '2026-10-21' });
    expect(tomorrow.alerts_sent).toEqual(['data.critical']);
    expect(alerts()).toHaveLength(3);
  });

  it('a warn already sent today does not suppress a later critical', () => {
    run({ usage: { '/': 40, '/data': 86 } });
    run({ usage: { '/': 40, '/data': 92 } });
    expect(alerts().map((a) => a.split(' |')[0])).toEqual([
      expect.stringMatching(/^Disk warn: \/data at 86%/),
      expect.stringMatching(/^Disk critical: \/data at 92%/),
    ]);
  });

  it('honours configurable mounts and thresholds', () => {
    const snap = run({
      usage: { '/': 50, '/data': 50, '/srv': 71 },
      extraEnv: { DISK_ALERT_MOUNTS: '/ /srv', DISK_WARN_PCT: '70', DISK_CRIT_PCT: '90' },
    });
    expect(snap.disks.map((d) => d.mount)).toEqual(['/', '/srv']);
    expect(snap.alerts_sent).toEqual(['srv.warn']);
  });

  it('reports an unreadable mount as unknown without alerting', () => {
    const snap = run({ usage: { '/': 40 } });
    expect(snap.disks[1]).toMatchObject({ mount: '/data', pct: null, level: 'unknown' });
    expect(snap.disk_level).toBe('ok');
    expect(alerts()).toEqual([]);
  });

  it('surfaces a failing disk-guard (exit 2) once per day with the residual mount', () => {
    const snap = run({ usage: { '/': 40, '/data': 80 }, guard: ['exit-code', '2'] });
    expect(snap.disk_guard).toEqual({ level: 'failed', result: 'exit-code', exit_status: 2 });
    expect(snap.alerts_sent).toEqual(['disk-guard.failed']);
    expect(alerts()[0]).toMatch(/Disk guard failing .*exit 2/);
    expect(alerts()[0]).toMatch(/Residual pressure on: \/data/);
    run({ usage: { '/': 40, '/data': 80 }, guard: ['exit-code', '2'] });
    expect(alerts()).toHaveLength(1);
  });

  it('treats exit 75 (deploy lock busy) and success as healthy', () => {
    expect(run({ usage: { '/': 40, '/data': 40 }, guard: ['success', '0'] }).disk_guard.level).toBe('ok');
    expect(run({ usage: { '/': 40, '/data': 40 }, guard: ['exit-code', '75'] }).disk_guard.level).toBe('ok');
    expect(alerts()).toEqual([]);
  });

  it('dry-run sends nothing and records no dedupe state', () => {
    const snap = run({ usage: { '/': 40, '/data': 93 }, extraEnv: { DISK_ALERT_DRY_RUN: '1' } });
    expect(snap.disk_level).toBe('critical');
    expect(alerts()).toEqual([]);
    expect(existsSync(join(dir, 'disk-alert.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'state', 'data.critical'))).toBe(false);
  });
});
