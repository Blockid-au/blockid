import { createServer, type Server, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AITransportError, applySseLine, inprocessFetch, inprocessStreamChat } from "./http-transport";

const servers: Server[] = [];
async function endpoint(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/private-path?secret=hidden`;
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

describe("AI HTTP transport against a local server", () => {
  it("returns complete UTF-8 output across parallel fresh connections", async () => {
    const url = await endpoint((req, res) => {
      let body = "";
      req.setEncoding("utf8"); req.on("data", c => { body += c; });
      req.on("end", () => res.end(JSON.stringify({ answer: body })));
    });
    const results = await Promise.all(Array.from({ length: 8 }, () => inprocessFetch(url, {}, "bằng chứng", 1000)));
    expect(results.every(x => JSON.parse(x).answer === "bằng chứng")).toBe(true);
  });
  it("records request-sent/no-response timeout without exposing inputs", async () => {
    const url = await endpoint(req => req.resume());
    const error = await inprocessFetch(url, { Authorization: "private-key" }, "private-prompt", 40).catch(e => e);
    expect(error).toBeInstanceOf(AITransportError);
    expect(error.transport).toMatchObject({ bodyBytes: 14, responseBytes: 0, responseMs: null, inFlightAtStart: 1 });
    expect(error.transport.socketMs).not.toBeNull();
    expect(error.transport.requestFinishedMs).not.toBeNull();
    expect(JSON.stringify(error.transport)).not.toMatch(/private|hidden/);
  });
  it("distinguishes a stalled response body from waiting for headers", async () => {
    const url = await endpoint((req, res) => { req.resume(); res.writeHead(200); res.write("partial"); });
    const error = await inprocessFetch(url, {}, "{}", 40).catch(e => e);
    expect(error.transport).toMatchObject({ responseBytes: 7, statusCode: 200 });
    expect(error.transport.firstByteMs).not.toBeNull();
  });
  it("rejects a truncated body immediately, clears its timer and releases in-flight count", async () => {
    const url = await endpoint((req, res) => {
      req.resume(); res.writeHead(200, { "Content-Length": "100" }); res.write("part");
      setTimeout(() => res.destroy(), 5);
    });
    const error = await inprocessFetch(url, {}, "{}", 1000).catch(e => e);
    expect(error).toBeInstanceOf(AITransportError);
    expect(error.message).toMatch(/aborted|closed|stream/);
    expect(error.transport.elapsedMs).toBeLessThan(800);
    const next = await endpoint(req => req.resume());
    const after = await inprocessFetch(next, {}, "{}", 30).catch(e => e);
    expect(after.transport.inFlightAtStart).toBe(1);
  });
  it("preserves HTTP status errors for quota handling", async () => {
    const url = await endpoint((req, res) => { req.resume(); res.writeHead(429); res.end("quota exceeded"); });
    await expect(inprocessFetch(url, {}, "{}", 1000)).rejects.toThrow("HTTP 429");
  });
});

// G33-T05 — streamed chat completions (SSE) with first-token / idle / total timeouts.
const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const T = (over: Partial<{ firstTokenMs: number; idleMs: number; totalMs: number }> = {}) => ({ firstTokenMs: 200, idleMs: 200, totalMs: 2000, ...over });

describe("AI streamed chat transport", () => {
  it("rebuilds the completion (model, content, usage) from SSE chunks, even when lines split across TCP chunks", async () => {
    const url = await endpoint((req, res) => {
      req.resume();
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const all = sse({ model: "m-1", choices: [{ delta: { role: "assistant" } }] }) + sse({ choices: [{ delta: { content: "Bằng " } }] }) + sse({ choices: [{ delta: { content: "chứng" }, finish_reason: "stop" }] }) + sse({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 3 } }) + "data: [DONE]\n\n";
      const cut = Math.floor(all.length / 2);
      res.write(all.slice(0, cut));
      setTimeout(() => res.end(all.slice(cut)), 10);
    });
    const raw = await inprocessStreamChat(url, {}, "{}", T());
    expect(JSON.parse(raw)).toEqual({ model: "m-1", choices: [{ message: { content: "Bằng chứng" }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 3 } });
  });

  it("a slow but steady stream outlives the first-token window (24/09: 13 tok/s must not time out)", async () => {
    const url = await endpoint((req, res) => {
      req.resume();
      res.writeHead(200);
      let i = 0;
      const tick = setInterval(() => {
        if (i++ < 8) res.write(sse({ choices: [{ delta: { content: "x" } }] }));
        else { clearInterval(tick); res.end(sse({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 8 } }) + "data: [DONE]\n\n"); }
      }, 60);
    });
    // 8 × 60 ms = 480 ms total > firstToken 200 ms, but each gap < idle 200 ms.
    const raw = await inprocessStreamChat(url, {}, "{}", T());
    expect(JSON.parse(raw).choices[0].message.content).toBe("xxxxxxxx");
  });

  it("no first token → a `Worker timeout (first token …)` with diagnostics and no inputs", async () => {
    const url = await endpoint((req, res) => { req.resume(); res.writeHead(200); res.write(sse({ model: "m", choices: [{ delta: { role: "assistant" } }] })); });
    const error = await inprocessStreamChat(url, { Authorization: "private-key" }, "private-prompt", T({ firstTokenMs: 60 })).catch(e => e);
    expect(error).toBeInstanceOf(AITransportError);
    expect(error.message).toMatch(/^Worker timeout \(first token/);
    expect(error.transport).toMatchObject({ statusCode: 200, firstTokenMs: null, outputChars: 0 });
    expect(JSON.stringify(error.transport)).not.toMatch(/private|hidden/);
  });

  it("tokens that stop mid-answer → idle timeout; total caps a stream that never ends", async () => {
    const stall = await endpoint((req, res) => { req.resume(); res.writeHead(200); res.write(sse({ choices: [{ delta: { content: "half" } }] })); });
    const idle = await inprocessStreamChat(stall, {}, "{}", T({ idleMs: 60 })).catch(e => e);
    expect(idle.message).toMatch(/^Worker timeout \(idle/);
    expect(idle.transport.outputChars).toBe(4);
    const drip = await endpoint((req, res) => { req.resume(); res.writeHead(200); const t = setInterval(() => res.write(sse({ choices: [{ delta: { content: "." } }] })), 20); res.on("close", () => clearInterval(t)); });
    const total = await inprocessStreamChat(drip, {}, "{}", T({ totalMs: 150 })).catch(e => e);
    expect(total.message).toMatch(/^Worker timeout \(total/);
  });

  it("keeps HTTP status errors (429 overload) and in-stream error events", async () => {
    const busy = await endpoint((req, res) => { req.resume(); res.writeHead(429); res.end('{"error":{"message":"Model busy, retry later","code":"engine_overloaded"}}'); });
    await expect(inprocessStreamChat(busy, {}, "{}", T())).rejects.toThrow(/HTTP 429: .*engine_overloaded/);
    const bad = await endpoint((req, res) => { req.resume(); res.writeHead(200); res.end(sse({ error: { message: "upstream failed" } })); });
    await expect(inprocessStreamChat(bad, {}, "{}", T())).rejects.toThrow("upstream failed");
  });

  it("applySseLine ignores comments/blank/garbage and stops at [DONE]", () => {
    const acc = { content: "" } as { content: string; model?: string };
    expect(applySseLine(": keep-alive", acc)).toBe(true);
    expect(applySseLine("", acc)).toBe(true);
    expect(applySseLine("data: {not json", acc)).toBe(true);
    expect(applySseLine("data: [DONE]", acc)).toBe(false);
    expect(acc.content).toBe("");
  });
});
