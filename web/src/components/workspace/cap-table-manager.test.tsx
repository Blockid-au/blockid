// G36 — /workspace/equity/cap-table rendered `h1_count_0` in the live page
// sweep (2026-11-25): the manager fetches in an effect, so its loading state
// IS the server render, and that state had no heading. Every state must carry
// exactly one <h1>; the loaded state's heading is pinned by the source scan.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapTableManager } from "./cap-table-manager";

describe("CapTableManager — one <h1> in every state", () => {
  it("the loading / server-render state carries exactly one <h1> and a polite status", () => {
    const html = renderToStaticMarkup(<CapTableManager />);
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
    expect(html).toContain(">Cap Table</h1>");
    expect(html).toContain('role="status"');
  });

  it("the component source has the heading in exactly the loading and loaded branches (no sub-panel adds a second h1)", () => {
    const src = readFileSync(path.join(__dirname, "cap-table-manager.tsx"), "utf8");
    // JSX elements only (`<h1 className=…`), not the "<h1>" in comments.
    expect(src.match(/<h1\s+className=/g) ?? []).toHaveLength(2);
  });
});
