// G14-S33 — traction snapshot builder.
//
// Pins: the QA / seeded / erased exclusion list, evaluator plan bucketing,
// the zero-DB fallback (every figure null + warnings, never a throw), the
// 42P01 missing-table path per query, the two MRR figures + Stripe
// reconciliation, and the Zod schema round-trip.

import { describe, expect, it } from "vitest";
import {
  QA_ACCOUNT_EMAIL_PATTERNS,
  buildTractionSnapshot,
  bucketUsers,
  emptyTractionSnapshot,
  isExcludedAccountEmail,
  mrrFromSubscriptions,
  p50,
  reduceFunnel,
  tractionSnapshotSchema,
  type TractionClient,
  type TractionQuery,
  type TractionQueryResult,
} from "./snapshot";

// ─── Fake supabase: per-table rows + optional per-table error ───────────────

type Rows = Array<Record<string, unknown>>;
interface Fake {
  rows: Record<string, Rows>;
  errors: Record<string, { code: string; message: string }>;
  throws?: Set<string>;
  calls: Array<{ table: string; filters: string[]; head: boolean }>;
}

function fakeClient(fake: Fake): TractionClient {
  return {
    from(table: string): TractionQuery {
      const filters: string[] = [];
      let head = false;
      let range: [number, number] | null = null;
      const apply = (rows: Rows): Rows => {
        let out = rows;
        for (const f of filters) {
          const [op, col, val] = f.split("|");
          if (op === "eq") out = out.filter((r) => String(r[col]) === val);
          if (op === "in") out = out.filter((r) => val.split(",").includes(String(r[col])));
          if (op === "notnull") out = out.filter((r) => r[col] !== null && r[col] !== undefined);
          if (op === "gte") out = out.filter((r) => String(r[col]) >= val);
        }
        return out;
      };
      const q: TractionQuery = {
        select: (_c, opts) => {
          head = opts?.head === true;
          return q;
        },
        eq: (col, v) => (filters.push(`eq|${col}|${String(v)}`), q),
        in: (col, v) => (filters.push(`in|${col}|${v.map(String).join(",")}`), q),
        gte: (col, v) => (filters.push(`gte|${col}|${String(v)}`), q),
        not: (col, op, v) => (op === "is" && v === null ? filters.push(`notnull|${col}|`) : filters.push(`not|${col}|${String(v)}`), q),
        range: (a, b) => ((range = [a, b]), q),
        order: () => q,
        then: <R1 = TractionQueryResult, R2 = never>(
          onOk?: ((v: TractionQueryResult) => R1 | PromiseLike<R1>) | null,
          onErr?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
        ): PromiseLike<R1 | R2> => {
          fake.calls.push({ table, filters: [...filters], head });
          if (fake.throws?.has(table)) return Promise.reject(new Error(`network down for ${table}`)).then(onOk, onErr);
          const err = fake.errors[table];
          if (err) return Promise.resolve({ data: null, count: null, error: err }).then(onOk, onErr);
          const all = apply(fake.rows[table] ?? []);
          const sliced = range ? all.slice(range[0], range[1] + 1) : all;
          return Promise.resolve({ data: head ? null : sliced, count: head ? all.length : null, error: null }).then(onOk, onErr);
        },
      };
      return q;
    },
  };
}

const NOW = new Date("2026-09-16T03:20:00Z");
const recent = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();
const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString();

function fixture(): Fake {
  return {
    calls: [],
    errors: {},
    rows: {
      app_users: [
        { id: "u1", email: "founder@example.com", plan: "founder_starter", account_type: "founder" },
        { id: "u2", email: "scout@fund.vc", plan: "investor_angel", account_type: "investor_angel" },
        { id: "u3", email: "firm@fund.vc", plan: "investor_advisor", account_type: "advisor" },
        { id: "u4", email: "program@accel.au", plan: "investor_vc_small", account_type: "accelerator" },
        { id: "u5", email: "angel-no-plan@x.au", plan: "free", account_type: "investor" },
        { id: "q1", email: "qa-founder-1@blockid.au", plan: "founder_growth", account_type: "founder" },
        { id: "q2", email: "qa-live-20260916-1327@blockid.au", plan: "growth", account_type: "founder" },
        { id: "q3", email: "qa-live-member-20260916-1327@blockid.au", plan: "free", account_type: "founder" },
        { id: "q4", email: "deleted+723da7d3f66c8f47112ebceb@erased.blockid.au", plan: "free", account_type: null },
        { id: "q5", email: "QA-Reseller-Wholesale-Active@BlockID.au", plan: "investor_angel", account_type: "investor_angel" },
      ],
      svi_analyses: [{ id: 1 }, { id: 2 }, { id: 3 }],
      analyses: [{ id: 1 }, { id: 2 }],
      guest_analyses: [{ id: 1, status: "paid" }, { id: 2, status: "delivered" }, { id: 3, status: "pending" }, { id: 4, status: "refunded" }],
      report_orders: [{ id: 1, status: "PAID" }, { id: 2, status: "READY" }, { id: 3, status: "CHECKOUT_INITIATED" }, { id: 4, status: "REFUNDED" }],
      svi_snapshots: [{ id: 1, report_share_token: "abc" }, { id: 2, report_share_token: null }],
      tbr_views: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      subscription_trial_state: [
        { user_id: "u2", plan_id: "investor_angel", status: "active" },
        { user_id: "u3", plan_id: "investor_advisor", status: "trialing" },
        { user_id: "u4", plan_id: "investor_vc_small", status: "active" },
        { user_id: "u1", plan_id: "founder_starter", status: "active" },
        { user_id: "q5", plan_id: "investor_angel", status: "active" }, // QA — excluded
        { user_id: "q2", plan_id: "investor_vc_small", status: "trialing" }, // QA — excluded
      ],
      plans: [
        { id: "investor_angel", price_aud_cents: 7900, interval: "monthly" },
        { id: "investor_advisor", price_aud_cents: 14900, interval: "monthly" },
        { id: "investor_vc_small", price_aud_cents: 34900 * 12, interval: "yearly" },
        { id: "founder_starter", price_aud_cents: 2900, interval: "monthly" },
        { id: "free", price_aud_cents: 0, interval: "free" },
      ],
      evaluation_reports: [
        { user_id: "u2" }, { user_id: "u2" }, { user_id: "u2" },
        { user_id: "u4" },
        { user_id: "q5" }, { user_id: "q5" }, { user_id: "q5" }, { user_id: "q5" }, // QA — excluded
      ],
      evaluation_assessments: [],
      share_packages: [{ id: 1 }, { id: 2 }],
      api_keys: [{ id: 1, is_active: true }, { id: 2, is_active: false }],
      webhook_endpoints: [{ id: 1, active: true }, { id: 2, active: true }, { id: 3, active: false }],
      revenue_events: [
        { net_aud_cents: 7900, kind: "subscribe", ts: recent, user_id: "u2" },
        { net_aud_cents: 2900, kind: "renewal", ts: recent, user_id: "u1" },
        { net_aud_cents: 500, kind: "credit_pack", ts: recent, user_id: "u1" }, // wrong kind
        { net_aud_cents: 7900, kind: "subscribe", ts: old, user_id: "u2" }, // too old
        { net_aud_cents: 7900, kind: "subscribe", ts: recent, user_id: "q5" }, // QA
      ],
      analytics_events: [
        { event_name: "hero_variant_shown", ts: recent, user_id: null },
        { event_name: "hero_variant_shown", ts: recent, user_id: null },
        { event_name: "funding_report_paid", ts: recent, user_id: "u1" },
        { event_name: "dossier_view", ts: recent, user_id: "q2" }, // QA
        { event_name: "checkout_completed", ts: old, user_id: "u1" }, // too old
        // G16-A step funnel (funnel_7d_v2): u1 signed up + analysed (twice → one actor), a
        // qa-flagged sign_up must be dropped by the reducer even before the keptIds filter.
        { event_id: "e1", event_name: "sign_up", ts: recent, user_id: "u1", params: { method: "google", segment: "founder" } },
        { event_id: "e2", event_name: "svi_analyze", ts: recent, user_id: "u1", params: { first: true, project_id: "p1" } },
        { event_id: "e3", event_name: "svi_analyze", ts: recent, user_id: "u1", params: { first: false, project_id: "p1" } },
        { event_id: "e4", event_name: "feature_gate_hit", ts: recent, user_id: "u1", params: { feature: "cap_table.write" } },
        { event_id: "e5", event_name: "sign_up", ts: recent, user_id: "u2", params: { method: "email", segment: "founder", qa: true } },
      ],
    },
  };
}

// ─── Exclusion list ─────────────────────────────────────────────────────────

describe("QA_ACCOUNT_EMAIL_PATTERNS / isExcludedAccountEmail", () => {
  it("excludes seeded qa-<segment>-<n>, live-QA founder + member, reseller fixtures, and erased tombstones", () => {
    for (const e of [
      "qa-founder-1@blockid.au",
      "qa-investor_vc-2@blockid.au",
      "qa-reseller-1@blockid.au",
      "qa-founder-attributed-1@blockid.au",
      "qa-reseller-wholesale-active@blockid.au",
      "qa-live-20260916-1327@blockid.au",
      "qa-live-member-20260916-1327@blockid.au",
      "deleted+723da7d3f66c8f47112ebceb@erased.blockid.au",
      "x@erased.blockid.au",
      "  QA-Founder-3@BlockID.au  ",
    ]) {
      expect(isExcludedAccountEmail(e), e).toBe(true);
    }
  });

  it("keeps real founders / evaluators, the admin, and look-alikes on other domains", () => {
    for (const e of ["founder@example.com", "admin@blockid.au", "qa@example.com", "qa-founder-1@blockid.au.evil.com", "someone+qa-live@gmail.com", "", null, undefined]) {
      expect(isExcludedAccountEmail(e), String(e)).toBe(false);
    }
  });

  it("is a frozen, named list with the three documented sources", () => {
    expect(Object.isFrozen(QA_ACCOUNT_EMAIL_PATTERNS)).toBe(true);
    expect(QA_ACCOUNT_EMAIL_PATTERNS.length).toBeGreaterThanOrEqual(3);
    expect(QA_ACCOUNT_EMAIL_PATTERNS.some((re) => re.test("qa-live-20260101-0000@blockid.au"))).toBe(true);
    expect(QA_ACCOUNT_EMAIL_PATTERNS.some((re) => re.test("deleted+abc@erased.blockid.au"))).toBe(true);
  });
});

// ─── Pure helpers ───────────────────────────────────────────────────────────

describe("bucketUsers", () => {
  it("drops excluded rows, counts founders, buckets evaluators by plan (account_type fallback → no_plan)", () => {
    const b = bucketUsers(fixture().rows.app_users as never);
    expect(b.excluded_count).toBe(5);
    expect(b.kept.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4", "u5"]);
    expect(b.founders).toBe(1);
    expect(b.evaluators_by_plan).toEqual({ investor_angel: 1, investor_advisor: 1, investor_vc_small: 1, free: 1 });
  });
});

describe("p50", () => {
  it("median with midpoint on even length; null on empty", () => {
    expect(p50([])).toBeNull();
    expect(p50([3])).toBe(3);
    expect(p50([1, 3])).toBe(2);
    expect(p50([5, 1, 3])).toBe(3);
    expect(p50([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("mrrFromSubscriptions", () => {
  it("active × monthly price, yearly ÷ 12, trials counted for evaluator plans only, QA ids dropped", () => {
    const f = fixture();
    const kept = new Set(["u1", "u2", "u3", "u4", "u5"]);
    const m = mrrFromSubscriptions(f.rows.subscription_trial_state as never, f.rows.plans as never, kept);
    expect(m.cents).toBe(7900 + 34900 + 2900);
    expect(m.active).toBe(3);
    expect(m.trials).toBe(1);
    expect(m.paying_by_plan).toEqual({ investor_angel: 1, investor_vc_small: 1 });
    const all = mrrFromSubscriptions(f.rows.subscription_trial_state as never, f.rows.plans as never, null);
    expect(all.active).toBe(4);
    expect(all.trials).toBe(2);
  });
});

describe("reduceFunnel", () => {
  it("counts by name, sorts by count then name, caps at top-N", () => {
    const rows = [{ event_name: "b" }, { event_name: "a" }, { event_name: "b" }, { event_name: "c" }, { event_name: " " }, { event_name: null }];
    expect(reduceFunnel(rows)).toEqual({ b: 2, a: 1, c: 1 });
    expect(Object.keys(reduceFunnel(rows, 1))).toEqual(["b"]);
  });
});

// ─── Builder ────────────────────────────────────────────────────────────────

describe("buildTractionSnapshot", () => {
  it("zero-DB fallback: every figure null, one warning, schema-valid", async () => {
    const snap = await buildTractionSnapshot({ supabase: null, now: NOW, gitSha: "abc123" });
    expect(snap).toEqual({ ...emptyTractionSnapshot(NOW, "abc123"), warnings: ["supabase: not configured — every figure is null"] });
    expect(tractionSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap.users.total).toBeNull();
    expect(snap.mrr_aud_cents.from_subscriptions).toBeNull();
  });

  it("full fixture: QA excluded everywhere, both MRR figures, Stripe reconciled, funnel top names", async () => {
    const f = fixture();
    const stripe = { subscriptions: { list: async () => ({ data: [{ id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }], has_more: false }) } };
    const snap = await buildTractionSnapshot({ supabase: fakeClient(f), stripe, now: NOW, gitSha: "deadbeef" });

    expect(snap.generated_at).toBe(NOW.toISOString());
    expect(snap.git_sha).toBe("deadbeef");
    expect(snap.users).toEqual({ total: 5, founders: 1, evaluators_by_plan: { investor_angel: 1, investor_advisor: 1, investor_vc_small: 1, free: 1 }, excluded_count: 5 });
    expect(snap.analyses).toEqual({ svi_analyses: 3, analyses: 2, guest_analyses_paid: 2 });
    expect(snap.tbr).toEqual({ purchased: 2, shared: 1, views: 5 });
    expect(snap.evaluators.trials).toBe(1);
    expect(snap.evaluators.paying_by_plan).toEqual({ investor_angel: 1, investor_vc_small: 1 });
    // u2 → 3 reports, u4 → 1; QA u q5's 4 reports dropped → median of [3, 1] = 2
    expect(snap.evaluators.reports_per_evaluator_p50).toBe(2);
    expect(snap.assessments).toEqual({ submitted: 0, shared_with_founder: 0 });
    expect(snap.share_links).toBe(2);
    expect(snap.api_keys_active).toBe(1);
    expect(snap.webhooks_active).toBe(2);
    expect(snap.mrr_aud_cents).toEqual({ from_subscriptions: 7900 + 34900 + 2900, from_revenue_events: 7900 + 2900, stripe_reconciled: true });
    expect(snap.funnel_7d).toEqual({ hero_variant_shown: 2, sign_up: 2, svi_analyze: 2, feature_gate_hit: 1, funding_report_paid: 1 });
    // G16-A: the step funnel — distinct actors, qa:true row dropped, gate per feature
    expect(snap.funnel_7d_v2).toMatchObject({ signups: 1, analyses: 1, first_analyses: 1, report_views: 0, paywall_views: 0, checkouts: 0, paid: 0, qa_excluded: 1, gate_hits: { "cap_table.write": 1 } });
    expect(snap.funnel_7d_v2.conv).toEqual({ signup_to_analysis: 1, analysis_to_report: 0, report_to_paywall: null, paywall_to_checkout: null, checkout_to_paid: null, review_to_pay: null });
    expect(snap.warnings).toEqual([]);
    expect(tractionSnapshotSchema.parse(JSON.parse(JSON.stringify(snap)))).toEqual(snap);

    // Count queries are head-only (no full-table scans for counters).
    const heads = f.calls.filter((c) => ["svi_analyses", "analyses", "guest_analyses", "report_orders", "tbr_views", "share_packages", "api_keys", "webhook_endpoints", "evaluation_assessments", "svi_snapshots"].includes(c.table));
    expect(heads.length).toBeGreaterThan(0);
    expect(heads.every((c) => c.head)).toBe(true);
  });

  it("a missing table (42P01) or a thrown query nulls only that figure and records one warning each", async () => {
    const f = fixture();
    f.errors.evaluation_assessments = { code: "42P01", message: 'relation "public.evaluation_assessments" does not exist' };
    f.errors.tbr_views = { code: "42P01", message: 'relation "public.tbr_views" does not exist' };
    f.throws = new Set(["analytics_events"]);
    const snap = await buildTractionSnapshot({ supabase: fakeClient(f), now: NOW });
    expect(snap.assessments).toEqual({ submitted: null, shared_with_founder: null });
    expect(snap.tbr).toEqual({ purchased: 2, shared: 1, views: null });
    expect(snap.funnel_7d).toEqual({});
    expect(snap.funnel_7d_v2).toEqual(emptyTractionSnapshot(NOW).funnel_7d_v2);
    expect(snap.users.total).toBe(5);
    expect(snap.warnings).toEqual([
      "tbr_views:count: 42P01 relation \"public.tbr_views\" does not exist",
      "evaluation_assessments:submitted: 42P01 relation \"public.evaluation_assessments\" does not exist",
      "evaluation_assessments:shared: 42P01 relation \"public.evaluation_assessments\" does not exist",
      "analytics_events:7d: network down for analytics_events",
    ]);
    expect(snap.mrr_aud_cents.stripe_reconciled).toBeNull(); // no stripe passed
    expect(tractionSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("Stripe head-count mismatch → stripe_reconciled=false + warning; Stripe throw → null + warning", async () => {
    const mismatch = await buildTractionSnapshot({
      supabase: fakeClient(fixture()),
      stripe: { subscriptions: { list: async () => ({ data: [{ id: "only-one" }] }) } },
      now: NOW,
    });
    expect(mismatch.mrr_aud_cents.stripe_reconciled).toBe(false);
    expect(mismatch.warnings).toEqual(["stripe: 1 active subscriptions vs 4 active subscription_trial_state rows"]);

    const down = await buildTractionSnapshot({
      supabase: fakeClient(fixture()),
      stripe: { subscriptions: { list: async () => { throw new Error("stripe 503"); } } },
      now: NOW,
    });
    expect(down.mrr_aud_cents.stripe_reconciled).toBeNull();
    expect(down.warnings).toEqual(["stripe: stripe 503"]);
  });

  it("when app_users cannot be read, per-user figures are unfiltered but still schema-valid and warned", async () => {
    const f = fixture();
    f.errors.app_users = { code: "42501", message: "permission denied" };
    const snap = await buildTractionSnapshot({ supabase: fakeClient(f), now: NOW });
    expect(snap.users).toEqual({ total: null, founders: null, evaluators_by_plan: {}, excluded_count: null });
    expect(snap.warnings[0]).toBe("app_users:users: 42501 permission denied");
    // No id set to filter on → QA rows count (documented: the warning says why).
    expect(snap.evaluators.trials).toBe(2);
    expect(tractionSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("paginates scans in 1000-row windows and warns when the cap is hit", async () => {
    const f = fixture();
    f.rows.app_users = Array.from({ length: 2_500 }, (_, i) => ({ id: `u${i}`, email: `f${i}@x.au`, plan: "free", account_type: "founder" }));
    const snap = await buildTractionSnapshot({ supabase: fakeClient(f), now: NOW, maxRows: 2_000 });
    expect(snap.users.total).toBe(2_000);
    expect(snap.warnings).toContain("app_users:users: scan capped at 2000 rows");
    expect(f.calls.filter((c) => c.table === "app_users").length).toBe(2);
  });
});
