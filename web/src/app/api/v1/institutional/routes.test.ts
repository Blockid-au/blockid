// G21 P3-B — the six institutional routes over a mocked data layer:
// anonymous → 401 on every route; 200 bodies carry company name + ids +
// scores and never an e-mail / note / invite token; 404 for a foreign or
// malformed id; benchmarks carry n + band on every row and 400 on a bad
// stage; methodology pins SVI_VERSION + the n-rules; rate-limit + ETag
// headers on every 200.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const validateMock = vi.fn();
vi.mock("@/lib/api-keys", () => ({
  validateApiKey: (k: string) => validateMock(k),
  checkRateLimit: async () => ({ allowed: true, remaining: 42, resetAt: new Date(Date.now() + 30_000) }),
}));
vi.mock("@/lib/entitlements", () => ({ can: async () => true }));
const auditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => auditMock(...(a as [])) }));
vi.mock("@/lib/analytics/fi-events", () => ({ emitFiEvent: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 598, resetIn: 1_000_000 }) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }));

const data = vi.hoisted(() => ({
  listReadableBatches: vi.fn(),
  loadCohortForKey: vi.fn(),
  loadCohortSnapshotsForKey: vi.fn(),
  loadCompanyForKey: vi.fn(),
}));
vi.mock("@/lib/api-v1/institutional-data", () => data);
const segments = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/benchmarks/segments-db", () => ({
  listPublishedSegments: async (f: { stage?: number | null; sector?: string | null }) =>
    segments.rows.filter((r) => (f.stage == null || r.stage === f.stage) && (f.sector == null || r.sector === f.sector)),
}));

import { GET as listCohorts } from "./cohorts/route";
import { GET as getCohort } from "./cohorts/[id]/route";
import { GET as getSnapshots } from "./cohorts/[id]/snapshots/route";
import { GET as getCompany } from "./companies/[projectId]/route";
import { GET as getBenchmarks } from "./benchmarks/route";
import { GET as getMethodology } from "./methodology/route";
import { SVI_VERSION } from "@/lib/svi-analysis";

const KEY = `bk_live_${"f".repeat(48)}`;
const COHORT_ID = "e1a2b3c4-0000-4000-8000-000000000001";
const PROJECT_ID = "e1a2b3c4-0000-4000-8000-0000000000aa";
function req(path: string, auth: string | null = `Bearer ${KEY}`): Request {
  return new Request(`http://localhost${path}`, { headers: auth ? { authorization: auth } : {} });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

const COHORT = { id: COHORT_ID, name: "Cohort 5", program_name: "Acme", status: "done", role: "owner", total: 2, done_count: 2, failed_count: 0, weights_version: 1, created_at: "2026-09-10T00:00:00Z", finished_at: null, links: { items: `/api/v1/institutional/cohorts/${COHORT_ID}`, snapshots: `/api/v1/institutional/cohorts/${COHORT_ID}/snapshots` } };
const ITEM = { item_id: 1, project_id: PROJECT_ID, evaluation_id: "ev-1", company: "Acme Pty Ltd", stage: 4, stage_label: "Seed", sector: "saas", svi: 63, evidence_confidence: 48, verification: "L2", verification_level: 2, gaps_count: 3, delta: 2, decision: "proceed", review_status: "reviewed", shortlisted: true, weighted_score: 61.5, overrides_count: 1, risk_flags: [], status: "done", scored_at: "2026-09-12T00:00:00Z" };

beforeEach(() => {
  validateMock.mockReset().mockResolvedValue({ valid: true, userId: "u-inst", keyHash: "hash-inst", rateLimitPerMin: 100, scopes: ["analyze", "evaluations:read"] });
  auditMock.mockClear();
  data.listReadableBatches.mockReset().mockResolvedValue([COHORT]);
  data.loadCohortForKey.mockReset().mockResolvedValue({ ok: true, cohort: COHORT, items: [ITEM] });
  data.loadCohortSnapshotsForKey.mockReset().mockResolvedValue({ ok: true, cohort: COHORT, snapshots: [{ id: "s1", taken_at: "2026-09-11T00:00:00Z", reason: "manual", weights_version: 1, summary: { n: 2, scored: 2, median_svi: 60 }, rows: [{ project_id: PROJECT_ID, item_id: 1, svi: 63 }] }] });
  data.loadCompanyForKey.mockReset().mockResolvedValue({ ok: true, company: { project_id: PROJECT_ID, company: "Acme Pty Ltd", slug: "acme", stage_label: "Seed", sector: "saas", svi: 63, svi_band: "developing", evidence_confidence: 48, verification: { level: 2, short: "L2", label: "BlockID Verified L2" }, pending_dims: 1, unverified_material_claims: 2, top_strength: null, top_gap: null, benchmark: { median: 58, n: 41, label: "benchmark", segment: "Stage 4 · SaaS / Software" }, methodology_version: SVI_VERSION, last_updated: "2026-09-12T00:00:00Z" } });
  segments.rows = [
    { segment_key: "stage:4", stage: 4, sector: null, sector_label: null, n: 41, median: 58, p25: 51, p75: 66, band: "benchmark", label: "benchmark (n = 41)", computed_at: "2026-09-20T03:25:00Z" },
    { segment_key: "stage:4|sector:saas", stage: 4, sector: "saas", sector_label: "SaaS / Software", n: 12, median: 61, p25: 55, p75: 68, band: "indicative", label: "indicative (n = 12)", computed_at: "2026-09-20T03:25:00Z" },
  ];
});

const PII = /@|private_notes|invite_token|founder_email|notes"/;

describe("anonymous → 401 everywhere, one envelope", () => {
  it("every route refuses a missing key with { ok:false, error:'unauthorized' } and never touches the data layer", async () => {
    const results = await Promise.all([
      listCohorts(req("/api/v1/institutional/cohorts", null)),
      getCohort(req(`/api/v1/institutional/cohorts/${COHORT_ID}`, null), params({ id: COHORT_ID })),
      getSnapshots(req(`/api/v1/institutional/cohorts/${COHORT_ID}/snapshots`, null), params({ id: COHORT_ID })),
      getCompany(req(`/api/v1/institutional/companies/${PROJECT_ID}`, null), params({ projectId: PROJECT_ID })),
      getBenchmarks(req("/api/v1/institutional/benchmarks?stage=4", null)),
      getMethodology(req("/api/v1/institutional/methodology", null)),
    ]);
    for (const r of results) {
      expect(r.status).toBe(401);
      expect(await r.json()).toMatchObject({ ok: false, error: "unauthorized" });
    }
    expect(data.listReadableBatches).not.toHaveBeenCalled();
    expect(data.loadCohortForKey).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe("cohorts", () => {
  it("lists the key owner's cohorts (owner + seats) with the rate-limit + ETag headers; 400 on a bad limit", async () => {
    const res = await listCohorts(req("/api/v1/institutional/cohorts?limit=10"));
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("600");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(data.listReadableBatches).toHaveBeenCalledWith("u-inst", 10);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, meta: { count: 1, limit: 10 } });
    expect(body.data[0].links.items).toContain(COHORT_ID);
    expect((await listCohorts(req("/api/v1/institutional/cohorts?limit=0"))).status).toBe(400);
  });

  it("cohort detail: items carry company + ids + scores, no PII; 404 for a foreign / malformed id; 503 when unavailable", async () => {
    const res = await getCohort(req(`/api/v1/institutional/cohorts/${COHORT_ID}`), params({ id: COHORT_ID }));
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('"company":"Acme Pty Ltd"');
    expect(text).toContain('"svi":63');
    expect(text).not.toMatch(PII);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect((auditMock.mock.calls[0]![0] as { resource_type: string; resource_id: string }).resource_type).toBe("cohort");
    expect((auditMock.mock.calls[0]![0] as { resource_id: string }).resource_id).toBe(COHORT_ID);

    data.loadCohortForKey.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await getCohort(req(`/api/v1/institutional/cohorts/${COHORT_ID}`), params({ id: COHORT_ID }))).status).toBe(404);
    const malformed = await getCohort(req("/api/v1/institutional/cohorts/nope"), params({ id: "nope" }));
    expect(malformed.status).toBe(404);
    expect(data.loadCohortForKey).toHaveBeenCalledTimes(2);
    data.loadCohortForKey.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    expect((await getCohort(req(`/api/v1/institutional/cohorts/${COHORT_ID}`), params({ id: COHORT_ID }))).status).toBe(503);
  });

  it("snapshots: rows + summary, created_by never present, limit forwarded", async () => {
    const res = await getSnapshots(req(`/api/v1/institutional/cohorts/${COHORT_ID}/snapshots?limit=5`), params({ id: COHORT_ID }));
    expect(res.status).toBe(200);
    expect(data.loadCohortSnapshotsForKey).toHaveBeenCalledWith(COHORT_ID, "u-inst", 5);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('"taken_at"');
    expect(text).not.toContain("created_by");
    data.loadCohortSnapshotsForKey.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await getSnapshots(req(`/api/v1/institutional/cohorts/${COHORT_ID}/snapshots`), params({ id: COHORT_ID }))).status).toBe(404);
  });
});

describe("companies", () => {
  it("the Assessment Card projection with the published benchmark (n + label); 404 when the key owner does not evaluate it", async () => {
    const res = await getCompany(req(`/api/v1/institutional/companies/${PROJECT_ID}`), params({ projectId: PROJECT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ company: "Acme Pty Ltd", svi: 63, benchmark: { median: 58, n: 41, label: "benchmark" }, methodology_version: SVI_VERSION });
    expect(JSON.stringify(body)).not.toMatch(PII);
    data.loadCompanyForKey.mockResolvedValueOnce({ ok: false, error: "not_found" });
    expect((await getCompany(req(`/api/v1/institutional/companies/${PROJECT_ID}`), params({ projectId: PROJECT_ID }))).status).toBe(404);
    expect((await getCompany(req("/api/v1/institutional/companies/x"), params({ projectId: "x" }))).status).toBe(404);
  });
});

describe("benchmarks", () => {
  it("published segments only, every row with n + band; stage / sector filters (sector normalised); 400 on a bad stage", async () => {
    const all = await getBenchmarks(req("/api/v1/institutional/benchmarks"));
    expect(all.status).toBe(200);
    const body = await all.json();
    expect(body.data).toHaveLength(2);
    for (const row of body.data) {
      expect(row.n).toBeGreaterThanOrEqual(10);
      expect(["indicative", "benchmark", "segmented"]).toContain(row.band);
      expect(row.label).toContain(`n = ${row.n}`);
    }
    expect(body.meta).toMatchObject({ count: 2, floor: 10 });

    const saas = await getBenchmarks(req("/api/v1/institutional/benchmarks?stage=4&sector=SaaS%20%2F%20Software"));
    const sb = await saas.json();
    expect(sb.data.map((r: { segment_key: string }) => r.segment_key)).toEqual(["stage:4|sector:saas"]);
    expect(sb.meta.sector).toBe("saas");

    const none = await getBenchmarks(req("/api/v1/institutional/benchmarks?stage=9"));
    expect((await none.json()).data).toEqual([]);

    const bad = await getBenchmarks(req("/api/v1/institutional/benchmarks?stage=99"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, error: "invalid_query" });
    const badSector = await getBenchmarks(req("/api/v1/institutional/benchmarks?sector=%3Cscript%3E"));
    expect(badSector.status).toBe(400);
  });
});

describe("methodology", () => {
  it("SVI_VERSION, bands, dimensions with weights, the n-rules and the governance URL; 304 on a matching ETag", async () => {
    const res = await getMethodology(req("/api/v1/institutional/methodology"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.svi_version).toBe(SVI_VERSION);
    expect(body.data.bands.map((b: { band: string }) => b.band)).toEqual(["strong", "developing", "early", "pending"]);
    expect(body.data.dimensions).toHaveLength(8);
    expect(body.data.benchmark_rules.floor).toBe(10);
    expect(body.data.benchmark_rules.n_rules.map((r: { band: string }) => r.band)).toEqual(["none", "indicative", "benchmark", "segmented"]);
    expect(body.data.urls.governance).toBe("https://blockid.au/methodology/governance");
    const etag = res.headers.get("ETag")!;
    const again = await getMethodology(new Request("http://localhost/api/v1/institutional/methodology", { headers: { authorization: `Bearer ${KEY}`, "if-none-match": etag } }));
    expect(again.status).toBe(304);
  });
});
