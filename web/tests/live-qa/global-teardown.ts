/**
 * Live-QA global teardown — erases the run's founder account, loudly.
 *
 *   node --env-file=.env scripts/db/erase-account.mjs --email <qa> --dry-run
 *   node --env-file=.env scripts/db/erase-account.mjs --email <qa> --write
 *   node --env-file=.env scripts/db/erase-account.mjs --email <qa> --dry-run   → exit 2 (no row)
 *
 * The third call proves nothing is left under the QA address: the RPC
 * tombstones the row as `deleted+<hash>@erased.blockid.au`, so a look-up by
 * the original email must find no app_users row (exit code 2). Any other
 * outcome throws, which makes `playwright test` exit non-zero — the runner
 * then marks the run failed so a lingering QA account is never silent.
 *
 * The script only ever runs against the QA pattern; the email is re-checked
 * here before it is passed on.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { env, QA_EMAIL_RE } from "./lib/env";
import { patchRunState, readRunState, RUN_STATE_PATH } from "./lib/run-state";

const WEB_DIR = path.resolve(__dirname, "..", "..");

function erase(email: string, mode: "--dry-run" | "--write"): { code: number; out: string } {
  const args = ["--env-file=.env", "scripts/db/erase-account.mjs", "--email", email, mode];
  const r = spawnSync("node", args, { cwd: WEB_DIR, encoding: "utf8", timeout: 120_000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { code: r.status ?? -1, out };
}

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(RUN_STATE_PATH)) {
    console.warn("[live-qa] no run state — nothing to erase (setup never provisioned an account)");
    return;
  }
  const state = readRunState();
  const email = state.email;
  if (!QA_EMAIL_RE.test(email)) {
    throw new Error(`[live-qa] refusing to erase "${email}" — not a live-QA address`);
  }
  if (env.keepAccount) {
    console.warn(`[live-qa] LIVE_QA_KEEP_ACCOUNT=1 — leaving ${email} in place. Erase it by hand: node --env-file=.env scripts/db/erase-account.mjs --email ${email} --write`);
    patchRunState({ erasure: { ok: false, detail: "skipped (LIVE_QA_KEEP_ACCOUNT=1)" } });
    return;
  }

  const dry = erase(email, "--dry-run");
  console.log(`[live-qa] erase dry-run (exit ${dry.code}):\n${dry.out}`);
  if (dry.code !== 0) {
    patchRunState({ erasure: { ok: false, detail: `dry-run exit ${dry.code}: ${dry.out.slice(0, 400)}` } });
    throw new Error(`[live-qa] ERASURE FAILED — dry-run exit ${dry.code} for ${email}. The QA account is still on production; erase it by hand.`);
  }

  const write = erase(email, "--write");
  console.log(`[live-qa] erase --write (exit ${write.code}):\n${write.out}`);
  if (write.code !== 0) {
    patchRunState({ erasure: { ok: false, detail: `write exit ${write.code}: ${write.out.slice(0, 400)}` } });
    throw new Error(`[live-qa] ERASURE FAILED — --write exit ${write.code} for ${email}. The QA account is still on production; erase it by hand.`);
  }

  const verify = erase(email, "--dry-run");
  console.log(`[live-qa] erase verify (exit ${verify.code}): ${verify.out.split("\n")[0]}`);
  if (verify.code !== 2) {
    patchRunState({ erasure: { ok: false, detail: `verify expected exit 2 (no row), got ${verify.code}: ${verify.out.slice(0, 400)}` } });
    throw new Error(`[live-qa] ERASURE NOT VERIFIED — a row for ${email} still resolves (exit ${verify.code}, expected 2). Investigate before the next run.`);
  }
  patchRunState({ erasure: { ok: true, detail: `erased ${state.userId ?? "?"}; verify dry-run exit 2 (no app_users row for the QA email)` } });
  console.log(`[live-qa] ${email} erased and verified`);
}
