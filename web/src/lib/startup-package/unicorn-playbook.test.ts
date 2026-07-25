import { describe, expect, it } from "vitest";

import { GROWTH_PHASE_IDS } from "../journey-map";
import {
  UNICORN_PLAYBOOK_TASKS,
  tasksForPhase,
  type UnicornPlaybookTask,
} from "./unicorn-playbook";

describe("UNICORN_PLAYBOOK_TASKS", () => {
  it("ships exactly 14 tasks", () => {
    expect(UNICORN_PLAYBOOK_TASKS.length).toBe(14);
  });

  it("every task has a non-empty title / why / deliverableSlug", () => {
    for (const t of UNICORN_PLAYBOOK_TASKS) {
      expect(t.title.trim().length, `title for ${t.id}`).toBeGreaterThan(0);
      expect(t.why.trim().length, `why for ${t.id}`).toBeGreaterThan(0);
      expect(
        t.deliverableSlug.trim().length,
        `deliverableSlug for ${t.id}`,
      ).toBeGreaterThan(0);
    }
  });

  it("every deliverableSlug is unique", () => {
    const slugs = UNICORN_PLAYBOOK_TASKS.map((t) => t.deliverableSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every id is unique", () => {
    const ids = UNICORN_PLAYBOOK_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every deliverableSlug is prefixed 'playbook_'", () => {
    for (const t of UNICORN_PLAYBOOK_TASKS) {
      expect(t.deliverableSlug.startsWith("playbook_")).toBe(true);
    }
  });

  it("every creditCost is between 0.5 and 1.5 inclusive", () => {
    for (const t of UNICORN_PLAYBOOK_TASKS) {
      expect(t.creditCost).toBeGreaterThanOrEqual(0.5);
      expect(t.creditCost).toBeLessThanOrEqual(1.5);
    }
  });

  it("every phase is a known GrowthPhaseId", () => {
    const known = new Set<string>(GROWTH_PHASE_IDS);
    for (const t of UNICORN_PLAYBOOK_TASKS) {
      expect(known.has(t.phase), `unknown phase for ${t.id}: ${t.phase}`).toBe(
        true,
      );
    }
  });

  it("every evidence row has company + year", () => {
    for (const t of UNICORN_PLAYBOOK_TASKS) {
      expect(t.evidence.company.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(t.evidence.year)).toBe(true);
      expect(t.evidence.year).toBeGreaterThan(1990);
    }
  });

  it("every optionalityLabel is one of the 3 allowed values", () => {
    const allowed = new Set(["recommended", "table-stakes", "differentiator"]);
    for (const t of UNICORN_PLAYBOOK_TASKS) {
      expect(allowed.has(t.optionalityLabel)).toBe(true);
    }
  });

  it("every type is one of the 4 allowed literals", () => {
    const allowed = new Set(["template", "guide", "checklist_row_set", "form"]);
    for (const t of UNICORN_PLAYBOOK_TASKS) {
      expect(allowed.has(t.type)).toBe(true);
    }
  });
});

describe("tasksForPhase", () => {
  it("returns rows only for the requested phase", () => {
    for (const phase of GROWTH_PHASE_IDS) {
      const rows = tasksForPhase(phase);
      expect(rows.every((r: UnicornPlaybookTask) => r.phase === phase)).toBe(
        true,
      );
    }
  });

  it("returns 2 tasks for customer_dev", () => {
    expect(tasksForPhase("customer_dev").length).toBe(2);
  });

  it("returns 2 tasks for team", () => {
    expect(tasksForPhase("team").length).toBe(2);
  });

  it("returns 3 tasks for growth", () => {
    expect(tasksForPhase("growth").length).toBe(3);
  });

  it("returns 4 tasks for funding", () => {
    expect(tasksForPhase("funding").length).toBe(4);
  });

  it("returns 1 task for legal_equity", () => {
    expect(tasksForPhase("legal_equity").length).toBe(1);
  });

  it("returns 1 task for product_dev", () => {
    expect(tasksForPhase("product_dev").length).toBe(1);
  });

  it("returns 1 task for pitch", () => {
    expect(tasksForPhase("pitch").length).toBe(1);
  });

  it("returns 0 tasks for phases without any (vision, revenue_model, mentor_review, go_to_market, investor_review)", () => {
    for (const phase of ["vision", "revenue_model", "mentor_review", "go_to_market", "investor_review"] as const) {
      expect(tasksForPhase(phase).length).toBe(0);
    }
  });

  it("all phases together sum to 14", () => {
    const total = GROWTH_PHASE_IDS.reduce(
      (n, phase) => n + tasksForPhase(phase).length,
      0,
    );
    expect(total).toBe(14);
  });
});
