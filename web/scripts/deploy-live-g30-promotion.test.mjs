import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('./deploy-live.sh', import.meta.url), 'utf8');
test('normal admission does not load production credentials or mode into CI gates', () => {
  const start = source.indexOf('# G30 initial admission:');
  const end = source.indexOf('# PRE-GATE (G15-R1):', start);
  assert.ok(start >= 0 && end > start);
  const result = spawnSync('bash', ['-c', `
set -euo pipefail
unset NODE_ENV G30_FAKE_PRODUCTION_SECRET
PID_FILE=unused CURRENT_LINK=unused WEB_DIR=unused
load_env() { export NODE_ENV=production G30_FAKE_PRODUCTION_SECRET=loaded; }
cat() { echo 101; }
readlink() { echo /tmp/retained-origin; }
git() { return 0; }
fail() { echo "$*" >&2; exit 1; }
g30_state() { case "$1" in --port) echo 4001;; --verify-active) echo '{"sha":"old"}';; --allocate) echo 4100;; esac; }
g30_json_field() { cat >/dev/null; echo old; }
g30_configured_port() { echo 4001; }
${source.slice(start, end)}
test -z "\${NODE_ENV:-}"
test -z "\${G30_FAKE_PRODUCTION_SECRET:-}"
`], { env: process.env, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
});

function shellFunction(name) {
  const start = source.indexOf(`${name}() {\n`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 3);
}

function recovery(scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'g30-warm-recovery-'));
  try {
    const result = spawnSync('bash', ['-c', `
set -euo pipefail
PID_FILE="$TEST_DIR/pid"
printf '101\\n' > "$PID_FILE"
CANDIDATE_PORT=4100
ROLLBACK_TARGET_JSON='{"port":4001,"sha":"old"}'
${shellFunction('g30_json_field')}
${shellFunction('g30_warm_rollback')}
g30_state() {
  printf '%s\\n' "$*" >> "$TEST_DIR/actions"
  case "$1" in
    --snapshot) printf '{"phase":"%s"}' "$([ "$SCENARIO" = before_cutover ] && echo switching || echo stable)" ;;
    --verify-port) [ "$SCENARIO" != target_dead ] ;;
    --activate) [ "$SCENARIO" != state_failure ] ;;
    *) return 0 ;;
  esac
}
g30_configured_port() { if [ "$SCENARIO" = before_cutover ]; then printf 4001; else printf 4100; fi; }
g30_proxy_switch() { printf 'proxy %s %s\\n' "$1" "$2" >> "$TEST_DIR/actions"; [ "$SCENARIO" != proxy_failure ]; }
g30_verify_public() { printf 'public\\n' >> "$TEST_DIR/actions"; [ "$SCENARIO" != public_failure ]; }
g30_sync_aliases() { printf 'aliases\\n' >> "$TEST_DIR/actions"; }
rollback_log() { printf 'log %s\\n' "$1" >> "$TEST_DIR/actions"; }
if [ "$SCENARIO" = before_cutover ]; then CANDIDATE_PORT=4001; fi
if g30_warm_rollback; then result=0; else result=1; fi
printf 'status=%s http=%s\\n' "$ROLLBACK_STATUS" "$ROLLBACK_HTTP"
cat "$TEST_DIR/actions"
exit "$result"
`], { env: { ...process.env, TEST_DIR: dir, SCENARIO: scenario }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.signal, null, result.stderr);
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('warm recovery switches to healthy target without stopping either process', () => {
  const r = recovery('healthy');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /proxy 4100 4001/);
  assert.match(r.stdout, /--quarantine --listen-port 4100/);
  assert.match(r.stdout, /log success/);
  assert.doesNotMatch(shellFunction('g30_warm_rollback').split('\n').filter(line => !line.trim().startsWith('#')).join('\n'), /\bkill\b|fuser|nohup/);
});

test('interrupted before cutover reconciles current verified origin without quarantining it', () => {
  const r = recovery('before_cutover');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /--quarantine|proxy 4001 4001/);
  assert.match(r.stdout, /--activate --rollback --listen-port 4001/);
});

test('public uncertainty preserves truthful restored local state but never reports success', () => {
  const r = recovery('public_failure');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /status=external_unverified http=200/);
  assert.ok(r.stdout.indexOf('--activate') < r.stdout.indexOf('public\n'));
  assert.doesNotMatch(r.stdout, /log success/);
});

for (const scenario of ['target_dead', 'proxy_failure', 'state_failure']) {
  test(`${scenario} fails recovery without success claim`, () => {
    const r = recovery(scenario);
    assert.equal(r.status, 1, r.stderr);
    assert.doesNotMatch(r.stdout, /log success/);
    if (scenario === 'target_dead') assert.doesNotMatch(r.stdout, /proxy 4100/);
  });
}

test('candidate promotion is non-stopping and independently copies runtime artifacts', () => {
  const from = source.indexOf('gate "Promote retained candidate');
  const to = source.indexOf('# GATE 9:', from);
  const promotion = source.slice(from, to);
  assert.doesNotMatch(promotion, /\bkill\b|fuser|nohup|sleep 2/);
  assert.ok(promotion.indexOf('--register') < promotion.indexOf('--begin'));
  assert.ok(promotion.indexOf('--begin') < promotion.indexOf('g30_proxy_switch'));
  assert.match(source, /cp -a --reflink=auto "\$STANDALONE\/\."/);
  assert.match(source, /load_env\nexport NODE_PATH="\$RELEASE_DIR\/\$FROZEN_NODE_PATH"/);
  assert.match(source, /export HOSTNAME=127\.0\.0\.1/);
  assert.match(source, /g30_state --gates-passed/);
  assert.match(source, /G30_RECOVERY_EXPECTED_PORT/);
  assert.ok(source.indexOf('G30 warm rollback dry run') < source.indexOf('path A — previous immutable release'));
});
