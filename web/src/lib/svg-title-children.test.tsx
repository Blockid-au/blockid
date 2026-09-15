// Repo-wide regression guard for QA audit F2 (2026-09-14): React 19 renders a
// `<title>` whose `children` is an *array* (any mix of text and `{expr}`, e.g.
// `<title>{s.label} — {value}</title>`) as an EMPTY element on the server, then
// fills it on the client — a #418 hydration mismatch that re-renders the whole
// root on `/`, `/showcase/atlassian/*`, `/tools/funding-plan`, `/tools/cap-table`,
// and strips the SVG's accessible name from the server HTML. The fix is always a
// single template-literal child: `<title>{`${s.label} — ${value}`}</title>`.
//
// This walks every `.tsx` under src/components and src/app, finds each
// `<title …>…</title>` element and fails when its JSX children would be an
// array (two or more `{…}` slots, or text mixed with a `{…}` slot). Plain text
// or one `{…}` slot is fine. `<desc>` is not affected (proved below).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = ["components", "app"].map((d) => join(ROOT, d));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, out);
    } else if (name.endsWith(".tsx") && !/\.test\.tsx$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Split the JSX children text of a `<title>` into top-level `{…}` slots and
 * the literal text between them, then decide whether React would receive an
 * array. Nested braces (template-literal `${}` or object literals) are
 * balanced so a single `{`…`}` slot stays one slot.
 */
export function titleChildrenAreArray(inner: string): boolean {
  let depth = 0;
  let slots = 0;
  let text = "";
  for (const ch of inner) {
    if (ch === "{") {
      if (depth === 0) slots++;
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (depth === 0) {
      text += ch;
    }
  }
  const hasText = text.trim().length > 0;
  return slots > 1 || (slots === 1 && hasText);
}

const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/g;

describe("SVG <title> children are a single string (React #418 guard)", () => {
  it("template-literal children render on the server, array children do not", () => {
    const stage = "seed";
    const ok = renderToStaticMarkup(
      <svg>
        <title id="t">{`Eight scoring dimensions for a ${stage} run`}</title>
      </svg>,
    );
    expect(ok).toContain("<title id=\"t\">Eight scoring dimensions for a seed run</title>");
    // Documented React 19 behaviour this guard exists for: mixed children → empty title.
    const bad = renderToStaticMarkup(
      <svg>
        {/* eslint-disable-next-line react/jsx-key */}
        <title id="t">Eight scoring dimensions for a {stage} run</title>
      </svg>,
    );
    expect(bad).toContain("<title id=\"t\"></title>");
    // <desc> is a normal element and keeps its array children.
    const desc = renderToStaticMarkup(
      <svg>
        <desc id="d">Trust Score {42} out of 100.</desc>
      </svg>,
    );
    expect(desc).toContain("Trust Score 42 out of 100.");
  });

  it("classifies children shapes", () => {
    expect(titleChildrenAreArray("Plain text only")).toBe(false);
    expect(titleChildrenAreArray("{radarTitle}")).toBe(false);
    expect(titleChildrenAreArray("{`${s.name} — ${s.pct.toFixed(1)}%`}")).toBe(false);
    expect(titleChildrenAreArray("\n  {`${a}: SVI ${b}${c != null ? ` (${c})` : \"\"}`}\n")).toBe(false);
    expect(titleChildrenAreArray("{s.title}: {s.score} / 100")).toBe(true);
    expect(titleChildrenAreArray("Eight scoring dimensions for a {stage} run")).toBe(true);
    expect(titleChildrenAreArray("{a}{b}")).toBe(true);
    expect(titleChildrenAreArray("{fn({ day: \"numeric\" })}\n: {value}")).toBe(true);
  });

  it("no <title> under src/components or src/app has array children", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        const src = stripComments(readFileSync(file, "utf8"));
        if (!src.includes("<title")) continue;
        for (const m of src.matchAll(TITLE_RE)) {
          if (titleChildrenAreArray(m[1])) {
            const line = src.slice(0, m.index).split("\n").length;
            offenders.push(`${relative(ROOT, file)}:${line}`);
          }
        }
      }
    }
    expect(
      offenders,
      `<title> with array children SSRs empty and throws React #418 on hydration — use one template-literal child, e.g. <title>{\`\${a} — \${b}\`}</title>:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
