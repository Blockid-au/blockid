// Unit test for GET /api/health/stripe
//
// Locks the contract: the required-events list must exactly match the
// switch arms in web/src/app/api/stripe/webhook/route.ts, and the endpoint
// must return { ok: false, missing_events: [...] } — never throw — when a
// live endpoint is missing a subscription.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("server-only", () => ({}));

const listMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    webhookEndpoints: { list: listMock },
  }),
}));

import { GET, REQUIRED_WEBHOOK_EVENTS } from "./route";

beforeEach(() => {
  listMock.mockReset();
});

describe("GET /api/health/stripe", () => {
  it("returns ok:true when the matching endpoint subscribes to every required event", async () => {
    listMock.mockResolvedValue({
      data: [
        {
          url: "https://blockid.au/api/stripe/webhook",
          status: "enabled",
          enabled_events: [...REQUIRED_WEBHOOK_EVENTS],
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.missing_events).toEqual([]);
  });

  it("returns ok:true when the endpoint uses the wildcard '*'", async () => {
    listMock.mockResolvedValue({
      data: [
        {
          url: "https://blockid.au/api/stripe/webhook",
          status: "enabled",
          enabled_events: ["*"],
        },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns ok:false + missing_events when checkout.session.completed is not subscribed (the zenya incident)", async () => {
    listMock.mockResolvedValue({
      data: [
        {
          url: "https://blockid.au/api/stripe/webhook",
          status: "enabled",
          enabled_events: REQUIRED_WEBHOOK_EVENTS.filter(
            (e) => e !== "checkout.session.completed",
          ),
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200); // never 500 — just loud log
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.missing_events).toContain("checkout.session.completed");
  });

  it("returns ok:false when no endpoint matches blockid.au/api/stripe/webhook", async () => {
    listMock.mockResolvedValue({
      data: [
        {
          url: "https://staging.other.com/api/stripe/webhook",
          status: "enabled",
          enabled_events: ["*"],
        },
      ],
    });
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/No Stripe webhook endpoint matches/);
  });

  it("returns 503 when the Stripe API call throws", async () => {
    listMock.mockRejectedValue(new Error("stripe unreachable"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/stripe unreachable/);
  });
});

describe("REQUIRED_WEBHOOK_EVENTS drift guard", () => {
  // Parses the webhook route file for `case "..."` (or 'case ...') arms in
  // the top-level `switch (event.type)` and asserts the set matches
  // REQUIRED_WEBHOOK_EVENTS exactly. If this test fails, either add the
  // event to REQUIRED_WEBHOOK_EVENTS or remove the unused case — do not
  // silence the assertion.
  it("matches the switch arms in web/src/app/api/stripe/webhook/route.ts exactly", () => {
    const webhookPath = resolve(
      __dirname,
      "../../stripe/webhook/route.ts",
    );
    const src = readFileSync(webhookPath, "utf8");
    // Match either single- or double-quoted case labels.
    const caseRe = /case\s+["']([^"']+)["']\s*:/g;
    const cases = new Set<string>();
    for (const m of src.matchAll(caseRe)) cases.add(m[1]!);

    const required = new Set<string>(REQUIRED_WEBHOOK_EVENTS);

    const missingFromRequired = [...cases].filter((c) => !required.has(c));
    const extraInRequired = [...required].filter((c) => !cases.has(c));

    expect(
      { missingFromRequired, extraInRequired },
      `REQUIRED_WEBHOOK_EVENTS drift: switch has [${missingFromRequired.join(", ")}] not in required; required has [${extraInRequired.join(", ")}] not in switch`,
    ).toEqual({ missingFromRequired: [], extraInRequired: [] });
  });
});
