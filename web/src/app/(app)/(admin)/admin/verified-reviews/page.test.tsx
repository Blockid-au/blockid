// Colocated test for /admin/verified-reviews (G35 Pricing v5 P4): the admin
// guard (anon → login, non-admin → /workspace/score), the queue (overdue
// first, Sydney deadline, refunded orders absent, light template), the
// 0474-missing banner, and the detail page + review workspace render.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import { darkSurfaceOffences } from "@/design/light-markup";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/verified-reviews",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const mocks = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, db: null as unknown }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user, ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.db }));

import { fakeDb } from "@/lib/verified-review/fake-db.testkit";
import { ORDER, ORDER_OVERDUE, ORDER_REFUNDED, seedTables } from "@/lib/verified-review/review.fixtures.testkit";
import VerifiedReviewsPage from "./page";
import VerifiedReviewDetailPage from "./[orderId]/page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  mocks.user = { id: "admin-1", email: "admin@blockid.au", role: "admin" };
  mocks.db = fakeDb({ tables: seedTables() });
});

describe("/admin/verified-reviews — guard", () => {
  it("anonymous → login with next; signed-in non-admin → /workspace/score", async () => {
    mocks.user = null;
    await expect(VerifiedReviewsPage()).rejects.toThrow("REDIRECT:/auth/login?next=/admin/verified-reviews");
    mocks.user = { id: "u", email: "founder@x.co", role: "user" };
    await expect(VerifiedReviewsPage()).rejects.toThrow("REDIRECT:/workspace/score");
    await expect(VerifiedReviewDetailPage({ params: Promise.resolve({ orderId: ORDER }) })).rejects.toThrow("REDIRECT:/workspace/score");
  });

  it("admin by e-mail (role user) is let in", async () => {
    mocks.user = { id: "a", email: "admin@blockid.au", role: "user" };
    const out = await html(await VerifiedReviewsPage());
    expect(out).toContain("Verified reviews");
  });
});

describe("/admin/verified-reviews — queue", () => {
  it("overdue first, Sydney deadline, refunded order absent, light template", async () => {
    const out = await html(await VerifiedReviewsPage());
    const iOverdue = out.indexOf(`/admin/verified-reviews/${ORDER_OVERDUE}`);
    const iSoon = out.indexOf(`/admin/verified-reviews/${ORDER}`);
    expect(iOverdue).toBeGreaterThan(-1);
    expect(iSoon).toBeGreaterThan(iOverdue);
    expect(out).not.toContain(ORDER_REFUNDED);
    expect(out).toContain("Overdue");
    expect(out).toMatch(/11:59[^<]*AEDT/);
    expect(out).toContain("Acme Robotics");
    expect(darkSurfaceOffences(out)).toEqual([]);
  });

  it("0474 not applied → banner", async () => {
    mocks.db = fakeDb({ tables: seedTables(), missingColumns: { report_orders: ["sla_due_at"] } });
    const out = await html(await VerifiedReviewsPage());
    expect(out).toContain("0474_pricing_v5_payg.sql");
  });
});

describe("/admin/verified-reviews/[orderId]", () => {
  it("renders the review workspace: evidence with links, Accept / Reject, notes, Mark reviewed", async () => {
    const out = await html(await VerifiedReviewDetailPage({ params: Promise.resolve({ orderId: ORDER }) }));
    expect(out).toContain("Acme Robotics");
    expect(out).toContain("Stripe MRR export");
    expect(out).toContain('href="https://dashboard.stripe.com/x"');
    expect(out).toContain("Accept");
    expect(out).toContain("Reject");
    expect(out).toContain("Review notes");
    expect(out).toContain("Mark reviewed");
    expect(darkSurfaceOffences(out)).toEqual([]);
  });

  it("a refunded order is read-only (no decision buttons, no Mark reviewed)", async () => {
    const out = await html(await VerifiedReviewDetailPage({ params: Promise.resolve({ orderId: ORDER_REFUNDED }) }));
    expect(out).toContain("This order was refunded");
    expect(out).not.toContain("Mark reviewed");
    expect(out).not.toMatch(/>Accept</);
  });

  it("unknown order → notFound", async () => {
    await expect(VerifiedReviewDetailPage({ params: Promise.resolve({ orderId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }) })).rejects.toThrow("NOT_FOUND");
  });
});
