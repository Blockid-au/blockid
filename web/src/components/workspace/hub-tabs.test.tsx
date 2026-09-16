// Colocated vitest for `hub-tabs.tsx` + `lib/nav/hubs.ts` (G13-W2-IA2).
//
//   • catalogue shape: every hub root is `/workspace/<id>`, segments are
//     unique, EN + VI labels present, gates reference real plans / flags
//   • active-tab derivation is longest-prefix on the pathname
//   • SSR markup: tablist / tab roles, aria-selected + aria-current on the
//     active tab, roving tabindex, locked tabs → billing with prefetch off
//     and "<Plan> plan unlocks this"
//   • keyboard model (ArrowLeft / ArrowRight / Home / End wrap) via the
//     pure helper — the DOM focus + navigate step is pinned by the e2e nav
//     spec (menu-structure.spec.ts)
//   • every hub with a layout.tsx on disk is in the catalogue and vice
//     versa; every tab's page exists

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const pathnameMock = vi.hoisted(() => ({ value: "/workspace/score/history" }));
const entitlementMock = vi.hoisted(() => ({
  plan: "founder_growth",
  can: () => true,
}));
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
  useRouter: () => ({ push: pushMock, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({
    user: { id: "u-1", plan: entitlementMock.plan, segment: "founder" },
    entitlements: [],
    trial: null,
    loading: false,
    can: (flag: string) => entitlementMock.can(flag),
    refresh: () => undefined,
  }),
}));
vi.mock("@/lib/use-locale", () => ({ useLocale: () => ["en", () => undefined] }));

import { HubTabs, HubTabsProvider, lockCopy, nextTabIndex, resolveHubTabs } from "./hub-tabs";
import { HUBS, HUB_IDS, activeHubTab, hubForPathname, hubTabHref } from "@/lib/nav/hubs";
import { VISIBILITY } from "@/lib/entitlements/tier-visibility";

const WORKSPACE_DIR = resolve(__dirname, "../../app/(app)/(founder)/workspace");

/** Every page.tsx under src/app as a URL path with `(group)` folders stripped. */
function collectRoutes(dir: string, prefix: string, out: Set<string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      collectRoutes(join(dir, entry.name), isGroup ? prefix : prefix + "/" + entry.name, out);
    } else if (entry.name === "page.tsx") {
      out.add(prefix || "/");
    }
  }
}
const ROUTES = new Set<string>();
collectRoutes(resolve(__dirname, "../../app"), "", ROUTES);

/** A route exists when its page or a dynamic-segment page covers it. */
function routeExists(route: string): boolean {
  if (ROUTES.has(route)) return true;
  for (const known of ROUTES) {
    if (!known.includes("[")) continue;
    const re = new RegExp("^" + known.replace(/\/\[[^\]]+\]/g, "/[^/]+") + "$");
    if (re.test(route)) return true;
  }
  return false;
}

/** Flags the sidebar catalogue also accepts (nav-groups.test.ts) — add-on grants without a VISIBILITY row. */
const KNOWN_FLAGS = new Set([...Object.keys(VISIBILITY), "cap_table.write", "vesting.read", "esop.manage"]);

function tabs(html: string): Array<Record<string, string>> {
  return [...html.matchAll(/<a ([^>]*role="tab"[^>]*)>/g)].map((m) => {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    return attrs;
  });
}

describe("HUBS — catalogue shape", () => {
  it("17 founder hubs, root = /workspace/<id>, unique segments, EN + VI on every label", () => {
    expect(HUB_IDS).toEqual([
      "score", "evidence", "plan", "reports", "investors", "valuation", "raise", "accelerators", "finance",
      "equity", "esop", "team", "strategy", "documents", "exit", "settings", "projects",
    ]);
    for (const id of HUB_IDS) {
      const h = HUBS[id];
      expect(h.root).toBe(`/workspace/${id}`);
      expect(h.label.en.trim()).not.toBe("");
      expect(h.label.vi.trim()).not.toBe("");
      expect(h.tabs.length).toBeGreaterThan(1);
      const segs = h.tabs.map((t) => t.segment);
      expect(new Set(segs).size, id).toBe(segs.length);
      for (const t of h.tabs) {
        expect(t.label.en.trim(), `${id}/${t.segment}`).not.toBe("");
        expect(t.label.vi.trim(), `${id}/${t.segment}`).not.toBe("");
        if (t.lockedWithoutFeature) expect(KNOWN_FLAGS.has(t.lockedWithoutFeature), `${id}/${t.segment} flag ${t.lockedWithoutFeature}`).toBe(true);
        if (t.href) expect(t.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("every hub with a layout.tsx on disk is catalogued, and every hub tab has a page", () => {
    const onDisk = readdirSync(WORKSPACE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(WORKSPACE_DIR, d.name, "layout.tsx")))
      .map((d) => d.name)
      .sort();
    expect(onDisk).toEqual([...HUB_IDS].sort());
    for (const id of HUB_IDS) {
      for (const t of HUBS[id].tabs) {
        const href = hubTabHref(HUBS[id], t);
        expect(routeExists(href), `${href} has no page.tsx`).toBe(true);
        if (t.activePrefix) expect(href.startsWith(t.activePrefix), `${href} outside its activePrefix`).toBe(true);
      }
      // The hub root is always a real page (never a redirect-only stub).
      expect(ROUTES.has(HUBS[id].root), `${HUBS[id].root} root page`).toBe(true);
    }
  });

  it("the Settings › Billing tab aliases /workspace/billing (route never moves — D6)", () => {
    const billing = HUBS.settings.tabs.find((t) => t.segment === "billing");
    expect(billing?.href).toBe("/workspace/billing");
    expect(hubTabHref(HUBS.settings, billing!)).toBe("/workspace/billing");
  });
});

describe("activeHubTab / hubForPathname — longest-prefix match", () => {
  it("selects the root on the hub root and the deepest tab on nested paths", () => {
    expect(activeHubTab(HUBS.score, "/workspace/score")?.segment).toBe("");
    expect(activeHubTab(HUBS.score, "/workspace/score/history")?.segment).toBe("history");
    expect(activeHubTab(HUBS.score, "/workspace/score/history/abc-123")?.segment).toBe("history");
    expect(activeHubTab(HUBS.reports, "/workspace/reports/9f1c")?.segment).toBe("");
    expect(activeHubTab(HUBS.reports, "/workspace/reports/investor-pack/generate")?.segment).toBe("investor-pack");
    expect(activeHubTab(HUBS.settings, "/workspace/billing")?.segment).toBe("billing");
    // Guide: links to chapter 1, owns every chapter.
    expect(hubTabHref(HUBS.plan, HUBS.plan.tabs[1])).toBe("/workspace/plan/guide/01-vision");
    expect(activeHubTab(HUBS.plan, "/workspace/plan/guide/07-traction")?.segment).toBe("guide");
    expect(activeHubTab(HUBS.score, "/workspace/evidence")).toBeNull();
    expect(activeHubTab(HUBS.score, "/workspace/score/history?x=1")?.segment).toBe("history");
  });

  it("maps a pathname to its hub, or null outside every hub", () => {
    expect(hubForPathname("/workspace/equity/cap-table")?.id).toBe("equity");
    expect(hubForPathname("/workspace/equity")?.id).toBe("equity");
    expect(hubForPathname("/workspace/funding")).toBeNull();
    expect(hubForPathname("/dashboard")).toBeNull();
  });
});

describe("resolveHubTabs — plan + add-on gates", () => {
  it("Growth founder with every flag: nothing locked", () => {
    const rows = resolveHubTabs(HUBS.equity, { planId: "founder_growth", hasFeature: () => true });
    expect(rows.every((r) => !r.locked)).toBe(true);
    expect(rows.map((r) => r.href)).toEqual([
      "/workspace/equity", "/workspace/equity/cap-table", "/workspace/equity/shareholders",
      "/workspace/equity/setup", "/workspace/equity/secondary", "/workspace/equity/on-chain",
    ]);
  });

  it("minPlan lock names the plan; a missing add-on flag links to the add-on drawer", () => {
    const exit = resolveHubTabs(HUBS.exit, { planId: "founder_starter", hasFeature: () => true });
    const bench = exit.find((r) => r.tab.segment === "benchmark")!;
    expect(bench.locked).toBe(true);
    expect(bench.lockTier).toBe("Growth");
    expect(bench.lockedHref).toBe("/workspace/billing");
    expect(lockCopy(bench.lockTier, "en")).toBe("Growth plan unlocks this");
    expect(lockCopy(bench.lockTier, "vi")).toContain("Growth");

    const equity = resolveHubTabs(HUBS.equity, { planId: "founder_growth", hasFeature: (f) => f !== "cap_table.write" });
    const cap = equity.find((r) => r.tab.segment === "cap-table")!;
    expect(cap.locked).toBe(true);
    expect(cap.lockedHref).toBe("/workspace/billing?openAddon=share_management");
    expect(cap.lockTier).toBe("Growth");
  });
});

describe("nextTabIndex — roving focus model", () => {
  it("ArrowRight / ArrowLeft wrap, Home / End jump, other keys are ignored", () => {
    expect(nextTabIndex("ArrowRight", 0, 4)).toBe(1);
    expect(nextTabIndex("ArrowRight", 3, 4)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 4)).toBe(3);
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 0, 4)).toBe(3);
    expect(nextTabIndex("Enter", 0, 4)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("<HubTabs> — SSR markup", () => {
  it("renders nothing outside a hub provider", () => {
    expect(renderToStaticMarkup(<HubTabs />)).toBe("");
  });

  it("tablist of tab links; the pathname's tab is selected, aria-current and the only tabbable one", () => {
    pathnameMock.value = "/workspace/score/history";
    const html = renderToStaticMarkup(
      <HubTabsProvider hub="score">
        <HubTabs />
      </HubTabsProvider>,
    );
    expect(html).toContain('aria-label="Score tabs"');
    expect(html).toContain('role="tablist"');
    const rows = tabs(html);
    expect(rows.map((r) => r.href)).toEqual([
      "/workspace/score", "/workspace/score/history", "/workspace/score/trend",
      "/workspace/score/benchmark", "/workspace/score/criteria", "/workspace/score/listing",
    ]);
    expect(rows.map((r) => r["aria-selected"])).toEqual(["false", "true", "false", "false", "false", "false"]);
    expect(rows[1]["aria-current"]).toBe("page");
    expect(rows.map((r) => r.tabindex)).toEqual(["-1", "0", "-1", "-1", "-1", "-1"]);
    expect(html).toContain(">History<");
  });

  it("hub root selects the first tab; a detail route no tab claims falls back to the first tab for focus", () => {
    pathnameMock.value = "/workspace/reports";
    let rows = tabs(renderToStaticMarkup(<HubTabsProvider hub="reports"><HubTabs /></HubTabsProvider>));
    expect(rows[0]["aria-selected"]).toBe("true");
    pathnameMock.value = "/workspace/reports/abc";
    rows = tabs(renderToStaticMarkup(<HubTabsProvider hub="reports"><HubTabs /></HubTabsProvider>));
    expect(rows[0]["aria-selected"]).toBe("true");
    expect(rows[0].tabindex).toBe("0");
  });

  it("locked tab: label kept, lock + aria-disabled, links to billing (prefetch off), names the plan", () => {
    pathnameMock.value = "/workspace/exit";
    entitlementMock.plan = "founder_starter";
    try {
      const html = renderToStaticMarkup(<HubTabsProvider hub="exit"><HubTabs /></HubTabsProvider>);
      const rows = tabs(html);
      const bench = rows.find((r) => r.id === "hub-tab-exit-benchmark")!;
      expect(bench.href).toBe("/workspace/billing");
      expect(bench["aria-disabled"]).toBe("true");
      expect(bench["data-locked"]).toBe("1");
      expect(bench.title).toBe("Growth plan unlocks this");
      expect(html).toContain("Growth plan unlocks this");
      expect(html).toContain(">Benchmark<");
      // The unlocked root tab keeps its own href.
      expect(rows[0].href).toBe("/workspace/exit");
      expect(rows[0]["aria-disabled"]).toBeUndefined();
    } finally {
      entitlementMock.plan = "founder_growth";
    }
  });

  it("explicit `hub` prop wins over the provider", () => {
    pathnameMock.value = "/workspace/team";
    const html = renderToStaticMarkup(<HubTabsProvider hub="score"><HubTabs hub="team" /></HubTabsProvider>);
    expect(html).toContain('data-hub="team"');
    expect(tabs(html).map((r) => r.href)).toEqual(["/workspace/team", "/workspace/team/salaries"]);
  });
});
