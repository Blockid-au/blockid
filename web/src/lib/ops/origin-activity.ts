import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

type Kind = "http" | "report_pipeline" | "ai_call" | "report_order_worker" | "audit_write" | "report_notification" | "report_email";
type Entry = { kind: Kind; startedAt: string };
const context = new AsyncLocalStorage<boolean>();

/** Persist BEFORE work admission; persistence failure fails closed. No inputs,
 * customer identifiers, URLs, credentials or report text enter this registry.
 */
export class OriginActivity {
  private activities = new Map<string, Entry>();
  private draining = false;
  private persistenceFailed = false;
  constructor(readonly file: string, readonly identity: { pid: number; startTicks: string; releasePath: string }) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    // Never reinterpret evidence from an earlier process/restart as current.
    try { readFileSync(file); throw new Error("origin_activity_registry_already_exists"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.persist();
  }
  snapshot() {
    return { version: 1, ...this.identity, draining: this.draining, persistenceFailed: this.persistenceFailed,
      activities: Object.fromEntries(this.activities), trackedWorkDrained: this.draining && this.activities.size === 0 && !this.persistenceFailed,
      retirementEligible: false, coverage: "http_and_selected_background_scopes",
      remainingCoverage: ["upgrade_connections", "other_detached_tasks", "database_job_ownership_and_ambiguous_effects", "external_workers_and_child_processes"] };
  }
  private persist() {
    const temporary = this.file + ".tmp";
    try {
      const fd = openSync(temporary, "w", 0o600);
      try { writeFileSync(fd, JSON.stringify(this.snapshot())); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, this.file);
      const directory = openSync(dirname(this.file), "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
    } catch (error) { this.persistenceFailed = true; throw error; }
  }
  resume() { if (this.persistenceFailed) throw new Error("origin_registry_unreliable"); this.draining = false; this.persist(); return this.snapshot(); }
  drain() { this.draining = true; this.persist(); return this.snapshot(); }
  admit(kind: Kind, continuation = false) {
    if (this.persistenceFailed || (this.draining && !continuation)) throw new Error("origin_draining");
    const id = randomUUID(); this.activities.set(id, { kind, startedAt: new Date().toISOString() });
    this.persist();
    let ended = false;
    return () => { if (!ended) { ended = true; this.activities.delete(id); this.persist(); } };
  }
  async run<T>(kind: Kind, work: () => Promise<T>): Promise<T> {
    const done = this.admit(kind, context.getStore() === true);
    return context.run(true, async () => { try { return await work(); } finally { done(); } });
  }
}

const globalKey = Symbol.for("blockid.originActivity.v1");
type Holder = typeof globalThis & { [globalKey]?: OriginActivity };
export function originActivity(): OriginActivity | undefined { return (globalThis as Holder)[globalKey]; }
export function installOriginActivity() {
  if (originActivity()) return originActivity()!;
  const stat = readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ");
  const startTicks = stat[19];
  if (!/^\d+$/.test(startTicks)) throw new Error("origin_identity_missing");
  const file = join(homedir(), ".local/state/blockid-runtime/origin-activity", `${process.pid}-${startTicks}.json`);
  const registry = new OriginActivity(file, { pid: process.pid, startTicks, releasePath: process.cwd() });
  (globalThis as Holder)[globalKey] = registry;
  return registry;
}
export function trackOriginWork<T>(kind: Kind, work: () => Promise<T>): Promise<T> {
  return originActivity()?.run(kind, work) ?? work();
}
export function runAdmittedHttp<T>(work: () => T): T { return context.run(true, work); }
