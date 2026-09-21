/**
 * Light-template guard — the scanner behind `light-template.guard.test.ts`
 * (G26, docs/design/unicorn-template.md v2 § 6). Pure functions so the test
 * and any one-off report share one implementation.
 *
 * Rules (each hit is one line of one `.tsx` under `src/app` / `src/components`):
 *   dark-surface   page-level dark grounds: bg-brand-navy*, bg-slate/gray/
 *                  zinc/neutral-9xx, bg-black, bg-[#0…], bg-ink-9xx,
 *                  from-slate-9xx…, data-theme="dark"/"lux" wrappers
 *   text-on-dark   text-white and the legacy near-white brand-ink tokens
 *   raw-color      raw hex / rgb() inside a Tailwind arbitrary value
 *                  (`bg-[#…]`, `text-[rgb(…)]`, …) in a className
 *
 * Allow-list: `light-template.allowlist.json` — `{ file, pattern, reason }`
 * per entry. `file` is a path relative to `src/` (exact, or a prefix ending
 * in `/`); `pattern` is a RegExp source tested against the offending LINE.
 * A hit is allowed when at least one entry matches both.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type RuleId = "dark-surface" | "text-on-dark" | "raw-color";

export interface Rule {
  id: RuleId;
  /** Global regex; every match on a line is one hit. */
  re: RegExp;
  hint: string;
}

export const RULES: readonly Rule[] = [
  {
    id: "dark-surface",
    re: /\b(?:bg-brand-navy[\w-]*(?:\/\d+)?|bg-(?:slate|gray|zinc|neutral|stone)-9\d\d(?:\/\d+)?|bg-black(?:\/\d+)?|bg-\[#0[0-9a-fA-F]*\]|bg-ink-9\d\d(?:\/\d+)?|bg-fintech-[\w-]*|bg-lux-radial|(?:from|via|to)-(?:slate|gray|zinc|neutral|stone)-9\d\d|(?:from|via|to)-brand-navy[\w-]*|(?:from|via|to)-ink-9\d\d)|data-theme=(?:"|'|\{")(?:dark|lux)/g,
    hint: "replace with bg-surface / bg-surface-sunken (+ text-primary); a navy accent LINE, not a navy band",
  },
  {
    id: "text-on-dark",
    re: /\btext-white(?:\/\d+)?\b|\btext-brand-ink(?:-muted)?\b/g,
    hint: "text-white → text-primary (text-ink); text-brand-ink-muted → text-secondary / text-muted",
  },
  {
    id: "raw-color",
    re: /\b(?:bg|text|border|from|via|to|ring|fill|stroke|shadow|outline|decoration|divide|placeholder|caret|accent)-\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]*\)|hsla?\([^\]]*\))\]/g,
    hint: "use a semantic token utility (bg-surface, text-primary, border-line, bg-action …)",
  },
];

export interface AllowEntry {
  /** `src/`-relative path (exact), a directory prefix ending in `/`, or `*` for any file. */
  file: string;
  /** Which rule the entry excuses; omitted = every rule. */
  rule?: RuleId;
  /** RegExp source tested against the offending LINE. */
  pattern: string;
  reason: string;
}

export interface Hit {
  rule: RuleId;
  file: string;
  line: number;
  token: string;
  text: string;
}

export function* walkTsx(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walkTsx(full);
    else if (/\.tsx$/.test(name) && !/\.(test|spec|stories)\.tsx$/.test(name)) yield full;
  }
}

/** True when a line is a comment (JSDoc, `//`, JSX comment) — prose about a class is not a use of it. */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

/** `bg-brand-navy/10`, `bg-black/20` … are washes on a light ground, not dark surfaces. */
function isLightTint(token: string): boolean {
  const m = /\/(\d+)$/.exec(token);
  return m !== null && Number(m[1]) <= 30;
}

export function scanFile(srcRoot: string, absPath: string): Hit[] {
  const rel = relative(srcRoot, absPath).split(sep).join("/");
  const lines = readFileSync(absPath, "utf8").split("\n");
  const hits: Hit[] = [];
  lines.forEach((text, i) => {
    if (isCommentLine(text)) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const m of text.matchAll(rule.re)) {
        if (rule.id === "dark-surface" && isLightTint(m[0])) continue;
        hits.push({ rule: rule.id, file: rel, line: i + 1, token: m[0], text: text.trim() });
      }
    }
  });
  return hits;
}

export function scanTree(srcRoot: string, roots: readonly string[] = ["app", "components"]): Hit[] {
  const out: Hit[] = [];
  for (const r of roots) for (const f of walkTsx(join(srcRoot, r))) out.push(...scanFile(srcRoot, f));
  return out;
}

export function compileAllowList(entries: readonly AllowEntry[]): ((hit: Hit) => AllowEntry | undefined) {
  const compiled = entries.map((e) => ({ e, re: new RegExp(e.pattern) }));
  return (hit) => {
    for (const { e, re } of compiled) {
      if (e.rule && e.rule !== hit.rule) continue;
      const fileOk = e.file === "*" || (e.file.endsWith("/") ? hit.file.startsWith(e.file) : hit.file === e.file);
      if (fileOk && re.test(hit.text)) return e;
    }
    return undefined;
  };
}

export type Area = "marketing" | "workspace" | "evaluator-admin" | "reports" | "other";

/** Maps a `src/`-relative path to the G26 page lane that owns it. */
export function areaOf(file: string): Area {
  if (/^app\/\(app\)\/\(admin\)\//.test(file) || /^components\/(admin|evaluations|accelerator|investor)\//.test(file)) return "evaluator-admin";
  if (/^app\/\(app\)\/\(founder\)\/(workspace\/(evaluations|accelerator|investor)|dashboard\/admin)\//.test(file)) return "evaluator-admin";
  if (/^app\/\(app\)\//.test(file) || /^components\/(workspace|dashboard|svi|onboarding|layout|founder|fundraise|search|equity|esop|dataroom|cap-table|connectors)\//.test(file)) return "workspace";
  if (/^components\/(tbr|report-visuals|reports?|email)\//.test(file) || /^app\/(tbr|s|r)\//.test(file)) return "reports";
  if (/^app\/\(marketing\)\//.test(file) || /^app\/vi\//.test(file) || /^components\/(landing|marketing|showcase|seo|brand)\//.test(file)) return "marketing";
  if (/^app\/(docs|guide|guides|insights|funding|startup-index|compare|tools|legal|benchmarks|dataset|nps|showcase|analyze|startup-package|search|signup|auth|login|unsubscribe|developers|pilot|team|changelog|roadmap|status|contact|pricing|samples|product|methodology|solutions|for)\b/.test(file)) return "marketing";
  return "other";
}

export interface Summary {
  total: number;
  byRule: Record<RuleId, number>;
  byArea: Record<Area, number>;
  /** area → rule → count */
  matrix: Record<Area, Record<RuleId, number>>;
  /** area → [file, hits] sorted desc, top N */
  topFiles: Record<Area, [string, number][]>;
  files: Map<string, Hit[]>;
}

export function summarise(hits: readonly Hit[], topN = 8): Summary {
  const rules: RuleId[] = ["dark-surface", "text-on-dark", "raw-color"];
  const areas: Area[] = ["marketing", "workspace", "evaluator-admin", "reports", "other"];
  const zeroRules = () => Object.fromEntries(rules.map((r) => [r, 0])) as Record<RuleId, number>;
  const s: Summary = {
    total: hits.length,
    byRule: zeroRules(),
    byArea: Object.fromEntries(areas.map((a) => [a, 0])) as Record<Area, number>,
    matrix: Object.fromEntries(areas.map((a) => [a, zeroRules()])) as Record<Area, Record<RuleId, number>>,
    topFiles: Object.fromEntries(areas.map((a) => [a, [] as [string, number][]])) as Record<Area, [string, number][]>,
    files: new Map(),
  };
  const perAreaFile = new Map<Area, Map<string, number>>();
  for (const h of hits) {
    const a = areaOf(h.file);
    s.byRule[h.rule]++;
    s.byArea[a]++;
    s.matrix[a][h.rule]++;
    if (!s.files.has(h.file)) s.files.set(h.file, []);
    s.files.get(h.file)!.push(h);
    if (!perAreaFile.has(a)) perAreaFile.set(a, new Map());
    const m = perAreaFile.get(a)!;
    m.set(h.file, (m.get(h.file) ?? 0) + 1);
  }
  for (const [a, m] of perAreaFile) {
    s.topFiles[a] = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, topN);
  }
  return s;
}

export function formatReport(s: Summary): string {
  const lines: string[] = [];
  lines.push(`light-template guard: ${s.total} hit(s) in ${s.files.size} file(s) outside the allow-list`);
  lines.push("  rule          total   marketing  workspace  eval/admin  reports  other");
  for (const r of ["dark-surface", "text-on-dark", "raw-color"] as RuleId[]) {
    const row = [s.byRule[r], s.matrix.marketing[r], s.matrix.workspace[r], s.matrix["evaluator-admin"][r], s.matrix.reports[r], s.matrix.other[r]];
    lines.push(`  ${r.padEnd(13)} ${row.map((n, i) => String(n).padStart(i === 0 ? 5 : i === 1 ? 10 : i === 2 ? 10 : i === 3 ? 11 : i === 4 ? 8 : 6)).join("")}`);
  }
  for (const a of ["marketing", "workspace", "evaluator-admin", "reports", "other"] as Area[]) {
    if (s.byArea[a] === 0) continue;
    lines.push(`  top offenders — ${a} (${s.byArea[a]} hits):`);
    for (const [f, n] of s.topFiles[a]) lines.push(`    ${String(n).padStart(4)}  ${f}`);
  }
  return lines.join("\n");
}

export function formatPerFile(s: Summary, maxLinesPerFile = 6): string {
  const out: string[] = [];
  const files = [...s.files.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [f, hs] of files) {
    out.push(`${f} (${hs.length})`);
    for (const h of hs.slice(0, maxLinesPerFile)) out.push(`    L${h.line} [${h.rule}] ${h.token}  — ${h.text.slice(0, 110)}`);
    if (hs.length > maxLinesPerFile) out.push(`    … ${hs.length - maxLinesPerFile} more`);
  }
  return out.join("\n");
}
