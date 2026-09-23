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
