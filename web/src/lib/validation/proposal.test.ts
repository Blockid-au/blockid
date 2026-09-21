// buildCohortProposal (G23-B; re-based by G25) — the advisor plan's Level 3
// artefact. Pins: every amount / cap / day count comes from the constants
// (plans-v2, plans.generated), the size rule (≤ the Cohort 25 cap → Cohort
// 25, else Cohort 100), the entry text is quoted verbatim, the data sentence
// + applicant consent are verbatim, the six stages are the catalogue keys
// the accelerator page renders (never the key itself), the entity line,
// determinism on `now`, the filename shape — and nothing "pilot", no credit
// rule, no coupon, no one-off amount anywhere in the document.

import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/messages/en.json";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { PLANS_V2, formatAud, withGst } from "@/lib/plans-v2";
import { COHORT_INCLUDES, COHORT_SUCCESS_METRICS } from "@/lib/accelerator/cohort-offer";
import { APPLICANT_CONSENT_TEXT, DATA_PRINCIPLE_SENTENCE } from "@/lib/accelerator/applicant-consent";
import { PDF_GENERAL_ADVICE_DISCLAIMER } from "@/lib/pdf/advice-disclaimer";
import { LEGAL_ENTITY, legalLine } from "@/lib/site/legal-entity";
import type { ValidationEntry } from "./model";
import { PROPOSAL_CATALOGUE_KEYS, PROPOSAL_DEFAULT_APPLICANTS, PROPOSAL_NOTE_MAX_CHARS, PROPOSAL_TITLE, PROPOSAL_VALID_DAYS, buildCohortProposal, cohortPlanCap, inferApplicants, planForApplicants, proposalFilename } from "./proposal";

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

describe("inferApplicants / planForApplicants", () => {
  it("reads the cohort size from the note, then next step, then objection; null when absent", () => {
    expect(inferApplicants(entry())).toBe(40);
    expect(inferApplicants(entry({ note: "", next_step: "cohort of 18 in March" }))).toBe(18);
    expect(inferApplicants(entry({ note: "", next_step: "", objection: "we only get 12 applicants a year" }))).toBe(12);
    expect(inferApplicants(entry({ note: "no numbers here", next_step: "", objection: "" }))).toBeNull();
  });

  it("≤ the Cohort 25 cap proposes Cohort 25, anything larger Cohort 100 (caps from plans.generated, never typed)", () => {
    expect(cohortPlanCap("accelerator_starter")).toBe((GENERATED_PLANS_BY_ID.accelerator_starter!.usage_limits as { profiles: number }).profiles);
    expect(cohortPlanCap("accelerator_growth")).toBe((GENERATED_PLANS_BY_ID.accelerator_growth!.usage_limits as { profiles: number }).profiles);
    expect(planForApplicants(cohortPlanCap("accelerator_starter"))).toBe("accelerator_starter");
    expect(planForApplicants(cohortPlanCap("accelerator_starter") + 1)).toBe("accelerator_growth");
    expect(planForApplicants(500)).toBe("accelerator_growth");
  });
});

describe("buildCohortProposal", () => {
  it("prices the size the entry implies from plans-v2 — 40 startups → Cohort 100 at its annual price inc. GST, monthly alternative, trial days, seats and reports", () => {
    const p = buildCohortProposal(entry(), { now: NOW });
    expect(p.meta.planId).toBe("accelerator_growth");
    expect(p.cover.title).toBe(PROPOSAL_TITLE);
    expect(p.scope.name).toBe(`${growth.name} — annual plan`);
    expect(p.scope.applicantsCap).toBe(cohortPlanCap("accelerator_growth"));
    expect(p.scope.priceLabel).toBe(formatAud(growth.annual_aud));
    expect(p.scope.priceLongLabel).toBe(withGst(formatAud(growth.annual_aud)));
    expect(p.scope.monthlyLabel).toBe(formatAud(growth.monthly_aud));
    expect(p.scope.trialDays).toBe(growth.trial_days);
    expect(p.scope.seats).toBe((GENERATED_PLANS_BY_ID.accelerator_growth!.usage_limits as { seats: number }).seats);
    expect(p.scope.reportsPerMonth).toBe((GENERATED_PLANS_BY_ID.accelerator_growth!.usage_limits as { reports_per_month: number }).reports_per_month);
    expect(p.scope.includes).toEqual([...COHORT_INCLUDES]);
    expect(p.scope.lines.join(" ")).toContain("Sized for an intake of about 40");
    expect(p.scope.lines.join(" ")).toContain(`${growth.trial_days}-day free trial, card required`);
    expect(p.acceptance.text).toContain(withGst(formatAud(growth.annual_aud)));
    expect(p.acceptance.text).toContain(`${growth.name} (annual)`);
  });

  it("defaults to Cohort 25 when nothing implies a size; opts.applicants wins over the text; oversize points at Cohort Enterprise", () => {
    const p = buildCohortProposal(entry({ note: "", next_step: "", objection: "" }), { now: NOW });
    expect(p.meta.planId).toBe("accelerator_starter");
    expect(p.scope.applicantsCap).toBe(PROPOSAL_DEFAULT_APPLICANTS);
    expect(p.scope.priceLongLabel).toBe(withGst(formatAud(starter.annual_aud)));
    const forced = buildCohortProposal(entry(), { now: NOW, applicants: 10 });
    expect(forced.meta.planId).toBe("accelerator_starter");
    const over = buildCohortProposal(entry(), { now: NOW, applicants: 180 });
    expect(over.meta.planId).toBe("accelerator_growth");
    expect(over.scope.lines.join(" ")).toContain("larger than this rung tracks");
    expect(over.scope.lines.join(" ")).toContain("Cohort Enterprise");
  });

  it("quotes the objection and note verbatim, names the organisation and role, never a person", () => {
    const p = buildCohortProposal(entry(), { now: NOW });
    expect(p.problem.quote).toBe("Our reviewers spend two hours per application and still disagree.");
    expect(p.problem.note).toBe("Next intake is 40 startups in November; three reviewers.");
    expect(p.problem.lead).toContain("Harbour Accelerator (Program manager) on 2026-09-18");
    expect(p.cover.organisation).toBe("Harbour Accelerator");
    expect(p.cover.contactRole).toBe("Program manager");
    expect(buildCohortProposal(entry({ objection: "" }), { now: NOW }).problem.quote).toBeNull();
    const long = buildCohortProposal(entry({ note: "z".repeat(2000) }), { now: NOW });
    expect(long.problem.note!.length).toBe(PROPOSAL_NOTE_MAX_CHARS);
    expect(long.problem.note!.endsWith("…")).toBe(true);
  });

  it("the six stages are the catalogue's accelerator journey — three bullets each, never a bare key; the metrics are the Cohort offer's", () => {
    const p = buildCohortProposal(entry(), { now: NOW });
    expect(p.delivered.stages).toHaveLength(6);
    const cat = en as Record<string, string>;
    for (const key of PROPOSAL_CATALOGUE_KEYS) expect(typeof cat[key], key).toBe("string");
    p.delivered.stages.forEach((st, i) => {
      expect(st.headline).toBe(cat[`solutions.accelerator.journey.step${i + 1}.head`]);
      expect(st.bullets).toEqual([1, 2, 3].map((b) => cat[`solutions.accelerator.journey.step${i + 1}.b${b}`]));
      expect(st.bullets.join(" ")).not.toMatch(/solutions\.accelerator/);
    });
    expect(p.delivered.heading).toBe(cat["solutions.accelerator.journey.title"]);
    expect(p.metrics.items).toEqual([...COHORT_SUCCESS_METRICS]);
    expect(p.metrics.heading).toBe(cat["solutions.accelerator.cohort.metricsTitle"]);
  });

  it("data and consent are the approved sentences verbatim; the retention line cites the privacy policy", () => {
    const p = buildCohortProposal(entry(), { now: NOW });
    expect(p.data.principle).toBe(DATA_PRINCIPLE_SENTENCE);
    expect(p.data.consent).toBe(APPLICANT_CONSENT_TEXT);
    expect(p.data.retention).toMatch(/Privacy Policy § 4/);
  });

  it("the plans table: Cohort 25 / Cohort 100 annual from plans-v2 with caps and trial days — no credit rule, no window, no coupon", () => {
    const p = buildCohortProposal(entry(), { now: NOW });
    expect(p.plans.tiers.map((x) => x.id)).toEqual(["accelerator_starter", "accelerator_growth"]);
    expect(p.plans.tiers[0]).toMatchObject({ name: starter.name, annualLabel: formatAud(starter.annual_aud), monthlyLabel: formatAud(starter.monthly_aud), trialDays: starter.trial_days, cap: cohortPlanCap("accelerator_starter") });
    expect(p.plans.tiers[1]).toMatchObject({ name: growth.name, annualLabel: formatAud(growth.annual_aud), trialDays: growth.trial_days, cap: cohortPlanCap("accelerator_growth") });
    expect(p.plans.heading).toBe((en as Record<string, string>)["solutions.accelerator.plans.title"]);
    expect(JSON.stringify(p)).not.toMatch(/pilot|coupon|credit(ed)? against|60 days/i);
    expect("after" in p).toBe(false);
  });

  it("cover, timeline, acceptance and footer: entity from LEGAL_ENTITY, dates from `now`, the general-advice disclaimer", () => {
    const p = buildCohortProposal(entry(), { now: NOW });
    expect(p.cover.preparedBy).toBe(legalLine());
    expect(p.cover.dateLabel).toBe("21 September 2026");
    expect(p.cover.validUntilLabel).toBe("21 October 2026");
    expect(PROPOSAL_VALID_DAYS).toBe(30);
    expect(p.timeline.steps.map((x) => x.label)).toEqual(["Acceptance", "Trial", "Setup", "Intake", "Assessment", "Workshop", "Report"]);
    expect(p.timeline.steps[1]!.detail).toContain(`${growth.trial_days}-day free trial`);
    expect(p.timeline.accessLine).toContain("12 months from the first invoice");
    expect(p.timeline.accessLine).toContain("5 October 2026");
    expect(p.acceptance.fields).toEqual(["Name", "Role", "Organisation", "Date", "Signature"]);
    expect(p.acceptance.text).toContain(LEGAL_ENTITY.operator);
    expect(p.footer.entity).toContain(LEGAL_ENTITY.abn);
    expect(p.footer.disclaimer).toBe(PDF_GENERAL_ADVICE_DISCLAIMER);
    expect(p.meta.reference).toBe("CP-20260921-3F2A9C1E");
    expect(p.meta.generatedAt).toBe(NOW.toISOString());
  });

  it("is deterministic for the same entry + now, and the filename slugs the organisation with the date", () => {
    const a = buildCohortProposal(entry(), { now: NOW });
    const b = buildCohortProposal(entry(), { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.meta.filename).toBe("blockid-cohort-proposal-harbour-accelerator-2026-09-21.pdf");
    expect(proposalFilename("Ünïcode & Co. — Sydney", NOW)).toBe("blockid-cohort-proposal-n-code-co-sydney-2026-09-21.pdf");
    expect(proposalFilename("!!!", NOW)).toBe("blockid-cohort-proposal-organisation-2026-09-21.pdf");
  });

  it("never carries a literal amount outside the constants (the copy rule)", () => {
    const p = buildCohortProposal(entry(), { now: NOW });
    const text = JSON.stringify(p);
    // Every A$ figure in the document must be one plans-v2 produces for the accelerator segment.
    const allowed = new Set(PLANS_V2.filter((x) => x.segment === "accelerator").flatMap((x) => [withGst(formatAud(x.annual_aud)), formatAud(x.annual_aud), formatAud(x.monthly_aud)]));
    const hits = [...text.matchAll(/A\$[\d,]+(?: inc\. GST)?/g)];
    expect(hits.length).toBeGreaterThan(0);
    for (const m of hits) {
      const hit = [...allowed].some((a) => a.startsWith(m[0]) || m[0].startsWith(a));
      expect(hit, m[0]).toBe(true);
    }
  });
});
