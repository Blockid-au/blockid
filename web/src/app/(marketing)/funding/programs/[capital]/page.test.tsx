// Colocated render test for /funding/programs, /funding/programs/[capital]
// and /funding/programs/[capital]/[id] (T0241). `listPrograms` / `getProgram`
// are mocked; the marketing shell is a pass-through; rendered through
// renderToReadableStream so nested async JSON-LD components resolve.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import type { AuProgram } from "@/lib/funding/data";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function program(over: Partial<AuProgram>): AuProgram {
  return {
    id: "p",
    name: "Program",
    operator: "Operator",
    program_type: "accelerator",
    city: "Sydney",
    capital: "Sydney",
    state: "NSW",
    venue: null,
    stage_tags: ["mvp"],
    industry_tags: [],
    demographic_tags: [],
    length_weeks: 12,
    intake_months: [],
    applications_open: null,
    applications_close: null,
    next_cohort_start: null,
    benefits: ["Mentors", "Demo Day"],
    funding_aud: null,
    equity_pct: null,
    cost_to_founder: "free",
    eligibility: { region: "AU/NZ" },
    status: "open",
    official_url: "https://example.com/apply",
    summary: "Short summary.",
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "high",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...over,
  };
}

const rows: AuProgram[] = [
  program({
    id: "syd-startmate",
    name: "Startmate Accelerator",
    intake_months: [1, 7],
    applications_close: "2026-11-08",
    next_cohort_start: "2027-01-25",
    funding_aud: 120000,
    equity_pct: "≤8%",
    venue: "Hybrid",
  }),
  program({ id: "syd-techstars", name: "Techstars Sydney", status: "closed", applications_close: "2025-01-01" }),
  program({ id: "syd-wollongong", name: "iAccelerate", city: "Wollongong", program_type: "incubator", status: "upcoming", applications_close: "2027-03" }),
  program({ id: "per-plus-eight", name: "Plus Eight", city: "Perth", capital: "Perth", state: "WA" }),
];

vi.mock("@/lib/funding/data", () => ({
  listPrograms: async (opts?: { capital?: string }) => (opts?.capital ? rows.filter((r) => r.capital === opts.capital) : rows),
  getProgram: async (id: string) => rows.find((r) => r.id === id) ?? null,
  // S9-B: the detail page ranks related grants through the matcher; an empty pool just omits the list.
  listGrants: async () => [],
}));

import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import ProgramsDirectoryPage, { metadata as indexMetadata } from "../page";
import CapitalProgramsPage, { generateMetadata, generateStaticParams } from "./page";
import ProgramDetailPage, { generateMetadata as detailMetadata } from "./[id]/page";

async function toHtml(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/funding/programs — index", () => {
  it("renders the H1, nine capital cards with live counts, and the mixed list", async () => {
    const html = await toHtml(await ProgramsDirectoryPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Startup accelerators, incubators and programs in every Australian capital");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('data-total-count="4"');
    expect(html).toContain('data-open-count="2"');
    for (const c of ["sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "hobart", "darwin", "remote"]) {
      expect(html).toContain(`href="/funding/programs/${c}"`);
    }
    expect(html).toContain("Australia-wide / online");
    expect(html).toContain('data-program-id="per-plus-eight"');
  });

  it("groups the list by capital in CAPITALS order — H2 links to the capital page, count + satellite note, compact rows open-first, every detail URL once (S10-A)", async () => {
    const html = await toHtml(await ProgramsDirectoryPage({ searchParams: Promise.resolve({}) }));
    const syd = html.indexOf('data-capital-group="Sydney"');
    const per = html.indexOf('data-capital-group="Perth"');
    expect(syd).toBeGreaterThanOrEqual(0);
    expect(syd).toBeLessThan(per);
    expect(html).not.toContain('data-capital-group="Melbourne"');
    expect(html).toContain('<h2 id="capital-sydney" class="font-display text-2xl font-semibold tracking-tight text-primary"><a class="underline-offset-4 hover:underline" href="/funding/programs/sydney">Sydney</a></h2>');
    expect(html).toContain("3 programs · 1 open · also covers Wollongong");
    expect(html).toContain("1 program · 1 open");
    // Open → upcoming → closed inside the Sydney group; the closed row has no plan CTA; Wollongong shows its city.
    const open = html.indexOf('data-program-id="syd-startmate"');
    const upcoming = html.indexOf('data-program-id="syd-wollongong"');
    const closed = html.indexOf('data-program-id="syd-techstars"');
    expect(open).toBeLessThan(upcoming);
    expect(upcoming).toBeLessThan(closed);
    expect(html).toContain('href="/funding?program=syd-startmate"');
    expect(html).not.toContain('href="/funding?program=syd-techstars"');
    expect(html).toContain("Wollongong");
    expect(html).toContain('data-deadline-status="overdue"');
    expect(html).toContain("A$120,000 · ≤8% equity");
    // No card body: the summary and official link live on the detail page; no inline SVG per row.
    expect(html).not.toContain("Short summary.");
    expect(html).not.toContain('href="https://example.com/apply"');
    for (const p of rows) expect(html.split(`href="/funding/programs/${p.capital.toLowerCase()}/${p.id}"`).length - 1, p.id).toBe(1);
    // Under six rows: no <details> tail, the group links to its calendar instead.
    expect(html).not.toContain("<details");
    expect(html).toContain("See the Sydney intake calendar");
    // Heading order: one H1, the "Pick your capital" H2, then the group H2s; rows are H3.
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html.indexOf("Pick your capital")).toBeLessThan(syd);
    expect(html.indexOf("<h3>")).toBeGreaterThan(syd);
  });

  it("filters by capital slug from searchParams", async () => {
    const html = await toHtml(await ProgramsDirectoryPage({ searchParams: Promise.resolve({ capital: "perth" }) }));
    expect(html).toContain('data-program-id="per-plus-eight"');
    expect(html).not.toContain('data-program-id="syd-startmate"');
  });

  it("metadata: ≤ 60 title via the root template, 140–160 description, absolute canonical, OG image; guides strip + valid JSON-LD (S8-A)", async () => {
    expect(indexMetadata.title).toBe("Startup accelerators & incubators in Australia");
    expect(`${String(indexMetadata.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(indexMetadata.description).length).toBeGreaterThanOrEqual(140);
    expect(String(indexMetadata.description).length).toBeLessThanOrEqual(160);
    expect(indexMetadata.alternates?.canonical).toBe("https://blockid.au/funding/programs");
    expect((indexMetadata.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    const html = await toHtml(await ProgramsDirectoryPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/insights/australian-startup-accelerators-2026"');
    for (const b of extractJsonLd(html)) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
  });
});

describe("/funding/programs/[capital]", () => {
  it("static params are the nine lowercase capital slugs", () => {
    expect(generateStaticParams().map((p) => p.capital)).toEqual([
      "sydney",
      "melbourne",
      "brisbane",
      "perth",
      "adelaide",
      "canberra",
      "hobart",
      "darwin",
      "remote",
    ]);
  });

  it("metadata targets 'accelerators & incubators in <city>' (≤ 60 with brand), names the satellite cities, absolute canonical; unknown slugs are noindex", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ capital: "Sydney" }) });
    expect(md.title).toBe("Startup accelerators & incubators in Sydney");
    expect(`${String(md.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(md.description)).toContain("Sydney, Wollongong");
    expect(String(md.description).length).toBeGreaterThanOrEqual(140);
    expect(String(md.description).length).toBeLessThanOrEqual(160);
    expect(md.alternates?.canonical).toBe("https://blockid.au/funding/programs/sydney");
    expect((md.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    const bne = await generateMetadata({ params: Promise.resolve({ capital: "brisbane" }) });
    expect(String(bne.description)).toContain("Gold Coast, Sunshine Coast and Regional Queensland");
    const remote = await generateMetadata({ params: Promise.resolve({ capital: "remote" }) });
    expect(String(remote.title)).toContain("Online startup accelerators");
    expect((await generateMetadata({ params: Promise.resolve({ capital: "gold-coast" }) })).robots).toEqual({ index: false, follow: false });
  });

  it("renders the H1, twelve-month calendar, open-first list with closed rows marked, and Event JSON-LD", async () => {
    const html = await toHtml(await CapitalProgramsPage({ params: Promise.resolve({ capital: "sydney" }) }));
    expect(html).toContain("Startup accelerators and incubators in Sydney");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('data-total-count="3"');
    expect(html).toContain('data-open-count="1"');
    expect(html.match(/data-month="/g)).toHaveLength(12);
    expect(html).toContain("Applications close · 8 November");
    // Wollongong rolls into the Sydney page (G11-5) and shows its city.
    expect(html).toContain('data-program-id="syd-wollongong"');
    expect(html).toContain("Wollongong");
    // Open before upcoming before closed; closed carries the warning and no plan CTA.
    const open = html.indexOf('data-program-id="syd-startmate"');
    const upcoming = html.indexOf('data-program-id="syd-wollongong"');
    const closed = html.indexOf('data-program-id="syd-techstars"');
    expect(open).toBeLessThan(upcoming);
    expect(upcoming).toBeLessThan(closed);
    expect(html).toContain("Closed — do not apply");
    expect(html).not.toContain('href="/funding?program=syd-techstars"');
    expect(html).toContain('href="/funding?program=syd-startmate"');
    // Perth row is not on the Sydney page.
    expect(html).not.toContain('data-program-id="per-plus-eight"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"@type":"Event"');
    expect(html).toContain('"startDate":"2027-01-25"');
    expect(html).toContain('data-surface="funding_directory"');
  });

  it("describes the capital → city grouping in copy, links the state grants view, the demo and the guides; every JSON-LD block validates (S8-A)", async () => {
    const syd = await toHtml(await CapitalProgramsPage({ params: Promise.resolve({ capital: "sydney" }) }));
    expect(syd).toContain('data-capital-coverage');
    expect(syd).toContain("Sydney listings also cover Wollongong, so the whole New South Wales startup ecosystem");
    expect(syd).toContain('href="/funding/grants?state=NSW"');
    expect(syd).toContain('href="/funding/report/demo"');
    expect(syd).toContain('data-funding-guides="strip"');
    for (const b of extractJsonLd(syd)) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    const per = await toHtml(await CapitalProgramsPage({ params: Promise.resolve({ capital: "perth" }) }));
    expect(per).not.toContain("data-capital-coverage");
    expect(per).toContain('href="/funding/grants?state=WA"');
    const remote = await toHtml(await CapitalProgramsPage({ params: Promise.resolve({ capital: "remote" }) }));
    expect(remote).toContain("Online startup accelerators and programs, Australia-wide");
    expect(remote).toContain('href="/funding/grants?state=national"');
  });

  it("404s an unknown capital", async () => {
    await expect(CapitalProgramsPage({ params: Promise.resolve({ capital: "gold-coast" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("/funding/programs/[capital]/[id]", () => {
  it("renders benefits, terms, eligibility, official link and the A$3 plan CTA", async () => {
    const html = await toHtml(await ProgramDetailPage({ params: Promise.resolve({ capital: "sydney", id: "syd-startmate" }) }));
    expect(html).toContain("Startmate Accelerator");
    expect(html).toContain("Mentors");
    expect(html).toContain("A$120,000");
    expect(html).toContain("≤8%");
    expect(html).toContain('data-gate="region"');
    expect(html).toContain("AU/NZ");
    expect(html).toContain('href="https://example.com/apply" rel="nofollow noopener noreferrer" target="_blank"');
    expect(html).toContain("Add to my plan for A$3");
    expect(html).toContain('href="/funding?program=syd-startmate"');
    expect(html).toContain('"@type":"Service"');
    expect(html).toContain('"@type":"Event"');
    expect(html).toContain("January, July");
    const md = await detailMetadata({ params: Promise.resolve({ capital: "sydney", id: "syd-startmate" }) });
    expect(md.alternates?.canonical).toBe("https://blockid.au/funding/programs/sydney/syd-startmate");
    // S8-A: absolute `name — noun in city, STATE` title ≤ 60, composed 140–160 description, OG image.
    expect(md.title).toEqual({ absolute: "Startmate Accelerator — accelerator program in Sydney, NSW" });
    expect(String(md.description)).toContain("Startmate Accelerator: accelerator program run by Operator in Sydney, New South Wales.");
    expect(String(md.description).length).toBeGreaterThanOrEqual(140);
    expect(String(md.description).length).toBeLessThanOrEqual(160);
    expect((md.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    // Related links + guides + valid JSON-LD, one H1.
    expect(html).toContain('href="/funding/programs/sydney"');
    expect(html).toContain('href="/funding/grants?state=NSW"');
    expect(html).toContain('href="/funding/report/demo"');
    expect(html).toContain('data-funding-guides="compact"');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    const blocks = extractJsonLd(html);
    // S9-B adds FAQPage (≥ 2 field-backed Q&As on this row).
    expect(blocks.map((b) => b["@type"]).sort()).toEqual(["BreadcrumbList", "Event", "FAQPage", "Service"]);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    const crumbs = blocks.find((b) => b["@type"] === "BreadcrumbList")!;
    expect((crumbs.itemListElement as unknown[]).length).toBe(5);
  });

  it("404s when the id exists under a different capital (one canonical URL per program)", async () => {
    await expect(ProgramDetailPage({ params: Promise.resolve({ capital: "perth", id: "syd-startmate" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect((await detailMetadata({ params: Promise.resolve({ capital: "perth", id: "syd-startmate" }) })).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
