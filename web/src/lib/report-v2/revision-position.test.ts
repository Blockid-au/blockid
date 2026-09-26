// G34 BT3 (spec §3) — revision numbering for the old-revision banner:
// creation order over every row (a revoke never renumbers), latest = newest
// non-revoked row, and the latest link only for the project owner.

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revisionBannerFor, revisionPositionFrom, type RevisionRowLike } from "./revision-position";

const row = (id: string, day: number, revoked = false): RevisionRowLike => ({ id, share_token: `tok-${id}`, created_at: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`, revoked_at: revoked ? "2026-09-26T00:00:00Z" : null });

/** Minimal PostgREST stub: projects.select("user_id").eq("id", …).maybeSingle(). */
function dbWithOwner(ownerId: string): SupabaseClient {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { user_id: ownerId }, error: null }) };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("revisionPositionFrom", () => {
  it("numbers rows in creation order whatever the input order; latest = newest row", () => {
    const pos = revisionPositionFrom([row("c", 20), row("a", 1), row("b", 10)], "b", "p1");
    expect(pos).toEqual({ projectId: "p1", current: { n: 2, createdAt: row("b", 10).created_at }, latest: { n: 3, createdAt: row("c", 20).created_at, shareToken: "tok-c" } });
  });

  it("a revoked newest row is skipped for 'latest' but keeps its number", () => {
    const pos = revisionPositionFrom([row("a", 1), row("b", 10), row("c", 20, true)], "a", "p1")!;
    expect(pos.current.n).toBe(1);
    expect(pos.latest).toMatchObject({ n: 2, shareToken: "tok-b" });
  });

  it("unknown current id or every row revoked → null", () => {
    expect(revisionPositionFrom([row("a", 1)], "zz", "p1")).toBeNull();
    expect(revisionPositionFrom([row("a", 1, true)], "a", "p1")).toBeNull();
  });
});

describe("revisionBannerFor", () => {
  const pos = revisionPositionFrom([row("a", 1), row("b", 10)], "a", "p1");

  it("owner gets the latest link; anyone else gets none", async () => {
    expect(await revisionBannerFor(pos, "u1", dbWithOwner("u1"))).toMatchObject({ current: { n: 1 }, latest: { n: 2 }, latestHref: "/tbr/tok-b" });
    expect(await revisionBannerFor(pos, "u1", dbWithOwner("u1"), "/vi/tbr")).toMatchObject({ latestHref: "/vi/tbr/tok-b" });
    expect((await revisionBannerFor(pos, "someone-else", dbWithOwner("u1")))!.latestHref).toBeNull();
    expect((await revisionBannerFor(pos, null, dbWithOwner("u1")))!.latestHref).toBeNull();
  });

  it("no banner when this is the latest revision or no position", async () => {
    expect(await revisionBannerFor(revisionPositionFrom([row("a", 1), row("b", 10)], "b", "p1"), "u1", dbWithOwner("u1"))).toBeNull();
    expect(await revisionBannerFor(null, "u1", dbWithOwner("u1"))).toBeNull();
  });
});
