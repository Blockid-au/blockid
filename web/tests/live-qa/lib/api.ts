/**
 * Thin JSON helpers over Playwright's request context. Every call goes
 * through the browser context's cookie jar (the storage state the global
 * setup saved), so the calls are same-origin founder calls — exactly what the
 * client components do. Non-browser requests carry no `Sec-Fetch-Site`, so the
 * proxy's cross-site gate lets them through (src/proxy.ts crossSiteApiGate).
 */
import { request, type APIRequestContext, type APIResponse, type Page, type TestInfo } from "@playwright/test";

export type Json = Record<string, unknown>;

export interface JsonResult<T = Json> {
  status: number;
  headers: Record<string, string>;
  body: T;
  text: string;
  /** G15-R1 — `classifyStatus(status)`; `edge_timeout` for Cloudflare 520–524. */
  classification: StatusClass;
}

const SWAP_STATUSES = new Set([502, 503, 504]);
const SWAP_WAIT_MS = 60_000;

// ── G15-R1 resilience (evidence E6) ────────────────────────────────────
// A re-run inside the intake bucket's window hit 429s that were reported as
// product failures, and the funding lane's 120 s AI call surfaced as a
// Cloudflare 524 that read like a 5xx from the app. Two helpers, both pure:
//   • Retry-After on 429 is honoured for idempotent probes (GET/HEAD, or a
//     POST the caller marks `idempotent: true`): wait, cap 30 s, at most 2
//     waits, then give the caller the last 429.
//   • 520–524 are Cloudflare edge verdicts (origin unreachable / timed out),
//     classified `edge_timeout` so the evidence names the layer that failed.
export const RATE_LIMIT_MAX_WAITS = 2;
export const RATE_LIMIT_CAP_MS = 30_000;
/** Used when a 429 carries no (or an unparseable) Retry-After. */
export const RATE_LIMIT_DEFAULT_MS = 5_000;

export type StatusClass = "ok" | "client_error" | "rate_limited" | "deploy_swap" | "edge_timeout" | "server_error";

/**
 * Bucket an HTTP status for evidence. 520–524 = Cloudflare edge (520 unknown
 * origin error, 521 origin down, 522 connect timeout, 523 unreachable, 524
 * origin timeout) → `edge_timeout`; 502/503/504 = the production swap window
 * → `deploy_swap`; 429 → `rate_limited`.
 */
export function classifyStatus(status: number): StatusClass {
  if (status >= 520 && status <= 524) return "edge_timeout";
  if (status === 429) return "rate_limited";
  if (SWAP_STATUSES.has(status)) return "deploy_swap";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "ok";
}

/**
 * Milliseconds to wait for a Retry-After header — delta-seconds or an HTTP
 * date — capped at `capMs`; `defaultMs` when the header is absent or junk.
 * Never negative (a date in the past → 0).
 */
export function retryAfterMs(header: string | undefined | null, opts: { nowMs?: number; capMs?: number; defaultMs?: number } = {}): number {
  const cap = opts.capMs ?? RATE_LIMIT_CAP_MS;
  const fallback = Math.min(opts.defaultMs ?? RATE_LIMIT_DEFAULT_MS, cap);
  const raw = (header ?? "").trim();
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) return Math.min(Number(raw) * 1000, cap);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return fallback;
  return Math.min(Math.max(at - (opts.nowMs ?? Date.now()), 0), cap);
}

/** GET/HEAD are idempotent by definition; anything else only when the caller says so. */
export function isIdempotent(method: string, opts: Pick<FetchOpts, "idempotent"> = {}): boolean {
  return method === "GET" || method === "HEAD" || opts.idempotent === true;
}

/**
 * Evidence annotation: a plain object carrying a numeric `status` gains a
 * `classification` (unless it already has one) so a 52x reads as
 * `edge_timeout` in the HTML report rather than as an app 5xx. Anything else
 * passes through untouched.
 */
export function annotateEvidence<T>(data: T): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  if (typeof obj.status !== "number" || "classification" in obj) return data;
  return { ...obj, classification: classifyStatus(obj.status) } as T;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function once(
  ctx: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
  opts: FetchOpts = {},
): Promise<APIResponse> {
  const headers: Record<string, string> = { accept: "application/json", ...(extraHeaders ?? {}) };
  if (data !== undefined && typeof data !== "string") headers["content-type"] = "application/json";
  return ctx.fetch(path, {
    method,
    headers,
    data: data === undefined ? undefined : typeof data === "string" ? data : JSON.stringify(data),
    maxRedirects: 0,
    // AI-backed routes (Money Finder narrative, CFO advisor) legitimately run
    // past the 20 s `actionTimeout`; nginx allows 310 s on those paths.
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  });
}

/** Per-call overrides for the JSON helpers. */
export interface FetchOpts {
  /** Request timeout in ms (default = the config `actionTimeout`, 20 s). */
  timeoutMs?: number;
  /**
   * G15-R1: mark a POST/PATCH/PUT/DELETE as safe to repeat after a 429 (the
   * server would produce the same state — e.g. an upsert or a read-only
   * "probe" POST). GET/HEAD never need this. Never set it on a call that
   * spends credits or creates a row.
   */
  idempotent?: boolean;
}

/**
 * One request; on a 502/503/504 (the production swap window during a
 * deploy) wait 60 s and retry exactly once — brief §6. On a 429 for an
 * idempotent call (G15-R1), honour Retry-After (cap 30 s) up to twice.
 */
export async function fetchWithSwapRetry(
  ctx: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
  opts: FetchOpts = {},
): Promise<APIResponse> {
  let swapRetried = false;
  let rateWaits = 0;
  for (;;) {
    const res = await once(ctx, method, path, data, extraHeaders, opts);
    const status = res.status();
    if (SWAP_STATUSES.has(status) && !swapRetried) {
      swapRetried = true;
      console.warn(`[live-qa] ${method} ${path} → ${status} (deploy swap?) — waiting ${SWAP_WAIT_MS / 1000}s and retrying once`);
      await sleep(SWAP_WAIT_MS);
      continue;
    }
    if (status === 429 && rateWaits < RATE_LIMIT_MAX_WAITS && isIdempotent(method, opts)) {
      rateWaits += 1;
      const wait = retryAfterMs(res.headers()["retry-after"]);
      console.warn(`[live-qa] ${method} ${path} → 429 (Retry-After ${res.headers()["retry-after"] ?? "—"}) — waiting ${Math.round(wait / 1000)}s, retry ${rateWaits}/${RATE_LIMIT_MAX_WAITS}`);
      await sleep(wait);
      continue;
    }
    return res;
  }
}

export async function json<T = Json>(
  ctx: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
  opts: FetchOpts = {},
): Promise<JsonResult<T>> {
  const res = await fetchWithSwapRetry(ctx, method, path, data, extraHeaders, opts);
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = {} as T;
  }
  return { status: res.status(), headers: res.headers(), body, text, classification: classifyStatus(res.status()) };
}

export const get = <T = Json>(ctx: APIRequestContext, path: string) => json<T>(ctx, "GET", path);
export const post = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown, opts: FetchOpts = {}) => json<T>(ctx, "POST", path, data, undefined, opts);
export const patch = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown, opts: FetchOpts = {}) => json<T>(ctx, "PATCH", path, data, undefined, opts);
export const put = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown, opts: FetchOpts = {}) => json<T>(ctx, "PUT", path, data, undefined, opts);
export const del = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown, opts: FetchOpts = {}) => json<T>(ctx, "DELETE", path, data, undefined, opts);

/** Current credit balance (GET /api/credits). Throws on a non-200 so a spec never silently compares NaN. */
export async function creditBalance(ctx: APIRequestContext): Promise<number> {
  const r = await get<{ ok: boolean; balance: number }>(ctx, "/api/credits");
  if (r.status !== 200 || typeof r.body.balance !== "number") {
    throw new Error(`GET /api/credits → ${r.status} ${r.text.slice(0, 200)}`);
  }
  return r.body.balance;
}

/**
 * Navigate with the same swap-window tolerance: if the document response is
 * 502/503/504, wait 60 s and load once more. Returns the final response.
 */
export async function gotoWithSwapRetry(page: Page, path: string, opts: { waitUntil?: "domcontentloaded" | "load" | "networkidle" } = {}) {
  const waitUntil = opts.waitUntil ?? "domcontentloaded";
  let res = await page.goto(path, { waitUntil });
  if (res && SWAP_STATUSES.has(res.status())) {
    console.warn(`[live-qa] goto ${path} → ${res.status()} (deploy swap?) — waiting ${SWAP_WAIT_MS / 1000}s and retrying once`);
    await page.waitForTimeout(SWAP_WAIT_MS);
    res = await page.goto(path, { waitUntil });
  }
  return res;
}

/**
 * Attach a JSON blob to the HTML report as evidence for the current test.
 * G15-R1: a blob with a numeric `status` is annotated with its
 * `classification` (52x → `edge_timeout`) — see annotateEvidence.
 */
export async function evidence(testInfo: TestInfo, name: string, data: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(annotateEvidence(data), null, 2),
    contentType: "application/json",
  });
}

/**
 * A request context with an EMPTY cookie jar. Inside a test,
 * `request.newContext()` inherits the project's `use` (including the
 * founder storageState) — the anonymous journeys (guest checkout previews,
 * investor data-room links, logged-out redirects) must pass an empty jar
 * explicitly. Dispose it in a `finally`.
 */
export async function anonRequest(baseURL: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
}

/** Text of a PDF body (pdf-parse v2, the same reader the unit tests use). */
export async function pdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/** Build a multipart CSV upload body for request.post. */
export function csvMultipart(fieldName: string, fileName: string, csv: string) {
  return {
    multipart: {
      [fieldName]: { name: fileName, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") },
    },
  };
}
