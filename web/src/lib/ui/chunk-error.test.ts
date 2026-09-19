import { describe, expect, it } from "vitest";
import { isChunkLoadError, shouldReloadForStaleChunk, RELOAD_GUARD_PREFIX } from "./chunk-error";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

describe("isChunkLoadError", () => {
  it("recognises webpack and dynamic-import stale-chunk failures", () => {
    const e = new Error("Loading chunk 75740 failed.\n(error: https://blockid.au/_next/static/chunks/75740-fd8c66e6eab367a3.js)");
    e.name = "ChunkLoadError";
    expect(isChunkLoadError(e)).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://blockid.au/_next/static/chunks/app/(marketing)/funding/page-0126cafb2faf5bed.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 123 failed"))).toBe(true);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
  });

  it("ignores ordinary errors and empty input", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("fetch failed"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("shouldReloadForStaleChunk", () => {
  const chunkErr = Object.assign(new Error("Loading chunk 1 failed"), { name: "ChunkLoadError" });

  it("reloads once per pathname, then refuses (loop guard)", () => {
    const s = memStore();
    expect(shouldReloadForStaleChunk(chunkErr, "/funding", s)).toBe(true);
    expect(s.map.has(RELOAD_GUARD_PREFIX + "/funding")).toBe(true);
    expect(shouldReloadForStaleChunk(chunkErr, "/funding", s)).toBe(false);
    expect(shouldReloadForStaleChunk(chunkErr, "/pricing", s)).toBe(true);
  });

  it("never reloads for a non-chunk error", () => {
    const s = memStore();
    expect(shouldReloadForStaleChunk(new Error("boom"), "/funding", s)).toBe(false);
    expect(s.map.size).toBe(0);
  });

  it("reloads once when storage is unavailable (private mode) rather than showing the red screen", () => {
    expect(shouldReloadForStaleChunk(chunkErr, "/funding", null)).toBe(true);
  });
});
