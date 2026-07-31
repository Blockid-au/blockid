/**
 * Colocated tests for the ClamAV INSTREAM client.
 *
 * Hermetic. We spin a local `net.createServer` that speaks a minimal INSTREAM
 * subset (reads the `zINSTREAM\0` command, drains chunks until the 4-byte
 * zero terminator, then writes a scripted reply). The real clamd is NEVER
 * touched — it would flake in any environment without ClamAV installed, and
 * the CI matrix must stay green whether or not the daemon exists.
 *
 * What we prove here:
 *   - clean stream    → { ok: true }
 *   - EICAR-shaped    → verdict "infected" + signature parsed
 *   - "ERROR" reply   → verdict "scanner_error"
 *   - refused socket  → verdict "scanner_error"  (fail-CLOSED)
 *   - timeout         → verdict "scanner_error"  (fail-CLOSED, not fail-open)
 *   - reply parsing   → the standalone parseReply covers the odd shapes
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import net from "node:net";
import { promisify } from "node:util";

import { getScannerVersion, parseReply, scanBuffer } from "./clamav";

interface MockServer {
  port: number;
  close: () => Promise<void>;
  /** Bodies drained per connection, for assertions on what we sent. */
  received: Buffer[];
}

/**
 * Bare-bones INSTREAM server. `reply` is written after we see the terminator.
 * If `reply` is null the server just accepts + closes without answering (used
 * to prove the client fails CLOSED on missing replies).
 */
function startMock(reply: string | null): Promise<MockServer> {
  return new Promise((resolveStart) => {
    const received: Buffer[] = [];
    const srv = net.createServer((sock) => {
      const buf: Buffer[] = [];
      sock.on("data", (d) => {
        buf.push(d);
        const all = Buffer.concat(buf);
        // Look for the 4-zero terminator that marks end-of-stream.
        // We only reply once, and only after the client has finished sending.
        if (all.length >= 4) {
          const tail = all.subarray(all.length - 4);
          if (tail.equals(Buffer.from([0, 0, 0, 0]))) {
            received.push(all);
            if (reply !== null) sock.end(reply + "\0");
            else sock.end();
          }
        }
      });
    });
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "string" || addr === null) throw new Error("bad addr");
      resolveStart({
        port: addr.port,
        received,
        close: promisify(srv.close.bind(srv)) as () => Promise<void>,
      });
    });
  });
}

/** A server that reads but never replies — used to force a client timeout. */
function startBlackhole(): Promise<MockServer> {
  return new Promise((resolveStart) => {
    const received: Buffer[] = [];
    const srv = net.createServer((sock) => {
      sock.on("data", (d) => received.push(d));
      // Never write, never close. Client must give up.
    });
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "string" || addr === null) throw new Error("bad addr");
      resolveStart({
        port: addr.port,
        received,
        close: promisify(srv.close.bind(srv)) as () => Promise<void>,
      });
    });
  });
}

describe("scanBuffer — hermetic INSTREAM mock", () => {
  const savedEnv = { ...process.env };
  let mock: MockServer | null = null;

  beforeEach(() => {
    delete process.env.CLAMAV_SOCKET_PATH;
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
  });

  afterEach(async () => {
    if (mock) {
      await mock.close();
      mock = null;
    }
    process.env = { ...savedEnv };
  });

  it("returns { ok: true } for a clean stream", async () => {
    mock = await startMock("stream: OK");
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(mock.port);

    const result = await scanBuffer(Buffer.from("hello world"));
    expect(result).toEqual({ ok: true });
  });

  it("returns verdict=infected with the signature when clamd says FOUND", async () => {
    mock = await startMock("stream: Eicar-Test-Signature FOUND");
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(mock.port);

    const result = await scanBuffer(Buffer.from("payload"));
    expect(result).toEqual({
      ok: false,
      verdict: "infected",
      signature: "Eicar-Test-Signature",
    });
  });

  it("treats an INSTREAM size-limit ERROR as scanner_error (never fail-open)", async () => {
    mock = await startMock("INSTREAM size limit exceeded. ERROR");
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(mock.port);

    const result = await scanBuffer(Buffer.from("payload"));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.verdict).toBe("scanner_error");
    expect(result.message).toMatch(/ERROR/);
  });

  it("returns scanner_error when the scanner is unreachable (fail-CLOSED)", async () => {
    // Bind then immediately close, so the port is guaranteed refused.
    const tmp = await startMock("stream: OK");
    const refusedPort = tmp.port;
    await tmp.close();

    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(refusedPort);

    const result = await scanBuffer(Buffer.from("payload"), { timeoutMs: 2_000 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.verdict).toBe("scanner_error");
  });

  it("fail-CLOSED on timeout: never returns { ok: true } when scanner hangs", async () => {
    mock = await startBlackhole();
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(mock.port);

    const result = await scanBuffer(Buffer.from("payload"), { timeoutMs: 150 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.verdict).toBe("scanner_error");
    expect(result.message).toMatch(/timed out/);
  });

  it("returns scanner_error when neither env transport is configured", async () => {
    // No env set — resolveTransport must return null and we fail-CLOSED.
    const result = await scanBuffer(Buffer.from("payload"));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.verdict).toBe("scanner_error");
    expect(result.message).toMatch(/not configured/);
  });

  it("writes zINSTREAM + chunked body + zero terminator to the daemon", async () => {
    mock = await startMock("stream: OK");
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(mock.port);

    await scanBuffer(Buffer.from("abc"), { chunkSize: 2 });

    const wire = Buffer.concat(mock.received);
    // The command prefix is present.
    expect(wire.subarray(0, 10).toString("utf8")).toBe("zINSTREAM\0");
    // The final four bytes are the zero terminator.
    const tail = wire.subarray(wire.length - 4);
    expect(tail.equals(Buffer.from([0, 0, 0, 0]))).toBe(true);
  });
});

describe("parseReply", () => {
  it("maps 'stream: OK' to ok:true", () => {
    expect(parseReply("stream: OK")).toEqual({ ok: true });
  });

  it("extracts the signature from a FOUND reply", () => {
    expect(parseReply("stream: Win.Test.EICAR_HDB-1 FOUND")).toEqual({
      ok: false,
      verdict: "infected",
      signature: "Win.Test.EICAR_HDB-1",
    });
  });

  it("classifies ERROR replies as scanner_error", () => {
    const r = parseReply("INSTREAM size limit exceeded. ERROR");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.verdict).toBe("scanner_error");
  });

  it("fails CLOSED on an empty reply", () => {
    const r = parseReply("");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.verdict).toBe("scanner_error");
  });

  it("fails CLOSED on an unrecognised reply (never fail-open)", () => {
    const r = parseReply("something unexpected");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.verdict).toBe("scanner_error");
  });
});

describe("getScannerVersion", () => {
  it("returns 'unknown' when no transport is configured", async () => {
    delete process.env.CLAMAV_SOCKET_PATH;
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    await expect(getScannerVersion()).resolves.toBe("unknown");
  });
});
