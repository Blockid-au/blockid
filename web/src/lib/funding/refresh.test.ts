// Colocated vitest for refreshFundingSources (T0243). Everything is injected:
// a fake DB (records updates), a fake fetch keyed by URL, and a temp queue
// file — so the contract below is pinned without network or Supabase:
//
//   reachable + agreeing hint  → verified_by=cron stamp
//   reachable + disagreeing    → queue entry, row untouched (never auto-close)
//   upcoming + explicit open   → the one auto-flip
//   403/429                    → queue `blocked`, row untouched
//   feed item w/o name match   → queue `possible_new_grant` (deduped on rerun)
//   dryRun                     → identical summary, zero writes

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchTextResult } from "./fetch-source";
import {
  decideRow,
  fuzzyNameMatch,
  isStartupRelevant,
  nameNearEvidence,
  nameTokens,
  refreshFundingSources,
  reviewEntryKey,
  type RefreshDb,
  type RefreshGrantRow,
  isSameFeedHost,
} from "./refresh";
import { readReviewQueue } from "./review-queue";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const NOW = new Date("2026-09-13T04:00:00Z");
const FEED = "https://www.grants.gov.au/public_data/rss/rss.xml";

const tmpDirs: string[] = [];
function tmpQueue(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-queue-"));
  tmpDirs.push(dir);
  return path.join(dir, "grants-review-queue.jsonl");
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function row(over: Partial<RefreshGrantRow>): RefreshGrantRow {
  return {
    id: "x",
    name: "X",
    status: "open",
    closes_at: null,
    official_url: "https://official.example/x",
    source_url: null,
    exclude_from_matching: false,
    status_confidence: "medium",
    ...over,
  };
}

function fakeDb(rows: RefreshGrantRow[], loadError: string | null = null) {
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const selectEqs: Array<[string, unknown]> = [];
  const db: RefreshDb = {
    from: (table: string) => {
      if (table !== "au_grants") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            selectEqs.push([col, val]);
            return Promise.resolve({ data: loadError ? null : rows, error: loadError ? { message: loadError } : null });
          },
        }),
        update: (values: Record<string, unknown>) => ({
          eq: (_col: string, id: unknown) => {
            updates.push({ id: String(id), values });
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
  return { db, updates, selectEqs };
}

function res(over: Partial<FetchTextResult>): FetchTextResult {
  return { ok: true, status: 200, text: "", blocked: false, truncated: false, attempts: 1, ...over };
}

function fakeFetch(map: Record<string, FetchTextResult>) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    return map[url] ?? res({ ok: false, status: 0, error: "no fixture" });
  };
  return { fetch, calls };
}

const RSS = `<rss><channel>
<item><title>Research and Development Tax Incentive – 2026-27 registrations</title><link>https://www.grants.gov.au/go/1</link><pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate><description>d1</description></item>
<item><title>GO9999 - Quantum Sensing Challenge Round 1</title><link>https://www.grants.gov.au/go/2</link><pubDate>Tue, 08 Sep 2026 00:00:00 GMT</pubDate><description>d2</description></item>
<item><title>GO8527: WA Roadmap Implementation Fund: Farm System Productivity Program</title><link>https://www.grants.gov.au/go/3</link><pubDate>Wed, 22 Jul 2026 00:00:00 GMT</pubDate><description>Sheep producers transition away from live sheep exports by sea.</description></item>
</channel></rss>`;

const HTML_LIST_PAGE = `<html><head><link rel="alternate" type="application/rss+xml" href="/public_data/rss/rss.xml"></head><body>Current Grant Opportunity List</body></html>`;

describe("nameTokens / fuzzyNameMatch", () => {
  it("drops stopwords, years and round numbers", () => {
    expect(nameTokens("Ignite Ideas Fund Round 12 (2026)")).toEqual(["ignite", "ideas"]);
  });

  it("matches renamed / re-rounded titles and acronyms, rejects unrelated ones", () => {
    expect(fuzzyNameMatch("Ignite Ideas Fund Round 13", "Ignite Ideas Fund")).toBe(true);
    expect(fuzzyNameMatch("R&DTI registration reminder", "Research and Development Tax Incentive (R&DTI)")).toBe(true);
    expect(fuzzyNameMatch("Export Market Development Grants 2026-27", "Export Market Development Grants (EMDG)")).toBe(true);
    expect(fuzzyNameMatch("Quantum Sensing Challenge", "Ignite Ideas Fund")).toBe(false);
    expect(fuzzyNameMatch("", "Ignite Ideas Fund")).toBe(false);
  });
});

describe("isStartupRelevant", () => {
  it("keeps startup / SME / innovation items and drops the rest of GrantConnect", () => {
    expect(isStartupRelevant({ title: "GO9999 - Quantum Sensing Challenge Round 1", description: "" })).toBe(true);
    expect(isStartupRelevant({ title: "Regional Precincts", description: "Grants for early-stage startups and SMEs" })).toBe(true);
    expect(isStartupRelevant({ title: "GO8560: Indigenous Broadcasting and Media Program", description: "community broadcasting" })).toBe(false);
    expect(isStartupRelevant({ title: "WA Roadmap Implementation Fund: Farm System Productivity Program", description: "sheep producers" })).toBe(false);
    expect(isStartupRelevant({ title: "GO8141: Future Made in Australia Innovation Fund", description: "" })).toBe(true);
    expect(isStartupRelevant({ title: "GO6896: Defence Industry Development Grants Program - Exports Stream", description: "" })).toBe(true);
    // Medical-research bodies fund institutions, not founders — excluded even when the blurb says "innovation".
    expect(isStartupRelevant({ title: "GO8540: MRFF - Australian Brain Cancer Mission - 2026 Research Grant Opportunity", description: "innovation, commercialisation, startups" })).toBe(false);
    expect(isStartupRelevant({ title: "GO8312: 2026 NHMRC-Horizon Europe", description: "research collaboration" })).toBe(false);
    // One generic word in the blurb is not enough.
    expect(isStartupRelevant({ title: "GO6332: Aged Care Capital Assistance Program", description: "digital technology upgrades for SMEs" })).toBe(false);
    expect(isStartupRelevant({ title: "GO7372: DRIVEN Charger Rebate Stream", description: "automotive industry innovation" })).toBe(false);
  });

  it("reviewEntryKey ignores ts/current and keys on the finding itself", () => {
    const a = { kind: "grant" as const, id: "x", url: "u", reason: "blocked" as const, hint: { http_status: 403 } };
    expect(reviewEntryKey(a)).toBe(reviewEntryKey({ ...a, url: "other" }));
    expect(reviewEntryKey(a)).not.toBe(reviewEntryKey({ ...a, hint: { http_status: 429 } }));
    expect(reviewEntryKey({ kind: "new", url: "u", reason: "possible_new_grant", hint: {} })).toBe("new|u|possible_new_grant|||");
  });
});

describe("decideRow", () => {
  const NAME = "Ignite Ideas Fund";
  const EV = "Ignite Ideas Fund — Applications are now open for Round 13.";

  it("no signal → none; agreeing → verify", () => {
    expect(decideRow({ status: "open", closes_at: null, name: NAME }, { confidence: "low" })).toEqual({ action: "none" });
    expect(decideRow({ status: "open", closes_at: "2026-12-01", name: NAME }, { status: "open", closes_at: "2026-12-01", confidence: "medium" })).toEqual({ action: "verify" });
    expect(decideRow({ status: "open", closes_at: null, name: NAME }, { status: "open", confidence: "medium" })).toEqual({ action: "verify" });
  });

  it("never auto-closes: open → closed hint is a queue entry", () => {
    expect(decideRow({ status: "open", closes_at: null, name: NAME }, { status: "closed", confidence: "medium" })).toEqual({ action: "queue", reason: "status_mismatch" });
    expect(decideRow({ status: "open", closes_at: "2026-12-01", name: NAME }, { closes_at: "2027-01-31", confidence: "low" })).toEqual({ action: "queue", reason: "closes_at_mismatch" });
    expect(decideRow({ status: "open", closes_at: "2026-12-01", name: NAME }, { status: "closed", closes_at: "2026-06-01", confidence: "low" })).toEqual({ action: "queue", reason: "status_closes_mismatch" });
  });

  it("flips upcoming → open only on an explicit medium 'applications open' hint next to the grant's own name", () => {
    expect(decideRow({ status: "upcoming", closes_at: null, name: NAME }, { status: "open", explicit_open: true, confidence: "medium", evidence: EV })).toEqual({ action: "flip_open" });
    // not explicit (e.g. "Status: Closing soon") → queue
    expect(decideRow({ status: "upcoming", closes_at: null, name: NAME }, { status: "open", confidence: "medium", evidence: EV })).toEqual({ action: "queue", reason: "status_mismatch" });
    // explicit, but the "open" claim is about a different program on the same page (live sa-rif-seed-start case) → queue
    expect(decideRow({ status: "upcoming", closes_at: null, name: "Research and Innovation Fund — Seed-Start" }, { status: "open", explicit_open: true, confidence: "medium", evidence: "Read More 2nd Mar 2026 Applications open for the 2026 SA Science Excellence Awards" })).toEqual({ action: "queue", reason: "status_mismatch" });
    // paused is a human call
    expect(decideRow({ status: "paused", closes_at: null, name: NAME }, { status: "open", explicit_open: true, confidence: "medium", evidence: EV })).toEqual({ action: "queue", reason: "status_mismatch" });
    expect(decideRow({ status: "paused", closes_at: null, name: NAME }, { status: "paused", confidence: "medium" })).toEqual({ action: "verify" });
    expect(decideRow({ status: "open", closes_at: null, name: NAME }, { status: "paused", confidence: "medium" })).toEqual({ action: "queue", reason: "status_mismatch" });
    // closes_at also disagrees → no flip, queue both
    expect(decideRow({ status: "upcoming", closes_at: "2026-10-01", name: NAME }, { status: "open", explicit_open: true, closes_at: "2026-11-01", confidence: "medium", evidence: EV })).toEqual({ action: "queue", reason: "status_closes_mismatch" });
  });

  it("nameNearEvidence: two distinctive name tokens must appear (one if the name has one); generic words do not count", () => {
    expect(nameNearEvidence("Ignite Ideas Fund", "…Ignite Ideas Fund applications are now open…")).toBe(true);
    expect(nameNearEvidence("Ignite Ideas Fund", "Ignite round 13 applications are now open")).toBe(false); // 1 of 2
    expect(nameNearEvidence("Ignite Ideas Fund", "Applications open for the SA Science Excellence Awards")).toBe(false);
    expect(nameNearEvidence("Ignite Ideas Fund", undefined)).toBe(false);
    expect(nameNearEvidence("Go Grant", "anything")).toBe(true); // no token ≥ 4 chars after stopwords
    expect(nameNearEvidence("Catalyst Grant", "The Catalyst grant is now open")).toBe(true); // single distinctive token
    // Live false positive: "plant research" on the SA RIF page must not vouch for "Research & Innovation Fund — Seed-Start".
    expect(nameNearEvidence("Research & Innovation Fund — Seed-Start (SA)", "$2 million to power new era of plant research Read More 2nd Mar 2026 Applications open for the 2026 SA Science Excellence Awards")).toBe(false);
    expect(nameNearEvidence("Research & Innovation Fund — Seed-Start (SA)", "Seed-Start applications are now open — RIF")).toBe(true);
  });
});

describe("refreshFundingSources", () => {
  const rows = [
    row({ id: "rdti", name: "Research and Development Tax Incentive (R&DTI)", status: "open", closes_at: "2027-04-30", source_url: "https://src/rdti" }),
    row({ id: "emdg", name: "Export Market Development Grants (EMDG)", status: "open", closes_at: null, source_url: "https://src/emdg" }),
    row({ id: "nt-grant", name: "NT Business Growth", status: "open", closes_at: null, source_url: "https://src/nt" }),
    row({ id: "ignite", name: "Ignite Ideas Fund", status: "upcoming", closes_at: null, source_url: "https://src/ignite" }),
    row({ id: "gone", name: "Old Grant", status: "closed", closes_at: "2024-01-01", source_url: "https://src/gone" }),
    row({ id: "nourl", name: "No URL", official_url: "", source_url: null }),
    row({ id: "silent", name: "Silent page", status: "open", official_url: "https://src/silent" }),
  ];

  const fixtures: Record<string, FetchTextResult> = {
    "https://src/rdti": res({ text: "<p>Status: Open</p><p>Closing date: 30 April 2027</p>" }), // agrees → verify
    "https://src/emdg": res({ text: "<h1>EMDG</h1><p>Applications for Round 4 have closed.</p>" }), // disagrees → queue, no auto-close
    "https://src/nt": res({ ok: false, status: 403, blocked: true }), // blocked
    "https://src/ignite": res({ text: "<h1>Ignite Ideas Fund</h1><p>Applications are now open for Round 13.</p>" }), // upcoming → open flip
    "https://src/gone": res({ ok: false, status: 404, text: "not found" }), // unreachable
    "https://src/silent": res({ text: "<p>Welcome.</p>" }), // no signal
    [FEED]: res({ text: RSS }),
  };

  it("classifies rows, stamps cron verification, flips upcoming→open, queues the rest + new feed items", async () => {
    const { db, updates, selectEqs } = fakeDb(rows);
    const { fetch, calls } = fakeFetch(fixtures);
    const queuePath = tmpQueue();

    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath, concurrency: 2 });

    expect(selectEqs).toEqual([["exclude_from_matching", false]]);
    expect(calls.filter((u) => u !== FEED).sort()).toEqual(Object.keys(fixtures).filter((u) => u !== FEED).sort());
    expect(s).toMatchObject({
      ok: true,
      dryRun: false,
      checked: 6,
      reachable: 4, // rdti, emdg, ignite, silent (silent = reachable, no signal)
      blocked: 1,
      verified: 1,
      flipped: 1,
      queued: 5, // emdg mismatch, nt blocked, gone unreachable, ignite flip audit, quantum new
      deduped: 0,
      errors: 0,
      skipped: 0,
      feed: { url: FEED, items: 3, blocked: false, newCandidates: 1 }, // sheep roadmap filtered as irrelevant
    });

    expect(updates).toEqual([
      { id: "rdti", values: { last_verified_at: "2026-09-13", verified_by: "cron" } },
      { id: "ignite", values: { status: "open", status_confidence: "medium", last_verified_at: "2026-09-13", verified_by: "cron" } },
    ]);
    // emdg was NOT closed automatically
    expect(updates.find((u) => u.id === "emdg")).toBeUndefined();

    const queue = readReviewQueue(200, queuePath);
    expect(queue).toHaveLength(5);
    const byReason = Object.fromEntries(queue.map((e) => [e.reason, e]));
    expect(byReason.status_mismatch).toMatchObject({
      ts: NOW.toISOString(),
      kind: "grant",
      id: "emdg",
      url: "https://src/emdg",
      hint: { status: "closed", confidence: "medium" },
      current: { status: "open", closes_at: null, status_confidence: "medium" },
    });
    expect(byReason.blocked).toMatchObject({ kind: "grant", id: "nt-grant", url: "https://src/nt", hint: { http_status: 403 }, current: { status: "open" } });
    expect(byReason.unreachable).toMatchObject({ kind: "grant", id: "gone", hint: { http_status: 404 } });
    expect(byReason.possible_new_grant).toMatchObject({
      kind: "new",
      url: "https://www.grants.gov.au/go/2",
      hint: { title: "GO9999 - Quantum Sensing Challenge Round 1", source: "grantconnect_rss" },
      current: null,
    });
    expect(byReason.possible_new_grant.id).toBeUndefined();
    expect(byReason.flipped_open).toMatchObject({ kind: "grant", id: "ignite", hint: { status: "open", explicit_open: true }, current: { status: "upcoming" } });
    expect(s.entries).toHaveLength(5);
  });

  it("does not re-queue identical grant findings within 28 days, but does after", async () => {
    const queuePath = tmpQueue();
    const first = await refreshFundingSources({ now: NOW, db: fakeDb(rows).db, fetch: fakeFetch(fixtures).fetch, queuePath });
    expect(first.queued).toBe(5);
    const second = await refreshFundingSources({ now: new Date("2026-09-20T04:00:00Z"), db: fakeDb(rows).db, fetch: fakeFetch(fixtures).fetch, queuePath });
    expect(second).toMatchObject({ queued: 0, deduped: 4, feed: { newCandidates: 0 } });
    expect(readReviewQueue(200, queuePath)).toHaveLength(5);
    const later = await refreshFundingSources({ now: new Date("2026-11-01T04:00:00Z"), db: fakeDb(rows).db, fetch: fakeFetch(fixtures).fetch, queuePath });
    expect(later).toMatchObject({ queued: 4, deduped: 0, feed: { newCandidates: 0 } }); // feed dedupe has no window
    expect(readReviewQueue(200, queuePath)).toHaveLength(9);
  });

  it("does not re-queue a feed item that is already in the queue", async () => {
    const queuePath = tmpQueue();
    const first = await refreshFundingSources({ now: NOW, db: fakeDb(rows).db, fetch: fakeFetch(fixtures).fetch, queuePath });
    expect(first.feed.newCandidates).toBe(1);
    const second = await refreshFundingSources({ now: NOW, db: fakeDb(rows).db, fetch: fakeFetch(fixtures).fetch, queuePath });
    expect(second.feed.newCandidates).toBe(0);
    expect(readReviewQueue(200, queuePath).filter((e) => e.reason === "possible_new_grant")).toHaveLength(1);
  });

  it("queues a blocked GrantConnect feed (403) instead of failing", async () => {
    const { db, updates } = fakeDb([rows[0]]);
    const { fetch } = fakeFetch({ ...fixtures, [FEED]: res({ ok: false, status: 403, blocked: true }) });
    const queuePath = tmpQueue();
    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath });
    expect(s.ok).toBe(true);
    expect(s.feed).toEqual({ url: FEED, items: 0, blocked: true, newCandidates: 0 });
    expect(s.blocked).toBe(1);
    expect(readReviewQueue(200, queuePath)[0]).toMatchObject({ kind: "new", url: FEED, reason: "blocked", hint: { http_status: 403 } });
    expect(updates).toHaveLength(1); // rdti still verified
  });

  it("follows the RSS advertised by an HTML list page (plan's /go/list) once", async () => {
    const { db } = fakeDb([]);
    const listUrl = "https://www.grants.gov.au/go/list";
    const { fetch, calls } = fakeFetch({ [listUrl]: res({ text: HTML_LIST_PAGE }), "https://www.grants.gov.au/public_data/rss/rss.xml": res({ text: RSS }) });
    const queuePath = tmpQueue();
    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath, grantConnectUrl: listUrl });
    expect(calls).toEqual([listUrl, "https://www.grants.gov.au/public_data/rss/rss.xml"]);
    expect(s.feed).toEqual({ url: "https://www.grants.gov.au/public_data/rss/rss.xml", items: 3, blocked: false, newCandidates: 2 });
    expect(readReviewQueue(200, queuePath).every((e) => e.reason === "possible_new_grant")).toBe(true);
  });

  it("S8-C SSRF: an advertised feed on another host is NOT followed (feed_empty instead)", async () => {
    const { db } = fakeDb([]);
    const listUrl = "https://www.grants.gov.au/go/list";
    const offHost = `<html><head><link rel="alternate" type="application/rss+xml" href="http://169.254.169.254/latest/rss.xml"></head><body>list</body></html>`;
    const { fetch, calls } = fakeFetch({ [listUrl]: res({ text: offHost }), "http://169.254.169.254/latest/rss.xml": res({ text: RSS }) });
    const queuePath = tmpQueue();
    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath, grantConnectUrl: listUrl });
    expect(calls).toEqual([listUrl]);
    expect(s.feed.items).toBe(0);
    expect(readReviewQueue(200, queuePath)[0]).toMatchObject({ kind: "new", reason: "feed_empty" });
    expect(isSameFeedHost("https://www.grants.gov.au/public_data/rss/rss.xml", listUrl)).toBe(true);
    expect(isSameFeedHost("https://grants.gov.au/rss.xml", listUrl)).toBe(false);
    expect(isSameFeedHost("ftp://www.grants.gov.au/rss.xml", listUrl)).toBe(false);
    expect(isSameFeedHost("not a url", listUrl)).toBe(false);
  });

  it("feed returning HTML (no items) is queued as feed_empty", async () => {
    const { db } = fakeDb([]);
    const { fetch } = fakeFetch({ [FEED]: res({ text: "<html>Please enable JavaScript</html>" }) });
    const queuePath = tmpQueue();
    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath });
    expect(s.feed.items).toBe(0);
    expect(readReviewQueue(200, queuePath)[0]).toMatchObject({ kind: "new", reason: "feed_empty" });
  });

  it("dryRun computes the same summary but writes nothing", async () => {
    const { db, updates } = fakeDb(rows);
    const { fetch } = fakeFetch(fixtures);
    const queuePath = tmpQueue();
    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath, dryRun: true });
    expect(s).toMatchObject({ ok: true, dryRun: true, checked: 6, verified: 1, flipped: 1, queued: 5, blocked: 1 });
    expect(s.entries.map((e) => e.reason).sort()).toEqual(["blocked", "flipped_open", "possible_new_grant", "status_mismatch", "unreachable"]);
    expect(updates).toEqual([]);
    expect(fs.existsSync(queuePath)).toBe(false);
  });

  it("no DB → ok:false supabase_unavailable (default getSupabaseAdmin is mocked to null)", async () => {
    const s = await refreshFundingSources({ now: NOW, fetch: fakeFetch({}).fetch, queuePath: tmpQueue(), dryRun: true });
    expect(s).toMatchObject({ ok: false, error: "supabase_unavailable", checked: 0 });
  });

  it("load error → ok:false without fetching", async () => {
    const { db } = fakeDb([], "relation au_grants does not exist");
    const { fetch, calls } = fakeFetch(fixtures);
    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath: tmpQueue() });
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/load_failed/);
    expect(calls).toEqual([]);
  });

  it("feed can be disabled and fetch exceptions count as errors", async () => {
    const { db } = fakeDb([rows[0]]);
    const fetch = async () => {
      throw new Error("boom");
    };
    const s = await refreshFundingSources({ now: NOW, db, fetch, queuePath: tmpQueue(), grantConnectUrl: null });
    expect(s).toMatchObject({ ok: true, checked: 1, errors: 1, queued: 0, feed: { url: null, items: 0 } });
  });
});
