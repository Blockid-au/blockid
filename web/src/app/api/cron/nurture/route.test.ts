// Colocated vitest for /api/cron/nurture — the disabled lifecycle-nurture endpoint.
//
// This route is deliberately a no-op (all lifecycle email sends were moved to
// /api/cron/weekly-insights so the platform ships exactly four emails per user:
// SVI-received, 1w, 1m, 3m). The route is kept alive only so that the server
// crontab entry does not 404. The regressions this suite pins against:
//
//   (a) losing `export const dynamic = "force-dynamic"` — a static export would
//       cache the "disabled" envelope at build time and hide any drift;
//   (b) losing the CRON_SECRET auth gate — the endpoint would then leak that
//       nurture is disabled + a live timestamp to any anonymous scraper;
//   (c) failing closed when CRON_SECRET is unset or empty (misconfigured env
//       must never authenticate a bare `Bearer ` header);
//   (d) breaking the POST↔GET parity — the crontab shells sometimes use POST
//       (retryable) and sometimes GET (health-check), so both verbs must
//       delegate to the same handler and produce byte-identical envelopes;
//   (e) accidentally starting to send emails again — the envelope MUST report
//       `sent: 0`, `skipped: 0`, and the sentinel policy string, because any
//       future re-enable belongs in weekly-insights, not here.
//
// The route has no external deps to mock (no supabase, no resend, no fetch).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "cron-secret-nurture-value";

function req(method: "GET" | "POST", headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/nurture", { method, headers });
}

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe("/api/cron/nurture — route module shape", () => {
  it("pins `export const dynamic = 'force-dynamic'` so the pixel is never cached", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("POST is the same function reference as GET (single-handler re-export)", () => {
    expect(POST).toBe(GET);
  });
});

describe("GET /api/cron/nurture — auth gate", () => {
  it("returns 401 when no Authorization header is sent", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const res = await GET(req("GET", { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when the header value omits the 'Bearer ' prefix", async () => {
    const res = await GET(req("GET", { authorization: SECRET }));
    expect(res.status).toBe(401);
  });

  it("is case-sensitive — 'bearer' with a lowercase b is not accepted", async () => {
    const res = await GET(req("GET", { authorization: `bearer ${SECRET}` }));
    expect(res.status).toBe(401);
  });

  it("fails closed with 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
  });

  it("fails closed with 401 on a bare `Bearer ` header when CRON_SECRET is empty", async () => {
    process.env.CRON_SECRET = "";
    const res = await GET(req("GET", { authorization: "Bearer " }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization is present but empty-string", async () => {
    const res = await GET(req("GET", { authorization: "" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/nurture — happy-path envelope", () => {
  it("returns 200 when authorised", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
  });

  it("envelope reports ok: true (route stays 'healthy' so crontab does not alert)", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("envelope reports sent: 0 and skipped: 0 (the route MUST not send email)", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it("envelope carries the sentinel policy string identifying the migration", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.policy).toBe(
      "disabled — lifecycle emails only (SVI → 1w → 1m → 3m)",
    );
  });

  it("envelope carries a valid ISO-8601 timestamp reflecting current time", async () => {
    const before = Date.now();
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const after = Date.now();
    const body = await res.json();
    expect(typeof body.ts).toBe("string");
    const parsed = Date.parse(body.ts);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before - 1);
    expect(parsed).toBeLessThanOrEqual(after + 1);
    expect(body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  });

  it("envelope has exactly the five documented keys — no drift", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["ok", "policy", "sent", "skipped", "ts"].sort(),
    );
  });

  it("Content-Type is application/json (NextResponse.json default)", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  });
});

describe("POST /api/cron/nurture — parity with GET", () => {
  it("POST rejects 401 when unauthorised (identical to GET)", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("POST returns the same envelope shape as GET when authorised", async () => {
    const g = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const p = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(p.status).toBe(g.status);
    const gBody = await g.json();
    const pBody = await p.json();
    expect(Object.keys(pBody).sort()).toEqual(Object.keys(gBody).sort());
    expect(pBody.ok).toBe(gBody.ok);
    expect(pBody.sent).toBe(gBody.sent);
    expect(pBody.skipped).toBe(gBody.skipped);
    expect(pBody.policy).toBe(gBody.policy);
  });

  it("POST fails closed when CRON_SECRET is unset — same policy as GET", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
  });
});

describe("/api/cron/nurture — determinism of the disabled envelope", () => {
  it("repeated authorised calls always return sent: 0 / skipped: 0", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
      const body = await res.json();
      expect(body.sent).toBe(0);
      expect(body.skipped).toBe(0);
      expect(body.ok).toBe(true);
    }
  });
});
