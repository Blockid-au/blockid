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
  listPrograms: async () => rows,
  getProgram: async (id: string) => rows.find((r) => r.id === id) ?? null,
}));

import ProgramsDirectoryPage from "../page";
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
    expect(html).toContain("Accelerators, incubators and startup programs in every Australian capital");
    expect(html).toContain('data-total-count="4"');
    expect(html).toContain('data-open-count="2"');
    for (const c of ["sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "hobart", "darwin", "remote"]) {
      expect(html).toContain(`href="/funding/programs/${c}"`);
    }
    expect(html).toContain("Australia-wide / online");
    expect(html).toContain('data-program-id="per-plus-eight"');
  });

  it("filters by capital slug from searchParams", async () => {
    const html = await toHtml(await ProgramsDirectoryPage({ searchParams: Promise.resolve({ capital: "perth" }) }));
    expect(html).toContain('data-program-id="per-plus-eight"');
    expect(html).not.toContain('data-program-id="syd-startmate"');
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

  it("metadata names the capital; unknown slugs are noindex", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ capital: "Sydney" }) });
    expect(md.title).toContain("Startup programs in Sydney");
    expect(md.alternates?.canonical).toBe("/funding/programs/sydney");
    expect((await generateMetadata({ params: Promise.resolve({ capital: "gold-coast" }) })).robots).toEqual({ index: false });
  });

  it("renders the H1, twelve-month calendar, open-first list with closed rows marked, and Event JSON-LD", async () => {
    const html = await toHtml(await CapitalProgramsPage({ params: Promise.resolve({ capital: "sydney" }) }));
    expect(html).toContain("Startup programs in Sydney");
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
    expect(md.alternates?.canonical).toBe("/funding/programs/sydney/syd-startmate");
  });

  it("404s when the id exists under a different capital (one canonical URL per program)", async () => {
    await expect(ProgramDetailPage({ params: Promise.resolve({ capital: "perth", id: "syd-startmate" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect((await detailMetadata({ params: Promise.resolve({ capital: "perth", id: "syd-startmate" }) })).robots).toEqual({
      index: false,
    });
  });
});
