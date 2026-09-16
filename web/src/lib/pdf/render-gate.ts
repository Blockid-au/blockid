// In-process render gate for CPU-heavy exports (G13-W5-R5 / S-R5, W4-review
// follow-up (a) on /api/svi/report/pdf).
//
// The token PDF route is unauthenticated and a full react-pdf render costs
// 4–6 s of CPU; two clicks on a share link used to mean two renders, and a
// crawler could pin the Node process. Two small primitives, one per
// process (the server is one `node server.js`):
//
//   RenderCache  bounded LRU with a TTL — key on what changes the output
//                (`(snapshotId, sha1(report) || created_at)`), value the
//                rendered buffer + headers. A hit is a memcpy.
//   Semaphore    N slots, non-blocking `tryAcquire()`. When saturated the
//                route answers 503 + Retry-After instead of queueing renders
//                behind each other (the cache absorbs the retry).
//
// Pure, no I/O — `hashReport` is the only helper touching node:crypto.

import { createHash } from "node:crypto";

export interface RenderCacheOptions {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
}

export class RenderCache<V> {
  private readonly map = new Map<string, { value: V; at: number }>();
  private readonly now: () => number;
  constructor(private readonly opts: RenderCacheOptions) {
    this.now = opts.now ?? (() => Date.now());
  }
  get(key: string): V | null {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (this.now() - hit.at > this.opts.ttlMs) {
      this.map.delete(key);
      return null;
    }
    // LRU touch: re-insert so the entry becomes the newest.
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, at: this.now() });
    while (this.map.size > this.opts.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  get size(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
}

export class Semaphore {
  private inUse = 0;
  constructor(readonly slots: number) {}
  /** Non-blocking: a release function when a slot is free, null when saturated. */
  tryAcquire(): (() => void) | null {
    if (this.inUse >= this.slots) return null;
    this.inUse += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inUse = Math.max(0, this.inUse - 1);
    };
  }
  get active(): number {
    return this.inUse;
  }
}

/** sha1 of a JSON-serialisable document (the report) — the cache key ingredient. */
export function hashReport(doc: unknown): string {
  return createHash("sha1").update(JSON.stringify(doc) ?? "").digest("hex");
}

/** `(snapshotId, sha1(report) || created_at)` → cache key. */
export function pdfCacheKey(snapshotId: string, report: unknown, createdAt?: string | null): string {
  let h: string;
  try {
    h = hashReport(report);
  } catch {
    h = createdAt ?? "";
  }
  return `${snapshotId}:${h || createdAt || ""}`;
}

export interface CachedPdf {
  buffer: Buffer;
  pages: number;
  level: number;
  source: string;
  filename: string;
}

// ── Process-wide singletons for the TBR PDF route ────────────────────────
export const PDF_CACHE_MAX_ENTRIES = 32;
export const PDF_CACHE_TTL_MS = 10 * 60 * 1000;
export const PDF_RENDER_SLOTS = 2;
export const PDF_RETRY_AFTER_SECONDS = 5;

export const tbrPdfCache = new RenderCache<CachedPdf>({ maxEntries: PDF_CACHE_MAX_ENTRIES, ttlMs: PDF_CACHE_TTL_MS });
export const tbrPdfSemaphore = new Semaphore(PDF_RENDER_SLOTS);
