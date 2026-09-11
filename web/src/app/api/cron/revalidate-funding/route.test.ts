// Colocated vitest for /api/cron/revalidate-funding (S8-D). Pins: the
// Bearer CRON_SECRET gate, that an authorised call expires the `au-funding`
// tag exactly once and echoes the tag, that a missing Next store degrades to
// `revalidated:false` (never a 500), and POST === GET.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { revalidateMock } = vi.hoisted(() => ({ revalidateMock: vi.fn(() => true) }));
vi.mock("@/lib/funding/data", () => ({
  AU_FUNDING_CACHE_TAG: "au-funding",
  revalidateFundingCatalogue: () => revalidateMock(),
}));

import { GET, POST, dynamic } from "./route";

function req(auth?: string, method: "GET" | "POST" = "POST") {
  return new Request("http://localhost/api/cron/revalidate-funding", { method, headers: auth ? { authorization: auth } : {} });
}

describe("revalidate-funding route", () => {
  const origSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    revalidateMock.mockClear();
    revalidateMock.mockReturnValue(true);
  });
  afterEach(() => {
    if (origSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = origSecret;
  });

  it("exports force-dynamic and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(POST).toBe(GET);
  });

  it("401 without / with a wrong bearer and when CRON_SECRET is unset; the tag is untouched", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer nope"))).status).toBe(401);
    expect((await POST(req("s3cret"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await POST(req("Bearer s3cret"))).status).toBe(401);
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("expires the catalogue tag once and echoes it", async () => {
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tag: "au-funding", revalidated: true });
    expect(revalidateMock).toHaveBeenCalledTimes(1);
  });

  it("reports revalidated:false (still 200) when there is no Next cache store", async () => {
    revalidateMock.mockReturnValue(false);
    const res = await GET(req("Bearer s3cret", "GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).revalidated).toBe(false);
  });
});
