import assert from 'node:assert/strict';
import test from 'node:test';
import { servingStatusBase, readStatusBody } from './error-digest.mjs';

test('status reader uses validated dynamic origin', async () => {
  let requested;
  const body = await readStatusBody({ env: {}, execImpl: () => '4137\n', fetchImpl: async (url) => {
    requested = url;
    return { ok: true, json: async () => ({ fixture: true }) };
  }});
  assert.equal(requested, 'http://127.0.0.1:4137/api/status');
  assert.deepEqual(body, { fixture: true });
});

test('invalid/switching state never falls back to legacy origin', async () => {
  let calls = 0;
  const body = await readStatusBody({ env: {}, execImpl: () => { throw new Error('switching'); }, fetchImpl: async () => { calls++; } });
  assert.equal(body, null);
  assert.equal(calls, 0);
});

test('reject malformed helper output and preserve explicit test override', () => {
  assert.equal(servingStatusBase({ env: {}, execImpl: () => '9999' }), null);
  assert.equal(servingStatusBase({ env: {}, execImpl: () => '4001' }), 'http://127.0.0.1:4001');
  assert.equal(servingStatusBase({ env: { STATUS_BASE_URL: 'http://fixture.test/' }, execImpl: () => { throw new Error('must not execute'); } }), 'http://fixture.test');
});
