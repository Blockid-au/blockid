// Colocated render test for /funding/grants/[id] (T0241). `getGrant` and
// `listGrants` are mocked; the marketing shell is a pass-through. Rendered
// through renderToReadableStream so the nested async JSON-LD components
// resolve (see ../page.test.tsx).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import type { AuGrant } from "@/lib/funding/data";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const notFoundSpy = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundSpy() }));

const esic: AuGrant = {
  id: "esic",
  name: "Early Stage Innovation Company (ESIC) investor tax incentives",
  provider: "ATO / Treasury",
  level: "federal",
  state: "national",
  funding_type: "tax_offset_nonrefundable",
  amount_min_aud: null,
  amount_max_aud: 200000,
  amount_note: "Investor-side offset capped per year",
  co_contribution: "none",
  stage_tags: ["idea", "mvp"],
  industry_tags: [],
  demographic_tags: [],
  eligibility: {
    is_company_acn: true,
    incorporated_years_max: 3,
    prior_year_income_max: 200000,
    not_listed: true,
    innovation_test: "100-point or principles-based",
  },
  application_window: "rolling",
  opens_at: null,
  closes_at: null,
  lodgement_deadline: "ESIC report to ATO by 31 Jul each year",
  next_round_note: null,
  status: "open",
  superseded_by: null,
  exclude_from_matching: false,
  official_url: "https://www.ato.gov.au/esic",
  source_url: "https://treasury.gov.au/esic",
  summary: "Company self-assesses ESIC status; investors get a 20% offset.",
  how_to_apply: "Self-assess, then lodge the ESIC report through the ATO portal.",
  evidence_needed: ["Incorporation date", "Prior-year expenses and income"],
  last_verified_at: "2026-09-10",
  verified_by: "seed",
  status_confidence: "high",
  sources: null,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => [esic],
  getGrant: async (id: string) => (id === "esic" ? esic : null),
}));

import GrantDetailPage, { generateMetadata, generateStaticParams, revalidate } from "./page";

async function render(id: string): Promise<string> {
  const el = await GrantDetailPage({ params: Promise.resolve({ id }) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/funding/grants/[id] — params and metadata", () => {
  it("pre-renders every grant id from the table and revalidates hourly", async () => {
    expect(await generateStaticParams()).toEqual([{ id: "esic" }]);
    expect(revalidate).toBe(3600);
  });

  it("titles the page with the grant name and A$ range; unknown ids are noindex", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ id: "esic" }) });
    expect(md.title).toBe("Early Stage Innovation Company (ESIC) investor tax incentives — up to A$200,000 · BlockID.au");
    expect(md.alternates?.canonical).toBe("/funding/grants/esic");
    const missing = await generateMetadata({ params: Promise.resolve({ id: "nope" }) });
    expect(missing.robots).toEqual({ index: false });
  });

  it("404s an unknown id", async () => {
    await expect(render("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalled();
  });
});

describe("/funding/grants/[id] — rendered", () => {
  it("renders the eligibility gates as a labelled checklist", async () => {
    const html = await render("esic");
    expect(html).toContain("<h1");
    expect(html).toContain("Early Stage Innovation Company (ESIC) investor tax incentives");
    expect(html).toContain('data-gate="is_company_acn"');
    expect(html).toContain("Incorporated company (ACN)");
    expect(html).toContain("Incorporated within the last");
    expect(html).toContain("3 years");
    expect(html).toContain("Prior-year assessable income at most");
    expect(html).toContain("A$200,000");
    expect(html).toContain("100-point or principles-based");
  });

  it("shows evidence, how to apply, lodgement deadline, official link and the A$3 CTA", async () => {
    const html = await render("esic");
    expect(html).toContain("Incorporation date");
    expect(html).toContain("Self-assess, then lodge the ESIC report");
    expect(html).toContain("ESIC report to ATO by 31 Jul each year");
    expect(html).toContain('href="https://www.ato.gov.au/esic" rel="nofollow noopener noreferrer" target="_blank"');
    expect(html).toContain('href="/funding?grant=esic"');
    expect(html).toContain("Check my eligibility for A$3");
  });

  it("emits GovernmentService + BreadcrumbList JSON-LD and the funding disclaimer", async () => {
    const html = await render("esic");
    expect(html).toContain('"@type":"GovernmentService"');
    expect(html).toContain('"sameAs":"https://www.ato.gov.au/esic"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain("https://blockid.au/funding/grants/esic");
    expect(html).toContain('data-surface="funding_directory"');
    expect(html).toContain('data-last-verified="2026-09-10"');
    expect(html).not.toContain("A$5.50");
    expect(html).not.toMatch(/PhD/);
  });
});
