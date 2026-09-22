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
    if (event !== "request") return original.call(this, event, ...args);
    const request = args[0] as IncomingMessage;
    const response = args[1] as ServerResponse;
    const pathname = (request.url ?? "").split("?")[0];
    if (allowedDuringDrain.has(pathname)) return runAdmittedHttp(() => original.call(this, event, ...args));
    let done: () => void;
    try { done = registry.admit("http"); }
    catch { response.writeHead(503, { "Retry-After": "5", "Cache-Control": "no-store" }); response.end("Origin is draining. Please retry."); return true; }
    const finish = () => { try { done(); } catch { /* Registry keeps a failed-persistence verdict. */ } };
    response.once("finish", finish); response.once("close", finish);
    try { return runAdmittedHttp(() => original.call(this, event, ...args)); }
    catch (error) { finish(); throw error; }
  };
  installed = true;
  return () => { Server.prototype.emit = original; installed = false; };
}
