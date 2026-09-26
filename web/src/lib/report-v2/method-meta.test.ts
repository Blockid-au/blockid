// G32 SV2 — method metadata is additive: it validates on new documents, old
// documents without it still validate and read, and stamping never changes a
// score, the valuation or any other field.

import { describe, expect, it } from "vitest";
import { SCORING_PROFILE_SHA256, scoringProfileSha256 } from "@/lib/screening/profile";
import { SCREENING_CATALOG_VERSION, SCREENING_ITEMS } from "@/lib/screening/registry";
import { RUBRIC_ENTRIES, RUBRIC_VERSION } from "@/lib/screening/rubric";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { demoReportV2 } from "./fixtures";
import { SVI_METHOD, methodMetaFor, readMethodMeta, withMethodMeta } from "./method-meta";
import { assertReportV2, isReportV2 } from "./schema";

describe("G32 SV2 method metadata", () => {
  it("names the live method, rubric, profile hash, knowledge cutoff and an empty per-question ledger", () => {
    const report = demoReportV2();
    const meta = methodMetaFor(report);
    expect(SVI_METHOD).toBe(`svi-${SVI_VERSION}`);
    expect(meta).toEqual({
      svi_method: SVI_METHOD,
      rubric_version: "rubric@v1",
      profile_sha256: SCORING_PROFILE_SHA256,
      knowledge_cutoff: report.generatedAt,
      contribution_ledger: {},
    });
    expect(SCORING_PROFILE_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(methodMetaFor(report, "2.1.0").svi_method).toBe("svi-2.1.0");
    expect(methodMetaFor(report, "  ").svi_method).toBe(SVI_METHOD);
  });

  it("stamps without mutating, changes nothing else, and is idempotent (stable revision hash)", () => {
    const report = demoReportV2();
    const before = JSON.stringify(report);
    const stamped = withMethodMeta(report, "2.2.0");
    expect(JSON.stringify(report)).toBe(before);
    const { methodMeta, ...rest } = stamped;
    expect(rest).toEqual(report);
    expect(stamped.cover.svi.total).toBe(report.cover.svi.total);
    expect(methodMeta?.svi_method).toBe("svi-2.2.0");
    expect(withMethodMeta(stamped, "9.9.9")).toBe(stamped);
    expect(JSON.stringify(withMethodMeta(demoReportV2(), "2.2.0"))).toBe(JSON.stringify(stamped));
  });

  it("keeps old documents valid and readable, accepts stamped ones and rejects a malformed stamp", () => {
    const old = JSON.parse(JSON.stringify(demoReportV2()));
    expect(isReportV2(old)).toBe(true);
    expect(readMethodMeta(old)).toBeNull();
    const stamped = JSON.parse(JSON.stringify(withMethodMeta(demoReportV2())));
    expect(isReportV2(stamped)).toBe(true);
    expect(assertReportV2(stamped).methodMeta).toEqual(stamped.methodMeta);
    expect(readMethodMeta(stamped)?.rubric_version).toBe("rubric@v1");
    expect(isReportV2({ ...stamped, methodMeta: { ...stamped.methodMeta, profile_sha256: "not-a-hash" } })).toBe(false);
    expect(isReportV2({ ...stamped, methodMeta: { ...stamped.methodMeta, contribution_ledger: [] } })).toBe(false);
  });

  it("profile hash is content-bound: any catalogue or rubric change produces a new hash", () => {
    const base = { catalogVersion: SCREENING_CATALOG_VERSION, rubricVersion: RUBRIC_VERSION, items: SCREENING_ITEMS, rubric: RUBRIC_ENTRIES };
    expect(scoringProfileSha256(base)).toBe(SCORING_PROFILE_SHA256);
    // Key order does not matter; content does.
    expect(scoringProfileSha256({ rubric: RUBRIC_ENTRIES, items: SCREENING_ITEMS, rubricVersion: RUBRIC_VERSION, catalogVersion: SCREENING_CATALOG_VERSION })).toBe(SCORING_PROFILE_SHA256);
    const edited = RUBRIC_ENTRIES.map((entry, i) => (i === 0 ? { ...entry, anchors: [...entry.anchors].reverse() } : entry));
    expect(scoringProfileSha256({ ...base, rubric: edited })).not.toBe(SCORING_PROFILE_SHA256);
    expect(scoringProfileSha256({ ...base, items: SCREENING_ITEMS.slice(1) })).not.toBe(SCORING_PROFILE_SHA256);
  });
});
