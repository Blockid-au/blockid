/**
 * G26-W2 guard — evaluator, accelerator, investor and admin surfaces render on
 * the light template only (docs/plans/g26-light-template-redesign-2026-09-21.md
 * § 1 decision, § 2 lane W2).
 *
 * Static pins over every non-test source file in the W2 scope:
 *   - no dark-surface utility (`bg-brand-navy*` as a page/card ground,
 *     `bg-slate-9xx`, `bg-gray-9xx`, `bg-neutral-9xx`, `bg-zinc-9xx`,
 *     `bg-black`, `bg-ink-9xx` other than the 40 % scrim, `bg-[#0…]`)
 *   - no `dark:` variant and no `data-theme="dark"` wrapper
 *   - no raw Tailwind grey palette (`gray-*`, `slate-*`, `neutral-*`,
 *     `zinc-*`, `stone-*`) — tokens only (`ink-*`, `surface-*`, `line*`)
 *   - no raw hex / rgb inside a `className`
 *   - `text-white` only next to a brand fill (navy / action / semantic)
 *
 * `bg-brand-navy` is allowed only on a chip / button / avatar (a small brand
 * fill, its line carries `text-white` or `rounded-full`), never on a card,
 * section or page — the check below looks at the same class list.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const SCOPE = [
  "app/(app)/(founder)/workspace/evaluations",
  "app/(app)/(founder)/workspace/accelerator",
  "app/(app)/(founder)/workspace/investor",
  "app/(app)/(admin)/admin",
  "components/evaluations",
  "components/accelerator",
  "components/admin",
  "components/investor",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!/pilot/i.test(e)) walk(p, out); // G25-A deletes everything named pilot
    } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) && !/pilot/i.test(e)) {
      out.push(p);
    }
  }
  return out;
}

const FILES = SCOPE.flatMap((d) => walk(path.join(SRC, d)));

/** Every class list literal in a file (string, template and `cn(...)` fragments share the same shape). */
function classLists(src: string): string[] {
  const out: string[] = [];
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  // Class constants outside JSX (e.g. `const CARD = "rounded-2xl …"`).
  const re2 = /=\s*"((?:[a-z0-9:\-\/\[\]#.%()]+\s+){2,}[a-z0-9:\-\/\[\]#.%()]+)"/g;
  while ((m = re2.exec(src))) out.push(m[1]);
  return out;
}

const DARK_SURFACE = /\b(?:bg-(?:slate|gray|neutral|zinc|stone)-(?:8|9)\d{2}|bg-black(?!\/)|bg-black\/\d+|bg-ink-(?:8|9)\d{2}(?!\/40)|bg-\[#0[0-9a-f]{2,5}\]|bg-brand-navy-deep|from-brand-navy|to-brand-navy)\b/;
const RAW_GREY = /\b(?:bg|text|border|divide|ring|placeholder|from|to|via|outline|fill|stroke)-(?:gray|slate|neutral|zinc|stone)-\d{2,3}\b/;
const RAW_COLOR = /(?:#[0-9a-f]{3,8}\b|rgba?\()/i;
const BRAND_FILL = /\b(?:bg-(?:brand-navy|brand-navy-elev-1|action|brand-\d{3}|accent-\d{3}|bull|bear|warn|success|danger|emerald-\d{3}|rose-\d{3}|red-\d{3}|amber-\d{3}|blue-\d{3}|green-\d{3}|ink-900|purple-\d{3}|indigo-\d{3}|violet-\d{3}|orange-\d{3}|svi-\d{3})|bg-gradient-to-)/;

describe("G26-W2 — light surfaces only in the evaluator / accelerator / investor / admin scope", () => {
  it("covers the scope", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  for (const file of FILES) {
    const rel = path.relative(SRC, file);
    describe(rel, () => {
      const src = readFileSync(file, "utf8");
      const lists = classLists(src);

      it("has no dark: variant and no dark theme wrapper", () => {
        expect(src).not.toMatch(/\bdark:[a-z]/);
        expect(src).not.toMatch(/data-theme=["']dark["']/);
      });

      it("has no dark surface", () => {
        for (const cls of lists) expect(cls, cls).not.toMatch(DARK_SURFACE);
      });

      it("uses tokens, not the raw grey palette", () => {
        for (const cls of lists) expect(cls, cls).not.toMatch(RAW_GREY);
      });

      it("has no raw hex / rgb in a className", () => {
        for (const cls of lists) expect(cls, cls).not.toMatch(RAW_COLOR);
      });

      it("uses text-white only on a brand fill", () => {
        for (const cls of lists) {
          if (!/\btext-white\b/.test(cls)) continue;
          expect(cls, cls).toMatch(BRAND_FILL);
        }
      });

      it("uses bg-brand-navy only as a small brand fill (chip / button / avatar / rule), never a card or section", () => {
        for (const cls of lists) {
          if (!/\bbg-brand-navy(?:-elev-1)?\b/.test(cls)) continue;
          expect(cls, cls).toMatch(/\b(?:text-white|rounded-full|min-h-11|h-\d|w-\d|px-\d|inline-flex|inline-block)\b/);
          expect(cls, cls).not.toMatch(/\b(?:min-h-svh|min-h-screen|p-6|p-8|max-w-\dxl|overflow-x-auto)\b/);
        }
      });
    });
  }
});
