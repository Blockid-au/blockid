/**
 * G8-P7 — CI regression guard: shell coverage on gated route groups.
 *
 * Every `page.tsx` under a gated route group must have at least one
 * ancestor `layout.tsx` (or the page itself) that imports the expected
 * shell component. This prevents the "70-page chrome drift" problem where
 * new pages are added without the sidebar/topbar/footer wrapper.
 *
 * Shell decision matrix:
 *   /reseller/*, /compliance/*, /workspace/*, /dashboard/*, /innovator/*
 *     → WorkspaceLayout   (import from @/components/workspace/workspace-layout)
 *   /admin/*
 *     → AdminLayout       (import from @/components/admin/admin-layout, OR the
 *                          layout.tsx itself defines the function as AdminLayout)
 *   /showcase/*, /legal-templates/*, /startup-package/*
 *     → MarketingShell    (import from @/components/marketing/marketing-shell)
 *
 * Strategy:
 *   For each page.tsx under a gated group, we read:
 *     1. The page.tsx file content itself
 *     2. Every ancestor layout.tsx from the page directory up to (but not
 *        including) the app root
 *   We then check whether any of those files contains an import statement
 *   (or function definition) for the expected shell component.
 *
 * Why check the page itself too?
 *   Some pages (e.g. /dashboard/*, /workspace/*) inline the shell directly
 *   in page.tsx rather than relying on a parent layout.tsx. Both patterns
 *   are accepted.
 *
 * Allowlist (intentionally exempt — comment explains why):
 *   See ALLOWLIST below. Each entry is the URL-normalised route relative to
 *   the app root (route groups like (app), (founder) stripped out). Keep
 *   this list minimal; every new entry must carry a comment.
 *
 * How to add a new route group in future:
 *   1. Add a `GatedGroup` entry in GATED_GROUPS.
 *   2. Run the test — it will list any newly-failing pages.
 *   3. Either wire the shell into a layout.tsx or add a justified allowlist entry.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Absolute path to `web/src/app/` */
const APP_DIR = path.resolve(__dirname, "../../src/app");

interface GatedGroup {
  /** URL path prefix (after stripping route-group parentheses), e.g. "reseller" */
  urlPrefix: string;
  /** Shell import/definition token to search for in files */
  shellToken: string;
  /** Human-readable label for error messages */
  label: string;
}

const GATED_GROUPS: GatedGroup[] = [
  { urlPrefix: "reseller", shellToken: "WorkspaceLayout", label: "WorkspaceLayout" },
  { urlPrefix: "compliance", shellToken: "WorkspaceLayout", label: "WorkspaceLayout" },
  { urlPrefix: "workspace", shellToken: "WorkspaceLayout", label: "WorkspaceLayout" },
  { urlPrefix: "dashboard", shellToken: "WorkspaceLayout", label: "WorkspaceLayout" },
  { urlPrefix: "innovator", shellToken: "WorkspaceLayout", label: "WorkspaceLayout" },
  { urlPrefix: "admin", shellToken: "AdminLayout", label: "AdminLayout" },
  { urlPrefix: "showcase", shellToken: "MarketingShell", label: "MarketingShell" },
  { urlPrefix: "legal-templates", shellToken: "MarketingShell", label: "MarketingShell" },
  { urlPrefix: "startup-package", shellToken: "MarketingShell", label: "MarketingShell" },
];

/**
 * Pages that are INTENTIONALLY exempt from the shell requirement.
 *
 * Key = URL-normalised route path (no leading slash, no trailing /page.tsx,
 * route-group segments stripped).
 * Value = reason the page is exempt.
 *
 * Do NOT add new entries without a justification comment. The goal is to
 * keep this list shrinking over time as pages get proper shells.
 */
const ALLOWLIST: Record<string, string> = {
  // ── Innovator ───────────────────────────────────────────────────────────
  // The /innovator/* group has a bespoke inline nav (not WorkspaceLayout) as
  // of G8-P6. Shell backfill is a follow-up once the innovator console
  // entitlement gate is registered.
  "innovator": "G8-P6 skip: bespoke inline nav, WorkspaceLayout backfill deferred",
  "innovator/deal-pipeline": "G8-P6 skip: bespoke inline nav, WorkspaceLayout backfill deferred",
  "innovator/watchlist": "G8-P6 skip: bespoke inline nav, WorkspaceLayout backfill deferred",
  "innovator/industry-map": "G8-P6 skip: bespoke inline nav, WorkspaceLayout backfill deferred",

  // ── Showcase ────────────────────────────────────────────────────────────
  // Showcase pages are public demo/case-study surfaces with their own custom
  // chrome. They intentionally skip MarketingShell in favour of branded
  // full-bleed layouts.
  "showcase": "G8-P6 skip: public index page uses its own branded chrome",
  "showcase/canva": "G8-P6 skip: bespoke case-study chrome, not a marketing page",
  "showcase/safetyculture": "G8-P6 skip: bespoke case-study chrome, not a marketing page",
  "showcase/sprocketbay": "G8-P6 skip: bespoke case-study chrome, not a marketing page",
  "showcase/xero": "G8-P6 skip: bespoke case-study chrome, not a marketing page",
  "showcase/blockid": "G8-P6 skip: bespoke case-study chrome, not a marketing page",
  // The entire Atlassian sub-suite is a rich interactive walkthrough with its
  // own AtlassianWalkthroughProvider — wrapping in MarketingShell would
  // conflict with its full-bleed layout.
  "showcase/atlassian": "G8-P6 skip: Atlassian suite uses AtlassianWalkthroughProvider, not MarketingShell",
  "showcase/atlassian/growth-phases": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/dashboard": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/guide": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/data-room": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/svi-report": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/summary": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/valuation": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/agents": "G8-P6 skip: Atlassian suite bespoke UI",
  "showcase/atlassian/agents/[slug]": "G8-P6 skip: Atlassian suite bespoke UI",

  // ── Legal Templates ─────────────────────────────────────────────────────
  // Public static pages served without login. They fall under the
  // MarketingShell requirement but were shipped without it in P6.
  // Backfill tracked as a follow-up.
  "legal-templates": "G8-P6 skip: bare public page, MarketingShell backfill deferred",
  "legal-templates/[slug]": "G8-P6 skip: bare public page, MarketingShell backfill deferred",

  // ── Startup Package ─────────────────────────────────────────────────────
  // /startup-package/page.tsx (the buy page) HAS MarketingShell inline and passes.
  // The sub-pages below are either auth-gated dashboards or wizard flows that
  // run without chrome by design.
  "startup-package/[projectId]": "G8-P6 skip: authenticated package dashboard without marketing chrome by design",
  "startup-package/interview": "G8-P6 skip: full-screen interview wizard, no chrome by design",

  // ── Workspace stubs / redirects ──────────────────────────────────────────
  // These are stub pages (coming-soon), legacy redirect aliases, or
  // narrow client forms that were shipped without WorkspaceLayout in P6.
  // Stubs will be replaced by full WorkspaceLayout pages; redirects
  // need no chrome because they immediately bounce the user elsewhere.
  "workspace": "G8-P6 skip: redirect-only page (bounces to /dashboard)",
  "workspace/investor-preferences": "G8-P6 skip: redirect alias to /workspace/investor/preferences",
  "workspace/applications": "G8-P6 skip: coming-soon stub, WorkspaceLayout backfill deferred",
  "workspace/sso": "G8-P6 skip: coming-soon stub, WorkspaceLayout backfill deferred",
  "workspace/deal-flow": "G8-P6 skip: redirect alias to /workspace/investor/dealflow",
  "workspace/team": "G8-P6 skip: coming-soon stub, WorkspaceLayout backfill deferred",
  "workspace/svi-api": "G8-P6 skip: bare client component, WorkspaceLayout backfill deferred",
  "workspace/reports/upgrade": "G8-P6 skip: upgrade gate page without full chrome",
  "workspace/portfolio": "G8-P6 skip: redirect alias to /workspace/investor/portfolio",
  "workspace/watchlist": "G8-P6 skip: redirect alias to /workspace/investor/watchlist",
  "workspace/equity-offer/request": "G8-P6 skip: bare client form, WorkspaceLayout backfill deferred",
  "workspace/advisor-notes": "G8-P6 skip: redirect alias to /workspace/advisor/notes",
  "workspace/client-roster": "G8-P6 skip: redirect alias to /workspace/advisor/roster",
  "workspace/cohort": "G8-P6 skip: redirect alias to /workspace/accelerator/cohort",
  "workspace/white-label": "G8-P6 skip: coming-soon stub, WorkspaceLayout backfill deferred",
  "workspace/weekly-digest": "G8-P6 skip: coming-soon stub, WorkspaceLayout backfill deferred",

  // ── Dashboard sub-pages ──────────────────────────────────────────────────
  // These dashboard sub-pages were shipped without WorkspaceLayout in P6.
  "dashboard/admin/investor-verifications": "G8-P6 skip: bare admin table under dashboard, WorkspaceLayout backfill deferred",
  "dashboard/onboarding": "G8-P6 skip: bare WelcomeWizard without outer chrome",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively find all `page.tsx` files under a directory.
 */
function findPageFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPageFiles(fullPath));
    } else if (entry.isFile() && entry.name === "page.tsx") {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Convert a filesystem path (absolute, under APP_DIR) to its URL path by:
 *   1. Stripping the APP_DIR prefix
 *   2. Removing route-group segments (folders wrapped in parentheses)
 *   3. Removing the trailing `/page.tsx`
 *
 * Example:
 *   .../src/app/(app)/(founder)/workspace/billing/page.tsx
 *   → "workspace/billing"
 */
function filePathToUrlPath(absPath: string): string {
  // Make relative to APP_DIR
  let rel = path.relative(APP_DIR, absPath);
  // Normalise to forward slashes
  rel = rel.split(path.sep).join("/");
  // Remove the trailing /page.tsx
  rel = rel.replace(/\/page\.tsx$/, "");
  // Remove route-group segments like "(app)/", "(founder)/", etc.
  rel = rel.replace(/\([^)]*\)\//g, "");
  // Trim any leading/trailing slashes that might remain
  rel = rel.replace(/^\/+|\/+$/g, "");
  return rel;
}

/**
 * Walk up the directory tree from `startDir` (exclusive) to `APP_DIR`
 * (inclusive) and return the contents of every `layout.tsx` found.
 */
function ancestorLayoutContents(startDir: string): string[] {
  const contents: string[] = [];
  let dir = startDir;

  while (true) {
    const layoutPath = path.join(dir, "layout.tsx");
    if (fs.existsSync(layoutPath)) {
      contents.push(fs.readFileSync(layoutPath, "utf8"));
    }

    if (dir === APP_DIR) break;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root guard
    dir = parent;
  }

  return contents;
}

/**
 * Return true if the given content string contains the shell token as
 * an import or as a function definition.
 *
 * We look for:
 *   import ... ShellToken ...    (import statement)
 *   function ShellToken          (inline definition, e.g. admin/layout.tsx)
 *   export function ShellToken   (exported inline definition)
 *   export default function ShellToken
 *
 * We deliberately avoid plain substring checks to prevent false positives
 * from comment lines (e.g. "// pages mount WorkspaceLayout themselves").
 */
function contentHasShell(content: string, shellToken: string): boolean {
  const importRe = new RegExp(`import[^'"]*\\b${shellToken}\\b`);
  const defRe = new RegExp(`(?:export\\s+(?:default\\s+)?)?function\\s+${shellToken}\\s*[(<]`);
  return importRe.test(content) || defRe.test(content);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("G8-P7 shell coverage — gated route groups", () => {
  it("every gated page.tsx has an ancestor layout or self that imports the required shell", () => {
    const violations: string[] = [];
    let checkedCount = 0;
    let allowlistedCount = 0;

    for (const group of GATED_GROUPS) {
      // Find all page.tsx files whose URL path starts with this group's prefix
      const allPages = findPageFiles(APP_DIR);

      for (const pagePath of allPages) {
        const urlPath = filePathToUrlPath(pagePath);

        // Match: urlPath equals the prefix OR starts with prefix + "/"
        const isInGroup =
          urlPath === group.urlPrefix ||
          urlPath.startsWith(`${group.urlPrefix}/`);

        if (!isInGroup) continue;

        // Check allowlist first
        if (ALLOWLIST[urlPath] !== undefined) {
          allowlistedCount++;
          continue;
        }

        checkedCount++;

        // Check the page itself
        const pageContent = fs.readFileSync(pagePath, "utf8");
        if (contentHasShell(pageContent, group.shellToken)) continue;

        // Check ancestor layouts (page dir, then parents up to APP_DIR)
        const pageDir = path.dirname(pagePath);
        const layoutContents = ancestorLayoutContents(pageDir);
        const foundInLayout = layoutContents.some((c) =>
          contentHasShell(c, group.shellToken),
        );

        if (!foundInLayout) {
          violations.push(
            `/${urlPath}/page.tsx → requires ${group.label} (group: ${group.urlPrefix})`,
          );
        }
      }
    }

    // Build a descriptive failure message
    if (violations.length > 0) {
      const msg = [
        `\n${violations.length} page(s) are missing their required shell import.`,
        "Each page (or one of its ancestor layout.tsx files) must import the shell",
        "shown below. Either add the shell import or add the page to the ALLOWLIST",
        "in web/tests/chrome/shell-coverage.test.ts with a justification comment.\n",
        ...violations.map((v) => `  ✗ ${v}`),
        `\n(${checkedCount} pages checked, ${allowlistedCount} allowlisted)`,
      ].join("\n");
      expect.fail(msg);
    }

    // Sanity: we should have checked at least the well-established groups
    expect(checkedCount).toBeGreaterThan(0);
    // Log summary for visibility in CI
    console.info(
      `shell-coverage: ${checkedCount} pages verified, ${allowlistedCount} allowlisted`,
    );
  });

  it("allowlist entries refer to routes that actually exist", () => {
    // Guard against stale allowlist entries (page deleted but allowlist not cleaned up).
    const allPages = findPageFiles(APP_DIR);
    const existingUrlPaths = new Set(allPages.map(filePathToUrlPath));

    const stale: string[] = [];
    for (const key of Object.keys(ALLOWLIST)) {
      if (!existingUrlPaths.has(key)) {
        stale.push(key);
      }
    }

    if (stale.length > 0) {
      const msg = [
        `\n${stale.length} allowlist entrie(s) refer to routes that no longer exist.`,
        "Remove them from the ALLOWLIST in web/tests/chrome/shell-coverage.test.ts:\n",
        ...stale.map((k) => `  • ${k}  — ${ALLOWLIST[k]}`),
      ].join("\n");
      expect.fail(msg);
    }
  });
});
