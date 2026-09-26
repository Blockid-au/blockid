import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  braveMonthlyFigure, claudeCliSearchArgs, createBraveMarketSearch, createClaudeCliMarketSearch, createFileMarketResearchCache, parseClaudeCliSearch, resetClaudeCliState,
} from "./market-research-providers";
import { emptyMarketResearch } from "./market-research-contract";
import type { PlannedQuery } from "./market-research-core";

const NOW = Date.parse("2026-09-26T02:00:00Z");
const QUERIES: PlannedQuery[] = [
  { id: "q1", query: '"Acme Pay" competitors', intent: "competitors" },
  { id: "q2", query: "Fintech market size Australia 2026", intent: "market_size" },
  { id: "q3", query: '"Acme Pay" funding round valuation', intent: "company_round" },
  { id: "q4", query: "Fintech startup valuation revenue multiple 2026", intent: "sector_multiple" },
  { id: "q5", query: "Fintech startups Australia funding round 2026", intent: "sector_rounds" },
];
const SYNTHETIC_KEY = "synthetic-brave-test-key-000";

async function stateDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "market-research-"));
  await chmod(dir, 0o700);
  await writeFile(join(dir, "brave.env"), `BRAVE_SEARCH_API_KEY=${SYNTHETIC_KEY}\n`, { mode: 0o600 });
  await writeFile(join(dir, "brave-policy.json"), JSON.stringify({ version: 1, provider: "brave", freeFirst: true, automaticPaidSearchAuthorized: true, maxPaidUsdPerMonth: 5, keyPath: join(dir, "brave.env"), apiResultsRetention: "ephemeral_only" }), { mode: 0o600 });
  await writeFile(join(dir, "brave-budget-2026-09.json"), JSON.stringify({ version: 1, month: "2026-09", reservedMicroUsd: 25_000, requests: 5, operations: [] }), { mode: 0o600 });
  return dir;
}
const dirs: string[] = [];
afterEach(async () => { resetClaudeCliState(); await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });
const ctx = () => ({ signal: new AbortController().signal, timeoutMs: 10_000, jobId: "job-abc", maxCalls: 5 });

function braveResponse(web: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ type: "search", query: { original: "q" }, ...(web ? { web } : {}) }), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

describe("Brave (budgeted)", () => {
  it("200 with no web results + monthly limit 0 → quota_exhausted after ONE query, marker skips the next run", async () => {
    const dir = await stateDir(); dirs.push(dir);
    const fetcher = vi.fn(async () => braveResponse(null, { "x-ratelimit-limit": "2, 0", "x-ratelimit-remaining": "1, 0" }));
    const brave = createBraveMarketSearch({ stateDir: dir, fetch: fetcher as typeof fetch, now: () => NOW });
    const out = await brave.search(QUERIES, ctx());
    expect(out.status).toBe("quota_exhausted");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(out.calls).toBe(1);
    // Reservation ledger written (hashes only — no query text, no key).
    const ledger = await readFile(join(dir, "brave-reservations", "2026-09.json"), "utf8");
    expect(ledger).not.toContain("Acme");
    expect(ledger).not.toContain(SYNTHETIC_KEY);
    const again = await brave.search(QUERIES, ctx());
    expect(again).toMatchObject({ status: "quota_exhausted", calls: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const marker = await readFile(join(dir, "market-research-cache", "brave-quota-state.json"), "utf8");
    expect(marker).not.toContain(SYNTHETIC_KEY);
  });

  it("with quota: URLs from every chunk (3 + 2 queries), key sent only as the subscription header", async () => {
    const dir = await stateDir(); dirs.push(dir);
    let n = 0;
    const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).not.toContain(SYNTHETIC_KEY);
      expect((init?.headers as Record<string, string>)["X-Subscription-Token"]).toBe(SYNTHETIC_KEY);
      n++;
      return braveResponse({ results: [{ url: `https://news${n}.com.au/story` }] }, { "x-ratelimit-limit": "20, 2000", "x-ratelimit-remaining": "19, 1500" });
    });
    const brave = createBraveMarketSearch({ stateDir: dir, fetch: fetcher as typeof fetch, now: () => NOW });
    const out = await brave.search(QUERIES, ctx());
    expect(out.status).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(out.calls).toBe(5);
    expect(out.hits.map((h) => h.url)).toHaveLength(5);
  });

  it("the monthly paid cap (manual ledger counted as committed) denies dispatch without calling Brave", async () => {
    const dir = await stateDir(); dirs.push(dir);
    await writeFile(join(dir, "brave-budget-2026-09.json"), JSON.stringify({ version: 1, month: "2026-09", reservedMicroUsd: 4_998_000, requests: 900 }), { mode: 0o600 });
    const fetcher = vi.fn();
    const out = await createBraveMarketSearch({ stateDir: dir, fetch: fetcher as unknown as typeof fetch, now: () => NOW }).search(QUERIES, ctx());
    expect(out.status).toBe("budget_denied");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("no policy file → not_configured, no request", async () => {
    const dir = await mkdtemp(join(tmpdir(), "market-research-empty-")); dirs.push(dir);
    const fetcher = vi.fn();
    const out = await createBraveMarketSearch({ stateDir: dir, fetch: fetcher as unknown as typeof fetch }).search(QUERIES, ctx());
    expect(out.status).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("parses the monthly figure of the rate-limit headers", () => {
    expect(braveMonthlyFigure("2, 0")).toBe(0);
    expect(braveMonthlyFigure("20, 2000")).toBe(2000);
    expect(braveMonthlyFigure(null)).toBeNull();
  });
});

function fakeChild(stdout: string, code = 0, delayMs = 0) {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: ReturnType<typeof vi.fn> };
  child.stdout = new EventEmitter();
  child.kill = vi.fn(() => true);
  setTimeout(() => { child.stdout.emit("data", Buffer.from(stdout)); child.emit("close", code); }, delayMs);
  return child;
}

describe("Claude CLI WebSearch fallback", () => {
  const envelope = JSON.stringify({ type: "result", is_error: false, structured_output: { results: [
    { url: "https://www.startupdaily.net/acme", title: "Acme raises", snippet: "raised A$12 million" },
    { url: "https://www.abs.gov.au/x", title: "ABS", snippet: "industry" },
  ] } });

  it("runs claude -p with WebSearch as the only tool, a minimal env and the public queries only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cli-cwd-")); dirs.push(dir);
    await chmod(dir, 0o700);
    process.env.DEEPINFRA_API_KEY_TEST_SENTINEL = "must-not-leak";
    const spawn = vi.fn(() => fakeChild(envelope));
    const cli = createClaudeCliMarketSearch({ bin: "/usr/bin/claude", cwd: dir, spawn: spawn as never });
    const out = await cli.search(QUERIES, ctx());
    delete process.env.DEEPINFRA_API_KEY_TEST_SENTINEL;
    expect(out).toMatchObject({ status: "ok", calls: 1 });
    expect(out.hits.map((h) => h.url)).toEqual(["https://www.startupdaily.net/acme", "https://www.abs.gov.au/x"]);
    const [bin, args, opts] = spawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string>; cwd: string }];
    expect(bin).toBe("/usr/bin/claude");
    expect(args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--tools", "WebSearch", "--allowedTools", "--no-session-persistence", "--strict-mcp-config"]));
    expect(args[args.indexOf("--tools") + 1]).toBe("WebSearch");
    expect(Object.keys(opts.env).sort()).toEqual(["HOME", "LANG", "PATH"]);
    expect(opts.cwd).toBe(dir);
    expect(args[1]).toContain("Fintech market size Australia 2026");
  });

  it("a hung CLI is killed at its timeout → status timeout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cli-cwd-")); dirs.push(dir);
    await chmod(dir, 0o700);
    const child = fakeChild(envelope, 0, 60_000);
    const cli = createClaudeCliMarketSearch({ cwd: dir, spawn: (() => child) as never });
    const out = await cli.search(QUERIES, { ...ctx(), timeoutMs: 1_000 });
    expect(out.status).toBe("timeout");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("parses an error / non-JSON envelope as unavailable", () => {
    expect(parseClaudeCliSearch("not json").ok).toBe(false);
    expect(parseClaudeCliSearch(JSON.stringify({ is_error: true })).ok).toBe(false);
    expect(parseClaudeCliSearch(JSON.stringify({ is_error: false, result: 'Here: {"results":[{"url":"https://a.com.au/x","title":"t","snippet":"s"}]}' })).hits).toHaveLength(1);
    expect(claudeCliSearchArgs("p")).toContain("--json-schema");
  });
});

describe("file cache", () => {
  it("owner-only files, 7-day expiry, schema-validated reads", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "mr-cache-")), "cache"); dirs.push(join(dir, ".."));
    const cache = createFileMarketResearchCache(dir);
    const key = "a".repeat(64);
    const value = emptyMarketResearch({ status: "no_facts", reasons: [], researchedAt: new Date(NOW).toISOString(), scope: { company: null, websiteHost: null, sector: "Fintech", country: "Australia", stage: null } });
    await cache.set(key, value, NOW, 7 * 86_400_000);
    expect((await cache.get(key, NOW + 1000))?.status).toBe("no_facts");
    expect(await cache.get(key, NOW + 7 * 86_400_000 + 1)).toBeNull();
    expect(await cache.get("../etc/passwd", NOW)).toBeNull();
    const files = await readdir(dir);
    expect(files).toEqual([`${key}.json`]);
  });
});
