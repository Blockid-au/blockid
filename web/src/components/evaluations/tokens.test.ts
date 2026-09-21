// G24 UI/UX lane (2026-09-21): the evaluator workspace must render from
// semantic tokens only. `bg-white` and `text-brand-700` are light-only —
// under OS dark the ink tokens flip to near-white while the ground stays
// white (1.1:1 on /workspace/evaluations, the Cohorts list and the demo
// chip on the day of the G24 release). `dark:` utilities do not help: the
// `dark` variant is class-scoped (`.dark`), never `prefers-color-scheme`.
// Raw hex / rgb() in markup bypass the token pairs the same way.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SCOPES = [
  "src/components/evaluations",
  "src/components/accelerator",
  "src/components/tbr/v2",
  "src/app/(app)/(founder)/workspace/evaluations",
  "src/app/(app)/(founder)/workspace/accelerator",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

// Strip line and block comments so a rationale comment can name the banned class.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const RULES: Array<{ name: string; re: RegExp }> = [
  { name: "bg-white (light-only ground — use bg-surface)", re: /(?<![\w-])bg-white(?:\/\d+)?\b/ },
  { name: "text-brand-700 (2.9:1 on the dark surface — use text-action)", re: /(?<![\w-])text-brand-700\b/ },
  { name: "bg-brand-50 as a ground (light-only — use bg-info-soft / bg-surface-sunken)", re: /(?<![\w-/])bg-brand-50\b/ },
  { name: "raw hex colour in markup", re: /#[0-9a-fA-F]{6}\b/ },
  { name: "raw rgb()/rgba() in markup", re: /\brgba?\(/ },
];

describe("evaluator workspace colour tokens (G24 UI lane)", () => {
  const files = SCOPES.flatMap((s) => walk(path.join(ROOT, s)));

  it("scans the expected surfaces", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  for (const rule of RULES) {
    it(`no ${rule.name}`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        const src = stripComments(readFileSync(f, "utf8"));
        const m = src.match(rule.re);
        if (m) offenders.push(`${path.relative(ROOT, f)}: …${src.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40).replace(/\s+/g, " ")}…`);
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});
