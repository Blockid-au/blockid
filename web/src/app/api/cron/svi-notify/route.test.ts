// Colocated vitest for /api/cron/svi-notify — the disabled SVI-notify endpoint.
//
// The route is deliberately a no-op: all lifecycle email sends were consolidated
// into /api/cron/weekly-insights so the platform ships exactly four emails per
// user (SVI-received, 1w follow-up, 1m follow-up, 3m follow-up). The route is
// kept alive only so that the server crontab entry does not 404. Silent
// regressions this suite pins against:
//
//   (a) losing `export const dynamic = "force-dynamic"` — a static export would
//       cache the "disabled" envelope at build time and hide any future drift;
//   (b) losing the CRON_SECRET auth gate — the endpoint would then leak that
//       SVI notifications are disabled to any anonymous scraper;
//   (c) failing closed when CRON_SECRET is unset or empty (mis-configured env
//       must never authenticate a bare `Bearer ` header);
//   (d) breaking POST↔GET parity — crontab shells sometimes use POST (retryable)
//       and sometimes GET (health-check), so both verbs MUST delegate to the
//       same handler and produce byte-identical envelopes;
//   (e) accidentally starting to send emails again — the envelope MUST report
//       `notified: 0`, `emailed: 0`, and the sentinel policy string, because
//       any future re-enable belongs in weekly-insights, not here;
//   (f) drift on the exact 4-key envelope shape — adding fields would break
//       downstream cron-health parsers that key on this route's response.
//
// The route has no external deps to mock (no supabase, no resend, no fetch).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "cron-secret-svi-notify-value";

function req(method: "GET" | "POST", headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/svi-notify", { method, headers });
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

describe("/api/cron/svi-notify — route module shape", () => {
  it("pins `export const dynamic = 'force-dynamic'` so the envelope is never cached", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("POST is the same function reference as GET (single-handler re-export)", () => {
    expect(POST).toBe(GET);
  });
});

describe("GET /api/cron/svi-notify — auth gate", () => {
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

  it("returns 401 when a valid secret is sent under a non-Bearer scheme (Basic)", async () => {
    const res = await GET(req("GET", { authorization: `Basic ${SECRET}` }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/svi-notify — happy-path envelope", () => {
  it("returns 200 when authorised", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
  });

  it("envelope reports ok: true (route stays 'healthy' so crontab does not alert)", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("envelope reports notified: 0 and emailed: 0 (the route MUST not notify)", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.notified).toBe(0);
    expect(body.emailed).toBe(0);
  });

  it("envelope carries the sentinel policy string identifying the migration", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.policy).toBe(
      "disabled — lifecycle emails only (SVI → 1w → 1m → 3m)",
    );
  });

  it("envelope has exactly the four documented keys — no drift", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["emailed", "notified", "ok", "policy"].sort(),
    );
  });

  it("envelope does NOT carry a ts / timestamp field (route is untimed)", async () => {
    // Distinguishes svi-notify from its sibling /api/cron/nurture, which does
    // emit a ts. A drift toward parity would grow the envelope silently.
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.ts).toBeUndefined();
    expect(body.timestamp).toBeUndefined();
  });

  it("Content-Type is application/json (NextResponse.json default)", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  });

  it("notified/emailed are strictly numeric zero, not falsy stand-ins", async () => {
    const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(typeof body.notified).toBe("number");
    expect(typeof body.emailed).toBe("number");
    expect(body.notified).toBe(0);
    expect(body.emailed).toBe(0);
  });
});

describe("POST /api/cron/svi-notify — parity with GET", () => {
  it("POST returns 401 when unauthorised (identical to GET)", async () => {
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
    expect(pBody.notified).toBe(gBody.notified);
    expect(pBody.emailed).toBe(gBody.emailed);
    expect(pBody.policy).toBe(gBody.policy);
  });

  it("POST fails closed when CRON_SECRET is unset — same policy as GET", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
  });
});

describe("/api/cron/svi-notify — determinism of the disabled envelope", () => {
  it("repeated authorised calls always return notified: 0 / emailed: 0", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
      const body = await res.json();
      expect(body.notified).toBe(0);
      expect(body.emailed).toBe(0);
      expect(body.ok).toBe(true);
    }
  });

  it("policy string is byte-identical across calls (no accidental interpolation)", async () => {
    const a = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const b = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const bodyA = await a.json();
    const bodyB = await b.json();
    expect(bodyA.policy).toBe(bodyB.policy);
  });
});
