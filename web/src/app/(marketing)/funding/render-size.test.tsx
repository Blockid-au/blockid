// S10-A: the two directory indexes must stay lean. Both pages are rendered
// with the real seed files (53 indexable grants, 199 programs) — the sizes
// Google and the browser see — and asserted < 300 KB of decoded HTML while
// every detail URL is still linked exactly once (grouped compact rows + a
// native <details> for the rest, no client fetching). Sizes are also logged
// so a perf pass can compare before/after.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import grantsSeed from "../../../../content/data/grants-au.seed.json";
import programsSeed from "../../../../content/data/programs-au.seed.json";
import { AU_STATES, CAPITALS, mapGrantSeeds, mapProgramSeeds } from "@/lib/funding/seed-map";

const GRANTS = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants).filter((g) => !g.exclude_from_matching);
const PROGRAMS = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs);

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => GRANTS,
  listPrograms: async () => PROGRAMS,
  getGrant: async (id: string) => GRANTS.find((r) => r.id === id) ?? null,
  getProgram: async (id: string) => PROGRAMS.find((r) => r.id === id) ?? null,
}));

import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import { grantPath, programPath } from "@/lib/funding/seo";
import ProgramsDirectoryPage from "./programs/page";
import GrantsDirectoryPage from "./grants/page";

const MAX_BYTES = 300_000;

async function toHtml(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

function countHref(html: string, href: string): number {
  return html.split(`href="${href}"`).length - 1;
}

describe("/funding/programs — render size with the real seed (S10-A)", () => {
  it(`renders the 199 programs in < ${MAX_BYTES} bytes, links every detail URL exactly once, groups by capital in CAPITALS order with a <details> tail`, async () => {
    const html = await toHtml(await ProgramsDirectoryPage({ searchParams: Promise.resolve({}) }));
    const bytes = Buffer.byteLength(html, "utf8");
    console.log(`[render-size] /funding/programs = ${bytes} bytes`);
    expect(bytes).toBeLessThan(MAX_BYTES);

    for (const p of PROGRAMS) expect(countHref(html, programPath(p.capital, p.id)), p.id).toBe(1);

    // One group per capital that has rows, in seed-map order, each with an H2 linking to its capital page.
    const order = CAPITALS.filter((c) => PROGRAMS.some((p) => p.capital === c)).map((c) => html.indexOf(`data-capital-group="${c}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/<details/g)?.length ?? 0).toBeGreaterThan(0);
    expect(html).toContain("<summary");

    for (const b of extractJsonLd(html)) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    // ItemList: ≤ 6 programs per capital plus one ListItem per capital page (which carries the full list).
    const list = extractJsonLd(html).find((b) => b["@type"] === "ItemList")!;
    const items = list.itemListElement as Array<{ url: string }>;
    expect(items.length).toBeLessThanOrEqual(7 * CAPITALS.length);
    for (const c of CAPITALS) expect(items.some((i) => i.url === `https://blockid.au/funding/programs/${c.toLowerCase()}`), c).toBe(true);
    expect(list.numberOfItems).toBe(PROGRAMS.length + CAPITALS.length);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});

describe("/funding/grants — render size with the real seed (S10-A)", () => {
  it(`renders the 53 indexable grants in < ${MAX_BYTES} bytes, links every detail URL exactly once, national first then states with a <details> tail`, async () => {
    const html = await toHtml(await GrantsDirectoryPage({ searchParams: Promise.resolve({}) }));
    const bytes = Buffer.byteLength(html, "utf8");
    console.log(`[render-size] /funding/grants = ${bytes} bytes`);
    expect(bytes).toBeLessThan(MAX_BYTES);

    for (const g of GRANTS) expect(countHref(html, grantPath(g.id)), g.id).toBe(1);

    const order = AU_STATES.filter((s) => GRANTS.some((g) => g.state === s)).map((s) => html.indexOf(`data-state-group="${s}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/<details/g)?.length ?? 0).toBeGreaterThan(0);

    for (const b of extractJsonLd(html)) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    // ItemList: ≤ 6 federal grants (the only expanded group) plus one ListItem per state view.
    const list = extractJsonLd(html).find((b) => b["@type"] === "ItemList")!;
    const items = list.itemListElement as Array<{ url: string }>;
    const states = AU_STATES.filter((s) => GRANTS.some((g) => g.state === s));
    expect(items.length).toBeLessThanOrEqual(6 + states.length);
    for (const s of states) expect(items.some((i) => i.url === `https://blockid.au/funding/grants?state=${s}`), s).toBe(true);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});
