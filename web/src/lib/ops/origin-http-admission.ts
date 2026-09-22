import type { Socket } from "node:net";
import { Server, type IncomingMessage, type ServerResponse } from "node:http";
import { installOriginActivity, runAdmittedHttp } from "./origin-activity";

const allowedDuringDrain = new Set(["/api/status", "/api/healthz", "/api/ops/origin-drain"]);
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
