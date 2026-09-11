// S9-B thin-page sweep: renders every program (199) and every indexable
// grant (53) detail page from the real seed files and pins the audit floor —
// ≥ 300 real words inside <article>, every JSON-LD block valid, FAQPage only
// with ≥ 2 visible Q&As, the internal links each page type must carry, and
// no `undefined` / `null` in the markup. Data helpers are mocked onto the
// seeds so the sweep needs no database.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import grantsSeed from "../../../../content/data/grants-au.seed.json";
import programsSeed from "../../../../content/data/programs-au.seed.json";
import { mapGrantSeeds, mapProgramSeeds } from "@/lib/funding/seed-map";
import { capitalSlug } from "@/lib/funding/directory";
import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const stamp = { created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" };
const grants = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants).map((g) => ({ ...g, ...stamp }));
const programs = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs).map((p) => ({ ...p, ...stamp }));
const indexable = grants.filter((g) => !g.exclude_from_matching);

vi.mock("@/lib/funding/data", () => ({
  listGrants: async () => indexable,
  getGrant: async (id: string) => grants.find((r) => r.id === id) ?? null,
  listPrograms: async (opts?: { capital?: string }) => (opts?.capital ? programs.filter((p) => p.capital === opts.capital) : programs),
  getProgram: async (id: string) => programs.find((r) => r.id === id) ?? null,
}));

import GrantDetailPage from "./grants/[id]/page";
import ProgramDetailPage from "./programs/[capital]/[id]/page";

async function toHtml(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

/** Words inside <article> (header + sections + aside), scripts and tags stripped — the disclaimer and chrome are not counted. */
export function articleWords(html: string): number {
  const m = /<article[\s\S]*?<\/article>/.exec(html);
  return (m ? m[0] : "")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const LEAK = /\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/;

describe("S9-B — every program detail page over the real seed", () => {
  const counts: number[] = [];

  it("renders ≥ 300 article words, valid JSON-LD, the capital / related / funding / insight links, and no leaks", async () => {
    for (const p of programs) {
      const html = await toHtml(await ProgramDetailPage({ params: Promise.resolve({ capital: capitalSlug(p.capital), id: p.id }) }));
      const words = articleWords(html);
      counts.push(words);
      expect(words, `${p.id}: ${words} words`).toBeGreaterThanOrEqual(300);
      expect(html.match(/<h1[\s>]/g), p.id).toHaveLength(1);
      const blocks = extractJsonLd(html);
      for (const b of blocks) expect(validateJsonLd(b), `${p.id} ${String(b["@type"])}`).toEqual({ ok: true, errors: [] });
      const faqCount = (html.match(/data-faq-item/g) ?? []).length;
      const hasFaqLd = blocks.some((b) => b["@type"] === "FAQPage");
      expect(hasFaqLd, `${p.id}: FAQPage only with ≥ 2 visible Q&As (${faqCount})`).toBe(faqCount >= 2);
      expect(html, p.id).toContain(`href="/funding/programs/${capitalSlug(p.capital)}"`);
      expect(html, p.id).toContain('data-funding-cta');
      expect(html, p.id).toMatch(/data-related-insight="[a-z0-9-]+"/);
      expect((html.match(/href="\/funding\/programs\/[a-z]+\/[^"]+"/g) ?? []).length, `${p.id}: related programs`).toBeGreaterThanOrEqual(
        Math.min(3, programs.filter((o) => o.capital === p.capital && o.id !== p.id).length),
      );
      expect((html.match(/href="\/funding\/grants\/[^"?]+"/g) ?? []).length, `${p.id}: related grants`).toBeGreaterThanOrEqual(3);
      expect(html.replace(/<script[\s\S]*?<\/script>/g, ""), p.id).not.toMatch(LEAK);
    }
    // Baseline before S9-B: median 145 article words, every page under 300.
    expect(counts).toHaveLength(programs.length);
    expect(median(counts)).toBeGreaterThanOrEqual(300);
  }, 120_000);
});

describe("S9-B — every grant detail page over the real seed", () => {
  const counts: number[] = [];

  it("renders ≥ 300 article words, valid JSON-LD, the state view / related / funding / insight links, and no leaks", async () => {
    for (const g of indexable) {
      const html = await toHtml(await GrantDetailPage({ params: Promise.resolve({ id: g.id }) }));
      const words = articleWords(html);
      counts.push(words);
      expect(words, `${g.id}: ${words} words`).toBeGreaterThanOrEqual(300);
      expect(html.match(/<h1[\s>]/g), g.id).toHaveLength(1);
      const blocks = extractJsonLd(html);
      for (const b of blocks) expect(validateJsonLd(b), `${g.id} ${String(b["@type"])}`).toEqual({ ok: true, errors: [] });
      const faqCount = (html.match(/data-faq-item/g) ?? []).length;
      expect(blocks.some((b) => b["@type"] === "FAQPage"), `${g.id}: FAQPage only with ≥ 2 visible Q&As`).toBe(faqCount >= 2);
      expect(html, g.id).toContain(`href="/funding/grants?state=${encodeURIComponent(g.state)}"`);
      expect(html, g.id).toContain('data-funding-cta');
      expect(html, g.id).toMatch(/data-related-insight="[a-z0-9-]+"/);
      expect((html.match(/href="\/funding\/programs\/[a-z]+\/[^"]+"/g) ?? []).length, `${g.id}: related programs`).toBeGreaterThanOrEqual(3);
      expect((html.match(/href="\/funding\/grants\/[^"?]+"/g) ?? []).length, `${g.id}: related grants`).toBeGreaterThanOrEqual(1);
      expect(html.replace(/<script[\s\S]*?<\/script>/g, ""), g.id).not.toMatch(LEAK);
    }
    // Baseline before S9-B: median 157 article words, every page under 300.
    expect(counts).toHaveLength(indexable.length);
    expect(median(counts)).toBeGreaterThanOrEqual(300);
  }, 120_000);
});
