// SVG → PNG (S-R4): every kind rasterises (when sharp is present), the
// cache is keyed on id + svg hash, and a missing rasteriser degrades to
// `png: null` with the SVG still returned.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_VISUAL_KINDS } from "./index";
import { specForKind } from "./kind-fixtures";
import { __pngCacheSize, __resetPngCache, __resetSharpLoader, pngAvailable, pngCacheKey, svgToPng, visualToPng, visualsToPng } from "./png";

const PNG_MAGIC = "\x89PNG";

beforeEach(() => {
  __resetPngCache();
  __resetSharpLoader();
});
afterEach(() => {
  vi.doUnmock("sharp");
  __resetSharpLoader();
});

describe("visualToPng", () => {
  it("rasterises every kind to a PNG of the requested width (sharp present in this toolchain)", async () => {
    expect(await pngAvailable()).toBe(true);
    for (const kind of ALL_VISUAL_KINDS) {
      const r = await visualToPng(specForKind(kind), { width: 320 });
      expect(r.svg, kind).toContain('role="img"');
      expect(r.png, kind).not.toBeNull();
      expect(r.png!.subarray(0, 4).toString("latin1"), kind).toBe(PNG_MAGIC);
      expect(r.width, kind).toBe(320);
      expect(r.height, kind).toBeGreaterThan(0);
    }
  }, 60_000);

  it("caches by id + svg hash + width and serves the second call from memory", async () => {
    const spec = specForKind("radar");
    const a = await visualToPng(spec, { width: 200 });
    expect(a.cached).toBe(false);
    expect(__pngCacheSize()).toBe(1);
    const b = await visualToPng(spec, { width: 200 });
    expect(b.cached).toBe(true);
    expect(b.png).toBe(a.png);
    const c = await visualToPng({ ...spec, data: { ...spec.data, max: 200 } }, { width: 200 });
    expect(c.cached).toBe(false);
    expect(__pngCacheSize()).toBe(2);
    expect(pngCacheKey("x", "<svg/>", 10)).toMatch(/^x:10:[0-9a-f]{16}$/);
  });

  it("bounded parallel helper keeps order", async () => {
    const specs = ["bar", "gauge", "donut"].map((k) => specForKind(k as never));
    const out = await visualsToPng(specs, { width: 120 }, 2);
    expect(out.map((o) => o.width)).toEqual([120, 120, 120]);
    expect(out.every((o) => o.png)).toBe(true);
  });

  it("degrades to png:null (svg kept) when sharp cannot be imported", async () => {
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    __resetSharpLoader();
    expect(await pngAvailable()).toBe(false);
    const r = await svgToPng('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><rect width="10" height="5"/></svg>');
    expect(r.png).toBeNull();
    expect(r.width).toBe(20);
    expect(r.height).toBe(10);
    const v = await visualToPng(specForKind("funnel"));
    expect(v.png).toBeNull();
    expect(v.svg).toContain("<svg");
  });
});
