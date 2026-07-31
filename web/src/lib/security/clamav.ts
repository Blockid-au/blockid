/**
 * ClamAV INSTREAM client for the /api/upload malware gate.
 *
 * Talks to `clamd` directly via its INSTREAM protocol on a raw net socket.
 * We deliberately do NOT shell out to `clamdscan` per request — that fork is
 * measurable and would run under Node's worker context every time. INSTREAM
 * over a persistent-friendly socket keeps the scan in-process on the daemon.
 *
 * Transport is selected by env at import time:
 *   - CLAMAV_SOCKET_PATH  → Unix socket (Debian default: /var/run/clamav/clamd.ctl)
 *   - CLAMAV_HOST + CLAMAV_PORT → TCP (typically 127.0.0.1:3310)
 * If neither is set, `scanBuffer` fails-CLOSED with `scanner_error` on every
 * call. We do NOT throw at import — a hard startup crash would take the
 * whole app offline just because clamd is unreachable, whereas a fail-CLOSED
 * scanner_error rejects uploads with a 503 and preserves everything else.
 *
 * INSTREAM wire format (per clamd(8)):
 *   1. `zINSTREAM\0` command
 *   2. Repeated chunks of `<uint32-be length><chunk bytes>`
 *   3. Terminator chunk of length 0 (four zero bytes)
 *   4. Reply is null-terminated ASCII, either
 *        "stream: OK\0"                    → clean
 *        "stream: <signature> FOUND\0"     → infected
 *        "INSTREAM size limit exceeded..."→ oversize
 *        "... ERROR\0"                     → scanner error
 *
 * Fail-CLOSED policy: on timeout, socket error, unreachable scanner, or any
 * unrecognised reply we return { ok: false, verdict: "scanner_error" }.
 * Never fail-open — a signed-in attacker running out the timeout budget must
 * not get their payload through.
 */

import net from "node:net";

export interface ScanBufferOpts {
  /** Milliseconds before the scan is aborted and returned as scanner_error. */
  timeoutMs?: number;
  /**
   * Max bytes per INSTREAM chunk. Must be <= clamd's StreamMaxLength
   * (default 25 MiB on Debian). 64 KiB is small enough to stream a 50 MiB
   * upload without a giant single allocation.
   */
  chunkSize?: number;
}

export type ScanResult =
  | { ok: true; signature?: undefined; message?: undefined }
  | {
      ok: false;
      verdict: "infected" | "scanner_error";
      signature?: string;
      message?: string;
    };

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CHUNK_SIZE = 64 * 1024;

interface Transport {
  kind: "unix" | "tcp";
  path?: string;
  host?: string;
  port?: number;
}

/**
 * Resolves transport from env at CALL time (not module load) so tests can
 * point CLAMAV_HOST/CLAMAV_PORT at a mock server via `beforeEach`.
 */
function resolveTransport(): Transport | null {
  const sock = process.env.CLAMAV_SOCKET_PATH;
  if (sock) return { kind: "unix", path: sock };
  const host = process.env.CLAMAV_HOST;
  const port = process.env.CLAMAV_PORT;
  if (host && port) {
    const n = Number(port);
    if (!Number.isInteger(n) || n <= 0 || n > 65535) return null;
    return { kind: "tcp", host, port: n };
  }
  return null;
}

function connect(t: Transport): net.Socket {
  if (t.kind === "unix") return net.createConnection(t.path!);
  return net.createConnection({ host: t.host!, port: t.port! });
}

/**
 * Scan a buffer against clamd. See file header for wire format + policy.
 */
export function scanBuffer(
  buf: Buffer,
  opts: ScanBufferOpts = {},
): Promise<ScanResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;

  const transport = resolveTransport();
  if (!transport) {
    return Promise.resolve({
      ok: false,
      verdict: "scanner_error",
      message:
        "clamav transport not configured (set CLAMAV_SOCKET_PATH or CLAMAV_HOST+CLAMAV_PORT)",
    });
  }

  return new Promise<ScanResult>((resolve) => {
    let socket: net.Socket;
    try {
      socket = connect(transport);
    } catch (err) {
      resolve({
        ok: false,
        verdict: "scanner_error",
        message: (err as Error).message,
      });
      return;
    }

    let settled = false;
    const settle = (r: ScanResult): void => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* already destroyed */
      }
      clearTimeout(timer);
      resolve(r);
    };

    const timer = setTimeout(() => {
      // Fail-CLOSED. Never fail-open on timeout.
      settle({
        ok: false,
        verdict: "scanner_error",
        message: `clamd scan timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    const chunks: Buffer[] = [];
    socket.on("data", (d) => chunks.push(d));

    socket.on("error", (err) => {
      settle({
        ok: false,
        verdict: "scanner_error",
        message: `clamd socket error: ${err.message}`,
      });
    });

    socket.on("end", () => {
      const reply = Buffer.concat(chunks).toString("utf8").replace(/\0$/, "").trim();
      settle(parseReply(reply));
    });

    // Some transports drop `end` and emit only `close`.
    socket.on("close", () => {
      if (settled) return;
      const reply = Buffer.concat(chunks).toString("utf8").replace(/\0$/, "").trim();
      if (reply.length > 0) settle(parseReply(reply));
      else
        settle({
          ok: false,
          verdict: "scanner_error",
          message: "clamd closed connection without a reply",
        });
    });

    socket.on("connect", () => {
      try {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < buf.length; offset += chunkSize) {
          const end = Math.min(offset + chunkSize, buf.length);
          const slice = buf.subarray(offset, end);
          const header = Buffer.alloc(4);
          header.writeUInt32BE(slice.length, 0);
          socket.write(header);
          socket.write(slice);
        }
        // Terminator: 4 zero bytes.
        socket.write(Buffer.from([0, 0, 0, 0]));
      } catch (err) {
        settle({
          ok: false,
          verdict: "scanner_error",
          message: `clamd write failed: ${(err as Error).message}`,
        });
      }
    });
  });
}

/**
 * Parses a clamd INSTREAM reply. Kept exportable for the colocated tests.
 *
 *   "stream: OK"                                → clean
 *   "stream: Eicar-Test-Signature FOUND"        → infected, signature=…
 *   "INSTREAM size limit exceeded. ERROR"       → scanner_error (oversize)
 *   "<anything> ERROR"                          → scanner_error
 *   anything else                               → scanner_error (fail-CLOSED)
 */
export function parseReply(raw: string): ScanResult {
  const reply = raw.replace(/\0/g, "").trim();
  if (reply.length === 0) {
    return {
      ok: false,
      verdict: "scanner_error",
      message: "empty clamd reply",
    };
  }
  if (/\bOK$/.test(reply)) return { ok: true };
  const found = reply.match(/^stream:\s+(.+?)\s+FOUND$/);
  if (found) return { ok: false, verdict: "infected", signature: found[1] };
  if (/ERROR$/.test(reply)) {
    return { ok: false, verdict: "scanner_error", message: reply };
  }
  return {
    ok: false,
    verdict: "scanner_error",
    message: `unrecognised clamd reply: ${reply}`,
  };
}

/**
 * Cheap version probe. Best-effort — returns "unknown" on any failure so a
 * dead clamd never crashes the audit-row write path (the upload handler has
 * already decided the outcome by the time this is called).
 */
export async function getScannerVersion(): Promise<string> {
  const transport = resolveTransport();
  if (!transport) return "unknown";
  return await new Promise<string>((resolve) => {
    let socket: net.Socket;
    try {
      socket = connect(transport);
    } catch {
      resolve("unknown");
      return;
    }
    let out = "";
    const done = (v: string): void => {
      try {
        socket.destroy();
      } catch {
        /* noop */
      }
      resolve(v);
    };
    const t = setTimeout(() => done("unknown"), 2_000);
    socket.on("connect", () => socket.write("zVERSION\0"));
    socket.on("data", (d) => {
      out += d.toString("utf8");
    });
    socket.on("error", () => {
      clearTimeout(t);
      done("unknown");
    });
    socket.on("close", () => {
      clearTimeout(t);
      done(out.replace(/\0/g, "").trim() || "unknown");
    });
  });
}
