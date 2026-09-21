// Colocated test for /methodology/calibration (G14-S39) and its /vi mirror.
//
// Pins: the empty state when no backtest JSON is published; the populated
// render (N, ρ + CI per target and per stage, bucket table, range-bar SVG,
// caveats verbatim, SVI_VERSION + git sha, link back to /methodology); the
// copy rules (live N, never "500+", never "PhD"); metadata; and that every
// `calibration.*` key exists in both catalogues (parity).
//
// The marketing shell mounts NavV2 → useRouter(), which throws outside an
// app-router context, so it is mocked to a pass-through (same pattern as
// `../../solutions/accelerator/page.test.tsx`).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { runBacktest } from "@/lib/backtest/run-backtest";
import type { BacktestRow } from "@/lib/data/au-comparables-backtest";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { computeCalibration } from "@/lib/calibration/compute";
import { CALIBRATION_PATH, CALIBRATION_VI_PATH, CalibrationBody, bucketRangeBarsSvg } from "./calibration-body";
import { generateMetadata } from "./page";
import { generateMetadata as generateViMetadata } from "../../../vi/methodology/calibration/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

function row(id: string, stage: BacktestRow["stage"], strength: number, roundAud: number | null, valuationAud: number | null = null): BacktestRow {
  const profile: BacktestRow["preRaiseProfile"] = { hasABN: true, hasWebsite: true };
  if (strength >= 1) Object.assign(profile, { hasProduct: true, problemClarity: "clear" as const });
  if (strength >= 2) Object.assign(profile, { hasCoFounder: true, hasCustomers: true });
  if (strength >= 3) Object.assign(profile, { hasRevenue: true, revenueBand: "growing" as const, hasCapTable: true, hasDataRoom: true });
  if (strength >= 4) Object.assign(profile, { revenueBand: "scaling" as const, hasBoardCadence: true, hasFinancialAudit: true });
  return {
    id, company: id, sourceNames: [id], sourceTables: ["au-comparable-raises.ts"], sector: "saas", stage, asOf: "2024-03",
    preRaiseProfile: profile, sourceUrls: ["https://example.com", "https://example.org"], sourceNote: "synthetic row for the page test",
    outcome: { roundAud, valuationAud, nextRoundWithin24m: null }, confidence: "high",
  };
}

const FIXTURE = [
  row("Alpha Co", "seed", 0, 400_000), row("Bravo Co", "seed", 1, 900_000, 4_000_000), row("Charlie Co", "seed", 2, 1_500_000),
  row("Delta Co", "seed", 2, 3_000_000), row("Echo Co", "seed", 3, 6_000_000, 20_000_000),
  row("Foxtrot Co", "series-a", 2, 8_000_000), row("Golf Co", "series-a", 3, 12_000_000, 40_000_000), row("Hotel Co", "series-a", 3, 20_000_000),
  row("India Co", "series-a", 4, 45_000_000, 200_000_000), row("Juliet Co", "series-a", 4, 60_000_000),
  row("Kilo Co", "pre-seed", 0, 150_000),
];
const REPORT = runBacktest({ rows: FIXTURE, now: new Date("2026-09-16T03:40:00Z"), gitSha: "deadbee", resamples: 200, seed: 3, excludedCount: 2 });

describe("/methodology/calibration — empty state", () => {
  it("renders the 'not yet published' state and the link back to /methodology, without any number", async () => {
    const out = await html(<CalibrationBody locale="en" report={null} />);
    expect(out).toContain('data-testid="calibration-empty"');
    expect(out).toContain(EN["calibration.empty.title"]);
    expect(out).toContain('href="/methodology"');
    expect(out).not.toContain('data-testid="calibration-stats"');
    expect(out).not.toContain("ρ ");
  });
});

describe("/methodology/calibration — populated", () => {
  it("shows the live N, ρ + CI per target, per-stage rows, buckets, the range-bar SVG, caveats verbatim and the engine provenance", async () => {
    const out = await html(<CalibrationBody locale="en" report={REPORT} />);
    // N + counts
    expect(out).toContain(`data-testid="calibration-n">${REPORT.n}<`);
    expect(out).toContain(`${REPORT.n_with_round} ${EN["calibration.stats.nRound"]}`);
    expect(out).toContain("2 source rows excluded");
    // ρ + CI (pooled) for both targets
    expect(out).toContain(`ρ ${(REPORT.rho.round_pooled as number).toFixed(2)}`);
    expect(out).toContain(`[${REPORT.ci.round_pooled!.low.toFixed(2)}, ${REPORT.ci.round_pooled!.high.toFixed(2)}]`);
    expect(out).toContain('data-testid="calibration-rho-table-round"');
    expect(out).toContain('data-testid="calibration-rho-table-valuation"');
    // per-stage: seed + series-a have ρ, pre-seed is "too few rows"
    expect(out).toContain(EN["calibration.rho.tooFew"]);
    expect(out).toContain("Series A");
    // bucket table + SVG
    expect(out).toContain('data-testid="calibration-bucket-table"');
    // < 10 rows per quartile in this fixture → the figure slot carries the
    // "not enough comparable companies" line instead of the SVG (G21 P1-C).
    expect(out).toContain('data-testid="calibration-range-bars"');
    expect(out).not.toContain('data-visual-id="svi-backtest-buckets"');
    expect(out).toContain("a benchmark appears from n = 10");
    expect(out).toContain("Q4 (highest SVI)");
    // G21 P1-C: every bucket / stage carries its publication label with n; a
    // bucket below the floor publishes no median (the fixture has < 10 per quartile).
    expect(out).toContain('data-publication-band="none"');
    expect(out).toContain("not enough comparable companies (n = ");
    expect(out).toContain(`(n = ${REPORT.n_by_stage.seed})`);
    for (const b of REPORT.buckets) expect(b.median_round_aud).toBeNull();
    // caveats verbatim, in order
    let cursor = 0;
    for (const c of REPORT.caveats) {
      const escaped = c.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
      const at = out.indexOf(escaped, cursor);
      expect(at, `caveat missing or out of order: ${c.slice(0, 40)}`).toBeGreaterThan(-1);
      cursor = at;
    }
    // provenance
    expect(out).toContain(`SVI ${SVI_VERSION} · deadbee`);
    expect(out).toContain("commit deadbee");
    expect(out).toContain("document_uploaded");
    // rows used, with the disclosed / not-disclosed figures
    expect(out).toContain('data-testid="calibration-rows"');
    expect(out).toContain("Juliet Co");
    expect(out).toContain("A$60,000,000");
    expect(out).toContain(EN["calibration.notDisclosed"]);
    // back link + CTA
    expect(out).toContain('data-testid="calibration-back"');
    expect(out).toContain('href="/analyze"');
  });

  it("never says PhD or 500+ and states N rather than a round number", async () => {
    const out = await html(<CalibrationBody locale="en" report={REPORT} />);
    expect(out).not.toMatch(/PhD/);
    expect(out).not.toMatch(/500\+/);
    expect(out).toContain(String(REPORT.n));
  });

  it("renders the Vietnamese twin from the vi catalogue with the same numbers", async () => {
    const out = await html(<CalibrationBody locale="vi" report={REPORT} />);
    expect(out).toContain(VI["calibration.title"]);
    expect(out).toContain(VI["calibration.rho.tooFew"]);
    expect(out).toContain(`data-testid="calibration-n">${REPORT.n}<`);
    expect(out).toContain(`ρ ${(REPORT.rho.round_pooled as number).toFixed(2)}`);
    expect(out).not.toContain(EN["calibration.title"]);
  });

  it("the range-bar SVG is deterministic, labelled and draws one bar per PUBLISHED quartile (none below the floor)", () => {
    const svg = bucketRangeBarsSvg(REPORT, EN);
    expect(svg).toBe(bucketRangeBarsSvg(REPORT, EN));
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('role="img"');
    expect(svg).toContain(EN["calibration.buckets.chartTitle"]);
    // The 11-row fixture has < 10 rows per quartile → no medians → no bars (G21 P1-C).
    expect((svg.match(/<rect /g) ?? []).length).toBe(0);
    // Force-publish the same buckets → four bars.
    const published = { ...REPORT, buckets: REPORT.buckets.map((bk) => ({ ...bk, median_round_aud: 1_000_000 * bk.quartile, p25_round_aud: 800_000 * bk.quartile, p75_round_aud: 1_200_000 * bk.quartile })) };
    expect((bucketRangeBarsSvg(published, EN).match(/<rect /g) ?? []).length).toBe(4);
  });
});

describe("/methodology/calibration — metadata", () => {
  it("EN + VI carry canonical + hreflang pair, indexable, brand-free titles", async () => {
    const enMeta = await generateMetadata();
    expect(enMeta.title).toBe(EN["calibration.meta.title"]);
    expect(enMeta.alternates?.canonical).toBe(`https://blockid.au${CALIBRATION_PATH}`);
    expect((enMeta.alternates?.languages as Record<string, string>).vi).toBe(`https://blockid.au${CALIBRATION_VI_PATH}`);
    expect(enMeta.robots).toEqual({ index: true, follow: true });
    const viMeta = await generateViMetadata();
    expect(viMeta.title).toBe(VI["calibration.meta.title"]);
    expect(viMeta.alternates?.canonical).toBe(`https://blockid.au${CALIBRATION_VI_PATH}`);
    expect((viMeta.alternates?.languages as Record<string, string>).en).toBe(`https://blockid.au${CALIBRATION_PATH}`);
    expect(String(enMeta.title)).not.toMatch(/PhD|500\+/);
  });
});

describe("calibration.* catalogue parity (en ⇄ vi)", () => {
  it("every calibration.* key exists in both catalogues with non-empty, distinct copy", () => {
    const enKeys = Object.keys(EN).filter((k) => k.startsWith("calibration."));
    const viKeys = Object.keys(VI).filter((k) => k.startsWith("calibration."));
    expect(enKeys.length).toBeGreaterThan(30);
    expect(enKeys.filter((k) => !(k in VI))).toEqual([]);
    expect(viKeys.filter((k) => !(k in EN))).toEqual([]);
    for (const k of enKeys) {
      expect(EN[k].trim().length, k).toBeGreaterThan(0);
      expect(VI[k].trim().length, k).toBeGreaterThan(0);
    }
    // Tokens used by the page exist in both languages.
    for (const [k, tokens] of [
      ["calibration.stats.excluded", ["{n}"]],
      ["calibration.rho.intro", ["{resamples}", "{minN}"]],
      ["calibration.provenance", ["{version}", "{sha}"]],
    ] as const) {
      for (const tok of tokens) {
        expect(EN[k]).toContain(tok);
        expect(VI[k]).toContain(tok);
      }
    }
    // VI copy is real Vietnamese (diacritics), not an ASCII stub.
    expect(VI["calibration.title"]).toMatch(/[ăâêôơưđà-ỹ]/i);
  });
});

// ── G21 P3-A — score → outcome calibration section ─────────────────────────

describe("/methodology/calibration — score → outcome section (G21 P3-A)", () => {
  const NOW = new Date("2026-09-20T04:10:00Z");
  const META = { sviVersion: SVI_VERSION, gitSha: "cafe123" };
  const snaps = (prefix: string, n: number, svi: number, conf: number | null) => Array.from({ length: n }, (_, i) => ({ project_id: `${prefix}-${i}`, snapshot_date: "2026-01-10", svi_total: svi, evidence_confidence: conf, stage: 2 }));
  const outs = (prefix: string, ids: number[]) => ids.map((i) => ({ project_id: `${prefix}-${i}`, kind: "funding_raised", observed_at: "2026-06-01", status: "confirmed" }));

  it("no JSON → the honest empty state (no number, no stats, a link to record an outcome); renders on the VI mirror too", async () => {
    const out = await html(<CalibrationBody locale="en" report={null} outcomes={null} />);
    expect(out).toContain('data-testid="outcome-calibration-empty"');
    expect(out).toContain(EN["calibration.outcomes.empty.title"]);
    expect(out).not.toContain('data-testid="outcome-calibration-progress"');
    expect(out).not.toContain('data-testid="outcome-calibration-table"');
    expect(out).toContain('href="/workspace/evidence/outcomes"');
    expect(out).not.toMatch(/predict|prediction accuracy/i);
    const vi = await html(<CalibrationBody locale="vi" report={null} outcomes={null} />);
    expect(vi).toContain(VI["calibration.outcomes.empty.title"]);
  });

  it("JSON with every cohort under the floor → empty state WITH the counts so far + limitations + provenance", async () => {
    const small = computeCalibration({ snapshots: snaps("s", 6, 60, 50), outcomes: outs("s", [0]), now: NOW }, META);
    const out = await html(<CalibrationBody locale="en" report={null} outcomes={small} />);
    expect(out).toContain('data-testid="outcome-calibration-empty"');
    expect(out).toContain('data-testid="outcome-calibration-progress"');
    expect(out).toMatch(/6 companies with a snapshot(<!-- -->)? · (<!-- -->)?6 past the 90-day horizon(<!-- -->)? · (<!-- -->)?1 confirmed outcomes/);
    expect(out).toContain('data-testid="outcome-calibration-limitations"');
    expect(out).toContain("commit cafe123");
    expect(out).not.toContain('data-testid="outcome-calibration-table"');
  });

  it("a published cohort → stats, the cohort row with n, rate + interval, per-band labels carrying n and the publication band, limitations verbatim", async () => {
    const report = computeCalibration({ snapshots: [...snaps("a", 30, 75, 80), ...snaps("b", 12, 50, 50), ...snaps("c", 3, 20, null)], outcomes: [...outs("a", Array.from({ length: 12 }, (_, i) => i)), ...outs("b", [0, 1, 2])], now: NOW }, META);
    const out = await html(<CalibrationBody locale="en" report={null} outcomes={report} />);
    expect(out).not.toContain('data-testid="outcome-calibration-empty"');
    expect(out).toContain('data-testid="outcome-calibration-eligible">45<');
    expect(out).toContain('data-testid="outcome-calibration-published">1<');
    expect(out).toContain('data-calibration-cohort="2026-Q1|2"');
    expect(out).toMatch(/Stage 2(<!-- -->)? · (<!-- -->)?2026-Q1/);
    expect(out).toContain("33%"); // 15 / 45
    expect(out).toContain('data-calibration-band="svi-strong"');
    expect(out).toContain("40% (n = 30)");
    expect(out).toContain("25% indicative (n = 12)");
    expect(out).toContain("not enough companies (n = 3)");
    expect(out).toContain('data-publication-band="none"');
    expect(out).toContain('data-publication-band="indicative"');
    expect(out).toContain('data-publication-band="benchmark"');
    let cursor = 0;
    for (const l of report.limitations) {
      const escaped = l.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
      const at = out.indexOf(escaped, cursor);
      expect(at, `limitation missing or out of order: ${l.slice(0, 40)}`).toBeGreaterThan(-1);
      cursor = at;
    }
    expect(out).not.toMatch(/\bpredicts?\b|prediction|accuracy/i);
  });
});
