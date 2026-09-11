// Colocated render test for /funding/programs/[capital]/[id] (T0241, S9-B).
// `getProgram` / `listPrograms` / `listGrants` are mocked; the marketing
// shell is a pass-through. Rendered through renderToReadableStream so the
// nested async JSON-LD components resolve (see ../../../grants/page.test.tsx).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import type { AuGrant, AuProgram } from "@/lib/funding/data";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const notFoundSpy = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundSpy() }));

function program(over: Partial<AuProgram>): AuProgram {
  return {
    id: "p",
    name: "Program",
    operator: null,
    program_type: "accelerator",
    city: "Sydney",
    capital: "Sydney",
    state: "NSW",
    venue: null,
    stage_tags: [],
    industry_tags: [],
    demographic_tags: [],
    length_weeks: null,
    intake_months: [],
    applications_open: null,
    applications_close: null,
    next_cohort_start: null,
    benefits: [],
    funding_aud: null,
    equity_pct: null,
    cost_to_founder: null,
    eligibility: {},
    status: "open",
    official_url: "https://example.org/apply",
    summary: null,
    last_verified_at: null,
    verified_by: "seed",
    status_confidence: "medium",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...over,
  };
}

const full = program({
  id: "sydney-ai-accelerator",
  name: "Sydney AI Accelerator",
  operator: "Ops Pty Ltd",
  venue: "Startup Hub, 11 York St",
  stage_tags: ["mvp", "early_revenue"],
  industry_tags: ["ai_ml", "healthtech_medtech"],
  demographic_tags: ["women_led"],
  length_weeks: 12,
  intake_months: [2, 8],
  applications_open: "2026-10-01",
  applications_close: "2026-11-08",
  next_cohort_start: "2027-02-01",
  benefits: ["Mentoring", "Demo day"],
  funding_aud: 50000,
  equity_pct: "7% + MFN SAFE",
  cost_to_founder: "free",
  eligibility: { is_company_acn: true, turnover_max: 1000000 },
  summary: "Twelve-week AI health accelerator",
  last_verified_at: "2026-09-10",
  status_confidence: "high",
});

/** A row that carries nothing beyond the required fields — the thin case the enrichment must still handle. */
const bare = program({ id: "bare-meetup", name: "Bare Meetup", program_type: "community", city: "Sydney" });

const rows: AuProgram[] = [
  full,
  bare,
  program({ id: "a", name: "Alpha Pre-accelerator", program_type: "pre_accelerator", stage_tags: ["mvp"], industry_tags: ["ai_ml"] }),
  program({ id: "b", name: "Beta Incubator", program_type: "incubator", stage_tags: ["idea"] }),
  program({ id: "m", name: "Melbourne Thing", capital: "Melbourne", city: "Melbourne", state: "VIC", stage_tags: ["mvp"], industry_tags: ["ai_ml"] }),
];

function grant(over: Partial<AuGrant>): AuGrant {
  return {
    id: "g",
    name: "Grant",
    provider: "Dept",
    level: "federal",
    state: "national",
    funding_type: "grant",
    amount_min_aud: null,
    amount_max_aud: 50000,
    amount_note: null,
    co_contribution: "none",
    stage_tags: ["mvp"],
    industry_tags: [],
    demographic_tags: [],
    eligibility: {},
    application_window: "rolling",
    opens_at: null,
    closes_at: null,
    lodgement_deadline: null,
    next_round_note: null,
    status: "open",
    superseded_by: null,
    exclude_from_matching: false,
    official_url: "https://business.gov.au/example",
    source_url: null,
    summary: "A summary line.",
    how_to_apply: null,
    evidence_needed: [],
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "high",
    sources: null,
    application_prompts: [],
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...over,
  };
}

const grants: AuGrant[] = [
  grant({ id: "mvp-ventures", name: "MVP Ventures", state: "NSW", level: "state", amount_max_aud: 200000 }),
  grant({ id: "kick-start", name: "CSIRO Kick-Start", industry_tags: ["ai_ml"] }),
  grant({ id: "wa-only", name: "WA Booster", state: "WA", level: "state" }),
  grant({ id: "closed", name: "Closed Grant", status: "closed", application_window: "one_off" }),
];

vi.mock("@/lib/funding/data", () => ({
  listPrograms: async (opts?: { capital?: string }) => (opts?.capital ? rows.filter((r) => r.capital === opts.capital) : rows),
  getProgram: async (id: string) => rows.find((r) => r.id === id) ?? null,
  listGrants: async () => grants,
}));

import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import ProgramDetailPage, { generateMetadata, generateStaticParams, revalidate } from "./page";

async function render(capital: string, id: string): Promise<string> {
  const el = await ProgramDetailPage({ params: Promise.resolve({ capital, id }) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

function articleWords(html: string): number {
  const m = /<article[\s\S]*?<\/article>/.exec(html);
  return (m ? m[0] : "")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

describe("/funding/programs/[capital]/[id] — params and metadata", () => {
  it("pre-renders every program under its capital slug and revalidates hourly", async () => {
    const params = await generateStaticParams();
    expect(params).toContainEqual({ capital: "sydney", id: "sydney-ai-accelerator" });
    expect(params).toContainEqual({ capital: "melbourne", id: "m" });
    expect(revalidate).toBe(3600);
  });

  it("keeps the S8-A title / description contract; wrong capital or unknown id is noindex", async () => {
    const md = await generateMetadata({ params: Promise.resolve({ capital: "sydney", id: "sydney-ai-accelerator" }) });
    expect(md.title).toEqual({ absolute: "Sydney AI Accelerator — accelerator program in Sydney, NSW" });
    expect((md.title as { absolute: string }).absolute.length).toBeLessThanOrEqual(60);
    expect(String(md.description).length).toBeGreaterThanOrEqual(140);
    expect(String(md.description).length).toBeLessThanOrEqual(160);
    expect(md.alternates?.canonical).toBe("https://blockid.au/funding/programs/sydney/sydney-ai-accelerator");
    const wrong = await generateMetadata({ params: Promise.resolve({ capital: "melbourne", id: "sydney-ai-accelerator" }) });
    expect(wrong.robots).toEqual({ index: false, follow: false });
  });

  it("404s an unknown id and a row requested under the wrong capital", async () => {
    await expect(render("sydney", "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(render("melbourne", "sydney-ai-accelerator")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("/funding/programs/[capital]/[id] — rendered (S9-B)", () => {
  it("keeps the header, CTA, official link, checklist and benefits, and adds the seven enrichment sections in order", async () => {
    const html = await render("sydney", "sydney-ai-accelerator");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("Sydney AI Accelerator");
    expect(html).toContain('href="/funding?program=sydney-ai-accelerator"');
    expect(html).toContain("Add to my plan for A$3");
    expect(html).toContain('href="https://example.org/apply" rel="nofollow noopener noreferrer" target="_blank"');
    expect(html).toContain('data-gate="is_company_acn"');
    expect(html).toContain("data-benefits");
    const order = ["at-a-glance", "who", "get", "how-to-apply", "timing", "faq", "related"].map((s) => html.indexOf(`data-section="${s}"`));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Heading order: h1 → h2 sections → h3 inside.
    const h2s = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(h2s).toEqual(["At a glance", "Who it is for", "What you get", "How to apply", "Timing", "Frequently asked", "Related funding"]);
  });

  it("At a glance + Timing carry AEST dates; Who / What / How come from the row's fields only", async () => {
    const html = await render("sydney", "sydney-ai-accelerator");
    expect(html).toContain('data-fact="Applications close"');
    expect(html).toContain("8 Nov 2026 (AEST)");
    expect(html).toContain("Sydney, New South Wales — listed under Sydney with Wollongong");
    expect(html).toContain("Equity: 7% + MFN SAFE");
    expect(html).toContain("women-led teams");
    expect(html).toContain("An accelerator is a fixed-length, cohort-based program");
    expect(html).toContain("The listing records 2 benefits: Mentoring and Demo day.");
    expect(html).toContain("Cohorts usually start in February and August");
    expect(html).toContain("Applications open 1 Oct 2026 (AEST) and close 8 Nov 2026 (AEST).");
    expect(html).toContain("Apply on the official page");
    expect(html).toContain('data-deadline-status="future"');
    expect(html).toContain("Status was last verified on 10 Sep 2026");
  });

  it("FAQ renders only field-backed questions and emits FAQPage JSON-LD that validates alongside Service + Event + BreadcrumbList", async () => {
    const html = await render("sydney", "sydney-ai-accelerator");
    expect(html).toContain("Does Sydney AI Accelerator take equity?");
    expect(html).toContain("Does it cost anything to join Sydney AI Accelerator?");
    expect(html).toContain("How long does Sydney AI Accelerator run?");
    expect(html).toContain("When are the next applications for Sydney AI Accelerator?");
    const blocks = extractJsonLd(html);
    expect(blocks.map((b) => b["@type"]).sort()).toEqual(["BreadcrumbList", "Event", "FAQPage", "Service"]);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
  });

  it("links the capital page, related same-capital programs, related grants via the matcher, /funding and the insight article", async () => {
    const html = await render("sydney", "sydney-ai-accelerator");
    expect(html).toContain('href="/funding/programs/sydney"');
    expect(html).toContain("All Sydney programs");
    expect(html).toContain('data-related="program"');
    expect(html).toContain('href="/funding/programs/sydney/a"');
    expect(html).not.toContain('href="/funding/programs/melbourne/m"');
    expect(html).toContain('data-related="grant"');
    expect(html).toContain('href="/funding/grants/mvp-ventures"');
    expect(html).toContain('href="/funding/grants/kick-start"');
    expect(html).not.toContain('href="/funding/grants/wa-only"'); // WA HQ gate
    expect(html).not.toContain('href="/funding/grants/closed"'); // closed rows never related
    expect(html).toContain('data-funding-cta');
    expect(html).toContain('href="/funding"');
    expect(html).toContain("See which of these you qualify for");
    // Equity-taking program → funding-rounds guide.
    expect(html).toContain('data-related-insight="australian-startup-funding-rounds-2026-guide"');
    expect(html).toContain('href="/funding/grants?state=NSW"');
    expect(html).toContain('href="/funding/report/demo"');
    expect(html).toContain('data-funding-guides="compact"');
  });

  it("a bare row still renders every section it has data for, omits FAQPage (only one Q&A), and never prints undefined / null", async () => {
    const html = await render("sydney", "bare-meetup");
    expect(html).toContain('data-section="at-a-glance"');
    expect(html).toContain("lists no stage or sector restriction, so it is open to most Australian founders at any stage");
    expect(html).toContain("A founder community is a membership or drop-in network");
    expect(html).toContain('data-section="how-to-apply"');
    expect(html).toContain('data-deadline-status="open"');
    expect(html).toContain("Where is Bare Meetup held?");
    expect(html).not.toContain('"@type":"FAQPage"');
    expect(html).toContain('data-related-insight="government-grants-startups-australia-2026"');
    expect(html).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b/);
    expect(html).toContain('data-surface="funding_directory"');
  });

  it("closed rows show the closed pill, no plan CTA, and the timing section says do not apply", async () => {
    rows.push(program({ id: "closed-one", name: "Closed One", status: "closed" }));
    const html = await render("sydney", "closed-one");
    expect(html).toContain("Closed — do not apply");
    expect(html).not.toContain('href="/funding?program=closed-one"');
    expect(html).toContain('data-deadline-status="overdue"');
    expect(html).toContain("The listing is marked closed — do not apply until the operator announces the next round.");
    rows.pop();
  });

  it("the article body carries ≥ 300 real words even for the bare row (S8-A thin-page fix)", async () => {
    expect(articleWords(await render("sydney", "sydney-ai-accelerator"))).toBeGreaterThanOrEqual(300);
    expect(articleWords(await render("sydney", "bare-meetup"))).toBeGreaterThanOrEqual(300);
  });
});
