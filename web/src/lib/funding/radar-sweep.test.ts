// Colocated vitest for the Money Radar sweep (T0245).
//
// Pins the diff contract with a fake RadarStore and hand-built catalogue
// rows (no seeds — dates must be exact relative to the frozen "today"):
//   • first sweep → every match is `new_match`, batched into ONE
//     `new_matches` notification per target, rows inserted
//   • deadline tiers t30 / t14 / t3 fire once each across repeated sweeps
//     (exactly-once via last_notified), tightest tier wins
//   • status_changed when a previously matched row flips to paused / closed
//   • new_round_opened on upcoming → open
//   • frequency cap: every in-app row carries dedupeKey + 24 h throttle
//   • dryRun computes events + counts and writes nothing
//   • in-app-only buyers never get `pending_email`; radar subscribers do
//   • subscriber discovery through the Supabase store (plans flag + grants +
//     90-day buyers) with a tiny query-builder fake

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuGrantRow, AuProgramRow } from "./seed-map";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/notifications", () => ({ insertNotification: vi.fn(async () => undefined) }));
vi.mock("./data", () => ({ listGrants: vi.fn(async () => []), listPrograms: vi.fn(async () => []) }));
// S11-A — the Supabase store delegates the setup-nudge state to email-drip
// and the opt-out to email-preferences; both are pinned by their own suites.
const canSendEmailMock = vi.fn(async () => true);
const getPrefsMock = vi.fn(async () => ({ unsubscribe_token: "tok-1" }));
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (...a: unknown[]) => canSendEmailMock(...(a as [])),
  getEmailPreferences: (...a: unknown[]) => getPrefsMock(...(a as [])),
}));
const enqueueSetupMock = vi.fn(async () => "queued" as const);
const listTouchesMock = vi.fn(async () => [] as Array<{ campaign: "radar_setup" | "radar_setup_2"; scheduled_for: string }>);
vi.mock("@/lib/email-drip", () => ({
  RADAR_SETUP_FOLLOWUP_DAYS: 14,
  enqueueRadarSetupDrip: (...a: unknown[]) => enqueueSetupMock(...(a as [])),
  listRadarSetupTouches: (...a: unknown[]) => listTouchesMock(...(a as [])),
}));

import {
  INAPP_THROTTLE_MS,
  PAID_REPORT_LOOKBACK_DAYS,
  SETUP_NUDGE_THROTTLE_MS,
  createSupabaseRadarStore,
  diffTarget,
  matchDeadline,
  mergeGrantProfile,
  openCounts,
  planNotifications,
  planSetupNudge,
  runMoneyRadarSweep,
  stageFromLoose,
  tierFor,
  type FundingMatchRow,
  type NotifyArgs,
  type RadarStore,
  type RadarSubscriber,
  type RadarTarget,
} from "./radar-sweep";
import type { DripPayload, RadarSetupCampaign, RadarSetupTouch } from "@/lib/email-drip";
import { screenGrants, screenPrograms, type GrantProfile } from "@/lib/agents/grant-advisor";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TODAY = new Date(Date.UTC(2026, 8, 13, 5, 0, 0)); // Sunday 2026-09-13 05:00Z
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

function grant(over: Partial<AuGrantRow> = {}): AuGrantRow {
  return {
    id: "g1",
    name: "Grant One",
    provider: "Dept",
    level: "federal",
    state: "national",
    funding_type: "grant",
    amount_min_aud: null,
    amount_max_aud: 50000,
    amount_note: null,
    co_contribution: null,
    stage_tags: ["mvp"],
    industry_tags: [],
    demographic_tags: [],
    eligibility: {},
    application_window: "annual_round",
    opens_at: day(-10),
    closes_at: day(20),
    lodgement_deadline: null,
    next_round_note: null,
    status: "open",
    superseded_by: null,
    exclude_from_matching: false,
    official_url: "https://example.gov.au/grant",
    source_url: null,
    summary: "One-line summary.",
    how_to_apply: null,
    evidence_needed: [],
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "high",
    sources: null,
    ...over,
  };
}

function program(over: Partial<AuProgramRow> = {}): AuProgramRow {
  return {
    id: "p1",
    name: "Program One",
    operator: "Op",
    program_type: "accelerator",
    city: "Sydney",
    capital: "Sydney",
    state: "NSW",
    venue: null,
    stage_tags: ["mvp"],
    industry_tags: [],
    demographic_tags: [],
    length_weeks: 12,
    intake_months: [],
    applications_open: day(-5),
    applications_close: day(10),
    next_cohort_start: day(60),
    benefits: [],
    funding_aud: null,
    equity_pct: null,
    cost_to_founder: "free",
    eligibility: {},
    status: "open",
    official_url: "https://example.com/program",
    summary: null,
    last_verified_at: "2026-09-10",
    verified_by: "seed",
    status_confidence: "high",
    ...over,
  };
}

const PROFILE: GrantProfile = {
  state: "NSW",
  city: "Sydney",
  entity_type: "pty_ltd",
  incorporated_at: "2025-01-01",
  turnover_aud: 50_000,
  rd_spend_aud: null,
  headcount: 3,
  founder_demographics: [],
  export_intent: null,
  stage: "mvp",
  industry_tags: ["software_saas"],
  funding_need_aud: 50_000,
  description: "AI compliance assistant",
};

const RADAR: RadarSubscriber = { userId: "u-radar", email: "r@x.au", plan: "founder_starter", channels: ["inapp", "email", "ics"] };
const BUYER: RadarSubscriber = { userId: "u-buyer", email: "b@x.au", plan: "founder_free", channels: ["inapp"] };

function target(sub: RadarSubscriber, projectId: string | null = "proj-1"): RadarTarget {
  return { userId: sub.userId, projectId, startup: "Acme", profile: PROFILE, locationUnknown: false, reportId: "rep-1" };
}

/** In-memory RadarStore: rows persist across sweeps so exactly-once is real. */
function fakeStore(opts: {
  subscribers: RadarSubscriber[];
  catalogue: { grants: AuGrantRow[]; programs: AuProgramRow[] };
  targets?: (sub: RadarSubscriber) => RadarTarget[];
  /** S11-A: addresses that opted out of money_radar. */
  optedOut?: string[];
}) {
  const rows: FundingMatchRow[] = [];
  const notifications: NotifyArgs[] = [];
  // S11-A: the drip rows ARE the activation-nudge state, so they persist too.
  const drips: Array<{ email: string; userId: string; campaign: RadarSetupCampaign; payload: DripPayload; scheduled_for: string }> = [];
  let seq = 0;
  let clock = TODAY;
  const store: RadarStore & { rows: FundingMatchRow[]; notifications: NotifyArgs[]; drips: typeof drips; writes: number; setClock: (d: Date) => void } = {
    rows,
    notifications,
    drips,
    writes: 0,
    setClock: (d) => {
      clock = d;
    },
    listSetupTouches: async (email): Promise<RadarSetupTouch[]> =>
      drips.filter((d) => d.email === email).map((d) => ({ campaign: d.campaign, scheduled_for: d.scheduled_for })).reverse(),
    emailGate: async (email) => ({ allowed: !(opts.optedOut ?? []).includes(email), token: "tok-1" }),
    enqueueSetupDrip: async (email, userId, campaign, payload) => {
      if (drips.some((d) => d.email === email && d.campaign === campaign)) return "duplicate";
      store.writes++;
      drips.push({ email, userId, campaign, payload, scheduled_for: clock.toISOString() });
      return "queued";
    },
    listSubscribers: async () => opts.subscribers,
    listTargets: async (sub) => (opts.targets ?? ((s) => [target(s)]))(sub),
    listCatalogue: async () => opts.catalogue,
    listMatches: async (userId, projectId) => rows.filter((r) => r.user_id === userId && r.project_id === projectId).map((r) => ({ ...r })),
    insertMatches: async (ins) => {
      store.writes += ins.length;
      for (const r of ins) rows.push({ ...r, id: `m${++seq}` });
    },
    updateMatch: async (id, patch) => {
      store.writes++;
      const r = rows.find((x) => x.id === id);
      if (!r) throw new Error(`no row ${id}`);
      Object.assign(r, patch);
    },
    notify: async (n) => {
      notifications.push(n);
    },
  };
  return store;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe("tierFor / matchDeadline / stageFromLoose", () => {
  it("buckets days-left into the tightest tier, none beyond 30 or in the past", () => {
    expect(tierFor(45)).toBeNull();
    expect(tierFor(30)).toBe("t30");
    expect(tierFor(15)).toBe("t30");
    expect(tierFor(14)).toBe("t14");
    expect(tierFor(4)).toBe("t14");
    expect(tierFor(3)).toBe("t3");
    expect(tierFor(0)).toBe("t3");
    expect(tierFor(-1)).toBeNull();
  });

  it("matchDeadline uses the dated close, the edition date for events, null for rolling", () => {
    const g = { kind: "grant", next_window: { kind: "dated", closes_at: "2026-10-03", label: "" } } as never;
    expect(matchDeadline(g)).toBe("2026-10-03");
    const rolling = { kind: "grant", next_window: { kind: "rolling", label: "" } } as never;
    expect(matchDeadline(rolling)).toBeNull();
    const ev = { kind: "program", program: { program_type: "event" }, next_window: { kind: "dated", cohort_start: "2026-11-20", label: "" } } as never;
    expect(matchDeadline(ev)).toBe("2026-11-20");
    const est = { kind: "program", program: { program_type: "accelerator" }, next_window: { kind: "estimated", closes_at: "2026-11-20", label: "" } } as never;
    expect(matchDeadline(est)).toBeNull();
  });

  it("stageFromLoose maps app_users.startup_stage / projects.stage to a matcher stage", () => {
    expect(stageFromLoose("mvp")).toBe("mvp");
    expect(stageFromLoose("Pre-revenue")).toBe("pre_revenue_prototype");
    expect(stageFromLoose("Series A / scaling")).toBe("scaling");
    expect(stageFromLoose(0)).toBe("idea");
    expect(stageFromLoose(4)).toBe("early_revenue");
    expect(stageFromLoose(undefined)).toBe("mvp");
  });

  it("mergeGrantProfile overlays profile-row numbers on the intake profile and needs a state", () => {
    const merged = mergeGrantProfile(PROFILE, { state: "WA", turnover_aud: "120000", founder_demographics: ["women_led"], export_intent: true });
    expect(merged).toMatchObject({ state: "WA", turnover_aud: 120000, founder_demographics: ["women_led"], export_intent: true, stage: "mvp", industry_tags: ["software_saas"] });
    expect(mergeGrantProfile(null, { city: "Perth" })).toBeNull();
    const fromRow = mergeGrantProfile(null, { state: "QLD" }, { stage: 3, industry: "fintech" });
    expect(fromRow).toMatchObject({ state: "QLD", stage: "mvp", industry_tags: ["fintech"] });
  });
});

// ─── diffTarget ──────────────────────────────────────────────────────────────

describe("diffTarget", () => {
  const catalogue = { grants: [grant()], programs: [program()] };

  it("first sweep: new_match for every row, inserted with first_seen = now and the tier already stamped", () => {
    const grants = screenGrants(PROFILE, catalogue.grants, TODAY).matched;
    const programs = screenPrograms(PROFILE, catalogue.programs, TODAY).matched;
    expect(grants.map((g) => g.ref_id)).toEqual(["g1"]);
    expect(programs.map((p) => p.ref_id)).toEqual(["p1"]);

    const d = diffTarget({ target: target(RADAR), channels: RADAR.channels, prev: [], grants, programs, catalogue, now: TODAY });
    expect(d.inserts).toHaveLength(2);
    expect(d.updates).toHaveLength(0);
    const types = d.events.map((e) => `${e.ref_id}:${e.type}`).sort();
    // g1 closes in 20 days → t30; p1 closes in 10 days → t14. Both also new.
    expect(types).toEqual(["g1:deadline_t30", "g1:new_match", "p1:deadline_t14", "p1:new_match"]);
    const g1 = d.inserts.find((r) => r.ref_id === "g1")!;
    expect(g1.closes_at).toBe(day(20));
    expect(g1.status_at_match).toBe("open");
    expect(g1.last_notified.t30).toBe(day(0));
    expect(g1.last_notified.pending_email).toEqual([{ event: "deadline_t30", at: day(0) }]);
    expect((g1.last_notified.radar_events as unknown[]).length).toBe(2);
  });
});

// ─── runMoneyRadarSweep ──────────────────────────────────────────────────────

describe("runMoneyRadarSweep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("batches new matches into one `new_matches` row per target and dedupes with a 24 h throttle", async () => {
    const store = fakeStore({ subscribers: [RADAR], catalogue: { grants: [grant(), grant({ id: "g2", name: "Grant Two", closes_at: null, application_window: "rolling" })], programs: [program()] } });
    const s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.ok).toBe(true);
    expect(s.subscribers).toBe(1);
    expect(s.targets).toBe(1);
    expect(s.inserted).toBe(3);
    expect(s.byType.new_match).toBe(3);
    const batch = store.notifications.filter((n) => n.kind === "new_matches");
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({
      userId: "u-radar",
      projectId: "proj-1",
      dedupeKey: `new_matches:proj-1:${day(0)}`,
      throttleMs: INAPP_THROTTLE_MS,
      payload: { count: 3, grant_count: 2, program_count: 1, startup: "Acme", report_id: "rep-1" },
    });
    // Deadline rows: g1 (t30) → grant_deadline, p1 (t14) → program_intake; g2 rolling → none.
    const deadlines = store.notifications.filter((n) => n.kind !== "new_matches");
    expect(deadlines.map((n) => [n.kind, n.dedupeKey])).toEqual(
      expect.arrayContaining([
        ["grant_deadline", "grant:g1:t30"],
        ["program_intake", "program:p1:t14"],
      ]),
    );
    expect(deadlines).toHaveLength(2);
    for (const n of store.notifications) {
      expect(n.dedupeKey).toBeTruthy();
      expect(n.throttleMs).toBe(INAPP_THROTTLE_MS);
    }
  });

  it("deadline tiers fire exactly once each across repeated sweeps (t30 → t14 → t3), never twice", async () => {
    const g = grant({ closes_at: day(31) }); // 31 days out today → no tier yet
    const store = fakeStore({ subscribers: [RADAR], catalogue: { grants: [g], programs: [] } });

    const s0 = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s0.byType).toMatchObject({ new_match: 1, deadline_t30: 0, deadline_t14: 0, deadline_t3: 0 });

    // +1 day: 30 left → t30
    const s1 = await runMoneyRadarSweep({ now: new Date(TODAY.getTime() + 1 * 86_400_000), store });
    expect(s1.byType.deadline_t30).toBe(1);
    // +2 days: 29 left → still t30 bucket, already fired → nothing
    const s2 = await runMoneyRadarSweep({ now: new Date(TODAY.getTime() + 2 * 86_400_000), store });
    expect(s2.events.filter((e) => e.type.startsWith("deadline_"))).toHaveLength(0);
    // +21 days: 10 left → t14
    const s3 = await runMoneyRadarSweep({ now: new Date(TODAY.getTime() + 21 * 86_400_000), store });
    expect(s3.byType.deadline_t14).toBe(1);
    // +29 days: 2 left → t3
    const s4 = await runMoneyRadarSweep({ now: new Date(TODAY.getTime() + 29 * 86_400_000), store });
    expect(s4.byType.deadline_t3).toBe(1);
    // +30 days: 1 left → t3 already fired
    const s5 = await runMoneyRadarSweep({ now: new Date(TODAY.getTime() + 30 * 86_400_000), store });
    expect(s5.events.filter((e) => e.type.startsWith("deadline_"))).toHaveLength(0);

    const row = store.rows.find((r) => r.ref_id === "g1")!;
    expect(row.last_notified).toMatchObject({ t30: day(1), t14: day(21), t3: day(29) });
    const tierNotes = store.notifications.filter((n) => n.kind === "grant_deadline");
    expect(tierNotes.map((n) => n.dedupeKey)).toEqual(["grant:g1:t30", "grant:g1:t14", "grant:g1:t3"]);
    expect(tierNotes.map((n) => n.payload?.days_left)).toEqual([30, 10, 2]);
  });

  it("a match first seen 10 days out gets t14 only (tightest tier), not t30 as well", async () => {
    const store = fakeStore({ subscribers: [RADAR], catalogue: { grants: [grant({ closes_at: day(10) })], programs: [] } });
    const s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.byType).toMatchObject({ deadline_t30: 0, deadline_t14: 1, deadline_t3: 0 });
  });

  it("status_changed once when a previously matched row goes paused, and new_round_opened on upcoming → open", async () => {
    const upcoming = grant({ id: "g-up", name: "Upcoming Grant", status: "upcoming", opens_at: day(40), closes_at: day(70) });
    const store = fakeStore({ subscribers: [RADAR], catalogue: { grants: [grant(), upcoming], programs: [] } });
    await runMoneyRadarSweep({ now: TODAY, store });
    expect(store.rows.find((r) => r.ref_id === "g-up")!.status_at_match).toBe("upcoming");

    // Week 2: g1 paused, g-up now open.
    const paused = grant({ status: "paused" });
    const opened = { ...upcoming, status: "open" as const, opens_at: day(-1) };
    const w2 = fakeStore({ subscribers: [RADAR], catalogue: { grants: [paused, opened], programs: [] } });
    w2.rows.push(...store.rows.map((r) => ({ ...r })));
    const s2 = await runMoneyRadarSweep({ now: new Date(TODAY.getTime() + 7 * 86_400_000), store: w2 });
    expect(s2.byType.status_changed).toBe(1);
    expect(s2.byType.new_round_opened).toBe(1);
    const sc = s2.events.find((e) => e.type === "status_changed")!;
    expect(sc).toMatchObject({ ref_id: "g1", status: "paused", name: "Grant One" });
    expect(w2.rows.find((r) => r.ref_id === "g1")!.status_at_match).toBe("paused");
    expect(w2.rows.find((r) => r.ref_id === "g-up")!.status_at_match).toBe("open");
    const kinds = w2.notifications.map((n) => [n.kind, n.dedupeKey, n.payload?.event]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ["grant_deadline", "grant:g1:status_changed", "status_changed"],
        ["grant_deadline", "grant:g-up:new_round_opened", "new_round_opened"],
      ]),
    );

    // Week 3: still paused → no repeat.
    const w3 = fakeStore({ subscribers: [RADAR], catalogue: { grants: [paused, opened], programs: [] } });
    w3.rows.push(...w2.rows.map((r) => ({ ...r })));
    const s3 = await runMoneyRadarSweep({ now: new Date(TODAY.getTime() + 14 * 86_400_000), store: w3 });
    expect(s3.byType.status_changed).toBe(0);
    expect(s3.byType.new_round_opened).toBe(0);
  });

  it("program_type=event rows notify as event_match keyed on the edition date", async () => {
    const ev = program({ id: "ev1", name: "West Tech Fest", program_type: "event", applications_open: null, applications_close: null, next_cohort_start: day(12), capital: "Perth", state: "WA", city: "Perth" });
    // Events are not geo-gated like in-person programs; use a Remote/national row to be safe.
    const store = fakeStore({ subscribers: [RADAR], catalogue: { grants: [], programs: [{ ...ev, capital: "Remote", state: "national", city: "Remote" }] } });
    const s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.byType.new_match).toBe(1);
    expect(s.byType.deadline_t14).toBe(1);
    const n = store.notifications.find((x) => x.kind === "event_match");
    expect(n).toBeDefined();
    expect(n!.dedupeKey).toBe("program:ev1:t14");
    expect(n!.payload).toMatchObject({ closes_at: day(12), days_left: 12 });
  });

  it("dryRun computes events and would-be counts but writes nothing", async () => {
    const store = fakeStore({ subscribers: [RADAR, BUYER], catalogue: { grants: [grant()], programs: [program()] } });
    const s = await runMoneyRadarSweep({ now: TODAY, store, dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(s.targets).toBe(2);
    expect(s.inserted).toBe(4);
    expect(s.notifications).toBe(2 * 3); // per target: new_matches batch + g1 t30 + p1 t14
    expect(s.events.length).toBe(8);
    expect(store.writes).toBe(0);
    expect(store.rows).toHaveLength(0);
    expect(store.notifications).toHaveLength(0);
  });

  it("in-app-only buyers never get pending_email; radar subscribers do", async () => {
    const store = fakeStore({ subscribers: [RADAR, BUYER], catalogue: { grants: [grant()], programs: [] } });
    await runMoneyRadarSweep({ now: TODAY, store });
    const radarRow = store.rows.find((r) => r.user_id === "u-radar")!;
    const buyerRow = store.rows.find((r) => r.user_id === "u-buyer")!;
    expect(radarRow.last_notified.pending_email).toBeDefined();
    expect(buyerRow.last_notified.pending_email).toBeUndefined();
    expect((buyerRow.last_notified.radar_events as Array<{ channels: string[] }>)[0].channels).toEqual(["inapp"]);
    // Both still get in-app rows.
    expect(store.notifications.filter((n) => n.userId === "u-buyer").length).toBeGreaterThan(0);
  });

  it("returns ok:false without a store or DB, and on an empty catalogue", async () => {
    expect(await runMoneyRadarSweep({ now: TODAY, db: null })).toMatchObject({ ok: false, error: "supabase_unavailable" });
    const store = fakeStore({ subscribers: [RADAR], catalogue: { grants: [], programs: [] } });
    expect(await runMoneyRadarSweep({ now: TODAY, store })).toMatchObject({ ok: false, error: "empty_catalogue" });
  });

  it("planNotifications alone: no events → no rows; only new_match → one batch row", () => {
    expect(planNotifications(target(RADAR), [])).toEqual([]);
    const ev = { type: "new_match" as const, userId: "u", projectId: null, ref_kind: "grant" as const, ref_id: "g", name: "G", score: 50, closes_at: null, days_left: null, url: null, channels: ["inapp" as const], at: day(0) };
    const rows = planNotifications(target(RADAR, null), [ev]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("new_matches");
    expect(rows[0].dedupeKey).toBe(`new_matches:user:${day(0)}`);
  });
});

// ─── Supabase store: subscriber discovery ────────────────────────────────────

// ─── S11-A activation nudge ──────────────────────────────────────────────────
// Live fact 2026-09-11: 4 Radar subscribers, 0 targets. A subscriber the
// sweep cannot match gets the D-2 `no_profile` message as an in-app row +
// a `radar_setup` drip, one follow-up (`radar_setup_2`) at +14 d, never a
// third. The drip rows are the only state.

describe("runMoneyRadarSweep — setup nudge for zero-target subscribers (S11-A)", () => {
  beforeEach(() => vi.clearAllMocks());
  const NO_TARGETS = () => [];
  const CAT = { grants: [grant()], programs: [program()] };
  const SUB: RadarSubscriber = { ...RADAR, startup: "Acme" };

  it("zero targets → one in-app radar_setup_nudge (dedupe radar_setup:<user>, 30 d) + one radar_setup drip with live counts", async () => {
    const store = fakeStore({ subscribers: [SUB], catalogue: CAT, targets: NO_TARGETS });
    const s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.ok).toBe(true);
    expect(s.targets).toBe(0);
    expect(s.setup_nudges).toEqual({ candidates: 1, inapp: 1, email: 1, skipped_recent: 0, capped: 0, unsubscribed: 0 });
    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0]).toMatchObject({
      userId: "u-radar",
      projectId: null,
      kind: "radar_setup_nudge",
      dedupeKey: "radar_setup:u-radar",
      throttleMs: SETUP_NUDGE_THROTTLE_MS,
      payload: { event: "radar_setup", touch: 1, startup: "Acme", open_grants: 1, open_programs: 1, at: day(0) },
    });
    expect(SETUP_NUDGE_THROTTLE_MS).toBe(30 * 86_400_000);
    expect(store.drips).toHaveLength(1);
    expect(store.drips[0]).toMatchObject({
      email: "r@x.au",
      userId: "u-radar",
      campaign: "radar_setup",
      payload: { startup: "Acme", open_grants: 1, open_programs: 1, unsubscribe_token: "tok-1" },
    });
    // No funding_matches touched.
    expect(store.rows).toHaveLength(0);
  });

  it("a subscriber with a target gets the normal fan-out and no setup nudge", async () => {
    const store = fakeStore({ subscribers: [SUB], catalogue: CAT });
    const s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.targets).toBe(1);
    expect(s.setup_nudges).toEqual({ candidates: 0, inapp: 0, email: 0, skipped_recent: 0, capped: 0, unsubscribed: 0 });
    expect(store.notifications.some((n) => n.kind === "radar_setup_nudge")).toBe(false);
    expect(store.drips).toHaveLength(0);
  });

  it("second touch exactly at +14 d if still empty, then never again (cap 2, ever)", async () => {
    const store = fakeStore({ subscribers: [SUB], catalogue: CAT, targets: NO_TARGETS });
    const at = (d: number) => new Date(TODAY.getTime() + d * 86_400_000);

    await runMoneyRadarSweep({ now: TODAY, store });
    expect(store.drips.map((d) => d.campaign)).toEqual(["radar_setup"]);

    // +7 d: first touch too recent — nothing, reported as skipped_recent.
    store.setClock(at(7));
    let s = await runMoneyRadarSweep({ now: at(7), store });
    expect(s.setup_nudges).toMatchObject({ candidates: 1, inapp: 0, email: 0, skipped_recent: 1, capped: 0 });
    expect(store.drips).toHaveLength(1);
    expect(store.notifications).toHaveLength(1);

    // +14 d: the one follow-up, with the approved second subject's campaign.
    store.setClock(at(14));
    s = await runMoneyRadarSweep({ now: at(14), store });
    expect(s.setup_nudges).toMatchObject({ candidates: 1, inapp: 1, email: 1, skipped_recent: 0, capped: 0 });
    expect(store.drips.map((d) => d.campaign)).toEqual(["radar_setup", "radar_setup_2"]);
    expect(store.notifications).toHaveLength(2);
    expect(store.notifications[1].payload).toMatchObject({ touch: 2 });
    // Same dedupe key both times — insertNotification's 30 d throttle decides.
    expect(store.notifications[1].dedupeKey).toBe("radar_setup:u-radar");

    // +21 d, +60 d, +400 d: capped forever.
    for (const d of [21, 60, 400]) {
      store.setClock(at(d));
      s = await runMoneyRadarSweep({ now: at(d), store });
      expect(s.setup_nudges, `day ${d}`).toMatchObject({ candidates: 1, inapp: 0, email: 0, skipped_recent: 0, capped: 1 });
    }
    expect(store.drips).toHaveLength(2);
    expect(store.notifications).toHaveLength(2);
  });

  it("planSetupNudge: none → 1; radar_setup < 14 d → recent; ≥ 14 d → 2; radar_setup_2 (or 2 rows) → capped; cancelled rows still count", () => {
    const first = (d: number): RadarSetupTouch => ({ campaign: "radar_setup", scheduled_for: new Date(TODAY.getTime() - d * 86_400_000).toISOString() });
    expect(planSetupNudge([], TODAY)).toEqual({ touch: 1, campaign: "radar_setup" });
    expect(planSetupNudge([first(13)], TODAY)).toEqual({ touch: null, reason: "recent" });
    expect(planSetupNudge([first(14)], TODAY)).toEqual({ touch: 2, campaign: "radar_setup_2" });
    expect(planSetupNudge([first(90)], TODAY)).toEqual({ touch: 2, campaign: "radar_setup_2" });
    expect(planSetupNudge([{ campaign: "radar_setup_2", scheduled_for: day(-1) }, first(15)], TODAY)).toEqual({ touch: null, reason: "capped" });
    expect(planSetupNudge([first(40), first(20)], TODAY)).toEqual({ touch: null, reason: "capped" });
    // Same UTC day, a few seconds later than the first touch → still exactly 14 days.
    const w0 = new Date(Date.UTC(2026, 8, 13, 5, 0, 30));
    const w2 = new Date(Date.UTC(2026, 8, 27, 5, 0, 5));
    expect(planSetupNudge([{ campaign: "radar_setup", scheduled_for: w0.toISOString() }], w2)).toEqual({ touch: 2, campaign: "radar_setup_2" });
  });

  it("dryRun reports setup_nudges { inapp, email, skipped_recent } and writes nothing", async () => {
    const store = fakeStore({ subscribers: [SUB, { ...RADAR, userId: "u-2", email: "two@x.au" }], catalogue: CAT, targets: NO_TARGETS });
    const s = await runMoneyRadarSweep({ now: TODAY, store, dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(s.setup_nudges).toMatchObject({ candidates: 2, inapp: 2, email: 2, skipped_recent: 0, capped: 0 });
    expect(store.writes).toBe(0);
    expect(store.notifications).toHaveLength(0);
    expect(store.drips).toHaveLength(0);
    // A recent first touch is counted as skipped_recent on a dry run too.
    store.drips.push({ email: "r@x.au", userId: "u-radar", campaign: "radar_setup", payload: {}, scheduled_for: day(-3) });
    const s2 = await runMoneyRadarSweep({ now: TODAY, store, dryRun: true });
    expect(s2.setup_nudges).toMatchObject({ candidates: 2, inapp: 1, email: 1, skipped_recent: 1 });
    expect(store.notifications).toHaveLength(0);
    expect(store.drips).toHaveLength(1);
  });

  it("email opt-out (canSendEmail money_radar = false): in-app still written, no drip queued, counted as unsubscribed", async () => {
    const store = fakeStore({ subscribers: [SUB], catalogue: CAT, targets: NO_TARGETS, optedOut: ["r@x.au"] });
    const s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.setup_nudges).toEqual({ candidates: 1, inapp: 1, email: 0, skipped_recent: 0, capped: 0, unsubscribed: 1 });
    expect(store.notifications).toHaveLength(1);
    expect(store.drips).toHaveLength(0);
  });

  it("in-app-only A$3 buyers are not Radar subscribers and are never nudged; a subscriber without an address gets in-app only", async () => {
    const store = fakeStore({
      subscribers: [BUYER, { ...RADAR, userId: "u-noemail", email: null }],
      catalogue: CAT,
      targets: NO_TARGETS,
    });
    const s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.setup_nudges).toMatchObject({ candidates: 1, inapp: 1, email: 0 });
    expect(store.notifications.map((n) => n.userId)).toEqual(["u-noemail"]);
    expect(store.drips).toHaveLength(0);
  });

  it("a duplicate drip (30 d dedupe) is not counted as an email; a drip error counts as a sweep error, not a crash", async () => {
    const store = fakeStore({ subscribers: [SUB], catalogue: CAT, targets: NO_TARGETS });
    store.enqueueSetupDrip = async () => "duplicate";
    let s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.setup_nudges).toMatchObject({ inapp: 1, email: 0 });
    expect(s.errors).toBe(0);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    store.enqueueSetupDrip = async () => "error";
    s = await runMoneyRadarSweep({ now: TODAY, store });
    expect(s.ok).toBe(true);
    expect(s.errors).toBe(1);
  });

  it("openCounts counts open, matchable rows only", () => {
    const cat = {
      grants: [grant(), grant({ id: "g-closed", status: "closed" }), grant({ id: "g-x", exclude_from_matching: true })],
      programs: [program(), program({ id: "p-up", status: "upcoming", applications_open: day(30), applications_close: day(60) })],
    };
    expect(openCounts(cat, TODAY)).toEqual({ open_grants: 1, open_programs: 1 });
  });

  it("the Supabase store delegates: touches → listRadarSetupTouches(db), gate → canSendEmail + prefs token, enqueue → enqueueRadarSetupDrip(db)", async () => {
    const db = { from: () => ({}) };
    const store = createSupabaseRadarStore(db);
    listTouchesMock.mockResolvedValueOnce([{ campaign: "radar_setup", scheduled_for: day(-20) }]);
    expect(await store.listSetupTouches("r@x.au")).toEqual([{ campaign: "radar_setup", scheduled_for: day(-20) }]);
    expect(listTouchesMock).toHaveBeenCalledWith("r@x.au", { db });
    canSendEmailMock.mockResolvedValueOnce(false);
    expect(await store.emailGate("r@x.au")).toEqual({ allowed: false, token: "tok-1" });
    expect(canSendEmailMock).toHaveBeenCalledWith("r@x.au", "money_radar");
    const payload: DripPayload = { startup: "Acme", open_grants: 1, open_programs: 1 };
    expect(await store.enqueueSetupDrip("r@x.au", "u-radar", "radar_setup_2", payload)).toBe("queued");
    expect(enqueueSetupMock).toHaveBeenCalledWith("r@x.au", "u-radar", "radar_setup_2", payload, { db });
  });
});

describe("createSupabaseRadarStore.listSubscribers", () => {
  /** Query-builder fake: every chain resolves to the canned result for its table. */
  function fakeDb(results: Record<string, unknown[]>) {
    const calls: Array<{ table: string; ops: string[] }> = [];
    return {
      calls,
      from(table: string) {
        const call = { table, ops: [] as string[] };
        calls.push(call);
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        for (const op of ["select", "in", "eq", "not", "gte", "gt", "limit", "order", "is"]) {
          chain[op] = (...args: unknown[]) => {
            call.ops.push(`${op}(${args.map((a) => JSON.stringify(a)).join(",")})`);
            return self();
          };
        }
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: results[table] ?? [], error: null });
        chain.maybeSingle = async () => ({ data: (results[table] ?? [])[0] ?? null, error: null });
        return chain;
      },
    };
  }

  it("unions plan-flag users, per-user grants and 90-day report buyers with the right channels", async () => {
    const db = fakeDb({
      plans: [
        { id: "founder_starter", feature_flags: ["grant_finder", "money_radar"] },
        { id: "founder_free", feature_flags: [] },
      ],
      app_users: [
        { id: "u-plan", email: "p@x.au", plan: "founder_starter" },
        { id: "u-grant", email: "g@x.au", plan: "founder_free" },
        { id: "u-buyer", email: "b@x.au", plan: "founder_free" },
      ],
      entitlements: [{ user_id: "u-grant", expires_at: null }],
      funding_reports: [{ user_id: "u-buyer" }, { user_id: "u-plan" }],
    });
    const store = createSupabaseRadarStore(db);
    const subs = await store.listSubscribers(TODAY);
    // The fake returns all app_users for every `.in()` so dedupe is what we check.
    const byId = new Map(subs.map((s) => [s.userId, s]));
    expect(byId.get("u-plan")?.channels).toEqual(["inapp", "email", "ics"]);
    expect(byId.get("u-grant")?.channels).toEqual(["inapp", "email", "ics"]);
    expect(subs.filter((s) => s.userId === "u-plan")).toHaveLength(1);
    const reportsCall = db.calls.find((c) => c.table === "funding_reports")!;
    const since = new Date(TODAY.getTime() - PAID_REPORT_LOOKBACK_DAYS * 86_400_000).toISOString();
    expect(reportsCall.ops).toContain(`gte("created_at",${JSON.stringify(since)})`);
    expect(reportsCall.ops).toContain('eq("status","ready")');
    const planUsers = db.calls.find((c) => c.table === "app_users")!;
    expect(planUsers.ops).toContain('in("plan",["founder_starter"])');
  });

  // Review 2026-09-10 #5: a Startup Package buyer on the Free plan holds
  // `money_radar` only through `app_users.money_radar_until` (timed grant) —
  // no plan flag, no entitlements row, and no A$3 report. The sweep must
  // still target them, with the full channel set, for the 90-day window.
  it("adds app_users with a live money_radar_until as a third source with inapp+email+ics, deduped and expired excluded", async () => {
    // Query-builder fake that understands enough of the chain to route the
    // app_users query by its filters (plan-flag `.in("plan")`, id `.in("id")`,
    // timed `.gt("money_radar_until")`).
    const openUntil = new Date(TODAY.getTime() + 60 * 86_400_000).toISOString();
    const closedUntil = new Date(TODAY.getTime() - 86_400_000).toISOString();
    const users = [
      { id: "u-plan", email: "p@x.au", plan: "founder_starter", money_radar_until: null },
      { id: "u-pkg-free", email: "pkg@x.au", plan: "founder_free", money_radar_until: openUntil },
      { id: "u-pkg-expired", email: "old@x.au", plan: "founder_free", money_radar_until: closedUntil },
      { id: "u-plan-and-pkg", email: "both@x.au", plan: "founder_starter", money_radar_until: openUntil },
    ];
    const calls: Array<{ table: string; ops: string[] }> = [];
    const db = {
      from(table: string) {
        const call = { table, ops: [] as string[] };
        calls.push(call);
        const filters: Array<[string, string, unknown]> = [];
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "in", "eq", "not", "gte", "gt", "limit", "order", "is"]) {
          chain[op] = (...args: unknown[]) => {
            call.ops.push(`${op}(${args.map((a) => JSON.stringify(a)).join(",")})`);
            if (op === "in" || op === "gt") filters.push([op, String(args[0]), args[1]]);
            return chain;
          };
        }
        chain.then = (resolve: (v: unknown) => void) => {
          if (table === "plans") return resolve({ data: [{ id: "founder_starter", feature_flags: ["money_radar"] }], error: null });
          if (table !== "app_users") return resolve({ data: [], error: null });
          const data = users.filter((u) =>
            filters.every(([op, col, v]) => {
              const cell = (u as Record<string, unknown>)[col];
              if (op === "in") return (v as unknown[]).includes(cell);
              return typeof cell === "string" && cell > String(v);
            }),
          );
          return resolve({ data, error: null });
        };
        return chain;
      },
    };
    const store = createSupabaseRadarStore(db);
    const subs = await store.listSubscribers(TODAY);
    const byId = new Map(subs.map((s) => [s.userId, s]));
    expect(byId.get("u-pkg-free")?.channels).toEqual(["inapp", "email", "ics"]);
    expect(byId.get("u-pkg-free")?.email).toBe("pkg@x.au");
    expect(byId.has("u-pkg-expired")).toBe(false);
    expect(subs.filter((s) => s.userId === "u-plan-and-pkg")).toHaveLength(1);
    expect(subs.filter((s) => s.userId === "u-plan")).toHaveLength(1);
    const timedCall = calls.find((c) => c.table === "app_users" && c.ops.some((o) => o.startsWith('gt("money_radar_until"')));
    expect(timedCall, "timed-grant query").toBeTruthy();
    expect(timedCall!.ops).toContain(`gt("money_radar_until",${JSON.stringify(TODAY.toISOString())})`);
  });
});
