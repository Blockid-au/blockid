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

import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import GrantsDirectoryPage, { generateMetadata, revalidate } from "./page";

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
  it("is titled ≤ 60 (brand via the root template, no doubled suffix), 140–160 description, absolute canonical, OG image, revalidated hourly", async () => {
    const md = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(md.title).toBe("Australian startup grants, open right now");
    expect(`${String(md.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(md.description).length).toBeGreaterThanOrEqual(140);
    expect(String(md.description).length).toBeLessThanOrEqual(160);
    expect(md.alternates?.canonical).toBe("https://blockid.au/funding/grants");
    expect((md.openGraph as { images?: unknown[] }).images).toEqual([{ url: "/opengraph-image", width: 1200, height: 630, alt: "BlockID.au" }]);
    expect(md.robots).toEqual({ index: true, follow: true });
    expect(revalidate).toBe(3600);
  });

  it("a state-only filter is its own '<state> startup grants' landing page: self-canonical + state title; other filter combos canonicalise to the base (S8-A)", async () => {
    const wa = await generateMetadata({ searchParams: Promise.resolve({ state: "WA" }) });
    expect(wa.title).toBe("WA startup grants open right now");
    expect(wa.alternates?.canonical).toBe("https://blockid.au/funding/grants?state=WA");
    expect(String(wa.description)).toContain("Western Australia");
    const national = await generateMetadata({ searchParams: Promise.resolve({ state: "national" }) });
    expect(national.alternates?.canonical).toBe("https://blockid.au/funding/grants?state=national");
    const combo = await generateMetadata({ searchParams: Promise.resolve({ state: "WA", type: "voucher" }) });
    expect(combo.alternates?.canonical).toBe("https://blockid.au/funding/grants");
    expect(combo.title).toBe("Australian startup grants, open right now");
    const typeOnly = await generateMetadata({ searchParams: Promise.resolve({ type: "voucher" }) });
    expect(typeOnly.alternates?.canonical).toBe("https://blockid.au/funding/grants");
    const junk = await generateMetadata({ searchParams: Promise.resolve({ state: "XX" }) });
    expect(junk.alternates?.canonical).toBe("https://blockid.au/funding/grants");
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

  it("groups federal first (compact rows, open-first, deadline chip, eligibility CTA) and collapses each state into a <details> of name-only links (S10-A)", async () => {
    const html = await render();
    // Group order: national, NSW, WA — each H2 links to its state view.
    const nat = html.indexOf('data-state-group="national"');
    const nsw = html.indexOf('data-state-group="NSW"');
    const wa = html.indexOf('data-state-group="WA"');
    expect(nat).toBeGreaterThanOrEqual(0);
    expect(nat).toBeLessThan(nsw);
    expect(nsw).toBeLessThan(wa);
    expect(html).toContain('data-state-group="national" data-expanded="true"');
    expect(html).toContain('data-state-group="NSW" data-expanded="false"');
    expect(html).toContain('href="/funding/grants?state=national">Federal grants, open Australia-wide</a></h2>');
    expect(html).toContain('href="/funding/grants?state=NSW">New South Wales grants</a></h2>');
    // Federal rows are compact rows, open before paused, with the deadline ladder + the paid door.
    for (const id of ["rdti", "igp"]) expect(html).toContain(`data-grant-id="${id}"`);
    expect(html.indexOf('data-grant-id="rdti"')).toBeLessThan(html.indexOf('data-grant-id="igp"'));
    expect(html).toContain('data-deadline-status="open"');
    expect(html).toContain("Rolling — apply any time");
    expect(html).toContain("Paused — next round not announced");
    expect(html).toContain('href="/funding?grant=rdti"');
    expect(html).toContain("Am I eligible?");
    expect(html).toContain("up to A$4,000,000");
    // State rows are name-only links inside a native <details>; no compact row, no card.
    expect(html).not.toContain('data-grant-id="mvp-ventures"');
    expect(html).toContain('href="/funding/grants/mvp-ventures">MVP Ventures</a>');
    expect(html).toContain("<summary");
    expect(html).toContain("The one New South Wales grant");
    expect(html).toContain("See the NSW grant with the federal schemes");
    // Every detail URL exactly once; official links live on the detail pages now.
    for (const id of ["mvp-ventures", "rdti", "igp", "wa-only"]) {
      expect(html.split(`href="/funding/grants/${id}"`).length - 1, id).toBe(1);
    }
    expect(html).not.toContain("onclick");
  });

  it("filters server-side from searchParams — a state leads and expands, national follows; chips link, never script", async () => {
    const html = await render({ state: "WA" });
    expect(html).toContain('data-state-group="WA" data-expanded="true"');
    expect(html.indexOf('data-state-group="WA"')).toBeLessThan(html.indexOf('data-state-group="national"'));
    expect(html).toContain("Federal grants WA startups can also apply for");
    // The group that is this page never links to itself.
    expect(html).not.toContain("See the WA grant with the federal schemes");
    expect(html).not.toContain("See all 1 WA grants");
    expect(html).toContain('data-grant-id="wa-only"');
    expect(html).toContain('data-grant-id="rdti"');
    expect(html).not.toContain('data-grant-id="mvp-ventures"');
    expect(html).not.toContain('href="/funding/grants/mvp-ventures"');
    expect(html).toContain('href="/funding/grants?state=WA&amp;type=voucher"');
    expect(html).toContain("Clear all filters");
    expect(html).not.toContain("onclick");
  });

  it("the state-only view swaps the H1, breadcrumb and ItemList name to the state and links the sibling states (S8-A)", async () => {
    const html = await render({ state: "WA" });
    expect(html).toContain("<h1");
    expect(html).toContain("WA startup grants, open right now");
    expect(html).not.toContain("Australian startup grants, open right now</h1>");
    expect(html).toContain('href="/funding/grants?state=NSW"');
    expect(html).toContain('href="/funding/grants?state=national"');
    expect(html).not.toContain('aria-label="Other states">Also see: · ');
    const blocks = extractJsonLd(html);
    const list = blocks.find((b) => b["@type"] === "ItemList")!;
    expect(list.name).toBe("WA startup grants, open right now");
    expect(list.url).toBe("https://blockid.au/funding/grants?state=WA");
    const crumbs = blocks.find((b) => b["@type"] === "BreadcrumbList")!;
    expect(JSON.stringify(crumbs)).toContain("Western Australia grants");
    // The combined filter view keeps the base H1.
    const combo = await render({ state: "WA", type: "voucher" });
    expect(combo).toContain("Australian startup grants, open right now");
  });

  it("links the grant guides (directory → insights) and every JSON-LD block validates (S8-A)", async () => {
    const html = await render();
    expect(html).toContain('data-funding-guides="strip"');
    expect(html).toContain('href="/insights/government-grants-startups-australia-2026"');
    expect(html).toContain('href="/insights/r-and-d-tax-incentive-startups-australia"');
    for (const b of extractJsonLd(html)) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    // Exactly one H1.
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
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
