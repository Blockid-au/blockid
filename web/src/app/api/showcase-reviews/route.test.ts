// Colocated vitest for POST /api/showcase-reviews (S21-A review P1-1).
//
// Pins that the reviewer identity is the FOUNDER-set
// `data_room_access_tokens.investor_email` and nothing else:
//   - the request body cannot name a reviewer (no `email` / `reviewerEmail`
//     field is read);
//   - a link with no founder-set email is refused (400) rather than reviewed
//     anonymously or under a ledger email;
//   - a revoked / expired / unknown token answers one 403 body;
//   - the upsert keys on (project_id, reviewer_email) with the token's email.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  getCurrentUser: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.sb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));

import { POST } from "./route";

const TOKEN = "s".repeat(32);

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/showcase-reviews", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const LINK = {
  id: "link-1",
  data_room_id: "room-1",
  investor_email: "Jane@Fund.VC",
  is_active: true,
  revoked_at: null,
  expires_at: null,
};
const ROOM = { id: "room-1", project_id: "proj-1" };

let sb: FakeSupabase;
function setup(link: Record<string, unknown> | null = LINK) {
  sb = fakeSupabase({
    data_room_access_tokens: link ? [link] : [],
    data_rooms: [ROOM],
  });
  mocks.sb = sb;
}

beforeEach(() => setup());

describe("POST /api/showcase-reviews — reviewer identity", () => {
  it("writes the review under the FOUNDER-set investor_email, normalised, keyed on (project_id, reviewer_email)", async () => {
    const res = await POST(req({ token: TOKEN, rating: 4, comment: "Solid team." }));
    expect(res.status).toBe(200);
    const [up] = sb.find("showcase_reviews", "upsert");
    expect(up.args[0]).toMatchObject({
      project_id: "proj-1",
      access_token_id: "link-1",
      reviewer_email: "jane@fund.vc",
      rating: 4,
      comment: "Solid team.",
    });
    expect(up.args[1]).toEqual({ onConflict: "project_id,reviewer_email" });
    expect(sb.hasEq("data_room_access_tokens", "token", TOKEN)).toBe(true);
  });

  it("ignores any identity the body tries to supply", async () => {
    await POST(req({ token: TOKEN, rating: 5, email: "partner@blackbird.vc", reviewerEmail: "partner@blackbird.vc" }));
    const [up] = sb.find("showcase_reviews", "upsert");
    expect((up.args[0] as { reviewer_email: string }).reviewer_email).toBe("jane@fund.vc");
    expect(JSON.stringify(up.args[0])).not.toContain("blackbird");
  });

  it("refuses a link with no founder-set email — no anonymous identity, no ledger fallback", async () => {
    setup({ ...LINK, investor_email: null });
    const res = await POST(req({ token: TOKEN, rating: 5 }));
    expect(res.status).toBe(400);
    expect(sb.find("showcase_reviews", "upsert").length).toBe(0);
    setup({ ...LINK, investor_email: "   " });
    expect((await POST(req({ token: TOKEN, rating: 5 }))).status).toBe(400);
  });

  it("answers one 403 body for an unknown, revoked or expired token", async () => {
    const bodies = new Set<string>();
    setup(null);
    let res = await POST(req({ token: TOKEN, rating: 5 }));
    expect(res.status).toBe(403);
    bodies.add(JSON.stringify(await res.json()));
    setup({ ...LINK, is_active: false });
    res = await POST(req({ token: TOKEN, rating: 5 }));
    expect(res.status).toBe(403);
    bodies.add(JSON.stringify(await res.json()));
    setup({ ...LINK, revoked_at: "2026-09-01T00:00:00Z" });
    res = await POST(req({ token: TOKEN, rating: 5 }));
    expect(res.status).toBe(403);
    bodies.add(JSON.stringify(await res.json()));
    setup({ ...LINK, expires_at: "2020-01-01T00:00:00Z" });
    res = await POST(req({ token: TOKEN, rating: 5 }));
    expect(res.status).toBe(403);
    bodies.add(JSON.stringify(await res.json()));
    expect(bodies.size).toBe(1);
    expect(sb.find("showcase_reviews", "upsert").length).toBe(0);
  });

  it("400s a missing token or an out-of-range rating before any lookup", async () => {
    expect((await POST(req({ rating: 5 }))).status).toBe(400);
    expect((await POST(req({ token: TOKEN, rating: 9 }))).status).toBe(400);
    expect((await POST(req({ token: TOKEN, rating: "five" }))).status).toBe(400);
    expect(sb.calls.length).toBe(0);
  });
});
