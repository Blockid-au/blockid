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

/** A second federal grant so "Related" has something to rank (S9-B). */
const kickStart: AuGrant = {
  ...esic,
  id: "csiro-kick-start",
  name: "CSIRO Kick-Start",
  provider: "CSIRO",
  funding_type: "matched_grant",
  amount_min_aud: 10000,
  amount_max_aud: 50000,
  amount_note: null,
  co_contribution: "1:1",
  stage_tags: ["idea", "mvp"],
  eligibility: { is_company_acn: true, turnover_max: 10000000 },
  lodgement_deadline: null,
  official_url: "https://www.csiro.au/kick-start",
  source_url: null,
  summary: "Dollar-matched vouchers for research with CSIRO.",
  how_to_apply: null,
  evidence_needed: ["Research plan"],
  application_prompts: [
    { id: "p1", question: "Describe the research project." },
    { id: "p2", question: "Why CSIRO?" },
    { id: "p3", question: "What is the budget?" },
    { id: "p4", question: "What happens after?" },
  ],
};

vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => [esic, kickStart],
  getGrant: async (id: string) => (id === "esic" ? esic : id === "csiro-kick-start" ? kickStart : null),
  listPrograms: async () => [],
}));

import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import GrantDetailPage, { generateMetadata, generateStaticParams, revalidate } from "./page";

async function render(id: string): Promise<string> {
  const el = await GrantDetailPage({ params: Promise.resolve({ id }) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/funding/grants/[id] — params and metadata", () => {
  it("pre-renders every grant id from the table and revalidates hourly", async () => {
    expect(await generateStaticParams()).toEqual([{ id: "esic" }, { id: "csiro-kick-start" }]);
    expect(revalidate).toBe(3600);
  });

  it("titles the page `name — state noun` as an absolute ≤ 60 title (no doubled brand), composes a 140–160 description, absolute canonical + OG image; unknown ids are noindex (S8-A)", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ id: "esic" }) });
    // The acronym rule keeps the searched-for "(ESIC)" instead of truncating mid-name.
    expect(md.title).toEqual({ absolute: "Early Stage Innovation Company (ESIC) — Australia" });
    expect((md.title as { absolute: string }).absolute.length).toBeLessThanOrEqual(60);
    expect(String(md.description).length).toBeGreaterThanOrEqual(140);
    expect(String(md.description).length).toBeLessThanOrEqual(160);
    expect(String(md.description)).toContain("Early Stage Innovation Company (ESIC) investor tax incentives: tax incentive from ATO / Treasury for Australian startups");
    expect(md.alternates?.canonical).toBe("https://blockid.au/funding/grants/esic");
    expect((md.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    expect((md.openGraph as { title?: string }).title).toBe("Early Stage Innovation Company (ESIC) — Australia");
    const missing = await generateMetadata({ params: Promise.resolve({ id: "nope" }) });
    expect(missing.robots).toEqual({ index: false, follow: false });
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

  it("every JSON-LD block validates (FAQPage included, S9-B), one H1, and the related links reach the state view, programs, demo and the ESIC guide first (S8-A)", async () => {
    const html = await render("esic");
    const blocks = extractJsonLd(html);
    expect(blocks.map((b) => b["@type"]).sort()).toEqual(["BreadcrumbList", "FAQPage", "GovernmentService"]);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain('href="/funding/grants?state=national"');
    expect(html).toContain('href="/funding/programs"');
    expect(html).toContain('href="/funding/report/demo"');
    expect(html).toContain('data-funding-guides="compact"');
    expect(html.indexOf("esic-and-rnd-tax-incentive-guide-2026")).toBeLessThan(html.indexOf("government-grants-startups-australia-2026"));
  });
});

describe("/funding/grants/[id] — S9-B enrichment sections", () => {
  it("renders At a glance, Who it is for, What you get, How to apply, Timing, FAQ and Related in that heading order, from row fields only", async () => {
    const html = await render("esic");
    const order = ["at-a-glance", "who", "get", "how-to-apply", "timing", "faq", "related"].map((s) => html.indexOf(`data-section="${s}"`));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // At a glance: type, provider, level, coverage, amount + lodgement, verified.
    expect(html).toContain('data-fact="Type"');
    expect(html).toContain("Non-refundable tax offset");
    expect(html).toContain("Australia-wide (federal)");
    expect(html).toContain("ESIC report to ATO by 31 Jul each year");
    expect(html).toContain("10 Sep 2026 · high confidence");
    // Who it is for: fixed vocabulary from the stage tags; the checklist keeps its gates.
    expect(html).toContain("founders still at the idea stage and startups with an MVP in users");
    expect(html).toContain("The listing records 5 eligibility gates");
    // What you get: the generic funding-type explainer + summary + amount + co-contribution.
    expect(html).toContain("A non-refundable tax offset reduces tax payable");
    expect(html).toContain("provides up to A$200,000 (Investor-side offset capped per year)");
    expect(html).toContain("No co-contribution is required.");
    // How to apply: how_to_apply intro, rolling window, lodgement, gates, official step, evidence; no prompts on this row.
    expect(html).toContain('data-apply-steps');
    expect(html).toContain("Applications are accepted on a rolling basis rather than in fixed rounds.");
    expect(html).toContain("Lodgement deadline: ESIC report to ATO by 31 Jul each year.");
    expect(html).toContain("BlockID lists the non-refundable tax offset but never lodges applications");
    expect(html).toContain("Apply on the official portal");
    expect(html).not.toContain("data-apply-prompts");
    // Timing: rolling → open rung.
    expect(html).toContain('data-deadline-status="open"');
    expect(html).toContain("Status was last verified on 10 Sep 2026");
    // FAQ from fields only.
    expect(html).toContain("How much does Early Stage Innovation Company (ESIC) investor tax incentives provide?");
    expect(html).toContain("Do I need to co-contribute to Early Stage Innovation Company");
    expect(html).toContain("Who runs Early Stage Innovation Company");
    expect(html).not.toContain("How long does");
    // Related: the other federal grant, the /funding CTA and the ESIC insight.
    expect(html).toContain('data-related="grant"');
    expect(html).toContain('href="/funding/grants/csiro-kick-start"');
    expect(html).toContain('data-funding-cta');
    expect(html).toContain("See which of these you qualify for");
    expect(html).toContain('data-related-insight="esic-and-rnd-tax-incentive-guide-2026"');
    expect(html).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b/);
  });

  it("shows the first three application prompts as 'You will be asked' and the evidence list when the row has them", async () => {
    const html = await render("csiro-kick-start");
    expect(html).toContain("You will be asked");
    expect(html).toContain("Describe the research project.");
    expect(html).toContain("What is the budget?");
    expect(html).not.toContain("What happens after?");
    expect(html).toContain('data-evidence');
    expect(html).toContain("Research plan");
    expect(html).toContain('Yes — the listed co-contribution is &quot;1:1&quot;.');
    expect(html).toContain('href="/funding/grants/esic"');
  });
});
