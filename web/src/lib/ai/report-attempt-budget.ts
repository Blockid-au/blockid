import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { constants } from "node:fs";
import { mkdir, lstat, open, realpath, rename, rmdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ResearchAttemptBudgetError, type ResearchAttemptBudget, type AttemptRequest } from "./research-attempt-budget";

/** Founder approval 2026-09-23: total AI spend <= US$0.50/report, DeepInfra only. */
const context = new AsyncLocalStorage<string>();
export const currentReportSpendScope = () => context.getStore();
export function withReportSpendScope<T>(scope: string, run: () => T): T { return context.run(scope, run); }
export const REPORT_MAX_MICRO_USD = 500_000;
export const REPORT_PRICE_POLICY = "deepinfra-standard-2026-09-23";
// Official /MODEL/api pages, observed 2026-09-23. No priority tier or cache-retention purchase.
const PRICES: Record<string, { input: number; output: number; context: number }> = {
  "deepseek-ai/DeepSeek-V3.2": { input: 260, output: 380, context: 163840 },
  "Qwen/Qwen3-235B-A22B-Instruct-2507": { input: 90, output: 550, context: 262144 },
  "deepseek-ai/DeepSeek-V4-Flash": { input: 90, output: 180, context: 1048576 },
  "Qwen/Qwen3-VL-235B-A22B-Instruct": { input: 200, output: 880, context: 262144 },
};
const EXPIRES = Date.parse("2026-10-23T00:00:00Z");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const entrySchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), model: z.string(), payload: z.string().regex(/^[a-f0-9]{64}$/), output: integer.min(1).max(16384), maximum: integer.min(1), held: integer, inputUsed: integer.nullable(), outputUsed: integer.nullable(), state: z.enum(["reserved", "unknown", "reported_usage"]), settlement: z.string().nullable() }).strict();
const ledgerSchema = z.object({ version: z.literal(1), scope: z.string(), cap: z.literal(500000), policy: z.literal(REPORT_PRICE_POLICY), blocked: z.boolean(), entries: z.array(entrySchema).max(512) }).strict();
type Ledger = z.infer<typeof ledgerSchema>;
const fail = (reason: string): never => { throw new ResearchAttemptBudgetError(`report ${reason}`); };
function cost(model: string, input: number, output: number): number {
  const price = PRICES[model]; if (!price) return fail("model not admitted");
  return Number((BigInt(input) * BigInt(price.input) + BigInt(output) * BigInt(price.output) + 999n) / 1000n);
}
function validate(raw: string, scope: string): Ledger {
  const ledger = ledgerSchema.parse(JSON.parse(raw));
  if (ledger.scope !== scope || new Set(ledger.entries.map(e => e.id)).size !== ledger.entries.length) return fail("ledger scope/integrity mismatch");
  for (const e of ledger.entries) {
    if (e.state === "reported_usage" && (e.inputUsed === null || e.outputUsed === null || e.held !== cost(e.model, e.inputUsed, e.outputUsed))) return fail("usage integrity mismatch");
    if (!PRICES[e.model] || e.maximum !== cost(e.model, PRICES[e.model].context, e.output) || e.held > e.maximum || (e.state !== "reported_usage" && e.held !== e.maximum)) return fail("ledger integrity mismatch");
  }
  if (!ledger.blocked && ledger.entries.reduce((n, e) => n + e.held, 0) > ledger.cap) return fail("ledger requires reconciliation");
  return ledger;
}

/** Server-selected durable scope. Callers reuse it for text, vision and all retries.
 * A missing ledger in an existing scope, stale lock or corruption fails closed.
 * No prompts, images, customer names or API keys are written. Never auto-clean this root.
 */
export function createReportAttemptBudget(scopeId: string): ResearchAttemptBudget {
  if (!/^(blockid|svi):[A-Za-z0-9:_-]{1,220}$/.test(scopeId)) return fail("invalid scope");
  const scope = hash(scopeId);
  const root = join(userInfo().homedir, ".local/state/blockid-report-spend");
  const directory = join(root, scope), file = join(directory, "ledger.json"), lock = join(directory, ".lock");
  async function privateDirectory(path: string) {
    const s = await lstat(path);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o700 || await realpath(path) !== path) return fail("unsafe directory");
  }
  async function syncDirectory(path: string) {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  async function write(value: Ledger, initial = false) {
    const target = initial ? file : join(directory, `.write-${randomUUID()}`);
    const handle = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
    if (!initial) await rename(target, file);
    await syncDirectory(directory);
  }
  async function transaction<T>(fn: (ledger: Ledger) => T): Promise<T> {
    let locked = false, uncertainWrite = false;
    try {
      await mkdir(root, { mode: 0o700 }).catch(e => { if (e.code !== "EEXIST") throw e; });
      await privateDirectory(root);
      try {
        await mkdir(directory, { mode: 0o700 });
        await write({ version: 1, scope, cap: REPORT_MAX_MICRO_USD, policy: REPORT_PRICE_POLICY, blocked: false, entries: [] }, true);
        await syncDirectory(root);
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      await privateDirectory(directory);
      const until = Date.now() + 1500;
      for (;;) {
        try { await mkdir(lock, { mode: 0o700 }); locked = true; break; }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= until) return fail("lock unavailable"); await new Promise(r => setTimeout(r, 20)); }
      }
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      let raw: string;
      try {
        const s = await handle.stat();
        if (!s.isFile() || s.nlink !== 1 || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o600 || s.size > 1_000_000) return fail("unsafe ledger");
        raw = await handle.readFile("utf8");
      } finally { await handle.close(); }
      const ledger = validate(raw, scope), result = fn(ledger);
      validate(JSON.stringify(ledger), scope);
      uncertainWrite = true;
      await write(ledger);
      uncertainWrite = false;
      return result;
    } catch (e) { if (e instanceof ResearchAttemptBudgetError) throw e; return fail("ledger unavailable; no dispatch"); }
    finally { if (locked && !uncertainWrite) await rmdir(lock).catch(() => undefined); }
  }
  return {
    callId: scopeId,
    async reserve(request: AttemptRequest) {
      const price = PRICES[request.model];
      if (Date.now() >= EXPIRES || !price || request.provider !== "deepinfra" || !Number.isSafeInteger(request.maximumOutputTokens) || request.maximumOutputTokens < 1 || request.maximumOutputTokens > 16384 || request.promptBytes > 32 * 1024 * 1024) return fail("price or request not admitted");
      const expected = hash(JSON.stringify(["research-attempt-v1", scopeId, "deepinfra", request.model, request.payloadSha256]));
      if (expected !== request.attemptId) return fail("attempt binding mismatch");
      return transaction(ledger => {
        if (ledger.blocked) return fail("scope requires reconciliation");
        if (ledger.entries.some(e => e.id === request.attemptId)) return fail("attempt replay denied");
        const maximum = cost(request.model, price.context, request.maximumOutputTokens);
        if (ledger.entries.reduce((n, e) => n + e.held, 0) + maximum > ledger.cap) return fail("US$0.50 limit reached");
        ledger.entries.push({ id: request.attemptId, model: request.model, payload: request.payloadSha256, output: request.maximumOutputTokens, maximum, held: maximum, inputUsed: null, outputUsed: null, state: "reserved", settlement: null });
        return { dispatchAllowed: true, attemptId: request.attemptId, payloadSha256: request.payloadSha256, model: request.model, maximumPromptBytes: request.promptBytes, maximumInputTokens: price.context, maximumOutputTokens: request.maximumOutputTokens, maximumCostMicroUsd: maximum, pricePolicyId: REPORT_PRICE_POLICY, expiresAt: Math.min(EXPIRES, Date.now() + 300000) };
      });
    },
    async settle(outcome) {
      let conflict = false;
      await transaction(ledger => {
        const entry = ledger.entries.find(e => e.id === outcome.attemptId);
        if (!entry) return fail("unknown attempt");
        const receipt = hash(JSON.stringify(outcome));
        if (entry.settlement) {
          if (entry.settlement !== receipt) { entry.held = entry.maximum; entry.state = "unknown"; entry.inputUsed = null; entry.outputUsed = null; ledger.blocked = true; conflict = true; }
          return;
        }
        entry.settlement = receipt;
        const input = outcome.inputTokens, output = outcome.outputTokens;
        const valid = outcome.state === "reported_usage" && typeof input === "number" && Number.isSafeInteger(input) && input >= 0 && typeof output === "number" && Number.isSafeInteger(output) && output >= 0 && input + output > 0 && input + output <= PRICES[entry.model].context && output <= entry.output;
        entry.state = valid ? "reported_usage" : "unknown";
        entry.inputUsed = valid ? input : null;
        entry.outputUsed = valid ? output : null;
        entry.held = valid ? cost(entry.model, input, output) : entry.maximum;
      });
      if (conflict) return fail("conflicting usage; full reservation retained");
    },
  };
}
