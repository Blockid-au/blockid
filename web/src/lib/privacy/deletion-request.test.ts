// Colocated vitest for the self-service deletion state helpers (S24-B).

import { describe, expect, it } from "vitest";

import {
  CONFIRMATION_PHRASE,
  GRACE_DAYS,
  REAUTH_TTL_MIN,
  cancelDeletion,
  cancelDeletionByToken,
  consumeReauthToken,
  getDeletionStatus,
  hashToken,
  hashesEqual,
  isDue,
  listDueForErasure,
  mintReauthToken,
  requestDeletion,
  scheduledFor,
  sharedProjectsOwnedBy,
} from "./deletion-request";

const UID = "53d6c062-d928-461e-8d9a-c34860835448";

/** Tiny in-memory app_users + projects + project_members fake with the chained API the helpers use. */
function fakeDb(seed: { users?: Record<string, Record<string, unknown>>; projects?: Record<string, unknown>[]; members?: Record<string, unknown>[] } = {}) {
  const users: Record<string, Record<string, unknown>> = seed.users ?? { [UID]: { id: UID, password_hash: "h", deletion_requested_at: null, erased_at: null } };
  const projects = seed.projects ?? [];
  const members = seed.members ?? [];
  const updates: Record<string, unknown>[] = [];

  function query(table: string) {
    const rows: Record<string, unknown>[] = table === "app_users" ? Object.values(users) : table === "projects" ? projects : members;
    let filtered = rows;
    let pending: Record<string, unknown> | null = null;
    let lim = Infinity;
    const q = {
      select: () => q,
      update: (patch: Record<string, unknown>) => {
        pending = patch;
        return q;
      },
      eq: (col: string, v: unknown) => {
        filtered = filtered.filter((r) => r[col] === v);
        return q;
      },
      is: (col: string, v: unknown) => {
        filtered = filtered.filter((r) => (v === null ? r[col] == null : r[col] === v));
        return q;
      },
      in: (col: string, vs: unknown[]) => {
        filtered = filtered.filter((r) => vs.includes(r[col]));
        return q;
      },
      not: (col: string, _op: string, v: unknown) => {
        filtered = filtered.filter((r) => !(v === null ? r[col] == null : r[col] === v));
        return q;
      },
      lte: (col: string, v: string) => {
        filtered = filtered.filter((r) => typeof r[col] === "string" && (r[col] as string) <= v);
        return q;
      },
      order: () => q,
      limit: (n: number) => {
        lim = n;
        return q;
      },
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (pending) {
          for (const r of filtered) Object.assign(r, pending);
          updates.push({ table, patch: pending, n: filtered.length });
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: filtered.slice(0, lim), error: null }).then(resolve);
      },
    };
    return q;
  }
  return { db: { from: query }, users, updates };
}

describe("deletion-request helpers", () => {
  it("constants + schedule math", () => {
    expect(GRACE_DAYS).toBe(7);
    expect(REAUTH_TTL_MIN).toBe(15);
    expect(CONFIRMATION_PHRASE).toBe("DELETE");
    expect(scheduledFor("2026-09-12T00:00:00.000Z").toISOString()).toBe("2026-09-19T00:00:00.000Z");
    expect(isDue("2026-09-12T00:00:00.000Z", new Date("2026-09-18T23:59:59Z"))).toBe(false);
    expect(isDue("2026-09-12T00:00:00.000Z", new Date("2026-09-19T00:00:00Z"))).toBe(true);
    expect(isDue(null, new Date())).toBe(false);
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashesEqual(hashToken("abc"), hashToken("abc"))).toBe(true);
    expect(hashesEqual(hashToken("abc"), hashToken("abd"))).toBe(false);
    expect(hashesEqual(null, hashToken("abc"))).toBe(false);
    expect(hashesEqual("short", hashToken("abc"))).toBe(false);
  });

  it("request → status pending with cancel token hash stored; cancel clears; token cancel works once", async () => {
    const { db, users } = fakeDb();
    const now = new Date("2026-09-12T10:00:00Z");
    const r = await requestDeletion(db, UID, { reason: "leaving", now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scheduledFor).toBe("2026-09-19T10:00:00.000Z");
    expect(users[UID].deletion_cancel_token_hash).toBe(hashToken(r.cancelToken));
    expect(users[UID].deletion_reason).toBe("leaving");
    const st = await getDeletionStatus(db, UID);
    expect(st).toEqual({ pending: true, requestedAt: "2026-09-12T10:00:00.000Z", scheduledFor: "2026-09-19T10:00:00.000Z", hasPassword: true, erased: false });

    expect(await cancelDeletionByToken(db, "short")).toEqual({ ok: false, reason: "invalid" });
    expect(await cancelDeletionByToken(db, "x".repeat(32))).toEqual({ ok: false, reason: "invalid" });
    expect(await cancelDeletionByToken(db, r.cancelToken)).toEqual({ ok: true, userId: UID });
    expect(users[UID].deletion_requested_at).toBeNull();
    expect(users[UID].deletion_cancel_token_hash).toBeNull();
    expect(await cancelDeletionByToken(db, r.cancelToken)).toEqual({ ok: false, reason: "invalid" });

    await requestDeletion(db, UID, { now });
    expect((await getDeletionStatus(db, UID))?.pending).toBe(true);
    expect(await cancelDeletion(db, UID)).toEqual({ ok: true });
    expect((await getDeletionStatus(db, UID))?.pending).toBe(false);
  });

  it("re-auth token: single use, expiry enforced, wrong token rejected", async () => {
    const { db, users } = fakeDb();
    const now = new Date("2026-09-12T10:00:00Z");
    const m = await mintReauthToken(db, UID, now);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(users[UID].deletion_reauth_token_hash).toBe(hashToken(m.token));
    expect(await consumeReauthToken(db, UID, "nope-nope-nope-nope", now)).toBe("invalid");
    expect(await consumeReauthToken(db, UID, m.token, new Date(now.getTime() + 16 * 60_000))).toBe("expired");
    // expired consumption still burns the token
    expect(users[UID].deletion_reauth_token_hash).toBeNull();
    const m2 = await mintReauthToken(db, UID, now);
    if (!m2.ok) throw new Error("mint");
    expect(await consumeReauthToken(db, UID, m2.token, new Date(now.getTime() + 60_000))).toBe("ok");
    expect(await consumeReauthToken(db, UID, m2.token, now)).toBe("invalid");
  });

  it("sharedProjectsOwnedBy lists only live projects with other accepted members", async () => {
    const { db } = fakeDb({
      projects: [
        { id: "p1", user_id: UID, name: "Acme", slug: "acme", archived_at: null },
        { id: "p2", user_id: UID, name: "Solo", slug: "solo", archived_at: null },
        { id: "p3", user_id: UID, name: "Old", slug: "old", archived_at: "2026-01-01" },
        { id: "p4", user_id: "other", name: "Theirs", slug: "t", archived_at: null },
      ],
      members: [
        { project_id: "p1", user_id: "cofounder", status: "accepted" },
        { project_id: "p1", user_id: UID, status: "accepted" },
        { project_id: "p1", user_id: "viewer", status: "accepted" },
        { project_id: "p2", user_id: "x", status: "pending" },
        { project_id: "p3", user_id: "y", status: "accepted" },
      ],
    });
    expect(await sharedProjectsOwnedBy(db, UID)).toEqual([{ id: "p1", name: "Acme", slug: "acme", members: 2 }]);
    expect(await sharedProjectsOwnedBy(db, "nobody")).toEqual([]);
  });

  it("listDueForErasure returns requests older than the grace period, not erased ones", async () => {
    const { db } = fakeDb({
      users: {
        a: { id: "a", deletion_requested_at: "2026-09-01T00:00:00.000Z", erased_at: null },
        b: { id: "b", deletion_requested_at: "2026-09-11T00:00:00.000Z", erased_at: null },
        c: { id: "c", deletion_requested_at: "2026-08-01T00:00:00.000Z", erased_at: "2026-08-09T00:00:00.000Z" },
        d: { id: "d", deletion_requested_at: null, erased_at: null },
      },
    });
    const due = await listDueForErasure(db, new Date("2026-09-12T00:00:00Z"));
    expect(due.map((r) => r.id)).toEqual(["a"]);
  });
});
