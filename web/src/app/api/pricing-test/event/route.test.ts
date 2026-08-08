// Colocated vitest for POST /api/pricing-test/event — P9-pricing-test-event-route-test.
//
// Public, auth-free write endpoint that the client-side `use-pricing-experiment`
// hook (already tested in P9-use-pricing-experiment-hook-test) beacons an
// impression / conversion event to. Sibling `pricing-experiments.test.ts`
// covers the pure `recordEvent` insert; this suite pins the HTTP wire shape
// on top of it — a silent regression here corrupts the funnel dashboard's
// impression / conversion counters and the pricing team optimises against
// noise.
//
// Silent regressions this suite pins against:
//   - Losing `export const dynamic = "force-dynamic"` — the route lands in
//     the static shell and every impression beacon returns a cached 202
//     with `recorded: true` regardless of experiment state.
//   - Losing `export const runtime = "nodejs"` — Supabase driver inside
//     `recordEvent` cannot run on the Edge runtime; the fire-and-forget
//     write would silently die per region.
//   - Dropping the `.catch(() => null)` on `request.json()` — a beacon sent
//     with `text/plain` content-type or a `keepalive: true` navigation
//     partial-body 500s instead of the documented 400 + `invalid body`.
//   - Regressing the four-field required-guard (experiment, variantKey,
//     type, sessionId) — a partial beacon slips through as an empty-string
//     event and pollutes the funnel dashboard with `variant_key = ''` rows.
//   - Regressing the `.trim()` on experiment / variantKey / sessionId — a
//     `?experiment=%20founder_price_v1%20` beacon lands under a different
//     experiment key than the admin page renders and impressions are lost.
//   - Regressing the `type in {impression, conversion}` allowlist — a
//     future analytics beacon with `type: "click"` would silently insert as
//     `type: null` and the `impressions` / `conversions` count both go up
//     because the summariser filters on `event_type != null`.
//   - Regressing the `typeof sessionId === "string"` narrow — a client that
//     ships `sessionId: null` (e.g. private-mode Safari where the localStorage
//     bootstrapping failed AND the hook fallback is missing) would insert a
//     literal `"null"` string or crash the route.
//   - Regressing the `userId` narrow (`typeof === "string" && body.userId`)
//     — an empty-string userId leaks past as `""` and shows up in the
//     dashboard's `logged-in vs anon` split under an invalid tenant id.
//   - Regressing the `valueAud` finite-number narrow — a `valueAud: "19.95"`
//     string leaks past as a stringly-typed value and Postgres coerces it
//     into a numeric wrongly (or 500s the write). Similarly `Infinity` /
//     `NaN` must be dropped, not stored.
//   - Losing the eager 202 on unknown experiment — the operator adds a new
//     experiment name to the client bundle before it exists in the DB and
//     every beacon 500s instead of dropping silently until the admin row
//     lands.
//   - Losing the `void recordEvent(...)` fire-and-forget — a slow / hung
//     Supabase insert would block the conversion-click navigation.
//   - Regressing the recordEvent argument order (experimentId, variantKey,
//     type, meta) — the sibling lib test pins recordEvent's own contract
//     but the ROUTE has to pass args in the right slots.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingExperiment } from "@/lib/pricing-experiments";

vi.mock("server-only", () => ({}));

const getExperimentByNameMock = vi.fn();
const recordEventMock = vi.fn();
vi.mock("@/lib/pricing-experiments", () => ({
  getExperimentByName: (name: string) => getExperimentByNameMock(name),
  recordEvent: (
    experimentId: string,
    variantKey: string,
    type: "impression" | "conversion",
    meta: { sessionId: string; userId?: string; valueAud?: number },
  ) => recordEventMock(experimentId, variantKey, type, meta),
}));

import { POST, dynamic, runtime } from "./route";

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

function jsonReq(body: unknown, opts: { rawBody?: string; contentType?: string } = {}): Request {
  const init: RequestInit = {
    method: "POST",
    headers: opts.contentType ? { "content-type": opts.contentType } : { "content-type": "application/json" },
    body: opts.rawBody !== undefined ? opts.rawBody : JSON.stringify(body),
  };
  return new Request("http://x/api/pricing-test/event", init);
}

beforeEach(() => {
  getExperimentByNameMock.mockReset();
  recordEventMock.mockReset();
  recordEventMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/pricing-test/event — module exports", () => {
  it('exports dynamic = "force-dynamic" so no beacon lands in the static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it('exports runtime = "nodejs" so the Supabase driver inside recordEvent has a Node runtime', () => {
    expect(runtime).toBe("nodejs");
  });
});

describe("POST /api/pricing-test/event — body parse guard", () => {
  it("returns 400 { ok:false, error:'invalid body' } when the body is not JSON (text/plain beacon)", async () => {
    const res = await POST(jsonReq(undefined, { rawBody: "not-json", contentType: "text/plain" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "invalid body" });
  });

  it("returns 400 when the body is empty", async () => {
    const res = await POST(jsonReq(undefined, { rawBody: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid body");
  });

  it("returns 400 when the body is JSON null (no fields → falsy guard trips)", async () => {
    const res = await POST(jsonReq(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "invalid body" });
  });

  it("does NOT call getExperimentByName / recordEvent on a body-parse failure", async () => {
    await POST(jsonReq(undefined, { rawBody: "{" }));
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
    expect(recordEventMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/pricing-test/event — required-field guard", () => {
  const goodBody = {
    experiment: "founder_price_v1",
    variantKey: "control",
    type: "impression",
    sessionId: "sid-1",
  };

  it("returns 400 with the four-field message when experiment is missing", async () => {
    const { experiment: _ignored, ...rest } = goodBody;
    void _ignored;
    const res = await POST(jsonReq(rest));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "experiment, variantKey, type, sessionId required",
    });
  });

  it("returns 400 when variantKey is missing", async () => {
    const { variantKey: _ignored, ...rest } = goodBody;
    void _ignored;
    const res = await POST(jsonReq(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is missing", async () => {
    const { type: _ignored, ...rest } = goodBody;
    void _ignored;
    const res = await POST(jsonReq(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessionId is missing", async () => {
    const { sessionId: _ignored, ...rest } = goodBody;
    void _ignored;
    const res = await POST(jsonReq(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 when experiment is an empty string (falsy trim)", async () => {
    const res = await POST(jsonReq({ ...goodBody, experiment: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when experiment is whitespace-only (trim reduces to '')", async () => {
    const res = await POST(jsonReq({ ...goodBody, experiment: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when variantKey is whitespace-only", async () => {
    const res = await POST(jsonReq({ ...goodBody, variantKey: "\t\n" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessionId is whitespace-only", async () => {
    const res = await POST(jsonReq({ ...goodBody, sessionId: "  " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when experiment is a non-string (number) — narrows to '' → fails guard", async () => {
    const res = await POST(jsonReq({ ...goodBody, experiment: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when variantKey is a non-string (boolean)", async () => {
    const res = await POST(jsonReq({ ...goodBody, variantKey: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessionId is null (typeof check fails)", async () => {
    const res = await POST(jsonReq({ ...goodBody, sessionId: null }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is 'click' (not in the {impression, conversion} allowlist)", async () => {
    const res = await POST(jsonReq({ ...goodBody, type: "click" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is null", async () => {
    const res = await POST(jsonReq({ ...goodBody, type: null }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is a numeric 1 (would falsely coerce elsewhere)", async () => {
    const res = await POST(jsonReq({ ...goodBody, type: 1 }));
    expect(res.status).toBe(400);
  });

  it("does NOT call getExperimentByName / recordEvent on a field-guard rejection", async () => {
    await POST(jsonReq({ ...goodBody, type: "click" }));
    expect(getExperimentByNameMock).not.toHaveBeenCalled();
    expect(recordEventMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/pricing-test/event — trims inputs before lookup", () => {
  it("trims experiment before handing it to getExperimentByName (padded query still hits the DB row)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "  founder_price_v1  ",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(getExperimentByNameMock).toHaveBeenCalledWith("founder_price_v1");
  });

  it("trims variantKey before handing it to recordEvent", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: " control ",
      type: "impression",
      sessionId: "sid-1",
    }));
    const [, variantKey] = recordEventMock.mock.calls[0]!;
    expect(variantKey).toBe("control");
  });

  it("trims sessionId before handing it to recordEvent", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "  sid-1  ",
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.sessionId).toBe("sid-1");
  });
});

describe("POST /api/pricing-test/event — unknown experiment", () => {
  it("returns 202 { ok:true, recorded:false } when getExperimentByName returns null (do NOT 404)", async () => {
    getExperimentByNameMock.mockResolvedValue(null);
    const res = await POST(jsonReq({
      experiment: "missing_exp",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ ok: true, recorded: false });
  });

  it("does NOT call recordEvent when the experiment is unknown", async () => {
    getExperimentByNameMock.mockResolvedValue(null);
    await POST(jsonReq({
      experiment: "missing_exp",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(recordEventMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/pricing-test/event — happy path (impression)", () => {
  it("returns 202 { ok:true, recorded:true } on a known experiment", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment({ id: "exp-42" }));
    const res = await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ ok: true, recorded: true });
  });

  it("calls recordEvent with (experiment.id, variantKey, type, {sessionId}) — argument order pinned", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment({ id: "exp-42" }));
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(recordEventMock).toHaveBeenCalledTimes(1);
    const [experimentId, variantKey, type, meta] = recordEventMock.mock.calls[0]!;
    expect(experimentId).toBe("exp-42");
    expect(variantKey).toBe("control");
    expect(type).toBe("impression");
    expect(meta).toMatchObject({ sessionId: "sid-1" });
  });

  it("accepts type = 'conversion' and passes it through verbatim", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment({ id: "exp-42" }));
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "treatment",
      type: "conversion",
      sessionId: "sid-2",
    }));
    const [, , type] = recordEventMock.mock.calls[0]!;
    expect(type).toBe("conversion");
  });
});

describe("POST /api/pricing-test/event — userId narrow", () => {
  it("passes userId through when a non-empty string", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
      userId: "user-42",
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.userId).toBe("user-42");
  });

  it("drops userId (undefined in meta) when it is an empty string — matches the `&& body.userId` truthy guard", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
      userId: "",
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.userId).toBeUndefined();
  });

  it("drops userId when it is a non-string (number)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
      userId: 42,
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.userId).toBeUndefined();
  });

  it("drops userId when it is null", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
      userId: null,
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.userId).toBeUndefined();
  });
});

describe("POST /api/pricing-test/event — valueAud narrow", () => {
  it("passes valueAud through when it is a finite positive number", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "conversion",
      sessionId: "sid-1",
      valueAud: 19.95,
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.valueAud).toBe(19.95);
  });

  it("passes valueAud = 0 through (a $0 conversion is still a conversion)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "conversion",
      sessionId: "sid-1",
      valueAud: 0,
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.valueAud).toBe(0);
  });

  it("passes a negative valueAud through (refund event)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "conversion",
      sessionId: "sid-1",
      valueAud: -5,
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.valueAud).toBe(-5);
  });

  it("drops valueAud when it is a string ('19.95' as JSON string, not the number)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "conversion",
      sessionId: "sid-1",
      valueAud: "19.95",
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.valueAud).toBeUndefined();
  });

  it("drops valueAud when it is NaN (empty-cohort computation)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "conversion",
      sessionId: "sid-1",
      valueAud: Number.NaN,
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.valueAud).toBeUndefined();
  });

  it("drops valueAud when it is Infinity", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "conversion",
      sessionId: "sid-1",
      valueAud: Number.POSITIVE_INFINITY,
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.valueAud).toBeUndefined();
  });

  it("drops valueAud when it is missing entirely (impression path)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    const [, , , meta] = recordEventMock.mock.calls[0]!;
    expect(meta.valueAud).toBeUndefined();
  });
});

describe("POST /api/pricing-test/event — fire-and-forget invariants", () => {
  it("returns 202 even when recordEvent has not resolved yet (fire-and-forget via `void`)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    // Never-resolving recordEvent — the route must not await it.
    let resolveInner: () => void = () => {};
    recordEventMock.mockImplementation(() => new Promise<void>((r) => { resolveInner = r; }));

    const res = await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ ok: true, recorded: true });

    // Cleanup so vitest doesn't complain about the dangling promise.
    resolveInner();
  });

  it("calls recordEvent exactly once per POST (no accidental double-fire)", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(recordEventMock).toHaveBeenCalledTimes(1);
  });

  it("calls getExperimentByName exactly once per POST", async () => {
    getExperimentByNameMock.mockResolvedValue(makeExperiment());
    await POST(jsonReq({
      experiment: "founder_price_v1",
      variantKey: "control",
      type: "impression",
      sessionId: "sid-1",
    }));
    expect(getExperimentByNameMock).toHaveBeenCalledTimes(1);
  });
});
