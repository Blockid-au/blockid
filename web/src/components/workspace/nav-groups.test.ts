// Colocated vitest for `nav-groups.ts` v4 — the ONE workspace sidebar
// catalogue (G13-W1-IA1, D5). Consumed by workspace-layout, the docs matrix
// builder, unlock-preview and the persona table, so the catalogue shape and
// the §D.1 label rules are pinned here.
//
// Grouped by concern:
//   • persona coverage — every `PERSONAS[].navGroups` id resolves; founder
//     sees Home · Prove · Money · Company, evaluators Home · Deal flow · Reports
//   • §D.1 label rules 1–8 over NAV_GROUPS (EN + VI)
//   • sidebar size — founder phase-0 ≤ 10 leaves / 3 groups, phase-5 = 20;
//     investor ≤ 3 groups and no Fundraise; no group > 6 leaves
//   • gates — `feature:` slugs exist in tier-visibility, add-on rows never hide
//   • every href in the pre-v4 catalogue snapshot still resolves: it is a v4
//     leaf, a live page on disk, or a `LEGACY_REDIRECTS` source (D6)
//   • `v4Href` targets are exactly the deferred-redirect destinations, so
//     S-IA2 has one list to flip

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";

import {
  ADMIN_NAV_GROUP,
  EVALUATOR_NAV_SEGMENTS,
  NAV_GROUPS,
  NAV_GROUPS_BY_ID,
  RESELLER_NAV_GROUPS,
  allNavLeaves,
  navGroupsForIds,
  navText,
  type NavGroup,
  type NavLeaf,
} from "./nav-groups";
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from "@/lib/nav/persona";
import { DEFERRED_REDIRECTS, LEGACY_REDIRECTS } from "@/lib/nav/legacy-redirects";
import { HUBS, HUB_IDS, hubTabHref } from "@/lib/nav/hubs";
import { VISIBILITY } from "@/lib/entitlements/tier-visibility";
import { NAV_PHASES } from "@/lib/nav/founder-phase-shared";
import type { Segment } from "@/lib/segments";

const APP_DIR = resolve(__dirname, "../../app");

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
collectRoutes(APP_DIR, "", ROUTES);

/** Does a page.tsx exist for `route` under src/app, ignoring `(group)` folders? */
function pageExists(route: string): boolean {
  return ROUTES.has(route.split("?")[0]);
}

/** Pre-v4 catalogue snapshot (HEAD~ nav-groups.ts, 105 unique hrefs). */
const OLD_HREFS = [
  "/admin", "/admin/goals", "/admin/listings", "/analyze", "/compliance/calendar",
  "/dashboard/accelerator", "/dashboard/accelerator-criteria", "/dashboard/admin/content-pillars",
  "/dashboard/admin/pricing-test", "/dashboard/admin/sector-multiples", "/dashboard/admin/stripe-sync",
  "/dashboard/admin/svi-exchange", "/dashboard/advisor", "/dashboard/analyzer", "/dashboard/cfo",
  "/dashboard/compliance", "/dashboard/esop", "/dashboard/exit-readiness", "/dashboard/finance",
  "/dashboard/fundraise", "/dashboard/history", "/dashboard/market-size", "/dashboard/portfolio",
  "/dashboard/svi", "/dashboard/team", "/dashboard/valuation", "/reseller", "/reseller/codes",
  "/reseller/credits", "/reseller/customers", "/reseller/mentor", "/reseller/mentor/cohort",
  "/reseller/mentor?filter=overdue", "/reseller/mentor?tab=reports", "/reseller/reports",
  "/reseller/requests", "/reseller/settings", "/startup-package", "/workspace/advisor-notes",
  "/workspace/analyses", "/workspace/api-keys", "/workspace/applications", "/workspace/billing",
  "/workspace/branding", "/workspace/business-report", "/workspace/cap-table", "/workspace/clean-room",
  "/workspace/client-roster", "/workspace/cohort", "/workspace/competitors", "/workspace/data-room",
  "/workspace/deal-flow", "/workspace/dividends", "/workspace/documents", "/workspace/equity",
  "/workspace/equity-dashboard", "/workspace/equity-esop", "/workspace/equity-offer",
  "/workspace/equity-setup", "/workspace/esic-assessment", "/workspace/esop", "/workspace/evaluation",
  "/workspace/evaluations", "/workspace/evidence", "/workspace/exit", "/workspace/exit-strategy",
  "/workspace/expenses", "/workspace/feedback", "/workspace/financial-forecast",
  "/workspace/founder-profile", "/workspace/funding", "/workspace/fundraise", "/workspace/gtm-strategy",
  "/workspace/integrations", "/workspace/investor-preferences", "/workspace/investors",
  "/workspace/journal", "/workspace/knowledge-base", "/workspace/listing-readiness",
  "/workspace/lp-report", "/workspace/metrics", "/workspace/notifications", "/workspace/portfolio",
  "/workspace/pricing-tiers", "/workspace/profile", "/workspace/projects", "/workspace/projects/archived",
  "/workspace/referrals", "/workspace/reports", "/workspace/revenue", "/workspace/roadmap",
  "/workspace/roadmap-builder", "/workspace/settings", "/workspace/shareholders", "/workspace/sso",
  "/workspace/svi-evidence", "/workspace/svi-trend", "/workspace/tax-invoice-checker", "/workspace/team",
  "/workspace/tech-analysis", "/workspace/vesting", "/workspace/wallet", "/workspace/watchlist",
  "/workspace/weekly-digest", "/workspace/white-label",
] as const;

const SEGMENTS: readonly Segment[] = ["founder", "investor_angel", "investor_vc", "advisor", "accelerator", "lp", "admin"];

/** Leaves a segment sees inside a group (segment + phase filter only — plan locks stay visible). */
function leavesFor(group: NavGroup, segment: Segment, phase: number): NavLeaf[] {
  return group.items.filter(
    (i) => (!i.segments || i.segments.includes(segment)) && (i.minPhase == null || i.minPhase <= phase),
  );
}

function sidebarFor(persona: PersonaKey, segment: Segment, phase: number): Array<{ group: NavGroup; leaves: NavLeaf[] }> {
  return navGroupsForIds(PERSONAS[persona].navGroups)
    .filter((g) => g.minPhase == null || g.minPhase <= phase)
    .map((group) => ({ group, leaves: leavesFor(group, segment, phase) }))
    .filter((r) => r.leaves.length > 0);
}

const WORDS = (s: string) => s.trim().split(/\s+/).filter((w) => w !== "&" && w !== "—" && w !== "-");

describe("NAV_GROUPS — shape + persona coverage", () => {
  it("ships the 4 founder + 3 evaluator groups in catalogue order with unique ids", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(["home", "prove", "money", "company", "evaluator-home", "dealflow", "reports"]);
    const all = [...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS];
    expect(new Set(all.map((g) => g.id)).size).toBe(all.length);
    for (const g of all) expect(NAV_GROUPS_BY_ID[g.id]).toBe(g);
  });

  it("every persona's navGroups resolve to catalogue groups, in order", () => {
    for (const key of PERSONA_KEYS) {
      const ids = PERSONAS[key].navGroups;
      expect(navGroupsForIds(ids).map((g) => g.id), key).toEqual(ids);
    }
    expect(PERSONAS.founder.navGroups).toEqual(["home", "prove", "money", "company"]);
    for (const key of ["investor_angel", "investor_vc", "advisor", "accelerator"] as const) {
      expect(PERSONAS[key].navGroups, key).toEqual(["evaluator-home", "dealflow", "reports"]);
    }
    expect(PERSONAS.admin.navGroups).toContain("admin");
  });

  it("every leaf has a root-relative href, an icon, EN + VI label and tooltip, a valid minPhase", () => {
    for (const g of [...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS]) {
      expect(g.items.length, g.id).toBeGreaterThan(0);
      for (const i of g.items) {
        expect(i.href.startsWith("/"), i.href).toBe(true);
        expect(typeof i.icon === "function" || typeof i.icon === "object", i.href).toBe(true);
        expect(i.label.en.trim().length, i.href).toBeGreaterThan(0);
        expect(i.label.vi.trim().length, i.href).toBeGreaterThan(0);
        expect(i.tooltip.en.trim().length, i.href).toBeGreaterThan(0);
        expect(i.tooltip.vi.trim().length, i.href).toBeGreaterThan(0);
        if (i.minPhase != null) expect(NAV_PHASES).toContain(i.minPhase);
        if (i.segments) for (const s of i.segments) expect(SEGMENTS).toContain(s);
      }
      if (g.minPhase != null) expect(NAV_PHASES).toContain(g.minPhase);
    }
    expect(EVALUATOR_NAV_SEGMENTS).toEqual(["investor_angel", "investor_vc", "advisor", "accelerator"]);
  });

  it("hrefs are unique across the whole catalogue; every live href or its v4Href has a page", () => {
    const all = allNavLeaves([...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS]);
    const hrefs = all.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const i of all) {
      expect(pageExists(i.href), `${i.href} has no page.tsx`).toBe(true);
      if (i.v4Href) expect(i.v4Href, `${i.href}: v4Href equals href`).not.toBe(i.href);
    }
  });

  it("navText falls back to EN when VI is empty", () => {
    expect(navText({ en: "Score", vi: "Điểm SVI" }, "vi")).toBe("Điểm SVI");
    expect(navText({ en: "Score", vi: "" }, "vi")).toBe("Score");
    expect(navText({ en: "Score", vi: "Điểm SVI" })).toBe("Score");
  });
});

describe("NAV_GROUPS — §D.1 label rules", () => {
  const leaves = allNavLeaves(NAV_GROUPS);

  it("rule 1 — leaf labels ≤ 3 words, sentence case, no parentheses, no bare acronyms the founder did not choose", () => {
    const ALLOWED_CAPS = new Set(["ESOP", "LP", "SVI", "Index", "Startup", "CFO", "P&L"]);
    for (const i of leaves) {
      const en = i.label.en;
      expect(WORDS(en).length, en).toBeLessThanOrEqual(3);
      expect(en, en).not.toMatch(/[()]/);
      expect(en[0], en).toBe(en[0].toUpperCase());
      // Sentence case: words after the first are lowercase unless allow-listed.
      for (const w of WORDS(en).slice(1)) {
        if (ALLOWED_CAPS.has(w)) continue;
        expect(w, `${en}: "${w}" is not sentence case`).toBe(w.toLowerCase());
      }
      expect(en, en).not.toMatch(/\bTBR\b/);
      // VI mirrors the rule where Vietnamese allows (≤ 4 tokens).
      expect(WORDS(i.label.vi).length, i.label.vi).toBeLessThanOrEqual(4);
    }
  });

  it("rule 2 — group labels are one word (Home · Prove · Money · Company / Home · Deal flow · Reports)", () => {
    const ALLOWED_TWO_WORD = new Set(["Deal flow"]);
    for (const g of NAV_GROUPS) {
      const en = g.label.en;
      if (ALLOWED_TWO_WORD.has(en)) continue;
      expect(WORDS(en).length, en).toBe(1);
    }
    expect(NAV_GROUPS.map((g) => g.label.en)).toEqual(["Home", "Prove", "Money", "Company", "Home", "Deal flow", "Reports"]);
  });

  it("rule 3 — no lifecycle chips (beta / new / live) anywhere in the catalogue", () => {
    for (const i of allNavLeaves([...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS])) {
      expect(i, i.href).not.toHaveProperty("lifecycle");
      expect(i.label.en, i.href).not.toMatch(/\b(beta|new|live)\b/i);
    }
  });

  it("rule 4 — no two leaves share a label within a persona; no leaf label equals its group label", () => {
    const cases: Array<[PersonaKey, Segment]> = [
      ["founder", "founder"],
      ["investor_angel", "investor_angel"],
      ["investor_vc", "investor_vc"],
      ["advisor", "advisor"],
      ["accelerator", "accelerator"],
    ];
    for (const [persona, segment] of cases) {
      const seen = new Map<string, string>();
      for (const { group, leaves: ls } of sidebarFor(persona, segment, 5)) {
        for (const i of ls) {
          const key = i.label.en.toLowerCase();
          expect(seen.has(key), `${persona}: "${i.label.en}" at ${i.href} duplicates ${seen.get(key)}`).toBe(false);
          seen.set(key, i.href);
          expect(key, `${persona}: leaf "${i.label.en}" equals group label`).not.toBe(group.label.en.toLowerCase());
        }
      }
    }
  });

  it("rule 5 — tooltips are benefit lines ≤ 12 words and differ from the label", () => {
    for (const i of leaves) {
      expect(WORDS(i.tooltip.en).length, i.tooltip.en).toBeLessThanOrEqual(12);
      expect(i.tooltip.en.toLowerCase(), i.href).not.toBe(i.label.en.toLowerCase());
    }
    for (const g of NAV_GROUPS) {
      if (g.tooltip) expect(WORDS(g.tooltip.en).length, g.tooltip.en).toBeLessThanOrEqual(12);
    }
  });

  it("rule 6 — locked rows can always name their plan (minPlan is a real tier, never a bare 'Upgrade')", () => {
    for (const i of leaves) {
      if (i.minPlan) expect(i.minPlan, i.href).toMatch(/^[a-z_]+$/);
      expect(i.tooltip.en, i.href).not.toMatch(/^upgrade$/i);
    }
  });

  it("rule 7 — hub-root leaves under /workspace/* carry the label's slug (documented exceptions only)", () => {
    // Labels whose canonical route slug differs by design (§A.1): the
    // catalogue records the reason next to each.
    const EXCEPTIONS: Record<string, string> = {
      "/dashboard": "Dashboard — landing keeps its historic path",
      "/workspace/projects": "My startups — /projects is the data noun",
      "/analyze": "Run analysis — public entry point, never moves (D6)",
      "/startup-package": "Get investor-ready — SKU route, never moves (D6)",
      "/workspace/funding": "Grants & programs — Money Finder route (T0244)",
      "/workspace/plan": "Action plan — plan is the noun",
      "/workspace/investor": "Dashboard — persona landing",
      "/workspace/advisor": "Dashboard — persona landing",
      "/workspace/accelerator": "Dashboard — persona landing",
      "/workspace/evaluations": "My evaluations — claim-token route, never moves (D6)",
      "/workspace/investor/dealflow": "Matches — dealflow page name predates v4",
      "/startup-index": "Startup Index — public index route",
      "/workspace/advisor/roster": "Clients — roster is the data noun",
      "/workspace/investor/digest": "Digest — under the investor hub",
      "/workspace/weekly-digest": "Digest — advisor stub until the Reports hub (S-IA2)",
      "/workspace/accelerator/quarterly-report": "Cohort Report — URL kept from the Quarterly LP report (G21 P2-C), alias 'Quarterly'",
      "/workspace/lp-report": "LP report — route keeps the hyphen",
      "/workspace/accelerator/applications": "Intake — G14 S35 keeps the historic applications URL (bookmarks, alias 'Applications')",
    };
    const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const i of leaves) {
      const canonical = i.v4Href ?? i.href;
      if (EXCEPTIONS[canonical]) continue;
      const last = canonical.split("/").filter(Boolean).pop() ?? "";
      expect(last, `${i.label.en} ↔ ${canonical}`).toBe(slug(i.label.en));
    }
  });

  it("rule 8 — EN and VI live in the same entry and differ (no copy-paste EN into VI) except proper nouns", () => {
    const SAME_OK = new Set(["ESOP", "Cohort"]);
    for (const i of leaves) {
      if (SAME_OK.has(i.label.en)) continue;
      expect(i.label.vi, i.href).not.toBe(i.label.en);
      expect(i.tooltip.vi, i.href).not.toBe(i.tooltip.en);
    }
    for (const g of NAV_GROUPS) expect(g.label.vi, g.id).not.toBe(g.label.en);
  });

  it("aliases carry the pre-v4 labels so the command palette still finds them", () => {
    const aliases = new Set(leaves.flatMap((i) => i.aliases ?? []));
    for (const old of ["Investor CRM", "VC Valuation", "Evidence Vault", "Business Report (TBR)", "Grant & Program Finder", "Startups I'm evaluating", "Preferences"]) {
      expect(aliases.has(old), old).toBe(true);
    }
  });
});

describe("NAV_GROUPS — sidebar size per persona", () => {
  it("founder phase 0: 3 groups, exactly 10 leaves; Company folds under Later phases", () => {
    const rows = sidebarFor("founder", "founder", 0);
    expect(rows.map((r) => r.group.id)).toEqual(["home", "prove", "money"]);
    expect(rows.reduce((n, r) => n + r.leaves.length, 0)).toBe(10);
    expect(NAV_GROUPS_BY_ID.company.minPhase).toBe(2);
  });

  it("founder phase 5: 4 groups, 20 leaves, no group above 6 leaves", () => {
    const rows = sidebarFor("founder", "founder", 5);
    expect(rows.map((r) => r.group.id)).toEqual(["home", "prove", "money", "company"]);
    expect(rows.reduce((n, r) => n + r.leaves.length, 0)).toBe(20);
    for (const r of rows) expect(r.leaves.length, r.group.id).toBeLessThanOrEqual(6);
  });

  it("evaluators: ≤ 3 groups, no Fundraise / Money / Company, Dashboard first", () => {
    // G20-F1 (2026-09-20): the investor Digest + Portfolio leaves and the
    // advisor Digest leaf are hidden (lib/features/hidden.ts) — investors
    // drop to 7 leaves, advisors to 6, and both lose the Reports group
    // entirely (it had no other leaf for them). Accelerators keep Quarterly
    // + LP report, and G21 P2-A adds the Templates leaf (8).
    const cases: Array<[PersonaKey, Segment, number, string[]]> = [
      ["investor_angel", "investor_angel", 7, ["Home", "Deal flow"]],
      ["investor_vc", "investor_vc", 7, ["Home", "Deal flow"]],
      ["advisor", "advisor", 6, ["Home", "Deal flow"]],
      ["accelerator", "accelerator", 8, ["Home", "Deal flow", "Reports"]],
    ];
    for (const [persona, segment, count, groups] of cases) {
      const rows = sidebarFor(persona, segment, 5);
      expect(rows.length, persona).toBeLessThanOrEqual(3);
      expect(rows.map((r) => r.group.label.en), persona).toEqual(groups);
      expect(rows[0].leaves[0].label.en, persona).toBe("Dashboard");
      expect(rows.reduce((n, r) => n + r.leaves.length, 0), persona).toBe(count);
      const labels = rows.flatMap((r) => r.leaves.map((l) => l.label.en));
      expect(labels, persona).not.toContain("Fundraise");
      expect(labels, persona).not.toContain("Raise");
      for (const r of rows) expect(r.leaves.length, `${persona}/${r.group.id}`).toBeLessThanOrEqual(6);
    }
  });

  it("a phase-0 founder never sees an evaluator leaf and an evaluator never sees a founder leaf", () => {
    const founder = new Set(sidebarFor("founder", "founder", 5).flatMap((r) => r.leaves.map((l) => l.href)));
    const angel = new Set(sidebarFor("investor_angel", "investor_angel", 5).flatMap((r) => r.leaves.map((l) => l.href)));
    for (const h of founder) expect(angel.has(h), h).toBe(false);
  });
});

describe("NAV_GROUPS — gates", () => {
  it("every `feature:` / `lockedWithoutFeature:` slug is known to tier-visibility or the reseller console", () => {
    const known = new Set([...Object.keys(VISIBILITY), "reseller.console", "esop.manage", "vesting.read", "cap_table.write"]);
    for (const i of allNavLeaves([...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS])) {
      if (i.feature) expect(known.has(i.feature), `${i.href} feature ${i.feature}`).toBe(true);
      if (i.lockedWithoutFeature) expect(known.has(i.lockedWithoutFeature), `${i.href} lockedWithoutFeature`).toBe(true);
    }
  });

  it("add-on rows are locked, never hidden, and carry the add-on's own flag", () => {
    for (const i of allNavLeaves(NAV_GROUPS)) {
      if (!i.addOnKey) continue;
      expect(i.hideWhenLocked, i.href).toBe(false);
      expect(i.lockedWithoutFeature, i.href).toBeTruthy();
    }
    expect(NAV_GROUPS_BY_ID.company.items.find((i) => i.href === "/workspace/esop")?.addOnKey).toBe("share_management");
  });

  it("segment-gated leaves only use evaluator segments outside the founder groups", () => {
    for (const g of NAV_GROUPS.slice(4)) {
      for (const i of g.items) {
        expect(i.segments, `${i.href} must be segment-gated`).toBeTruthy();
        for (const s of i.segments!) expect(EVALUATOR_NAV_SEGMENTS, `${i.href} ${s}`).toContain(s);
      }
    }
  });

  it("reseller console groups are NOT in NAV_GROUPS and keep the verbatim mentor hrefs", () => {
    expect(NAV_GROUPS.some((g) => g.id === "reseller" || g.id === "mentor-console")).toBe(false);
    expect(RESELLER_NAV_GROUPS.map((g) => g.id)).toEqual(["reseller", "mentor-console"]);
    expect(RESELLER_NAV_GROUPS[1].items.map((i) => i.href)).toEqual([
      "/reseller/mentor",
      "/reseller/mentor?filter=overdue",
      "/reseller/mentor?tab=reports",
      "/reseller/mentor/cohort",
    ]);
    // The duplicate Reseller › Mentor row is gone (§A.3).
    expect(RESELLER_NAV_GROUPS[0].items.some((i) => i.href === "/reseller/mentor")).toBe(false);
  });
});

describe("NAV_GROUPS — every pre-v4 href still resolves (D6)", () => {
  const liveHrefs = new Set(allNavLeaves([...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS]).map((i) => i.href));
  const redirected = new Set(LEGACY_REDIRECTS.map((r) => r.source));

  it("is a v4 leaf, a live page on disk, or a LEGACY_REDIRECTS source", () => {
    const orphans: string[] = [];
    for (const href of OLD_HREFS) {
      const ok = liveHrefs.has(href) || redirected.has(href) || pageExists(href);
      if (!ok) orphans.push(href);
    }
    expect(orphans, "old hrefs with neither a page nor a redirect").toEqual([]);
  });

  it("a redirected old href is never also a live leaf", () => {
    for (const href of OLD_HREFS) {
      if (redirected.has(href)) expect(liveHrefs.has(href), href).toBe(false);
    }
  });

  it("every v4Href is a DEFERRED_REDIRECTS hub the leaf's current href moves into (S-IA2 flips both together)", () => {
    for (const i of allNavLeaves(NAV_GROUPS)) {
      if (!i.v4Href) continue;
      const row = DEFERRED_REDIRECTS.find((r) => r.source === i.href);
      expect(row, `${i.href} has no deferred redirect`).toBeTruthy();
      // The hub root (`/workspace/strategy`) or one of its tabs (`/workspace/strategy/market`).
      expect(row!.destination === i.v4Href || row!.destination.startsWith(`${i.v4Href}/`), `${i.href} → ${row!.destination} vs v4Href ${i.v4Href}`).toBe(true);
      expect(pageExists(i.v4Href), `${i.v4Href} exists — flip href to it and move the redirect live`).toBe(false);
    }
  });
});


// G13-W2-IA2 addendum (W1 post-ship review): a page that exists is NOT
// reachable just because it exists. Every static founder page under
// /workspace or /dashboard must have an inbound link — a sidebar leaf, a
// hub tab (lib/nav/hubs.ts) or a literal `href` in a non-test component
// (tests, product tours and the nav catalogues themselves do not count).
describe("NAV_GROUPS — no founder page is URL-only (every page has an inbound link)", () => {
  const FOUNDER_DIR = resolve(APP_DIR, "(app)/(founder)");
  const founderRoutes = new Set<string>();
  collectRoutes(FOUNDER_DIR, "", founderRoutes);

  // Literal hrefs in every src .ts/.tsx file outside tests / tours / nav catalogues.
  function inboundHrefs(): Set<string> {
    const out = new Set<string>();
    const SRC = resolve(__dirname, "../..");
    const skip = /(\.test\.tsx?$|\/lib\/product-tour\/|\/lib\/nav\/|components\/workspace\/nav-groups\.ts$)/;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(p);
        } else if (/\.tsx?$/.test(entry.name) && !skip.test(p)) {
          const text = readFileSync(p, "utf8");
          for (const m of text.matchAll(/["'`](\/(?:workspace|dashboard)\/[A-Za-z0-9/_\-]+)/g)) out.add(m[1]);
        }
      }
    };
    walk(SRC);
    return out;
  }

  it("every static /workspace + /dashboard page is a nav leaf, a hub tab, or linked from a component", () => {
    const leaves = new Set(allNavLeaves([...NAV_GROUPS, ADMIN_NAV_GROUP, ...RESELLER_NAV_GROUPS]).map((i) => i.href.split("?")[0]));
    const tabs = new Set<string>();
    for (const id of HUB_IDS) {
      tabs.add(HUBS[id].root);
      for (const t of HUBS[id].tabs) tabs.add(hubTabHref(HUBS[id], t));
    }
    const linked = inboundHrefs();
    // Pages whose only entry is by design out-of-band (query-tokened email
    // links, Stripe return URLs, admin consoles) — each with the reason.
    const OUT_OF_BAND: Record<string, string> = {
      "/checkout/success": "Stripe success_url (D6)",
      "/workspace": "redirect-only root — the founder landing is /dashboard",
      "/onboarding": "post-signup wizard, entered from the auth flow",
    };
    const orphans: string[] = [];
    for (const route of [...founderRoutes].sort()) {
      if (route.includes("[")) continue; // dynamic: reached from a list page by id
      if (route.startsWith("/dashboard/admin") || route.startsWith("/workspace/evaluations/cohort")) continue;
      if (OUT_OF_BAND[route]) continue;
      if (leaves.has(route) || tabs.has(route) || linked.has(route)) continue;
      orphans.push(route);
    }
    expect(orphans, "pages reachable only by typing the URL — give each a hub tab, a leaf or a link card").toEqual([]);
  });
});
