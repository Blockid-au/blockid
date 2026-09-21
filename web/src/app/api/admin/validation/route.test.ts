// Colocated vitest for /api/admin/validation (G22-D): the auth ladder (401
// anon / 403 non-admin on every verb), zod 400s (strict: unknown key, bad
// date, level 6, empty patch), the ledger round-trip on a temp root
// (POST 201 → PATCH 200 → DELETE 200 → 404 again), the GET dashboard shape
// and the per-admin write rate limit. Supabase is absent (null client) so
// the GET reads the ledger + JSONL only and reports the warning. G23-C: PATCH
// If-Match → 409 `stale` with the current row.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser(), ADMIN_EMAIL: "admin@blockid.au" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("server-only", () => ({}));

import { DELETE, GET, PATCH, POST, VALIDATION_WRITES_PER_HOUR } from "./route";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";
import { readValidationLedger } from "@/lib/validation/ledger";

const ADMIN = { id: "admin-1", email: "admin@blockid.au", role: "admin", plan: null };
const FOUNDER = { id: "u-9", email: "founder@x.io", role: "user", plan: "free" };
const ENTRY = { organisation: "Demo Accelerator", contact_role: "Program manager", date: "2026-09-20", level: 1, outcome: "done", objection: "No budget until July", next_step: "Send proposal" };

let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "validation-route-"));
  process.env.BLOCKID_WEB_DIR = root;
});
afterAll(() => {
  delete process.env.BLOCKID_WEB_DIR;
  rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ADMIN);
});

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/admin/validation", { method, ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });

describe("auth ladder", () => {
  it("401 anonymous on every verb", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(req("POST", ENTRY))).status).toBe(401);
    expect((await PATCH(req("PATCH", { id: "x", note: "y" }))).status).toBe(401);
    expect((await DELETE(req("DELETE", { id: "x" }))).status).toBe(401);
  });

  it("403 signed-in non-admin on every verb — nothing is written", async () => {
    mocks.getCurrentUser.mockResolvedValue(FOUNDER);
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST", ENTRY))).status).toBe(403);
    expect((await PATCH(req("PATCH", { id: "x", note: "y" }))).status).toBe(403);
    expect((await DELETE(req("DELETE", { id: "x" }))).status).toBe(403);
    expect((await readValidationLedger(root)).entries).toEqual([]);
  });
});

describe("validation (zod, strict)", () => {
  it("400 on an unknown key, a bad date, level 6, invalid JSON, an empty patch, a missing id", async () => {
    for (const body of [{ ...ENTRY, extra: 1 }, { ...ENTRY, date: "20/09/2026" }, { ...ENTRY, level: 6 }, "{not json"]) {
      const res = await POST(req("POST", body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      const j = (await res.json()) as { ok: boolean; error: string; message?: string };
      expect(j.ok).toBe(false);
    }
    expect((await PATCH(req("PATCH", { id: "abcdef12-0000-4000-8000-000000000000" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { note: "no id" }))).status).toBe(400);
    expect((await DELETE(req("DELETE", {}))).status).toBe(400);
    expect((await readValidationLedger(root)).entries).toEqual([]);
  });
});

describe("ledger round-trip", () => {
  it("POST 201 → GET shows ladder actual + objection → PATCH 200 → DELETE 200 → 404 again", async () => {
    const created = await POST(req("POST", ENTRY));
    expect(created.status).toBe(201);
    const c = (await created.json()) as { ok: boolean; entry: { id: string; organisation: string; note: string } };
    expect(c.ok).toBe(true);
    expect(c.entry.organisation).toBe("Demo Accelerator");
    expect(c.entry.note).toBe("");
    const id = c.entry.id;

    const got = await GET();
    expect(got.status).toBe(200);
    const d = (await got.json()) as { ok: boolean; ladder: Array<{ level: number; actual: number; target: number }>; objections: Array<{ text: string; count: number }>; auto: unknown[]; north_star: unknown; warnings: string[]; ledger: { entries: unknown[] } };
    expect(d.ok).toBe(true);
    expect(d.ledger.entries).toHaveLength(1);
    expect(d.ladder[0]).toMatchObject({ level: 1, actual: 1, target: 5 });
    expect(d.objections).toEqual([expect.objectContaining({ text: "No budget until July", count: 1 })]);
    expect(d.auto).toEqual([]);
    expect(d.north_star).toBeNull();
    expect(d.warnings.join(" ")).toMatch(/supabase not configured/);

    const patched = await PATCH(req("PATCH", { id, outcome: "declined", objection_answered: true }));
    expect(patched.status).toBe(200);
    const p = (await patched.json()) as { entry: { outcome: string; objection_answered: boolean; id: string } };
    expect(p.entry).toMatchObject({ id, outcome: "declined", objection_answered: true });
    expect(((await (await GET()).json()) as { objections: unknown[] }).objections).toEqual([]);

    expect((await PATCH(req("PATCH", { id: "00000000-0000-4000-8000-000000000000", note: "x" }))).status).toBe(404);

    const deleted = await DELETE(req("DELETE", { id }));
    expect(deleted.status).toBe(200);
    expect(((await deleted.json()) as { entry: { id: string } }).entry.id).toBe(id);
    expect((await DELETE(req("DELETE", { id }))).status).toBe(404);
    expect((await readValidationLedger(root)).entries).toEqual([]);
  });

  it("429 after VALIDATION_WRITES_PER_HOUR writes by the same admin (Retry-After set)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, id: "admin-rl" });
    let last: Response | null = null;
    for (let i = 0; i < VALIDATION_WRITES_PER_HOUR + 1; i += 1) last = await POST(req("POST", { ...ENTRY, organisation: `Org ${i}` }));
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await readValidationLedger(root)).entries).toHaveLength(VALIDATION_WRITES_PER_HOUR);
  });
});

// G23-C — PATCH honours If-Match (the entry's updated_at the client rendered).
describe("PATCH If-Match (G23-C)", () => {
  const reqIf = (body: unknown, ifMatch: string) =>
    new Request("http://localhost/api/admin/validation", { method: "PATCH", headers: { "content-type": "application/json", "if-match": ifMatch }, body: JSON.stringify(body) });

  it("matching → 200; stale → 409 { error: stale, entry: current row } with user-safe copy and no write; quoted / weak forms accepted; garbage = unconditional", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...ADMIN, id: "admin-ifmatch" });
    const created = await POST(req("POST", { ...ENTRY, organisation: "If-Match Org" }));
    expect(created.status).toBe(201);
    const c = (await created.json()) as { entry: { id: string; updated_at: string } };
    const id = c.entry.id;

    const ok = await PATCH(reqIf({ id, note: "first" }, c.entry.updated_at));
    expect(ok.status).toBe(200);
    const first = (await ok.json()) as { entry: { updated_at: string; note: string } };
    expect(first.entry.note).toBe("first");

    // The original updated_at is now stale → 409 carrying the current row; nothing written.
    const stale = await PATCH(reqIf({ id, note: "second" }, c.entry.updated_at));
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { ok: boolean; error: string; message: string; entry: { id: string; note: string; updated_at: string } };
    expect(body).toMatchObject({ ok: false, error: "stale", entry: { id, note: "first", updated_at: first.entry.updated_at } });
    expect(userErrorMessage(ApiError.fromBody(409, body), "fallback")).toBe(body.message);
    expect(body.message).toMatch(/changed since you opened it/);
    expect((await readValidationLedger(root)).entries.find((e) => e.id === id)?.note).toBe("first");

    // Re-read → retry with the fresh value; quoted and weak (W/) forms are normalised.
    expect((await PATCH(reqIf({ id, note: "second" }, `W/"${body.entry.updated_at}"`))).status).toBe(200);
    // Not a timestamp → ignored (unconditional), never a 400.
    expect((await PATCH(reqIf({ id, note: "third" }, "etag-abc"))).status).toBe(200);
    expect((await readValidationLedger(root)).entries.find((e) => e.id === id)?.note).toBe("third");
  });
});
