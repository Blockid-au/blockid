// SVG → PNG for the surfaces that cannot draw vector charts (S-R4):
// DOCX (`ImageRun`) and email (inline CID image).
//
// Rasteriser: `sharp` (libvips + librsvg). It is not a direct dependency —
// Next.js pulls it in as an optional dependency for the image optimiser, it
// is on Next's default `serverExternalPackages` list (never bundled by
// webpack) and `deploy-live.sh` ships it in the standalone `node_modules`
// (verified: `.next/standalone/node_modules/sharp` + `@img/*`). It is still
// loaded lazily and every failure degrades to `null`, so a host without the
// native binary produces a DOCX with the SVG embedded directly (Word ≥ 2016
// renders it) and an email without pictures — never a 500.
//
// Cache: in-process LRU keyed on `spec.id` + a hash of the rendered SVG, so
// one report's visuals are rasterised once per process even when the DOCX
// and the email both ask for them (spec §F S-R4 cost guardrail).

import { createHash } from "node:crypto";
import { renderVisual } from "./index";
import type { RenderOpts } from "./render-opts";
import type { VisualSpecV2 } from "./types";

export interface PngOptions {
  /** Rendered pixel width (defaults to 2× the SVG viewBox width, capped at 1600). */
  width?: number;
  /** Override the renderer's viewBox width before rasterising. */
  renderWidth?: number;
  hideBadge?: boolean;
}

export interface PngResult {
  png: Buffer | null;
  svg: string;
  /** Pixel size of the PNG (or the SVG's viewBox size when png is null). */
  width: number;
  height: number;
  cached: boolean;
}

const CACHE_MAX = 256;
const cache = new Map<string, { png: Buffer | null; width: number; height: number }>();

type SharpLike = (input: Buffer, opts?: { density?: number }) => { resize: (o: { width: number }) => { png: () => { toBuffer: () => Promise<Buffer> } }; metadata: () => Promise<{ width?: number; height?: number }> };
let sharpPromise: Promise<SharpLike | null> | null = null;

/** Lazily import sharp once; null when unavailable (no throw, ever). */
export function loadSharp(): Promise<SharpLike | null> {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((m) => ((m as { default?: unknown }).default ?? m) as SharpLike)
      .catch((err: unknown) => {
        if (process.env.NODE_ENV !== "test") console.warn("[report-visuals:png] sharp unavailable — SVG fallback:", err instanceof Error ? err.message : String(err));
        return null;
      });
  }
  return sharpPromise;
}

export async function pngAvailable(): Promise<boolean> {
  return (await loadSharp()) !== null;
}

function svgSize(svg: string): { width: number; height: number } {
  const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (vb) return { width: Number.parseFloat(vb[1]), height: Number.parseFloat(vb[2]) };
  const w = /\swidth="([\d.]+)"/.exec(svg);
  const h = /\sheight="([\d.]+)"/.exec(svg);
  return { width: w ? Number.parseFloat(w[1]) : 320, height: h ? Number.parseFloat(h[1]) : 160 };
}

export function pngCacheKey(id: string, svg: string, width: number): string {
  return `${id}:${width}:${createHash("sha1").update(svg).digest("hex").slice(0, 16)}`;
}

/** Rasterise an SVG string; null when sharp is missing or rejects the input. */
export async function svgToPng(svg: string, opts: { width?: number } = {}): Promise<{ png: Buffer | null; width: number; height: number }> {
  const size = svgSize(svg);
  const width = Math.max(16, Math.min(1600, Math.round(opts.width ?? size.width * 2)));
  const height = Math.max(1, Math.round((width * size.height) / size.width));
  const sharp = await loadSharp();
  if (!sharp) return { png: null, width, height };
  try {
    // density: librsvg lays the SVG out at 72 dpi × (width / viewBox width)
    // so text is rasterised at the target resolution, not upscaled.
    const density = Math.max(36, Math.min(600, Math.round((72 * width) / size.width)));
    const png = await sharp(Buffer.from(svg, "utf8"), { density }).resize({ width }).png().toBuffer();
    return { png, width, height };
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.warn("[report-visuals:png] rasterise failed:", err instanceof Error ? err.message : String(err));
    return { png: null, width, height };
  }
}

/** Render + rasterise one visual through the cache. */
export async function visualToPng(spec: VisualSpecV2, opts: PngOptions = {}): Promise<PngResult> {
  const override: Partial<RenderOpts> = {};
  if (opts.renderWidth) override.width = opts.renderWidth;
  if (opts.hideBadge) override.hideBadge = true;
  const svg = renderVisual(spec, override);
  const size = svgSize(svg);
  const width = Math.max(16, Math.min(1600, Math.round(opts.width ?? size.width * 2)));
  const key = pngCacheKey(spec.id, svg, width);
  const hit = cache.get(key);
  if (hit) {
    // LRU touch.
    cache.delete(key);
    cache.set(key, hit);
    return { ...hit, svg, cached: true };
  }
  const out = await svgToPng(svg, { width });
  cache.set(key, out);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return { ...out, svg, cached: false };
}

/** Rasterise several visuals in parallel (bounded), keeping order. */
export async function visualsToPng(specs: VisualSpecV2[], opts: PngOptions = {}, concurrency = 4): Promise<PngResult[]> {
  const out: PngResult[] = new Array(specs.length);
  let next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const i = next++;
      out[i] = await visualToPng(specs[i], opts);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, specs.length)) }, worker));
  return out;
}

/** Test seams. */
export function __resetPngCache(): void {
  cache.clear();
}
export function __pngCacheSize(): number {
  return cache.size;
}
export function __resetSharpLoader(): void {
  sharpPromise = null;
}
