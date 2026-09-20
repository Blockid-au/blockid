// G18-C "one message across the site" drift guard (2026-09-19).
//
// `docs/design/messaging.md` § 11 is the founder-facing "never say" table.
// This test parses that table and greps the public source trees for every
// forbidden phrase, so a retired hero line, a renamed product, an agent
// count or a "coming soon" cannot creep back into copy without failing CI.
//
// Rules of the grep:
//   - only public surfaces are scanned (marketing pages, /vi, landing +
//     marketing components, i18n messages, SEO helpers, e-mail + PDF
//     wording, the OG card, the PWA manifest);
//   - `.test.` / `.spec.` files are skipped;
//   - line and block comments are stripped from .ts/.tsx
//     before matching, so a comment may cite the retired phrase it replaced;
//   - each table row may exempt path prefixes (lane A/B pages, history
//     pages, product internals) — the exemptions live in the doc, not here.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB_ROOT = resolve(__dirname, "../../..");
const DOC_PATH = resolve(WEB_ROOT, "../docs/design/messaging.md");

/** Public surfaces, relative to `web/`. Files or directories. */
const PUBLIC_TREES = [
  "src/app/(marketing)",
  "src/app/docs",
  "src/app/vi",
  "src/app/layout.tsx",
  "src/app/opengraph-image.tsx",
  "src/app/search",
  // `src/app/svi` was a dead page behind the /svi → /startup-index 301 and
  // was removed in G20-F1 (2026-09-20); /analyze is the analyser surface.
  "src/app/analyze",
  "src/app/startup-index",
  "src/app/innovator",
  "src/app/s",
  "src/app/tools",
  "src/app/dataset",
  "src/app/startup-package",
  "src/app/api/platform-stats",
  "src/components/marketing",
  "src/components/landing",
  "src/components/seo",
  "src/components/svi",
  "src/components/analyze",
  "src/lib/i18n/messages",
  "src/lib/seo",
  "src/lib/marketing",
  "src/lib/email-drip.ts",
  "src/lib/svi/email-report.ts",
  "src/lib/svi/email-queue.ts",
  "src/lib/pilots/emails.ts",
  "src/lib/pdf",
  "public/site.webmanifest",
  // G20-F3 (2026-09-20) — the signed-in surfaces join the sweep: workspace /
  // dashboard / settings / billing pages and the components that render them.
  "src/app/(app)",
  "src/components/workspace",
  "src/components/dashboard",
  "src/components/onboarding",
  "src/components/access",
  "src/components/paywall",
  "src/components/churn",
];

/**
 * G20-F3: path prefixes (relative to `web/`) that the sweep never enters.
 * The G19 peer lane (Report Quality) owns these trees; drift there is
 * reported to the SOT G19 block, not fixed by the messaging guard.
 */
// G20 review: the G19 (report-quality) trees are merged — nothing is excluded.
const EXCLUDED_TREES: string[] = [];

const SOURCE_EXT = /\.(tsx?|json|webmanifest|txt|md)$/;

interface Rule {
  patterns: RegExp[];
  why: string;
  allow: string[];
}

/** Every backtick span in a table cell. `\|` inside a cell is a literal pipe. */
function backtickSpans(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.replace(/\\\|/g, "|"));
}

function toRegExp(src: string): RegExp {
  const flagged = new RegExp("^(.*)/([a-z]+)$").exec(src);
  if (flagged && !src.includes("\\/")) return new RegExp(flagged[1]!, flagged[2]);
  return new RegExp(src);
}

/** Split a markdown table row on unescaped pipes. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "\\" && line[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (ch === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.slice(1, -1).map((c) => c.trim());
}

export function parseNeverSay(markdown: string): Rule[] {
  const start = markdown.indexOf("## 11. Never say");
  expect(start, "docs/design/messaging.md must keep the '## 11. Never say' section").toBeGreaterThan(-1);
  const section = markdown.slice(start);
  const rules: Rule[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = splitRow(line);
    if (cells.length < 3) continue;
    if (/^Phrase/.test(cells[0]!) || /^-+$/.test(cells[0]!)) continue;
    const patterns = backtickSpans(cells[0]!).map(toRegExp);
    if (patterns.length === 0) continue;
    const allow = cells[2] === "—" ? [] : backtickSpans(cells[2]!);
    rules.push({ patterns, why: cells[1]!, allow });
  }
  return rules;
}

function walk(path: string, out: string[]): void {
  const rel = relative(WEB_ROOT, path);
  if (EXCLUDED_TREES.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) return;
  const st = statSync(path);
  if (st.isFile()) {
    if (SOURCE_EXT.test(path) && !/\.(test|spec)\./.test(path)) out.push(path);
    return;
  }
  for (const entry of readdirSync(path)) walk(join(path, entry), out);
}

/** Strip line comments (not the `://` in URLs) and block comments. */
export function stripComments(src: string): string {
  const block = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  const line = new RegExp("(^|[\\s(])//[^\\n]*", "g");
  return src.replace(block, "").replace(line, "$1");
}

const doc = readFileSync(DOC_PATH, "utf8");
const rules = parseNeverSay(doc);

const files: string[] = [];
for (const tree of PUBLIC_TREES) walk(resolve(WEB_ROOT, tree), files);

const corpus = files.map((abs) => {
  const rel = relative(WEB_ROOT, abs);
  const raw = readFileSync(abs, "utf8");
  return { rel, text: /\.tsx?$/.test(abs) ? stripComments(raw) : raw };
});

describe("docs/design/messaging.md § 11 — the never-say table", () => {
  it("parses into at least a dozen rules, each with a compiled regex", () => {
    expect(rules.length).toBeGreaterThanOrEqual(12);
    for (const r of rules) expect(r.patterns.length).toBeGreaterThan(0);
  });

  it("scans every public tree (a renamed tree must be re-pointed here, not silently dropped)", () => {
    expect(files.length).toBeGreaterThan(150);
    for (const tree of [...PUBLIC_TREES, ...EXCLUDED_TREES]) {
      const abs = resolve(WEB_ROOT, tree);
      const exists = (() => {
        try {
          statSync(abs);
          return true;
        } catch {
          return false;
        }
      })();
      expect(exists, `${tree} is missing`).toBe(true);
    }
    // The G19 trees are excluded by prefix, never scanned.
    for (const rel of files.map((abs) => relative(WEB_ROOT, abs))) {
      for (const ex of EXCLUDED_TREES) expect(rel.startsWith(ex), `${rel} must not be scanned (G19 lane)`).toBe(false);
    }
  });

  it.each(rules.map((r) => [r.patterns.map((p) => p.source).join(" · "), r] as const))(
    "never says %s",
    (_label, rule) => {
      const hits: string[] = [];
      for (const { rel, text } of corpus) {
        if (rule.allow.some((prefix) => rel.startsWith(prefix))) continue;
        const lines = text.split("\n");
        for (const p of rule.patterns) {
          lines.forEach((line, i) => {
            if (p.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
          });
        }
      }
      expect(hits, `${rule.why} — fix the copy or add an allow-list prefix in docs/design/messaging.md`).toEqual([]);
    },
  );
});

describe("the hero and brand lines the map fixes are the ones the code ships", () => {
  it("FI1/FI2 (default hero) and E1/E2 (legacy arm) in hero-variants.ts match § 2 verbatim", async () => {
    const { heroLine } = await import("./hero-variants");
    const row = (label: string) => {
      const line = doc.split("\n").find((l) => l.startsWith(`| **${label}**`));
      expect(line, `§ 2 row ${label}`).toBeTruthy();
      const cells = splitRow(line!);
      return { en: backtickSpans(cells[1]!)[0], vi: backtickSpans(cells[2]!)[0] };
    };
    const fi1 = row("H1 (FI1)");
    const fi2 = row("Sub (FI2)");
    expect(heroLine("FI1").en).toBe(fi1.en);
    expect(heroLine("FI1").vi).toBe(fi1.vi);
    expect(heroLine("FI2").en).toBe(fi2.en);
    const e1 = row("H1 (E1, legacy arm)");
    const e2 = row("Sub (E2)");
    expect(heroLine("E1").en).toBe(e1.en);
    expect(heroLine("E1").vi).toBe(e1.vi);
    expect(heroLine("E2").en).toBe(e2.en);
    expect(heroLine("E2").vi).toBe(e2.vi);
  });

  it("the data sentence is the founder-approved one, verbatim", async () => {
    const { DATA_PRINCIPLE_SENTENCE } = await import("@/lib/valuation-certificate/types");
    const quote = /^> (Your data belongs to your startup\..*)$/m.exec(doc)?.[1];
    expect(quote).toBeTruthy();
    expect(DATA_PRINCIPLE_SENTENCE).toBe(quote);
  });

  it("site name, OG alt and manifest carry the brand line", () => {
    const layout = readFileSync(resolve(WEB_ROOT, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('const SITE_NAME = "BlockID.au — Startup Value Index"');
    expect(layout).toContain('template: "%s | BlockID.au"');
    const og = readFileSync(resolve(WEB_ROOT, "src/app/opengraph-image.tsx"), "utf8");
    expect(og).toContain('export const alt = "Screen every startup on the same evidence-backed framework · BlockID.au"');
    const pageMeta = readFileSync(resolve(WEB_ROOT, "src/lib/seo/page-meta.ts"), "utf8");
    expect(pageMeta).toContain('export const OG_IMAGE_ALT = "Screen every startup on the same evidence-backed framework · BlockID.au"');
    const manifest = JSON.parse(readFileSync(resolve(WEB_ROOT, "public/site.webmanifest"), "utf8")) as { name: string; short_name: string };
    expect(manifest.name).toBe("BlockID.au — Startup Value Index");
    expect(manifest.short_name).toBe("BlockID");
  });
});
