/**
 * Live-QA global teardown — erases the run's accounts, loudly.
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
 * The script only ever runs against the QA patterns; every email is
 * re-checked here before it is passed on. The member-lane account (26,
 * `qa-live-member-<stamp>@blockid.au`, recorded in run-state.member) and
 * the dossier-lane evaluator seat (28, `qa-live-evaluator-<stamp>@blockid.au`,
 * run-state.evaluator — G13 S-D3) go through the same three steps first; a
 * member / evaluator failure is recorded and still throws, but never before
 * the founder erasure has been attempted.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { env, QA_ANY_EMAIL_RE, QA_EMAIL_RE, QA_EVALUATOR_EMAIL_RE, QA_MEMBER_EMAIL_RE } from "./lib/env";
import { patchRunState, readRunState, RUN_STATE_PATH } from "./lib/run-state";

const WEB_DIR = path.resolve(__dirname, "..", "..");

function erase(email: string, mode: "--dry-run" | "--write"): { code: number; out: string } {
  if (!QA_ANY_EMAIL_RE.test(email)) throw new Error(`[live-qa] refusing to erase "${email}" — not a live-QA address`);
  // `--env-file=.env` as documented; the script itself only reads PSQL /
  // PGURL / SUPABASE_DB_CONTAINER, so a checkout without .env still erases.
  const envFile = existsSync(path.join(WEB_DIR, ".env")) ? ["--env-file=.env"] : [];
  const args = [...envFile, "scripts/db/erase-account.mjs", "--email", email, mode];
  const r = spawnSync("node", args, { cwd: WEB_DIR, encoding: "utf8", timeout: 120_000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { code: r.status ?? -1, out };
}

/**
 * dry-run → --write → dry-run (must exit 2). Records the outcome on the run
 * state under `key` and throws on any deviation.
 */
function eraseVerified(email: string, userId: string | null, key: "erasure" | "memberErasure" | "evaluatorErasure"): void {
  const label = key === "erasure" ? "founder" : key === "memberErasure" ? "member" : "evaluator";
  const dry = erase(email, "--dry-run");
  console.log(`[live-qa] ${label} erase dry-run (exit ${dry.code}):\n${dry.out}`);
  if (dry.code !== 0) {
    patchRunState({ [key]: { ok: false, detail: `dry-run exit ${dry.code}: ${dry.out.slice(0, 400)}` } });
    throw new Error(`[live-qa] ERASURE FAILED — dry-run exit ${dry.code} for ${email}. The QA ${label} account is still on production; erase it by hand.`);
  }

  const write = erase(email, "--write");
  console.log(`[live-qa] ${label} erase --write (exit ${write.code}):\n${write.out}`);
  if (write.code !== 0) {
    patchRunState({ [key]: { ok: false, detail: `write exit ${write.code}: ${write.out.slice(0, 400)}` } });
    throw new Error(`[live-qa] ERASURE FAILED — --write exit ${write.code} for ${email}. The QA ${label} account is still on production; erase it by hand.`);
  }

  const verify = erase(email, "--dry-run");
  console.log(`[live-qa] ${label} erase verify (exit ${verify.code}): ${verify.out.split("\n")[0]}`);
  if (verify.code !== 2) {
    patchRunState({ [key]: { ok: false, detail: `verify expected exit 2 (no row), got ${verify.code}: ${verify.out.slice(0, 400)}` } });
    throw new Error(`[live-qa] ERASURE NOT VERIFIED — a row for ${email} still resolves (exit ${verify.code}, expected 2). Investigate before the next run.`);
  }
  patchRunState({ [key]: { ok: true, detail: `erased ${userId ?? "?"}; verify dry-run exit 2 (no app_users row for the QA ${label} email)` } });
  console.log(`[live-qa] ${email} erased and verified`);
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
  const member = state.member ?? null;
  if (member && !QA_MEMBER_EMAIL_RE.test(member.email)) {
    throw new Error(`[live-qa] refusing to erase member "${member.email}" — not a live-QA member address`);
  }
  // G13 S-D3 dossier lane (28): the evaluator seat — same rule, same three steps.
  const evaluator = state.evaluator ?? null;
  if (evaluator && !QA_EVALUATOR_EMAIL_RE.test(evaluator.email)) {
    throw new Error(`[live-qa] refusing to erase evaluator "${evaluator.email}" — not a live-QA evaluator address`);
  }
  if (env.keepAccount) {
    console.warn(`[live-qa] LIVE_QA_KEEP_ACCOUNT=1 — leaving ${email}${member ? ` and ${member.email}` : ""}${evaluator ? ` and ${evaluator.email}` : ""} in place. Erase by hand: node --env-file=.env scripts/db/erase-account.mjs --email <address> --write`);
    patchRunState({
      erasure: { ok: false, detail: "skipped (LIVE_QA_KEEP_ACCOUNT=1)" },
      ...(member ? { memberErasure: { ok: false, detail: "skipped (LIVE_QA_KEEP_ACCOUNT=1)" } } : {}),
      ...(evaluator ? { evaluatorErasure: { ok: false, detail: "skipped (LIVE_QA_KEEP_ACCOUNT=1)" } } : {}),
    });
    return;
  }

  // Member first (it holds a membership row on the founder's project), then
  // the evaluator seat (its evaluation row references the founder as
  // founder_user_id and its project cascades with it); whatever happens to
  // either, the founder erasure is still attempted.
  let memberError: unknown = null;
  if (member) {
    try {
      eraseVerified(member.email, member.userId, "memberErasure");
    } catch (e) {
      memberError = e;
      console.error(String(e));
    }
  }
  let evaluatorError: unknown = null;
  if (evaluator) {
    try {
      eraseVerified(evaluator.email, evaluator.userId, "evaluatorErasure");
    } catch (e) {
      evaluatorError = e;
      console.error(String(e));
    }
  }
  eraseVerified(email, state.userId, "erasure");
  // The password was only ever needed by 25-account; the account is gone.
  patchRunState({ password: undefined });
  if (memberError) throw memberError;
  if (evaluatorError) throw evaluatorError;
}
