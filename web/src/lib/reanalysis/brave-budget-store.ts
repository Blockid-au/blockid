import "server-only";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { z } from "zod";
import { admitBraveResearch, type BraveResearchBudget } from "./research-cost-policy";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const entry = z.object({ id: digest, binding: digest, question: digest, batch: digest, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), queries: integer.min(1).max(3), freeQueries: integer.max(3), costMicroUsd: integer }).strict();
const ledgerSchema = z.object({ version: z.literal(1), account: digest, month: z.string().regex(/^\d{4}-\d{2}$/), entries: z.array(entry).max(900) }).strict().refine(value => new Set(value.entries.map(e => e.id)).size === value.entries.length && value.entries.every(e => e.freeQueries <= e.queries && e.day.startsWith(`${value.month}-`)));
type Ledger = z.infer<typeof ledgerSchema>;
const requestSchema = z.object({ reservationId: z.string().min(16).max(200), month: z.string().regex(/^\d{4}-\d{2}$/), questionId: z.string().min(1).max(200), batchId: z.string().min(1).max(200), queries: integer.min(1).max(3) }).strict();
export type BraveReservationRequest = z.infer<typeof requestSchema>;

/** One private directory per provider account, shared by every worker/release.
 * External counters are added conservatively to local reservations. Never pass
 * untrusted request data as policy or subtract ledger reservations from it.
 * No provider calls, customer-credit authorization or automatic refunds occur.
 */
export async function reserveBraveBudget(
  directory: string,
  requestInput: unknown,
  readPolicy: () => Promise<BraveResearchBudget>,
  now: () => number = Date.now,
) {
  const deny = (reason: string) => ({ ok: false as const, dispatchAllowed: false as const, reason });
  const request = requestSchema.safeParse(requestInput);
  if (!request.success) return deny("invalid_reservation");
  const r = request.data;
  let locked = false;
  const dir = resolve(directory), lock = join(dir, ".reservation-lock");
  try {
    // Provision explicitly outside the web root. No symlinks, shared writers,
    // implicit empty replacement of a missing/corrupt ledger, or stale lock takeover.
    if (directory !== dir || await realpath(dir) !== dir) return deny("unsafe_budget_directory");
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) return deny("unsafe_budget_directory");
    const deadline = Date.now() + 1500;
    for (;;) {
      try { await mkdir(lock, { mode: 0o700 }); locked = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) return deny("budget_busy_or_recovery_required");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    let instant = now();
    if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 7) !== r.month) return deny("reservation_period_mismatch");
    const policy = await readPolicy();
    instant = now();
    if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 7) !== r.month) return deny("reservation_period_mismatch");
    // Validate the full existing policy before touching optional nested data.
    const preliminary = admitBraveResearch({ questionId: r.questionId, batchId: r.batchId, queries: r.queries }, policy, instant);
    const path = join(dir, `${r.month}.json`);
    let ledger: Ledger;
    try {
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const s = await file.stat();
        if (!s.isFile() || s.nlink !== 1 || s.uid !== stat.uid || (s.mode & 0o777) !== 0o600 || s.size > 512_000) throw Error("unsafe ledger");
        ledger = ledgerSchema.parse(JSON.parse(await file.readFile("utf8")));
      } finally { await file.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!preliminary.ok) return deny(preliminary.reason);
      ledger = { version: 1, account: hash(policy.accountId), month: r.month, entries: [] };
    }
    if (ledger.month !== r.month || ledger.account !== hash(policy.accountId)) return deny("budget_account_mismatch");
    const id = hash(r.reservationId), binding = hash(JSON.stringify(r));
    const existing = ledger.entries.find(e => e.id === id);
    if (existing) return existing.binding === binding
      ? { ok: true as const, dispatchAllowed: false as const, replay: true as const, reservationId: r.reservationId, costMicroUsd: existing.costMicroUsd }
      : deny("reservation_id_conflict");
    if (!preliminary.ok) return deny(preliminary.reason);
    const day = new Date(instant).toISOString().slice(0, 10), question = hash(r.questionId), batch = hash(r.batchId);
    const total = (filter: (e: Ledger["entries"][number]) => boolean) => ledger.entries.filter(filter).reduce((sum, e) => sum + e.queries, 0);
    const budget: BraveResearchBudget = {
      ...policy,
      used: { question: policy.used.question + total(e => e.question === question), batch: policy.used.batch + total(e => e.batch === batch), day: policy.used.day + total(e => e.day === day), month: policy.used.month + total(() => true) },
      remainingFreeQueries: policy.remainingFreeQueries === null ? null : Math.max(0, policy.remainingFreeQueries - ledger.entries.reduce((sum, e) => sum + e.freeQueries, 0)),
      paid: policy.paid && { ...policy.paid, reservedMicroUsd: policy.paid.reservedMicroUsd + ledger.entries.reduce((sum, e) => sum + e.costMicroUsd, 0) },
    };
    const admitted = admitBraveResearch({ questionId: r.questionId, batchId: r.batchId, queries: r.queries }, budget, instant);
    if (!admitted.ok) return deny(admitted.reason);
    ledger.entries.push({ id, binding, question, batch, day, queries: r.queries, freeQueries: admitted.freeQueries, costMicroUsd: admitted.costMicroUsd });
    ledgerSchema.parse(ledger);
    const temp = join(dir, `.${randomUUID()}.tmp`);
    try {
      const file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(JSON.stringify(ledger)); await file.sync(); } finally { await file.close(); }
      await rename(temp, path);
      const folder = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY);
      try { await folder.sync(); } finally { await folder.close(); }
    } finally { await unlink(temp).catch(() => undefined); }
    return { ok: true as const, dispatchAllowed: true as const, replay: false as const, reservationId: r.reservationId, costMicroUsd: admitted.costMicroUsd, queries: r.queries, customerCreditConsent: false as const };
  } catch { return deny("budget_storage_unavailable"); }
  finally { if (locked) await rmdir(lock).catch(() => undefined); }
}
