// Colocated vitest for GET /api/funding/report/[id] (T0242).
//
// Pins: 404 for a malformed id, a missing row, and any viewer that is not
// the owner / token holder / paying Stripe session; 200 + sanitised body
// for a ready report; 202 while the row is still being generated.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getFundingReportMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/reports", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/funding/reports")>();
  return { ...orig, getFundingReport: (id: string) => getFundingReportMock(id) };
});

import { GET } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ROW = {
  id: ID,
  user_id: "user-1",
  guest_email: "g@example.com",
  project_id: null,
  intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp" },
  grant_matches: [{ ref_id: "g1", name: "Grant" }],
  program_matches: [],
  timeline: [],
  narrative_md: "# Plan",
  credits_cost: 0,
  paid_via: "one_off",
  stripe_session_id: "cs_live_1",
  status: "ready",
  access_token: "tok_secret",
  meta: { summary: { grant_count: 1 } },
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

function get(id: string, qs = ""): Promise<Response> {
  return GET(new Request(`http://x/api/funding/report/${id}${qs}`), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  getFundingReportMock.mockReset().mockResolvedValue(ROW);
});

describe("GET /api/funding/report/[id]", () => {
  it("404s on a malformed id without hitting the DB", async () => {
    expect((await get("nope")).status).toBe(404);
    expect(getFundingReportMock).not.toHaveBeenCalled();
  });

  it("404s when the row is missing or the viewer has no claim", async () => {
    getFundingReportMock.mockResolvedValueOnce(null);
    expect((await get(ID, "?t=tok_secret")).status).toBe(404);
    expect((await get(ID)).status).toBe(404);
    expect((await get(ID, "?t=wrong")).status).toBe(404);
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-2" });
    expect((await get(ID)).status).toBe(404);
  });

  it("200 for the owner, the token holder and the Stripe session — body is sanitised", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1" });
    const owner = await get(ID);
    expect(owner.status).toBe(200);
    const body = (await owner.json()) as { ok: boolean; report: Record<string, unknown> };
    expect(body.report.is_owner).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/tok_secret|g@example.com|cs_live_1/);
    expect((body.report.grants as unknown[]).length).toBe(1);

    expect((await get(ID, "?t=tok_secret")).status).toBe(200);
    expect((await get(ID, "?s=cs_live_1")).status).toBe(200);
  });

  it("202 while the report is still generating", async () => {
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, status: "paid", grant_matches: [] });
    const res = await get(ID, "?t=tok_secret");
    expect(res.status).toBe(202);
    expect(((await res.json()) as { report: { status: string } }).report.status).toBe("paid");
  });
});
