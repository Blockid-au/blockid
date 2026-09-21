/**
 * G26-W1 — the founder workspace renders on the light template only.
 *
 * One test per source file (page, layout, client and component) in the W1
 * scope: no dark-surface utility, no `dark:` variant, no `data-theme="dark"`
 * wrapper, no dark gradient band, no raw hex in a className, no white-ink
 * literal (`text-brand-ink`) that only reads on navy. Lane T's site-wide
 * guard (`src/design/light-template.guard.test.ts`) covers the marketing
 * trees; this pin is the per-page contract for the workspace so a
 * regression names the file.
 *
 * Out of scope (other lanes own them): `workspace/evaluations`,
 * `workspace/accelerator`, `workspace/investor` (W2) and `dashboard/admin`
 * (admin). Allow-list entries need a reason.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

const SCOPE_DIRS = [
  "app/(app)/(founder)/workspace",
  "app/(app)/(founder)/dashboard",
  "app/(app)/onboarding",
  "components/workspace",
  "components/dashboard",
  "components/svi",
  "components/onboarding",
  "components/billing",
  "components/upsell",
];

const EXCLUDE = [
  /\/workspace\/evaluations\//,
  /\/workspace\/accelerator\//,
  /\/workspace\/investor\//,
  /\/dashboard\/admin\//,
  /\.test\.tsx?$/,
  /\.legacy\.tsx?$/,
];

/** Allowed occurrences — file → reason. Keep this list short (empty today). */
const ALLOW: Record<string, string> = {};

const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  { name: "dark: variant", re: /(?<![\w\-:/])dark:[a-z]/ },
  { name: 'data-theme="dark" wrapper', re: /data-theme="dark"/ },
  // A solid navy fill (`bg-brand-navy`, `bg-brand-navy-elev-1`, `bg-brand-navy-deep`); a translucent wash (`bg-brand-navy/10`) is the active-item tint, not a surface.
  { name: "bg-brand-navy* surface", re: /\bbg-brand-navy(?:-elev-\d|-deep)?(?![\w\-/])/ },
  { name: "bg-slate-8xx/9xx surface", re: /\bbg-slate-[89]\d\d\b/ },
  { name: "bg-ink-8xx/9xx surface", re: /\bbg-ink-[89]\d\d\b/ },
  { name: "bg-gray/zinc/neutral-8xx/9xx surface", re: /\bbg-(gray|zinc|neutral)-[89]\d\d\b/ },
  { name: "bg-black", re: /\bbg-black\b/ },
  { name: "bg-[#0…] literal", re: /\bbg-\[#0/ },
  { name: "dark gradient band", re: /\bfrom-(brand|violet|ink|slate)-[6-9]\d\d\b[^"'`]*\bto-(brand|violet|ink|slate)-[6-9]\d\d\b/ },
  { name: "lux theme scope", re: /data-theme="lux"|\blux-card\b|\bbg-lux-radial\b/ },
  { name: "white-ink literal (text-brand-ink)", re: /\btext-brand-ink(?!-dark)/ },
  { name: "raw hex in className", re: /className="[^"]*#[0-9a-fA-F]{3,6}\b/ },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCOPE_DIRS.flatMap((d) => walk(path.join(SRC, d)))
  .map((p) => path.relative(SRC, p))
  .filter((rel) => !EXCLUDE.some((re) => re.test(`/${rel}`)))
  .sort();

describe("G26-W1 light workspace — every page and component renders without a dark surface", () => {
  it("scans the founder workspace scope", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it.each(files)("%s", (rel) => {
    if (ALLOW[rel]) return;
    const src = readFileSync(path.join(SRC, rel), "utf8");
    const hits = FORBIDDEN.filter((f) => f.re.test(src)).map((f) => f.name);
    expect(hits, `${rel} still carries a dark surface: ${hits.join(", ")}`).toEqual([]);
  });

  it("the allow-list only names files that exist and still need it", () => {
    for (const rel of Object.keys(ALLOW)) {
      expect(files).toContain(rel);
      const src = readFileSync(path.join(SRC, rel), "utf8");
      expect(FORBIDDEN.some((f) => f.re.test(src)), `${rel} no longer needs its allow-list entry`).toBe(true);
    }
  });
});
