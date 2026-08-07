// Colocated vitest for GET /api/admin/goals — P9 ship-readiness regression
// gate for the admin CEO/agent dashboard endpoint cited in
// docs/plans/atlassian-standard-mapping-goal.md (§P9_ship: "regression tests
// for legal + walkthrough + ship surfaces").
//
// The route feeds the CEO Goal Tree dashboard that admin@blockid.au opens
// every morning to see whether each C-Level agent shipped a report yesterday,
// how many research entries they've accumulated, and which cron endpoints are
// wobbling. A silent regression here is admin-visible immediately, but the
// specific failure modes are what the tests pin:
//   * losing the admin gate exposes agent research counts + report content
//     (including in-progress mitigation notes the admin agents write) to any
//     signed-in user
//   * losing the 3-day walkback shows every agent as NO_REPORT for 24h after
//     the report cron runs (23:45 UTC) because the morning dashboard loads
//     before today's file is written
//   * losing the daily-over-weekly preference means a Friday admin session
//     serves a stale Sunday weekly digest instead of Thursday's daily
//   * losing the CEO filter double-counts CEO_GOAL_TREE in the agents[] list
//     (once as itself, once in the CEO card) and inflates KPI dashboards
//   * losing the supabase null-safe branch 500s the whole dashboard the
//     moment the service-role env goes missing instead of degrading to
//     zeroed platform KPIs
//   * losing the cron-health try/catch means a corrupt jsonl line takes down
//     the dashboard for every admin until an ops runbook truncates the file
//   * losing the JSON.parse per-line try/catch means one bad log line 500s
//     the dashboard rather than skipping the malformed row
//   * losing the reverse() means the cron-health list shows oldest-first and
//     the admin's "what just broke" glance is inverted

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── fs fake — in-memory read for the report + cron-health lookups ──────────
// The route builds absolute paths under REPORTS_DIR
// (/home/dovanlong/blockid.au/web/content/reports) with path.join. We honour
// those absolute paths in the store so tests read the exact key the route
// writes, catching a REPORTS_DIR drift.

const fsStore = new Map<string, string>();

vi.mock("fs", () => ({
  existsSync: (p: string) => fsStore.has(p),
  readFileSync: (p: string) => {
    const v = fsStore.get(p);
    if (v == null) {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return v;
  },
}));

// ── auth + supabase mocks ──────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

// ── goal-tree fixture — small deterministic tree; the route filters ceo out
//   and iterates the rest, so a 3-agent fixture exercises the loop without
//   pulling in the real 200-line CEO_GOAL_TREE. ────────────────────────────

vi.mock("@/lib/agent-goals/goal-tree", () => {
  const kpis = [
    { metric: "m1", label: "M1", target: 100, unit: "n" },
  ];
  const ceo = {
    id: "ceo-master",
    agent: "ceo",
    title: "CEO Title",
    mission: "Ship SCN",
    kpis,
    criteriaOwned: [],
    reportSections: ["executive"],
    skills: [],
    researchTopics: ["scn"],
    researchFrequency: "weekly-sun",
    subGoals: [],
  };
  const CFO = {
    id: "cfo-goal",
    agent: "CFO",
    title: "CFO Title",
    mission: "Ship revenue",
    kpis,
    criteriaOwned: ["MPC"],
    reportSections: ["board_memo"],
    skills: [],
    researchTopics: ["stripe metrics"],
    researchFrequency: "daily",
    subGoals: [],
  };
  const CTO = {
    id: "cto-goal",
    agent: "CTO",
    title: "CTO Title",
    mission: "Ship platform",
    kpis,
    criteriaOwned: ["PTD"],
    reportSections: ["executive"],
    skills: [],
    researchTopics: ["nextjs"],
    researchFrequency: "daily",
    subGoals: [],
  };
  const CMO = {
    id: "cmo-goal",
    agent: "CMO",
    title: "CMO Title",
    mission: "Ship traffic",
    kpis,
    criteriaOwned: [],
    reportSections: ["executive"],
    skills: [],
    researchTopics: ["seo"],
    researchFrequency: "weekly-mon",
    subGoals: [],
  };
  return {
    CEO_GOAL_TREE: ceo,
    getAllAgentGoals: () => [ceo, CFO, CTO, CMO],
  };
});

import { GET } from "./route";

const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";

const ADMIN = { id: "admin-1", email: "admin@blockid.au", role: "admin" };
const ADMIN_BY_ROLE = { id: "u-role", email: "other@example.com", role: "admin" };
const REGULAR = { id: "u-2", email: "user@example.com", role: "user" };

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

function req() {
  return new Request("http://x/api/admin/goals");
}

// Build a Supabase double that supports:
//   from(table).select(cols, {count, head}) → {count} for the 3 KPI tables
//   from("agent_knowledge_base").select("id", {count, head}).eq(...) → {count}
//   from("agent_knowledge_base").select("updated_at").eq().order().limit().maybeSingle() → {data}
function makeSb(opts?: {
  usersCount?: number;
  analysesCount?: number;
  accountsCount?: number;
  researchCountByAgent?: Record<string, number>;
  lastResearchByAgent?: Record<string, string | null>;
}) {
  const usersCount = opts?.usersCount ?? 0;
  const analysesCount = opts?.analysesCount ?? 0;
  const accountsCount = opts?.accountsCount ?? 0;
  const researchByAgent = opts?.researchCountByAgent ?? {};
  const lastByAgent = opts?.lastResearchByAgent ?? {};

  return {
    from: vi.fn((table: string) => {
      if (table === "app_users") return { select: () => ({ count: usersCount, error: null }) };
      if (table === "svi_analyses") return { select: () => ({ count: analysesCount, error: null }) };
      if (table === "svi_accounts") return { select: () => ({ count: accountsCount, error: null }) };
      if (table === "agent_knowledge_base") {
        // Two chain shapes used sequentially per agent iteration.
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              // count-mode: .select("id", {count, head}).eq(agent, key) → {count}
              return {
                eq: (_col: string, key: string) => ({ count: researchByAgent[key] ?? 0, error: null }),
              };
            }
            // data-mode: .select("updated_at").eq().order().limit().maybeSingle()
            return {
              eq: (_col: string, key: string) => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => ({
                      data: lastByAgent[key] != null ? { updated_at: lastByAgent[key] } : null,
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

beforeEach(() => {
  fsStore.clear();
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  // Freeze clock so REPORTS_DIR path composition + today-string is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-07T09:15:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/admin/goals — auth gate", () => {
  it("401s when no user is signed in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: "Unauthorized" });
  });

  it("401s a signed-in non-admin user", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    const res = await GET(req());
    expect(res.status).toBe(401);
    // Regression: gate must fire before any DB round-trip so a leaked query
    // doesn't warm the RLS cache under a non-admin identity — the route
    // reaches getSupabaseAdmin only after the admin check passes.
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("admits a user whose role is 'admin' even if email is not admin@blockid.au", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN_BY_ROLE);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(req());
    expect(res.status).toBe(200);
  });

  it("admits the admin@blockid.au email even without role=admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u", email: "admin@blockid.au", role: "user" });
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(req());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/goals — supabase-null degrade", () => {
  it("returns zeroed platformKPIs when service-role env missing", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.platformKPIs).toEqual({ totalUsers: 0, totalAnalyses: 0, totalAccounts: 0 });
  });

  it("still emits an agents[] entry per non-CEO goal when supabase is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const body = await json(await GET(req()));
    const agents = body.agents as Array<{ agent: string; researchCount: number; lastResearchDate: string | null }>;
    // 3 agents (CEO filtered out).
    expect(agents.map((a) => a.agent).sort()).toEqual(["CFO", "CMO", "CTO"]);
    // Research count degrades to 0, lastResearchDate to null.
    for (const a of agents) {
      expect(a.researchCount).toBe(0);
      expect(a.lastResearchDate).toBeNull();
    }
  });
});

describe("GET /api/admin/goals — platform KPIs + ceo card", () => {
  it("wires up totalUsers / totalAnalyses / totalAccounts from supabase counts", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ usersCount: 42, analysesCount: 137, accountsCount: 88 }),
    );
    const body = await json(await GET(req()));
    expect(body.platformKPIs).toEqual({ totalUsers: 42, totalAnalyses: 137, totalAccounts: 88 });
  });

  it("emits ceo card with title/mission/kpis lifted from CEO_GOAL_TREE", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    const body = await json(await GET(req()));
    expect(body.ceo).toEqual({
      title: "CEO Title",
      mission: "Ship SCN",
      kpis: [{ metric: "m1", label: "M1", target: 100, unit: "n" }],
    });
  });

  it("filters ceo out of agents[] (never double-counted)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    const body = await json(await GET(req()));
    const agents = body.agents as Array<{ agent: string }>;
    expect(agents.find((a) => a.agent.toLowerCase() === "ceo")).toBeUndefined();
    expect(agents).toHaveLength(3);
  });

  it("returns today in the response envelope (ISO date string)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    const body = await json(await GET(req()));
    expect(body.today).toBe("2026-08-07");
  });
});

describe("GET /api/admin/goals — readTodayReport walkback", () => {
  it("marks status=NO_REPORT + null lastReport when no report file exists", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    const body = await json(await GET(req()));
    const agents = body.agents as Array<{ agent: string; status: string; lastReport: string | null; lastReportDate: string | null }>;
    const cfo = agents.find((a) => a.agent === "CFO")!;
    expect(cfo.status).toBe("NO_REPORT");
    expect(cfo.lastReport).toBeNull();
    expect(cfo.lastReportDate).toBeNull();
  });

  it("reads today's daily report and parses GREEN status", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cfo-daily-2026-08-07.md`, "# CFO daily\nStatus: GREEN — MRR up 12%");
    const body = await json(await GET(req()));
    const cfo = (body.agents as Array<{ agent: string; status: string; lastReport: string | null }>).find(
      (a) => a.agent === "CFO",
    )!;
    expect(cfo.status).toBe("GREEN");
    expect(cfo.lastReport).toContain("MRR up 12%");
  });

  it("parses YELLOW status", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cto-daily-2026-08-07.md`, "Status: YELLOW — dep upgrade pending");
    const body = await json(await GET(req()));
    const cto = (body.agents as Array<{ agent: string; status: string }>).find((a) => a.agent === "CTO")!;
    expect(cto.status).toBe("YELLOW");
  });

  it("parses RED status", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cmo-daily-2026-08-07.md`, "RED: SEO fell off a cliff");
    const body = await json(await GET(req()));
    const cmo = (body.agents as Array<{ agent: string; status: string }>).find((a) => a.agent === "CMO")!;
    expect(cmo.status).toBe("RED");
  });

  it("falls back to YELLOW when the report file has no colour marker", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cfo-daily-2026-08-07.md`, "# CFO daily\nNo colour markers here.");
    const body = await json(await GET(req()));
    const cfo = (body.agents as Array<{ agent: string; status: string }>).find((a) => a.agent === "CFO")!;
    expect(cfo.status).toBe("YELLOW");
  });

  it("prefers daily-{today} over weekly-{today} when both exist", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cfo-daily-2026-08-07.md`, "daily: GREEN");
    fsStore.set(`${REPORTS_DIR}/cfo-weekly-2026-08-07.md`, "weekly: RED");
    const body = await json(await GET(req()));
    const cfo = (body.agents as Array<{ agent: string; status: string; lastReport: string | null }>).find(
      (a) => a.agent === "CFO",
    )!;
    expect(cfo.status).toBe("GREEN");
    expect(cfo.lastReport).toBe("daily: GREEN");
  });

  it("walks back to yesterday's daily when today's file is missing", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cto-daily-2026-08-06.md`, "yesterday: GREEN");
    const body = await json(await GET(req()));
    const cto = (body.agents as Array<{ agent: string; status: string; lastReport: string | null }>).find(
      (a) => a.agent === "CTO",
    )!;
    expect(cto.status).toBe("GREEN");
    expect(cto.lastReport).toBe("yesterday: GREEN");
  });

  it("walks back up to 3 days (2026-08-04 read when 05/06/07 missing)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cto-weekly-2026-08-04.md`, "old weekly: RED");
    const body = await json(await GET(req()));
    const cto = (body.agents as Array<{ agent: string; status: string }>).find((a) => a.agent === "CTO")!;
    expect(cto.status).toBe("RED");
  });

  it("does NOT walk back beyond 3 days (2026-08-03 ignored)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cfo-daily-2026-08-03.md`, "too old: GREEN");
    const body = await json(await GET(req()));
    const cfo = (body.agents as Array<{ agent: string; status: string }>).find((a) => a.agent === "CFO")!;
    expect(cfo.status).toBe("NO_REPORT");
  });

  it("lowercases agent name for the filename (goal.agent='CFO' → cfo-daily-*.md)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    // File written with UPPER-case agent name should NOT match — proves the toLowerCase() at route.ts:85.
    fsStore.set(`${REPORTS_DIR}/CFO-daily-2026-08-07.md`, "wrong case: GREEN");
    const body = await json(await GET(req()));
    const cfo = (body.agents as Array<{ agent: string; status: string }>).find((a) => a.agent === "CFO")!;
    expect(cfo.status).toBe("NO_REPORT");
  });

  it("sets lastReportDate to today (not the walkback date) — pinned regression", async () => {
    // NOTE: this matches the current route behaviour at route.ts:119 which sets
    // `lastReportDate: report ? today : null`. If that's ever refactored to use
    // report.reportDate, this test flips its expectation.
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(`${REPORTS_DIR}/cto-daily-2026-08-05.md`, "GREEN");
    const body = await json(await GET(req()));
    const cto = (body.agents as Array<{ agent: string; status: string; lastReportDate: string | null }>).find(
      (a) => a.agent === "CTO",
    )!;
    expect(cto.status).toBe("GREEN");
    expect(cto.lastReportDate).toBe("2026-08-07");
  });
});

describe("GET /api/admin/goals — research count + last research date", () => {
  it("carries researchCount + lastResearchDate through to each agent", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({
        // Route lowercases goal.agent for the .eq("agent", agentKey) filter,
        // so the fake keys are lowercased to match.
        researchCountByAgent: { cfo: 12, cto: 5, cmo: 0 },
        lastResearchByAgent: {
          cfo: "2026-08-05T18:00:00.000Z",
          cto: "2026-07-30T09:00:00.000Z",
          cmo: null,
        },
      }),
    );
    const body = await json(await GET(req()));
    const agents = body.agents as Array<{ agent: string; researchCount: number; lastResearchDate: string | null }>;
    const cfo = agents.find((a) => a.agent === "CFO")!;
    const cto = agents.find((a) => a.agent === "CTO")!;
    const cmo = agents.find((a) => a.agent === "CMO")!;
    expect(cfo.researchCount).toBe(12);
    expect(cfo.lastResearchDate).toBe("2026-08-05");
    expect(cto.researchCount).toBe(5);
    expect(cto.lastResearchDate).toBe("2026-07-30");
    expect(cmo.researchCount).toBe(0);
    expect(cmo.lastResearchDate).toBeNull();
  });

  it("uses the lowercased agent key for the agent_knowledge_base lookup", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    // If the route accidentally passed goal.agent verbatim ('CFO' not 'cfo')
    // the makeSb researchByAgent map keyed on 'cfo' would miss and return 0.
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ researchCountByAgent: { cfo: 99 } }),
    );
    const body = await json(await GET(req()));
    const cfo = (body.agents as Array<{ agent: string; researchCount: number }>).find(
      (a) => a.agent === "CFO",
    )!;
    // The route's readTodayReport uses toLowerCase() for the filename, but the
    // supabase filter uses .eq("agent", agentKey) where agentKey is the
    // lowercased value. This pin proves the two use the same key.
    expect(cfo.researchCount).toBe(99);
  });
});

describe("GET /api/admin/goals — agent shape carries all goal fields", () => {
  it("copies title/mission/kpis/criteriaOwned/reportSections/researchFrequency/researchTopics verbatim", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    const body = await json(await GET(req()));
    const cfo = (body.agents as Array<Record<string, unknown>>).find((a) => a.agent === "CFO")!;
    expect(cfo).toMatchObject({
      agent: "CFO",
      title: "CFO Title",
      mission: "Ship revenue",
      criteriaOwned: ["MPC"],
      reportSections: ["board_memo"],
      researchFrequency: "daily",
      researchTopics: ["stripe metrics"],
    });
    expect(cfo.kpis).toEqual([{ metric: "m1", label: "M1", target: 100, unit: "n" }]);
  });
});

describe("GET /api/admin/goals — cron health tail", () => {
  it("returns an empty recentCronRuns[] when cron-health.jsonl is missing", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    const body = await json(await GET(req()));
    expect(body.recentCronRuns).toEqual([]);
  });

  it("returns the last 50 lines reversed (newest first)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    // Write 60 lines, expect the last 50 in reverse order.
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(JSON.stringify({ ts: `2026-08-07T00:0${i % 10}:00Z`, endpoint: `/cron/${i}`, status: "ok", duration_ms: i }));
    }
    fsStore.set(`${REPORTS_DIR}/cron-health.jsonl`, lines.join("\n") + "\n");
    const body = await json(await GET(req()));
    const runs = body.recentCronRuns as Array<{ endpoint: string }>;
    expect(runs).toHaveLength(50);
    // Last 10 were dropped (indices 0..9), then 10..59 reversed → 59 first.
    expect(runs[0].endpoint).toBe("/cron/59");
    expect(runs[49].endpoint).toBe("/cron/10");
  });

  it("skips malformed JSON lines without 500ing the whole dashboard", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(
      `${REPORTS_DIR}/cron-health.jsonl`,
      [
        JSON.stringify({ ts: "t1", endpoint: "/a", status: "ok", duration_ms: 1 }),
        "{ not json",
        JSON.stringify({ ts: "t2", endpoint: "/b", status: "err", duration_ms: 2 }),
      ].join("\n"),
    );
    const body = await json(await GET(req()));
    const runs = body.recentCronRuns as Array<{ endpoint: string }>;
    // Reversed: /b first, /a second; malformed row filtered.
    expect(runs.map((r) => r.endpoint)).toEqual(["/b", "/a"]);
  });

  it("filters blank lines (split('\\n').filter(Boolean))", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb());
    fsStore.set(
      `${REPORTS_DIR}/cron-health.jsonl`,
      "\n" + JSON.stringify({ ts: "t1", endpoint: "/only", status: "ok", duration_ms: 1 }) + "\n\n",
    );
    const body = await json(await GET(req()));
    const runs = body.recentCronRuns as Array<{ endpoint: string }>;
    expect(runs).toHaveLength(1);
    expect(runs[0].endpoint).toBe("/only");
  });
});
