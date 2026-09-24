import * as http from "http";
import * as https from "https";

/** Timings/counts only: never retain URL paths, headers, prompts or responses. */
export interface AITransportDiagnostics {
  bodyBytes: number;
  responseBytes: number;
  inFlightAtStart: number;
  inFlightAtFailure: number;
  elapsedMs: number;
  timeoutMs: number;
  socketMs: number | null;
  lookupMs: number | null;
  connectMs: number | null;
  secureConnectMs: number | null;
  requestFinishedMs: number | null;
  responseMs: number | null;
  firstByteMs: number | null;
  statusCode: number | null;
  /** G33-T05 (streamed calls only): first content token, last chunk, and content size. */
  firstTokenMs?: number | null;
  lastChunkMs?: number | null;
  outputChars?: number;
}

export class AITransportError extends Error {
  constructor(message: string, readonly transport: AITransportDiagnostics) {
    super(message);
    this.name = "AITransportError";
  }
}

let inFlight = 0;

/** Bypass patched global fetch; one fresh connection, one bounded request. */
export function inprocessFetch(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Unsupported AI transport protocol");
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const diagnostics: AITransportDiagnostics = {
      bodyBytes: Buffer.byteLength(body), responseBytes: 0, inFlightAtStart: ++inFlight,
      inFlightAtFailure: 0, elapsedMs: 0, timeoutMs,
      socketMs: null, lookupMs: null, connectMs: null, secureConnectMs: null,
      requestFinishedMs: null, responseMs: null, firstByteMs: null, statusCode: null,
    };
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, data?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      diagnostics.elapsedMs = elapsed();
      diagnostics.inFlightAtFailure = error ? inFlight : 0;
      inFlight--;
      if (error) reject(new AITransportError(error.message, { ...diagnostics }));
      else resolve(data ?? "");
    };
    try {
      const req = (u.protocol === "https:" ? https : http).request({
        hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search, method: "POST", agent: false,
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      }, res => {
        diagnostics.responseMs = elapsed();
        diagnostics.statusCode = res.statusCode ?? 0;
        let data = "";
        let ended = false;
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          diagnostics.firstByteMs ??= elapsed();
          diagnostics.responseBytes += Buffer.byteLength(chunk);
          data += chunk;
        });
        res.on("end", () => {
          ended = true;
          if ((res.statusCode ?? 0) >= 400) finish(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          else if (!data) finish(new Error("Empty response"));
          else finish(undefined, data);
        });
        // A response can fail after headers without emitting request.error.
        // Reject immediately instead of misreporting a 60-second model timeout.
        res.on("aborted", () => finish(new Error("AI response aborted before completion")));
        res.on("error", () => finish(new Error("AI response stream error")));
        res.on("close", () => { if (!ended) finish(new Error("AI response closed before completion")); });
      });
      req.on("socket", socket => {
        diagnostics.socketMs = elapsed();
        socket.once("lookup", () => { diagnostics.lookupMs = elapsed(); });
        socket.once("connect", () => { diagnostics.connectMs = elapsed(); });
        socket.once("secureConnect", () => { diagnostics.secureConnectMs = elapsed(); });
      });
      req.on("finish", () => { diagnostics.requestFinishedMs = elapsed(); });
      req.on("error", error => finish(error));
      timer = setTimeout(() => {
        const error = new Error(`Worker timeout (${Math.round(timeoutMs / 1000)}s)`);
        finish(error);
        req.destroy(error);
      }, timeoutMs);
      req.write(body);
      req.end();
    } catch (error) {
      finish(error instanceof Error ? error : new Error("AI transport setup failed"));
    }
  });
}

/**
 * G33-T05 — timeouts for a streamed chat completion. A model that is still
 * producing tokens is never cut off by a fixed per-attempt clock (24/09: DeepInfra
 * generated at 13–32 tok/s, so a 2 600-token chapter needed 80–200 s and every
 * non-streamed call died at 60 s with 0 bytes). Only these fail an attempt:
 *   firstTokenMs  no content token yet (dead / queued model → next rung fast)
 *   idleMs        tokens stopped arriving mid-answer
 *   totalMs       the caller's remaining wall clock (the run deadline)
 */
export interface StreamTimeouts {
  firstTokenMs: number;
  idleMs: number;
  totalMs: number;
}

/** OpenAI-compatible completion rebuilt from SSE chunks (same shape the non-streamed API returns). */
export interface StreamedCompletion {
  model?: string;
  choices: Array<{ message: { content: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * Parse one SSE payload line into the running completion. Exported for tests.
 * Returns false for the `[DONE]` sentinel, true otherwise.
 */
export function applySseLine(line: string, acc: { model?: string; content: string; usage?: StreamedCompletion["usage"]; finish?: string | null; error?: { message?: string } }): boolean {
  const t = line.trim();
  if (!t.startsWith("data:")) return true;
  const data = t.slice(5).trim();
  if (data === "[DONE]") return false;
  let j: Record<string, unknown>;
  try { j = JSON.parse(data) as Record<string, unknown>; } catch { return true; }
  if (j.error && typeof j.error === "object") acc.error = j.error as { message?: string };
  if (typeof j.model === "string") acc.model = j.model;
  const choice = Array.isArray(j.choices) ? (j.choices[0] as Record<string, unknown> | undefined) : undefined;
  const delta = choice?.delta as Record<string, unknown> | undefined;
  if (typeof delta?.content === "string") acc.content += delta.content;
  if (typeof choice?.finish_reason === "string") acc.finish = choice.finish_reason;
  if (j.usage && typeof j.usage === "object") acc.usage = j.usage as StreamedCompletion["usage"];
  return true;
}

/** Streamed POST (SSE). Resolves with the completion as a JSON string, like `inprocessFetch`. */
export function inprocessStreamChat(url: string, headers: Record<string, string>, body: string, timeouts: StreamTimeouts, onDone?: (d: AITransportDiagnostics) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Unsupported AI transport protocol");
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const diagnostics: AITransportDiagnostics = {
      bodyBytes: Buffer.byteLength(body), responseBytes: 0, inFlightAtStart: ++inFlight,
      inFlightAtFailure: 0, elapsedMs: 0, timeoutMs: timeouts.totalMs,
      socketMs: null, lookupMs: null, connectMs: null, secureConnectMs: null,
      requestFinishedMs: null, responseMs: null, firstByteMs: null, statusCode: null,
      firstTokenMs: null, lastChunkMs: null, outputChars: 0,
    };
    const acc: { model?: string; content: string; usage?: StreamedCompletion["usage"]; finish?: string | null; error?: { message?: string } } = { content: "" };
    let settled = false;
    let req: ReturnType<typeof http.request> | undefined;
    let firstTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(firstTimer); clearTimeout(idleTimer); clearTimeout(totalTimer); };
    const finish = (error?: Error, data?: string) => {
      if (settled) return;
      settled = true;
      clear();
      diagnostics.elapsedMs = elapsed();
      diagnostics.outputChars = acc.content.length;
      diagnostics.inFlightAtFailure = error ? inFlight : 0;
      inFlight--;
      if (error) {
        req?.destroy(error);
        reject(new AITransportError(error.message, { ...diagnostics }));
      } else {
        try { onDone?.({ ...diagnostics }); } catch { /* diagnostics must never fail a call */ }
        resolve(data ?? "");
      }
    };
    // "Worker timeout" keeps classifyRunStrike's timeout class for all three.
    const timeout = (kind: string, ms: number) => () => finish(new Error(`Worker timeout (${kind} ${Math.round(ms / 1000)}s)`));
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(timeout("idle", timeouts.idleMs), timeouts.idleMs);
    };
    try {
      req = (u.protocol === "https:" ? https : http).request({
        hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search, method: "POST", agent: false,
        headers: { ...headers, Accept: "text/event-stream", "Content-Length": Buffer.byteLength(body) },
      }, res => {
        diagnostics.responseMs = elapsed();
        diagnostics.statusCode = res.statusCode ?? 0;
        const failed = (res.statusCode ?? 0) >= 400;
        let errorBody = "";
        let buffer = "";
        let done = false;
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          diagnostics.firstByteMs ??= elapsed();
          diagnostics.lastChunkMs = elapsed();
          diagnostics.responseBytes += Buffer.byteLength(chunk);
          if (failed) { errorBody += chunk; return; }
          buffer += chunk;
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            const before = acc.content.length;
            if (!applySseLine(line, acc)) done = true;
            if (acc.content.length > before) {
              if (diagnostics.firstTokenMs == null) { diagnostics.firstTokenMs = elapsed(); clearTimeout(firstTimer); }
              armIdle();
            }
          }
        });
        res.on("end", () => {
          if (failed) return finish(new Error(`HTTP ${res.statusCode}: ${errorBody.slice(0, 200)}`));
          if (buffer) applySseLine(buffer, acc);
          if (acc.error) return finish(new Error(acc.error.message ?? "DeepInfra stream error"));
          if (!done && !acc.usage && !acc.content) return finish(new Error("Empty response"));
          const completion: StreamedCompletion = {
            ...(acc.model ? { model: acc.model } : {}),
            choices: [{ message: { content: acc.content }, finish_reason: acc.finish ?? null }],
            ...(acc.usage ? { usage: acc.usage } : {}),
          };
          finish(undefined, JSON.stringify(completion));
        });
        res.on("aborted", () => finish(new Error("AI response aborted before completion")));
        res.on("error", () => finish(new Error("AI response stream error")));
        res.on("close", () => { if (!res.complete) finish(new Error("AI response closed before completion")); });
      });
      req.on("socket", socket => {
        diagnostics.socketMs = elapsed();
        socket.once("lookup", () => { diagnostics.lookupMs = elapsed(); });
        socket.once("connect", () => { diagnostics.connectMs = elapsed(); });
        socket.once("secureConnect", () => { diagnostics.secureConnectMs = elapsed(); });
      });
      req.on("finish", () => { diagnostics.requestFinishedMs = elapsed(); });
      req.on("error", error => finish(error));
      firstTimer = setTimeout(timeout("first token", timeouts.firstTokenMs), timeouts.firstTokenMs);
      totalTimer = setTimeout(timeout("total", timeouts.totalMs), timeouts.totalMs);
      req.write(body);
      req.end();
    } catch (error) {
      finish(error instanceof Error ? error : new Error("AI transport setup failed"));
    }
  });
}
