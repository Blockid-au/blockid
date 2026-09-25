import type { Socket } from "node:net";
import { Server, type IncomingMessage, type ServerResponse } from "node:http";
import { installOriginActivity, runAdmittedHttp } from "./origin-activity";

const allowedDuringDrain = new Set(["/api/status", "/api/healthz", "/api/ops/origin-drain"]);
/** Per-response `close` listener ceiling (G33 T14). A proxy rewrite (e.g.
 * `/funding/grants?state=NSW`, `/tbr/demo?band=A`, tenant subdomains) can
 * never be an in-process rewrite while the origin listens on HOSTNAME=127.0.0.1:
 * Next rewrites the loopback host to `localhost`, the origin check then misses
 * and Next HTTP-proxies the request to itself. On that path Next 16.3 attaches
 * 10 `close` listeners to the outer response (compression, 2 abort signals,
 * httpxy x2, proxy-request x3, pipe); the admission listener below is the 11th
 * and Node printed MaxListenersExceededWarning once per rewritten request.
 * The count is fixed per request and every listener goes with the response
 * (a ServerResponse is never reused), so the ceiling is raised on this one
 * emitter only. It stays finite so a real per-event leak still warns.
 */
export const RESPONSE_CLOSE_LISTENER_LIMIT = 16;
let installed = false;
/** Installed by Next's node instrumentation before readiness. Response close
 * ends HTTP transport tracking only; report/provider scopes remain separate.
 */
export function installOriginHttpAdmission(registry = installOriginActivity()) {
  if (installed) return;
  const original = Server.prototype.emit;
  Server.prototype.emit = function (event: string | symbol, ...args: unknown[]) {
    if (event === "upgrade" || event === "connect") {
      const socket = args[1] as Socket;
      let done: () => void;
      try { done = registry.admit(event === "upgrade" ? "http_upgrade" : "http_connect"); }
      catch { socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); return true; }
      socket.once("close", () => { try { done(); } catch { /* Unreliable registry never approves drain. */ } });
      // Transport lifetime is the socket, not the upgrade handshake/header.
      return runAdmittedHttp(() => Reflect.apply(original, this, [event, ...args]));
    }
    if (event !== "request") return Reflect.apply(original, this, [event, ...args]);
    const request = args[0] as IncomingMessage;
    const response = args[1] as ServerResponse;
    if (response.getMaxListeners() < RESPONSE_CLOSE_LISTENER_LIMIT) response.setMaxListeners(RESPONSE_CLOSE_LISTENER_LIMIT);
    const pathname = (request.url ?? "").split("?")[0];
    if (allowedDuringDrain.has(pathname)) return runAdmittedHttp(() => Reflect.apply(original, this, [event, ...args]));
    let done: () => void;
    try { done = registry.admit("http"); }
    catch { response.writeHead(503, { "Retry-After": "5", "Cache-Control": "no-store" }); response.end("Origin is draining. Please retry."); return true; }
    const finish = () => { try { done(); } catch { /* Registry keeps a failed-persistence verdict. */ } };
    response.once("finish", finish); response.once("close", finish);
    try { return runAdmittedHttp(() => Reflect.apply(original, this, [event, ...args])); }
    catch (error) { finish(); throw error; }
  };
  installed = true;
  return () => { Server.prototype.emit = original; installed = false; };
}
