// Cohort Validation Pilot proposal PDF (G23-B) — pdf vitest project. Pins:
// a real PDF of ≤ 4 pages under the byte ceiling; the buyer's organisation,
// the quoted objection, the pilot price inc. GST and cap, all six stage
// headlines, every success metric, the data sentence, the Cohort 25 /
// Cohort 100 annual figures, the credit rule, the signature block, the
// entity + ABN footer and the general-advice disclaimer are in the text;
// and the 25 pilot renders at its own amount.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { PILOT_SKUS, PILOT_SUCCESS_METRICS, formatPilotPrice } from "@/lib/pricing/pilot-skus";
import { PILOT_CONVERSION_WINDOW_DAYS } from "@/lib/pilots/conversion";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/pilots/consent";
import { buildPilotProposal } from "@/lib/validation/proposal";
import type { ValidationEntry } from "@/lib/validation/model";
import { pdfPageCount } from "./page-count";
import { PILOT_PROPOSAL_FOOTER, PILOT_PROPOSAL_MAX_BYTES, PILOT_PROPOSAL_MAX_PAGES, renderPilotProposalPdf } from "./pilot-proposal-pdf";

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

describe("renderPilotProposalPdf", () => {
  it("renders ≤ 4 pages under the byte ceiling with every section, the constants and the footer", async () => {
    const proposal = buildPilotProposal(entry(), { now: NOW });
    const { buffer, pages } = await renderPilotProposalPdf(proposal);
    expect(pages).toBeLessThanOrEqual(PILOT_PROPOSAL_MAX_PAGES);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(buffer.length).toBeLessThanOrEqual(PILOT_PROPOSAL_MAX_BYTES);
    const text = await fullText(buffer);
    expect(text).toContain("Cohort Validation Pilot");
    expect(text).toContain("Harbour Accelerator");
    expect(text).toContain("Program manager");
    expect(text).toContain("Our reviewers spend two hours per application and still disagree.");
    // 40 applicants → the 50 pilot at its constant amount, cap and access days.
    expect(text).toContain(formatPilotPrice("cohort_pilot_50"));
    expect(text).toContain(`${PILOT_SKUS.cohort_pilot_50.applicantsCap}`);
    expect(text).toContain(`${PILOT_SKUS.cohort_pilot_50.entitlementDays} days`);
    for (const st of proposal.delivered.stages) expect(text, st.headline).toContain(st.headline);
    for (const m of PILOT_SUCCESS_METRICS) expect(text, m).toContain(m);
    expect(text).toContain(DATA_PRINCIPLE_SENTENCE.slice(0, 40));
    const starter = PLANS_V2.find((x) => x.id === "accelerator_starter")!;
    const growth = PLANS_V2.find((x) => x.id === "accelerator_growth")!;
    expect(text).toContain(`${starter.name}`);
    expect(text).toContain(`${formatAud(starter.annual_aud)} a year`);
    expect(text).toContain(`${growth.name}`);
    expect(text).toContain(`${formatAud(growth.annual_aud)} a year`);
    expect(text).toContain(`${PILOT_CONVERSION_WINDOW_DAYS} days of the pilot ending`);
    expect(text).toContain("Acceptance");
    expect(text).toMatch(/signature/i);
    expect(text).toContain(LEGAL_ENTITY.abn);
    expect(text).toContain("Australian Financial Services Licence");
    expect(text).toContain(PILOT_PROPOSAL_FOOTER.slice(0, 30));
    expect(text).toContain("page 1/");
    expect(text).toContain("PP-20260921-3F2A9C1E");
  });

  it("maximum-length objection + note (ENTRY_LIMITS) still fit in 4 pages", async () => {
    const proposal = buildPilotProposal(entry({ objection: "x".repeat(500), note: "y".repeat(2000), organisation: "O".repeat(160), contact_role: "R".repeat(120) }), { now: NOW });
    const { pages } = await renderPilotProposalPdf(proposal);
    expect(pages).toBeLessThanOrEqual(PILOT_PROPOSAL_MAX_PAGES);
  });

  it("the 25 pilot renders its own amount and never the 50 figure; an entry without an objection still renders", async () => {
    const proposal = buildPilotProposal(entry({ objection: "", note: "", next_step: "" }), { now: NOW });
    const { buffer, pages } = await renderPilotProposalPdf(proposal);
    expect(pages).toBeLessThanOrEqual(PILOT_PROPOSAL_MAX_PAGES);
    const text = await fullText(buffer);
    expect(text).toContain(formatPilotPrice("cohort_pilot_25"));
    expect(text).not.toContain(formatPilotPrice("cohort_pilot_50"));
    expect(text).toContain("No objection was recorded");
  });
});
