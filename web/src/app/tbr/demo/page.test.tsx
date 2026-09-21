// G21-P1-B — /tbr/demo renders the Assessment Card (fixture data) once, above
// the executive summary, and the 8 dimension explainability cards.
// G28-D — /tbr/demo?band=A…D renders the matching `investmentBandFixture`
// through the static ./band/[band] route; every variant links the others.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/marketing/marketing-hero", () => ({
  MarketingHero: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import TbrDemoPage, { metadata } from "./page";
import TbrDemoBandPage, { dynamicParams, generateMetadata, generateStaticParams } from "./band/[band]/page";
import { DEMO_BANDS } from "@/lib/report-v2/demo-band-route";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

async function html(el: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const bandOf = (out: string) => out.match(/data-tbr-band="([A-D])"/)?.[1];

describe("/tbr/demo (G21-P1-B → G27 v3)", () => {
  it("opens with the Dashboard — SVI + Evidence Confidence tiles once, above the Investment view — then the 8 dimension chapters", async () => {
    const out = await html(<TbrDemoPage />);
    // G27: the v3 Dashboard is the ONE surface for SVI + Evidence Confidence (the
    // G21 Assessment Card's numbers now live in its tiles); it renders once,
    // ahead of the Investment view, and never a benchmark line without n.
    expect((out.match(/id="tbr-dashboard"/g) ?? []).length).toBe(1);
    const dash = out.slice(out.indexOf('id="tbr-dashboard"'), out.indexOf('id="tbr-investment-view"'));
    expect(dash).toContain('data-tbr-tile="svi"');
    expect(dash).toContain('data-tbr-tile="evidence"');
    expect(dash).toContain("Evidence confidence");
    expect(out.indexOf('id="tbr-dashboard"')).toBeLessThan(out.indexOf('id="tbr-investment-view"'));
    expect(out.indexOf('id="tbr-investment-view"')).toBeLessThan(out.indexOf('id="tbr-dim-'));
    expect((out.match(/id="tbr-dim-[a-z]+"/g) ?? []).length).toBe(8);
    expect(out).toContain('id="tbr-risk-matrix"');
    expect(out).not.toContain("Australian average");
    expect(out).not.toMatch(/\[ev:|\[unevidenced\]/);
  });

  it("the bare page is band B (the demo as stored) and canonicalises to /tbr/demo", async () => {
    const out = await html(<TbrDemoPage />);
    expect(bandOf(out)).toBe("B");
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/tbr/demo");
  });
});

describe("/tbr/demo?band= (G28-D: one static variant per verdict band)", () => {
  it("generateStaticParams lists exactly A–D and unknown params are not rendered on demand", () => {
    expect(generateStaticParams()).toEqual([{ band: "A" }, { band: "B" }, { band: "C" }, { band: "D" }]);
    expect(dynamicParams).toBe(false);
  });

  it.each(DEMO_BANDS)("band %s renders the matching fixture with its verdict visible and links the other three", async (band) => {
    const out = await html(await TbrDemoBandPage({ params: Promise.resolve({ band }) }));
    expect(bandOf(out)).toBe(band);
    expect(out).toContain(`data-tbr-demo-band-view="${band}"`);
    // The verdict band badge is on the page (dashboard tile + investment view).
    expect(out).toContain(`data-tbr-verdict-band="${band}"`);
    // "See the other verdict bands": four links, the current one marked, all on the public ?band= URL.
    const switcher = out.slice(out.indexOf('data-testid="tbr-demo-bands"'), out.indexOf('data-tbr-demo-band-view='));
    for (const other of DEMO_BANDS) expect(switcher).toContain(`href="/tbr/demo?band=${other}"`);
    expect(switcher).toContain(`aria-current="page" data-tbr-demo-band="${band}"`);
    expect((out.match(/id="tbr-dim-[a-z]+"/g) ?? []).length).toBe(8);
    expect(out).not.toMatch(/\[ev:|\[unevidenced\]/);
    const meta = await generateMetadata({ params: Promise.resolve({ band }) });
    expect(meta.alternates?.canonical).toBe(band === "B" ? "https://blockid.au/tbr/demo" : `https://blockid.au/tbr/demo?band=${band}`);
  });

  it("G28 UI lane: the section title is the same string on every band (no reflow on switch), marketing chrome is print-hidden, the switcher names the band", async () => {
    const titles = new Set<string>();
    for (const band of DEMO_BANDS) {
      const out = await html(await TbrDemoBandPage({ params: Promise.resolve({ band }) }));
      const h2 = out.match(/<h2[^>]*>Trusted Business Report — demo startup<\/h2>/);
      expect(h2, band).toBeTruthy();
      titles.add(h2![0]);
      // the band label lives in the switcher line, not the h2
      const switcher = out.slice(out.indexOf('data-testid="tbr-demo-bands"'), out.indexOf('data-tbr-demo-band-view='));
      expect(switcher.replace(/<!-- -->/g, "")).toContain(`This page shows band ${band}: `);
      // hero (CTAs), switcher and cross-link cards never print — the printed document starts at the report card
      expect((out.match(/data-print="hide"/g) ?? []).length).toBeGreaterThanOrEqual(4);
      expect(out.indexOf('data-print="hide"')).toBeLessThan(out.indexOf("<h1"));
    }
    expect(titles.size).toBe(1);
  });

  it("band D shows pending dimensions (evidence asked before a verdict), band A none", async () => {
    const d = await html(await TbrDemoBandPage({ params: Promise.resolve({ band: "D" }) }));
    const a = await html(await TbrDemoBandPage({ params: Promise.resolve({ band: "A" }) }));
    expect((d.match(/data-tbr-ledger-state="pending"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(d).toContain("Insufficient evidence");
    expect(a).not.toContain('data-tbr-ledger-state="pending"');
    expect(a).toContain("Investable now");
  });

  it("every href on the demo view resolves to a page under src/app (link-check safe)", async () => {
    const out = await html(await TbrDemoBandPage({ params: Promise.resolve({ band: "C" }) }));
    const hrefs = Array.from(new Set(Array.from(out.matchAll(/href="(\/[^"#?]*)/g)).map((m) => m[1])));
    const appDir = join(process.cwd(), "src", "app");
    const groups = readdirSync(appDir).filter((d) => d.startsWith("(") && statSync(join(appDir, d)).isDirectory());
    const pageExists = (path: string) => {
      const rel = path === "/" ? "" : path.slice(1);
      const candidates = [join(appDir, rel, "page.tsx"), ...groups.map((g) => join(appDir, g, rel, "page.tsx"))];
      return candidates.some((c) => existsSync(c));
    };
    const missing = hrefs.filter((h) => !h.startsWith("/api/") && !h.startsWith("/legal") && !h.startsWith("/auth") && !h.startsWith("/workspace") && !pageExists(h));
    expect(missing, `hrefs without a page: ${missing.join(", ")}`).toEqual([]);
    expect(hrefs).toContain("/tbr/demo");
  });
});
