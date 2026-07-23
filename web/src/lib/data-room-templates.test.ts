import { describe, it, expect } from "vitest";
import { DATA_ROOM_STRUCTURE } from "./data-room-templates";

/**
 * Real-world workflow parity — Task 3 (2026-07-23).
 *
 * Locks in the Series-A / acquirer-standard data-room breadth documented in
 * `docs/plans/real-world-workflow-parity-audit-2026-07-23.md` §4.
 *
 * - ≥ 60 total items across the structure
 * - ≥ 10 sections present (existing 10 + Tax + AU Compliance = 12)
 * - Every item has a non-empty name and description
 * - Tax and AU Compliance sections exist and each carries ≥ 5 items
 */

describe("DATA_ROOM_STRUCTURE — Series-A / acquirer parity", () => {
  const allDocs = DATA_ROOM_STRUCTURE.flatMap((section) => section.documents);

  it("carries at least 60 documents in total", () => {
    expect(allDocs.length).toBeGreaterThanOrEqual(60);
  });

  it("contains at least 10 sections", () => {
    expect(DATA_ROOM_STRUCTURE.length).toBeGreaterThanOrEqual(10);
  });

  it("preserves all 10 pre-existing standard sections", () => {
    const expected = [
      "corporate",
      "captable",
      "financial",
      "product",
      "traction",
      "team",
      "ip",
      "contracts",
      "strategy",
      "references",
    ];
    const actual = DATA_ROOM_STRUCTURE.map((s) => s.section);
    for (const key of expected) {
      expect(actual).toContain(key);
    }
  });

  it("gives every document a non-empty name and description", () => {
    for (const section of DATA_ROOM_STRUCTURE) {
      for (const doc of section.documents) {
        expect(doc.name, `section ${section.section} doc name`).toBeTruthy();
        expect(doc.name.trim().length).toBeGreaterThan(0);
        expect(
          doc.description,
          `section ${section.section} / ${doc.name} description`,
        ).toBeTruthy();
        expect(doc.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("adds a dedicated Tax section with ≥ 5 items", () => {
    const tax = DATA_ROOM_STRUCTURE.find((s) => s.section === "tax");
    expect(tax, "Tax section must exist").toBeDefined();
    expect(tax!.documents.length).toBeGreaterThanOrEqual(5);
  });

  it("adds a dedicated AU Compliance section with ≥ 5 items", () => {
    const au = DATA_ROOM_STRUCTURE.find((s) => s.section === "au_compliance");
    expect(au, "AU Compliance section must exist").toBeDefined();
    expect(au!.documents.length).toBeGreaterThanOrEqual(5);
  });

  it("flags conservatively-worded AU regulatory items for founder review", () => {
    // AFSL, ESIC and ESVCLP wording is deliberately conservative and must be
    // reviewed by a compliance-qualified adviser before publication.
    const flagged = allDocs.filter((d) => d.founder_review_required === true);
    const flaggedNames = flagged.map((d) => d.name.toLowerCase());
    expect(flaggedNames.some((n) => n.includes("afsl"))).toBe(true);
    expect(flaggedNames.some((n) => n.includes("esic"))).toBe(true);
    expect(flaggedNames.some((n) => n.includes("esvclp"))).toBe(true);
  });
});
