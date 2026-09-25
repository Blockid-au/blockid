import { afterEach, beforeEach, expect, it } from "vitest";
import { Agent, createServer, request, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OriginActivity } from "./origin-activity";
import { installOriginHttpAdmission, RESPONSE_CLOSE_LISTENER_LIMIT } from "./origin-http-admission";

// G33 T14: production printed `11 close listeners added to [ServerResponse]`
// once per proxy-rewritten request. Next 16.3 attaches 10 `close` listeners to
// the outer response when it HTTP-proxies a proxy.ts rewrite to itself; the
// admission listener made 11.
const NEXT_LOOPBACK_REWRITE_CLOSE_LISTENERS = 10;
const ROUNDS = 25;

let warnings: Error[] = [];
const onWarning = (warning: Error) => { if (warning.name === "MaxListenersExceededWarning") warnings.push(warning); };
beforeEach(() => { warnings = []; process.on("warning", onWarning); });
afterEach(() => { process.off("warning", onWarning); });

async function withAdmittedServer(handler: (res: ServerResponse) => void, run: (origin: string, registry: OriginActivity) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "g33-t14-"));
  const registry = new OriginActivity(join(dir, "registry.json"), { pid: 123, startTicks: "456", releasePath: "/fixture" });
  const restore = installOriginHttpAdmission(registry);
  const server = createServer((_req, res) => handler(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try { await run(`http://127.0.0.1:${port}`, registry); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); restore?.(); rmSync(dir, { recursive: true, force: true }); }
}

function get(url: string, agent: Agent) {
  return new Promise<{ body: string; socket: Socket }>((resolve, reject) => {
    const req = request(url, { agent }, (res) => { let body = ""; res.setEncoding("utf8"); res.on("data", (c) => { body += c; }); res.on("end", () => resolve({ body, socket: req.socket as Socket })); });
    req.on("error", reject); req.end();
  });
}

it(`admission adds one close listener per response and none to the shared socket across ${ROUNDS} keep-alive requests`, async () => {
  const seen: number[] = [];
  const socketCloseCounts: number[] = [];
  await withAdmittedServer((res) => {
    seen.push(res.listenerCount("close"));
    socketCloseCounts.push(res.socket?.listenerCount("close") ?? -1);
    res.end("ok");
  }, async (origin, registry) => {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const sockets = new Set<Socket>();
      for (let i = 0; i < ROUNDS; i++) sockets.add((await get(`${origin}/r${i}`, agent)).socket);
      expect(sockets.size).toBe(1);
      expect(registry.snapshot().activities).toEqual({});
    } finally { agent.destroy(); }
  });
  expect(seen).toEqual(Array(ROUNDS).fill(1));
  expect(new Set(socketCloseCounts).size).toBe(1);
  expect(warnings).toEqual([]);
});

it(`Next's loopback-rewrite fan-out on an admitted response stays under the local ceiling without a warning (${ROUNDS} requests)`, async () => {
  const peaks: number[] = [];
  const ceilings: number[] = [];
  await withAdmittedServer((res) => {
    for (let i = 0; i < NEXT_LOOPBACK_REWRITE_CLOSE_LISTENERS; i++) res.once("close", () => {});
    peaks.push(res.listenerCount("close"));
    ceilings.push(res.getMaxListeners());
    res.end("ok");
  }, async (origin) => {
    for (let i = 0; i < ROUNDS; i++) expect((await fetch(`${origin}/funding/grants?state=NSW&i=${i}`)).status).toBe(200);
  });
  expect(peaks).toEqual(Array(ROUNDS).fill(NEXT_LOOPBACK_REWRITE_CLOSE_LISTENERS + 1));
  expect(ceilings).toEqual(Array(ROUNDS).fill(RESPONSE_CLOSE_LISTENER_LIMIT));
  expect(warnings).toEqual([]);
});
