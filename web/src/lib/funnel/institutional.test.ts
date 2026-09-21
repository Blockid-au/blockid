// G21 P0-D — institutional funnel: pure reducers + the fail-soft reader.
import { describe, expect, it } from "vitest";
import type { FunnelEventRow } from "./core";
import {
  FI_FUNNEL_EVENT_NAMES,
  PAYING_INSTITUTIONAL_PLANS,
  asInstitutionalClient,
  computeNorthStar,
  emptyDbCounts,
  isPayingInstitutional,
  monthString,
  readInstitutionalFunnel,
  reduceInstitutional,
  type InstitutionalClient,
  type InstitutionalResult,
} from "./institutional";

const row = (event_name: string, params: Record<string, unknown> = {}, extra: Partial<FunnelEventRow> = {}): FunnelEventRow => ({
  event_id: extra.event_id ?? `${event_name}-${Math.random().toString(36).slice(2, 8)}`,
  event_name,
  user_id: extra.user_id ?? null,
  session_id: extra.session_id ?? null,
  params,
  ts: extra.ts ?? "2026-09-20T01:00:00.000Z",
  source: "server",
});

const metric = (sections: ReturnType<typeof reduceInstitutional>, key: string) => {
  for (const s of sections) for (const m of s.metrics) if (m.key === key) return m;
  throw new Error(`metric ${key} missing`);
};

describe("reduceInstitutional (pure)", () => {
  it("returns the six sections in FI order with every metric labelled live / p1 / p2 / p3", () => {
    const sections = reduceInstitutional([]);
    expect(sections.map((s) => s.key)).toEqual(["acquisition", "activation", "engagement", "revenue", "trust", "data_moat"]);
    for (const s of sections) {
      expect(s.metrics.length).toBeGreaterThanOrEqual(4);
      for (const m of s.metrics) {
        expect(["live", "p1", "p2", "p3"]).toContain(m.status);
        if (m.status !== "live") expect(m.value).toBeNull();
        expect(m.note.length).toBeGreaterThan(5);
      }
    }
    // the metrics with no data path today are never faked as 0
    expect(metric(sections, "pilot_page_views").status).toBe("p1");
    // G21 P3-A: the outcome ledger is live — a null value means the table is unreachable, never a fake zero.
    expect(metric(sections, "known_outcomes").status).toBe("live");
    expect(metric(sections, "known_outcomes").value).toBeNull();
    expect(metric(sections, "proposals_pending").status).toBe("live");
    expect(metric(sections, "claim_evidence_records").status).toBe("live");
    expect(metric(sections, "comparison_sessions").status).toBe("p2");
  });

  it("counts imports, first assessments, evidence, paid pilots + pilot revenue, renewals; QA rows excluded; db counts pass through", () => {
    const rows: FunnelEventRow[] = [
      row("website_imported", { project_id: "p1", url_host: "a.com" }, { user_id: "u1" }),
      row("website_imported", { project_id: "p1", url_host: "a.com" }, { user_id: "u1" }),
      row("evidence_upload", { project_id: "p2", evidence_kind: "pitch_deck", fi_event: "deck_uploaded" }, { user_id: "u2" }),
      row("evidence_upload", { project_id: "p2", evidence_kind: "cap_table" }, { user_id: "u2" }),
      row("evidence_upload", { project_id: "p9", evidence_kind: "pitch_deck", qa: true }, { user_id: "qa" }),
      row("svi_score_computed", { project_id: "p1", score: 120 }, { user_id: "u1" }),
      row("svi_score_computed", { project_id: "p1", score: 121 }, { user_id: "u1" }),
      row("svi_score_computed", { project_id: "p2", score: 90 }, { user_id: "u2" }),
      row("pilot_started", { pilot_id: "x", sku: "cohort_pilot_25", amount_cents: 150000, pilot_source: "paid" }, { user_id: "org1" }),
      row("pilot_started", { pilot_id: "y", sku: "comp", amount_cents: 0, pilot_source: "comp" }, { user_id: "org2" }),
      row("subscription_renewed", { invoice_id: "in_1", gross_aud_cents: 34900 }, { user_id: "org1" }),
      row("dossier_view", { evaluation_id: "e1" }, { user_id: "org1" }),
      row("dossier_view", { evaluation_id: "e2" }, { user_id: "org1" }),
      row("score_recalculated", { project_id: "p1", reason: "evidence" }, { user_id: "u1" }),
    ];
    const db = { ...emptyDbCounts(), program_leads: 3, demo_leads: 1, companies: 200, snapshots: 3400, evidence_records: 50, longitudinal_companies: 40, verified_claims: 2, mrr_cents: 69800, paying_orgs: 2 };
    const s = reduceInstitutional(rows, db);
    expect(metric(s, "startups_imported").value).toBe(2);
    expect(metric(s, "first_assessments").value).toBe(2);
    expect(metric(s, "founder_evidence").value).toBe(1);
    expect(metric(s, "evidence_updates").value).toBe(2);
    expect(metric(s, "paid_pilots").value).toBe(1);
    expect(metric(s, "pilot_revenue").value).toBe(150000);
    expect(metric(s, "pilot_revenue").unit).toBe("aud_cents");
    expect(metric(s, "renewals").value).toBe(1);
    expect(metric(s, "evaluator_dossier_views").value).toBe(1);
    expect(metric(s, "rescores").value).toBe(1);
    expect(metric(s, "program_leads").value).toBe(3);
    expect(metric(s, "demos").value).toBe(1);
    expect(metric(s, "mrr").value).toBe(69800);
    expect(metric(s, "arr").value).toBe(69800 * 12);
    expect(metric(s, "arpa").value).toBe(34900);
    expect(metric(s, "companies").value).toBe(200);
    expect(metric(s, "longitudinal_companies").value).toBe(40);
    const moat = reduceInstitutional([], { ...emptyDbCounts(), known_outcomes: 7, proposals_pending: 3, claim_evidence_records: 90 });
    expect(metric(moat, "known_outcomes").value).toBe(7);
    expect(metric(moat, "proposals_pending").value).toBe(3);
    expect(metric(moat, "claim_evidence_records").value).toBe(90);
    expect(metric(s, "verified_claims").value).toBe(2);
  });

  it("null db counts stay null (unavailable ≠ zero) and ARPA is null without paying orgs", () => {
    const s = reduceInstitutional([], { ...emptyDbCounts(), mrr_cents: 1000, paying_orgs: 0 });
    expect(metric(s, "companies").value).toBeNull();
    expect(metric(s, "mrr").value).toBe(1000);
    expect(metric(s, "arpa").value).toBeNull();
  });

  it("reads every FI native event name plus the aliased canonical ones", () => {
    for (const n of ["website_imported", "evidence_verified", "score_recalculated", "cohort_created", "startup_added_to_cohort", "batch_scored", "pilot_started", "subscription_renewed", "svi_score_computed", "dossier_view", "assessment_submitted", "checkout_completed"]) {
      expect(FI_FUNNEL_EVENT_NAMES).toContain(n);
    }
  });
});

describe("computeNorthStar (pure)", () => {
  const items = [
    { batch_id: "b1", scored_at: "2026-09-03T10:00:00Z", status: "done" },
    { batch_id: "b1", scored_at: "2026-09-04T10:00:00Z", status: "done" },
    { batch_id: "b1", scored_at: "2026-09-05T10:00:00Z", status: "failed" },
    { batch_id: "b2", scored_at: "2026-09-06T10:00:00Z", status: "done" },
    { batch_id: "b3", scored_at: "2026-09-07T10:00:00Z", status: "done" },
    { batch_id: "b4", scored_at: "2026-08-30T10:00:00Z", status: "done" },
    { batch_id: "b5", scored_at: null, status: "queued" },
    { batch_id: "b6", scored_at: "2026-09-08T10:00:00Z", status: "done" },
  ];
  const batches = [
    { id: "b1", user_id: "program" },
    { id: "b2", user_id: "scout" },
    { id: "b3", user_id: "pilot" },
    { id: "b4", user_id: "program" },
    { id: "b6", user_id: "qa" },
  ];
  const owners = [
    { id: "program", plan: "accelerator_starter" },
    { id: "scout", plan: "investor_angel" },
    { id: "pilot", plan: "free", paid_pilot: true },
    { id: "qa", plan: "accelerator_growth", email: "qa-live-20260920-1200@blockid.au" },
  ];

  it("counts done items scored in the month whose batch owner pays (plan or paid pilot); QA owners, other months and failed items excluded", () => {
    const ns = computeNorthStar(items, batches, owners, "2026-09");
    expect(ns).toEqual({ month: "2026-09", assessed: 3, assessed_all: 4, paying_batches: 2, paying_orgs: 2, partial: null });
  });

  it("with the owner join unavailable it counts what it can and labels the rest", () => {
    const ns = computeNorthStar(items, [], [], "2026-09", { partial: "app_users unavailable" });
    expect(ns.assessed).toBe(0);
    expect(ns.assessed_all).toBe(5);
    expect(ns.partial).toBe("app_users unavailable");
  });

  it("isPayingInstitutional + monthString", () => {
    for (const plan of PAYING_INSTITUTIONAL_PLANS) expect(isPayingInstitutional({ plan })).toBe(true);
    expect(isPayingInstitutional({ plan: "investor_angel" })).toBe(false);
    expect(isPayingInstitutional({ plan: "free", paid_pilot: true })).toBe(true);
    expect(isPayingInstitutional(undefined)).toBe(false);
    expect(monthString(Date.UTC(2026, 8, 20, 23, 59))).toBe("2026-09");
  });
});

describe("readInstitutionalFunnel (fail-soft)", () => {
  function fakeClient(tables: Record<string, InstitutionalResult | Error>): InstitutionalClient {
    const q = (table: string) => {
      const res = tables[table] ?? { data: [], count: 0, error: null };
      const self: Record<string, unknown> = {};
      const chain = () => self;
      Object.assign(self, {
        in: chain,
        gte: chain,
        eq: chain,
        limit: chain,
        order: chain,
        then: (onOk: (v: InstitutionalResult) => unknown, onErr?: (e: unknown) => unknown) => (res instanceof Error ? Promise.reject(res).then(onOk, onErr) : Promise.resolve(res).then(onOk, onErr)),
      });
      return self as unknown as ReturnType<InstitutionalClient["from"]>["select"] extends (...a: never[]) => infer R ? R : never;
    };
    return { from: (table: string) => ({ select: () => q(table) }) };
  }

  it("returns null metrics + warnings without a client, and never throws on a failing table", async () => {
    const none = await readInstitutionalFunnel(null, Date.UTC(2026, 8, 20), "/nonexistent");
    expect(none.warnings).toContain("supabase not configured");
    expect(none.northStar).toBeNull();
    expect(none.sections).toHaveLength(6);

    const client = fakeClient({
      analytics_events: { data: [row("pilot_started", { amount_cents: 250000, pilot_source: "paid" }, { user_id: "o", ts: "2026-09-19T00:00:00.000Z" })], error: null },
      projects: { data: null, count: 12, error: null },
      svi_snapshots: new Error("boom"),
      evaluation_batch_items: { data: [{ batch_id: "b1", scored_at: "2026-09-02T00:00:00Z", status: "done" }], error: null },
      evaluation_batches: { data: [{ id: "b1", user_id: "org" }], error: null },
      app_users: { data: [{ id: "org", plan: "investor_fund" }], error: null },
      pilot_orders: new Error("relation does not exist"),
    });
    const out = await readInstitutionalFunnel(client, Date.UTC(2026, 8, 20), "/nonexistent");
    expect(out.window.days).toBe(28);
    const paid = out.sections.find((s) => s.key === "acquisition")!.metrics.find((m) => m.key === "paid_pilots")!;
    expect(paid.value).toBe(1);
    expect(out.sections.find((s) => s.key === "data_moat")!.metrics.find((m) => m.key === "companies")!.value).toBe(12);
    expect(out.sections.find((s) => s.key === "data_moat")!.metrics.find((m) => m.key === "snapshots")!.value).toBeNull();
    expect(out.warnings.some((w) => w.startsWith("svi_snapshots"))).toBe(true);
    expect(out.warnings.some((w) => w.startsWith("traction-snapshot.json"))).toBe(true);
    expect(out.northStar).toMatchObject({ month: "2026-09", assessed: 1, assessed_all: 1, paying_batches: 1, paying_orgs: 1 });
    expect(asInstitutionalClient(null)).toBeNull();
  });
});
