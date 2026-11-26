// G36 (26/11/2026) — the live page sweep found /workspace/score/trend with no
// <h1>: only the empty state had one. The server pass is the loading state (no
// fetch runs under renderToStaticMarkup), which is what crawlers, screen
// readers and the sweep see first. The other states are reached only after the
// client fetch; without @testing-library in this workspace they are pinned at
// source level: every `return (` branch of the component carries one <h1>.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SviTrendClient } from "./svi-trend-client";

describe("SviTrendClient headings", () => {
  it("server-rendered loading state has exactly one h1", () => {
    const html = renderToStaticMarkup(<SviTrendClient projectId="p1" />);
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain("SVI trend");
    expect(html).toContain('role="status"');
  });

  it("loading, error, empty and loaded states each render one h1", () => {
    const src = readFileSync(join(__dirname, "svi-trend-client.tsx"), "utf8");
    const component = src.slice(src.indexOf("export function SviTrendClient"));
    const body = component.slice(0, component.indexOf("\nfunction ") > 0 ? component.indexOf("\nfunction ") : undefined);
    const branches = body.split(/\n\s{2,4}return \(\n/).slice(1);
    // loading, error, empty, loaded
    expect(branches.length).toBeGreaterThanOrEqual(4);
    for (const b of branches.slice(0, 4)) {
      expect(b.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    }
  });
});
