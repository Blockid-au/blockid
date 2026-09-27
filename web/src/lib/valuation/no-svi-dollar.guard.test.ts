// V04a guard (founder decision D22, 2026-09-24; implemented 2026-09-27).
//
// The SVI is an uncapped index — not a score out of 100 and not a dollar
// valuation. A figure may only come from a CFO valuation method with
// qualified inputs; everywhere else the surface says "not estimable" and
// names what would unlock a method (`valuationNotEstimable()`).
//
// This guard greps `src/` (comments stripped, tests skipped) so the removed
// SVI→dollar helpers cannot creep back, and pins the few remaining engine
// callers that belong to D22-e (share price / vesting / dividends, gated on
// V04b — migrating them must keep already-issued figures reproducible).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { valuationNotEstimable, defaultUnlockInputs } from "./not-estimable";

const WEB = resolve(__dirname, "../../..");
const SRC = resolve(WEB, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Source with line + block comments removed (a comment may cite what it replaced). */
function code(p: string): string {
  return readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const FILES = walk(SRC).map((abs) => ({ rel: relative(WEB, abs), src: code(abs) }));

function offenders(re: RegExp, allow: readonly string[] = []): string[] {
  return FILES.filter((f) => re.test(f.src) && !allow.includes(f.rel)).map((f) => f.rel);
}

describe("V04a — no SVI→dollar helper comes back", () => {
  it("the quick estimate (estimateValuation / valuationMetricsFromSignals) is gone from every surface", () => {
    expect(offenders(/\bestimateValuation\s*\(/)).toEqual([]);
    expect(offenders(/\bvaluationMetricsFromSignals\b/)).toEqual([]);
  });

  it("the three-case SVI band and its method selector are gone", () => {
    expect(offenders(/three-case-valuation|computeThreeCaseValuation|valuation-method-selector|selectValuationMethod\s*\(/)).toEqual([]);
  });

  it("no stage/SVI dollar ladder remains outside the D22-e share-price writer", () => {
    // 50_000 + (svi − 30) × 22_500 … 5_000_000 + (svi − 85) × 142_857: the
    // hand-rolled SVI→A$ table that four dashboard widgets used to carry.
    // The rescore still writes it to svi_snapshots.estimated_valuation +
    // share_classes.price_per_share — that is D22-e (V04b), not served.
    expect(offenders(/142_857|142857/, ["src/app/api/svi/rescore/route.ts"])).toEqual([]);
    expect(offenders(/\bestimateValuationRange\s*\(/)).toEqual([]);
  });

  it("computeValuation (Berkus/Scorecard over SVI dimensions) is called only by the D22-e chain", () => {
    // share-price.ts → dividends / DRIP / listing; clevel-valuation.ts →
    // /api/valuation/clevel → valuation_snapshots → investor-pack per-holder
    // value. Both migrate together under V04b with an issued-figure ledger.
    // api/score/route.ts defines its own local `computeValuation` that wraps
    // the CFO `buildVcValuationReport` (founder-typed inputs, not the SVI).
    expect(offenders(/\bcomputeValuation\s*\(/, ["src/lib/valuation.ts", "src/lib/share-price.ts", "src/lib/clevel-valuation.ts", "src/app/api/score/route.ts"])).toEqual([]);
  });

  it("no page, component or PDF reads the deep-valuation dollar blend", () => {
    const surfaces = FILES.filter((f) => /^src\/(app|components|lib\/pdf|lib\/publish|lib\/startup-index)/.test(f.rel));
    const hits = surfaces
      .filter((f) => /blendedValuation\s*\.\s*(low|mid|high)Aud|\bperspectives\s*\.\s*map\b|\bestValuation(Low|High)Aud|\.estLiftAud\b/.test(f.src))
      .map((f) => f.rel);
    expect(hits).toEqual([]);
  });

  it("the stored /analyze valuation (valuation_mid_aud) is never derived from the SVI", () => {
    const payload = FILES.find((f) => f.rel === "src/lib/analyses/payload.ts")!.src;
    expect(payload).toMatch(/valuation_mid_aud:\s*null/);
    expect(payload).not.toMatch(/svi\.valuation\.mid/);
  });
});

describe("V04a — the main surfaces render not estimable", () => {
  const MUST_USE = [
    "src/lib/report-v2/adapter.ts",
    "src/lib/analyses/payload.ts",
    "src/lib/analyses/first-analysis/build.ts",
    "src/lib/pdf/svi-report-pdf.tsx",
    "src/lib/pdf/svi-summary-pdf.tsx",
    "src/lib/pdf/first-analysis-report-pdf.tsx",
    "src/lib/investor-pack-assembler.ts",
    "src/lib/report-pipeline/section-assembler.ts",
    "src/components/dashboard/score-widget-grid.tsx",
    "src/components/dashboard/value-impact-banner.tsx",
    "src/components/dashboard/startup-health-hero.tsx",
    "src/components/founder/health-score-widget.tsx",
    "src/lib/publish/profile.ts",
  ];
  it.each(MUST_USE)("%s uses the shared not-estimable state", (rel) => {
    const f = FILES.find((x) => x.rel === rel);
    expect(f, `${rel} exists`).toBeDefined();
    expect(f!.src).toMatch(/valuationNotEstimable|VALUATION_NOT_ESTIMABLE|defaultUnlockInputs|readValuationSection|notEstimableCompactValuation/);
  });

  it("the dead SVI-priced valuation cards were deleted", () => {
    expect(FILES.some((f) => f.rel === "src/components/dashboard/valuation-card.tsx")).toBe(false);
    expect(FILES.some((f) => f.rel === "src/components/svi/svi-valuation.tsx")).toBe(false);
  });
});

describe("valuationNotEstimable — one honest line, EN + VI", () => {
  it("EN names the unlock evidence and never a dollar figure", () => {
    const ne = valuationNotEstimable();
    expect(ne.status).toBe("not_estimable");
    expect(ne.label).toBe("Not estimable");
    expect(ne.line).toBe("Not estimable — add connected revenue (Stripe or Xero), financial statements with a stated period or the terms of your last priced round to unlock a valuation method.");
    expect(ne.why).toMatch(/uncapped index, not a dollar figure/);
    expect(ne.short).toBe("Not estimable — connect revenue or add financials to unlock");
    expect(JSON.stringify(ne)).not.toMatch(/A\$\s?\d|\/\s?100/);
  });

  it("VI mirrors EN", () => {
    const ne = valuationNotEstimable({ locale: "vi" });
    expect(ne.label).toBe("Chưa ước tính được");
    expect(ne.line).toMatch(/^Chưa ước tính được — bổ sung .* để mở một phương pháp định giá\.$/);
    expect(ne.unlock).toHaveLength(defaultUnlockInputs("en").length);
    expect(JSON.stringify(ne)).not.toMatch(/A\$\s?\d/);
  });

  it("a caller's own missing inputs replace the default list", () => {
    const ne = valuationNotEstimable({ unlock: ["12 months of MRR from Stripe"] });
    expect(ne.unlock).toEqual(["12 months of MRR from Stripe"]);
    expect(ne.line).toBe("Not estimable — add 12 months of MRR from Stripe to unlock a valuation method.");
  });
});
