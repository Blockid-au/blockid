import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

  it("wires the Phase-2 LOI + Discovery Interview Log AU legal templates (goal §1 phase 2 gap)", () => {
    // Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 2
    // "Missing: interview-log template ... LOI / letter-of-intent template also absent"
    // Ship-off task P2-loi-interview-wire (2026-07-25).
    const bySlug = allDocs.reduce<Record<string, (typeof allDocs)[number]>>(
      (acc, doc) => {
        if (doc.template_slug) acc[doc.template_slug] = doc;
        return acc;
      },
      {},
    );

    const loi = bySlug["au-customer-loi"];
    expect(loi, "LOI entry must be wired via template_slug").toBeDefined();
    expect(loi!.type).toBe("template");

    const interview = bySlug["au-customer-discovery-interview-log"];
    expect(
      interview,
      "Interview Log entry must be wired via template_slug",
    ).toBeDefined();
    expect(interview!.type).toBe("template");

    // Both slugs must resolve to a live file under web/content/templates/legal.
    // process.cwd() is web/ when vitest runs.
    for (const slug of ["au-customer-loi", "au-customer-discovery-interview-log"]) {
      const path = join(process.cwd(), "content", "templates", "legal", `${slug}.md`);
      expect(existsSync(path), `legal template ${slug}.md must exist`).toBe(true);
    }
  });

  it("wires the Phase-5 PMF Signal Survey AU legal template (goal §1 phase 5 gap)", () => {
    // Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 5
    // "Missing: ... \"very disappointed %\" survey template not in data room"
    // Ship-off task P5-pmf-survey (2026-07-25).
    const bySlug = allDocs.reduce<Record<string, (typeof allDocs)[number]>>(
      (acc, doc) => {
        if (doc.template_slug) acc[doc.template_slug] = doc;
        return acc;
      },
      {},
    );

    const pmf = bySlug["au-pmf-signal-survey"];
    expect(pmf, "PMF survey entry must be wired via template_slug").toBeDefined();
    expect(pmf!.type).toBe("template");

    const path = join(
      process.cwd(),
      "content",
      "templates",
      "legal",
      "au-pmf-signal-survey.md",
    );
    expect(existsSync(path), "legal template au-pmf-signal-survey.md must exist").toBe(true);
  });

  it("wires the Phase-1 Founder Agreement AU legal template (goal §1 phase 1 gap)", () => {
    // Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 1
    // "Missing: auto-generated Founder Agreement template (data-room folder 2
    // has `Founder Agreements & Vesting Schedules` template but the guide's
    // Chapter 1 CTA doesn't hand it to founders yet)".
    // Ship-off task P1-founder-agreement (2026-07-25).
    const bySlug = allDocs.reduce<Record<string, (typeof allDocs)[number]>>(
      (acc, doc) => {
        if (doc.template_slug) acc[doc.template_slug] = doc;
        return acc;
      },
      {},
    );

    const founderAgreement = bySlug["au-founder-agreement"];
    expect(
      founderAgreement,
      "Founder Agreement entry must be wired via template_slug",
    ).toBeDefined();
    expect(founderAgreement!.type).toBe("template");

    const path = join(
      process.cwd(),
      "content",
      "templates",
      "legal",
      "au-founder-agreement.md",
    );
    expect(
      existsSync(path),
      "legal template au-founder-agreement.md must exist",
    ).toBe(true);
  });

  it("wires the Phase-7 GA4 Measurement Plan AU legal template (goal §1 phase 7 gap)", () => {
    // Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 7
    // "Missing: ... GA4 measurement plan template not in data-room folder 4"
    // Ship-off task P7-ga4-measurement-plan (2026-07-25).
    const bySlug = allDocs.reduce<Record<string, (typeof allDocs)[number]>>(
      (acc, doc) => {
        if (doc.template_slug) acc[doc.template_slug] = doc;
        return acc;
      },
      {},
    );

    const ga4 = bySlug["au-ga4-measurement-plan"];
    expect(
      ga4,
      "GA4 Measurement Plan entry must be wired via template_slug",
    ).toBeDefined();
    expect(ga4!.type).toBe("template");

    // Must live in folder 4 (Product & Technology) per goal §1 phase 7 wording.
    const productSection = DATA_ROOM_STRUCTURE.find(
      (s) => s.section === "product",
    );
    expect(productSection, "product section must exist").toBeDefined();
    expect(
      productSection!.documents.some(
        (d) => d.template_slug === "au-ga4-measurement-plan",
      ),
      "GA4 plan must be wired inside folder 4 Product & Technology",
    ).toBe(true);

    const path = join(
      process.cwd(),
      "content",
      "templates",
      "legal",
      "au-ga4-measurement-plan.md",
    );
    expect(
      existsSync(path),
      "legal template au-ga4-measurement-plan.md must exist",
    ).toBe(true);
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

  it("wires the s708(8) wholesale-investor certificates register (goal §1 phase 9 P0 gap)", () => {
    // Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 9
    // "Missing: ... wholesale-investor cert intake slot exists conceptually
    //  but not wired to data-room (see Q2)".
    // Q2 recommendation: expose an evidence slot at Phase 10 that lets
    // founders upload the counter-signed certificate; NEVER issue or
    // validate it ourselves (s923B Corps Act boundary).
    // Ship-off task P9-wholesale-cert-slot (2026-07-25).
    const auCompliance = DATA_ROOM_STRUCTURE.find(
      (s) => s.section === "au_compliance",
    );
    expect(auCompliance, "AU Compliance section must exist").toBeDefined();

    const cert = auCompliance!.documents.find((d) =>
      d.name.includes("Wholesale Investor Certificates Register"),
    );
    expect(cert, "s708(8) wholesale-investor certificate slot must exist").toBeDefined();
    expect(cert!.type).toBe("upload");
    expect(cert!.priority).toBe("P0");
    expect(cert!.founder_review_required).toBe(true);
    // Statutory anchors must be present so a downstream surface can
    // grep-verify the Corporations Act boundary before rendering.
    expect(cert!.description).toMatch(/s708\(8\)/);
    expect(cert!.description).toMatch(/Corporations Act 2001/);
    expect(cert!.description).toMatch(/reg 6D\.2\.03/);
    expect(cert!.description).toMatch(/2\.5M/);
    expect(cert!.description).toMatch(/250k/);
    // s923B / s286 guard must be surfaced in the diligence notes so no
    // caller can render the slot without the "we don't validate this"
    // language and the 7-year record-keeping obligation.
    expect(cert!.dueDiligenceNotes).toBeDefined();
    expect(cert!.dueDiligenceNotes!).toMatch(/s923B/);
    expect(cert!.dueDiligenceNotes!).toMatch(/s286/);
    expect(cert!.dueDiligenceNotes!.toLowerCase()).toContain("does not issue");
  });
});
