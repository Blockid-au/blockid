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
  /**
   * G15-R1 — pid of the Playwright runner that provisioned this state. The
   * next global setup refuses to start while this pid is alive and the state
   * is younger than STALE_RUN_MS (two runs sharing one file = false failures).
   */
  pid?: number;
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
  /** Third account: the evaluator seat of the dossier lane (28, G13 S-D3) — registered by the spec, typed investor_angel by a DB step, erased by the teardown. */
  evaluator?: { email: string; userId: string | null; evaluationId?: string | null; projectId?: string | null };
  /** Filled in by the teardown. */
  erasure?: { ok: boolean; detail: string };
  memberErasure?: { ok: boolean; detail: string };
  evaluatorErasure?: { ok: boolean; detail: string };
}

export function readRunState(): RunState {
  if (!existsSync(RUN_STATE_PATH)) {
    throw new Error(`live-qa run state missing at ${RUN_STATE_PATH} — the global setup did not run`);
  }
  return JSON.parse(readFileSync(RUN_STATE_PATH, "utf8")) as RunState;
}

/** Like readRunState but `null` when the file is missing or unparseable (setup-time probe). */
export function readRunStateIfPresent(file: string = RUN_STATE_PATH): Partial<RunState> | null {
  try {
    if (!existsSync(file)) return null;
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Partial<RunState>) : null;
  } catch {
    return null;
  }
}

// ── G15-R1: refuse to start over a live run ────────────────────────────
/** A run state older than this is stale by definition (a whole run takes < 20 min). */
export const STALE_RUN_MS = 20 * 60 * 1000;

/** `process.kill(pid, 0)` — true when the pid exists (EPERM = exists, not ours). */
export function isPidAlive(pid: number, kill: (pid: number, sig: 0) => unknown = process.kill.bind(process)): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

/**
 * The reason a new run must NOT start, or `null` when it may. Pure: the
 * caller passes the previous state, `now`, its own pid and an aliveness
 * probe. Conflict = state < STALE_RUN_MS old AND its pid alive AND not us.
 */
export function liveRunConflict(
  prev: Partial<RunState> | null,
  opts: { nowMs?: number; selfPid?: number; alive?: (pid: number) => boolean; staleMs?: number } = {},
): string | null {
  if (!prev) return null;
  const now = opts.nowMs ?? Date.now();
  const staleMs = opts.staleMs ?? STALE_RUN_MS;
  const alive = opts.alive ?? ((pid: number) => isPidAlive(pid));
  const selfPid = opts.selfPid ?? process.pid;
  const started = typeof prev.startedAt === "string" ? Date.parse(prev.startedAt) : NaN;
  if (Number.isNaN(started)) return null; // unknown age → treat as stale (old format)
  const ageMs = now - started;
  if (Math.abs(ageMs) >= staleMs) return null; // clock skew either way counts as stale
  const pid = typeof prev.pid === "number" ? prev.pid : NaN;
  if (!Number.isInteger(pid) || pid === selfPid) return null; // pre-G15 state has no pid → cannot be proven alive
  if (!alive(pid)) return null;
  const mins = Math.max(0, Math.round(ageMs / 60_000));
  return (
    `another live-QA run is still in progress: ${prev.email ?? "(unknown account)"} started ${mins} min ago ` +
    `(pid ${pid} is alive, run state ${RUN_STATE_PATH}). Two runs would share run-state.json and fail each other — ` +
    `wait for it (bash scripts/qa-live.sh --wait), or if pid ${pid} is a zombie: kill it and delete the run state.`
  );
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
