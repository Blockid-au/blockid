// Colocated tests for lib/funding/workspace (T0244): the pure prefill
// mappers, the prefill loader against a mocked Supabase (projects +
// project_grant_profiles + latest svi_snapshots, SVI stage wins), the
// latest-report fallback, the event / capital-map filters and the static
// Capital map + alert-kind copy.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  profile: null as null | Record<string, unknown>,
  account: null as null | { id: string },
  snapshot: null as null | { stage: number },
  reports: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ table: string; filters: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        is: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          db.calls.push({ table, filters });
          if (table === "project_grant_profiles") return { data: db.profile, error: null };
          if (table === "svi_accounts") return { data: db.account, error: null };
          if (table === "svi_snapshots") return { data: db.snapshot, error: null };
          if (table === "funding_reports") {
            const hit = db.reports.find((r) => !("project_id" in filters) || r.project_id === filters.project_id) ?? null;
            return { data: hit, error: null };
          }
          return { data: null, error: null };
        },
      };
      return q;
    },
  }),
}));

const programs = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("./data", () => ({
  listPrograms: async (opts: { capital?: string | null }) => programs.filter((p) => !opts?.capital || p.capital === opts.capital),
}));

import {
  CAPITAL_MAP_SECTIONS,
  MONEY_RADAR_ALERT_KINDS,
  industryTagsFor,
  intakePrefillFor,
  latestFundingReportForUser,
  listCapitalMapRows,
  listEventPrograms,
  stageFromNumeric,
} from "./workspace";

const PROJECT = {
  id: "proj-1", userId: "u-1", name: "Acme Agtech", slug: "acme", description: "Soil sensors for grain farmers", industry: "AgTech / Food",
  stage: 1, isDefault: true, archivedAt: null, createdAt: "", updatedAt: "", growth_phase_current: null,
};

beforeEach(() => {
  db.profile = null;
  db.account = null;
  db.snapshot = null;
  db.reports = [];
  db.calls = [];
  programs.length = 0;
});

describe("pure mappers", () => {
  it("maps numeric stages onto the intake vocabulary", () => {
    expect(stageFromNumeric(0)).toBe("idea");
    expect(stageFromNumeric(1)).toBe("pre_revenue_prototype");
    expect(stageFromNumeric(2)).toBe("mvp");
    expect(stageFromNumeric(3)).toBe("early_revenue");
    expect(stageFromNumeric(6)).toBe("scaling");
    expect(stageFromNumeric(null)).toBeNull();
  });

  it("maps free-text industries onto §5d tags (exact label, keyword, none)", () => {
    expect(industryTagsFor("Fintech")).toEqual(["fintech"]);
    expect(industryTagsFor("AgTech / Food")).toEqual(["agtech_food"]);
    expect(industryTagsFor("B2B SaaS with an AI copilot")).toEqual(["software_saas", "ai_ml"]);
    expect(industryTagsFor("")).toEqual([]);
    expect(industryTagsFor("Underwater basket weaving")).toEqual([]);
  });
});

describe("intakePrefillFor", () => {
  it("returns an empty prefill without a project", async () => {
    expect(await intakePrefillFor({ id: "u-1", email: "f@acme.io" }, null)).toEqual({});
  });

  it("merges project fields, the saved grant profile and the latest SVI stage (SVI wins)", async () => {
    db.profile = {
      state: "NSW", city: "Sydney", turnover_aud: 120000, rd_spend_aud: 40000, headcount: 3, incorporated_at: "2024-03-01",
      founder_demographics: ["women_led", "regional"], export_intent: true,
    };
    db.account = { id: "acc-1" };
    db.snapshot = { stage: 3 };
    const p = await intakePrefillFor({ id: "u-1", email: "f@acme.io" }, PROJECT);
    expect(p).toEqual({
      description: "Acme Agtech — Soil sensors for grain farmers",
      industry_tags: ["agtech_food"],
      stage: "early_revenue",
      state: "NSW",
      turnover_aud: "120000",
      rd_spend_aud: "40000",
      headcount: "3",
      incorporated_year: "2024",
      export_intent: true,
      toggles: { women_led: true, indigenous_owned: false, regional: true, under_30: false },
    });
    // SVI account is scoped to (email, project).
    expect(db.calls.find((c) => c.table === "svi_accounts")?.filters).toEqual({ email: "f@acme.io", project_id: "proj-1" });
  });

  it("falls back to projects.stage when there is no snapshot, and skips a profile with no state", async () => {
    const p = await intakePrefillFor({ id: "u-1", email: "f@acme.io" }, PROJECT);
    expect(p.stage).toBe("pre_revenue_prototype");
    expect(p.state).toBeUndefined();
    expect(p.toggles).toBeUndefined();
  });
});

describe("latestFundingReportForUser", () => {
  it("prefers the project's report and falls back to the user's newest ready report", async () => {
    db.reports = [{ id: "r-old", project_id: null, status: "ready" }];
    expect((await latestFundingReportForUser("u-1", "proj-1"))?.id).toBe("r-old");
    db.reports = [{ id: "r-proj", project_id: "proj-1", status: "ready" }, { id: "r-old", project_id: null, status: "ready" }];
    expect((await latestFundingReportForUser("u-1", "proj-1"))?.id).toBe("r-proj");
    expect(await latestFundingReportForUser("", null)).toBeNull();
  });
});

describe("events + capital map", () => {
  it("filters events by capital and buckets capital-map rows by type", async () => {
    programs.push(
      { id: "e1", program_type: "event", capital: "Sydney" },
      { id: "e2", program_type: "event", capital: "Perth" },
      { id: "a1", program_type: "angel_group", capital: "Sydney" },
      { id: "v1", program_type: "vc", capital: "Melbourne" },
      { id: "l1", program_type: "rd_advance_loan", capital: "Remote" },
      { id: "x1", program_type: "accelerator", capital: "Sydney" },
    );
    expect((await listEventPrograms("Sydney")).map((e) => e.id)).toEqual(["e1"]);
    expect((await listEventPrograms(null)).map((e) => e.id)).toEqual(["e1", "e2"]);
    const map = await listCapitalMapRows();
    expect(map.angel_group.map((r) => r.id)).toEqual(["a1"]);
    expect(map.vc.map((r) => r.id)).toEqual(["v1"]);
    expect(map.rd_advance_loan.map((r) => r.id)).toEqual(["l1"]);
    expect(map.advisory).toEqual([]);
  });

  it("ships the six capital-map sections with /insights links and seven alert kinds", () => {
    expect(CAPITAL_MAP_SECTIONS.map((s) => s.type)).toEqual(["angel_group", "vc", "rd_advance_loan", "rbf", "export_loan", "advisory"]);
    for (const s of CAPITAL_MAP_SECTIONS) expect(s.article.href).toMatch(/^\/insights\//);
    expect(MONEY_RADAR_ALERT_KINDS.map((k) => k.kind)).toEqual([
      "deadline_30d", "deadline_14d", "deadline_3d", "new_match", "status_change", "rdti_registration", "weekly_digest",
    ]);
  });
});
