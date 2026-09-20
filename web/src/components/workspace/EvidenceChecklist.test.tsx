import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceChecklist } from "./EvidenceChecklist";
import { buildEvidenceChecklist } from "@/lib/svi/evidence-checklist";

describe("EvidenceChecklist", () => {
  it("renders eight dimension cards with claimed / missing / raise / CTA, in report order", () => {
    const rows = buildEvidenceChecklist([{ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "document_uploaded" }]);
    const html = renderToStaticMarkup(<EvidenceChecklist rows={rows} />);
    expect(html).toContain('data-testid="evidence-checklist"');
    expect(html).toMatch(/<h2[^>]*>Evidence checklist<\/h2>/);
    expect((html.match(/data-evidence-dimension=/g) ?? []).length).toBe(8);
    expect(html.indexOf('data-evidence-dimension="tre"')).toBeLessThan(html.indexOf('data-evidence-dimension="ftv"'));
    expect(html).toContain('data-evidence-dimension="tre" data-evidence-claimed="1"');
    expect(html).toContain("Missing");
    expect(html).toContain('data-evidence-raise="connected_source"');
    expect(html).toContain("Connect the source of record");
    expect(html).toContain('href="/workspace/evidence/gaps?dim=tre"');
    expect(html).toContain('data-testid="evidence-checklist-cta-ftv"');
    expect(html).toContain("Add Founding Team evidence");
  });

  it("read-only: no CTA links; h3 heading variant", () => {
    const html = renderToStaticMarkup(<EvidenceChecklist rows={buildEvidenceChecklist([])} canEdit={false} heading="h3" />);
    expect(html).not.toContain("evidence-checklist-cta-");
    expect(html).toMatch(/<h3[^>]*>Evidence checklist<\/h3>/);
    expect(html).toContain('data-evidence-claimed="0"');
  });
});
