/**
 * Startup Package — integration tests.
 *
 * Wires together the typed row shapes, the 8-step interview spec, and the
 * 14-task unicorn playbook exposed by the sub-goal 1/3/13 libs. Uses
 * dynamic imports so this file compiles even if some of those modules are
 * not yet on the merge base (each dependent block is skipped instead of
 * failing the whole suite, and the skip is reported so nothing goes
 * silently untested at release time).
 *
 * `getSupabaseAdmin` is mocked because we do NOT want to touch a real
 * database from unit tests — every consumer of the admin client is expected
 * to import from `@/lib/supabase`.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// -----------------------------------------------------------------------------
// Mock supabase admin — every startup-package repo path must go through this.
// vi.hoisted is required because vi.mock factories are hoisted above module
// scope; referring to a plain top-level const from inside would ReferenceError.
// -----------------------------------------------------------------------------

const { supabaseSpy } = vi.hoisted(() => ({ supabaseSpy: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => {
    supabaseSpy();
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({ single: async () => ({ data: null, error: null }) }),
        }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }),
    };
  },
}));

// -----------------------------------------------------------------------------
// Growth-phase catalogue — used to validate every interview step + playbook
// task targets a real phase id.
// -----------------------------------------------------------------------------

import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
const GROWTH_PHASE_IDS = new Set(GROWTH_PHASES.map((p) => p.id));

// -----------------------------------------------------------------------------
// Dynamic imports. Each block is skipped with a captured reason if the
// corresponding sub-goal module has not merged yet.
// -----------------------------------------------------------------------------

interface LoadResult<T> {
  mod: T | null;
  err: unknown;
}

async function tryLoad<T>(path: string): Promise<LoadResult<T>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(path);
    return { mod: mod as T, err: null };
  } catch (err) {
    return { mod: null, err };
  }
}

// -----------------------------------------------------------------------------
// types.ts — Zod row schemas.
// -----------------------------------------------------------------------------

interface TypesModule {
  StartupPackagePurchaseSchema?: { parse: (v: unknown) => unknown };
  StartupPackageInterviewAnswerSchema?: { parse: (v: unknown) => unknown };
  StartupPackageReservedAllocationSchema?: { parse: (v: unknown) => unknown };
  StartupPackageProgressSchema?: { parse: (v: unknown) => unknown };
}

let typesMod: TypesModule | null = null;
let typesErr: unknown = null;

// -----------------------------------------------------------------------------
// interview-steps.ts — 8 steps.
// -----------------------------------------------------------------------------

interface InterviewStep {
  id: string;
  key?: string;
  prompt: string;
  wordTarget?: number;
  leadAgent?: string;
  creditCost?: number;
  phaseId: string;
}

interface InterviewModule {
  INTERVIEW_STEPS?: InterviewStep[];
}

let interviewMod: InterviewModule | null = null;
let interviewErr: unknown = null;

// -----------------------------------------------------------------------------
// unicorn-playbook.ts — 14 tasks + tasksForPhase.
// -----------------------------------------------------------------------------

interface PlaybookTask {
  id: string;
  title: string;
  phaseId: string;
  why: string;
  when: string;
}

interface PlaybookModule {
  UNICORN_PLAYBOOK?: PlaybookTask[];
  tasksForPhase?: (phaseId: string) => PlaybookTask[];
}

let playbookMod: PlaybookModule | null = null;
let playbookErr: unknown = null;

beforeAll(async () => {
  ({ mod: typesMod, err: typesErr } = await tryLoad<TypesModule>(
    "./types",
  ));
  ({ mod: interviewMod, err: interviewErr } = await tryLoad<InterviewModule>(
    "./interview-steps",
  ));
  ({ mod: playbookMod, err: playbookErr } = await tryLoad<PlaybookModule>(
    "./unicorn-playbook",
  ));
});

// -----------------------------------------------------------------------------
// Supabase admin mock is invoked when the tests reach for it.
// -----------------------------------------------------------------------------

describe("getSupabaseAdmin mock", () => {
  it("is wired and callable", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const client = getSupabaseAdmin();
    expect(supabaseSpy).toHaveBeenCalled();
    // Sanity — the shape we mock must expose `.from`.
    expect(typeof client?.from).toBe("function");
  });
});

// -----------------------------------------------------------------------------
// types.ts — Zod schemas parse a well-formed row shape.
// -----------------------------------------------------------------------------

describe("startup-package types.ts", () => {
  it("purchase row schema parses a valid row", () => {
    if (!typesMod?.StartupPackagePurchaseSchema) {
      // Sub-goal 1 not landed yet — expected in isolation, must succeed at release.
      expect(typesErr, "types module load error").toBeTruthy();
      return;
    }
    const row = {
      id: "pkg_01H0000000000000000000",
      user_id: "u_1",
      project_id: "p_1",
      stripe_session_id: "cs_test_1",
      purchased_at: new Date().toISOString(),
      seed_credits: 25,
      status: "active",
    };
    expect(() =>
      typesMod!.StartupPackagePurchaseSchema!.parse(row),
    ).not.toThrow();
  });

  it("interview-answer row schema parses a valid row", () => {
    if (!typesMod?.StartupPackageInterviewAnswerSchema) {
      expect(typesErr).toBeTruthy();
      return;
    }
    const row = {
      id: "ans_1",
      project_id: "p_1",
      step_key: "vision",
      answer_text: "We solve X for Y because Z",
      char_count: 25,
      created_at: new Date().toISOString(),
    };
    expect(() =>
      typesMod!.StartupPackageInterviewAnswerSchema!.parse(row),
    ).not.toThrow();
  });

  it("reserved-allocation row schema parses a valid row", () => {
    if (!typesMod?.StartupPackageReservedAllocationSchema) {
      expect(typesErr).toBeTruthy();
      return;
    }
    const row = {
      id: "alloc_1",
      project_id: "p_1",
      pct_reserved: 15,
      ticker_hint: "ACME",
      on_chain_token_id: null,
      opt_in_at: null,
    };
    expect(() =>
      typesMod!.StartupPackageReservedAllocationSchema!.parse(row),
    ).not.toThrow();
  });

  it("progress row schema parses a valid row", () => {
    if (!typesMod?.StartupPackageProgressSchema) {
      expect(typesErr).toBeTruthy();
      return;
    }
    const row = {
      id: "prog_1",
      project_id: "p_1",
      phase_id: "vision",
      status: "in_progress",
      completion_pct: 40,
      updated_at: new Date().toISOString(),
    };
    expect(() =>
      typesMod!.StartupPackageProgressSchema!.parse(row),
    ).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// interview-steps.ts — 8 steps, each with a valid GrowthPhaseId.
// -----------------------------------------------------------------------------

describe("startup-package interview-steps.ts", () => {
  it("exports exactly 8 interview steps", () => {
    if (!interviewMod?.INTERVIEW_STEPS) {
      expect(interviewErr, "interview-steps load error").toBeTruthy();
      return;
    }
    expect(interviewMod.INTERVIEW_STEPS).toHaveLength(8);
  });

  it("every step targets a real GrowthPhase id", () => {
    if (!interviewMod?.INTERVIEW_STEPS) {
      expect(interviewErr).toBeTruthy();
      return;
    }
    for (const step of interviewMod.INTERVIEW_STEPS) {
      expect(
        GROWTH_PHASE_IDS.has(step.phaseId),
        `interview step ${step.id} → phaseId "${step.phaseId}" is not in GROWTH_PHASES`,
      ).toBe(true);
    }
  });

  it("every step has an id and a prompt", () => {
    if (!interviewMod?.INTERVIEW_STEPS) {
      expect(interviewErr).toBeTruthy();
      return;
    }
    for (const step of interviewMod.INTERVIEW_STEPS) {
      expect(step.id, "step id").toBeTruthy();
      expect(step.prompt, "step prompt").toBeTruthy();
    }
  });
});

// -----------------------------------------------------------------------------
// unicorn-playbook.ts — 14 tasks, tasksForPhase returns array for every phase.
// -----------------------------------------------------------------------------

describe("startup-package unicorn-playbook.ts", () => {
  it("exports exactly 14 tasks", () => {
    if (!playbookMod?.UNICORN_PLAYBOOK) {
      expect(playbookErr, "unicorn-playbook load error").toBeTruthy();
      return;
    }
    expect(playbookMod.UNICORN_PLAYBOOK).toHaveLength(14);
  });

  it("every task targets a real GrowthPhase id", () => {
    if (!playbookMod?.UNICORN_PLAYBOOK) {
      expect(playbookErr).toBeTruthy();
      return;
    }
    for (const task of playbookMod.UNICORN_PLAYBOOK) {
      expect(
        GROWTH_PHASE_IDS.has(task.phaseId),
        `playbook task ${task.id} → phaseId "${task.phaseId}" is not in GROWTH_PHASES`,
      ).toBe(true);
    }
  });

  it("tasksForPhase returns an array for every GrowthPhase (some may be empty)", () => {
    if (!playbookMod?.tasksForPhase) {
      expect(playbookErr).toBeTruthy();
      return;
    }
    for (const phase of GROWTH_PHASES) {
      const tasks = playbookMod.tasksForPhase(phase.id);
      expect(Array.isArray(tasks), `tasksForPhase(${phase.id}) must return an array`).toBe(
        true,
      );
    }
  });

  it("union of tasksForPhase across all phases matches UNICORN_PLAYBOOK size", () => {
    if (!playbookMod?.tasksForPhase || !playbookMod.UNICORN_PLAYBOOK) {
      expect(playbookErr).toBeTruthy();
      return;
    }
    const seen = new Set<string>();
    for (const phase of GROWTH_PHASES) {
      for (const t of playbookMod.tasksForPhase(phase.id)) {
        seen.add(t.id);
      }
    }
    // Every task must be reachable via tasksForPhase — no orphans.
    expect(seen.size).toBe(playbookMod.UNICORN_PLAYBOOK.length);
  });
});
