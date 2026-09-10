// Colocated render test for /funding/grants (T0241). `listGrants` is mocked;
// the marketing shell is a pass-through (NavV2 needs an app-router context).
// Pages nest async server components (BreadcrumbListJsonLd, FundingJsonLd),
// which renderToStaticMarkup cannot resolve, so the tree is rendered through
// renderToReadableStream and read back in full.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import type { AuGrant } from "@/lib/funding/data";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const rows: AuGrant[] = [];
vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => rows,
  getGrant: async (id: string) => rows.find((r) => r.id === id) ?? null,
}));

import GrantsDirectoryPage, { metadata, revalidate } from "./page";

function grant(over: Partial<AuGrant>): AuGrant {
  return {
    id: "g",
    name: "Grant",
    provider: "Dept of Things",
    level: "federal",
    state: "national",
    funding_type: "grant",
    amount_min_aud: null,
    amount_max_aud: null,
    amount_note: null,
    co_contribution: null,
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
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...over,
  };
}

rows.push(
  grant({ id: "mvp-ventures", name: "MVP Ventures", state: "NSW", level: "state", amount_min_aud: 25000, amount_max_aud: 200000, closes_at: "2027-04-10", stage_tags: ["mvp", "early_revenue"] }),
  grant({ id: "rdti", name: "R&D Tax Incentive", funding_type: "tax_offset_refundable", amount_max_aud: 4000000 }),
  grant({ id: "igp", name: "Industry Growth Program", status: "paused", next_round_note: "Paused pending review", amount_max_aud: 5000000 }),
  grant({ id: "wa-only", name: "WA Innovation Booster", state: "WA", level: "state", funding_type: "voucher", amount_max_aud: 40000, last_verified_at: "2026-09-01" }),
);

async function render(sp: Record<string, string> = {}): Promise<string> {
  const el = await GrantsDirectoryPage({ searchParams: Promise.resolve(sp) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/funding/grants — metadata and caching", () => {
  it("is titled, canonical and revalidated hourly", () => {
    expect(metadata.title).toBe("Australian startup grants, open right now · BlockID.au");
    expect(metadata.alternates?.canonical).toBe("/funding/grants");
    expect(revalidate).toBe(3600);
  });
});

describe("/funding/grants — rendered", () => {
  it("renders the H1 with live counts from the rows, not typed numbers", async () => {
    const html = await render();
    expect(html).toContain("Australian startup grants, open right now");
    // 3 open (mvp-ventures, rdti, wa-only); paused igp excluded from the open total.
    expect(html).toContain('data-open-count="3"');
    expect(html).toContain('data-total-count="4"');
    // 200,000 + 4,000,000 + 40,000
    expect(html).toContain('data-open-max-aud="4240000"');
    expect(html).toContain("A$4,240,000");
  });

  it("lists every row open-first with official nofollow links and the eligibility CTA", async () => {
    const html = await render();
    for (const id of ["mvp-ventures", "rdti", "igp", "wa-only"]) expect(html).toContain(`data-grant-id="${id}"`);
    expect(html.indexOf('data-grant-id="mvp-ventures"')).toBeLessThan(html.indexOf('data-grant-id="igp"'));
    expect(html).toContain('href="https://business.gov.au/example" rel="nofollow noopener noreferrer" target="_blank"');
    expect(html).toContain("Official page");
    expect(html).toContain('href="/funding?grant=mvp-ventures"');
    expect(html).toContain("Am I eligible?");
    expect(html).toContain("A$25,000 – A$200,000");
    expect(html).toContain("closes 10 Apr 2027");
    expect(html).toContain("Paused pending review");
  });

  it("filters server-side from searchParams — a state keeps national rows; chips link, never script", async () => {
    const html = await render({ state: "WA" });
    expect(html).toContain('data-grant-id="wa-only"');
    expect(html).toContain('data-grant-id="rdti"');
    expect(html).not.toContain('data-grant-id="mvp-ventures"');
    expect(html).toContain('href="/funding/grants?state=WA&amp;type=voucher"');
    expect(html).toContain("Clear all filters");
    expect(html).not.toContain("onclick");
  });

  it("emits ItemList + BreadcrumbList JSON-LD and the registry disclaimer with attribution + last verified", async () => {
    const html = await render();
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('data-surface="funding_directory"');
    expect(html).toContain("Commonwealth of Australia, CC BY 3.0 AU");
    expect(html).toContain('data-last-verified="2026-09-10"');
    expect(html).toContain("Last verified 10 Sep 2026.");
  });

  it("never carries the banned copy", async () => {
    const html = await render();
    expect(html).not.toContain("A$5.50");
    expect(html).not.toMatch(/PhD/);
  });
});
