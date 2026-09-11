// Colocated vitest for lib/security/safe-redirect.ts (S8-C, 2026-09-11).

import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-origin absolute paths, with query and hash", () => {
    expect(safeNextPath("/workspace/funding")).toBe("/workspace/funding");
    expect(safeNextPath("/funding/report/abc?t=x#top")).toBe("/funding/report/abc?t=x#top");
    expect(safeNextPath("  /admin/funding ")).toBe("/admin/funding");
    expect(safeNextPath("/")).toBe("/");
  });

  it("falls back on absolute URLs, protocol-relative and backslash tricks", () => {
    for (const bad of [
      "https://evil.com", "http://evil.com/", "//evil.com", "//evil.com/x", "/\\evil.com", "/\\/evil.com",
      "javascript:alert(1)", "evil.com", "workspace", "/%5Cevil.com\\", "/x\r\nLocation: https://evil.com",
      "/x\0", "", null, undefined, "/".padEnd(3000, "a"),
    ]) {
      expect(safeNextPath(bad), String(bad)).toBe("/");
    }
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath("https://evil.com", "/dashboard")).toBe("/dashboard");
    expect(safeNextPath(null, "/dashboard")).toBe("/dashboard");
  });
});
