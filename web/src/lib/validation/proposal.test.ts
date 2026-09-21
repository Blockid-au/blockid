// buildPilotProposal (G23-B) — the advisor plan's Level 3 artefact. Pins:
// every amount / cap / day count comes from the constants (pilot-skus,
// plans-v2, conversion), the size rule (≤ 25 → the 25 pilot, else the 50),
// the entry text is quoted verbatim, the data sentence + applicant consent
// are verbatim, the six stages are the catalogue keys the accelerator page
// renders (never the key itself), the entity line, determinism on `now`,
// and the filename shape.

import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/messages/en.json";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { PILOT_CONVERSION_WINDOW_DAYS, PILOT_CREDIT_RULE } from "@/lib/pilots/conversion";
import { APPLICANT_CONSENT_TEXT, DATA_PRINCIPLE_SENTENCE } from "@/lib/pilots/consent";
import { PDF_GENERAL_ADVICE_DISCLAIMER } from "@/lib/pdf/advice-disclaimer";
import { PILOT_ENTITLEMENT_DAYS, PILOT_INCLUDES, PILOT_SKUS, PILOT_SUCCESS_METRICS, formatPilotPriceLong } from "@/lib/pricing/pilot-skus";
import { LEGAL_ENTITY, legalLine } from "@/lib/site/legal-entity";
import type { ValidationEntry } from "./model";
import { PROPOSAL_CATALOGUE_KEYS, PROPOSAL_DEFAULT_APPLICANTS, PROPOSAL_NOTE_MAX_CHARS, PROPOSAL_VALID_DAYS, buildPilotProposal, inferApplicants, proposalFilename, skuForApplicants } from "./proposal";

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

describe("inferApplicants / skuForApplicants", () => {
  it("reads the cohort size from the note, then next step, then objection; null when absent", () => {
    expect(inferApplicants(entry())).toBe(40);
    expect(inferApplicants(entry({ note: "", next_step: "cohort of 18 in March" }))).toBe(18);
    expect(inferApplicants(entry({ note: "", next_step: "", objection: "we only get 12 applicants a year" }))).toBe(12);
    expect(inferApplicants(entry({ note: "no numbers here", next_step: "", objection: "" }))).toBeNull();
  });

  it("≤ 25 books the 25 pilot, anything larger the 50 pilot (caps from PILOT_SKUS, never typed)", () => {
    expect(skuForApplicants(PILOT_SKUS.cohort_pilot_25.applicantsCap)).toBe("cohort_pilot_25");
    expect(skuForApplicants(PILOT_SKUS.cohort_pilot_25.applicantsCap + 1)).toBe("cohort_pilot_50");
    expect(skuForApplicants(500)).toBe("cohort_pilot_50");
  });
});

describe("buildPilotProposal", () => {
  it("prices the size the entry implies from the constants — 40 applicants → the 50 pilot at its PILOT_SKUS amount", () => {
    const p = buildPilotProposal(entry(), { now: NOW });
    expect(p.meta.sku).toBe("cohort_pilot_50");
    expect(p.scope.applicantsCap).toBe(PILOT_SKUS.cohort_pilot_50.applicantsCap);
    expect(p.scope.priceLabel).toBe(formatAud(PILOT_SKUS.cohort_pilot_50.amountInclGstCents / 100));
    expect(p.scope.priceLongLabel).toBe(formatPilotPriceLong("cohort_pilot_50"));
    expect(p.scope.accessDays).toBe(PILOT_ENTITLEMENT_DAYS);
    expect(p.scope.includes).toEqual([...PILOT_INCLUDES]);
    expect(p.scope.lines.join(" ")).toContain("Sized for an intake of about 40");
    expect(p.acceptance.text).toContain(formatPilotPriceLong("cohort_pilot_50"));
  });

  it("defaults to the 25 pilot when nothing implies a size; opts.applicants wins over the text", () => {
    const p = buildPilotProposal(entry({ note: "", next_step: "", objection: "" }), { now: NOW });
    expect(p.meta.sku).toBe("cohort_pilot_25");
    expect(p.scope.applicantsCap).toBe(PROPOSAL_DEFAULT_APPLICANTS);
    expect(p.scope.priceLongLabel).toBe(formatPilotPriceLong("cohort_pilot_25"));
    const forced = buildPilotProposal(entry(), { now: NOW, applicants: 10 });
    expect(forced.meta.sku).toBe("cohort_pilot_25");
    const over = buildPilotProposal(entry(), { now: NOW, applicants: 80 });
    expect(over.meta.sku).toBe("cohort_pilot_50");
    expect(over.scope.lines.join(" ")).toContain("larger than this pilot covers");
  });

  it("quotes the objection and note verbatim, names the organisation and role, never a person", () => {
    const p = buildPilotProposal(entry(), { now: NOW });
    expect(p.problem.quote).toBe("Our reviewers spend two hours per application and still disagree.");
    expect(p.problem.note).toBe("Next intake is 40 startups in November; three reviewers.");
    expect(p.problem.lead).toContain("Harbour Accelerator (Program manager) on 2026-09-18");
    expect(p.cover.organisation).toBe("Harbour Accelerator");
    expect(p.cover.contactRole).toBe("Program manager");
    expect(buildPilotProposal(entry({ objection: "" }), { now: NOW }).problem.quote).toBeNull();
    const long = buildPilotProposal(entry({ note: "z".repeat(2000) }), { now: NOW });
    expect(long.problem.note!.length).toBe(PROPOSAL_NOTE_MAX_CHARS);
    expect(long.problem.note!.endsWith("…")).toBe(true);
  });

  it("the six stages are the catalogue's accelerator journey — three bullets each, never a bare key", () => {
    const p = buildPilotProposal(entry(), { now: NOW });
    expect(p.delivered.stages).toHaveLength(6);
    const cat = en as Record<string, string>;
    for (const key of PROPOSAL_CATALOGUE_KEYS) expect(typeof cat[key], key).toBe("string");
    p.delivered.stages.forEach((st, i) => {
      expect(st.headline).toBe(cat[`solutions.accelerator.journey.step${i + 1}.head`]);
      expect(st.bullets).toEqual([1, 2, 3].map((b) => cat[`solutions.accelerator.journey.step${i + 1}.b${b}`]));
      expect(st.bullets.join(" ")).not.toMatch(/solutions\.accelerator/);
    });
    expect(p.delivered.heading).toBe(cat["solutions.accelerator.journey.title"]);
    expect(p.metrics.items).toEqual([...PILOT_SUCCESS_METRICS]);
    expect(p.metrics.heading).toBe(cat["solutions.accelerator.pilot.metricsTitle"]);
  });

  it("data and consent are the approved sentences verbatim; the retention line cites the privacy policy", () => {
    const p = buildPilotProposal(entry(), { now: NOW });
    expect(p.data.principle).toBe(DATA_PRINCIPLE_SENTENCE);
    expect(p.data.consent).toBe(APPLICANT_CONSENT_TEXT);
    expect(p.data.retention).toMatch(/Privacy Policy § 4/);
  });

  it("after the pilot: Cohort 25 / Cohort 100 annual from plans-v2 + the credit rule with the window from conversion.ts", () => {
    const p = buildPilotProposal(entry(), { now: NOW });
    const starter = PLANS_V2.find((x) => x.id === "accelerator_starter")!;
    const growth = PLANS_V2.find((x) => x.id === "accelerator_growth")!;
    expect(p.after.tiers.map((x) => x.id)).toEqual(["accelerator_starter", "accelerator_growth"]);
    expect(p.after.tiers[0]).toMatchObject({ name: starter.name, annualLabel: formatAud(starter.annual_aud), trialDays: starter.trial_days });
    expect(p.after.tiers[1]).toMatchObject({ name: growth.name, annualLabel: formatAud(growth.annual_aud), trialDays: growth.trial_days });
    expect(p.after.creditRule).toBe(PILOT_CREDIT_RULE);
    expect(p.after.creditRule).toContain(`${PILOT_CONVERSION_WINDOW_DAYS} days`);
    expect(p.after.windowDays).toBe(PILOT_CONVERSION_WINDOW_DAYS);
  });

  it("cover, timeline, acceptance and footer: entity from LEGAL_ENTITY, dates from `now`, the general-advice disclaimer", () => {
    const p = buildPilotProposal(entry(), { now: NOW });
    expect(p.cover.preparedBy).toBe(legalLine());
    expect(p.cover.dateLabel).toBe("21 September 2026");
    expect(p.cover.validUntilLabel).toBe("21 October 2026");
    expect(PROPOSAL_VALID_DAYS).toBe(30);
    expect(p.timeline.steps.map((x) => x.label)).toEqual(["Acceptance", "Setup", "Intake", "Assessment", "Workshop", "Report"]);
    expect(p.timeline.accessLine).toContain(`${PILOT_ENTITLEMENT_DAYS} days from payment`);
    expect(p.timeline.accessLine).toContain("20 December 2026");
    expect(p.acceptance.fields).toEqual(["Name", "Role", "Organisation", "Date", "Signature"]);
    expect(p.acceptance.text).toContain(LEGAL_ENTITY.operator);
    expect(p.footer.entity).toContain(LEGAL_ENTITY.abn);
    expect(p.footer.disclaimer).toBe(PDF_GENERAL_ADVICE_DISCLAIMER);
    expect(p.meta.reference).toBe("PP-20260921-3F2A9C1E");
    expect(p.meta.generatedAt).toBe(NOW.toISOString());
  });

  it("is deterministic for the same entry + now, and the filename slugs the organisation with the date", () => {
    const a = buildPilotProposal(entry(), { now: NOW });
    const b = buildPilotProposal(entry(), { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.meta.filename).toBe("blockid-pilot-proposal-harbour-accelerator-2026-09-21.pdf");
    expect(proposalFilename("Ünïcode & Co. — Sydney", NOW)).toBe("blockid-pilot-proposal-n-code-co-sydney-2026-09-21.pdf");
    expect(proposalFilename("!!!", NOW)).toBe("blockid-pilot-proposal-organisation-2026-09-21.pdf");
  });

  it("never carries a literal amount outside the constants (the copy rule)", () => {
    const p = buildPilotProposal(entry(), { now: NOW });
    const text = JSON.stringify(p);
    // Every A$ figure in the document must be one the catalogue produces.
    const allowed = new Set([formatPilotPriceLong("cohort_pilot_25"), formatPilotPriceLong("cohort_pilot_50"), ...PLANS_V2.filter((x) => x.segment === "accelerator").flatMap((x) => [formatAud(x.annual_aud), formatAud(x.monthly_aud)])]);
    for (const m of text.matchAll(/A\$[\d,]+(?: inc\. GST)?/g)) {
      const hit = [...allowed].some((a) => a.startsWith(m[0]) || m[0].startsWith(a));
      expect(hit, m[0]).toBe(true);
    }
  });
});
