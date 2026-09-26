// G15-R2 — latency-sample core (scripts/lib/latency-core.mjs) + the tail
// reader of scripts/latency-sample.mjs, pinned with real nginx access-log
// lines in both the combined and the blockid_timing formats. Guards against:
//   - static assets (/_next/static, images) counted as marketing traffic and
//     flattering the p95;
//   - the AI route list drifting (a /api/svi call counted as api_other and
//     tripping the 2 s target);
//   - the timing pair being mis-parsed as part of the user agent;
//   - the 3-consecutive-windows rule alerting on the first breach, or never
//     re-alerting / never sending "recovered".

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  breaches,
  CLASS_NAMES,
  classifyPath,
  emptyState,
  evaluate,
  formatAlert,
  isLongLived,
  parseLine,
  parseTimeLocal,
  percentile,
  sampleWindow,
  SLO,
} from "./lib/latency-core.mjs";
import { parseArgs, readTail } from "./latency-sample.mjs";

const NOW = Date.parse("2026-09-18T05:24:30.000Z");
const at = (secAgo) => {
  const d = new Date(NOW - secAgo * 1000);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${mon}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
};
const combined = (secAgo, method, path, status) =>
  `172.68.2.96 - - [${at(secAgo)}] "${method} ${path} HTTP/1.1" ${status} 24647 "http://blockid.au/funding" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \\"quoted\\" Chrome/84"`;
const timed = (secAgo, method, path, status, rt, urt = rt) => `${combined(secAgo, method, path, status)} ${rt.toFixed(3)} ${urt === "-" ? "-" : urt.toFixed(3)}`;

describe("parseTimeLocal / parseLine", () => {
  it("parses $time_local with a zone offset", () => {
    expect(parseTimeLocal("18/Sep/2026:05:23:55 +0000")).toBe(Date.parse("2026-09-18T05:23:55Z"));
    expect(parseTimeLocal("18/Sep/2026:15:23:55 +1000")).toBe(Date.parse("2026-09-18T05:23:55Z"));
    expect(parseTimeLocal("garbage")).toBeNaN();
  });
  it("parses the combined format (no timing → ms null)", () => {
    const r = parseLine('104.22.64.193 - - [18/Sep/2026:05:24:01 +0000] "GET / HTTP/1.1" 200 35808 "-" "curl/8.14.1"');
    expect(r).toMatchObject({ method: "GET", path: "/", status: 200, class: "marketing", ms: null });
  });
  it("parses the blockid_timing format ($request_time $upstream_response_time)", () => {
    const r = parseLine(timed(5, "POST", "/api/svi/analyse", 200, 12.345));
    expect(r).toMatchObject({ path: "/api/svi/analyse", status: 200, class: "api_ai", ms: 12345 });
    expect(parseLine(timed(5, "GET", "/pricing", 200, 0.081, "-"))?.ms).toBe(81);
  });
  it("returns null for junk", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("not a log line")).toBeNull();
  });
});

describe("classifyPath", () => {
  it("maps the five classes and drops static assets", () => {
    expect(classifyPath("/")).toBe("marketing");
    expect(classifyPath("/funding?program=x")).toBe("marketing");
    expect(classifyPath("/api/svi")).toBe("api_ai");
    expect(classifyPath("/api/svi/stream?x=1")).toBe("api_ai");
    expect(classifyPath("/api/funding/report")).toBe("api_ai");
    expect(classifyPath("/api/analyses/abc")).toBe("api_ai");
    expect(classifyPath("/api/cfo-advisor")).toBe("api_ai");
    expect(classifyPath("/api/status")).toBe("api_other");
    expect(classifyPath("/api/svi-index")).toBe("api_other");
    expect(classifyPath("/api/entitlement/me")).toBe("api_other");
    expect(classifyPath("/api/revenue")).toBe("api_other");
  });
  it("G33 T15: cron jobs get api_cron (even ai-* cron paths); LLM routes join api_ai", () => {
    expect(classifyPath("/api/cron/ai-health")).toBe("api_cron");
    expect(classifyPath("/api/cron/discover-models")).toBe("api_cron");
    expect(classifyPath("/api/i18n/translate")).toBe("api_ai");
    expect(classifyPath("/api/ai/equity-split")).toBe("api_ai");
    expect(classifyPath("/api/evaluation/ftv/ai-score")).toBe("api_ai");
    expect(classifyPath("/api/founder/gtm/ai-fill")).toBe("api_ai");
    expect(classifyPath("/api/investor-portal/ai-generate")).toBe("api_ai");
    expect(classifyPath("/api/funding/draft")).toBe("api_ai");
    expect(classifyPath("/api/rnd/sections")).toBe("api_ai");
    expect(classifyPath("/api/aid-programs")).toBe("api_other"); // no false /api/ai prefix match
    expect(CLASS_NAMES).toContain("api_cron");
  });
  it("G33 T15: isLongLived matches stream / SSE paths only", () => {
    expect(isLongLived("/api/site-crawl/stream?x=1")).toBe(true);
    expect(isLongLived("/api/svi/dimensions/stream")).toBe(true);
    expect(isLongLived("/api/analysis/run_1/stream")).toBe(true);
    expect(isLongLived("/api/rnd")).toBe(true);
    expect(isLongLived("/api/rnd/sections")).toBe(true);
    expect(isLongLived("/api/streams-overview")).toBe(false);
    expect(isLongLived("/api/entitlement/me")).toBe(false);
    expect(classifyPath("/tbr/abc")).toBe("tbr");
    expect(classifyPath("/s/xyz")).toBe("tbr");
    expect(classifyPath("/workspace/projects")).toBe("workspace");
    expect(classifyPath("/dashboard")).toBe("workspace");
    expect(classifyPath("/_next/static/chunks/a.js")).toBeNull();
    expect(classifyPath("/og-image.png")).toBeNull();
    expect(classifyPath("/robots.txt")).toBeNull();
  });
});

describe("percentile", () => {
  it("nearest-rank", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([10, 1, 3], 50)).toBe(3);
  });
});

describe("sampleWindow", () => {
  it("keeps only the last window, buckets by class, computes p50/p95/5xx", () => {
    const lines = [
      timed(900, "GET", "/", 200, 0.1), // outside 10-min window
      ...Array.from({ length: 20 }, (_, i) => timed(60 + i, "GET", "/pricing", 200, 0.1 + i * 0.01)),
      timed(30, "GET", "/pricing", 502, 0.05),
      timed(20, "GET", "/_next/static/x.js", 200, 0.001),
      timed(10, "POST", "/api/svi", 200, 40),
      timed(5, "GET", "/api/status", 200, 0.3),
      "garbage line",
    ];
    const s = sampleWindow(lines, NOW, 10);
    expect(s.timing).toBe(true);
    expect(s.requests).toBe(23);
    expect(s.classes.marketing.n).toBe(21);
    expect(s.classes.marketing.err_rate_5xx).toBeCloseTo(1 / 21, 4);
    expect(s.classes.marketing.p95_ms).toBe(280); // nearest-rank: 20th of 21 sorted (50,100,110,…,290)
    expect(s.classes.api_ai).toEqual({ n: 1, n_timed: 1, p50_ms: 40000, p95_ms: 40000, err_rate_5xx: 0 });
    expect(s.classes.api_other.p50_ms).toBe(300);
    expect(s.classes.tbr).toEqual({ n: 0, n_timed: 0, p50_ms: null, p95_ms: null, err_rate_5xx: null });
  });
  it("combined format → n + 5xx only, p50/p95 null, timing false", () => {
    const s = sampleWindow([combined(10, "GET", "/", 200), combined(9, "GET", "/", 500)], NOW);
    expect(s.timing).toBe(false);
    expect(s.classes.marketing).toEqual({ n: 2, n_timed: 0, p50_ms: null, p95_ms: null, err_rate_5xx: 0.5 });
  });
  it("G33 T15: untimed lines (other vhosts' health probes) count for n, never for n_timed / p95", () => {
    const lines = [
      ...Array.from({ length: 25 }, (_, i) => combined(100 + i, "GET", "/api/health?g30_probe=1", 200)),
      timed(40, "GET", "/api/credits", 200, 0.12),
      timed(30, "GET", "/api/projects", 200, 0.2),
    ];
    const s = sampleWindow(lines, NOW);
    expect(s.classes.api_other).toMatchObject({ n: 27, n_timed: 2, p95_ms: 200 });
  });
  it("G33 T15: /api/cron/* lands in api_cron, so a 15 s AI probe no longer owns api_other's p95", () => {
    const lines = [
      timed(50, "GET", "/api/cron/ai-health", 200, 14.808),
      ...Array.from({ length: 6 }, (_, i) => timed(20 + i, "GET", "/api/entitlement/me", 200, 0.1 + i * 0.01)),
    ];
    const s = sampleWindow(lines, NOW);
    expect(s.classes.api_cron).toMatchObject({ n: 1, n_timed: 1, p95_ms: 14808 });
    expect(s.classes.api_other).toMatchObject({ n: 6, n_timed: 6, p95_ms: 150 });
  });
  it("G33 T15: SSE / stream durations are counted (n, 5xx) but excluded from the percentiles", () => {
    const lines = [
      timed(50, "GET", "/api/site-crawl/stream?id=1", 200, 95.5),
      timed(40, "GET", "/api/analysis/run_x/stream", 502, 12),
      timed(30, "GET", "/api/status", 200, 0.3),
    ];
    const s = sampleWindow(lines, NOW);
    expect(s.classes.api_other).toMatchObject({ n: 3, n_timed: 1, p95_ms: 300 });
    expect(s.classes.api_other.err_rate_5xx).toBeCloseTo(1 / 3, 4);
  });
});

describe("breaches + evaluate (3 consecutive windows)", () => {
  const sample = (p95, e5 = 0, n = 50) => ({
    ts: "2026-09-18T05:24:30.000Z",
    window_min: 10,
    timing: true,
    requests: n,
    classes: {
      marketing: { n, p50_ms: 100, p95_ms: p95, err_rate_5xx: e5 },
      api_ai: { n: 0, p50_ms: null, p95_ms: null, err_rate_5xx: null },
      api_other: { n: 0, p50_ms: null, p95_ms: null, err_rate_5xx: null },
      tbr: { n: 0, p50_ms: null, p95_ms: null, err_rate_5xx: null },
      workspace: { n: 0, p50_ms: null, p95_ms: null, err_rate_5xx: null },
    },
  });
  it("targets match docs/ops/slo.md", () => {
    expect(SLO).toMatchObject({ marketing: { p95_ms: 800 }, workspace: { p95_ms: 1500 }, api_ai: { p95_ms: 60_000 }, api_other: { p95_ms: 2000 }, api_cron: { p95_ms: 60_000 }, err_rate_5xx: 0.005 });
  });
  it("G33 T15: a p95 breach needs ≥ 20 TIMED samples; the 5xx breach still uses n", () => {
    const s = sample(5000, 0.5, 50);
    s.classes.marketing.n_timed = 3;
    expect(breaches(s).map((b) => b.key)).toEqual(["marketing.5xx"]);
    s.classes.marketing.n_timed = 20;
    expect(breaches(s).map((b) => b.key)).toEqual(["marketing.p95", "marketing.5xx"]);
  });
  it("needs ≥ 20 samples to breach", () => {
    expect(breaches(sample(5000, 0.5, 10))).toEqual([]);
    expect(breaches(sample(5000, 0.5, 20)).map((b) => b.key)).toEqual(["marketing.p95", "marketing.5xx"]);
    expect(breaches(sample(800))).toEqual([]); // equal to target is fine
  });
  it("alerts on the 3rd consecutive window, re-alerts every 6, and reports recovery", () => {
    let st = emptyState();
    const kinds = [];
    for (let i = 0; i < 10; i++) {
      const r = evaluate(st, sample(1200));
      st = r.state;
      kinds.push(r.alerts.map((a) => `${a.kind}:${a.windows}`).join(",") || "-");
    }
    expect(kinds).toEqual(["-", "-", "breach:3", "-", "-", "-", "-", "-", "breach:9", "-"]);
    const rec = evaluate(st, sample(200));
    expect(rec.alerts).toEqual([{ kind: "recovered", key: "marketing.p95", class: "marketing", metric: "p95_ms", windows: 10 }]);
    expect(rec.state.streaks).toEqual({});
  });
  it("a short streak that ends does not send recovered", () => {
    let st = evaluate(emptyState(), sample(1200)).state;
    st = evaluate(st, sample(1200)).state;
    expect(evaluate(st, sample(100)).alerts).toEqual([]);
  });
  it("formatAlert is human-readable and unit-correct", () => {
    const r = evaluate({ version: 1, streaks: { "marketing.5xx": { count: 2 } } }, sample(100, 0.02));
    const text = formatAlert(r.alerts, sample(100, 0.02));
    expect(text).toContain("marketing err_rate_5xx 2.00 % > target 0.50 % for 3 consecutive 10-min windows");
  });
});

describe("CLI helpers", () => {
  it("parseArgs", () => {
    expect(parseArgs(["--dry-run", "--json", "--log", "/x", "--window", "5"])).toEqual({ dryRun: true, json: true, log: "/x", windowMin: 5 });
  });
  it("readTail returns whole lines from the end and classifies missing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "ls-"));
    const f = join(dir, "access.log");
    writeFileSync(f, "line1\nline2\nline3\n");
    expect(readTail(f, 10).lines).toEqual(["line3"]); // "ine2\nline3\n" → fragment dropped
    expect(readTail(f).lines).toEqual(["line1", "line2", "line3"]);
    expect(readTail(join(dir, "nope"))).toEqual({ lines: null, reason: "missing" });
  });
});
