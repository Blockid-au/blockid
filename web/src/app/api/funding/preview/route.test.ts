// Colocated vitest for POST /api/funding/preview (T0242).
//
// Pins: rate-limit (IP-keyed via enforceRateLimit, 429 passthrough), 400 on
// bad JSON / bad intake with the field name, and the free-tier response shape
// (counts + top-3 names/whys, no checklist / timeline / estimates).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const enforceRateLimitMock = vi.fn<(...a: unknown[]) => NextResponse | null>();
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (...a: unknown[]) => enforceRateLimitMock(...a),
}));

vi.mock("@/lib/funding/data", () => ({
  listGrants: vi.fn(async () => [
    grant("g1", "MVP Ventures", "NSW", 75000),
    grant("g2", "R&D Tax Incentive", "national", null),
    grant("g3", "Boost", "NSW", 20000),
    grant("g4", "Small one", "NSW", 5000),
  ]),
  listPrograms: vi.fn(async () => [program("p1", "Plus Eight", "Sydney")]),
}));

function grant(id: string, name: string, state: string, max: number | null) {
  return {
    id, name, provider: null, level: state === "national" ? "federal" : "state", state, funding_type: "grant",
    amount_min_aud: null, amount_max_aud: max, amount_note: null, co_contribution: null,
    stage_tags: ["idea", "pre_revenue_prototype", "mvp"], industry_tags: [], demographic_tags: [], eligibility: {},
    application_window: "rolling", opens_at: null, closes_at: null, lodgement_deadline: null, next_round_note: null,
    status: "open", superseded_by: null, exclude_from_matching: false, official_url: "https://example.gov.au",
    source_url: null, summary: "A grant.", how_to_apply: null, evidence_needed: [], last_verified_at: "2026-09-10",
    verified_by: "seed", status_confidence: "high", sources: null,
  };
}
function program(id: string, name: string, city: string) {
  return {
    id, name, operator: null, program_type: "accelerator", city, capital: "Sydney", state: "NSW", venue: null,
    stage_tags: ["mvp"], industry_tags: [], demographic_tags: [], length_weeks: 12, intake_months: [2, 8],
    applications_open: null, applications_close: null, next_cohort_start: null, benefits: [], funding_aud: 50000,
    equity_pct: "6%", cost_to_founder: null, eligibility: {}, status: "open", official_url: "https://example.com",
    summary: "An accelerator.", last_verified_at: "2026-09-10", verified_by: "seed", status_confidence: "high",
  };
}

import { POST, dynamic } from "./route";

function req(body: unknown, raw = false): Request {
  return new Request("http://x/api/funding/preview", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const GOOD = { description: "Soil sensors for grain farmers in regional NSW", state: "NSW", stage: "mvp" };

beforeEach(() => {
  enforceRateLimitMock.mockReset();
  enforceRateLimitMock.mockReturnValue(null);
});

describe("POST /api/funding/preview", () => {
  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("rate-limits by IP through enforceRateLimit and returns its 429 untouched", async () => {
    enforceRateLimitMock.mockReturnValueOnce(
      NextResponse.json({ ok: false, error: "Rate limit exceeded", retryInSeconds: 60 }, { status: 429 }),
    );
    const res = await POST(req(GOOD));
    expect(res.status).toBe(429);
    const [route, identity, request, max, windowMs] = enforceRateLimitMock.mock.calls[0];
    expect(route).toBe("funding-preview");
    expect(identity).toBeNull(); // IP fallback inside enforceRateLimit
    expect(request).toBeInstanceOf(Request);
    expect(max).toBe(30);
    expect(windowMs).toBe(600_000);
  });

  it("400s on invalid JSON and on a bad intake, naming the field", async () => {
    const bad = await POST(req("{nope", true));
    expect(bad.status).toBe(400);
    const missing = await POST(req({ ...GOOD, stage: "unicorn" }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ ok: false, field: "stage" });
  });

  it("returns the free-tier shape only: counts, top-3 with why, hero A$, locked counts, disclaimer", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; preview: Record<string, unknown>; disclaimer: string };
    expect(body.ok).toBe(true);
    const p = body.preview;
    expect(p.grant_count).toBe(4);
    expect(p.program_count).toBe(1);
    expect((p.top_grants as unknown[]).length).toBe(3);
    expect(p.top_grants).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: expect.any(String), why: expect.any(String) })]),
    );
    expect(p.top_grants_amount_max_aud).toBe(100000);
    expect(p.locked).toMatchObject({ checklist_items: expect.any(Number), timeline_items: expect.any(Number) });
    expect(body.disclaimer).toMatch(/not financial, tax or legal advice/);
    // Paid fields must not be present.
    expect(JSON.stringify(p)).not.toMatch(/eligibility_checklist|next_window|estimate_aud|"timeline":/);
  });
});
