// Colocated vitest for lib/security/safe-redirect.ts (S8-C, 2026-09-11).

import { describe, expect, it } from "vitest";
import { safeNextPath, withRedirectQueryParam } from "./safe-redirect";

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

describe("post-auth redirect query flags", () => {
  it.each(["/workspace#report", "/workspace?tab=valuation#report", "/workspace#report?tab=valuation"])("keeps flags out of the fragment for %s", target => {
    const before = new URL(target, "https://blockid.au");
    const after = new URL(withRedirectQueryParam(target, "logged_in", "true"), before.origin);
    expect(after.searchParams.get("logged_in")).toBe("true");
    expect(after.hash).toBe(before.hash);
    expect(after.searchParams.get("tab")).toBe(before.searchParams.get("tab"));
  });
  it("replaces stale duplicate flags and retains the same-origin guard", () => {
    expect(withRedirectQueryParam("/dashboard?logged_in=false&logged_in=false#top", "logged_in", "true"))
      .toBe("/dashboard?logged_in=true#top");
    expect(withRedirectQueryParam("//evil.example/", "logged_in", "true")).toBe("/?logged_in=true");
  });
});
