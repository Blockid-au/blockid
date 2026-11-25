// G36 tick 3 — links to query URLs the proxy serves from another route must
// be full document navigations. Pins the decision (shared with the proxy)
// and guards every source file against a `next/link` to one of them.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { grantsRewriteTarget } from "@/lib/funding/grants-route";
import { demoBandHref, demoBandRewriteTarget, DEMO_BANDS } from "@/lib/report-v2/demo-band-route";
import { grantsStatePath } from "@/lib/funding/seo";
import { filterHref } from "@/lib/funding/directory";
import { AU_STATES } from "@/lib/funding/seed-map";
import { internalRouteFor, needsDocumentNavigation } from "./internal-route";

describe("internalRouteFor — the proxy's decision", () => {
  it("is grantsRewriteTarget ?? demoBandRewriteTarget", () => {
    const cases: Array<[string, string]> = [
      ["/funding/grants", ""],
      ["/funding/grants", "state=NSW"],
      ["/funding/grants", "state=nsw"],
      ["/funding/grants", "state=junk"],
      ["/funding/grants", "type=grant&stage=idea"],
      ["/funding/grants", "utm_source=x"],
      ["/tbr/demo", "band=C"],
      ["/tbr/demo", "band=z"],
      ["/tbr/demo", ""],
      ["/pricing", "state=NSW"],
    ];
    for (const [p, q] of cases) {
      const sp = new URLSearchParams(q);
      expect(internalRouteFor(p, sp), `${p}?${q}`).toBe(grantsRewriteTarget(p, sp) ?? demoBandRewriteTarget(p, sp));
    }
  });
});

describe("needsDocumentNavigation", () => {
  it("is true for every URL the proxy serves from another route", () => {
    for (const st of AU_STATES) expect(needsDocumentNavigation(grantsStatePath(st)), st).toBe(true);
    for (const band of DEMO_BANDS) expect(needsDocumentNavigation(demoBandHref(band)), band).toBe(true);
    expect(needsDocumentNavigation("/funding/grants?type=grant")).toBe(true);
    expect(needsDocumentNavigation("/funding/grants?state=NSW&stage=idea")).toBe(true);
    expect(needsDocumentNavigation("/funding/grants?state=junk")).toBe(true); // → /view
    expect(needsDocumentNavigation(filterHref("/funding/grants", { state: null, type: null }, { type: "loan" }))).toBe(true);
    expect(needsDocumentNavigation("https://blockid.au/funding/grants?state=VIC#grants")).toBe(true);
  });

  it("is false for URLs served by their own path (client navigation stays)", () => {
    for (const href of [
      "/funding/grants",
      "/funding/grants?utm_source=newsletter",
      "/funding/grants#filters",
      "/funding/grants/instant-asset-write-off",
      "/funding/programs?state=NSW",
      filterHref("/funding/programs", { state: null }, { state: "NSW" }),
      "/tbr/demo",
      "/tbr/demo?band=Z",
      "/pricing?segment=evaluator",
      "mailto:hello@example.com",
      "",
    ]) {
      expect(needsDocumentNavigation(href), href).toBe(false);
    }
  });
});

// ── Guard: no `next/link` to one of those URLs anywhere in src ───────────
//
// The helpers that build them (and the enrich `stateGrants` link) must go
// through RewriteAwareLink (components/site/rewrite-aware-link.tsx) or a
// plain <a>. A `<Link href={grantsStatePath(…)}>` would silently bring back
// the bug: base page content under the filtered URL.

const SRC = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) out.push(p);
  }
  return out;
}

const REWRITTEN_HREF = /grantsStatePath\(|demoBandHref\(|filterHref\(|stateGrants|["'`]\/funding\/grants\?|["'`]\/tbr\/demo\?band/;

/** Every `<Link …>` opening tag in a file (attributes may span lines). */
function linkTags(src: string): string[] {
  const out: string[] = [];
  const re = /<Link\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Scan to the closing `>` of the opening tag, skipping `{…}` expressions.
    let depth = 0;
    let i = m.index + 5;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

describe("guard: filtered public URLs are never a next/link", () => {
  it("the tag scanner sees multi-line attributes", () => {
    const tags = linkTags(`<Link\n  href={grantsStatePath(s)}\n  className={cn("a", x > 1 && "b")}\n>x</Link>`);
    expect(tags).toHaveLength(1);
    expect(REWRITTEN_HREF.test(tags[0])).toBe(true);
  });

  it("no <Link> in src builds its href from a rewritten-URL helper", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("<Link")) continue;
      for (const tag of linkTags(src)) {
        if (REWRITTEN_HREF.test(tag)) offenders.push(`${path.relative(SRC, file)}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
