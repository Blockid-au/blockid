// G20-F2 page sweep — every route-level error boundary carries
// `data-testid="error-boundary"` + `role="alert"` on the rendered (non-reload)
// branch. scripts/lib/page-sweep-core.mjs and tests/live-qa/33-page-sweep.spec.ts
// detect a boundary hit by that marker (prose such as "Application error" is
// legitimate copy on /status, so text matching was a false positive on
// 2026-09-20). A new error.tsx must carry the marker to be counted.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules") walk(full, out);
    } else if (name === "error.tsx") out.push(full);
  }
  return out;
}

describe("route error boundaries", () => {
  const boundaries = walk(join(process.cwd(), "src", "app"));
  it("finds the five known boundaries", () => {
    expect(boundaries.length).toBeGreaterThanOrEqual(5);
  });
  for (const file of boundaries) {
    it(`${file.replace(process.cwd() + "/", "")} marks its rendered branch data-testid="error-boundary" role="alert"`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/data-testid="error-boundary" role="alert"/);
      // The stale-chunk reload branch is not a boundary hit — it must not carry the marker.
      expect(src).not.toMatch(/data-stale-chunk-reload[^>]*data-testid="error-boundary"/);
    });
  }
});
