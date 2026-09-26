import "server-only";
// Market research providers (server composition): the 7-day file cache, the
// budgeted Brave search, the Claude CLI WebSearch fallback, the R01 page
// fetcher and the one DeepInfra extraction call. Every provider is injected
// into `researchMarketForValuation`; tests never reach this file's defaults.
//
// State lives OUTSIDE the repo (default ~/.local/state/blockid-research,
// override BLOCKID_RESEARCH_STATE_DIR): brave.env (key), brave-policy.json,
// brave-budget-YYYY-MM.json (manual ledger, counted as committed spend),
// brave-reservations/ (reserveBraveBudget ledger), market-research-cache/.
// The Brave key is read from its file per call and never logged, cached,
// written or passed to a child process.

import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { discoverWithBraveBudget } from "./budgeted-brave-discovery";
import type { ApprovedPublicQuery } from "./discover-public-sources";
import { marketResearchSchema, type MarketResearchResult } from "./market-research-contract";
import type { PlannedQuery, SearchHit } from "./market-research-core";
import type { BraveResearchBudget } from "../reanalysis/research-cost-policy";
import {
  researchMarketForValuation, type FetchedPage, type MarketResearchCache, type MarketResearchDeps, type MarketResearchInput, type MarketSearchProvider, type SearchOutcome,
} from "./market-research";

export function researchStateDir(): string {
  const env = process.env.BLOCKID_RESEARCH_STATE_DIR?.trim();
  return resolve(env || join(homedir(), ".local", "state", "blockid-research"));
}

/** Owner-only directory (0700, not a symlink, owned by this uid) — created when missing. */
async function ownerOnlyDir(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const s = await lstat(dir);
    return s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid?.() && (s.mode & 0o077) === 0;
  } catch { return false; }
}

async function readOwnerFile(path: string, maxBytes: number): Promise<string | null> {
  try {
    const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await f.stat();
      if (!s.isFile() || s.uid !== process.getuid?.() || (s.mode & 0o077) !== 0 || s.size > maxBytes) return null;
      return await f.readFile("utf8");
    } finally { await f.close(); }
  } catch { return null; }
}

async function writeOwnerFile(dir: string, name: string, body: string): Promise<void> {
  const temp = join(dir, `.${randomUUID()}.tmp`);
  try {
    const f = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await f.writeFile(body); } finally { await f.close(); }
    await rename(temp, join(dir, name));
  } finally { await unlink(temp).catch(() => undefined); }
}

// ── 7-day cache ──────────────────────────────────────────────────────────────

/** One owner-only JSON file per key; expired files are pruned on write (max 2 000 kept). */
export function createFileMarketResearchCache(dir: string): MarketResearchCache {
  return {
    async get(key, now) {
      if (!/^[a-f0-9]{64}$/.test(key) || !(await ownerOnlyDir(dir))) return null;
      const raw = await readOwnerFile(join(dir, `${key}.json`), 256 * 1024);
      if (!raw) return null;
      try {
        const row = JSON.parse(raw) as { key?: string; expiresAt?: number; result?: unknown };
        if (row.key !== key || typeof row.expiresAt !== "number" || row.expiresAt <= now) return null;
        const parsed = marketResearchSchema.safeParse(row.result);
        return parsed.success ? (parsed.data as MarketResearchResult) : null;
      } catch { return null; }
    },
    async set(key, value, now, ttlMs) {
      if (!/^[a-f0-9]{64}$/.test(key) || !(await ownerOnlyDir(dir))) return;
      const body = JSON.stringify({ version: 1, key, storedAt: now, expiresAt: now + ttlMs, result: value });
      if (body.length > 256 * 1024) return;
      await writeOwnerFile(dir, `${key}.json`, body);
      await pruneCache(dir, now).catch(() => undefined);
    },
  };
}

async function pruneCache(dir: string, now: number): Promise<void> {
  const names = (await readdir(dir)).filter((n) => /^[a-f0-9]{64}\.json$/.test(n));
  if (names.length < 200) return;
  const rows = await Promise.all(names.map(async (n) => {
    const raw = await readOwnerFile(join(dir, n), 256 * 1024);
    let exp = 0;
    try { exp = raw ? Number((JSON.parse(raw) as { expiresAt?: number }).expiresAt) || 0 : 0; } catch { exp = 0; }
    return { n, exp };
  }));
  const stale = rows.filter((r) => r.exp <= now);
  const live = rows.filter((r) => r.exp > now).sort((a, b) => a.exp - b.exp);
  const over = live.slice(0, Math.max(0, live.length - 2_000));
  await Promise.all([...stale, ...over].map((r) => unlink(join(dir, r.n)).catch(() => undefined)));
}

// ── Brave (budgeted) ─────────────────────────────────────────────────────────

interface BravePolicyFile {
  provider?: string; freeFirst?: boolean; automaticPaidSearchAuthorized?: boolean; maxPaidUsdPerMonth?: number; keyPath?: string; apiResultsRetention?: string;
}

/** Brave list price reserved per query while the free allowance is unknown (policy: reserve_full_list_price). */
export const BRAVE_PRICE_PER_QUERY_MICRO_USD = 5_000;

/** `x-ratelimit-limit` / `x-ratelimit-remaining` read "<per-second>, <per-month>"; the monthly figure is the last. */
export function braveMonthlyFigure(header: string | null): number | null {
  if (!header) return null;
  const parts = header.split(",").map((p) => Number(p.trim())).filter((n) => Number.isFinite(n));
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

/**
 * Brave via `discoverWithBraveBudget` (reservation ledger + caps) in chunks of
 * ≤ 3 queries. A 200 with no web results while the monthly limit/remaining is
 * 0 is `quota_exhausted`: the rest of the queries are cancelled and a marker
 * skips Brave for 24 h (or until the month turns) — delete
 * market-research-cache/brave-quota-state.json after raising the quota.
 */
export function createBraveMarketSearch(opts: { stateDir?: string; fetch?: typeof fetch; now?: () => number } = {}): MarketSearchProvider {
  const stateDir = opts.stateDir ?? researchStateDir();
  const now = opts.now ?? Date.now;
  const markerDir = join(stateDir, "market-research-cache");
  const markerName = "brave-quota-state.json";
  return {
    id: "brave",
    async search(queries: PlannedQuery[], ctx): Promise<SearchOutcome> {
      const t = now();
      const month = new Date(t).toISOString().slice(0, 7);
      const marker = await readOwnerFile(join(markerDir, markerName), 4096);
      try { if (marker && Number((JSON.parse(marker) as { exhaustedUntil?: number }).exhaustedUntil) > t) return { status: "quota_exhausted", hits: [], calls: 0, reasons: ["quota_marker"] }; } catch { /* ignore */ }
      const policyRaw = await readOwnerFile(join(stateDir, "brave-policy.json"), 16 * 1024);
      let policy: BravePolicyFile;
      try { policy = policyRaw ? (JSON.parse(policyRaw) as BravePolicyFile) : {}; } catch { policy = {}; }
      if (policy.provider !== "brave" || !policy.keyPath) return { status: "not_configured", hits: [], calls: 0, reasons: ["policy_missing"] };
      const keyPath = resolve(policy.keyPath);
      if (!keyPath.startsWith(`${resolve(stateDir)}/`)) return { status: "not_configured", hits: [], calls: 0, reasons: ["key_outside_state_dir"] };
      const keyFile = await readOwnerFile(keyPath, 4096);
      const apiKey = keyFile?.match(/^\s*BRAVE_SEARCH_API_KEY\s*=\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
      if (!apiKey) return { status: "not_configured", hits: [], calls: 0, reasons: ["key_missing"] };
      const reservations = join(stateDir, "brave-reservations");
      if (!(await ownerOnlyDir(reservations))) return { status: "not_configured", hits: [], calls: 0, reasons: ["ledger_dir_unsafe"] };
      const manual = await readOwnerFile(join(stateDir, `brave-budget-${month}.json`), 256 * 1024);
      let committedMicroUsd = 0, manualRequests = 0;
      try { if (manual) { const m = JSON.parse(manual) as { month?: string; reservedMicroUsd?: number; requests?: number }; if (m.month === month) { committedMicroUsd = Math.max(0, Math.floor(m.reservedMicroUsd ?? 0)); manualRequests = Math.max(0, Math.floor(m.requests ?? 0)); } } } catch { /* unreadable manual ledger counts as zero */ }
      const capMicro = Math.max(0, Math.min(5_000_000, Math.floor((policy.maxPaidUsdPerMonth ?? 0) * 1e6)));

      let quotaExhausted = false;
      let rateLimited = false;
      const local = new AbortController();
      const abortLocal = () => local.abort();
      ctx.signal.addEventListener("abort", abortLocal, { once: true });
      const base = opts.fetch ?? fetch;
      const watched: typeof fetch = async (input, init) => {
        const res = await base(input, init);
        const limit = braveMonthlyFigure(res.headers.get("x-ratelimit-limit"));
        const left = braveMonthlyFigure(res.headers.get("x-ratelimit-remaining"));
        // A plan with a monthly limit of 0 answers 200 with no web results: stop at once.
        // Remaining 0 after this query: keep its results, dispatch nothing more.
        if (limit === 0) { quotaExhausted = true; local.abort(); } else if (left === 0) quotaExhausted = true;
        if (res.status === 429) { rateLimited = true; local.abort(); }
        if (res.status === 402) { quotaExhausted = true; local.abort(); }
        return res;
      };
      const hits: SearchHit[] = [];
      const reasons: string[] = [];
      let calls = 0, denied = false, failed = false;
      const chunks: PlannedQuery[][] = [];
      const capped = queries.slice(0, Math.max(0, Math.min(5, ctx.maxCalls)));
      for (let i = 0; i < capped.length; i += 3) chunks.push(capped.slice(i, i + 3));
      try {
        for (const [ci, chunk] of chunks.entries()) {
          if (local.signal.aborted || quotaExhausted) break;
          const questionId = `${ctx.jobId}:q${ci + 1}`;
          const readPolicy = async (): Promise<BraveResearchBudget> => {
            const at = now();
            const iso = new Date(at).toISOString();
            return {
              provider: "brave", accountId: "blockid-brave-search", observedAt: iso, expiresAt: new Date(at + 60_000).toISOString(), providerPolicyConfirmed: true,
              ...(policy.automaticPaidSearchAuthorized && capMicro > 0 ? { paid: { ownerPolicyId: "brave-policy-v1", currency: "USD" as const, monthlyCapMicroUsd: capMicro, committedMicroUsd: Math.min(committedMicroUsd, capMicro), reservedMicroUsd: 0, pricePerQueryMicroUsd: BRAVE_PRICE_PER_QUERY_MICRO_USD, quoteExpiresAt: new Date(at + 60_000).toISOString() } } : {}),
              questionId, batchId: ctx.jobId, day: iso.slice(0, 10), month: iso.slice(0, 7),
              used: { question: 0, batch: 0, day: 0, month: manualRequests },
              // Free allowance unknown → every query reserves the full list price.
              remainingFreeQueries: 0,
            };
          };
          const approved: ApprovedPublicQuery[] = chunk.map((q) => ({ id: q.id, query: q.query, approvedForPublicSearch: true }));
          const { discovery, budgetDecisions } = await discoverWithBraveBudget(
            { jobId: ctx.jobId, questionId, batchId: ctx.jobId, month, approvedPublicQueries: approved },
            // Server-internal composition: the report run itself is the authority; no customer credit is charged.
            { directory: reservations, apiKey, readPolicy, assertAuthorized: async () => {}, fetch: watched, signal: local.signal, now },
          );
          calls += budgetDecisions.filter((d) => d.dispatchAllowed).length;
          if (budgetDecisions.some((d) => !d.dispatchAllowed)) { denied = true; reasons.push(budgetDecisions.find((d) => !d.dispatchAllowed)?.reason ?? "denied"); }
          if (discovery.reasons.includes("provider_failed") || discovery.reasons.includes("malformed_response")) failed = true;
          for (const c of discovery.candidates) hits.push({ url: c.url, queryIds: c.queryIds });
          if (denied || failed) break;
        }
      } finally { ctx.signal.removeEventListener("abort", abortLocal); }
      if (quotaExhausted && !hits.length) {
        const until = Math.min(t + 24 * 60 * 60 * 1000, Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1));
        if (await ownerOnlyDir(markerDir)) await writeOwnerFile(markerDir, markerName, JSON.stringify({ version: 1, exhaustedUntil: until, observedAt: new Date(t).toISOString() })).catch(() => undefined);
        return { status: "quota_exhausted", hits: [], calls, reasons: ["monthly_quota_0"] };
      }
      if (hits.length) return { status: "ok", hits, calls, reasons };
      if (denied) return { status: "budget_denied", hits, calls, reasons };
      if (rateLimited) return { status: "unavailable", hits, calls, reasons: [...reasons, "rate_limited"] };
      if (failed) return { status: "unavailable", hits, calls, reasons: [...reasons, "provider_failed"] };
      return { status: "ok", hits, calls, reasons: [...reasons, "no_results"] };
    },
  };
}

// ── Claude CLI WebSearch fallback ────────────────────────────────────────────

export const CLAUDE_CLI_SEARCH_SCHEMA = JSON.stringify({
  type: "object",
  properties: { results: { type: "array", maxItems: 5, items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" }, snippet: { type: "string" } }, required: ["url", "title", "snippet"] } } },
  required: ["results"],
});

/**
 * Flags verified against Claude Code 2.1.143 (`claude --help` + one manual
 * smoke 2026-09-26): print mode, JSON envelope with `structured_output`,
 * WebSearch as the ONLY available and allowed tool, no session file, no MCP
 * servers, no skills.
 */
export function claudeCliSearchArgs(prompt: string): string[] {
  return [
    "-p", prompt,
    "--output-format", "json",
    "--model", "haiku",
    "--tools", "WebSearch",
    "--allowedTools", "WebSearch",
    "--permission-mode", "dontAsk",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--json-schema", CLAUDE_CLI_SEARCH_SCHEMA,
  ];
}

export function claudeCliSearchPrompt(queries: PlannedQuery[]): string {
  return [
    "Use the WebSearch tool to run these public web searches, all in one step (do not open pages):",
    ...queries.slice(0, 5).map((q, i) => `${i + 1}) ${q.query}`),
    "Return at most 5 of the best result pages as JSON matching the schema: prefer the company's official site, government / regulator / statistics bodies and established business press;",
    "no paywalled pages, no SEO market-report mills, no press-release wires, no review aggregators. Each snippet: a short verbatim excerpt (max 200 characters).",
  ].join("\n");
}

/** Parse the CLI's JSON envelope → ≤ 5 hits (untrusted: URLs are re-checked by the ranker). */
export function parseClaudeCliSearch(stdout: string): { ok: boolean; hits: SearchHit[]; reason?: string } {
  let env: { is_error?: unknown; structured_output?: unknown; result?: unknown };
  try { env = JSON.parse(stdout) as typeof env; } catch { return { ok: false, hits: [], reason: "envelope_unparseable" }; }
  if (!env || typeof env !== "object" || env.is_error === true) return { ok: false, hits: [], reason: "cli_error" };
  let payload: unknown = env.structured_output;
  if (!payload && typeof env.result === "string") { try { payload = JSON.parse(env.result.slice(env.result.indexOf("{"), env.result.lastIndexOf("}") + 1)); } catch { payload = null; } }
  const rows = payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results) ? ((payload as { results: unknown[] }).results) : null;
  if (!rows) return { ok: false, hits: [], reason: "no_results_field" };
  const hits = rows.slice(0, 5).flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const { url, title, snippet } = r as { url?: unknown; title?: unknown; snippet?: unknown };
    return typeof url === "string" && url.length <= 2048 ? [{ url, title: typeof title === "string" ? title.slice(0, 200) : undefined, snippet: typeof snippet === "string" ? snippet.slice(0, 300) : undefined }] : [];
  });
  return { ok: true, hits };
}

type SpawnFn = (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
let cliRunning = 0;
let cliDownUntil = 0;
const CLI_MAX_CONCURRENT = 2;

/** Test seam. */
export function resetClaudeCliState(): void { cliRunning = 0; cliDownUntil = 0; }

export function createClaudeCliMarketSearch(opts: { bin?: string; cwd?: string; spawn?: SpawnFn; now?: () => number } = {}): MarketSearchProvider {
  const bin = opts.bin ?? process.env.CLAUDE_CLI_BIN?.trim() ?? "claude";
  const now = opts.now ?? Date.now;
  const doSpawn = opts.spawn ?? (nodeSpawn as unknown as SpawnFn);
  return {
    id: "claude_cli_websearch",
    async search(queries, ctx): Promise<SearchOutcome> {
      if (now() < cliDownUntil) return { status: "unavailable", hits: [], calls: 0, reasons: ["cli_cooldown"] };
      if (cliRunning >= CLI_MAX_CONCURRENT) return { status: "unavailable", hits: [], calls: 0, reasons: ["cli_busy"] };
      if (ctx.maxCalls < 1 || !queries.length) return { status: "unavailable", hits: [], calls: 0, reasons: ["no_calls_left"] };
      const cwd = opts.cwd ?? join(researchStateDir(), "claude-cli-cwd");
      if (!(await ownerOnlyDir(cwd))) return { status: "not_configured", hits: [], calls: 0, reasons: ["cwd_unsafe"] };
      cliRunning++;
      try {
        const timeoutMs = Math.max(1_000, Math.min(60_000, ctx.timeoutMs));
        const out = await new Promise<{ code: number | null; stdout: string; timedOut: boolean; spawnError: boolean }>((resolveRun) => {
          let stdout = "", size = 0, timedOut = false, done = false;
          let child: ChildProcess;
          // Minimal environment: HOME for the subscription credentials, PATH for the binary. No app secrets.
          const env: NodeJS.ProcessEnv = { HOME: process.env.HOME ?? homedir(), PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8" };
          try { child = doSpawn(bin, claudeCliSearchArgs(claudeCliSearchPrompt(queries)), { cwd, env, stdio: ["ignore", "pipe", "ignore"] }); }
          catch { resolveRun({ code: null, stdout: "", timedOut: false, spawnError: true }); return; }
          const finish = (code: number | null, spawnError = false) => { if (done) return; done = true; clearTimeout(timer); ctx.signal.removeEventListener("abort", kill); resolveRun({ code, stdout, timedOut, spawnError }); };
          const kill = () => { timedOut = true; try { child.kill("SIGKILL"); } catch { /* gone */ } finish(null); };
          const timer = setTimeout(kill, timeoutMs);
          ctx.signal.addEventListener("abort", kill, { once: true });
          child.stdout?.on("data", (b: Buffer) => { size += b.length; if (size > 512 * 1024) { kill(); return; } stdout += b.toString("utf8"); });
          child.on("error", () => finish(null, true));
          child.on("close", (code) => finish(code));
        });
        if (out.spawnError) { cliDownUntil = now() + 10 * 60_000; return { status: "not_configured", hits: [], calls: 0, reasons: ["cli_spawn_failed"] }; }
        if (out.timedOut) return { status: "timeout", hits: [], calls: 1, reasons: ["cli_timeout"] };
        if (out.code !== 0) return { status: "unavailable", hits: [], calls: 1, reasons: [`cli_exit_${out.code}`] };
        const parsed = parseClaudeCliSearch(out.stdout);
        if (!parsed.ok) return { status: "unavailable", hits: [], calls: 1, reasons: [parsed.reason ?? "cli_unparseable"] };
        return { status: "ok", hits: parsed.hits, calls: 1, reasons: parsed.hits.length ? [] : ["no_results"] };
      } finally { cliRunning = Math.max(0, cliRunning - 1); }
    },
  };
}

// ── R01 fetch + extraction ───────────────────────────────────────────────────

/** The bounded R01 fetcher: DNS-pinned SSRF guard, 2 MB cap, no retry, ≤ 2 re-checked redirect hops. */
export async function fetchPublicPage(url: string, o: { signal: AbortSignal; timeoutMs: number }): Promise<FetchedPage> {
  if (o.signal.aborted) return { ok: false, body: "", reason: "cancelled" };
  const { fetchText } = await import("@/lib/funding/fetch-source");
  const r = await fetchText(url, { retries: 0, maxRedirects: 2, timeoutMs: Math.max(1_000, Math.min(6_000, o.timeoutMs)), userAgent: "BlockID-Research/1.0 (+https://blockid.au)" });
  if (!r.ok || r.truncated) return { ok: false, body: "", reason: r.truncated ? "too_large" : r.refused ? "refused" : `http_${r.status}` };
  return { ok: true, body: r.text, finalUrl: r.finalUrl, contentType: r.contentType };
}

/** ONE DeepInfra call (report scope → policy blockid-report-v1 + the US$0.50 reservation; else deepinfra-only). */
export async function extractWithDeepInfra(a: { system: string; user: string; maxTokens: number; timeoutMs: number }): Promise<string> {
  const { callAI } = await import("@/lib/ai-client");
  const r = await callAI({ providerPolicy: "deepinfra-only", system: a.system, user: a.user, maxTokens: a.maxTokens, taskClass: "classify", agentId: "market-research-extract", timeoutMs: a.timeoutMs, budgetMs: a.timeoutMs, temperature: 0 });
  return r.text;
}

/** Production composition used by the report pipeline's GATHER stage. */
export async function researchMarketForValuationDefault(input: MarketResearchInput, o: { allowNetwork?: boolean; wallMs?: number; signal?: AbortSignal } = {}): Promise<MarketResearchResult> {
  const stateDir = researchStateDir();
  const { decodeEntities } = await import("@/lib/funding/fetch-source");
  const strip = (h: string) => decodeEntities(h.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  const deps: MarketResearchDeps = {
    cache: createFileMarketResearchCache(join(stateDir, "market-research-cache")),
    brave: createBraveMarketSearch({ stateDir }),
    claudeCli: createClaudeCliMarketSearch(),
    fetchPage: fetchPublicPage,
    extract: extractWithDeepInfra,
    toText: (body) => ({ text: strip(body), title: strip(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200) }),
    allowNetwork: o.allowNetwork,
    wallMs: o.wallMs,
    signal: o.signal,
  };
  return researchMarketForValuation(input, deps);
}

