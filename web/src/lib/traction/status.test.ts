// G14-S33 — /api/status `traction` reducer + file reader.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRACTION_MAX_AGE_MS, isTractionFresh, readTractionStatus, tractionStatusFrom } from "./status";

const NOW = Date.parse("2026-09-16T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("tractionStatusFrom (pure)", () => {
  it("missing for null / non-object / no generated_at / garbage ts", () => {
    expect(tractionStatusFrom(null, NOW)).toBe("missing");
    expect(tractionStatusFrom({}, NOW)).toBe("missing");
    expect(tractionStatusFrom({ generated_at: "not a date" }, NOW)).toBe("missing");
    expect(tractionStatusFrom({ generated_at: 42 }, NOW)).toBe("missing");
  });

  it("ok under 26 h, stale at/after 26 h", () => {
    expect(tractionStatusFrom({ generated_at: ago(1_000) }, NOW)).toBe("ok");
    expect(tractionStatusFrom({ generated_at: ago(25 * 3600e3) }, NOW)).toBe("ok");
    expect(tractionStatusFrom({ generated_at: ago(TRACTION_MAX_AGE_MS) }, NOW)).toBe("stale");
    expect(tractionStatusFrom({ generated_at: ago(3 * 24 * 3600e3) }, NOW)).toBe("stale");
    expect(isTractionFresh({ generated_at: ago(1_000) }, NOW)).toBe(true);
    expect(isTractionFresh({ generated_at: ago(27 * 3600e3) }, NOW)).toBe(false);
  });
});

describe("readTractionStatus (file)", () => {
  it("missing when the file is absent, unreadable JSON, or an array", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "traction-"));
    expect(await readTractionStatus(root, NOW)).toBe("missing");
    mkdirSync(path.join(root, "content", "reports"), { recursive: true });
    writeFileSync(path.join(root, "content", "reports", "traction-snapshot.json"), "{ nope");
    expect(await readTractionStatus(root, NOW)).toBe("missing");
    writeFileSync(path.join(root, "content", "reports", "traction-snapshot.json"), "[]");
    expect(await readTractionStatus(root, NOW)).toBe("missing");
  });

  it("ok / stale from the persisted generated_at", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "traction-"));
    const file = path.join(root, "content", "reports", "traction-snapshot.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ generated_at: ago(3600e3) }));
    expect(await readTractionStatus(root, NOW)).toBe("ok");
    writeFileSync(file, JSON.stringify({ generated_at: ago(30 * 3600e3) }));
    expect(await readTractionStatus(root, NOW)).toBe("stale");
  });
});
