// Every internal link in the /insights corpus must resolve (release QA-1 #4,
// 2026-09-12).
//
// The crawl found `/tools/valuation-calculator` and
// `/tools/pre-money-valuation-calculator` — neither ever existed — linked
// from eight articles plus their manifest / topic-queue CTAs. Articles are
// model-written markdown, so a link target is only as real as the model's
// memory of the route table. This test walks every `content/insights/*.md(x)`
// body (markdown `[..](/path)` and raw `href="/path"`), every manifest
// `cta.href` and every queued topic's `cta.href`, and asserts each one is
//
//   * an App Router page (`src/app/**/page.tsx`, dynamic segments allowed), or
//   * a redirect source in next.config.ts whose destination is a page, or
//   * a URL the sitemap advertises.
//
// Also pins release QA-1 #11: no SVG `rx` attribute carries more than one
// value (`rx="12 12 0 0"` is invalid — the header bars rendered square).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import nextConfig from "../../next.config";
import { listAppRoutes, matchRoute, pathnameOf } from "@/lib/seo/app-routes";

const CONTENT_DIR = join(process.cwd(), "content", "insights");
const APP_DIR = resolve(__dirname, "../app");
const ROUTES = listAppRoutes(APP_DIR);

type Redirect = { source: string; destination: string };

async function redirectMap(): Promise<Map<string, string>> {
  const list = (await nextConfig.redirects!()) as Redirect[];
  return new Map(list.filter((r) => !r.source.includes(":")).map((r) => [r.source, pathnameOf(r.destination)]));
}

function articleFiles(): string[] {
  return readdirSync(CONTENT_DIR)
    .filter((f) => /\.mdx?$/.test(f))
    .sort();
}

/** Internal hrefs in a markdown body: `[text](/path)` and raw `href="/path"`. */
function internalLinks(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/\]\((\/[^)\s]*)\)/g)) out.push(m[1]!);
  for (const m of md.matchAll(/href="(\/[^"]*)"/g)) out.push(m[1]!);
  for (const m of md.matchAll(/\]\((https?:\/\/(?:www\.)?blockid\.au[^)\s]*)\)/gi)) out.push(m[1]!);
  return out;
}

function ctaHrefs(file: string, key: "articles" | "topics"): Array<{ slug: string; href: string }> {
  const raw = JSON.parse(readFileSync(join(CONTENT_DIR, file), "utf8")) as Record<string, Array<{ slug?: string; cta?: { href?: string } }>>;
  return (raw[key] ?? [])
    .filter((x) => typeof x.cta?.href === "string")
    .map((x) => ({ slug: String(x.slug), href: x.cta!.href! }));
}

describe("insights — every internal link resolves (release QA-1 #4)", () => {
  it("article bodies link only to real routes, redirects to real routes, or sitemap URLs", async () => {
    const redirects = await redirectMap();
    const broken: string[] = [];
    let checked = 0;
    for (const f of articleFiles()) {
      const md = readFileSync(join(CONTENT_DIR, f), "utf8");
      for (const href of internalLinks(md)) {
        checked += 1;
        const p = pathnameOf(href);
        if (matchRoute(ROUTES, p)) continue;
        const dest = redirects.get(p);
        if (dest && matchRoute(ROUTES, dest)) continue;
        broken.push(`${f}: ${href}`);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(broken, "broken internal links in content/insights").toEqual([]);
  });

  it("manifest + topic-queue CTAs point at real routes (never /tools/valuation-calculator or /tools/cap-table-template)", async () => {
    const redirects = await redirectMap();
    const broken: string[] = [];
    for (const [file, key] of [["manifest.json", "articles"], ["topic-queue.json", "topics"]] as const) {
      for (const { slug, href } of ctaHrefs(file, key)) {
        const p = pathnameOf(href);
        if (matchRoute(ROUTES, p)) continue;
        const dest = redirects.get(p);
        if (dest && matchRoute(ROUTES, dest)) continue;
        broken.push(`${file} ${slug}: ${href}`);
      }
    }
    expect(broken).toEqual([]);
    const all = readFileSync(join(CONTENT_DIR, "manifest.json"), "utf8") + readFileSync(join(CONTENT_DIR, "topic-queue.json"), "utf8");
    expect(all).not.toContain("/tools/valuation-calculator");
    expect(all).not.toContain("/tools/pre-money-valuation-calculator");
    expect(all).not.toContain("/tools/cap-table-template");
  });

  it("the duplicate cap-table exit article is gone from disk, manifest and queue (release QA-1 #12)", () => {
    const files = articleFiles();
    expect(files).toContain("optimise-startup-cap-table-for-acquisition-exit.md");
    expect(files).not.toContain("optimising-startup-cap-table-for-acquisition-exit.md");
    for (const [file, key] of [["manifest.json", "articles"], ["topic-queue.json", "topics"]] as const) {
      const raw = JSON.parse(readFileSync(join(CONTENT_DIR, file), "utf8")) as Record<string, Array<{ slug?: string }>>;
      expect(raw[key]!.map((x) => x.slug), file).not.toContain("optimising-startup-cap-table-for-acquisition-exit");
    }
  });

  it("no SVG rx / ry attribute carries more than one value (release QA-1 #11)", () => {
    const bad: string[] = [];
    for (const f of articleFiles()) {
      const md = readFileSync(join(CONTENT_DIR, f), "utf8");
      for (const m of md.matchAll(/\br[xy]="([^"]*)"/g)) {
        if (/\s/.test(m[1]!.trim())) bad.push(`${f}: r?="${m[1]}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});
