/**
 * G36 tick 3 — drain the run's in-flight evaluation-batch work BEFORE the
 * global teardown erases the QA accounts.
 *
 * Incident 2026-11-25: 37-cohort queued a one-item batch for the evaluator
 * seat; the evaluation-batch-runner cron (every 20 min, 12–20 UTC) claimed
 * it; the teardown then erased the accounts (evaluation_batches / projects
 * cascade from app_users) while the report pipeline was mid-run → ~10 min of
 * model calls on deleted data and a burst of FK failures in the error
 * digest. The app now stops an orphaned run quietly, but the suite should not
 * create orphans at all.
 *
 * What it does (there is no batch-cancel API, so this is the same scoped
 * `psql` path scripts/db/erase-account.mjs uses):
 *   every poll, for items of batches owned by — or evaluating projects owned
 *   by — the run's QA addresses:
 *     queued  → failed, error='qa_teardown_cancelled' (the runner's claim is
 *               `… where status='queued'`, so it can never pick them up again;
 *               re-done each poll because a budget-skipped item goes back to queued)
 *     running → waited for, bounded (default 2 min, poll 5 s)
 *   then returns; the caller erases regardless. A drain that cannot run
 *   (no table, psql error) is reported, never thrown — erasure must happen.
 */
import { QA_ANY_EMAIL_RE } from "./env";

export const QA_TEARDOWN_CANCELLED = "qa_teardown_cancelled";
export const DRAIN_TIMEOUT_MS = 120_000;
export const DRAIN_POLL_MS = 5_000;

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

/** `t` when migration 0322 (evaluation_batch_items) is in the database. */
export const BATCH_ITEMS_EXIST_SQL = "select to_regclass('public.evaluation_batch_items') is not null;";

/**
 * One top-level statement (a data-modifying CTE must be top level): cancel the
 * run's queued items and print `<cancelled>|<running>`. Every address is
 * re-checked against the live-QA pattern here AND in SQL.
 */
export function drainSql(emails: string[]): string {
  const list = [...new Set(emails)];
  if (list.length === 0) throw new Error("drainSql: no QA addresses");
  for (const e of list) {
    if (!QA_ANY_EMAIL_RE.test(e)) throw new Error(`live-qa drain refused: "${e}" is not a live-QA address`);
  }
  const inList = list.map(q).join(", ");
  return `with qa as (
  select id from public.app_users
   where email in (${inList})
     and email ~ '^qa-live-(member-|evaluator-)?[0-9]{8}-[0-9]{4}@blockid\\.au$'
),
targets as (
  select i.id, i.status
    from public.evaluation_batch_items i
    join public.evaluation_batches b on b.id = i.batch_id
    left join public.evaluations e on e.id = i.evaluation_id
    left join public.projects p on p.id = e.project_id
   where i.status in ('queued', 'running')
     and (b.user_id in (select id from qa) or p.user_id in (select id from qa))
),
cancelled as (
  update public.evaluation_batch_items
     set status = 'failed', error = ${q(QA_TEARDOWN_CANCELLED)}, scored_at = now()
   where id in (select id from targets where status = 'queued')
     and status = 'queued'
  returning id
)
select (select count(*) from cancelled)::text || '|' || (select count(*) from targets where status = 'running')::text;`;
}

export interface DrainResult {
  ok: boolean;
  /** Queued items flipped to failed/qa_teardown_cancelled over all polls. */
  cancelled: number;
  /** Items still `running` when the drain returned (0 on success). */
  running: number;
  polls: number;
  waitedMs: number;
  detail: string;
}

/** `psql -At` output → `[cancelled, running]`, or null when no such line. */
export function parseDrainLine(out: string): [number, number] | null {
  const line = out.split("\n").map((l) => l.trim()).find((l) => /^\d+\|\d+$/.test(l));
  if (!line) return null;
  const [a, b] = line.split("|").map(Number);
  return [a, b];
}

export async function drainInFlightBatchItems(
  emails: string[],
  deps: {
    run: (sql: string) => string;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
    pollMs?: number;
  },
): Promise<DrainResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? DRAIN_TIMEOUT_MS;
  const pollMs = deps.pollMs ?? DRAIN_POLL_MS;
  const started = now();
  const result = (ok: boolean, cancelled: number, running: number, polls: number, detail: string): DrainResult =>
    ({ ok, cancelled, running, polls, waitedMs: now() - started, detail });
  const errText = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 300);

  let sql: string;
  try {
    sql = drainSql(emails);
  } catch (e) {
    return result(false, 0, 0, 0, errText(e));
  }
  try {
    if (deps.run(BATCH_ITEMS_EXIST_SQL).trim().split("\n")[0] !== "t") {
      return result(true, 0, 0, 0, "evaluation_batch_items absent — nothing to drain");
    }
  } catch (e) {
    return result(false, 0, 0, 0, `drain query failed: ${errText(e)}`);
  }

  let cancelled = 0;
  let polls = 0;
  for (;;) {
    polls += 1;
    let parsed: [number, number] | null;
    try {
      const out = deps.run(sql);
      parsed = parseDrainLine(out);
      if (!parsed) return result(false, cancelled, 0, polls, `unreadable drain output: ${out.slice(0, 200)}`);
    } catch (e) {
      return result(false, cancelled, 0, polls, `drain query failed: ${errText(e)}`);
    }
    cancelled += parsed[0];
    const running = parsed[1];
    if (running === 0) return result(true, cancelled, 0, polls, `no in-flight batch item (cancelled ${cancelled} queued)`);
    const waitedMs = now() - started;
    if (waitedMs + pollMs > timeoutMs) {
      return result(false, cancelled, running, polls, `${running} batch item(s) still running after ${Math.round(waitedMs / 1000)} s — erasing anyway (the runner stops orphaned runs quietly)`);
    }
    await sleep(pollMs);
  }
}
