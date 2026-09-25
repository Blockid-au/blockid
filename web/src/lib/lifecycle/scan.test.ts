// G34-BT4 — the lifecycle scan: who is due for each flow, what is queued,
// and that a dry run writes nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const { consent, prefs, digestMock, nudgeMock } = vi.hoisted(() => ({
  consent: new Set<string>(),
  prefs: new Map<string, Record<string, unknown>>(),
  digestMock: vi.fn(),
  nudgeMock: vi.fn(),
}));
vi.mock("@/lib/email-sends", () => ({ hasCommercialConsent: async (e: string) => consent.has(e) }));
vi.mock("@/lib/email-preferences", () => ({
  getEmailPreferences: async (e: string) => prefs.get(e) ?? null,
  getUnsubscribeUrl: (t: string, c?: string) => `https://blockid.au/unsubscribe?token=${t}${c ? `&category=${c}` : ""}`,
  getPreferencesUrl: (t: string) => `https://blockid.au/unsubscribe?token=${t}&manage=1`,
}));
vi.mock("@/lib/digest/weekly", () => ({ buildFounderDigest: (...a: unknown[]) => digestMock(...a) }));
vi.mock("@/lib/nudge/load-founder-nudge", () => ({ buildNudgeFor: (...a: unknown[]) => nudgeMock(...a) }));

import { buildEvidenceGapData, intakeProgress, parseScanFlows, peerPercentile, previousMonth, runLifecycleScan } from "./scan";
import { createFakeDb } from "./testing/fake-db";

const NOW = new Date("2026-09-24T00:30:00Z"); // Thu 10:30 AEST — inside the window
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

beforeEach(() => {
  consent.clear();
  prefs.clear();
  digestMock.mockReset();
  nudgeMock.mockReset();
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

describe("pure helpers", () => {
  it("parseScanFlows: default is the daily five; unknown names are dropped", () => {
    expect(parseScanFlows(null)).toEqual(["evidence", "intake", "rerun", "quota", "sunset"]);
    expect(parseScanFlows("digest,nope")).toEqual(["digest"]);
    expect(parseScanFlows("nope")).toEqual([]);
  });

  it("buildEvidenceGapData picks the weakest assessed dimension and its catalogue gaps", () => {
    const g = buildEvidenceGapData(
      { subs: [{ key: "tre", value: 20, assessed: false }, { key: "mpc", value: 35 }, { key: "ftv", value: 70 }, { key: "zzz", value: 1 }] },
      "2026-09-20T00:00:00Z",
    );
    expect(g?.dimension_key).toBe("mpc");
    expect(g?.lead_agent).toMatch(/^[A-Z]{3,4}$/);
    expect(g?.cta_path).toBe("/workspace/evidence/gaps?dim=mpc");
    expect(g?.missing.length).toBeGreaterThan(0);
    expect(g?.missing.length).toBeLessThanOrEqual(3);
    expect(buildEvidenceGapData({ subs: [] }, "x")).toBeNull();
  });

  it("intakeProgress reads the wizard step and names the next step for the persona's flow", () => {
    expect(intakeProgress({ step: 2, updated_at: "t" }, "founder")).toEqual({ steps_done: 1, steps_total: 3, next_step_label: "Your startup", idle_since: "t" });
    expect(intakeProgress({ step: 2, updated_at: "t" }, "investor_vc")?.next_step_label).toBe("Your mandate");
    expect(intakeProgress({ step: 9, updated_at: "t" }, null)?.steps_done).toBe(2);
    expect(intakeProgress({ step: 2 }, "founder")).toBeNull();
  });

  it("peerPercentile only with a cohort of at least 10", () => {
    const nine = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    expect(peerPercentile(55, nine)).toEqual({ percentile: null, n: 9 });
    expect(peerPercentile(55, [...nine, 100])).toEqual({ percentile: 50, n: 10 });
    expect(peerPercentile(null, [...nine, 100]).percentile).toBeNull();
  });

  it("previousMonth is the calendar month before now", () => {
    const p = previousMonth(new Date("2026-10-01T22:00:00Z"));
    expect(p.key).toBe("2026-09");
    expect(p.label).toBe("September 2026");
    expect(p.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

function evidenceWorld() {
  return createFakeDb({
    svi_analyses: [
      { email: "sam@example.com", project_id: "p1", created_at: iso(60), viewed_at: null, analysis_json: { subs: [{ key: "tre", value: 30 }, { key: "ftv", value: 60 }] } },
      { email: "has@example.com", project_id: "p2", created_at: iso(60), viewed_at: null, analysis_json: { subs: [{ key: "tre", value: 30 }] } },
      { email: "fresh@example.com", project_id: "p3", created_at: iso(10), viewed_at: null, analysis_json: { subs: [{ key: "tre", value: 30 }] } },
      { email: "noconsent@example.com", project_id: "p4", created_at: iso(60), viewed_at: null, analysis_json: { subs: [{ key: "tre", value: 30 }] } },
    ],
    svi_accounts: [
      { id: "a1", email: "sam@example.com", project_id: "p1", startup_name: "Acme" },
      { id: "a2", email: "has@example.com", project_id: "p2", startup_name: null },
      { id: "a4", email: "noconsent@example.com", project_id: "p4", startup_name: null },
    ],
    svi_evidence: [{ id: "e", account_id: "a2", label: "deck", created_at: iso(30) }],
    app_users: [
      { id: "u1", email: "sam@example.com" },
      { id: "u2", email: "has@example.com" },
      { id: "u4", email: "noconsent@example.com" },
    ],
    email_drips: [],
  });
}

describe("runLifecycleScan — EM14 evidence gap", () => {
  it("dry run lists the would-be rows and writes nothing", async () => {
    consent.add("sam@example.com");
    const db = evidenceWorld();
    const [r] = await runLifecycleScan({ db, now: NOW, dry: true }, ["evidence"]);
    expect(r.error).toBeUndefined();
    expect(r.queued).toEqual(["evidence_gap_1:sam@example.com", "evidence_gap_2:sam@example.com"]);
    expect(r.skipped).toMatchObject({ has_evidence: 1, no_consent: 1 });
    expect(db.inserts).toHaveLength(0);
  });

  it("live run queues both touches: the first now, the follow-up +7 d after the analysis, ≥ 74 h apart", async () => {
    consent.add("sam@example.com");
    prefs.set("sam@example.com", { unsubscribed_all: false, product_updates: true, unsubscribe_token: "tok" });
    const db = evidenceWorld();
    const [r] = await runLifecycleScan({ db, now: NOW, dry: false }, ["evidence"]);
    expect(r.queued).toHaveLength(2);
    const rows = db.inserts[0].rows as Array<{ campaign: string; scheduled_for: string; payload: { unsubscribe_token: string; lifecycle: { gap: { dimension_key: string } } } }>;
    expect(rows[0].scheduled_for).toBe(NOW.toISOString());
    expect(Date.parse(rows[1].scheduled_for) - Date.parse(rows[0].scheduled_for)).toBeGreaterThanOrEqual(74 * 3_600_000);
    expect(rows[0].payload.lifecycle.gap.dimension_key).toBe("tre");
    expect(rows[0].payload.unsubscribe_token).toBe("tok");
  });

  it("a category opt-out is respected before queueing", async () => {
    consent.add("sam@example.com");
    prefs.set("sam@example.com", { unsubscribed_all: false, product_updates: false });
    const [r] = await runLifecycleScan({ db: evidenceWorld(), now: NOW, dry: true }, ["evidence"]);
    expect(r.queued).toEqual([]);
    expect(r.skipped["category_off:product_updates"]).toBe(1);
  });

  it("a failing flow reports its error; the other flows still run", async () => {
    const db = evidenceWorld();
    db.failing.add("svi_analyses");
    const out = await runLifecycleScan({ db, now: NOW, dry: true }, ["evidence", "quota"]);
    expect(out[0].error).toMatch(/svi_analyses/);
    expect(out[1].flow).toBe("quota");
  });
});

describe("runLifecycleScan — EM13 / EM15 / EM16", () => {
  it("intake: idle ≥ 24 h and < 14 d, not completed", async () => {
    consent.add("new@example.com");
    const db = createFakeDb({
      app_users: [
        { id: "u1", email: "new@example.com", account_type: "founder", onboarding_completed: false, onboarding_state: { step: 2, updated_at: iso(30) }, created_at: iso(40) },
        { id: "u2", email: "busy@example.com", account_type: "founder", onboarding_completed: false, onboarding_state: { step: 2, updated_at: iso(2) }, created_at: iso(40) },
        { id: "u3", email: "done@example.com", account_type: "founder", onboarding_completed: true, onboarding_state: { step: 3, updated_at: iso(30) }, created_at: iso(40) },
      ],
      email_drips: [],
    });
    const [r] = await runLifecycleScan({ db, now: NOW, dry: true }, ["intake"]);
    expect(r.queued).toEqual(["intake_abandoned_1:new@example.com", "intake_abandoned_2:new@example.com"]);
    expect(r.skipped.not_idle_yet).toBe(1);
  });

  it("rerun: evidence newer than the last analysis, ≥ 24 h old", async () => {
    consent.add("sam@example.com");
    const db = createFakeDb({
      svi_evidence: [
        { account_id: "a1", label: "Stripe", created_at: iso(30) },
        { account_id: "a2", label: "old", created_at: iso(30) },
      ],
      svi_accounts: [
        { id: "a1", email: "sam@example.com", project_id: "p1", startup_name: "Acme" },
        { id: "a2", email: "other@example.com", project_id: "p2", startup_name: null },
      ],
      svi_analyses: [
        { email: "sam@example.com", project_id: "p1", created_at: iso(100) },
        { email: "other@example.com", project_id: "p2", created_at: iso(5) },
      ],
      app_users: [{ id: "u1", email: "sam@example.com" }],
      email_drips: [],
    });
    const [r] = await runLifecycleScan({ db, now: NOW, dry: false }, ["rerun"]);
    expect(r.queued).toEqual(["rerun_prompt:sam@example.com"]);
    expect(r.skipped.no_new_evidence).toBe(1);
    const row = db.inserts[0].rows[0] as { payload: { lifecycle: { rerun: { new_evidence_count: number; evidence_labels: string[] } } } };
    expect(row.payload.lifecycle.rerun).toMatchObject({ new_evidence_count: 1, evidence_labels: ["Stripe"] });
  });

  it("quota: second free report delivered 3–10 d ago, skipped once purchased", async () => {
    consent.add("a@example.com");
    consent.add("b@example.com");
    const db = createFakeDb({
      free_report_grants: [
        { email: "A@example.com", sequence_no: 2, delivery_status: "sent", delivered_at: iso(24 * 4) },
        { email: "b@example.com", sequence_no: 2, delivery_status: "sent", delivered_at: iso(24 * 4) },
        { email: "c@example.com", sequence_no: 2, delivery_status: "sent", delivered_at: iso(24) },
      ],
      app_users: [
        { id: "ua", email: "a@example.com", plan: "free" },
        { id: "ub", email: "b@example.com", plan: "founder_starter" },
      ],
      revenue_events: [],
      report_orders: [],
      email_drips: [],
    });
    const [r] = await runLifecycleScan({ db, now: NOW, dry: true }, ["quota"]);
    expect(r.queued).toEqual(["free_quota_used:a@example.com"]);
    expect(r.skipped.purchased).toBe(1);
  });
});

describe("runLifecycleScan — EM20 sunset", () => {
  it("asks after 90 d without a sign-in; switches commercial categories off 30 d later unless kept", async () => {
    consent.add("gone@example.com");
    prefs.set("gone@example.com", { unsubscribed_all: false, product_updates: true, weekly_reports: true });
    const db = createFakeDb({
      app_users: [
        { id: "u1", email: "gone@example.com", created_at: iso(24 * 200), last_login_at: iso(24 * 120), erased_at: null },
        { id: "u2", email: "here@example.com", created_at: iso(24 * 200), last_login_at: iso(24 * 120), erased_at: null },
        { id: "u3", email: "asked@example.com", created_at: iso(24 * 300), last_login_at: iso(24 * 200), erased_at: null },
        { id: "u4", email: "kept@example.com", created_at: iso(24 * 300), last_login_at: iso(24 * 200), erased_at: null },
      ],
      sessions: [{ user_id: "u2", last_used_at: iso(24 * 5) }],
      email_drips: [
        { email: "asked@example.com", user_id: "u3", campaign: "sunset_check", status: "sent", sent_at: iso(24 * 35), created_at: iso(24 * 36) },
        { email: "kept@example.com", user_id: "u4", campaign: "sunset_check", status: "sent", sent_at: iso(24 * 35), created_at: iso(24 * 36) },
      ],
      email_preferences: [
        { email: "asked@example.com", updated_at: iso(24 * 36), unsubscribed_all: false, weekly_reports: true, product_updates: true },
        { email: "kept@example.com", updated_at: iso(24 * 10), unsubscribed_all: false, weekly_reports: true, product_updates: true },
      ],
    });
    const [dry] = await runLifecycleScan({ db, now: NOW, dry: true }, ["sunset"]);
    expect(dry.queued).toContain("sunset_check:gone@example.com");
    expect(dry.queued).not.toContain("sunset_check:here@example.com");
    expect(dry.sunsetOff).toEqual(["asked@example.com"]);
    expect(dry.skipped["kept:preferences_saved"]).toBe(1);
    expect(db.tables.email_preferences[0].weekly_reports).toBe(true); // dry: untouched

    await runLifecycleScan({ db, now: NOW, dry: false }, ["sunset"]);
    expect(db.tables.email_preferences[0]).toMatchObject({ weekly_reports: false, product_updates: false, promotions: false, digest_weekly: false });
    expect(db.tables.email_preferences[1].weekly_reports).toBe(true);
  });
});

describe("runLifecycleScan — EM19 monthly digest", () => {
  it("includes quiet months, top-3 missing and the peer percentile only for n ≥ 10", async () => {
    consent.add("sam@example.com");
    digestMock.mockResolvedValue({ projectId: "p1", views: { count: 0 }, leads: { count: 0 }, svi: { current: 60, previous: 60, delta: 0, newSnapshot: false } });
    nudgeMock.mockResolvedValue({
      projectId: "p1",
      result: { missing: [{ title: "A", cta_url: "/workspace/a" }, { title: "B", cta_url: "https://x/b" }, { title: "C", cta_url: "/c" }, { title: "D", cta_url: "/d" }], next_action: { title: "Do A", cta_url: "/workspace/a" } },
    });
    const cohort = Array.from({ length: 12 }, (_, i) => ({ current_svi: 40 + i * 2, current_stage: 2, email: `c${i}@example.com` }));
    const db = createFakeDb({
      email_preferences: [{ email: "sam@example.com", weekly_reports: true, unsubscribed_all: false, digest_weekly: true }],
      app_users: [{ id: "u1", email: "sam@example.com", display_name: "Sam", last_login_at: iso(24 * 10) }],
      svi_accounts: [...cohort, { project_id: "p1", email: "sam@example.com", current_stage: 2, current_svi: 60, startup_name: "Acme" }],
      sessions: [],
      email_drips: [],
    });
    const [r] = await runLifecycleScan({ db, now: new Date("2026-10-01T22:00:00Z"), dry: false }, ["digest"]);
    expect(r.error).toBeUndefined();
    expect(r.queued).toEqual(["monthly_digest:sam@example.com"]);
    expect(digestMock).toHaveBeenCalledWith("u1", new Date("2026-09-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"), { includeQuiet: true });
    const d = (db.inserts[0].rows[0] as { payload: { lifecycle: { digest: Record<string, unknown> } } }).payload.lifecycle.digest;
    expect(d).toMatchObject({ period_key: "2026-09", quiet: true, svi_current: 60, cohort_n: 13, stage_label: "MVP / Prototype" });
    expect(d.percentile).toBe(77); // 10 of 13 (40..58) below 60
    expect((d.missing_top3 as unknown[]).length).toBe(3);
    expect((d.missing_top3 as Array<{ cta_url: string }>)[0].cta_url).toBe("https://blockid.au/workspace/a");

    // Same month again → dedupe.
    for (const row of db.tables.email_drips) row.created_at ??= "2026-10-01T22:00:00Z";
    const [again] = await runLifecycleScan({ db, now: new Date("2026-10-02T22:00:00Z"), dry: false }, ["digest"]);
    expect(again.queued).toEqual([]);
    expect(again.skipped.duplicate).toBe(1);
  });
});
