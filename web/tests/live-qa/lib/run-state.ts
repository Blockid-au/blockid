/**
 * Per-run state shared between the global setup, every spec and the global
 * teardown. Written to test-results/live-qa/run-state.json (gitignored).
 *
 * The password is kept in memory only for the length of the register call —
 * the storage state file carries the session cookie, which is all the specs
 * need, and the teardown erases the account, so nothing durable is recorded.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LIVE_QA_OUT } from "../../../playwright.live-qa.config";

export const RUN_STATE_PATH = path.join(LIVE_QA_OUT, "run-state.json");

export interface RunState {
  startedAt: string;
  baseURL: string;
  email: string;
  /**
   * The founder's password. Needed by 25-account (the deletion request
   * re-authenticates with the password — there is no other self-service
   * path a headless run can take). Scrubbed by the teardown once the
   * account is erased; the file is gitignored and the account throw-away.
   */
  password?: string;
  userId: string | null;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string;
  /** Plan as reported by /api/auth/me after setup (and after elevation). */
  plan: string;
  elevated: boolean;
  /** Free-form scratch the specs use to hand ids to later specs (roundId, contactId, …). */
  scratch: Record<string, string | number | boolean | null>;
  /** Second account of the member lane (26) — registered by the spec, erased by the teardown. */
  member?: { email: string; userId: string | null; memberId?: string | null };
  /** Filled in by the teardown. */
  erasure?: { ok: boolean; detail: string };
  memberErasure?: { ok: boolean; detail: string };
}

export function readRunState(): RunState {
  if (!existsSync(RUN_STATE_PATH)) {
    throw new Error(`live-qa run state missing at ${RUN_STATE_PATH} — the global setup did not run`);
  }
  return JSON.parse(readFileSync(RUN_STATE_PATH, "utf8")) as RunState;
}

export function writeRunState(state: RunState): void {
  mkdirSync(path.dirname(RUN_STATE_PATH), { recursive: true });
  writeFileSync(RUN_STATE_PATH, JSON.stringify(state, null, 2));
}

export function patchRunState(patch: Partial<RunState>): RunState {
  const next = { ...readRunState(), ...patch };
  writeRunState(next);
  return next;
}

export function setScratch(key: string, value: string | number | boolean | null): void {
  const state = readRunState();
  state.scratch[key] = value;
  writeRunState(state);
}

export function getScratch<T extends string | number | boolean | null>(key: string): T | undefined {
  return readRunState().scratch[key] as T | undefined;
}
