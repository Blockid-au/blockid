// GET /api/svi/report/pdf — S-R4 route contract.
//
//   - no token → 400; unknown token → 404; no DB → 503
//   - default path renders ReportV2 with react-pdf: 200, application/pdf,
//     `X-TBR-Source: adapter` when the snapshot has no stored report_v2 and
//     `stored` when the column carries a valid document (rendered as-is —
//     the startup name from the stored cover, not the account)
//   - `?v=1` keeps the Chromium path (here: playwright unavailable → 503)

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { pdfPageCount } from "@/lib/pdf/page-count";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));
vi.mock("playwright", () => {
  throw new Error("Cannot find module 'playwright'");
});

import { GET } from "./route";

const DIMS = { tre: 61, mpc: 70, ftv: 55, ptd: 66, cgh: 48, iri: 52, lco: 40, svm: 58 };
const SNAPSHOT = {
  id: "s-1",
  account_id: "acct-1",
  project_id: "p-1",
  svi_total: 58,
  stage: 2,
  created_at: "2026-09-12T00:00:00Z",
  report_share_token: "tok-abc",
  dim_results: Object.fromEntries(Object.entries(DIMS).map(([k, v]) => [k, { status: "complete", score: v, markdown: null, insights: [`${k} insight`] }])),
  dimension_scores: DIMS,
  criterion_results: [{ key: "idea", title: "Idea & Innovation", primary_dimension: "mpc", weight: 10, score: 74, verdict: "Clear wedge.", strengths: ["s"], gaps: ["g"], next_action: "x" }],
  analysis_json: { industry: "SaaS", stageLabel: "Seed" },
  report_v2: null as unknown,
};

function req(qs: string) {
  return new Request(`http://x/api/svi/report/pdf${qs}`);
}

beforeEach(() => {
  db.sb = fakeSupabase({
    svi_snapshots: [{ ...SNAPSHOT }],
    svi_accounts: [{ id: "acct-1", startup_name: "Acme Robotics" }],
  });
});

describe("GET /api/svi/report/pdf", () => {
  it("400 without a token, 404 for an unknown token, 503 without a DB", async () => {
    expect((await GET(req(""))).status).toBe(400);
    db.sb = fakeSupabase({ svi_snapshots: [] });
    expect((await GET(req("?token=nope"))).status).toBe(404);
    db.sb = null;
    expect((await GET(req("?token=tok-abc"))).status).toBe(503);
  });

  it("adapter fallback: renders a PDF from the v1 snapshot columns", async () => {
    const res = await GET(req("?token=tok-abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-tbr-source")).toBe("adapter");
    expect(res.headers.get("content-disposition")).toContain("Acme-Robotics.pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdfPageCount(buf)).toBeGreaterThanOrEqual(10);
    expect(Number(res.headers.get("x-tbr-pages"))).toBe(pdfPageCount(buf));
    expect(db.sb!.hasEq("svi_snapshots", "report_share_token", "tok-abc")).toBe(true);
  }, 60_000);

  it("stored path: a valid svi_snapshots.report_v2 is rendered as-is", async () => {
    const stored = { ...demoReportV2(), source: "pipeline" as const };
    db.sb = fakeSupabase({
      svi_snapshots: [{ ...SNAPSHOT, report_v2: stored }],
      svi_accounts: [{ id: "acct-1", startup_name: "Acme Robotics" }],
    });
    const res = await GET(req("?token=tok-abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-tbr-source")).toBe("stored");
    expect(res.headers.get("content-disposition")).toContain("Sample-SME-Compliance-SaaS-demo.pdf");
  }, 60_000);

  it("?v=1 keeps the legacy Chromium path (503 when playwright is not installed)", async () => {
    const res = await GET(req("?token=tok-abc&v=1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: "playwright_unavailable" });
  });
});
