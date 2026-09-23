import { createServer, type Server, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AITransportError, inprocessFetch } from "./http-transport";

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
