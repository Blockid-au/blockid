import { expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { reserveBraveBudget } from "./brave-budget-store";
import type { BraveResearchBudget } from "./research-cost-policy";
const time = Date.parse("2026-09-22T12:00:00Z");
const req = (n = 0) => ({ reservationId: `reservation-unique-${n}`, month: "2026-09", questionId: `q${n}`, batchId: `b${n}`, queries: 1 });
const policy = (r = req()): BraveResearchBudget => ({ provider: "brave", accountId: "account", observedAt: new Date(time).toISOString(), expiresAt: new Date(time + 60_000).toISOString(), providerPolicyConfirmed: true, questionId: r.questionId, batchId: r.batchId, day: "2026-09-22", month: "2026-09", used: { question: 0, batch: 0, day: 0, month: 0 }, remainingFreeQueries: null, paid: { ownerPolicyId: "owner-policy", currency: "USD", monthlyCapMicroUsd: 10_000, committedMicroUsd: 0, reservedMicroUsd: 0, pricePerQueryMicroUsd: 5000, quoteExpiresAt: new Date(time + 60_000).toISOString() } });
async function isolated(fn: (dir: string) => Promise<void>) { const dir = await mkdtemp(join(tmpdir(), "brave-budget-test-")); try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); } }
it("persists budget across calls and makes retry non-dispatchable", () => isolated(async dir => {
  const run = (n: number) => reserveBraveBudget(dir, req(n), async () => policy(req(n)), () => time);
  expect(await run(0)).toMatchObject({ ok: true, dispatchAllowed: true, costMicroUsd: 5000 });
  expect(await run(0)).toMatchObject({ ok: true, dispatchAllowed: false, replay: true });
  expect(await reserveBraveBudget(dir, { ...req(), queries: 2 }, async () => policy(), () => time)).toMatchObject({ reason: "reservation_id_conflict" });
  expect((await run(1)).ok).toBe(true);
  expect(await run(2)).toMatchObject({ reason: "brave_paid_budget_exhausted" });
  const data = await readFile(join(dir, "2026-09.json"), "utf8");
  expect(data).not.toContain("owner-policy"); expect(data).not.toContain("reservation-unique");
}));
it("does not repeatedly reuse free allowance", () => isolated(async dir => {
  for (let n = 0; n < 3; n++) {
    const p = policy(req(n)); p.remainingFreeQueries = 1; p.paid = undefined;
    expect((await reserveBraveBudget(dir, req(n), async () => p, () => time)).ok).toBe(n === 0);
  }
}));
it.each(["day", "month", "question", "batch"] as const)("combines external and local %s limits", field => isolated(async dir => {
  const p = policy(); p.paid!.monthlyCapMicroUsd = 5_000_000;
  p.used[field] = ({ day: 30, month: 900, question: 3, batch: 6 })[field] - 1;
  expect((await reserveBraveBudget(dir, req(), async () => p, () => time)).ok).toBe(true);
  expect(await reserveBraveBudget(dir, { ...req(), reservationId: "different-reservation" }, async () => p, () => time)).toMatchObject({ reason: "brave_query_limit" });
}));
it("denies stale policy, wrong period, account mismatch and corruption", () => isolated(async dir => {
  expect((await reserveBraveBudget(dir, req(), async () => policy(), () => time + 120_000)).ok).toBe(false);
  expect((await reserveBraveBudget(dir, { ...req(), month: "2026-08" }, async () => policy(), () => time)).ok).toBe(false);
  await reserveBraveBudget(dir, req(), async () => policy(), () => time);
  expect(await reserveBraveBudget(dir, req(1), async () => ({ ...policy(req(1)), accountId: "other" }), () => time)).toMatchObject({ reason: "budget_account_mismatch" });
  await writeFile(join(dir, "2026-09.json"), "{}");
  expect(await reserveBraveBudget(dir, req(1), async () => policy(req(1)), () => time)).toMatchObject({ reason: "budget_storage_unavailable" });
  expect(await readFile(join(dir, "2026-09.json"), "utf8")).toBe("{}");
}));
it("never steals crashed lock or accepts shared directory", () => isolated(async dir => {
  await mkdir(join(dir, ".reservation-lock"));
  expect(await reserveBraveBudget(dir, req(), async () => policy(), () => time)).toMatchObject({ reason: "budget_busy_or_recovery_required" });
  await chmod(dir, 0o755);
  expect(await reserveBraveBudget(dir, req(), async () => policy(), () => time)).toMatchObject({ reason: "unsafe_budget_directory" });
}));
it("serializes separate processes and restart retries", () => isolated(async dir => {
  const script = join(dir, "worker.ts"), modulePath = join(process.cwd(), "src/lib/reanalysis/brave-budget-store.ts");
  await writeFile(script, `import { reserveBraveBudget } from ${JSON.stringify(modulePath)}; const r=JSON.parse(process.argv[2]); const p=JSON.parse(process.argv[3]); reserveBraveBudget(process.argv[4],r,async()=>p,()=>${time}).then(x=>console.log(JSON.stringify(x)));`);
  const hook = join(dir, "server-only-test-hook.cjs");
  await writeFile(hook, 'const M=require("node:module"); const load=M._load; M._load=function(id,...args){if(id==="server-only")return {}; return load.call(this,id,...args)};');
  const run = async (n: number) => JSON.parse((await promisify(execFile)(process.execPath, ["--require", hook, join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), script, JSON.stringify(req(n)), JSON.stringify(policy(req(n))), dir], { env: { ...process.env, NODE_OPTIONS: `--require=${hook}` } }).catch(error => { throw new Error(String(error.stderr || error.message)); })).stdout);
  const results = await Promise.all(Array.from({ length: 6 }, (_, n) => run(n)));
  expect(results.filter(x => x.dispatchAllowed)).toHaveLength(2);
  expect(await run(results.findIndex(x => x.dispatchAllowed))).toMatchObject({ ok: true, replay: true, dispatchAllowed: false });
}), 20_000);
