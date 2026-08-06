// Colocated vitest for GET /api/cron/founder-weekly-digest (P7a follow-up —
// docs/plans/atlassian-standard-mapping-goal.md §P7_weekly_digest_integration
// exit criterion: "digest section 'Your investor readiness this week' renders
// {score band, delta vs last week, single next action, top-3 missing}").
//
// Sibling to investor-weekly-digest — this cron ships the FOUNDER persona
// (readiness recap + gaps) whereas the investor-weekly-digest ships the
// investor persona (watchlist deltas). Both share the same email-preferences
// opt-out (`weekly_reports`), the same CRON_SECRET Bearer gate, and the same
// dry-run harness pattern (`?skip_email=1`).
//
// Coverage priorities:
//   * kill switch (FOUNDER_DIGEST=off) short-circuits BEFORE any supabase read
//   * CRON_SECRET Bearer gate (401 when set + wrong / missing; passes when unset)
//   * 503 not_configured when getSupabaseAdmin returns null
//   * 500 founders_query_failed surfaces the underlying error
//   * account_type is pinned to ["founder"] with a 30-day last_login cutoff
//   * no founders → 200 with founder_count=0 and no per-founder side effects
//   * blank-email founders are skipped without crashing the loop
//   * dry_run mode captures per-founder subject/phase/readiness/band_direction
//     WITHOUT sending mail or persisting a snapshot
//   * fetchLatestReadinessSnapshot is called with `before: <nowIso>` so the
//     baseline pre-digest snapshot is fetched (not the fresh one written below)
//   * happy send → sendEmail invoked with unsubscribeUrl, emailed++,
//     writeReadinessSnapshot persists the fresh snapshot for next week's delta
//   * opt-out via canSendEmail("weekly_reports")=false → no send, no snapshot
//   * sendEmail returns ok:false OR throws → failures++, no snapshot persisted
//   * ensureEmailPreferences failure is swallowed → digest still sends without
//     an unsubscribe URL

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── Supabase fake ────────────────────────────────────────────────────
//
// The route calls buildNudgeFor() which queries projects, startup_phase_progress,
// svi_accounts, svi_analyses, dataroom_files, and evidence_items. We short-circuit
// all of that by mocking computeNextSteps + computeComplianceMissing directly, and
// having the fake return empty rows for every unknown table so the loader helpers
// walk their happy-path guards without exercising the real logic.

interface FounderRow {
  id: string;
  email: string;
  display_name: string | null;
  last_login_at?: string | null;
}

interface FakeState {
  founders: FounderRow[];
  fail: {
    founders?: string;
  };
  filters: {
    accountTypeIn?: unknown[];
    lastLoginGte?: string;
  };
}

const state: FakeState = {
  founders: [],
  fail: {},
  filters: {},
};

function resetState() {
  state.founders = [];
  state.fail = {};
  state.filters = {};
}

function emptyMaybeSingle() {
  return { data: null, error: null };
}

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "app_users") {
        return {
          select(_cols: string) {
            return this;
          },
          in(col: string, vals: unknown[]) {
            if (col === "account_type") state.filters.accountTypeIn = vals;
            return this;
          },
          gte(col: string, val: string) {
            if (col === "last_login_at") state.filters.lastLoginGte = val;
            if (state.fail.founders) {
              return Promise.resolve({
                data: null,
                error: { message: state.fail.founders },
              });
            }
            return Promise.resolve({ data: state.founders, error: null });
          },
        };
      }
      // Every other table used by buildNudgeFor: return empty rows so the
      // loader helpers walk their empty-path guards without side effects.
      return {
        select(_cols: string) {
          const chain: Record<string, unknown> = {};
          chain.eq = () => chain;
          chain.is = () => chain;
          chain.order = () => chain;
          chain.limit = () => chain;
          chain.maybeSingle = async () => emptyMaybeSingle();
          // If the caller awaits the chain directly (no maybeSingle), yield []
          (chain as { then: unknown }).then = (
            resolve: (v: { data: unknown[]; error: null }) => void,
          ) => resolve({ data: [], error: null });
          return chain;
        },
      };
    },
  };
}

let supabaseNull = false;

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (supabaseNull ? null : fakeSupabase()),
}));

// ── computeNextSteps mock — return a deterministic NudgeResult ───────

const nudgeResultFixture = {
  current_phase: {
    slug: "customer-development",
    label: "Customer Development",
    label_vi: "Phát triển khách hàng",
    canonical_stage: "Validate",
    growth_phase_id: "customer-development",
    phase_order: 3,
  },
  next_action: {
    title: "Upload cap table CSV",
    reason: "Investors expect a live cap table before term-sheet talks.",
    cta_url: "/dataroom/cap-table",
    cta_label: "Upload now",
    category: "dataroom" as const,
  },
  missing: [
    {
      category: "1. Corporate & Legal",
      title: "s708(8) certificate",
      phase_slug: "customer-development",
      why_it_matters: "Unlocks wholesale-investor pitching.",
      raise_blocker: true,
      cta_url: "/dataroom/s708",
    },
    {
      category: "2. Financial",
      title: "Cap table",
      phase_slug: "customer-development",
      why_it_matters: "Baseline for valuation talks.",
      raise_blocker: true,
      cta_url: "/dataroom/cap-table",
    },
    {
      category: "3. Product",
      title: "Product roadmap",
      phase_slug: "customer-development",
      why_it_matters: "Shows execution plan.",
      raise_blocker: false,
      cta_url: "/dataroom/roadmap",
    },
    {
      category: "4. Team",
      title: "Founder agreements",
      phase_slug: "customer-development",
      why_it_matters: "Aligns founders' equity + vesting.",
      raise_blocker: true,
      cta_url: "/dataroom/founder-agreements",
    },
  ],
  readiness_score: {
    overall: 42,
    sub_scores: {
      market: 40,
      team: 55,
      tech: 30,
      financial: 20,
      compliance: 65,
    },
  },
  readiness_by_phase: {
    "customer-development": { score: 42, band: "not-ready" },
  },
  nudge_reason: "You're missing the two blockers most investors ask for first.",
  next_step_confidence: "high" as const,
};

const computeNextStepsMock = vi.fn((_input: unknown) => nudgeResultFixture);
vi.mock("@/lib/nudge/next-steps", async () => {
  // Keep the exported type surface intact by re-exporting the real module,
  // then override the pure function only.
  const actual = await vi.importActual<typeof import("@/lib/nudge/next-steps")>(
    "@/lib/nudge/next-steps",
  );
  return {
    ...actual,
    computeNextSteps: (input: unknown) => computeNextStepsMock(input),
  };
});

// ── computeComplianceMissing (no-op) ─────────────────────────────────

vi.mock("@/lib/nudge/compliance-status", () => ({
  computeComplianceMissing: async () => ({
    hasEsicAssessment: false,
    hasValidOrExpiringS708: false,
    hasGstAssessment: false,
    rdMinDaysUntilDeadline: null,
    rdMinDeadlineFy: null,
    rdHasOverdue: false,
  }),
}));

// ── readiness-snapshots mock — spies over the 4 I/O helpers ───────────

const fetchLatestReadinessSnapshotMock = vi.fn();
const writeReadinessSnapshotMock = vi.fn();
const toSnapshotRowMock = vi.fn(
  (result: typeof nudgeResultFixture, opts: { userId: string; projectId: string | null; source?: string }) => ({
    user_id: opts.userId,
    project_id: opts.projectId,
    phase_slug: result.current_phase.slug,
    overall_score: result.readiness_score.overall,
    band: result.readiness_score.overall >= 75
      ? "investor-ready"
      : result.readiness_score.overall >= 50
        ? "warming-up"
        : "not-ready",
    readiness_by_phase: result.readiness_by_phase,
    missing_top3: result.missing.slice(0, 3),
    next_action_title: result.next_action?.title ?? null,
    source: opts.source ?? "nudge_engine",
  }),
);
const computeReadinessDeltaMock = vi.fn((_curr: unknown, _prev: unknown) => ({
  score_delta: 5,
  summary: "Readiness moved +5 points up to 42/100 (band unchanged).",
  band_direction: "same",
  previous_computed_at: "2026-07-30T00:00:00.000Z",
}));

vi.mock("@/lib/nudge/readiness-snapshots", () => ({
  fetchLatestReadinessSnapshot: (sb: unknown, args: unknown) =>
    fetchLatestReadinessSnapshotMock(sb, args),
  writeReadinessSnapshot: (sb: unknown, row: unknown) =>
    writeReadinessSnapshotMock(sb, row),
  toSnapshotRow: (result: unknown, opts: unknown) =>
    toSnapshotRowMock(result as typeof nudgeResultFixture, opts as {
      userId: string;
      projectId: string | null;
      source?: string;
    }),
  computeReadinessDelta: (curr: unknown, prev: unknown) =>
    computeReadinessDeltaMock(curr, prev),
}));

// ── email + digest builder mocks ─────────────────────────────────────

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

interface BuildFounderDigestInput {
  name: string;
  phaseSlug: string;
  phaseLabel: string;
  readinessScore: number;
  band: string;
  deltaSummary: string;
  bandDirection: string;
  nextAction: unknown;
  missingTop3: Array<{ title: string }>;
  dashboardUrl: string;
  readinessByPhase?: unknown;
  previousReadinessByPhase?: unknown;
  unsubscribeUrl?: string;
}

const buildFounderDigestMock = vi.fn((input: BuildFounderDigestInput) => ({
  subject: `Founder digest for ${input.name} — ${input.readinessScore}/100${
    input.unsubscribeUrl ? " (unsub)" : ""
  }`,
  html: `<p>${input.name} — ${input.missingTop3.length} missing</p>`,
  text: `${input.name} — ${input.readinessScore}`,
}));
vi.mock("@/lib/email/founder-digest", () => ({
  buildFounderDigest: (input: BuildFounderDigestInput) =>
    buildFounderDigestMock(input),
}));

// ── email preferences ────────────────────────────────────────────────

const canSendEmailMock = vi.fn();
const ensureEmailPreferencesMock = vi.fn();
const getUnsubscribeUrlMock = vi.fn();
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (email: string, category: string) =>
    canSendEmailMock(email, category),
  ensureEmailPreferences: (email: string) => ensureEmailPreferencesMock(email),
  getUnsubscribeUrl: (token: string, category: string) =>
    getUnsubscribeUrlMock(token, category),
}));

import { GET } from "./route";

const SECRET = "cron-secret-test-value";

beforeEach(() => {
  resetState();
  supabaseNull = false;
  computeNextStepsMock.mockClear();
  computeNextStepsMock.mockReturnValue(nudgeResultFixture);
  fetchLatestReadinessSnapshotMock.mockReset();
  fetchLatestReadinessSnapshotMock.mockResolvedValue(null);
  writeReadinessSnapshotMock.mockReset();
  writeReadinessSnapshotMock.mockResolvedValue({
    id: "snap-1",
    computed_at: "2026-08-06T00:00:00.000Z",
  });
  toSnapshotRowMock.mockClear();
  computeReadinessDeltaMock.mockClear();
  computeReadinessDeltaMock.mockReturnValue({
    score_delta: 5,
    summary: "Readiness moved +5 points up to 42/100 (band unchanged).",
    band_direction: "same",
    previous_computed_at: "2026-07-30T00:00:00.000Z",
  });
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true });
  buildFounderDigestMock.mockClear();
  canSendEmailMock.mockReset();
  canSendEmailMock.mockResolvedValue(true);
  ensureEmailPreferencesMock.mockReset();
  ensureEmailPreferencesMock.mockResolvedValue("tok-founder");
  getUnsubscribeUrlMock.mockReset();
  getUnsubscribeUrlMock.mockReturnValue(
    "https://blockid.au/unsub?t=tok-founder",
  );
  process.env.CRON_SECRET = SECRET;
  delete process.env.FOUNDER_DIGEST;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.FOUNDER_DIGEST;
});

function makeReq(opts: { auth?: string; skipEmail?: boolean } = {}) {
  const url = new URL("http://x/api/cron/founder-weekly-digest");
  if (opts.skipEmail) url.searchParams.set("skip_email", "1");
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = opts.auth;
  return new Request(url.toString(), { method: "GET", headers });
}

describe("kill switch + auth gate", () => {
  it("kill switch: FOUNDER_DIGEST=off short-circuits BEFORE the supabase read", async () => {
    process.env.FOUNDER_DIGEST = "off";
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, disabled: true });
    expect(state.filters.accountTypeIn).toBeUndefined();
    expect(computeNextStepsMock).not.toHaveBeenCalled();
  });

  it("401 when CRON_SECRET is set but no Authorization header", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "unauthorized" });
    expect(state.filters.accountTypeIn).toBeUndefined();
  });

  it("401 when CRON_SECRET is set and the bearer value is wrong", async () => {
    const res = await GET(makeReq({ auth: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("no CRON_SECRET set → auth gate is skipped (public cron)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, founder_count: 0, emailed: 0 });
  });
});

describe("supabase wiring", () => {
  it("503 not_configured when getSupabaseAdmin returns null", async () => {
    supabaseNull = true;
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "not_configured" });
  });

  it("500 founders_query_failed surfaces the underlying error message", async () => {
    state.fail.founders = "conn reset";
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "founders_query_failed",
      error: "conn reset",
    });
  });

  it("account_type filter is pinned to ['founder'] with a 30-day last_login cutoff", async () => {
    state.founders = [];
    const before = Date.now();
    await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    const after = Date.now();

    expect(state.filters.accountTypeIn).toEqual(["founder"]);
    const cutoff = state.filters.lastLoginGte;
    expect(typeof cutoff).toBe("string");
    const cutoffMs = new Date(cutoff as string).getTime();
    const expectedLo = before - 30 * 24 * 60 * 60 * 1000 - 1000;
    const expectedHi = after - 30 * 24 * 60 * 60 * 1000 + 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedLo);
    expect(cutoffMs).toBeLessThanOrEqual(expectedHi);
  });

  it("zero founders → 200 with founder_count=0 and no per-founder side effects", async () => {
    state.founders = [];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, founder_count: 0, emailed: 0 });
    expect(computeNextStepsMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(writeReadinessSnapshotMock).not.toHaveBeenCalled();
  });

  it("blank-email founders are skipped without touching the nudge engine", async () => {
    state.founders = [
      { id: "u1", email: "", display_name: null },
      { id: "u2", email: "u2@x.io", display_name: null },
    ];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.founder_count).toBe(2);
    expect(body.emailed).toBe(1);
    // Only u2 flows through the nudge engine
    expect(computeNextStepsMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("u2@x.io");
  });
});

describe("dry_run mode (skip_email=1)", () => {
  it("returns per-founder DryRunSummary rows without sending mail or persisting a snapshot", async () => {
    state.founders = [
      { id: "u1", email: "alice@x.io", display_name: "Alice" },
      { id: "u2", email: "bob@x.io", display_name: null },
    ];
    const res = await GET(
      makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.founder_count).toBe(2);
    expect(body.emailed).toBe(0);
    expect(body.failures).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(writeReadinessSnapshotMock).not.toHaveBeenCalled();

    const dry = body.dry_run as Array<{
      founder_id: string;
      email: string;
      phase: string;
      readiness: number;
      band: string;
      band_direction: string;
      missing_count: number;
      subject: string;
    }>;
    expect(dry).toHaveLength(2);
    const u1 = dry.find((r) => r.founder_id === "u1")!;
    expect(u1.email).toBe("alice@x.io");
    expect(u1.phase).toBe("customer-development");
    expect(u1.readiness).toBe(42);
    expect(u1.band).toBe("not-ready");
    expect(u1.band_direction).toBe("same");
    // missing_count comes from missing_top3 (top-3 slice of a 4-item fixture)
    expect(u1.missing_count).toBe(3);
    expect(u1.subject).toMatch(/Alice/);
    const u2 = dry.find((r) => r.founder_id === "u2")!;
    // display_name null → subject uses the email local-part fallback
    expect(u2.subject).toMatch(/bob/);
  });

  it("dry_run field is absent from the payload when skip_email is not set", async () => {
    state.founders = [];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).not.toHaveProperty("dry_run");
  });

  it("dry-run harness covers admin@blockid.au (P7 exit criterion)", async () => {
    state.founders = [
      { id: "admin-uid", email: "admin@blockid.au", display_name: "Admin" },
    ];
    const res = await GET(
      makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }),
    );
    const body = await res.json();
    expect(body.dry_run).toHaveLength(1);
    expect(body.dry_run[0].email).toBe("admin@blockid.au");
    expect(body.dry_run[0].subject).toMatch(/Admin/);
  });
});

describe("snapshot baseline fetch (delta anchor)", () => {
  it("fetchLatestReadinessSnapshot receives {userId, projectId:null, before:<nowIso>}", async () => {
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    const before = new Date().toISOString();
    await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    const after = new Date().toISOString();

    expect(fetchLatestReadinessSnapshotMock).toHaveBeenCalledTimes(1);
    const args = fetchLatestReadinessSnapshotMock.mock.calls[0][1] as {
      userId: string;
      projectId: string | null;
      before: string;
    };
    expect(args.userId).toBe("u1");
    // fake supabase returns no project row → projectId is null
    expect(args.projectId).toBeNull();
    expect(typeof args.before).toBe("string");
    expect(args.before >= before).toBe(true);
    expect(args.before <= after).toBe(true);
  });

  it("previous snapshot feeds computeReadinessDelta as the second arg", async () => {
    const previous = {
      user_id: "u1",
      project_id: null,
      phase_slug: "customer-development",
      overall_score: 37,
      band: "not-ready",
      readiness_by_phase: {
        "customer-development": { score: 37, band: "not-ready" },
      },
      missing_top3: [],
      next_action_title: null,
      source: "digest",
      computed_at: "2026-07-30T00:00:00.000Z",
    };
    fetchLatestReadinessSnapshotMock.mockResolvedValue(previous);
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(computeReadinessDeltaMock).toHaveBeenCalledTimes(1);
    const [curArg, prevArg] = computeReadinessDeltaMock.mock.calls[0];
    // current row = toSnapshotRow(fixture) — overall 42, source 'digest'
    expect((curArg as { overall_score: number }).overall_score).toBe(42);
    expect((curArg as { source: string }).source).toBe("digest");
    expect(prevArg).toBe(previous);
  });

  it("previous snapshot's readiness_by_phase is forwarded to buildFounderDigest", async () => {
    const prevByPhase = {
      "customer-development": { score: 37, band: "not-ready" },
    };
    fetchLatestReadinessSnapshotMock.mockResolvedValue({
      user_id: "u1",
      project_id: null,
      phase_slug: "customer-development",
      overall_score: 37,
      band: "not-ready",
      readiness_by_phase: prevByPhase,
      missing_top3: [],
      next_action_title: null,
      source: "digest",
      computed_at: "2026-07-30T00:00:00.000Z",
    });
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    await GET(makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }));
    expect(buildFounderDigestMock).toHaveBeenCalled();
    const args = buildFounderDigestMock.mock.calls[0][0];
    expect(args.previousReadinessByPhase).toEqual(prevByPhase);
    expect(args.readinessByPhase).toEqual(nudgeResultFixture.readiness_by_phase);
  });
});

describe("send + snapshot persistence", () => {
  it("happy send → sendEmail invoked with subject/html/unsubscribeUrl, emailed++, snapshot persisted", async () => {
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: "Alice" },
    ];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(1);
    expect(body.failures).toBe(0);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sendArgs = sendEmailMock.mock.calls[0][0];
    expect(sendArgs.to).toBe("u1@x.io");
    expect(sendArgs.subject).toMatch(/Alice/);
    expect(sendArgs.subject).toMatch(/unsub/); // second (re-rendered) digest carried unsubscribe URL
    expect(sendArgs.unsubscribeUrl).toBe(
      "https://blockid.au/unsub?t=tok-founder",
    );

    expect(canSendEmailMock).toHaveBeenCalledWith("u1@x.io", "weekly_reports");
    expect(getUnsubscribeUrlMock).toHaveBeenCalledWith(
      "tok-founder",
      "weekly_reports",
    );

    // Snapshot persistence anchors next week's delta
    expect(writeReadinessSnapshotMock).toHaveBeenCalledTimes(1);
    const snap = writeReadinessSnapshotMock.mock.calls[0][1] as {
      user_id: string;
      phase_slug: string;
      overall_score: number;
      source: string;
    };
    expect(snap.user_id).toBe("u1");
    expect(snap.phase_slug).toBe("customer-development");
    expect(snap.overall_score).toBe(42);
    expect(snap.source).toBe("digest");
  });

  it("opt-out via canSendEmail(weekly_reports)=false → no send, no snapshot, no unsub URL lookup", async () => {
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    canSendEmailMock.mockResolvedValue(false);
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(0);
    expect(body.failures).toBe(0);
    expect(canSendEmailMock).toHaveBeenCalledWith("u1@x.io", "weekly_reports");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(writeReadinessSnapshotMock).not.toHaveBeenCalled();
    expect(ensureEmailPreferencesMock).not.toHaveBeenCalled();
  });

  it("sendEmail returns ok:false → failures++, no snapshot persistence", async () => {
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    sendEmailMock.mockResolvedValue({ ok: false, error: "smtp down" });
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(0);
    expect(body.failures).toBe(1);
    expect(writeReadinessSnapshotMock).not.toHaveBeenCalled();
  });

  it("sendEmail throws → failures++, never bubbles up as a 500, no snapshot persisted", async () => {
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    sendEmailMock.mockRejectedValue(new Error("network"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(0);
    expect(body.failures).toBe(1);
    expect(writeReadinessSnapshotMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ensureEmailPreferences throws → warn is logged, digest still sends WITHOUT an unsubscribe URL", async () => {
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
    ];
    ensureEmailPreferencesMock.mockRejectedValue(new Error("prefs table missing"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sendArgs = sendEmailMock.mock.calls[0][0];
    expect(sendArgs.unsubscribeUrl).toBeUndefined();
    // Snapshot still persists on a successful send.
    expect(writeReadinessSnapshotMock).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("multiple founders → per-founder send count, failures independent", async () => {
    state.founders = [
      { id: "u1", email: "u1@x.io", display_name: null },
      { id: "u2", email: "u2@x.io", display_name: null },
      { id: "u3", email: "u3@x.io", display_name: null },
    ];
    // u2 fails, u1 + u3 succeed
    sendEmailMock.mockImplementation((args: { to: string }) =>
      args.to === "u2@x.io"
        ? Promise.resolve({ ok: false })
        : Promise.resolve({ ok: true }),
    );
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.founder_count).toBe(3);
    expect(body.emailed).toBe(2);
    expect(body.failures).toBe(1);
    // Two successful sends → two persisted snapshots (u2's must NOT persist)
    expect(writeReadinessSnapshotMock).toHaveBeenCalledTimes(2);
    const persistedUserIds = writeReadinessSnapshotMock.mock.calls.map(
      (c) => (c[1] as { user_id: string }).user_id,
    );
    expect(persistedUserIds.sort()).toEqual(["u1", "u3"]);
  });
});
