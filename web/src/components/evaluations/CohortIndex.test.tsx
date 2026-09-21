// CohortIndex (G21 P2-A · G22-A A.2) — static render. Pins: the role chip
// per cohort row (Owner / Reviewer / Viewer from the caller's seat) with
// data-role, absent when a row carries no role; the empty state; the
// "Cohorts — Program plan" link when the seat cannot create.

import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));

import { CohortIndex, ROLE_CHIP } from "./CohortIndex";
import { BATCH_ROLES, equalWeights, type EvaluationBatch } from "@/lib/evaluations/batch-shared";

function batch(over: Partial<EvaluationBatch> = {}): EvaluationBatch {
  return {
    id: "b-1",
    userId: "u-1",
    name: "Round 1",
    rubricWeights: equalWeights(),
    status: "done",
    total: 3,
    doneCount: 3,
    failedCount: 0,
    createdAt: "2026-09-20T00:00:00Z",
    startedAt: null,
    finishedAt: null,
    programName: "AI Fellowship",
    intakeId: null,
    templateId: null,
    weightsVersion: 1,
    applicantsCap: null,
    pilotOrderId: null,
    ...over,
  };
}

describe("CohortIndex — role chips (G22-A)", () => {
  it("renders Owner / Reviewer / Viewer chips from each row's role, and none when the role is absent", () => {
    const out = renderToStaticMarkup(
      <CohortIndex
        batches={[
          { ...batch(), role: "owner" },
          { ...batch({ id: "b-2", name: "Invited round", userId: "u-9" }), role: "reviewer" },
          { ...batch({ id: "b-3", name: "Watch only", userId: "u-9" }), role: "viewer" },
          batch({ id: "b-4", name: "Legacy shape" }),
        ]}
        templates={[]}
        canCreate
      />,
    );
    expect(out.match(/data-testid="cohort-row"/g)?.length).toBe(4);
    expect(out.match(/data-testid="cohort-role-chip"/g)?.length).toBe(3);
    expect(out).toContain('data-role="owner"');
    expect(out).toContain('data-role="reviewer"');
    expect(out).toContain('data-role="viewer"');
    expect(out).toContain(">Owner<");
    expect(out).toContain(">Reviewer<");
    expect(out).toContain(">Viewer<");
    for (const r of BATCH_ROLES) expect(ROLE_CHIP[r]).toMatch(/border-/);
  });

  it("empty state without cohorts; the Program-plan link when the seat cannot create", () => {
    const empty = renderToStaticMarkup(<CohortIndex batches={[]} templates={[]} canCreate={false} />);
    expect(empty).toContain('data-testid="cohort-empty"');
    expect(empty).toContain("Cohorts — Program plan");
    expect(empty).not.toContain('data-testid="cohort-new"');
    // G26-W2 P3: one primary per view — the empty-state "Import CSV" and the
    // header "New cohort" are outline buttons; only the form's "Create cohort"
    // submit carries the navy fill.
    const creatable = renderToStaticMarkup(<CohortIndex batches={[]} templates={[]} canCreate pilotCap={null} />);
    expect(creatable).toMatch(/data-testid="cohort-empty-import/);
    expect(creatable).not.toMatch(/class="[^"]*bg-action[^"]*"[^>]*data-testid="cohort-empty-import/);
    expect(creatable).not.toMatch(/class="[^"]*bg-action[^"]*"[^>]*data-testid="cohort-new/);
    // The form opens by default on the empty state, so exactly one navy fill is on screen: its "Create cohort" submit.
    expect((creatable.match(/(?<![-\w:])bg-action(?![-\w])/g) ?? []).length).toBe(1);
    expect(creatable).toMatch(/class="[^"]*bg-action[^"]*"[^>]*data-testid="cohort-create"/);
  });
});
