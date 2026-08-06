// Unit tests for GET /api/pricing-test/assign — P9-pricing-test-assign-route.
//
// Public, deterministic-per-bucket variant assignment endpoint that any page
// (SSR or client) can hit without dragging the admin `pricing-experiments`
// lib into the client bundle. Sibling `pricing-experiments.test.ts` covers
// the pure `assignVariant` FNV-1a weighted-pick behaviour; this file pins
// the auth-free route contract:
//   - 400 when `experiment` OR `bucket` query params are missing / blank
//     (including whitespace-only), with the error surfaced in the JSON body.
//   - 404 `not_running` when the experiment does not exist OR exists but is
//     in a non-`running` status (draft / paused / concluded) — a paused or
//     concluded experiment must not silently keep serving variants.
//   - Happy path: 200 with `{ok, experimentId, variantKey, payload}` echoed
//     verbatim from `assignVariant(experiment, bucket)`.
//   - Query params are trimmed before being handed to the underlying calls
//     (`getExperimentByName` sees the trimmed name; `assignVariant` sees the
//     trimmed bucket key) so a caller with `?experiment=%20exp%20` still hits
//     the DB row keyed on `exp`.
//   - `dynamic = "force-dynamic"` + `runtime = "nodejs"` exports are asserted
//     so a future Next config regression that lets this route prerender or
//     run on the Edge is caught (the experiment lookup calls Supabase which
//     needs Node runtime).

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PricingExperiment } from "@/lib/pricing-experiments";

vi.mock("server-only", () => ({}));

const getExperimentByNameMock = vi.fn();
const assignVariantMock = vi.fn();
vi.mock("@/lib/pricing-experiments", () => ({
  getExperimentByName: (name: string) => getExperimentByNameMock(name),
  assignVariant: (exp: PricingExperiment, bucket: string) =>
    assignVariantMock(exp, bucket),
}));

import { GET, dynamic, runtime } from "./route";

function makeExperiment(overrides: Partial<PricingExperiment> = {}): PricingExperiment {
  return {
    id: "exp-1",
    name: "founder_price_v1",
    hypothesis: "Anchoring at $49 lifts free→paid.",
    status: "running",
    variants: [
      { key: "control", label: "Control", payload: { price: 2900 } },
      { key: "treatment", label: "Treatment", payload: { price: 4900 } },
    ],
    trafficSplit: { control: 0.5, treatment: 0.5 },
    createdAt: "2026-07-20T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

function req(qs: string): Request {
  return new Request(`http://x/api/pricing-test/assign${qs}`);
}

beforeEach(() => {
  getExperimentByNameMock.mockReset();
  assignVariantMock.mockReset();
});

describe("route module exports", () => {
  it("declares dynamic = 'force-dynamic' so the experiment lookup is never prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("declares runtime = 'nodejs' so the Supabase lookup can call the service-role client", () => {
    expect(runtime).toBe("nodejs");
  });
});

describe("GET /api/pricing-test/assign — validation", () => {
  it("returns 400 when both experiment and bucket params are missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "experiment and bucket query params required",
    });
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
    expect(assignVariantMock).not.toHaveBeenCalled();
  });

  it("returns 400 when experiment param is present but empty (?experiment=&bucket=x)", async () => {
    const res = await GET(req("?experiment=&bucket=sess-1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("experiment and bucket query params required");
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
  });

  it("returns 400 when bucket param is present but empty (?experiment=exp&bucket=)", async () => {
    const res = await GET(req("?experiment=exp&bucket="));
    expect(res.status).toBe(400);
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
  });

  it("returns 400 when experiment param is whitespace-only (trim contract)", async () => {
    const res = await GET(req("?experiment=%20%20&bucket=sess-1"));
    expect(res.status).toBe(400);
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
  });

  it("returns 400 when bucket param is whitespace-only", async () => {
    const res = await GET(req("?experiment=exp&bucket=%20%20%20"));
    expect(res.status).toBe(400);
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the experiment param is entirely absent (bucket alone is not enough)", async () => {
    const res = await GET(req("?bucket=sess-1"));
    expect(res.status).toBe(400);
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the bucket param is entirely absent (experiment alone is not enough)", async () => {
    const res = await GET(req("?experiment=founder_price_v1"));
    expect(res.status).toBe(400);
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/pricing-test/assign — not-found / not-running", () => {
  it("returns 404 not_running when getExperimentByName resolves null", async () => {
    getExperimentByNameMock.mockResolvedValue(null);
    const res = await GET(req("?experiment=missing&bucket=sess-1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "not_running" });
    expect(assignVariantMock).not.toHaveBeenCalled();
  });

  it("returns 404 not_running when experiment status is 'draft'", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment({ status: "draft" }));
    const res = await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_running");
    expect(assignVariantMock).not.toHaveBeenCalled();
  });

  it("returns 404 not_running when experiment status is 'paused'", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment({ status: "paused" }));
    const res = await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_running");
    expect(assignVariantMock).not.toHaveBeenCalled();
  });

  it("returns 404 not_running when experiment status is 'concluded'", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment({ status: "concluded" }));
    const res = await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_running");
    expect(assignVariantMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/pricing-test/assign — happy path", () => {
  it("returns 200 with {ok, experimentId, variantKey, payload} verbatim from assignVariant", async () => {
    const exp = makeExperiment();
    getExperimentByNameMock.mockResolvedValue(exp);
    assignVariantMock.mockReturnValue({
      variantKey: "treatment",
      payload: { price: 4900 },
    });

    const res = await GET(req("?experiment=founder_price_v1&bucket=sess-42"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      experimentId: "exp-1",
      variantKey: "treatment",
      payload: { price: 4900 },
    });
  });

  it("propagates a nested payload object without transformation (spread contract, not deep clone)", async () => {
    const nested = { copy: { headline: "Save more", cta: "Upgrade" }, discountPct: 20 };
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    assignVariantMock.mockReturnValue({ variantKey: "control", payload: nested });

    const res = await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    const body = await res.json();
    expect(body.payload).toEqual(nested);
  });

  it("returns the experimentId from the fetched experiment row (not from the query param)", async () => {
    const exp = makeExperiment({ id: "canonical-uuid-999", name: "founder_price_v1" });
    getExperimentByNameMock.mockResolvedValue(exp);
    assignVariantMock.mockReturnValue({ variantKey: "control", payload: {} });

    const res = await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    const body = await res.json();
    expect(body.experimentId).toBe("canonical-uuid-999");
  });
});

describe("GET /api/pricing-test/assign — trim contract", () => {
  it("passes the trimmed experiment name into getExperimentByName", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    assignVariantMock.mockReturnValue({ variantKey: "control", payload: {} });

    await GET(req("?experiment=%20%20founder_price_v1%20&bucket=sess-1"));
    expect(getExperimentByNameMock).toHaveBeenCalledTimes(1);
    expect(getExperimentByNameMock).toHaveBeenCalledWith("founder_price_v1");
  });

  it("passes the trimmed bucket key as the second arg to assignVariant", async () => {
    const exp = makeExperiment();
    getExperimentByNameMock.mockResolvedValue(exp);
    assignVariantMock.mockReturnValue({ variantKey: "control", payload: {} });

    await GET(req("?experiment=founder_price_v1&bucket=%20sess-42%20%20"));
    expect(assignVariantMock).toHaveBeenCalledTimes(1);
    const [expArg, bucketArg] = assignVariantMock.mock.calls[0];
    expect(expArg).toBe(exp);
    expect(bucketArg).toBe("sess-42");
  });
});

describe("GET /api/pricing-test/assign — wire integration", () => {
  it("invokes assignVariant exactly once per successful GET (no duplicate assignment)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    assignVariantMock.mockReturnValue({ variantKey: "control", payload: {} });

    await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    expect(assignVariantMock).toHaveBeenCalledTimes(1);
  });

  it("invokes getExperimentByName exactly once per successful GET (no duplicate DB round-trip)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    assignVariantMock.mockReturnValue({ variantKey: "control", payload: {} });

    await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    expect(getExperimentByNameMock).toHaveBeenCalledTimes(1);
  });

  it("hands the entire experiment object to assignVariant (not a copy) so variants[]/trafficSplit reach the pure lib intact", async () => {
    const exp = makeExperiment({
      variants: [
        { key: "a", label: "A", payload: { pct: 10 } },
        { key: "b", label: "B", payload: { pct: 20 } },
        { key: "c", label: "C", payload: { pct: 30 } },
      ],
      trafficSplit: { a: 0.7, b: 0.2, c: 0.1 },
    });
    getExperimentByNameMock.mockResolvedValue(exp);
    assignVariantMock.mockReturnValue({ variantKey: "a", payload: { pct: 10 } });

    await GET(req("?experiment=founder_price_v1&bucket=sess-1"));
    const [expArg] = assignVariantMock.mock.calls[0];
    // Same object reference — the route does not clone / project the experiment.
    expect(expArg).toBe(exp);
    // Sanity: the passed object still carries the variants + trafficSplit
    // shape the pure lib needs (protects against a future refactor that
    // whittles the row down to just `id + name + status`).
    expect(expArg.variants).toHaveLength(3);
    expect(expArg.trafficSplit).toEqual({ a: 0.7, b: 0.2, c: 0.1 });
  });
});
