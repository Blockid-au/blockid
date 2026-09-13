// S27-C — proposal loop: verbatim-excerpt gate, per-source failure isolation,
// dry run inserts nothing, live run inserts `proposed` rows and treats the
// unique-index collision as a duplicate.

import { describe, expect, it, vi } from "vitest";
import {
  excerptMentionsNumber,
  extractionSystemPrompt,
  parseCandidates,
  refreshSectorMultiples,
  validateCandidate,
  type SupabaseLike,
} from "./multiples-refresh";
import { MULTIPLES_SOURCES, findMultiplesSource, type MultiplesSource } from "./multiples-sources";
import { htmlToText, type FetchTextResult } from "@/lib/funding/fetch-source";

const NOW = new Date("2026-10-01T03:00:00Z");
const SRC = findMultiplesSource("saas-capital-index")!;

const PAGE_HTML = `<html><body><h1>The SaaS Capital Index</h1>
<p>As of 30 September 2026 the SaaS Capital Index median EV/ARR multiple was 7.4x, down from 7.9x in August.</p>
<p>Contact us for the full dataset.</p></body></html>`;
const PAGE_TEXT = htmlToText(PAGE_HTML);
const GOOD_EXCERPT = "the SaaS Capital Index median EV/ARR multiple was 7.4x";

function fetched(text: string, over: Partial<FetchTextResult> = {}): FetchTextResult {
  return { ok: true, status: 200, text, blocked: false, truncated: false, attempts: 1, ...over };
}

function aiReturning(json: unknown) {
  return vi.fn(async () => ({ text: typeof json === "string" ? json : JSON.stringify(json) }));
}

function sb() {
  const inserted: Record<string, unknown>[] = [];
  const client: SupabaseLike = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserted.push({ __table: table, ...row });
        return { error: null };
      },
    }),
  };
  return { client, inserted };
}

describe("allow-list", () => {
  it("every source is https, has an expectation and at least one sector", () => {
    expect(MULTIPLES_SOURCES.length).toBeGreaterThanOrEqual(3);
    expect(MULTIPLES_SOURCES.length).toBeLessThanOrEqual(5);
    const ids = new Set<string>();
    for (const s of MULTIPLES_SOURCES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.expects.length).toBeGreaterThan(40);
      expect(s.sectors.length).toBeGreaterThan(0);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
    expect(findMultiplesSource("nope")).toBeNull();
  });

  it("the extraction prompt names the page, its expectation and the allowed sectors, and demands a verbatim excerpt", () => {
    const p = extractionSystemPrompt(SRC);
    expect(p).toContain(SRC.title);
    expect(p).toContain("Allowed sector keys for this page: saas");
    expect(p).toContain("character-for-character");
    expect(p).toContain("return []");
  });
});

describe("parseCandidates", () => {
  it("accepts a bare array, a fenced array and prose around an array; rejects everything else", () => {
    expect(parseCandidates('[{"sector":"saas"}]')).toEqual([{ sector: "saas" }]);
    expect(parseCandidates('```json\n[{"sector":"saas"}]\n```')).toEqual([{ sector: "saas" }]);
    expect(parseCandidates('Here you go: [{"sector":"saas"}] hope that helps')).toEqual([{ sector: "saas" }]);
    expect(parseCandidates("[]")).toEqual([]);
    expect(parseCandidates("")).toBeNull();
    expect(parseCandidates('{"sector":"saas"}')).toBeNull();
    expect(parseCandidates("[not json")).toBeNull();
  });
});

describe("excerptMentionsNumber", () => {
  it("matches 7.4 / 7.40 / 7x forms and not 17.4 or 7.45", () => {
    expect(excerptMentionsNumber("multiple was 7.4x", 7.4)).toBe(true);
    expect(excerptMentionsNumber("multiple was 7.40x", 7.4)).toBe(true);
    expect(excerptMentionsNumber("multiple was 7x", 7)).toBe(true);
    expect(excerptMentionsNumber("multiple was 17.4x", 7.4)).toBe(false);
    expect(excerptMentionsNumber("multiple was 7.45x", 7.4)).toBe(false);
    expect(excerptMentionsNumber("no numbers here", 7.4)).toBe(false);
  });
});

describe("validateCandidate — the verbatim gate", () => {
  const good = { sector: "saas", arr_low: 6.5, arr_mid: 7.4, arr_high: 8.2, excerpt: GOOD_EXCERPT, published_at: "2026-09-30" };

  it("accepts a verbatim excerpt that carries the number and stamps effective_from = today", () => {
    const v = validateCandidate(good, PAGE_TEXT, SRC, NOW);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.proposal).toEqual({
        sector: "saas",
        arr_low: 6.5,
        arr_mid: 7.4,
        arr_high: 8.2,
        effective_from: "2026-10-01",
        source_url: SRC.url,
        source_title: SRC.title,
        source_published_at: "2026-09-30",
        source_excerpt: GOOD_EXCERPT,
        status: "proposed",
        proposed_by: "cron",
      });
    }
  });

  it("rejects a paraphrased excerpt (not a substring of the fetched text)", () => {
    const v = validateCandidate({ ...good, excerpt: "The SaaS Capital Index median multiple was 7.4x ARR in September" }, PAGE_TEXT, SRC, NOW);
    expect(v).toEqual({ ok: false, reason: "excerpt_not_in_text", sector: "saas" });
  });

  it("rejects an excerpt that is verbatim but does not contain any of the numbers", () => {
    const v = validateCandidate({ ...good, excerpt: "Contact us for the full dataset." }, PAGE_TEXT, SRC, NOW);
    expect(v).toEqual({ ok: false, reason: "excerpt_lacks_number", sector: "saas" });
  });

  it("rejects bad sectors, sectors the source is not expected to cover, bad bands and bad excerpt lengths", () => {
    expect(validateCandidate({ ...good, sector: "crypto" }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: false, reason: "bad_sector" });
    expect(validateCandidate({ ...good, sector: "fintech" }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: false, reason: "sector_not_expected" });
    expect(validateCandidate({ ...good, arr_low: 9 }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: false, reason: "bad_numbers" });
    expect(validateCandidate({ ...good, arr_high: 500 }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: false, reason: "bad_numbers" });
    expect(validateCandidate({ ...good, arr_mid: "seven" }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: false, reason: "bad_numbers" });
    expect(validateCandidate({ ...good, excerpt: "7.4x" }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: false, reason: "excerpt_too_short" });
    expect(validateCandidate({ ...good, excerpt: "x".repeat(501) }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: false, reason: "excerpt_too_long" });
    expect(validateCandidate(null, PAGE_TEXT, SRC, NOW)).toEqual({ ok: false, reason: "not_object" });
    expect(validateCandidate({ ...good, published_at: "yesterday" }, PAGE_TEXT, SRC, NOW)).toMatchObject({ ok: true, proposal: { source_published_at: null } });
  });

  it("accepts numeric strings like '7.4x' for the band", () => {
    const v = validateCandidate({ ...good, arr_low: "6.5x", arr_mid: "7.4", arr_high: "8.2×" }, PAGE_TEXT, SRC, NOW);
    expect(v).toMatchObject({ ok: true, proposal: { arr_low: 6.5, arr_mid: 7.4, arr_high: 8.2 } });
  });
});

describe("refreshSectorMultiples", () => {
  const good = [{ sector: "saas", arr_low: 6.5, arr_mid: 7.4, arr_high: 8.2, excerpt: GOOD_EXCERPT, published_at: "2026-09-30" }];

  it("dry run: fetches + extracts, inserts nothing, returns the proposals it would insert", async () => {
    const { client, inserted } = sb();
    const fetch = vi.fn(async () => fetched(PAGE_HTML));
    const ai = aiReturning(good);
    const s = await refreshSectorMultiples({ dryRun: true, now: NOW, sources: [SRC], fetch, ai, supabase: client });
    expect(s.ok).toBe(true);
    expect(s.dryRun).toBe(true);
    expect(inserted).toEqual([]);
    expect(s.proposed).toBe(1);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ sector: "saas", arr_mid: 7.4, status: "proposed", proposed_by: "cron", source_excerpt: GOOD_EXCERPT });
    expect(s.sources[0]).toMatchObject({ id: "saas-capital-index", status: "proposed", accepted: 1, candidates: 1, httpStatus: 200 });
    expect(fetch).toHaveBeenCalledWith(SRC.url);
    expect(ai).toHaveBeenCalledTimes(1);
  });

  it("live run: inserts a `proposed` row per accepted candidate and never an approved one", async () => {
    const { client, inserted } = sb();
    const s = await refreshSectorMultiples({ now: NOW, sources: [SRC], fetch: async () => fetched(PAGE_HTML), ai: aiReturning(good), supabase: client });
    expect(s.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ __table: "sector_multiples_overrides", status: "proposed", proposed_by: "cron", sector: "saas", source_url: SRC.url });
    expect(inserted.every((r) => r.status === "proposed")).toBe(true);
  });

  it("live run without a Supabase client → ok:false supabase_unavailable, nothing fetched", async () => {
    const fetch = vi.fn(async () => fetched(PAGE_HTML));
    const s = await refreshSectorMultiples({ now: NOW, sources: [SRC], fetch, ai: aiReturning(good), supabase: null });
    expect(s).toMatchObject({ ok: false, error: "supabase_unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a candidate whose excerpt is not in the text is rejected and never inserted", async () => {
    const { client, inserted } = sb();
    const bad = [{ sector: "saas", arr_low: 6, arr_mid: 7, arr_high: 8, excerpt: "The index median was 7x in September 2026 per the report." }];
    const s = await refreshSectorMultiples({ now: NOW, sources: [SRC], fetch: async () => fetched(PAGE_HTML), ai: aiReturning(bad), supabase: client });
    expect(inserted).toEqual([]);
    expect(s.proposed).toBe(0);
    expect(s.sources[0]).toMatchObject({ status: "no_candidates", candidates: 1, accepted: 0, rejected: [{ reason: "excerpt_not_in_text", sector: "saas" }] });
  });

  it("one bad source (403 / network error / AI failure / unparseable) is logged and the others still run", async () => {
    const blocked: MultiplesSource = { ...SRC, id: "blocked", url: "https://blocked.example/" };
    const thrower: MultiplesSource = { ...SRC, id: "thrower", url: "https://throws.example/" };
    const aiDown: MultiplesSource = { ...SRC, id: "ai-down", url: "https://ai-down.example/" };
    const garbage: MultiplesSource = { ...SRC, id: "garbage", url: "https://garbage.example/" };
    const empty: MultiplesSource = { ...SRC, id: "empty", url: "https://empty.example/" };
    const fetch = vi.fn(async (url: string): Promise<FetchTextResult> => {
      if (url === blocked.url) return fetched("", { ok: false, status: 403, blocked: true });
      if (url === thrower.url) throw new Error("socket hang up");
      if (url === empty.url) return fetched("<html><body><div id=\"app\"></div></body></html>");
      return fetched(PAGE_HTML);
    });
    const ai = vi.fn(async ({ user }: { system: string; user: string }) => {
      if (user.includes(aiDown.url)) throw new Error("no provider");
      if (user.includes(garbage.url)) return { text: "I cannot help with that." };
      return { text: JSON.stringify(good) };
    });
    const { client, inserted } = sb();
    const s = await refreshSectorMultiples({ now: NOW, sources: [blocked, thrower, aiDown, garbage, empty, SRC], fetch, ai, supabase: client });
    expect(s.ok).toBe(true);
    const byId = Object.fromEntries(s.sources.map((o) => [o.id, o]));
    expect(byId.blocked).toMatchObject({ status: "blocked", httpStatus: 403 });
    expect(byId.thrower).toMatchObject({ status: "fetch_failed", error: "socket hang up" });
    expect(byId["ai-down"]).toMatchObject({ status: "ai_failed", error: "no provider" });
    expect(byId.garbage).toMatchObject({ status: "ai_unparseable" });
    expect(byId.empty).toMatchObject({ status: "empty_text" });
    expect(byId["saas-capital-index"]).toMatchObject({ status: "proposed", accepted: 1 });
    expect(inserted).toHaveLength(1);
    expect(s.proposed).toBe(1);
  });

  it("a unique-index collision (re-run) counts as a duplicate, not a failure; other insert errors mark the source", async () => {
    let calls = 0;
    const client: SupabaseLike = {
      from: () => ({
        insert: async () => {
          calls++;
          return calls === 1 ? { error: { code: "23505", message: "duplicate key" } } : { error: { code: "42P01", message: "relation missing" } };
        },
      }),
    };
    const two = [
      ...good,
      { sector: "saas", arr_low: 7.9, arr_mid: 7.9, arr_high: 7.9, excerpt: "down from 7.9x in August", published_at: null },
    ];
    const s = await refreshSectorMultiples({ now: NOW, sources: [SRC], fetch: async () => fetched(PAGE_HTML), ai: aiReturning(two), supabase: client });
    expect(s.sources[0]).toMatchObject({ status: "insert_failed", duplicates: 1, accepted: 0, error: "relation missing" });
    expect(s.duplicates).toBe(1);
    expect(s.proposed).toBe(0);
  });

  it("identical candidates within one response are de-duplicated before insert", async () => {
    const { client, inserted } = sb();
    const s = await refreshSectorMultiples({ now: NOW, sources: [SRC], fetch: async () => fetched(PAGE_HTML), ai: aiReturning([...good, ...good]), supabase: client });
    expect(inserted).toHaveLength(1);
    expect(s.sources[0]).toMatchObject({ accepted: 1, duplicates: 1 });
  });
});
