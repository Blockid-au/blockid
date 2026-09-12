// Colocated vitest for /api/account/delete (S24-B).
// Pins: 401 without session; 403 for admin accounts; cross-site refused;
// re-auth — bad password / missing / expired token → 401 reauth_required,
// password users verified with bcrypt, passwordless get an emailed token;
// typed confirmation "DELETE" required (400); 409 with the shared-project
// list; 200 schedules with a 7-day grace + cancel email; cancel clears;
// GET reports status; POST is apiRoute-wrapped.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; role: "user" | "admin" },
  db: null as unknown,
  shared: [] as unknown[],
  reauth: vi.fn(),
  scheduled: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.db }));
vi.mock("@/lib/privacy/erasure-emails", () => ({
  sendDeletionReauth: (a: unknown) => mocks.reauth(a),
  sendDeletionScheduled: (a: unknown) => mocks.scheduled(a),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

import { GET, POST } from "./route";
import { hashToken } from "@/lib/privacy/deletion-request";

const UID = "53d6c062-d928-461e-8d9a-c34860835448";
const HASH = bcrypt.hashSync("correct horse", 4);

/** In-memory app_users / projects / project_members fake matching the chained calls the route + helpers make. */
function makeDb(userRow: Record<string, unknown>, projects: Record<string, unknown>[] = [], members: Record<string, unknown>[] = []) {
  const users: Record<string, Record<string, unknown>> = { [UID]: { id: UID, ...userRow } };
  const patches: Record<string, unknown>[] = [];
  function query(table: string) {
    let rows: Record<string, unknown>[] = table === "app_users" ? Object.values(users) : table === "projects" ? projects : members;
    let pending: Record<string, unknown> | null = null;
    const q = {
      select: () => q,
      update: (p: Record<string, unknown>) => ((pending = p), q),
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
      is: (c: string, v: unknown) => ((rows = rows.filter((r) => (v === null ? r[c] == null : r[c] === v))), q),
      in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: unknown; error: null }) => unknown) => {
        if (pending) {
          for (const r of rows) Object.assign(r, pending);
          patches.push(pending);
        }
        return Promise.resolve({ data: pending ? null : rows, error: null }).then(res);
      },
    };
    return q;
  }
  return { db: { from: query }, users, patches };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    mocks.user = { id: UID, email: "founder@acme.io", role: "user" };
    mocks.reauth.mockReset().mockResolvedValue({ ok: true });
    mocks.scheduled.mockReset().mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    mocks.db = null;
  });

  it("401 without a session; 503 without Supabase; 403 cross-site", async () => {
    mocks.user = null;
    expect((await POST(post({ action: "request" }))).status).toBe(401);
    mocks.user = { id: UID, email: "f@x.io", role: "user" };
    mocks.db = null;
    expect((await POST(post({ action: "request" }))).status).toBe(503);
    mocks.db = makeDb({ password_hash: HASH }).db;
    expect((await POST(post({ action: "request" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(post("{not json"))).status).toBe(400);
  });

  it("admin accounts are refused (403 admin_account) — the admin path is the only way", async () => {
    mocks.user = { id: UID, email: "admin@blockid.au", role: "admin" };
    mocks.db = makeDb({ password_hash: HASH }).db;
    const res = await POST(post({ action: "request", password: "correct horse", confirmation: "DELETE" }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("admin_account");
  });

  it("re-auth: missing / wrong password / no password on file → 401 reauth_required", async () => {
    mocks.db = makeDb({ password_hash: HASH }).db;
    let res = await POST(post({ action: "request", confirmation: "DELETE" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: "reauth_required", detail: "missing", hasPassword: true });
    res = await POST(post({ action: "request", password: "wrong", confirmation: "DELETE" }));
    expect(res.status).toBe(401);
    expect((await res.json()).detail).toBe("bad_password");
    mocks.db = makeDb({ password_hash: null }).db;
    res = await POST(post({ action: "request", password: "anything", confirmation: "DELETE" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ detail: "no_password", hasPassword: false });
  });

  it("passwordless: action=reauth stores a hashed 15-min token and emails it; a valid token then re-auths once", async () => {
    const fake = makeDb({ password_hash: null });
    mocks.db = fake.db;
    const res = await POST(post({ action: "reauth" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: true });
    expect(mocks.reauth).toHaveBeenCalledTimes(1);
    const token = (mocks.reauth.mock.calls[0][0] as { token: string; to: string }).token;
    expect(mocks.reauth.mock.calls[0][0]).toMatchObject({ to: "founder@acme.io" });
    expect(fake.users[UID].deletion_reauth_token_hash).toBe(hashToken(token));
    // wrong token
    let r = await POST(post({ action: "request", token: "x".repeat(32), confirmation: "DELETE" }));
    expect(r.status).toBe(401);
    expect((await r.json()).detail).toBe("invalid");
    // right token → proceeds to confirmation gate (passes) → scheduled
    r = await POST(post({ action: "request", token, confirmation: "DELETE" }));
    expect(r.status).toBe(200);
    expect(fake.users[UID].deletion_reauth_token_hash).toBeNull();
    // replay is dead
    r = await POST(post({ action: "request", token, confirmation: "DELETE" }));
    expect(r.status).toBe(401);
  });

  it("typed confirmation must be exactly DELETE (400)", async () => {
    mocks.db = makeDb({ password_hash: HASH }).db;
    const res = await POST(post({ action: "request", password: "correct horse", confirmation: "delete" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "confirmation", expected: "DELETE" });
    expect(mocks.scheduled).not.toHaveBeenCalled();
  });

  it("409 shared_projects lists live owned projects with other accepted members; nothing scheduled", async () => {
    const fake = makeDb(
      { password_hash: HASH },
      [
        { id: "p1", user_id: UID, name: "Acme", slug: "acme", archived_at: null },
        { id: "p2", user_id: UID, name: "Archived", slug: "old", archived_at: "2026-01-01" },
      ],
      [
        { project_id: "p1", user_id: "cofounder", status: "accepted" },
        { project_id: "p2", user_id: "x", status: "accepted" },
      ],
    );
    mocks.db = fake.db;
    const res = await POST(post({ action: "request", password: "correct horse", confirmation: "DELETE" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, reason: "shared_projects", projects: [{ id: "p1", name: "Acme", slug: "acme", members: 1 }] });
    expect(fake.users[UID].deletion_requested_at).toBeUndefined();
    expect(mocks.scheduled).not.toHaveBeenCalled();
  });

  it("200 schedules: deletion_requested_at + hashed cancel token stored, 7-day scheduledFor, cancel email sent; cancel clears", async () => {
    const fake = makeDb({ password_hash: HASH });
    mocks.db = fake.db;
    const res = await POST(post({ action: "request", password: "correct horse", confirmation: "DELETE", reason: "moving on" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, pending: true, graceDays: 7 });
    const requested = new Date(body.requestedAt).getTime();
    expect(new Date(body.scheduledFor).getTime() - requested).toBe(7 * 86_400_000);
    expect(fake.users[UID].deletion_requested_at).toBe(body.requestedAt);
    expect(fake.users[UID].deletion_reason).toBe("moving on");
    expect(mocks.scheduled).toHaveBeenCalledTimes(1);
    const mail = mocks.scheduled.mock.calls[0][0] as { to: string; cancelToken: string; scheduledFor: string };
    expect(mail.to).toBe("founder@acme.io");
    expect(fake.users[UID].deletion_cancel_token_hash).toBe(hashToken(mail.cancelToken));
    expect(mail.scheduledFor).toBe(body.scheduledFor);

    // status
    const g = await GET();
    expect(g.status).toBe(200);
    expect(await g.json()).toMatchObject({ ok: true, pending: true, hasPassword: true, graceDays: 7, isAdmin: false });

    // cancel
    const c = await POST(post({ action: "cancel" }));
    expect(c.status).toBe(200);
    expect(fake.users[UID].deletion_requested_at).toBeNull();
    expect(fake.users[UID].deletion_cancel_token_hash).toBeNull();
    expect(await (await GET()).json()).toMatchObject({ pending: false });
  });

  it("an already-erased tombstone cannot request again (410)", async () => {
    mocks.db = makeDb({ password_hash: HASH, erased_at: "2026-09-01T00:00:00Z" }).db;
    const res = await POST(post({ action: "request", password: "correct horse", confirmation: "DELETE" }));
    expect(res.status).toBe(410);
  });

  it("GET is 401 without a session", async () => {
    mocks.user = null;
    expect((await GET()).status).toBe(401);
  });
});
