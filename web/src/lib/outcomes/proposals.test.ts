// Proposal derivation (G21 P3-A): every signal → its outcome kind with the
// right source + confidence, the ≥ +25 % / ≥ 90 d revenue rule, stage rises
// only, dedupe against the ledger (any status, same day), the loader's
// fail-soft reads, the upsert with ignoreDuplicates + audit rows, and the
// cron runner's 180-day / cap behaviour.
import { describe, expect, it, vi } from "vitest";
import { deriveProposals, fetchGithubTags, listRecentlySnapshottedProjects, loadProposalContext, proposeOutcomesFromSignals, runOutcomeSignals, type ProposalContext } from "./proposals";

const PID = "11111111-2222-4333-8444-555555555555";
const NOW = new Date("2026-09-20T10:00:00.000Z");

function ctx(over: Partial<ProposalContext> = {}): ProposalContext {
  return { projectId: PID, now: NOW, externalSignals: [], connectorHistory: [], snapshots: [], proceedDecisions: [], githubTags: [], existing: [], ...over };
}

describe("deriveProposals", () => {
  it("nothing in → nothing out", () => {
    expect(deriveProposals(ctx())).toEqual([]);
  });

  it("grant_award register signal → grant_success (external_signal, 90) with program / agency / amount / link; funding_round → funding_raised; other types ignored", () => {
    const out = deriveProposals(
      ctx({
        externalSignals: [
          { signal_type: "grant_award", as_of: "2026-03-04", value: { program: "AEA Ignite", agency: "DISR", amount_aud: "250000" }, source_url: "https://grants.gov.au/x" },
          { signal_type: "funding_round", as_of: "2026-05-01", value: { amount_aud: 1_000_000, round: "seed" }, source_url: null },
          { signal_type: "funding_round", as_of: "2026-05-02", value: {} },
          { signal_type: "abr_entity", as_of: "2020-01-01", value: {} },
          { signal_type: "grant_award", as_of: "not-a-date", value: {} },
        ],
      }),
    );
    expect(out.map((o) => o.kind)).toEqual(["grant_success", "funding_raised"]);
    expect(out[0]).toMatchObject({ project_id: PID, source: "external_signal", confidence: 90, observed_at: "2026-03-04T00:00:00.000Z", value: { program: "AEA Ignite", agency: "DISR", amount_aud: 250000, source_url: "https://grants.gov.au/x" } });
    expect(out[1]!.value).toEqual({ amount_aud: 1_000_000, round: "seed" });
  });

  it("connector MRR: ≥ +25 % against the snapshot ≥ 90 d earlier → revenue_growth (connector, 85); below the bar or too young → nothing", () => {
    const hist = (pairs: Array<[string, number]>) => pairs.map(([taken_at, mrrAud]) => ({ provider: "stripe" as const, taken_at, metrics: { mrrAud } }));
    const grow = deriveProposals(ctx({ connectorHistory: hist([["2026-09-01T00:00:00Z", 1300], ["2026-05-20T00:00:00Z", 1000], ["2026-02-01T00:00:00Z", 800]]) }));
    expect(grow).toHaveLength(1);
    expect(grow[0]).toMatchObject({ kind: "revenue_growth", source: "connector", confidence: 85, observed_at: "2026-09-01T00:00:00.000Z", value: { mrr_from_aud: 1000, mrr_to_aud: 1300, growth_pct: 30, provider: "stripe", baseline_at: "2026-05-20T00:00:00Z" } });
    expect(deriveProposals(ctx({ connectorHistory: hist([["2026-09-01T00:00:00Z", 1200], ["2026-05-20T00:00:00Z", 1000]]) }))).toEqual([]);
    expect(deriveProposals(ctx({ connectorHistory: hist([["2026-09-01T00:00:00Z", 2000], ["2026-08-20T00:00:00Z", 1000]]) }))).toEqual([]);
    // xero: income / windowMonths
    const xero = deriveProposals(ctx({ connectorHistory: [{ provider: "xero", taken_at: "2026-09-01T00:00:00Z", metrics: { totalIncomeAud: 6000, windowMonths: 3 } }, { provider: "xero", taken_at: "2026-05-01T00:00:00Z", metrics: { totalIncomeAud: 3000, windowMonths: 3 } }] }));
    expect(xero[0]).toMatchObject({ kind: "revenue_growth", value: { mrr_from_aud: 1000, mrr_to_aud: 2000, growth_pct: 100, provider: "xero" } });
  });

  it("stage rising between consecutive snapshots → next_stage (founder, 50); falls and repeats ignored", () => {
    const out = deriveProposals(ctx({ snapshots: [{ snapshot_date: "2026-01-10", stage: 1 }, { snapshot_date: "2026-03-10", stage: 2 }, { snapshot_date: "2026-05-10", stage: 2 }, { snapshot_date: "2026-07-10", stage: 1 }, { snapshot_date: "2026-09-10", stage: 3 }, { snapshot_date: "2026-09-11", stage: null }] }));
    expect(out.map((o) => [o.kind, o.value.from_stage, o.value.to_stage])).toEqual([
      ["next_stage", 1, 2],
      ["next_stage", 1, 3],
    ]);
    expect(out[0]).toMatchObject({ source: "founder", confidence: 50, observed_at: "2026-03-10T00:00:00.000Z" });
  });

  it("cohort proceed decisions → accelerator_selection (evaluator, 70) with the program name; GitHub tags → product_release (connector, 85), undated tags skipped", () => {
    const out = deriveProposals(
      ctx({
        proceedDecisions: [{ evaluation_id: "ev-1", decided_at: "2026-08-01T12:00:00Z", program: "Spring Cohort" }],
        githubTags: [
          { name: "v2.0.0", date: "2026-08-20T00:00:00Z", repo: "acme/app", url: "https://github.com/acme/app/releases/tag/v2.0.0" },
          { name: "v1.9.0", date: null, repo: "acme/app" },
        ],
      }),
    );
    expect(out.map((o) => o.kind)).toEqual(["accelerator_selection", "product_release"]);
    expect(out[0]).toMatchObject({ source: "evaluator", confidence: 70, value: { program: "Spring Cohort", evaluation_id: "ev-1" } });
    expect(out[1]).toMatchObject({ source: "connector", confidence: 85, value: { tag: "v2.0.0", repo: "acme/app", source_url: "https://github.com/acme/app/releases/tag/v2.0.0" } });
  });

  it("skips anything already on the ledger for the same kind + source + day (any status) and within the run", () => {
    const out = deriveProposals(
      ctx({
        externalSignals: [
          { signal_type: "grant_award", as_of: "2026-03-04", value: { program: "A" } },
          { signal_type: "grant_award", as_of: "2026-03-04", value: { program: "A again" } },
          { signal_type: "grant_award", as_of: "2026-06-04", value: { program: "B" } },
        ],
        existing: [{ kind: "grant_success", source: "external_signal", observed_at: "2026-06-04T00:00:00.000Z" }],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.value.program).toBe("A");
  });

  it("output is sorted by observed_at then kind and every row is proposed-shaped (no status field)", () => {
    const out = deriveProposals(ctx({ snapshots: [{ snapshot_date: "2026-01-01", stage: 1 }, { snapshot_date: "2026-09-01", stage: 2 }], externalSignals: [{ signal_type: "grant_award", as_of: "2026-02-01", value: {} }] }));
    expect(out.map((o) => o.kind)).toEqual(["grant_success", "next_stage"]);
    for (const o of out) expect(o).not.toHaveProperty("status");
  });
});

// ── loader / writer on a table-aware fake ─────────────────────────────────

type Rows = Record<string, unknown>[];
function fakeDb(tables: Record<string, Rows | Error>, opts: { upsertReturns?: Rows; upsertError?: { message: string } } = {}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  function chain(table: string) {
    const t: Record<string, unknown> = {};
    const p: unknown = new Proxy(t, {
      get(_o, prop: string) {
        const src = tables[table];
        if (prop === "then") {
          const pr = src instanceof Error ? Promise.reject(src) : Promise.resolve({ data: src ?? [], error: null });
          return pr.then.bind(pr);
        }
        if (prop === "maybeSingle") return () => (src instanceof Error ? Promise.reject(src) : Promise.resolve({ data: (src ?? [])[0] ?? null, error: null }));
        if (prop === "select" && calls.at(-1)?.op === "upsert") {
          return (...args: unknown[]) => {
            calls.push({ table, op: prop, args });
            const pr = Promise.resolve(opts.upsertError ? { data: null, error: opts.upsertError } : { data: opts.upsertReturns ?? [], error: null });
            return { then: pr.then.bind(pr) };
          };
        }
        return (...args: unknown[]) => {
          calls.push({ table, op: prop, args });
          return p;
        };
      },
    });
    return p;
  }
  return { db: { from: (table: string) => chain(table) }, calls };
}

describe("loadProposalContext", () => {
  it("reads project / connectors / snapshots / cohort decisions / ledger / register signals; a failing table becomes a warning + empty input", async () => {
    const { db, calls } = fakeDb({
      projects: [{ id: PID, github_url: "https://github.com/acme/app" }],
      connector_snapshots: [{ provider: "stripe", taken_at: "2026-09-01T00:00:00Z", metrics: { mrrAud: 100 } }],
      svi_snapshots: [{ snapshot_date: "2026-01-01", stage: 1 }],
      evaluation_assessments: [{ evaluation_id: "ev-1", submitted_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-02T00:00:00Z" }],
      evaluation_batch_items: [{ evaluation_id: "ev-1", batch_id: "b-1" }],
      evaluation_batches: [{ id: "b-1", name: "Spring" }],
      startup_outcomes: new Error("relation \"startup_outcomes\" does not exist"),
    });
    const fetchTags = vi.fn(async () => [{ name: "v1", date: "2026-08-20T00:00:00Z", repo: "acme/app" }]);
    const loadSignals = vi.fn(async () => [{ signal_type: "grant_award", as_of: "2026-03-04", value: { program: "A" } }]);
    const { ctx: c, warnings } = await loadProposalContext(db, PID, { now: () => NOW, fetchTags, loadSignals, loadAbn: async () => "51824753556" });
    expect(c.connectorHistory).toHaveLength(1);
    expect(c.snapshots).toHaveLength(1);
    expect(c.proceedDecisions).toEqual([{ evaluation_id: "ev-1", decided_at: "2026-08-01T00:00:00Z", program: "Spring" }]);
    expect(c.githubTags).toHaveLength(1);
    expect(fetchTags).toHaveBeenCalledWith("acme", "app");
    expect(loadSignals).toHaveBeenCalledWith(db, "51824753556");
    expect(c.existing).toEqual([]);
    expect(warnings.some((w) => w.startsWith("startup_outcomes:"))).toBe(true);
    expect(calls.some((c2) => c2.table === "evaluation_assessments" && c2.op === "eq" && c2.args[0] === "decision" && c2.args[1] === "proceed")).toBe(true);
  });

  it("no github_url or no fetcher → no tag lookup", async () => {
    const fetchTags = vi.fn(async () => []);
    const { db } = fakeDb({ projects: [{ id: PID, github_url: null }] });
    await loadProposalContext(db, PID, { fetchTags, loadSignals: async () => [], loadAbn: async () => null });
    expect(fetchTags).not.toHaveBeenCalled();
  });
});

describe("proposeOutcomesFromSignals", () => {
  it("upserts with ignoreDuplicates on the 0427 key, status proposed, recorded_by null; audit row per inserted id; never confirms", async () => {
    const { db, calls } = fakeDb({ projects: [{ id: PID, github_url: null }], svi_snapshots: [{ snapshot_date: "2026-01-01", stage: 1 }, { snapshot_date: "2026-06-01", stage: 2 }] }, { upsertReturns: [{ id: "o-1", kind: "next_stage", source: "founder", observed_at: "2026-06-01T00:00:00.000Z" }] });
    const audit = vi.fn(async () => ({}));
    const r = await proposeOutcomesFromSignals(db, PID, { now: () => NOW, loadSignals: async () => [], loadAbn: async () => null, audit });
    expect(r).toMatchObject({ projectId: PID, derived: 1, inserted: 1, skipped_existing: 0 });
    const up = calls.find((c) => c.op === "upsert")!;
    expect(up.args[1]).toEqual({ onConflict: "project_id,kind,observed_at,source", ignoreDuplicates: true });
    const rows = up.args[0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ status: "proposed", recorded_by: null, kind: "next_stage" });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]![0]).toMatchObject({ actor: "cron", action: "outcome.proposed", resource_type: "startup_outcome", resource_id: "o-1", detail: { project_id: PID, kind: "next_stage" } });
  });

  it("nothing derived → no write; upsert error → warning, inserted 0", async () => {
    const empty = fakeDb({ projects: [{ id: PID, github_url: null }] });
    const r0 = await proposeOutcomesFromSignals(empty.db, PID, { loadSignals: async () => [], loadAbn: async () => null });
    expect(r0).toMatchObject({ derived: 0, inserted: 0 });
    expect(empty.calls.some((c) => c.op === "upsert")).toBe(false);
    const bad = fakeDb({ projects: [{ id: PID, github_url: null }], svi_snapshots: [{ snapshot_date: "2026-01-01", stage: 1 }, { snapshot_date: "2026-06-01", stage: 2 }] }, { upsertError: { message: "boom" } });
    const r1 = await proposeOutcomesFromSignals(bad.db, PID, { loadSignals: async () => [], loadAbn: async () => null });
    expect(r1.inserted).toBe(0);
    expect(r1.warnings.join(" ")).toContain("boom");
  });
});

describe("runOutcomeSignals / listRecentlySnapshottedProjects", () => {
  it("distinct projects with a snapshot in the last 180 d, capped; per-project failures become warnings", async () => {
    const { db, calls } = fakeDb({ svi_snapshots: [{ project_id: PID }, { project_id: PID }, { project_id: "p-2" }, { project_id: null }] });
    const { ids } = await listRecentlySnapshottedProjects(db, NOW, 500);
    expect(ids).toEqual([PID, "p-2"]);
    const gte = calls.find((c) => c.table === "svi_snapshots" && c.op === "gte")!;
    expect(gte.args).toEqual(["snapshot_date", "2026-03-24"]);
    const capped = await listRecentlySnapshottedProjects(db, NOW, 1);
    expect(capped.ids).toEqual([PID]);
  });

  it("runs every project, sums derived / inserted, bounds GitHub lookups", async () => {
    let n = 0;
    const db = {
      from: (table: string) => {
        if (table === "svi_snapshots") {
          const chainObj = {
            select: () => chainObj,
            gte: () => chainObj,
            not: () => chainObj,
            order: () => chainObj,
            limit: () => chainObj,
            eq: () => chainObj,
            then: (res: (v: unknown) => void) => res({ data: n++ === 0 ? [{ project_id: "a" }, { project_id: "b" }] : [], error: null }),
          };
          return chainObj;
        }
        const chainObj = { select: () => chainObj, eq: () => chainObj, in: () => chainObj, order: () => chainObj, limit: () => chainObj, maybeSingle: async () => ({ data: { id: "x", github_url: "https://github.com/a/b" }, error: null }), then: (res: (v: unknown) => void) => res({ data: [], error: null }) };
        return chainObj;
      },
    };
    const fetchTags = vi.fn(async () => []);
    const r = await runOutcomeSignals(db, { now: () => NOW, loadSignals: async () => [], loadAbn: async () => null, fetchTags });
    expect(r).toMatchObject({ ok: true, projects: 2, derived: 0, inserted: 0, capped: false });
    expect(fetchTags).toHaveBeenCalledTimes(2);
  });
});

describe("fetchGithubTags", () => {
  it("maps the tags endpoint (+ commit date) and returns [] on a non-OK response", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/tags")) return new Response(JSON.stringify([{ name: "v1.0.0", commit: { url: "https://api.github.com/repos/a/b/commits/abc" } }]), { status: 200 });
      return new Response(JSON.stringify({ commit: { committer: { date: "2026-08-20T00:00:00Z" } } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const tags = await fetchGithubTags("a", "b", "tok");
      expect(tags).toEqual([{ name: "v1.0.0", date: "2026-08-20T00:00:00Z", repo: "a/b", url: "https://github.com/a/b/releases/tag/v1.0.0" }]);
      expect((fetchMock.mock.calls[0]![1] as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer tok");
      fetchMock.mockResolvedValueOnce(new Response("nope", { status: 403 }));
      expect(await fetchGithubTags("a", "b")).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
