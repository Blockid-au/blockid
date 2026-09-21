// citations — G24-A: `[ev:<id>]` / `[unevidenced]` markers → footnote segments.
import { describe, expect, it } from "vitest";
import { groundingAudit } from "./grounding";
import { demoReportV2 } from "./fixtures";
import type { EvidenceRow } from "./schema";
import { buildCitationIndex, citationAnchorId, citationEntries, citationsToPlainText, citedTextFields, createCitationIndex, hasCitationMarkers, parseCitations, stripCitationMarkers } from "./citations";

const REGISTER: EvidenceRow[] = [
  { evidence_id: "ev-stripe", source: "stripe", label: "Stripe revenue", status: "evidenced", observedAt: "2026-09-10T00:00:00.000Z", dims: ["tre"], confidence: "transaction_data" },
  { evidence_id: "9F2C1A3B-0000-4000-8000-000000000001", source: "upload", label: "Data room", status: "partial", observedAt: "2026-09-12T10:00:00.000Z", dims: ["iri"] },
  { evidence_id: "ev-ga4", source: "ga4", label: "GA4 acquisition", status: "evidenced", dims: ["mpc"], confidence: "connected_source" },
];

describe("parseCitations", () => {
  it("numbers citations in first-appearance order, one number per register row, hugging the word before them", () => {
    const segs = parseCitations("MRR is A$100k [ev:ev-stripe]. Sessions grew 12 % [ev:ev-ga4] on the same base [ev:ev-stripe].", REGISTER);
    expect(segs).toEqual([
      { kind: "text", text: "MRR is A$100k" },
      { kind: "cite", n: 1, id: "ev-stripe", label: "Stripe revenue", level: "transaction_data" },
      { kind: "text", text: ". Sessions grew 12 %" },
      { kind: "cite", n: 2, id: "ev-ga4", label: "GA4 acquisition", level: "connected_source" },
      { kind: "text", text: " on the same base" },
      { kind: "cite", n: 1, id: "ev-stripe", label: "Stripe revenue", level: "transaction_data" },
      { kind: "text", text: "." },
    ]);
  });

  it("an unknown id renders nothing (never the raw marker); ids match case-insensitively with surrounding whitespace", () => {
    const segs = parseCitations("Churn is 2 % [ev:not-in-register] and steady [ev: 9f2c1a3b-0000-4000-8000-000000000001 ].", REGISTER);
    expect(segs).toEqual([
      { kind: "text", text: "Churn is 2 % and steady" },
      { kind: "cite", n: 1, id: "9F2C1A3B-0000-4000-8000-000000000001", label: "Data room", level: null },
      { kind: "text", text: "." },
    ]);
    expect(JSON.stringify(segs)).not.toContain("[ev:");
    // Adjacent duplicates collapse to one footnote (no "1, 1").
    expect(parseCitations("Grew 12 % [ev:ev-ga4] [ev:ev-ga4].", REGISTER).filter((s) => s.kind === "cite")).toHaveLength(1);
  });

  it("[unevidenced] (and [uncited]) become a chip segment with one space before it", () => {
    expect(parseCitations("Founder claims 40 % margin [unevidenced].", REGISTER)).toEqual([{ kind: "text", text: "Founder claims 40 % margin " }, { kind: "unevidenced" }, { kind: "text", text: "." }]);
    expect(parseCitations("[UNCITED] Ten customers.", REGISTER)).toEqual([{ kind: "unevidenced" }, { kind: "text", text: " Ten customers." }]);
  });

  it("no register → every marker is stripped and nothing is numbered", () => {
    const segs = parseCitations("A$1.2M ARR [ev:ev-stripe] and 120 customers [unevidenced].");
    expect(segs.filter((s) => s.kind === "cite")).toEqual([]);
    expect(segs.filter((s) => s.kind === "unevidenced")).toHaveLength(1);
    expect(stripCitationMarkers("A$1.2M ARR [ev:ev-stripe] and 120 customers [unevidenced].")).toBe("A$1.2M ARR and 120 customers.");
  });

  it("plain text passes through untouched", () => {
    expect(parseCitations("No markers here.", REGISTER)).toEqual([{ kind: "text", text: "No markers here." }]);
    expect(hasCitationMarkers("No markers here.")).toBe(false);
    expect(hasCitationMarkers("x [ev:y]")).toBe(true);
    expect(hasCitationMarkers("x [unevidenced]")).toBe(true);
  });

  it("citationsToPlainText gives the same numbering as a string ([n] / (unverified))", () => {
    const index = createCitationIndex(REGISTER);
    expect(citationsToPlainText("MRR A$100k [ev:ev-stripe] · 12 % [ev:ev-ga4] · 40 % margin [unevidenced].", index)).toBe("MRR A$100k[1] · 12 %[2] · 40 % margin (unverified).");
    expect(citationsToPlainText("40 % [unevidenced]", index, "chưa xác minh")).toBe("40 % (chưa xác minh)");
  });
});

describe("createCitationIndex / buildCitationIndex", () => {
  it("assigns lazily, once per row, and lists entries in numeric order with level · source · date", () => {
    const index = createCitationIndex(REGISTER);
    expect(index.size).toBe(0);
    expect(index.peek("ev-ga4")).toBeNull();
    expect(index.numberFor("ev-ga4")?.n).toBe(1);
    expect(index.numberFor("EV-STRIPE")?.n).toBe(2);
    expect(index.numberFor("ev-ga4")?.n).toBe(1);
    expect(index.numberFor("nope")).toBeNull();
    expect(index.size).toBe(2);
    expect(citationEntries(index)).toEqual([
      { n: 1, id: "ev-ga4", label: "GA4 acquisition", level: "connected_source", source: "ga4", status: "evidenced", observedAt: null },
      { n: 2, id: "ev-stripe", label: "Stripe revenue", level: "transaction_data", source: "stripe", status: "evidenced", observedAt: "2026-09-10" },
    ]);
    expect(citationAnchorId(2)).toBe("ev-2");
  });

  it("pre-walks the report in reading order so the numbering is stable across web / PDF / DOCX", () => {
    const r = demoReportV2();
    const tre = r.dimensions.find((d) => d.dim === "tre")!;
    const mpc = r.dimensions.find((d) => d.dim === "mpc")!;
    r.executive.structured!.summary[0] += " [ev:ev-connected-ga4-acquisition]";
    tre.verdict += " [ev:ev-connected-revenue-stripe]";
    mpc.verdict += " [ev:ev-market-anchor-abs] [ev:ev-connected-ga4-acquisition]";
    const a = buildCitationIndex(r);
    const b = buildCitationIndex(r);
    expect(citationEntries(a).map((e) => [e.n, e.id])).toEqual([
      [1, "ev-connected-ga4-acquisition"],
      [2, "ev-connected-revenue-stripe"],
      [3, "ev-market-anchor-abs"],
    ]);
    expect(citationEntries(b)).toEqual(citationEntries(a));
    // The walk covers every prose surface a renderer prints.
    expect(citedTextFields(r).length).toBeGreaterThan(40);
    // The demo report cites nothing in its stored text → no appendix.
    expect(buildCitationIndex(demoReportV2()).size).toBe(0);
  });

  it("does not change how markers are stored: the grounding audit still reads them", () => {
    const r = demoReportV2();
    const before = groundingAudit(r).groundedShare;
    const tre = r.dimensions.find((d) => d.dim === "tre")!;
    tre.verdict = "Revenue reached A$9.9M ARR last quarter [ev:ev-connected-revenue-stripe].";
    buildCitationIndex(r);
    parseCitations(tre.verdict, buildCitationIndex(r));
    expect(tre.verdict).toContain("[ev:ev-connected-revenue-stripe]");
    expect(groundingAudit(r).sections.find((s) => s.id === "dim:tre")!.grounded).toBe(true);
    expect(groundingAudit(r).groundedShare).toBeGreaterThanOrEqual(before);
  });
});
