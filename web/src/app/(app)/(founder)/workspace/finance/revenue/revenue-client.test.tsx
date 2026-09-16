// Colocated vitest for the revenue dashboard client (S25-A). SSR-renders the
// exported DataSourcesPanel + the sourceCaption helper: Xero is a live
// connector (link to /api/oauth/xero, no "Coming Soon"), QuickBooks is an
// honest "not available yet" (S31-B), a connected Xero/Stripe card shows the
// last sync date, and
// the per-figure captions print the API's source labels with a fallback for
// a pre-S25-A payload.

import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataSourcesPanel, RevenueClient, sourceCaption } from "./revenue-client";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("DataSourcesPanel", () => {
  it("nothing connected: Stripe + Xero offer Connect links; QuickBooks is an honest 'not available yet' with the CSV route (S31-B)", async () => {
    const out = await html(<DataSourcesPanel data={{ hasStripe: false, hasStripeConnect: false, hasXero: false, connectors: { stripe: null, xero: null } }} />);
    expect(out).toContain('href="/api/auth/stripe/connect"');
    expect(out).toContain("Connect Stripe");
    expect(out).toContain('href="/api/oauth/xero"');
    expect(out).toContain("Connect Xero");
    expect(out).toContain("QuickBooks");
    expect(out).not.toContain("Coming Soon");
    expect(out).toContain("A QuickBooks connection is not available yet");
    expect(out).toContain('data-testid="quickbooks-unavailable"');
    expect(out).toContain('href="/workspace/finance/expenses"');
    expect(out).toContain("re-sync every Monday");
  });

  it("Xero OAuth app not configured on the server: no dead link, an honest 'not available yet' label (live QA F2)", async () => {
    const out = await html(
      <DataSourcesPanel data={{ hasStripe: false, hasStripeConnect: false, hasXero: false, connectors: { stripe: null, xero: null }, available: { xero: false, stripeConnect: true } }} />,
    );
    expect(out).not.toContain('href="/api/oauth/xero"');
    expect(out).toContain("Xero — not available yet");
    expect(out).toContain('data-testid="xero-unavailable"');
  });

  it("connected Xero + Stripe Connect: green cards with the last sync date, no connect links", async () => {
    const out = await html(
      <DataSourcesPanel
        data={{
          hasStripe: false,
          hasStripeConnect: true,
          hasXero: true,
          connectors: { stripe: { takenAt: "2026-09-07T05:00:00Z", source: "resync" }, xero: { takenAt: "2026-09-03T02:00:00Z", source: "resync" } },
        }}
      />,
    );
    expect(out).toContain("MRR, subscriptions and churn synced weekly (last: 7 Sep)");
    expect(out).toContain("P&amp;L income, expenses and bank balance synced weekly (last: 3 Sep)");
    expect(out).not.toContain("Connect Xero");
    expect(out).not.toContain("Connect Stripe");
    expect((out.match(/border-green-200 bg-green-50/g) ?? []).length).toBe(2);
  });

  it("legacy payload (platform Stripe only, no S25-A fields) still renders the old Stripe copy", async () => {
    const out = await html(<DataSourcesPanel data={{ hasStripe: true }} />);
    expect(out).toContain("auto-importing charges and subscriptions");
    expect(out).toContain("Connect Xero");
  });
});

describe("sourceCaption", () => {
  it("prints the API label and falls back when the payload predates S25-A", () => {
    const data = { sources: { mrr: { kind: "stripe_connect", label: "from Stripe, 7 Sep", takenAt: "x" }, cogs: { kind: "estimate", label: "estimate", takenAt: null } } };
    expect(sourceCaption(data, "mrr", "Monthly recurring revenue")).toBe("from Stripe, 7 Sep");
    expect(sourceCaption(data, "cogs", "x")).toBe("estimate");
    expect(sourceCaption(data, "opex", "Month-over-month")).toBe("Month-over-month");
    expect(sourceCaption(undefined, "mrr", "fallback")).toBe("fallback");
  });
});

describe("RevenueClient", () => {
  it("SSR-renders the loading shell without throwing", async () => {
    const out = await html(<RevenueClient />);
    expect(out.length).toBeGreaterThan(0);
  });
});

// S31-E (#31): the manual-entry form no longer paints a server error in the
// neutral success style, and the copy it derives from /api/revenue failure
// bodies goes through userErrorMessage() — slugs and raw messages never
// reach the screen. The effect-driven fetch cannot run without a DOM, so the
// mapping is pinned through the same call the component makes.
describe("manual entry error copy (S31-E)", () => {
  it("maps /api/revenue failure bodies to user copy", async () => {
    const { ApiError, userErrorMessage } = await import("@/lib/ui/user-error");
    const FB = "Could not save the entry. Please try again.";
    expect(userErrorMessage(ApiError.fromBody(400, { ok: false, error: "Amount must be a positive number." }), FB)).toBe("Amount must be a positive number.");
    expect(userErrorMessage(ApiError.fromBody(401, { ok: false, error: "unauthorized" }), FB)).toBe("Please sign in again.");
    expect(userErrorMessage(ApiError.fromBody(500, { ok: false, error: 'relation "revenue_entries" does not exist' }), FB)).toBe(FB);
    expect(userErrorMessage(new TypeError("Failed to fetch"), FB)).toContain("Connection problem");
  });

  it("the SSR shell carries no stale success-styled error slot", async () => {
    const out = await html(<RevenueClient />);
    expect(out).not.toContain("Failed to connect to server.");
  });
});
