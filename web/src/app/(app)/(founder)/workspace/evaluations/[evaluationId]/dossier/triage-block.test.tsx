// G34 RQ25/RQ26 — the dossier triage block: "Mandate fit: stage ✓ · sector ✓
// · ticket ✗ · geography ✓", the verdict with its rule, the missing list,
// the request link only when evidence is needed and requestable, and the
// not-advice note.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TRIAGE_NOTE, type EvaluatorTriage, type MandateAxis } from "@/lib/evaluations/triage-verdict";
import { TriageBlock } from "./triage-block";

const axes: MandateAxis[] = [
  { key: "stage", label: "stage", status: "fit", note: "Backs seed rounds" },
  { key: "sector", label: "sector", status: "fit", note: "Invests in fintech" },
  { key: "ticket", label: "ticket", status: "miss", note: "Ask A$5M outside their A$100K–A$500K cheque" },
  { key: "geography", label: "geography", status: "fit", note: "Invests in NSW" },
];
const triage = (over: Partial<EvaluatorTriage> = {}): EvaluatorTriage => ({
  mandate: { label: "Seed fintech NSW", axes, line: "stage ✓ · sector ✓ · ticket ✗ · geography ✓" },
  verdict: "outside_mandate",
  verdictLabel: "Outside mandate",
  rule: "Mandate: ticket outside your mandate",
  missing: ["No cap table on file — upload to assess", "NRR: not evidenced"],
  note: TRIAGE_NOTE,
  ...over,
});
const textOf = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("TriageBlock", () => {
  it("prints the mandate line with glyphs + screen-reader status, the verdict, the rule, the missing list and the note", () => {
    const html = renderToStaticMarkup(<TriageBlock triage={triage()} requestHref="#dossier-block-3" />);
    const text = textOf(html);
    expect(text).toContain("Mandate fit: stage ✓ fits · sector ✓ fits · ticket ✗ outside mandate · geography ✓ fits");
    expect(html).toContain('data-axis="ticket" data-status="miss" title="Ask A$5M outside their A$100K–A$500K cheque"');
    expect(html).toContain('data-verdict="outside_mandate"');
    expect(text).toContain("Outside mandate");
    expect(text).toContain("Rule: Mandate: ticket outside your mandate");
    expect(text).toContain("No cap table on file — upload to assess");
    expect(text).toContain("General information only, not financial, legal or investment advice.");
    // The request link only accompanies "Needs more evidence".
    expect(html).not.toContain('data-testid="triage-request-evidence"');
  });

  it("needs more evidence + a requestable consent tier → link to the dossier's existing request CTA", () => {
    const html = renderToStaticMarkup(<TriageBlock triage={triage({ verdict: "needs_evidence", verdictLabel: "Needs more evidence", rule: "Report meeting label D (Evidence incomplete)" })} requestHref="#dossier-block-3" />);
    expect(html).toMatch(/href="#dossier-block-3"[^>]*data-testid="triage-request-evidence"/);
    expect(renderToStaticMarkup(<TriageBlock triage={triage({ verdict: "needs_evidence", verdictLabel: "Needs more evidence" })} requestHref={null} />)).not.toContain("triage-request-evidence");
  });

  it("no mandate saved → 'Set your mandate' link; the verdict still renders", () => {
    const html = renderToStaticMarkup(<TriageBlock triage={triage({ mandate: null, verdict: "read_further", verdictLabel: "Read further", rule: "Report meeting label B (Worth investigating) · no mandate saved" })} />);
    expect(html).toContain('href="/workspace/investor/mandate"');
    expect(textOf(html)).toContain("Read further");
  });

  it("caps the missing list at 8 with a '+N more' line", () => {
    const missing = Array.from({ length: 11 }, (_, i) => `Item ${i + 1}`);
    const html = renderToStaticMarkup(<TriageBlock triage={triage({ missing })} />);
    expect((html.match(/<li>/g) ?? []).length).toBe(8);
    expect(textOf(html)).toContain("+3 more in the report");
  });
});
