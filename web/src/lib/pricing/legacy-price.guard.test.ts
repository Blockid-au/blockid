// G35 Pricing v5 (P5) — the "no A$3 / A$1 report or credit price" guard.
//
// Static scan of web/src (incl. the i18n messages) and web/content/legal for
// the retired literals (LEGACY_PRICE_PATTERNS). With `payg_enabled` OFF the
// live site still sells the legacy prices, so a literal may survive only in a
// file listed in `legacy-price-allowlist.ts`; a `legacy-gated` file must also
// read the Pricing v5 switch (its literal sits in the flag-OFF branch and the
// colocated test pins the flag-ON copy). A stale allow-list row fails too, so
// the list only ever shrinks. Legal MDX changelog sections are history.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  LEGACY_PRICE_ALLOWLIST,
  LEGACY_PRICE_PATTERNS,
  readsPaygSwitch,
} from "./legacy-price-allowlist";

const WEB_ROOT = resolve(__dirname, "../../..");
const TREES = ["src", "content/legal"];
const EXT = /\.(tsx?|mjs|json|mdx?)$/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s(])\/\/[^\n]*/g, "$1");
}

function walk(path: string, out: string[]): void {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const e of readdirSync(path)) walk(join(path, e), out);
    return;
  }
  if (EXT.test(path) && !/\.(test|spec)\./.test(path)) out.push(path);
}

function scannable(abs: string): string {
  const raw = readFileSync(abs, "utf8");
  if (/\.(tsx?|mjs)$/.test(abs)) return stripComments(raw);
  if (/\.mdx?$/.test(abs)) {
    const i = raw.indexOf("## Changelog");
    return i >= 0 ? raw.slice(0, i) : raw;
  }
  return raw;
}

const files: string[] = [];
for (const t of TREES) walk(resolve(WEB_ROOT, t), files);

const hitsByFile = new Map<string, string[]>();
for (const abs of files) {
  const rel = relative(WEB_ROOT, abs);
  const text = scannable(abs);
  text.split("\n").forEach((line, i) => {
    if (LEGACY_PRICE_PATTERNS.a3.test(line) || LEGACY_PRICE_PATTERNS.a1.test(line)) {
      const arr = hitsByFile.get(rel) ?? [];
      arr.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
      hitsByFile.set(rel, arr);
    }
  });
}

describe("legacy price literals (A$3 / A$1) — G35 P5 guard", () => {
  it("the patterns match prices and skip ranges / magnitudes", () => {
    const { a3, a1 } = LEGACY_PRICE_PATTERNS;
    for (const s of ["Pay A$3 & get my report", "for A$3.", "(A$3)", "A$3 inc. GST", "A$3 · or 3 credits"]) expect(a3.test(s), s).toBe(true);
    for (const s of ["A$3M seed", "A$3m–A$15m", "A$3-8k legal", "A$3–8K", "A$3,500/mo", "A$3.50", "A$30", "A$3B market", "A$349"]) expect(a3.test(s), s).toBe(false);
    for (const s of ["Run a re-score (A$1)", "A$1/credit", "Unlock — A$1", "From A$1."]) expect(a1.test(s), s).toBe(true);
    for (const s of ["A$1M", "A$1–5M", "A$1 of revenue", "A$1+ in revenue", "even A$1 in MRR", "A$1,500", "A$1.00/credit", "A$19", "A$149"]) expect(a1.test(s), s).toBe(false);
  });

  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(files.some((f) => f.endsWith("content/legal/terms-v2.mdx"))).toBe(true);
    expect(files.some((f) => f.endsWith("i18n/messages/en.json"))).toBe(true);
  });

  it("every remaining literal sits in an allow-listed file", () => {
    const offenders = [...hitsByFile.entries()].filter(([rel]) => !LEGACY_PRICE_ALLOWLIST[rel]).flatMap(([, h]) => h);
    expect(
      offenders,
      "Retired A$3 / A$1 price — render it from the PaygView (lib/pricing/payg-copy.ts) or, for a flag-OFF branch, list the file in lib/pricing/legacy-price-allowlist.ts",
    ).toEqual([]);
  });

  it("every legacy-gated file reads the Pricing v5 switch", () => {
    const ungated = Object.entries(LEGACY_PRICE_ALLOWLIST)
      .filter(([, e]) => e.kind === "legacy-gated")
      .filter(([rel]) => !readsPaygSwitch(readFileSync(resolve(WEB_ROOT, rel), "utf8")))
      .map(([rel]) => rel);
    expect(ungated, "a legacy-gated file must branch on payg_enabled (PaygView / isPaygEnabled)").toEqual([]);
  });

  it("no stale allow-list rows (the list only shrinks)", () => {
    const stale = Object.keys(LEGACY_PRICE_ALLOWLIST).filter((rel) => !hitsByFile.has(rel));
    expect(stale, "these files no longer carry a legacy literal — delete their rows").toEqual([]);
  });

  it("Terms and Privacy carry no legacy price outside their changelog", () => {
    for (const rel of ["content/legal/terms-v2.mdx", "content/legal/privacy-v2.mdx"]) {
      expect(hitsByFile.get(rel) ?? [], rel).toEqual([]);
    }
  });

  it("docs/design/messaging.md § 11 carries the same two patterns", () => {
    const doc = readFileSync(resolve(WEB_ROOT, "../docs/design/messaging.md"), "utf8");
    const section = doc.slice(doc.indexOf("## 11. Never say"));
    const spans = [...section.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.replace(/\\\|/g, "|"));
    expect(spans).toContain(LEGACY_PRICE_PATTERNS.a3.source);
    expect(spans).toContain(LEGACY_PRICE_PATTERNS.a1.source);
    expect(section).toContain("@legacy-price-allowlist");
  });
});
