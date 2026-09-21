// SVI_VERSION history — the guard that fails when SVI_VERSION is bumped
// without a history row (G21 P3-C; the governance page test pins the same
// table against docs/product/score-governance.md § 5).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { CHANGE_TYPE_LABEL, SVI_VERSION_HISTORY, currentVersionRow, historyIsAscending, parseVersion } from "./version-history";

const DOC = readFileSync(resolve(__dirname, "../../../../docs/product/score-governance.md"), "utf8");

describe("SVI_VERSION_HISTORY", () => {
  it("has a row for the live SVI_VERSION — bump the constant and this fails until the history (and the governance doc) carry the new row", () => {
    expect(currentVersionRow(), `no history row for SVI_VERSION ${SVI_VERSION}`).toBeDefined();
    expect(SVI_VERSION_HISTORY[SVI_VERSION_HISTORY.length - 1].version).toBe(SVI_VERSION);
  });

  it("is strictly ascending, dated, typed, and every row states its effect on comparability and appears in the governance document", () => {
    expect(historyIsAscending()).toBe(true);
    expect(historyIsAscending([{ version: "2.2.0" }, { version: "2.2.0" }])).toBe(false);
    expect(historyIsAscending([{ version: "2.2.0" }, { version: "2.10.0" }])).toBe(true);
    expect(parseVersion("2.10.3")).toEqual([2, 10, 3]);
    for (const r of SVI_VERSION_HISTORY) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(CHANGE_TYPE_LABEL)).toContain(r.type);
      expect(r.comparability.length, r.version).toBeGreaterThan(40);
      expect(DOC, `${r.version} missing from score-governance.md § 5`).toContain(`| ${r.version} | ${r.date} |`);
    }
  });
});
