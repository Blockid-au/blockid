// S27-C — proposal loop: verbatim-excerpt gate, per-source failure isolation,
// dry run inserts nothing, live run inserts `proposed` rows and treats the
// unique-index collision as a duplicate.

import { describe, expect, it, vi } from "vitest";
import {
  HEAD_TEXT_CHARS,
  MAX_CANDIDATES_PER_SOURCE,
  MAX_TEXT_CHARS,
  excerptMentionsNumber,
  extractFirstBalancedJson,
  extractionSystemPrompt,
  parseCandidates,
  refreshSectorMultiples,
  relevantTextWindow,
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
    // Lane-2 P3-h: JSON only, schema shown, capped candidate count.
    expect(p).toMatch(/no reasoning, no explanation, no markdown, no code fence/);
    expect(p).toContain("Start the reply with [ and end it with ]");
    expect(p).toContain('"sector": <key>, "arr_low": <number>, "arr_mid": <number>, "arr_high": <number>, "excerpt": <string>, "published_at"');
    expect(p).toContain(`At most ${MAX_CANDIDATES_PER_SOURCE} elements`);
    expect(MAX_CANDIDATES_PER_SOURCE).toBe(12);
  });
});

describe("extractFirstBalancedJson (lane-2 P3-h)", () => {
  it("returns the first balanced block and ignores prose around it, brackets inside strings and nested objects", () => {
    expect(extractFirstBalancedJson('We need to extract… here: [{"sector":"saas","excerpt":"a [7.4x] mid"}] and then more [1]')).toBe('[{"sector":"saas","excerpt":"a [7.4x] mid"}]');
    expect(extractFirstBalancedJson('{"candidates":[{"a":{"b":1}}]} trailing')).toBe('{"candidates":[{"a":{"b":1}}]}');
    expect(extractFirstBalancedJson('x: ["escaped \\" quote ]"]')).toBe('["escaped \\" quote ]"]');
  });
  it("is null for prose only, a truncated (never closed) array and mismatched brackets", () => {
    expect(extractFirstBalancedJson("I cannot help with that.")).toBeNull();
    expect(extractFirstBalancedJson('[{"sector":"saas","arr_low":6.5,"arr_mid":7.4,"excerpt":"the SaaS Capital Index median EV/ARR multi')).toBeNull();
    expect(extractFirstBalancedJson('[{"sector":"saas"]}')).toBeNull();
    expect(extractFirstBalancedJson("")).toBeNull();
    // A truncated array whose first element IS complete yields that inner
    // object (the scan continues past the unclosed `[`) — parseCandidates
    // then rejects it because it is not an array of objects.
    expect(extractFirstBalancedJson('[{"sector":"saas"}')).toBe('{"sector":"saas"}');
    expect(parseCandidates('[{"sector":"saas"}')).toBeNull();
  });
});

describe("relevantTextWindow (lane-2 P3-h)", () => {
  it("passes a short page through untouched", () => {
    expect(relevantTextWindow(PAGE_TEXT)).toBe(PAGE_TEXT);
  });
  it("keeps the head plus windows around multiple / EV/ / ARR / revenue on a long page, in order, under the cap, and every window is verbatim page text", () => {
    const filler = (n: number, ch = "lorem ipsum ") => ch.repeat(Math.ceil(n / ch.length)).slice(0, n);
    const head = "SaaS Capital Index — as of 30 September 2026. ";
    const hit1 = "The median EV/ARR multiple was 7.4x in September.";
    const hit2 = "Fintech revenue multiples sit at 5.1x.";
    const page = head + filler(9_000) + hit1 + filler(9_000) + hit2 + filler(9_000);
    expect(page.length).toBeGreaterThan(MAX_TEXT_CHARS);
    const out = relevantTextWindow(page);
    expect(out.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(out.startsWith(page.slice(0, HEAD_TEXT_CHARS))).toBe(true);
    expect(out).toContain(hit1);
    expect(out).toContain(hit2);
    expect(out.indexOf(hit1)).toBeLessThan(out.indexOf(hit2));
    for (const piece of out.split("\n…\n")) expect(page).toContain(piece);
    // The old first-14kB clip would have lost hit2 (at ~18k).
    expect(page.slice(0, 14_000)).not.toContain(hit2);
  });
  it("falls back to the head of the page when no keyword appears", () => {
    const page = "x".repeat(MAX_TEXT_CHARS * 2);
    expect(relevantTextWindow(page)).toBe(page.slice(0, MAX_TEXT_CHARS));
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

  it("lane-2 P3-h: a reasoning-prose reply wrapping the array parses; a wrapped object {candidates:[…]} parses; a truncated array is null", () => {
    const prose = 'We need to extract the multiples. Looking at the page, the SaaS Capital Index median EV/ARR multiple was 7.4x [1].\n\nHere is the JSON:\n[{"sector":"saas","arr_low":6.5,"arr_mid":7.4,"arr_high":8.2,"excerpt":"median EV/ARR multiple was 7.4x","published_at":null}]\n\nLet me know if you need anything else.';
    expect(parseCandidates(prose)).toEqual([{ sector: "saas", arr_low: 6.5, arr_mid: 7.4, arr_high: 8.2, excerpt: "median EV/ARR multiple was 7.4x", published_at: null }]);
    expect(parseCandidates('{"candidates":[{"sector":"saas"}]}')).toEqual([{ sector: "saas" }]);
    const truncated = 'Sure: [{"sector":"saas","arr_low":6.5,"arr_mid":7.4,"arr_high":8.2,"excerpt":"the SaaS Capital Index median EV/ARR multiple was 7.4x"},{"sector":"fintech","arr_low":4,"arr_mid":5.1,"arr_h';
    expect(parseCandidates(truncated)).toBeNull();
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

  it("S29-hardening fetch-only: every source is fetched and reported, the model is never called, nothing inserted, dryRun implied", async () => {
    const { client, inserted } = sb();
    const fetch = vi.fn(async () => fetched(PAGE_HTML));
    const ai = aiReturning(good);
    const s = await refreshSectorMultiples({ fetchOnly: true, now: NOW, sources: [SRC], fetch, ai, supabase: client });
    expect(s).toMatchObject({ ok: true, dryRun: true, fetchOnly: true, proposed: 0, entries: [] });
    expect(s.sources[0]).toMatchObject({ id: "saas-capital-index", status: "fetched", httpStatus: 200, candidates: 0, accepted: 0 });
    expect(s.sources[0].textChars).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledWith(SRC.url);
    expect(ai).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
    // A fetch failure still reports as such (that is the point of the check).
    const bad = await refreshSectorMultiples({ fetchOnly: true, now: NOW, sources: [SRC], fetch: vi.fn(async () => ({ ...fetched(PAGE_HTML), ok: false, status: 403, error: "HTTP 403" })), ai, supabase: client });
    expect(bad.sources[0].status).toBe("fetch_failed");
    expect(ai).not.toHaveBeenCalled();
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
    const truncated: MultiplesSource = { ...SRC, id: "truncated", url: "https://truncated.example/" };
    const prosey: MultiplesSource = { ...SRC, id: "prosey", url: "https://prosey.example/" };
    const ai = vi.fn(async ({ user }: { system: string; user: string }) => {
      if (user.includes(aiDown.url)) throw new Error("no provider");
      if (user.includes(garbage.url)) return { text: "I cannot help with that." };
      // Lane-2 P3-h: a reply cut off mid-array has no balanced block → still ai_unparseable.
      if (user.includes(truncated.url)) return { text: JSON.stringify(good).slice(0, -20) };
      // …but prose around a complete array is fine.
      if (user.includes(prosey.url)) return { text: `We need to extract the multiples from this page.\n\n${JSON.stringify(good)}\n\nDone.` };
      return { text: JSON.stringify(good) };
    });
    const { client, inserted } = sb();
    const s = await refreshSectorMultiples({ now: NOW, sources: [blocked, thrower, aiDown, garbage, empty, truncated, prosey, SRC], fetch, ai, supabase: client });
    expect(s.ok).toBe(true);
    const byId = Object.fromEntries(s.sources.map((o) => [o.id, o]));
    expect(byId.blocked).toMatchObject({ status: "blocked", httpStatus: 403 });
    expect(byId.thrower).toMatchObject({ status: "fetch_failed", error: "socket hang up" });
    expect(byId["ai-down"]).toMatchObject({ status: "ai_failed", error: "no provider" });
    expect(byId.garbage).toMatchObject({ status: "ai_unparseable" });
    expect(byId.empty).toMatchObject({ status: "empty_text" });
    expect(byId.truncated).toMatchObject({ status: "ai_unparseable" });
    expect(byId.prosey).toMatchObject({ status: "proposed", accepted: 1 });
    expect(byId["saas-capital-index"]).toMatchObject({ status: "proposed", accepted: 1 });
    expect(inserted).toHaveLength(2);
    expect(s.proposed).toBe(2);
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
