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
}

const SWAP_STATUSES = new Set([502, 503, 504]);
const SWAP_WAIT_MS = 60_000;

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
}

/**
 * One request; on a 502/503/504 (the production swap window during a
 * deploy) wait 60 s and retry exactly once — brief §6.
 */
export async function fetchWithSwapRetry(
  ctx: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
  opts: FetchOpts = {},
): Promise<APIResponse> {
  const first = await once(ctx, method, path, data, extraHeaders, opts);
  if (!SWAP_STATUSES.has(first.status())) return first;
  console.warn(`[live-qa] ${method} ${path} → ${first.status()} (deploy swap?) — waiting ${SWAP_WAIT_MS / 1000}s and retrying once`);
  await new Promise((r) => setTimeout(r, SWAP_WAIT_MS));
  return once(ctx, method, path, data, extraHeaders, opts);
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
  return { status: res.status(), headers: res.headers(), body, text };
}

export const get = <T = Json>(ctx: APIRequestContext, path: string) => json<T>(ctx, "GET", path);
export const post = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown, opts: FetchOpts = {}) => json<T>(ctx, "POST", path, data, undefined, opts);
export const patch = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown) => json<T>(ctx, "PATCH", path, data);
export const put = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown) => json<T>(ctx, "PUT", path, data);
export const del = <T = Json>(ctx: APIRequestContext, path: string, data?: unknown) => json<T>(ctx, "DELETE", path, data);

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

/** Attach a JSON blob to the HTML report as evidence for the current test. */
export async function evidence(testInfo: TestInfo, name: string, data: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(data, null, 2),
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
