// Colocated vitest for GET /api/account/delete/cancel (S24-B) — the emailed
// "Keep my account" link. Valid token → state cleared + 303 to settings
// (?deletion=cancelled); invalid / reused → 303 ?deletion=invalid, no change.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => state.db }));

import { GET } from "./route";
import { hashToken } from "@/lib/privacy/deletion-request";

function makeDb(rows: Record<string, unknown>[]) {
  const patches: Record<string, unknown>[] = [];
  return {
    patches,
    db: {
      from: () => {
        let r = rows;
        let pending: Record<string, unknown> | null = null;
        const q = {
          select: () => q,
          update: (p: Record<string, unknown>) => ((pending = p), q),
          eq: (c: string, v: unknown) => ((r = r.filter((x) => x[c] === v)), q),
          is: (c: string, v: unknown) => ((r = r.filter((x) => (v === null ? x[c] == null : x[c] === v))), q),
          maybeSingle: async () => ({ data: r[0] ?? null, error: null }),
          then: (res: (v: unknown) => unknown) => {
            if (pending) {
              for (const x of r) Object.assign(x, pending);
              patches.push(pending);
            }
            return Promise.resolve({ data: null, error: null }).then(res);
          },
        };
        return q;
      },
    },
  };
}

describe("GET /api/account/delete/cancel", () => {
  const orig = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = orig;
  });

  it("valid token clears the request and redirects to settings", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
    const token = "t".repeat(32);
    const row = { id: "u1", deletion_requested_at: "2026-09-12T00:00:00Z", deletion_cancel_token_hash: hashToken(token), erased_at: null };
    const fake = makeDb([row]);
    state.db = fake.db;
    const res = await GET(new Request(`http://localhost/api/account/delete/cancel?token=${token}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://blockid.au/workspace/settings?deletion=cancelled");
    expect(row.deletion_requested_at).toBeNull();
    expect(row.deletion_cancel_token_hash).toBeNull();
    // replay
    const again = await GET(new Request(`http://localhost/api/account/delete/cancel?token=${token}`));
    expect(again.headers.get("location")).toBe("https://blockid.au/workspace/settings?deletion=invalid");
  });

  it("missing / short / unknown token → invalid, nothing written; 503 without Supabase", async () => {
    const fake = makeDb([{ id: "u1", deletion_cancel_token_hash: hashToken("a".repeat(32)), erased_at: null }]);
    state.db = fake.db;
    for (const q of ["", "?token=short", `?token=${"b".repeat(32)}`]) {
      const res = await GET(new Request(`http://localhost/api/account/delete/cancel${q}`));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toMatch(/deletion=invalid$/);
    }
    expect(fake.patches).toEqual([]);
    state.db = null;
    expect((await GET(new Request("http://localhost/api/account/delete/cancel?token=x"))).status).toBe(503);
  });
});
