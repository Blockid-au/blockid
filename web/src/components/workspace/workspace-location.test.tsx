import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceLocation, workspaceLocation } from "./workspace-location";
import { navGroupsForIds } from "./nav-groups";

const founder = navGroupsForIds(["home", "prove", "money", "company"]);
const investor = navGroupsForIds(["evaluator-home", "dealflow", "reports"]);

describe("workspace return navigation", () => {
  it("uses the investor landing page without founder hub chrome", () => {
    const crumbs = workspaceLocation("/workspace/evaluations/private-id", "/workspace/investor", investor, "en", false);
    expect(crumbs[1].href).toBe("/workspace/investor");
    expect(crumbs.some(c => c.href === "/workspace/evaluations")).toBe(true);
    expect(crumbs.some(c => c.label.includes("private-id"))).toBe(false);
  });
  it("preserves both hub and tab parents on a deep report path", () => {
    const crumbs = workspaceLocation("/workspace/score/history/private-id", "/dashboard", founder, "en", true);
    expect(crumbs.map(c => c.href).filter(Boolean)).toEqual(["/", "/dashboard", "/workspace/score", "/workspace/score/history"]);
    expect(crumbs.at(-1)).toEqual({ label: "Details" });
  });
  it("does not invent a parent URL for uncatalogued dynamic paths", () => {
    expect(workspaceLocation("/unknown/customer-secret", "/dashboard", founder, "en", true)).toEqual([
      { label: "Home", href: "/" }, { label: "Overview", href: "/dashboard" }, { label: "Details" },
    ]);
  });
  it("renders a single current location and real links in Vietnamese", () => {
    const html = renderToStaticMarkup(<WorkspaceLocation pathname="/workspace/score/history" landingHref="/dashboard" groups={founder} locale="vi" includeHubs />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Trang chủ");
    expect(html).toContain("Lịch sử");
  });
  it("does not add duplicate overview or hub current links", () => {
    expect(workspaceLocation("/dashboard", "/dashboard", founder, "en", true)).toHaveLength(2);
    const crumbs = workspaceLocation("/workspace/score/", "/dashboard", founder, "en", true);
    expect(crumbs).toHaveLength(3);
    expect(crumbs.at(-1)?.href).toBeUndefined();
  });
});
