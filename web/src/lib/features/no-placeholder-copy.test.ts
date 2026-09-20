// Guard — no placeholder copy on any reachable page (G20-F1, 2026-09-20;
// docs/plans/g20-ready-for-sale-2026-09-20.md § 4 acceptance).
//
// Reads every non-test .tsx/.ts source under src/app (pages, layouts and
// their colocated client components) and src/components, strips comments
// and string-less code lines, and fails when a rendered-looking line carries
// "coming soon", "not available yet", "under construction", "ships in a
// follow-up release" or "TODO:" copy. Hidden pages render the shared card
// ("Not offered yet — talk to us"), which is the allowed wording; the card
// component and the pages that mount it are exempt by construction (they
// never carry the forbidden phrases), so the allow-list below is for the
// handful of ops-only strings a customer cannot reach.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");
const TREES = ["app", "components"].map((t) => join(SRC, t));

// Phrases are case-insensitive; the `TODO:` marker is case-sensitive so an
// object key like `todo:` (a status enum) never trips it.
const PHRASES = /coming soon|not available yet|under construction|ships in a follow-up release/i;
const TODO_MARKER = /\bTODO:/;
const FORBIDDEN = { test: (s: string) => PHRASES.test(s) || TODO_MARKER.test(s) };
const DEV_HINT = /not yet configured/i;

/**
 * Lines that are not customer copy — ops fallbacks a customer cannot reach,
 * or a developer-only hint. Keyed by path relative to src/; each entry names
 * the reason so the list is auditable.
 */
const ALLOW: Record<string, string> = {
  // Developer-only hint: renders only when GOOGLE_CLIENT_ID is unset on the box (it is set on production).
  "app/(app)/(founder)/workspace/evidence/connectors/dashboard-integrations-section.tsx": "dev-only OAuth hint",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "__mocks__") continue;
      walk(p, out);
    } else if (/\.(tsx?|mts)$/.test(name) && !/\.test\.|\.spec\.|\.stories\./.test(name) && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

// Drop line and block comments so a historical note never trips the guard.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, ""))
    .join("\n");
}

describe("no placeholder copy on reachable pages (G20-F1 guard)", () => {
  const files = TREES.flatMap((t) => walk(t));

  it("scans a meaningful tree", () => {
    expect(files.length).toBeGreaterThan(400);
  });

  it('no source line renders "coming soon" / "not available yet" / "under construction" / "ships in a follow-up release" / "TODO:"', () => {
    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file);
      if (ALLOW[rel]) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      src.split("\n").forEach((line, i) => {
        if (FORBIDDEN.test(line)) hits.push(rel + ":" + String(i + 1) + ": " + line.trim().slice(0, 120));
      });
    }
    expect(hits, "placeholder copy on a reachable surface — hide the feature (lib/features/hidden.ts) or finish it").toEqual([]);
  });

  it("the allow-list only names files that exist and still need it", () => {
    for (const rel of Object.keys(ALLOW)) {
      const file = join(SRC, rel);
      expect(statSync(file).isFile(), rel).toBe(true);
      const src = stripComments(readFileSync(file, "utf8"));
      const stillNeeded = FORBIDDEN.test(src) || DEV_HINT.test(src);
      expect(stillNeeded, rel + " no longer needs the allow-list entry").toBe(true);
    }
  });
});
