import "server-only";
import { isIP } from "node:net";
import { publicSourceUrl } from "./public-sources";

/** Discovery candidates are NOT retrieved pages or evidence. Only trusted server code may approve public queries. */
export type ApprovedPublicQuery = { id: string; query: string; approvedForPublicSearch: true };
export type DiscoveryProvider = {
  id: string;
  search(query: string, options: { count: number; signal: AbortSignal; maxBytes: number }): Promise<unknown>;
};
type Reason = "not_configured" | "not_approved" | "invalid_queries" | "provider_failed" | "malformed_response" | "timeout" | "cancelled" | "budget_exhausted" | "unsafe_results_omitted";
export type DiscoveryResult = {
  version: "public-discovery-v1";
  /** API-derived candidates are request-local only: do not log, cache or persist this result. */
  retention: "ephemeral_only";
  status: "complete" | "partial" | "unavailable";
  reasons: Reason[];
  queries: { id: string; query: string; provider: string; searchedAt: string; status: "complete" | "failed" }[];
  candidates: { url: string; queryIds: string[]; provider: string; discoveredAt: string; citable: false; evidenceStatus: "not_retrieved" }[];
  limits: { maxQueries: number; maxResults: number; attemptedQueries: number; maxResponseBytes: number };
};
const MAX_QUERIES = 3, MAX_RESULTS = 10, MAX_BYTES = 128 * 1024;
function validQuery(q: ApprovedPublicQuery): boolean {
  return !!q && Object.keys(q).every(k => ["id", "query", "approvedForPublicSearch"].includes(k)) && q.approvedForPublicSearch === true &&
    typeof q.id === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(q.id) && typeof q.query === "string" && q.query.trim() === q.query && q.query.length >= 3 && q.query.length <= 180 &&
    !/[\x00-\x1f\x7f@]|https?:\/\/|(?:api[_ -]?key|token|password|secret)\s*[:=]|\bBearer\s|\b(?:sk|pk)[-_][A-Za-z0-9]{8}/i.test(q.query);
}
function candidateUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  const safe = publicSourceUrl(raw);
  if (!safe) return null;
  const host = new URL(safe).hostname;
  // DNS resolution/pinning happens in page retrieval, never treat discovery as network authorization.
  if (isIP(host) || host.includes(":") || !host.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
  return safe;
}
function bounded<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("cancelled"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function discoverPublicSources(input: {
  approvedPublicQueries: ApprovedPublicQuery[];
  /** Server policy admission, NOT a flag accepted from request JSON. Daily spend admission belongs upstream. */
  providerRequestsApproved: boolean;
}, deps: { provider?: DiscoveryProvider; signal?: AbortSignal; timeoutMs?: number; now?: () => number } = {}): Promise<DiscoveryResult> {
  const out: DiscoveryResult = { version: "public-discovery-v1", retention: "ephemeral_only", status: "unavailable", reasons: [], queries: [], candidates: [], limits: { maxQueries: MAX_QUERIES, maxResults: MAX_RESULTS, attemptedQueries: 0, maxResponseBytes: MAX_BYTES } };
  if (!input.providerRequestsApproved) { out.reasons.push("not_approved"); return out; }
  if (!deps.provider || !/^[a-z0-9_-]{1,40}$/.test(deps.provider.id)) { out.reasons.push("not_configured"); return out; }
  const queries = input.approvedPublicQueries;
  if (!Array.isArray(queries) || !queries.length || queries.length > MAX_QUERIES || !queries.every(validQuery) || new Set(queries.map(q => q.id)).size !== queries.length || new Set(queries.map(q => q.query)).size !== queries.length) {
    out.reasons.push("invalid_queries"); return out;
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = Number.isFinite(deps.timeoutMs) ? Math.max(1, Math.min(deps.timeoutMs!, 15_000)) : 10_000;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  const abort = () => controller.abort();
  deps.signal?.addEventListener("abort", abort, { once: true });
  if (deps.signal?.aborted) abort();
  const now = deps.now ?? Date.now;
  const seen = new Map<string, DiscoveryResult["candidates"][number]>();
  try {
    for (const q of queries) {
      if (controller.signal.aborted) { out.reasons.push(timedOut ? "timeout" : "cancelled"); break; }
      if (out.candidates.length >= MAX_RESULTS) { out.reasons.push("budget_exhausted"); break; }
      const meta = { id: q.id, query: q.query, provider: deps.provider.id, searchedAt: new Date(now()).toISOString(), status: "failed" as "failed" | "complete" };
      out.queries.push(meta); out.limits.attemptedQueries++;
      try {
        const count = MAX_RESULTS - out.candidates.length;
        const result = await bounded(() => deps.provider!.search(q.query, { count, signal: controller.signal, maxBytes: MAX_BYTES }), controller.signal);
        // Injected providers must return the same bounded minimal envelope; never persist provider bodies/snippets/errors.
        if (!result || typeof result !== "object" || !Array.isArray((result as { results?: unknown }).results)) { out.reasons.push("malformed_response"); continue; }
        const rows = (result as { results: unknown[] }).results;
        if (rows.length > count) out.reasons.push("budget_exhausted");
        for (const row of rows.slice(0, count)) {
          const url = candidateUrl(row && typeof row === "object" ? (row as { url?: unknown }).url : null);
          if (!url) { out.reasons.push("unsafe_results_omitted"); continue; }
          const previous = seen.get(url);
          if (previous) { if (!previous.queryIds.includes(q.id)) previous.queryIds.push(q.id); continue; }
          const candidate = { url, queryIds: [q.id], provider: deps.provider.id, discoveredAt: meta.searchedAt, citable: false as const, evidenceStatus: "not_retrieved" as const };
          seen.set(url, candidate); out.candidates.push(candidate);
        }
        meta.status = "complete";
      } catch {
        out.reasons.push(controller.signal.aborted ? timedOut ? "timeout" : "cancelled" : "provider_failed");
        // Fail closed on quota/auth/transport failures; no retry, alternative provider, or scraping.
        break;
      }
    }
  } finally { clearTimeout(timer); deps.signal?.removeEventListener("abort", abort); }
  out.reasons = [...new Set(out.reasons)];
  out.status = out.reasons.length ? out.queries.some(q => q.status === "complete") ? "partial" : "unavailable" : "complete";
  return out;
}

/** Fixed official endpoint. No environment reads, automatic spending, redirects, retry or fallback.
 * Brave-derived URLs are ephemeral only. Production integration requires a permitted retention policy.
 */
export function createBraveDiscoveryProvider(config: { apiKey?: string; fetch?: typeof fetch }): DiscoveryProvider | undefined {
  const key = config.apiKey?.trim();
  if (!key || key.length > 512 || /\s/.test(key)) return undefined;
  const fetcher = config.fetch ?? fetch;
  return { id: "brave_web", async search(query, options) {
    if (!validQuery({ id: "query", query, approvedForPublicSearch: true })) throw new Error("invalid_query");
    const count = Math.max(1, Math.min(MAX_RESULTS, Math.floor(options.count)));
    if (!Number.isFinite(count) || options.signal.aborted) throw new Error("invalid_request");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.search = new URLSearchParams({ q: query, count: String(count), result_filter: "web", text_decorations: "false", spellcheck: "false" }).toString();
    let response: Response;
    try { response = await fetcher(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, redirect: "error", cache: "no-store", signal: options.signal }); }
    catch { throw new Error("search_request_failed"); }
    if (!response.ok || !response.body || !/application\/json/i.test(response.headers.get("content-type") ?? "")) { void response.body?.cancel().catch(() => {}); throw new Error("search_response_rejected"); }
    const maxBytes = Number.isFinite(options.maxBytes) ? Math.max(1, Math.min(MAX_BYTES, options.maxBytes)) : MAX_BYTES;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await bounded(() => reader.read(), options.signal);
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error("search_response_too_large");
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!parsed || !Array.isArray(parsed.web?.results)) throw new Error("search_response_invalid");
      return { results: parsed.web.results.slice(0, count).map((row: unknown) => ({ url: row && typeof row === "object" ? (row as { url?: unknown }).url : null })) };
    } catch { throw new Error("search_response_failed"); }
    finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  } };
}
