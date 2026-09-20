// G21-P1-B — the dimension-evidence adapter (hub rows / report rows / ledger signals → items).

import { describe, expect, it, vi } from "vitest";
import type { EvidenceRow } from "@/lib/report-v2/schema";
import { atLeast, hubRowToDimensionEvidence, loadAllDimensionEvidence, loadDimensionEvidence, mergeDimensionEvidence, reportRowToDimensionEvidence, signalsToDimensionEvidence, sortStrongest, strongestDimensionEvidence, type DimensionEvidenceItem } from "./dimension-evidence";

const item = (over: Partial<DimensionEvidenceItem>): DimensionEvidenceItem => ({ id: "x", statement: "s", level: "L1", verified: false, ...over });

describe("hubRowToDimensionEvidence", () => {
  it("maps a founder upload (capped at L3), a reviewer-signed row (L6) and drops rejected rows", () => {
    const upload = hubRowToDimensionEvidence({ id: "r1", dimension: "cgh", evidence_type: "cap_table_spreadsheet", evidence_label: "Cap table", confidence_level: "third_party_verified", is_verified: false, created_at: "2026-09-01T00:00:00Z" });
    expect(upload).toMatchObject({ id: "r1", statement: "Cap table", level: "L3", verified: false, sourceName: "Founder upload", code: "cap_table_spreadsheet", observedAt: "2026-09-01T00:00:00Z" });
    const signed = hubRowToDimensionEvidence({ dimension: "lco", evidence_type: "abn_registration", evidence_label: "", confidence_level: "third_party_verified", is_verified: true, verified_at: "2026-09-02T00:00:00Z" });
    expect(signed).toMatchObject({ level: "L6", verified: true, sourceName: "BlockID reviewer", statement: "ABN / ACN / Business registration" });
    expect(signed?.id).toBe("hub:lco:abn_registration");
    expect(hubRowToDimensionEvidence({ dimension: "lco", evidence_type: "abn_registration", review_status: "rejected" })).toBeUndefined();
    expect(hubRowToDimensionEvidence({ dimension: "nope", evidence_type: "x" })).toBeUndefined();
  });

  it("keeps a URL value as sourceUri", () => {
    const row = hubRowToDimensionEvidence({ dimension: "ftv", evidence_type: "founder_linkedin", evidence_label: "LinkedIn", confidence_level: "public_url", evidence_value_or_url: "https://linkedin.com/in/x" });
    expect(row?.sourceUri).toBe("https://linkedin.com/in/x");
    expect(row?.sourceName).toBe("Public URL");
  });
});

describe("reportRowToDimensionEvidence / signalsToDimensionEvidence", () => {
  it("skips missing rows and maps the confidence rung", () => {
    const base: EvidenceRow = { evidence_id: "ev1", source: "upload", label: "Pitch deck", status: "evidenced", dims: ["iri"], confidence: "document_uploaded" };
    expect(reportRowToDimensionEvidence(base)).toMatchObject({ id: "ev1", level: "L3", statement: "Pitch deck" });
    expect(reportRowToDimensionEvidence({ ...base, status: "missing" })).toBeUndefined();
    expect(reportRowToDimensionEvidence({ ...base, confidence: undefined, source: "stripe" })?.level).toBe("L4");
    expect(reportRowToDimensionEvidence({ ...base, confidence: undefined, source: "self_declared" })?.level).toBe("L1");
  });

  it("turns positive ladder-sourced signals into items and ignores penalties / stage / audit", () => {
    const items = signalsToDimensionEvidence("tre", [
      { signal: "Growing revenue", points: 40, source: "transaction_data" },
      { signal: "Late filing", points: -5, source: "penalty" },
      { signal: "Stage", points: 3, source: "stage" },
      { signal: "Tech audit", points: 3, source: "audit" },
      { signal: "Zero", points: 0, source: "self_declared" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "signal:tre:0", level: "L5", statement: "Growing revenue", verified: false });
  });
});

describe("ordering + merge", () => {
  it("sortStrongest: L6 → L1, verified first at a rung, newest first", () => {
    const sorted = sortStrongest([item({ id: "a", level: "L3" }), item({ id: "b", level: "L6" }), item({ id: "c", level: "L3", verified: true }), item({ id: "d", level: "L3", observedAt: "2026-09-10" })]);
    expect(sorted.map((i) => i.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("mergeDimensionEvidence dedupes statements case-insensitively, keeping the strongest; strongestDimensionEvidence caps at 3", () => {
    const merged = mergeDimensionEvidence([item({ id: "hub", statement: "Cap table", level: "L6", verified: true })], [item({ id: "sig", statement: "cap table", level: "L3" }), item({ id: "o", statement: "Other", level: "L2" })]);
    expect(merged.map((i) => i.id)).toEqual(["hub", "o"]);
    expect(strongestDimensionEvidence([item({ id: "1" }), item({ id: "2" }), item({ id: "3" }), item({ id: "4" })])).toHaveLength(3);
    expect(atLeast([item({ level: "L1" }), item({ id: "y", level: "L4" })], "document_uploaded").map((i) => i.id)).toEqual(["y"]);
  });
});

describe("loaders (fail-soft)", () => {
  function fakeDb(rows: unknown[] | null, error: unknown = null) {
    const calls: Array<{ table: string; select: string; eq: Array<[string, string]> }> = [];
    const db = {
      from(table: string) {
        const call = { table, select: "", eq: [] as Array<[string, string]> };
        calls.push(call);
        const q = {
          select(cols: string) {
            call.select = cols;
            return q;
          },
          eq(k: string, v: string) {
            call.eq.push([k, v]);
            return q;
          },
          then(resolve: (v: { data: unknown; error: unknown }) => void) {
            resolve({ data: rows, error });
          },
        };
        return q;
      },
    };
    return { db: db as never, calls };
  }

  it("loadDimensionEvidence reads svi_dimension_evidence for one project + dimension and sorts strongest first", async () => {
    const { db, calls } = fakeDb([
      { id: "1", dimension: "tre", evidence_type: "customer_list", evidence_label: "Customers", confidence_level: "document_uploaded" },
      { id: "2", dimension: "tre", evidence_type: "revenue_proof", evidence_label: "Bank statement", confidence_level: "transaction_data", is_verified: true, verified_at: "2026-09-01" },
    ]);
    const items = await loadDimensionEvidence(db, "p1", "TRE");
    expect(calls[0]).toMatchObject({ table: "svi_dimension_evidence", eq: [["project_id", "p1"], ["dimension", "tre"]] });
    expect(calls[0].select).toContain("review_status");
    expect(items.map((i) => i.id)).toEqual(["2", "1"]);
    // The cap only ever lowers: a reviewer-signed transaction_data row stays L5, verified.
    expect(items[0]).toMatchObject({ level: "L5", verified: true });
  });

  it("returns [] / {} on a missing client, an unknown dimension, an error or a throw", async () => {
    expect(await loadDimensionEvidence(null, "p1", "tre")).toEqual([]);
    expect(await loadDimensionEvidence(fakeDb([]).db, "p1", "nope")).toEqual([]);
    expect(await loadDimensionEvidence(fakeDb(null, { code: "42P01" }).db, "p1", "tre")).toEqual([]);
    const throwing = { from: vi.fn(() => { throw new Error("boom"); }) } as never;
    expect(await loadDimensionEvidence(throwing, "p1", "tre")).toEqual([]);
    expect(await loadAllDimensionEvidence(throwing, "p1")).toEqual({});
    expect(await loadAllDimensionEvidence(fakeDb([]).db, null)).toEqual({});
  });

  it("loadAllDimensionEvidence groups by dimension", async () => {
    const { db } = fakeDb([
      { id: "1", dimension: "tre", evidence_type: "customer_list", confidence_level: "document_uploaded" },
      { id: "2", dimension: "LCO", evidence_type: "abn_registration", confidence_level: "connected_source" },
      { id: "3", dimension: "lco", evidence_type: "ip_assignment", confidence_level: "self_declared", review_status: "rejected" },
    ]);
    const all = await loadAllDimensionEvidence(db, "p1");
    expect(Object.keys(all).sort()).toEqual(["lco", "tre"]);
    expect(all.lco).toHaveLength(1);
  });
});
