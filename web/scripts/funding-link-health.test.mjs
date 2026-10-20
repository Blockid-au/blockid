// W1 (2026-10-20) — weekly official_url health job for au_grants / au_programs
// (scripts/funding-link-health.mjs + scripts/lib/funding-link-health-core.mjs).
// Silent regressions this guards against:
//   - a 403/429 bot wall week resetting (or starting) the "broken since" clock;
//   - a programme flagged after one bad week instead of > 7 days;
//   - two concurrent requests to the same government host;
//   - --apply writing anything but status_confidence='low' (+ link_status once
//     that column exists), or writing without --apply;
//   - a redirect silently rewriting official_url (it is only proposed).

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HIDE_AFTER_DAYS,
  brokenDays,
  buildProposals,
  formatHealth,
  groupByHost,
  mergeHealth,
  rowsFromDb,
  rowsFromSeeds,
  sqlLiteral,
  summarizeHealth,
  verdictOf,
} from "./lib/funding-link-health-core.mjs";
import { checkAll, main, parseHealthArgs } from "./funding-link-health.mjs";

const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("funding-link-health core", () => {
  it("rowsFromSeeds / rowsFromDb build targets and skip excluded / URL-less rows", () => {
    const t = rowsFromSeeds(
      { grants: [{ id: "g1", name: "G", official_url: "https://a.example/g", status: "open", status_confidence: "high" }, { id: "x", official_url: "https://a.example/x", exclude_from_matching: true }, { id: "nourl" }] },
      { programs: [{ id: "p1", official_url: "https://b.example/p", status_confidence: "medium" }] },
    );
    expect(t.map((r) => `${r.table}:${r.id}`)).toEqual(["au_grants:g1", "au_programs:p1"]);
    expect(rowsFromSeeds({ grants: [{ id: "g", official_url: "https://x" }] }, { programs: [{ id: "p", official_url: "https://y" }] }, "programs").map((r) => r.id)).toEqual(["p"]);
    expect(rowsFromDb("program", [{ id: "p", official_url: "ftp://x" }, { id: "q", official_url: "https://q.example" }]).map((r) => r.id)).toEqual(["q"]);
  });

  it("verdictOf uses the site link-check rules", () => {
    expect(verdictOf({ status: 200 })).toBe("ok");
    expect(verdictOf({ status: 404 })).toBe("broken");
    expect(verdictOf({ status: 503 })).toBe("broken");
    expect(verdictOf({ status: 403 })).toBe("unverifiable");
    expect(verdictOf({ status: null, error: "too_many_redirects" })).toBe("broken");
  });

  it("mergeHealth carries first_failed_at while broken, ignores unverifiable weeks, resets on ok or a new URL", () => {
    const w1 = new Date("2026-10-04T04:00:00Z");
    const s1 = mergeHealth({}, [{ kind: "program", id: "p", url: "https://a.example/", status: 503 }], w1);
    expect(s1["program:p"]).toMatchObject({ verdict: "broken", first_failed_at: w1.toISOString(), consecutive_failures: 1 });
    const w2 = new Date("2026-10-11T04:00:00Z");
    const s2 = mergeHealth(s1, [{ kind: "program", id: "p", url: "https://a.example/", status: 429 }], w2);
    expect(s2["program:p"]).toMatchObject({ verdict: "unverifiable", first_failed_at: w1.toISOString(), consecutive_failures: 1 });
    const w3 = new Date("2026-10-18T04:00:00Z");
    const s3 = mergeHealth(s2, [{ kind: "program", id: "p", url: "https://a.example/", status: 503 }], w3);
    expect(s3["program:p"]).toMatchObject({ first_failed_at: w1.toISOString(), consecutive_failures: 2 });
    expect(brokenDays(s3["program:p"], w3)).toBe(14);
    const moved = mergeHealth(s3, [{ kind: "program", id: "p", url: "https://a.example/new", status: 404 }], w3);
    expect(moved["program:p"].first_failed_at).toBe(w3.toISOString());
    const fixed = mergeHealth(s3, [{ kind: "program", id: "p", url: "https://a.example/", status: 200 }], w3);
    expect(fixed["program:p"]).toMatchObject({ verdict: "ok", first_failed_at: null, consecutive_failures: 0, last_ok_at: w3.toISOString() });
  });

  it("buildProposals: mark_low only after ≥ 7 days and not already low; redirects proposed as commented SQL; link_status only when the column exists", () => {
    const now = new Date("2026-10-20T04:00:00Z");
    const targets = [
      { kind: "program", table: "au_programs", id: "old", url: "https://a.example/", status_confidence: "high" },
      { kind: "program", table: "au_programs", id: "fresh", url: "https://b.example/", status_confidence: "high" },
      { kind: "grant", table: "au_grants", id: "already", url: "https://c.example/", status_confidence: "low" },
      { kind: "grant", table: "au_grants", id: "moved", url: "https://d.example/activate/", status_confidence: "high" },
      { kind: "grant", table: "au_grants", id: "slash", url: "https://e.example/x", status_confidence: "high" },
    ];
    const state = {
      "program:old": { verdict: "broken", url: "https://a.example/", status: 503, first_failed_at: "2026-10-12T04:00:00.000Z" },
      "program:fresh": { verdict: "broken", url: "https://b.example/", status: 404, first_failed_at: "2026-10-18T04:00:00.000Z" },
      "grant:already": { verdict: "broken", url: "https://c.example/", status: 404, first_failed_at: "2026-09-01T04:00:00.000Z" },
      "grant:moved": { verdict: "ok", url: "https://d.example/activate/", status: 200, hops: 3, final_url: "https://d.example/startups/" },
      "grant:slash": { verdict: "ok", url: "https://e.example/x", status: 200, hops: 1, final_url: "https://www.e.example/x/" },
    };
    for (const [key, row] of Object.entries(state)) {
      const [kind, id] = key.split(":");
      Object.assign(row, { kind, id });
    }
    const p = buildProposals(state, targets, { now });
    expect(p.mark_low.map((m) => m.id)).toEqual(["old"]);
    expect(p.redirected.map((r) => r.id)).toEqual(["moved"]);
    expect(p.link_status).toEqual([]);
    expect(p.sql[0]).toMatch(/^update public\.au_programs set status_confidence = 'low', updated_at = now\(\) where id = 'old' and status_confidence <> 'low';/);
    expect(p.sql[1]).toMatch(/^-- verify by hand, then: update public\.au_grants set official_url = 'https:\/\/d\.example\/startups\/'/);
    const withCol = buildProposals(state, targets, { now, hasLinkStatus: true });
    expect(withCol.link_status).toHaveLength(5);
    expect(withCol.sql.some((s) => s.includes("set link_status = 'broken'"))).toBe(true);
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(HIDE_AFTER_DAYS).toBe(7);

    const s = summarizeHealth(state, p, { ts: now.toISOString(), source: "seed", hasLinkStatus: false, now });
    expect(s).toMatchObject({ checked: 5, ok: 2, broken: 3, broken_over_threshold: 2 });
    expect(s.broken_rows[0].id).toBe("already");
    expect(formatHealth(s)).toContain("0475_funding_link_status.sql");
  });

  it("groupByHost keeps per-host order", () => {
    const g = groupByHost([{ url: "https://a.example/1" }, { url: "https://b.example/1" }, { url: "https://a.example/2" }, { url: "nope" }]);
    expect(Array.from(g.keys())).toEqual(["a.example", "b.example", "(invalid)"]);
    expect(g.get("a.example").map((t) => t.url)).toEqual(["https://a.example/1", "https://a.example/2"]);
  });

  it("parseHealthArgs", () => {
    expect(parseHealthArgs([])).toMatchObject({ source: null, only: "all", apply: false, hideAfterDays: 7, hostDelayMs: 1500, concurrency: 4 });
    expect(parseHealthArgs(["--source", "seed", "--only=programs", "--apply", "--hide-after-days", "14", "--host-delay", "0", "--dry-run"])).toMatchObject({ source: "seed", only: "programs", apply: true, hideAfterDays: 14, hostDelayMs: 0, dryRun: true });
  });
});

describe("funding-link-health CLI", () => {
  it("checkAll: never two in-flight requests to the same host; HEAD then GET; loops are broken", async () => {
    const inFlight = new Map();
    let maxSameHost = 0;
    const calls = [];
    const fetchImpl = async (url, init) => {
      const host = new URL(url).hostname;
      inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
      maxSameHost = Math.max(maxSameHost, inFlight.get(host));
      calls.push(`${init.method} ${url}`);
      await new Promise((r) => setTimeout(r, 2));
      inFlight.set(host, inFlight.get(host) - 1);
      if (host === "loop.example") return new Response("", { status: 302, headers: { location: new URL(url).pathname === "/a" ? "/b" : "/a" } });
      if (host === "nohead.example") return new Response("", { status: init.method === "HEAD" ? 405 : 200 });
      return new Response("", { status: 200 });
    };
    const targets = [
      { kind: "program", id: "a1", url: "https://gov.example/1" },
      { kind: "program", id: "a2", url: "https://gov.example/2" },
      { kind: "program", id: "a3", url: "https://gov.example/3" },
      { kind: "grant", id: "l", url: "https://loop.example/a" },
      { kind: "grant", id: "n", url: "https://nohead.example/" },
    ];
    const results = await checkAll(targets, { concurrency: 4, hostDelayMs: 1, timeoutMs: 2000, fetchImpl, lookup });
    expect(maxSameHost).toBe(1);
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.l).toMatchObject({ error: "redirect_loop" });
    expect(byId.n).toMatchObject({ status: 200 });
    expect(calls.filter((c) => c.includes("nohead"))).toEqual(["HEAD https://nohead.example/", "GET https://nohead.example/"]);
  });

  it("main(): seed source writes the report, proposes SQL, never writes the DB without --apply; --apply writes low + queue", async () => {
    const web = mkdtempSync(join(tmpdir(), "flh-web-"));
    const out = mkdtempSync(join(tmpdir(), "flh-out-"));
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(web, "content", "data"), { recursive: true });
    writeFileSync(join(web, "content/data/grants-au.seed.json"), JSON.stringify({ grants: [{ id: "g-ok", official_url: "https://ok.example/", status_confidence: "high" }] }));
    writeFileSync(join(web, "content/data/programs-au.seed.json"), JSON.stringify({ programs: [{ id: "p-down", official_url: "https://down.example/", status_confidence: "high" }] }));
    const fetchImpl = async (url) => new Response("", { status: new URL(url).hostname === "down.example" ? 503 : 200 });
    const logs = [];
    const base = { fetchImpl, lookup, webDir: web, log: (s) => logs.push(s), db: null };

    // week 1: broken but young → exit 0, no proposal
    const r1 = await main(["--source", "seed", "--out-dir", out, "--host-delay", "0"], { ...base, now: () => new Date("2026-10-06T04:00:00Z") });
    expect(r1.exitCode).toBe(0);
    expect(r1.summary).toMatchObject({ source: "seed", checked: 2, ok: 1, broken: 1, broken_over_threshold: 0 });
    expect(r1.summary.proposed_sql).toEqual([]);
    const latest = JSON.parse(readFileSync(join(out, "funding-link-health-latest.json"), "utf8"));
    expect(latest.rows["program:p-down"].first_failed_at).toBe("2026-10-06T04:00:00.000Z");
    expect(existsSync(join(out, "funding-link-health.jsonl"))).toBe(true);

    // week 2 (+7 d): proposal + exit 1
    const r2 = await main(["--source", "seed", "--out-dir", out, "--host-delay", "0"], { ...base, now: () => new Date("2026-10-13T04:00:00Z") });
    expect(r2.exitCode).toBe(1);
    expect(r2.summary.proposals.mark_low.map((m) => m.id)).toEqual(["p-down"]);
    expect(r2.summary.proposed_sql[0]).toContain("update public.au_programs set status_confidence = 'low'");

    // --apply without a DB refuses
    const refused = await main(["--source", "seed", "--apply", "--out-dir", out], { ...base, now: () => new Date("2026-10-13T04:00:00Z") });
    expect(refused.exitCode).toBe(2);

    // --apply with a (fake) DB: only status_confidence on the proposed row + one queue line
    const updates = [];
    const fakeDb = {
      from(table) {
        return {
          select(cols) {
            if (cols.includes("link_status")) return { limit: async () => ({ data: null, error: { message: "column does not exist" } }) };
            const data = table === "au_grants" ? [{ id: "g-ok", official_url: "https://ok.example/", status_confidence: "high" }] : [{ id: "p-down", official_url: "https://down.example/", status_confidence: "high" }];
            return Promise.resolve({ data, error: null });
          },
          update(values) {
            return { eq: async (col, val) => (updates.push({ table, values, [col]: val }), { error: null }) };
          },
        };
      },
    };
    const queuePath = join(out, "queue.jsonl");
    const r3 = await main(["--apply", "--out-dir", out, "--host-delay", "0"], { ...base, db: fakeDb, queuePath, now: () => new Date("2026-10-20T04:00:00Z") });
    expect(r3.summary.source).toBe("db");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ table: "au_programs", id: "p-down", values: { status_confidence: "low" } });
    expect(Object.keys(updates[0].values).sort()).toEqual(["status_confidence", "updated_at"]);
    const q = readFileSync(queuePath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(q).toEqual([expect.objectContaining({ kind: "program", id: "p-down", reason: "unreachable" })]);
    expect(r3.summary.applied).toMatchObject({ status_confidence_low: 1, link_status: 0, queued: 1, errors: [] });
  });
});
