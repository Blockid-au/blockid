import { describe, expect, it } from "vitest";
import { buildEvidenceChecklist, nextConfidenceStep } from "./evidence-checklist";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";
import { DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { CAP_RULES_PLAIN } from "@/lib/evidence/confidence-cap";

describe("buildEvidenceChecklist", () => {
  it("empty vault: one row per dimension in report order, nothing claimed, every catalogue item missing (impact-sorted), next step = public URL", () => {
    const rows = buildEvidenceChecklist([]);
    expect(rows.map((r) => r.dimension)).toEqual([...DIM_ORDER]);
    for (const r of rows) {
      expect(r.claimed).toBe(0);
      expect(r.total).toBe(EVIDENCE_CATALOG[r.dimension]?.length ?? 0);
      expect(r.missing.length).toBe(r.total);
      for (let i = 1; i < r.missing.length; i++) expect(r.missing[i - 1].estimatedSviImpact).toBeGreaterThanOrEqual(r.missing[i].estimatedSviImpact);
      expect(r.highest).toBeNull();
      expect(r.raise?.level).toBe("public_url");
      expect(r.raise?.rule).toBe(CAP_RULES_PLAIN.find((c) => c.origin === "founder_text")!.rule);
      expect(r.cta).toEqual({ href: `/workspace/evidence/gaps?dim=${r.dimension}`, label: `Add ${r.shortLabel} evidence` });
      expect(r.summary).toMatch(/^Nothing on file yet/);
    }
  });

  it("claimed items are counted once per catalogue code; unknown codes / dimensions are ignored", () => {
    const rows = buildEvidenceChecklist([
      { dimension: "ftv", evidence_type: "founder_linkedin", confidence_level: "public_url" },
      { dimension: "FTV", evidence_type: "founder_linkedin", confidence_level: "public_url" }, // case-insensitive, same code
      { dimension: "ftv", evidence_type: "made_up", confidence_level: "document_uploaded" },
      { dimension: "nope", evidence_type: "founder_linkedin" },
      { dimension: null, evidence_type: "founder_linkedin" },
    ]);
    const ftv = rows.find((r) => r.dimension === "ftv")!;
    expect(ftv.claimed).toBe(1);
    expect(ftv.missing.map((m) => m.code)).not.toContain("founder_linkedin");
    expect(ftv.missing.length).toBe(ftv.total - 1);
    expect(ftv.cta.label).toBe("Strengthen Founding Team");
    expect(ftv.summary).toBe(`1 of ${ftv.total} on file · strongest evidence: document uploaded.`);
  });

  it("what raises confidence: the next rung after the highest on file, with who + rule + action; null after third-party verified", () => {
    const [docs] = buildEvidenceChecklist([{ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "document_uploaded" }]).filter((r) => r.dimension === "tre");
    expect(docs.highest).toBe("document_uploaded");
    expect(docs.raise).toMatchObject({ level: "connected_source", label: "connected source", who: "Connector (Stripe, Xero, GitHub, GA4…)" });
    expect(docs.raise?.action).toContain("Connect the source of record");

    const [tx] = buildEvidenceChecklist([{ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "transaction_data" }]).filter((r) => r.dimension === "tre");
    expect(tx.raise).toMatchObject({ level: "third_party_verified", who: "BlockID reviewer" });
    expect(tx.raise?.action).toContain("Request review");

    const [verified] = buildEvidenceChecklist([{ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "document_uploaded", is_verified: true }]).filter((r) => r.dimension === "tre");
    expect(verified.highest).toBe("third_party_verified");
    expect(verified.raise).toBeNull();
  });

  it("nextConfidenceStep walks the ladder and never proposes self_declared", () => {
    expect(nextConfidenceStep(null)?.level).toBe("public_url");
    expect(nextConfidenceStep("self_declared")?.level).toBe("public_url");
    expect(nextConfidenceStep("public_url")?.level).toBe("document_uploaded");
    expect(nextConfidenceStep("connected_source")?.level).toBe("transaction_data");
    expect(nextConfidenceStep("third_party_verified")).toBeNull();
  });
});
