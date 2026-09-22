import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Extract only the production verifier. Never source the deployment script:
// doing so would acquire production locks and enter process/file mutations.
const source = readFileSync(new URL('./deploy-live.sh', import.meta.url), 'utf8');
const start = source.indexOf('verify_manual_rollback() {');
assert.ok(start >= 0);
const end = source.indexOf('\n}\n', start);
assert.ok(end > start);
const verifier = source.slice(start, end + 3);

function run(scenario, pid = '12345') {
  const dir = mkdtempSync(join(tmpdir(), 'blockid-rollback-test-'));
  try {
    writeFileSync(join(dir, 'pid'), pid);
    const result = spawnSync('bash', ['-c', `
set -euo pipefail
PID_FILE="$TEST_DIR/pid"
LOG="$TEST_DIR/server.log"
PROD_PORT=1
# All process, time, logging, and network operations are shell mocks.
kill() { [ "$SCENARIO" != dead ]; }
sleep() { :; }
rollback_log() { printf '%s|%s|%s|%s\\n' "$@" >> "$TEST_DIR/outcomes"; }
curl() {
  printf '%s\\n' "$*" >> "$TEST_DIR/calls"
  case "$SCENARIO" in
    healthy) printf 200 ;;
    startup) if [ "$(wc -l < "$TEST_DIR/calls")" -lt 3 ]; then printf 503; else printf 200; fi ;;
    http_error) printf 500 ;;
    redirect) printf 302 ;;
    transport) printf 000; return 28 ;;
    misleading_transport) printf 200; return 28 ;;
    *) return 1 ;;
  esac
}
${verifier}
if verify_manual_rollback 'prev-release:fixture'; then exit 0; fi
exit 1
`], { env: { ...process.env, TEST_DIR: dir, SCENARIO: scenario }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.signal, null, result.stderr);
    const read = name => { try { return readFileSync(join(dir, name), 'utf8').trim(); } catch { return ''; } };
    return { status: result.status, output: result.stdout, outcomes: read('outcomes'), calls: read('calls').split('\n').filter(Boolean) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('restored process + HTTP 200 records one successful recovery', () => {
  const r = run('healthy');
  assert.equal(r.status, 0);
  assert.equal(r.outcomes, 'success|prev-release:fixture|200|12345');
  assert.equal(r.calls.length, 1);
});

test('startup retries transient HTTP failures before reporting recovery', () => {
  const r = run('startup');
  assert.equal(r.status, 0);
  assert.equal(r.calls.length, 3);
  assert.equal(r.outcomes, 'success|prev-release:fixture|200|12345');
});

for (const [scenario, expectedHttp] of [['http_error', '500'], ['redirect', '302'], ['transport', '000'], ['misleading_transport', '000']]) {
  test(`${scenario} fails after bounded attempts and never claims success`, () => {
    const r = run(scenario);
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 20);
    assert.equal(r.outcomes, `failed|prev-release:fixture|${expectedHttp}|12345`);
    assert.doesNotMatch(r.output, /✅/);
    for (const call of r.calls) {
      assert.match(call, /--connect-timeout 2 --max-time 3/);
    }
  });
}

for (const [scenario, pid] of [['dead', '12345'], ['healthy', '']]) {
  test(`missing or exited process (${scenario}) cannot pass even with a healthy HTTP mock`, () => {
    const r = run(scenario, pid);
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 0);
    assert.equal(r.outcomes, `failed|prev-release:fixture|000|${pid || '0'}`);
  });
}

test('each manual restore branch gates exit 0 on verified recovery', () => {
  for (const src of ['prev-release:', 'snapshot:', 'legacy-backup']) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(source, new RegExp(`if verify_manual_rollback "${escaped}[^\\n]*; then\\s+exit 0\\s+fi\\s+exit 1`));
  }
  const syntax = spawnSync('bash', ['-n', new URL('./deploy-live.sh', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});
