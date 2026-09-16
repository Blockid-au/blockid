// Block 4 · Evidence to add — SSR pins (G13-W3-IA3 §B.1 row 4 / §B.4 row 4).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ trackEvent: () => undefined }));

import { deriveEvidenceGaps } from "@/lib/dashboard/evidence-gaps";
import { EVIDENCE_EMPTY, EvidenceToAdd } from "./evidence-to-add";

const ctx = { phase: "legal_equity", plan: "founder_free", persona: "founder" };

describe("EvidenceToAdd", () => {
  it("empty state (nothing present yet): the §B.4 copy, Connect → /workspace/evidence/connectors, and the top gaps still listed", () => {
    const result = deriveEvidenceGaps({ evidenceRows: [], growthPhaseId: null, criteria: [], subs: null });
    const html = renderToStaticMarkup(<EvidenceToAdd ctx={ctx} result={result} />);
    expect(html).toContain('data-landing-block="evidence-to-add" data-landing-empty="true"');
    expect(html).toContain(EVIDENCE_EMPTY);
    expect(html).toContain('href="/workspace/evidence/connectors"');
    expect(html).toContain(">Connect<");
    expect((html.match(/data-gap-dimension="/g) ?? []).length).toBe(3);
    expect(html).not.toContain("data-landing-gate");
  });

  it("with evidence: three rows (gap · dimension · +N pts), blocked flag, gate %, Add evidence → /workspace/evidence/gaps", () => {
    const result = deriveEvidenceGaps({
      evidenceRows: [{ dimension: "tre", evidence_type: "revenue_proof" }],
      growthPhaseId: "legal_equity",
      criteria: [],
      subs: [
        { key: "cgh", value: 20 },
        { key: "lco", value: 20 },
      ],
    });
    const html = renderToStaticMarkup(<EvidenceToAdd ctx={ctx} result={result} />);
    expect(html).not.toContain("data-landing-empty");
    expect(html).toContain("data-landing-gate");
    expect(html).toContain("blocks phase exit");
    expect(html).toMatch(/\+\d+ pts/);
    expect(html).toContain("Legal &amp; Equity exit conditions met");
    expect(html).toContain('href="/workspace/evidence/gaps"');
    expect(html).toContain(">Add evidence<");
  });

  it("member (read-only): the CTA opens the gaps page as 'View gaps' in the secondary style", () => {
    const result = deriveEvidenceGaps({ evidenceRows: [{ dimension: "ftv", evidence_type: "founder_bio" }], growthPhaseId: null, criteria: [], subs: null });
    const html = renderToStaticMarkup(<EvidenceToAdd ctx={ctx} result={result} canEdit={false} />);
    expect(html).toContain(">View gaps<");
    expect(html).toContain("border-line-subtle bg-surface px-3");
  });
});
