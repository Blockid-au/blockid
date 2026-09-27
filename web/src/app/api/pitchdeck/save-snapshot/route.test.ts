// G34 F02/S3 — the pitch-deck snapshot save commits an immutable revision of
// the SV2-stamped ReportV2 it just stored, keyed on the deck's project;
// best-effort: a missing project skips it, and a failing / throwing commit or
// an unconfirmed projection never changes the 200 response.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  write: vi.fn(),
  commit: vi.fn(),
  db: null as unknown,
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.user }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_: unknown, handler: unknown) => handler }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mock.db }));
vi.mock("@/lib/report-v2/storage", () => ({ writeSnapshotReportV2: mock.write }));
vi.mock("@/lib/report-v2/commit-final-report", () => ({ commitFinalReport: mock.commit }));

import { POST } from "./route";

interface Op { table: string; op: string; payload?: unknown }

function fakeDb(deck: Record<string, unknown>, account: Record<string, unknown> | null) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const o: Op = { table, op: "select" };
      ops.push(o);
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        insert: (p: unknown) => { o.op = "insert"; o.payload = p; return chain; },
        update: (p: unknown) => { o.op = "update"; o.payload = p; return chain; },
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "pitchdeck_analyses") return { data: deck, error: null };
          if (table === "svi_accounts") return { data: account, error: null };
          if (table === "svi_snapshots" && o.op === "insert") return { data: { id: "snap-1" }, error: null };
          return { data: null, error: null };
        },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
      });
      return chain;
    },
  };
  return { db, ops };
}

const DECK = { id: "deck-1", user_id: "u-1", project_id: "p-1", filename: "deck.pdf", final_svi: null, status: "analyzing", extracted_text: "" };

function req(): Request {
  return new Request("http://x/api/pitchdeck/save-snapshot", {
    method: "POST",
    body: JSON.stringify({ pitchdeckId: "deck-1", totalSVI: 64, dimResults: { tre: { score: 60 }, mpc: { score: 70 } } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.user.mockResolvedValue({ id: "u-1" });
  mock.write.mockResolvedValue(true);
  mock.commit.mockResolvedValue({ status: "committed", revisionId: "rev-1", shareToken: "t" });
});

describe("POST /api/pitchdeck/save-snapshot — immutable revision", () => {
  it("commits the stamped document it stored, keyed on the deck's project + snapshot", async () => {
    const f = fakeDb(DECK, { id: "acc-1", project_id: "p-other" });
    mock.db = f.db;
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, snapshotInserted: true, totalSVI: 64 });
    const stored = mock.write.mock.calls[0][2] as { methodMeta?: { svi_method: string } };
    expect(stored.methodMeta?.svi_method).toMatch(/^svi-/);
    expect(mock.commit).toHaveBeenCalledTimes(1);
    expect(mock.commit.mock.calls[0][1]).toMatchObject({ source: "pitchdeck_snapshot", projectId: "p-1", accountId: "acc-1", snapshotId: "snap-1" });
    expect(mock.commit.mock.calls[0][1].report).toBe(stored);
  });

  it("a failing or throwing commit never changes the response", async () => {
    for (const impl of [() => Promise.resolve({ status: "failed", reason: "unconfirmed" }), () => Promise.reject(new Error("db")), () => { throw new Error("sync"); }]) {
      mock.commit.mockImplementationOnce(impl as () => Promise<unknown>);
      mock.db = fakeDb(DECK, { id: "acc-1", project_id: null }).db;
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, snapshotInserted: true });
    }
  });

  it("no commit when the ReportV2 projection was not confirmed; project falls back to the account's", async () => {
    mock.write.mockResolvedValueOnce(false);
    mock.db = fakeDb(DECK, { id: "acc-1", project_id: null }).db;
    expect((await POST(req())).status).toBe(200);
    expect(mock.commit).not.toHaveBeenCalled();
    mock.db = fakeDb({ ...DECK, project_id: null }, { id: "acc-1", project_id: "p-acc" }).db;
    await POST(req());
    expect(mock.commit.mock.calls[0][1]).toMatchObject({ projectId: "p-acc" });
  });

  it("hands commitFinalReport a null project when neither the deck nor the account has one (it skips)", async () => {
    mock.db = fakeDb({ ...DECK, project_id: null }, { id: "acc-1", project_id: null }).db;
    expect((await POST(req())).status).toBe(200);
    expect(mock.commit.mock.calls[0][1]).toMatchObject({ projectId: null });
  });
});
