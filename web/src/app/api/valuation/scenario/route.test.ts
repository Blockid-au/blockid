import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), scope: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/project-members/http", () => ({ projectScopeOrDeny: mocks.scope }));
import { POST } from "./route";
const context = { entityId: "project", evidenceRevision: "rev1", valuationDate: "2026-09-24", currency: "AUD", priceBasis: "nominal" };
const amount = (value: number) => ({ value, unit: "AUD", evidence: { id: "source", entityId: "project", revision: "rev1", observedAt: "2026-09-24", reference: "balance sheet", locator: "p1", status: "management_stated" } });
const input = () => ({ methods: [{ method: "net_assets", context: { ...context }, adjustedAssets: amount(1000), adjustedLiabilities: amount(100) }] });
const request = (body: unknown, suffix = "") => new NextRequest(`http://localhost/api/valuation/scenario${suffix}`, { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { mocks.user.mockResolvedValue({ id: "user" }); mocks.scope.mockResolvedValue({ scope: { projectId: "project" }, denied: null }); });
describe("CFO scenario API", () => {
  it("requires authentication", async () => { mocks.user.mockResolvedValue(null); expect((await POST(request(input()))).status).toBe(401); });
  it("honours project authorization", async () => { mocks.scope.mockResolvedValue({ scope: null, denied: NextResponse.json({}, { status: 403 }) }); expect((await POST(request(input()))).status).toBe(403); });
  it("rejects cross-project input", async () => { const body = input(); body.methods[0].context.entityId = "other"; expect((await POST(request(body))).status).toBe(403); });
  it("returns arithmetic results as preview without official publication", async () => {
    const response = await POST(request(input())); const body = await response.json();
    expect(response.status).toBe(200); expect(body.result.status).toBe("scenario_only");
    expect(body.result.methods[0].values.equityValue).toBe(900); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("exports the same computed revision", async () => {
    const json = await (await POST(request(input()))).json(); const csv = await POST(request(input(), "?format=csv"));
    expect(await csv.text()).toContain(json.result.resultHash);
  });
  it("rejects oversized requests and malformed data", async () => {
    expect((await POST(request({ padding: "x".repeat(256001) }))).status).toBe(413);
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
  });
});
