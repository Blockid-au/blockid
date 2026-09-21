// Cohort proposal PDF (G23-B; re-based by G25) — pdf vitest project. Pins:
// a real PDF of ≤ 4 pages under the byte ceiling; the buyer's organisation,
// the quoted objection, the rung's annual price inc. GST, cap and trial
// days, all six stage headlines, every success metric, the data sentence,
// the Cohort 25 / Cohort 100 annual figures, the signature block, the
// entity + ABN footer and the general-advice disclaimer are in the text;
// nothing "pilot", no credit rule; and the Cohort 25 proposal renders at its
// own amount.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { COHORT_SUCCESS_METRICS } from "@/lib/accelerator/cohort-offer";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/accelerator/applicant-consent";
import { buildCohortProposal, cohortPlanCap } from "@/lib/validation/proposal";
import type { ValidationEntry } from "@/lib/validation/model";
import { pdfPageCount } from "./page-count";
import { COHORT_PROPOSAL_FOOTER, COHORT_PROPOSAL_MAX_BYTES, COHORT_PROPOSAL_MAX_PAGES, renderCohortProposalPdf } from "./cohort-proposal-pdf";

async function fullText(buffer: Buffer): Promise<string> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " ")).join("\n");
  } finally {
    await parser.destroy();
  }
}

const NOW = new Date("2026-09-21T03:00:00.000Z");
const starter = PLANS_V2.find((x) => x.id === "accelerator_starter")!;
const growth = PLANS_V2.find((x) => x.id === "accelerator_growth")!;

function entry(over: Partial<ValidationEntry> = {}): ValidationEntry {
  return {
    id: "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b",
    organisation: "Harbour Accelerator",
    contact_role: "Program manager",
    date: "2026-09-18",
    level: 3,
    outcome: "booked",
    objection: "Our reviewers spend two hours per application and still disagree.",
    objection_answered: false,
    next_step: "Send the written proposal",
    note: "Next intake is 40 startups in November; three reviewers.",
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    ...over,
  };
}

describe("renderCohortProposalPdf", () => {
  it("renders ≤ 4 pages under the byte ceiling with every section, the constants and the footer — nothing pilot", async () => {
    const proposal = buildCohortProposal(entry(), { now: NOW });
    const { buffer, pages } = await renderCohortProposalPdf(proposal);
    expect(pages).toBeLessThanOrEqual(COHORT_PROPOSAL_MAX_PAGES);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(buffer.length).toBeLessThanOrEqual(COHORT_PROPOSAL_MAX_BYTES);
    const text = await fullText(buffer);
    expect(text).toContain("Cohort proposal");
    expect(text).toContain("Harbour Accelerator");
    expect(text).toContain("Program manager");
    expect(text).toContain("Our reviewers spend two hours per application and still disagree.");
    // 40 startups → Cohort 100 at its plans-v2 amount, cap and trial days.
    expect(text).toContain(`${growth.name} — annual plan`);
    expect(text).toContain(formatAud(growth.annual_aud));
    expect(text).toContain(`${cohortPlanCap("accelerator_growth")}`);
    expect(text).toContain(`${growth.trial_days} days`);
    for (const st of proposal.delivered.stages) expect(text, st.headline).toContain(st.headline);
    for (const m of COHORT_SUCCESS_METRICS) expect(text, m).toContain(m);
    expect(text).toContain(DATA_PRINCIPLE_SENTENCE.slice(0, 40));
    expect(text).toContain(`${starter.name}`);
    expect(text).toContain(`${formatAud(starter.annual_aud)} a year`);
    expect(text).toContain(`${formatAud(growth.annual_aud)} a year`);
    expect(text).toContain("Acceptance");
    expect(text).toMatch(/signature/i);
    expect(text).toContain(LEGAL_ENTITY.abn);
    expect(text).toContain("Australian Financial Services Licence");
    expect(text).toContain(COHORT_PROPOSAL_FOOTER.slice(0, 30));
    expect(text).toContain("page 1/");
    expect(text).toContain("CP-20260921-3F2A9C1E");
    expect(text).not.toMatch(/pilot|coupon|credited/i);
    // A$1,500 is Cohort 100's monthly figure (plans-v2); the retired pilot's A$2,500 must never appear.
    expect(text).not.toContain("A$2,500");
  });

  it("maximum-length objection + note (ENTRY_LIMITS) still fit in 4 pages", async () => {
    const proposal = buildCohortProposal(entry({ objection: "x".repeat(500), note: "y".repeat(2000), organisation: "O".repeat(160), contact_role: "R".repeat(120) }), { now: NOW });
    const { pages } = await renderCohortProposalPdf(proposal);
    expect(pages).toBeLessThanOrEqual(COHORT_PROPOSAL_MAX_PAGES);
  });

  it("the Cohort 25 proposal renders its own amount in the scope; an entry without an objection still renders", async () => {
    const proposal = buildCohortProposal(entry({ objection: "", note: "", next_step: "" }), { now: NOW });
    const { buffer, pages } = await renderCohortProposalPdf(proposal);
    expect(pages).toBeLessThanOrEqual(COHORT_PROPOSAL_MAX_PAGES);
    const text = await fullText(buffer);
    expect(text).toContain(`${starter.name} — annual plan`);
    expect(text).toContain(`${formatAud(starter.annual_aud)} inc. GST`);
    expect(text).not.toContain(`${growth.name} — annual plan`);
    expect(text).toContain("No objection was recorded");
  });
});
