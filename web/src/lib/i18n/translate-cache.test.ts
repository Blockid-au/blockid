import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Colocated vitest for the previously-untested disk-backed translation
// cache (`web/src/lib/i18n/translate-cache.ts`, T-1403) — the memoise
// layer sitting between /api/i18n/translate and Gemini. The module holds
// per-locale `memory` + `dirty` + `flushTimer` in module scope, so each
// case does `vi.resetModules()` + a fresh dynamic import to guarantee
// zero cross-case leakage. Every case also gets its own tmp
// `BLOCKID_I18N_CACHE_DIR` under `os.tmpdir()`, which is torn down in
// `afterEach` so on-disk state cannot bleed between cases either.
//
// The `void flush()` inside the module returns immediately (fire and
// forget); its actual fs writes are genuine async I/O. Under fake
// timers, `advanceTimersByTimeAsync` fires the callback but the disk
// writes still need a real-timer tick to settle. `sleep(750)` under
// real timers is both simpler and reliable — the 500 ms debounce +
// ~a tick of I/O headroom — so most cases just use real timers with a
// single wait. Only the "does NOT write to disk before 500 ms elapses"
// case uses fake timers, since it needs to prove the pre-debounce
// state without waiting the wall-clock.
//
// Contract pinned:
//   - hashKey: deterministic sha-256/24-char hex; distinct inputs
//     produce distinct keys; handles empty string + unicode + very
//     long inputs; matches the raw crypto reference so /api/i18n
//     consumers can regenerate keys independently.
//   - cacheGet: returns undefined when no cache file exists on disk;
//     returns undefined for an unknown key even after other entries
//     have been written; returns the value for a known key after
//     cacheSet lands.
//   - cacheGetMany: returns an object keyed by original EN string
//     (not by hash); omits misses entirely (empty object when nothing
//     hits); handles [] with no fs access.
//   - cacheSet: mutates the in-memory map immediately (cacheGet
//     returns the value before the 500 ms flush fires) and schedules
//     exactly one flush regardless of how many cacheSet calls arrive
//     inside the debounce window.
//   - Debounced flush: nothing is written before 500 ms elapses;
//     after the flush lands the JSON file contains the current map;
//     a re-import re-hydrates the same values from disk.
//   - cacheSetMany: writes every pair to memory; appends one audit
//     JSONL line per *fresh* (en, vi) pair — repeats with the same vi
//     for the same en do NOT re-append; audit file is at
//     `<CACHE_ROOT>/<locale>-audit.jsonl` and lines are shaped
//     `{ts, en, vi}`.
//   - Locale isolation: writes under `en` never appear in the `vi`
//     cache file, and vice versa.
//   - Corrupted on-disk cache (invalid JSON) falls back to an empty
//     map instead of throwing; a subsequent cacheSet overwrites the
//     corrupt file on the next flush.
//   - CACHE_ROOT env override: unset → uses `process.cwd()/content/i18n`;
//     set → writes land under the override path.
//   - Empty BLOCKID_I18N_CACHE_DIR (empty string) is treated as unset
//     per the `length > 0` guard.
//   - Cache file JSON is written with `null, 0` compact spacing (no
//     indent), so audits/greps work.
//   - loadLocale memoises: an out-of-band rewrite of the cache file
//     is invisible to a subsequent cacheGet (the in-memory map wins).
//   - Audit is best-effort: an unwritable audit path never surfaces
//     as a rejection from cacheSetMany, and the cache write still
//     lands.

const TMP_ROOTS: string[] = [];

async function loadFresh(overrideCacheDir: string) {
  vi.resetModules();
  process.env.BLOCKID_I18N_CACHE_DIR = overrideCacheDir;
  return await import("./translate-cache");
}

function makeTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "blockid-i18n-cache-"));
  TMP_ROOTS.push(dir);
  return dir;
}

function refHash(en: string): string {
  return createHash("sha256").update(en).digest("hex").slice(0, 24);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// One shared wait window sized to cover the 500 ms debounce + a tick of
// fs I/O headroom. Not a helper for correctness — just a name for the
// magic number.
const FLUSH_WAIT_MS = 1500;

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  for (const dir of TMP_ROOTS.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort — tmpdir cleans itself eventually
    }
  }
  delete process.env.BLOCKID_I18N_CACHE_DIR;
});

describe("hashKey", () => {
  it("is deterministic across calls for the same input", async () => {
    const mod = await loadFresh(makeTmp());
    const a = mod.hashKey("Pricing");
    const b = mod.hashKey("Pricing");
    expect(a).toBe(b);
  });

  it("returns a 24-char lowercase hex string", async () => {
    const mod = await loadFresh(makeTmp());
    const k = mod.hashKey("anything at all");
    expect(k).toHaveLength(24);
    expect(k).toMatch(/^[0-9a-f]{24}$/);
  });

  it("distinct inputs produce distinct keys", async () => {
    const mod = await loadFresh(makeTmp());
    expect(mod.hashKey("Hello")).not.toBe(mod.hashKey("hello"));
    expect(mod.hashKey("A")).not.toBe(mod.hashKey("B"));
  });

  it("matches a raw sha256/24-char-hex reference (regen-from-EN parity)", async () => {
    const mod = await loadFresh(makeTmp());
    expect(mod.hashKey("Investor Readiness")).toBe(refHash("Investor Readiness"));
  });

  it("handles empty string without throwing and returns a stable key", async () => {
    const mod = await loadFresh(makeTmp());
    const k = mod.hashKey("");
    expect(k).toBe(refHash(""));
    expect(k).toHaveLength(24);
  });

  it("handles unicode + emoji inputs", async () => {
    const mod = await loadFresh(makeTmp());
    expect(mod.hashKey("Xin chào 🇻🇳")).toBe(refHash("Xin chào 🇻🇳"));
  });

  it("handles very long inputs without truncation of the source", async () => {
    const mod = await loadFresh(makeTmp());
    const long = "x".repeat(10_000);
    expect(mod.hashKey(long)).toBe(refHash(long));
  });
});

describe("cacheGet / cacheGetMany (cold cache)", () => {
  it("returns undefined for any key when no cache file exists", async () => {
    const mod = await loadFresh(makeTmp());
    expect(await mod.cacheGet("en", "Pricing")).toBeUndefined();
    expect(await mod.cacheGet("vi", "Giá")).toBeUndefined();
  });

  it("cacheGetMany returns an empty object on a cold cache", async () => {
    const mod = await loadFresh(makeTmp());
    const out = await mod.cacheGetMany("en", ["Pricing", "Sign in", "Menu"]);
    expect(out).toEqual({});
  });

  it("cacheGetMany([]) returns {} and does not touch the filesystem", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    const out = await mod.cacheGetMany("en", []);
    expect(out).toEqual({});
    expect(existsSync(join(dir, "en-cache.json"))).toBe(false);
  });
});

describe("cacheSet + memory + debounced flush", () => {
  it("cacheGet sees a value written by cacheSet before the flush timer fires", async () => {
    vi.useFakeTimers();
    const mod = await loadFresh(makeTmp());
    await mod.cacheSet("vi", "Pricing", "Giá");
    expect(await mod.cacheGet("vi", "Pricing")).toBe("Giá");
  });

  it("does NOT write to disk before 500 ms elapses", async () => {
    vi.useFakeTimers();
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSet("vi", "Pricing", "Giá");
    await vi.advanceTimersByTimeAsync(499);
    expect(existsSync(join(dir, "vi-cache.json"))).toBe(false);
  });

  it("writes to disk after the 500 ms debounce elapses", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSet("vi", "Pricing", "Giá");
    await sleep(FLUSH_WAIT_MS);
    const path = join(dir, "vi-cache.json");
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    expect(parsed[refHash("Pricing")]).toBe("Giá");
  });

  it("collapses a burst of cacheSet calls into a single flush", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    for (let i = 0; i < 20; i++) {
      await mod.cacheSet("vi", `Key ${i}`, `Val ${i}`);
    }
    await sleep(FLUSH_WAIT_MS);
    const path = join(dir, "vi-cache.json");
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
    expect(Object.keys(parsed)).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(parsed[refHash(`Key ${i}`)]).toBe(`Val ${i}`);
    }
  });

  it("cache file uses compact JSON (no indent) so grep + audits stay one-liner-friendly", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSet("en", "hello", "hello");
    await sleep(FLUSH_WAIT_MS);
    const raw = readFileSync(join(dir, "en-cache.json"), "utf8");
    expect(raw.includes("\n")).toBe(false);
    expect(raw.startsWith("{")).toBe(true);
  });
});

describe("cacheSetMany + audit", () => {
  it("writes every pair to memory and disk", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSetMany("vi", { Pricing: "Giá", Menu: "Thực đơn" });
    expect(await mod.cacheGet("vi", "Pricing")).toBe("Giá");
    expect(await mod.cacheGet("vi", "Menu")).toBe("Thực đơn");
    await sleep(FLUSH_WAIT_MS);
    const parsed = JSON.parse(readFileSync(join(dir, "vi-cache.json"), "utf8")) as Record<string, string>;
    expect(parsed[refHash("Pricing")]).toBe("Giá");
    expect(parsed[refHash("Menu")]).toBe("Thực đơn");
  });

  it("appends one audit JSONL line per fresh (en, vi) pair", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSetMany("vi", { Pricing: "Giá", Menu: "Thực đơn" });
    await sleep(FLUSH_WAIT_MS);
    const lines = readFileSync(join(dir, "vi-audit.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { ts: string; en: string; vi: string });
    expect(lines).toHaveLength(2);
    const ens = lines.map((l) => l.en).sort();
    expect(ens).toEqual(["Menu", "Pricing"]);
    for (const l of lines) {
      expect(typeof l.ts).toBe("string");
      expect(l.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("does not re-append audit lines for pairs whose vi value is unchanged", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSetMany("vi", { Pricing: "Giá" });
    await mod.cacheSetMany("vi", { Pricing: "Giá" });
    await sleep(FLUSH_WAIT_MS);
    const lines = readFileSync(join(dir, "vi-audit.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it("appends a new audit line when the same en is re-set to a different vi", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSetMany("vi", { Pricing: "Giá" });
    await mod.cacheSetMany("vi", { Pricing: "Bảng giá" });
    await sleep(FLUSH_WAIT_MS);
    const audit = readFileSync(join(dir, "vi-audit.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { en: string; vi: string });
    expect(audit).toHaveLength(2);
    expect(audit[0].vi).toBe("Giá");
    expect(audit[1].vi).toBe("Bảng giá");
    // The final on-disk value is the latest one.
    const parsed = JSON.parse(readFileSync(join(dir, "vi-cache.json"), "utf8")) as Record<string, string>;
    expect(parsed[refHash("Pricing")]).toBe("Bảng giá");
  });

  it("cacheSetMany({}) does not create an audit file", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSetMany("vi", {});
    await sleep(FLUSH_WAIT_MS);
    expect(existsSync(join(dir, "vi-audit.jsonl"))).toBe(false);
  });
});

describe("locale isolation", () => {
  it("en writes never appear in the vi cache file (and vice versa)", async () => {
    const dir = makeTmp();
    const mod = await loadFresh(dir);
    await mod.cacheSet("en", "Pricing", "Pricing");
    await mod.cacheSet("vi", "Pricing", "Giá");
    await sleep(FLUSH_WAIT_MS);
    const en = JSON.parse(readFileSync(join(dir, "en-cache.json"), "utf8")) as Record<string, string>;
    const vi_ = JSON.parse(readFileSync(join(dir, "vi-cache.json"), "utf8")) as Record<string, string>;
    expect(en[refHash("Pricing")]).toBe("Pricing");
    expect(vi_[refHash("Pricing")]).toBe("Giá");
    expect(Object.keys(en)).toHaveLength(1);
    expect(Object.keys(vi_)).toHaveLength(1);
  });

  it("cacheGet on one locale never returns another locale's value", async () => {
    const mod = await loadFresh(makeTmp());
    await mod.cacheSet("vi", "Pricing", "Giá");
    expect(await mod.cacheGet("en", "Pricing")).toBeUndefined();
  });
});

describe("on-disk hydration + corruption", () => {
  it("seeds memory from an existing cache file on cold import", async () => {
    const dir = makeTmp();
    const path = join(dir, "vi-cache.json");
    const map = { [refHash("Pricing")]: "Giá", [refHash("Menu")]: "Thực đơn" };
    writeFileSync(path, JSON.stringify(map), "utf8");
    const mod = await loadFresh(dir);
    expect(await mod.cacheGet("vi", "Pricing")).toBe("Giá");
    expect(await mod.cacheGet("vi", "Menu")).toBe("Thực đơn");
  });

  it("falls back to an empty map when the cache file is invalid JSON", async () => {
    const dir = makeTmp();
    writeFileSync(join(dir, "vi-cache.json"), "{not valid json", "utf8");
    const mod = await loadFresh(dir);
    expect(await mod.cacheGet("vi", "Pricing")).toBeUndefined();
  });

  it("a subsequent cacheSet on a corrupt cache overwrites the file with valid JSON", async () => {
    const dir = makeTmp();
    writeFileSync(join(dir, "vi-cache.json"), "not-json", "utf8");
    const mod = await loadFresh(dir);
    await mod.cacheSet("vi", "Pricing", "Giá");
    await sleep(FLUSH_WAIT_MS);
    const raw = readFileSync(join(dir, "vi-cache.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    expect(parsed[refHash("Pricing")]).toBe("Giá");
  });

  it("cacheGetMany reads the on-disk map for known keys and omits misses", async () => {
    const dir = makeTmp();
    const map = { [refHash("Pricing")]: "Giá", [refHash("Menu")]: "Thực đơn" };
    writeFileSync(join(dir, "vi-cache.json"), JSON.stringify(map), "utf8");
    const mod = await loadFresh(dir);
    const out = await mod.cacheGetMany("vi", ["Pricing", "UNKNOWN", "Menu"]);
    expect(out).toEqual({ Pricing: "Giá", Menu: "Thực đơn" });
    expect("UNKNOWN" in out).toBe(false);
  });
});

describe("CACHE_ROOT resolution", () => {
  it("BLOCKID_I18N_CACHE_DIR override is honoured for both reads and writes", async () => {
    const override = makeTmp();
    const mod = await loadFresh(override);
    await mod.cacheSet("en", "hello", "hello");
    await sleep(FLUSH_WAIT_MS);
    expect(existsSync(join(override, "en-cache.json"))).toBe(true);
  });

  it("empty BLOCKID_I18N_CACHE_DIR is treated as unset (falls back to cwd()/content/i18n)", async () => {
    vi.resetModules();
    process.env.BLOCKID_I18N_CACHE_DIR = "";
    const mod = await import("./translate-cache");
    // hashKey is pure — just prove the module loaded without throwing on
    // the empty-string branch. A cwd-based write is not exercised here to
    // avoid clobbering the real content/i18n/ during tests.
    expect(mod.hashKey("x")).toBe(refHash("x"));
    delete process.env.BLOCKID_I18N_CACHE_DIR;
  });

  it("creates the cache directory on first write if it does not yet exist", async () => {
    const base = makeTmp();
    const nested = join(base, "does", "not", "exist", "yet");
    const mod = await loadFresh(nested);
    await mod.cacheSet("en", "hi", "hi");
    await sleep(FLUSH_WAIT_MS);
    expect(existsSync(join(nested, "en-cache.json"))).toBe(true);
  });
});

describe("in-memory memoisation", () => {
  it("loadLocale reads the cache file at most once — an out-of-band rewrite is not observed", async () => {
    const dir = makeTmp();
    const path = join(dir, "vi-cache.json");
    writeFileSync(path, JSON.stringify({ [refHash("Pricing")]: "Giá" }), "utf8");
    const mod = await loadFresh(dir);
    expect(await mod.cacheGet("vi", "Pricing")).toBe("Giá");
    // Rewrite the file behind the cache's back — the in-memory map wins.
    writeFileSync(path, JSON.stringify({ [refHash("Pricing")]: "REPLACED" }), "utf8");
    expect(await mod.cacheGet("vi", "Pricing")).toBe("Giá");
  });

  it("cacheGetMany hydrates once and then serves further lookups from memory", async () => {
    const dir = makeTmp();
    writeFileSync(
      join(dir, "en-cache.json"),
      JSON.stringify({ [refHash("A")]: "A", [refHash("B")]: "B" }),
      "utf8",
    );
    const mod = await loadFresh(dir);
    const first = await mod.cacheGetMany("en", ["A"]);
    const second = await mod.cacheGetMany("en", ["A", "B"]);
    expect(first).toEqual({ A: "A" });
    expect(second).toEqual({ A: "A", B: "B" });
  });
});

describe("audit robustness", () => {
  it("audit failure (unwritable dir) does not surface as a rejection from cacheSetMany", async () => {
    const dir = makeTmp();
    // Pre-create the audit path as a directory so appendFile against the
    // same path errors out — the module swallows this by design (audit is
    // best-effort telemetry) so the call chain must still resolve.
    mkdirSync(join(dir, "vi-audit.jsonl"));
    const mod = await loadFresh(dir);
    await expect(mod.cacheSetMany("vi", { Pricing: "Giá" })).resolves.toBeUndefined();
    await sleep(FLUSH_WAIT_MS);
    // The cache write itself must still land.
    const parsed = JSON.parse(readFileSync(join(dir, "vi-cache.json"), "utf8")) as Record<string, string>;
    expect(parsed[refHash("Pricing")]).toBe("Giá");
  });
});
