// Render tests for the assessment surfaces (G13-W4-D2, S-D2). SSR markup
// only (renderToStaticMarkup); effects (autosave, fetch) are not exercised
// here — the pure helpers behind them are pinned in assessment-shared.test.ts.
// Pins:
//   * form: 8 dimension rows with AI score vs "me" select + stance + note,
//     every control has a label (sr-only or visible), the 13-criteria strip,
//     risks / questions lists with AI badge, valuation view, private vs
//     shared notes, sticky footer (conviction radiogroup · thesis fit ·
//     decision segmented control · Save draft · Submit · Share);
//   * empty state seeds from the prefill and shows the hint; a submitted row
//     shows the v(n+1) note and relabels the buttons;
//   * founder preview renders only the ticked sections and never a
//     forbidden field; unshared → the "private" line;
//   * share dialog: 4 checkboxes, the literal heading "The founder will see
//     exactly these items", the ticked sections' current content, and the
//     never-shared list.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EvaluationAssessment } from "@/lib/evaluations/assessments";
import type { DossierCriterionRow, DossierDimRow } from "@/lib/evaluations/dossier";
import { AssessmentForm } from "./assessment-form";
import { FounderPreview } from "./founder-preview";
import { ShareDialog } from "./share-dialog";
import { SHARE_PREVIEW_HEADING, emptyFormValues } from "./assessment-shared";

const noop = () => undefined;
const DIMS: DossierDimRow[] = (["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"] as const).map((d, i) => ({
  dim: d,
  code: d.toUpperCase(),
  title: d,
  weight: 10,
  score: 40 + i * 5,
  band: "amber" as never,
  delta30d: i === 0 ? 11 : null,
  p50: 50,
  percentile: null,
  ownerAgent: "CRO",
}));
const CRITERIA: DossierCriterionRow[] = [{ key: "idea", title: "Idea & Innovation", primaryDimension: "MPC", score: 74, verdict: "v", evidenceCount: 0, strongestSource: "self_declared", ownerAgent: "CPO" }];

const ROW: EvaluationAssessment = {
  id: "a-1",
  evaluationId: "e-1",
  projectId: "p-1",
  assessorUserId: "u-eval",
  orgId: null,
  snapshotId: "s-1",
  version: 1,
  status: "submitted",
  decision: "track",
  conviction: 3,
  thesisFitPct: 72,
  dimensionRatings: { TRE: { rating: 4, stance: "agree", note: "solid MRR" }, MPC: { rating: 2, stance: "disagree" } },
  criterionRatings: { idea: { stance: "agree" } },
  valuationView: { low_aud: 2_000_000, high_aud: 4_000_000, method_note: "comps" },
  risks: [{ title: "Single founder", severity: "high", dimension: "FTV", source: "ai" }],
  questionsForFounder: [{ text: "Runway?", dimension: "TRE", sent_at: null }],
  privateNotes: "SECRET-NOTE",
  sharedNotes: "we like the wedge",
  sharedFields: [],
  sharedWithFounderAt: null,
  submittedAt: "2026-09-12T00:00:00Z",
  createdAt: "2026-09-11T00:00:00Z",
  updatedAt: "2026-09-12T00:00:00Z",
};
const HISTORY = [{ id: "a-1", version: 1, status: "submitted" as const, decision: "track" as const, conviction: 3, snapshotId: "s-1", submittedAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z" }];

function form(over: Partial<React.ComponentProps<typeof AssessmentForm>> = {}) {
  return renderToStaticMarkup(
    <AssessmentForm evaluationId="e-1" initial={ROW} history={HISTORY} prefill={null} snapshotId="s-1" aiDims={DIMS} criteria={CRITERIA} founderClaimed {...over} />,
  );
}

describe("AssessmentForm", () => {
  it("renders the AI-vs-me table (8 rows, labelled controls), criteria strip, risks, questions, valuation, notes and the footer", () => {
    const out = form();
    expect(out).toMatch(/data-testid="assessment-form"[^>]*data-status="submitted"[^>]*data-version="1"/);
    for (const k of ["FTV", "MPC", "PTD", "TRE", "CGH", "IRI", "LCO", "SVM"]) {
      expect(out).toContain(`id="dim-${k}-rating"`);
      expect(out).toContain(`for="dim-${k}-rating"`);
      expect(out).toContain(`id="dim-${k}-stance"`);
      expect(out).toContain(`id="dim-${k}-note"`);
    }
    expect(out).toMatch(/data-testid="ai-score-TRE"[^>]*>40\/100/);
    expect(out).toContain("+11"); // Δ30d on TRE
    expect(out).toMatch(/id="dim-TRE-rating"[^>]*>[\s\S]*?<option value="4" selected/);
    expect(out).toContain('value="solid MRR"');
    expect(out).toContain('id="crit-idea"');
    expect(out).toContain('id="risk-0-title"');
    expect(out).toContain('value="Single founder"');
    expect(out).toContain("suggested by AI");
    expect(out).toContain('aria-label="Remove risk 1"');
    expect(out).toContain('id="q-0-text"');
    expect(out).toContain('value="Runway?"');
    expect(out).toContain('id="val-low"');
    expect(out).toContain('for="private-notes"');
    expect(out).toContain("SECRET-NOTE");
    expect(out).toContain('for="shared-notes"');
    expect(out).toContain("we like the wedge");
    // footer
    expect(out).toContain('aria-label="Conviction 1 to 5"');
    expect(out).toMatch(/aria-label="Conviction 3 of 5"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Conviction 3 of 5"/);
    expect(out).toContain('id="thesis-fit"');
    expect(out).toContain('value="72"');
    expect(out).toMatch(/data-testid="decision-track"|aria-checked="true"[^>]*data-testid="decision-track"/);
    expect(out).toContain("Save as v2 draft");
    expect(out).toContain("Submit v2");
    expect(out).toContain('data-testid="assessment-share-open"');
    expect(out).toContain('data-testid="assessment-new-version-note"');
    expect(out).toContain("History — 1 version");
  });

  it("G14-S37: four FTV flag checkboxes render under the FTV row only, disabled until FTV is rated, checked from the stored flags", () => {
    const out = form();
    expect(out).toContain('data-testid="ftv-flags"');
    for (const k of ["key_person_risk", "full_time", "complementary_skills", "references_checked"]) {
      expect(out).toContain(`id="dim-FTV-flag-${k}"`);
      expect(out).not.toContain(`id="dim-TRE-flag-${k}"`);
    }
    // FTV is not rated on ROW → the boxes are disabled and unchecked.
    expect(out).toMatch(/id="dim-FTV-flag-references_checked"[^>]*disabled/);
    expect(out).not.toMatch(/id="dim-FTV-flag-references_checked"[^>]*checked=""/);
    const rated = form({ initial: { ...ROW, dimensionRatings: { ...ROW.dimensionRatings, FTV: { rating: 4, stance: "agree", flags: { references_checked: true } } } } });
    expect(rated).toMatch(/id="dim-FTV-flag-references_checked"[^>]*checked=""/);
    expect(rated).not.toMatch(/id="dim-FTV-flag-references_checked"[^>]*disabled/);
    expect(rated).not.toMatch(/id="dim-FTV-flag-full_time"[^>]*checked=""/);
  });

  it("G14-S34 opt-out: hidden while 0406 is missing (null); a checkbox in the footer once the flag is known, checked when opted out", () => {
    expect(form()).not.toContain("assessment-feedback-opt-out");
    expect(form({ feedbackOptOut: null })).not.toContain("assessment-feedback-opt-out");
    const off = form({ feedbackOptOut: false });
    expect(off).toContain('data-testid="assessment-feedback-opt-out"');
    expect(off).toContain("Exclude my ratings from the founder&#x27;s anonymised feedback letter");
    expect(off).toContain("at least 3 evaluators from 2 organisations");
    expect(off).not.toMatch(/data-testid="assessment-feedback-opt-out"[\s\S]*?<input[^>]*checked/);
    const on = form({ feedbackOptOut: true });
    expect(on).toMatch(/data-testid="assessment-feedback-opt-out"[\s\S]*?<input[^>]*checked/);
    // the control sits inside the sticky footer
    expect(on.indexOf('data-testid="assessment-footer"')).toBeLessThan(on.indexOf('data-testid="assessment-feedback-opt-out"'));
  });

  it("empty state seeds from the prefill and shows the hint; share is disabled until the founder claims", () => {
    const out = form({
      initial: null,
      history: [],
      founderClaimed: false,
      prefill: { snapshotId: "s-1", thesisFitPct: 64, mandateName: "Seed AU", dimensionRatings: { TRE: { rating: 3, stance: "unsure" } }, risks: [{ title: "Mandate gap", severity: "medium", source: "ai" }], questionsForFounder: [{ text: "Q?", sent_at: null }], seeded: true },
    });
    expect(out).toMatch(/data-testid="assessment-form"[^>]*data-status="new"/);
    expect(out).toContain('data-testid="assessment-prefill-hint"');
    expect(out).toContain("Seed AU");
    expect(out).toContain("thesis fit 64%");
    expect(out).toContain('value="64"');
    expect(out).toContain('value="Mandate gap"');
    expect(out).toContain("Save draft");
    expect(out).toContain("Submit assessment");
    expect(out).toMatch(/data-testid="assessment-share-open"[^>]*disabled|disabled[^>]*data-testid="assessment-share-open"/);
    expect(out).toContain("Sharing unlocks once the founder claims the evaluation.");
    expect(out).not.toContain("assessment-history");
  });
});

describe("FounderPreview", () => {
  it("unshared → the private line; shared → only the ticked sections, never decision / conviction / private notes", () => {
    expect(renderToStaticMarkup(<FounderPreview shared={null} />)).toContain('data-testid="assessment-private"');
    const out = renderToStaticMarkup(
      <FounderPreview
        shared={{ id: "a-1", evaluationId: "e-1", version: 2, sharedWithFounderAt: "2026-09-13T00:00:00Z", sharedFields: ["risks", "questions_for_founder"], risks: ROW.risks, questionsForFounder: ROW.questionsForFounder }}
      />,
    );
    expect(out).toContain('data-testid="assessment-shared-preview"');
    expect(out).toContain("2 sections (v2)");
    expect(out).toContain('data-testid="fp-risks"');
    expect(out).toContain("Single founder");
    expect(out).toContain('data-testid="fp-questions"');
    expect(out).toContain("Runway?");
    expect(out).not.toContain('data-testid="fp-dimension-ratings"');
    expect(out).not.toContain('data-testid="fp-shared-notes"');
    for (const needle of ["SECRET-NOTE", "we like the wedge", "Track", "conviction 3", "72"]) expect(out).not.toContain(needle);
  });
});

describe("ShareDialog", () => {
  const values = { ...emptyFormValues("s-1"), dimension_ratings: ROW.dimensionRatings, risks: ROW.risks, questions_for_founder: ROW.questionsForFounder, shared_notes: "line one\nline two", private_notes: "SECRET-NOTE", decision: "proceed" as const, conviction: 5 };

  it("lists the 4 allow-listed checkboxes, the literal preview heading and the ticked sections' current content; never the private values", () => {
    const out = renderToStaticMarkup(
      <ShareDialog evaluationId="e-1" values={values} initialFields={["dimension_ratings", "shared_notes"]} shared onClose={noop} onShared={noop} onRevoked={noop} />,
    );
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    for (const f of ["dimension_ratings", "risks", "questions_for_founder", "shared_notes"]) expect(out).toContain(`data-testid="share-tick-${f}"`);
    expect((out.match(/type="checkbox"/g) ?? []).length).toBe(4);
    expect(out).toContain(SHARE_PREVIEW_HEADING);
    expect(out).toContain("The founder will see exactly these items");
    expect(out).toContain('data-testid="share-preview-dimension_ratings"');
    expect(out).toContain("Traction &amp; revenue: 4/5 · Agree — solid MRR");
    expect(out).toContain("Market &amp; positioning: 2/5 · Disagree");
    expect(out).toContain('data-testid="share-preview-shared_notes"');
    expect(out).toContain("<li>line one</li><li>line two</li>");
    expect(out).not.toContain('data-testid="share-preview-risks"'); // not ticked
    expect(out).not.toContain("Single founder");
    expect(out).toContain("Never shared, whatever you tick: decision · conviction · thesis fit % · valuation view · private notes · criterion ratings.");
    expect(out).not.toContain("SECRET-NOTE");
    expect(out).not.toContain("proceed");
    expect(out).toContain('data-testid="share-revoke"');
    expect(out).toContain("Update what is shared");
  });

  it("nothing ticked → says the founder will see nothing and disables confirm; not yet shared → no revoke", () => {
    const out = renderToStaticMarkup(<ShareDialog evaluationId="e-1" values={values} initialFields={[]} shared={false} onClose={noop} onShared={noop} onRevoked={noop} />);
    expect(out).toContain("Nothing ticked — the founder will see nothing.");
    expect(out).toMatch(/data-testid="share-confirm"[^>]*disabled|disabled[^>]*data-testid="share-confirm"/);
    expect(out).not.toContain('data-testid="share-revoke"');
    expect(out).toContain("Share these sections");
  });
});
