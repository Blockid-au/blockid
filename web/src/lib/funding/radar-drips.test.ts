// Colocated vitest for lib/funding/radar-drips.ts (T0246).
//
// Pins the pending_email → email_drips contract:
//   * only rows carrying `last_notified.pending_email` are read
//     (`last_notified->pending_email` not null)
//   * deadline_t30/t14/t3 → radar_t30/t14/t3, status_changed →
//     radar_status_changed, anything else is ignored (dropped, still cleared)
//   * `canSendEmail(email, "money_radar") === false` → the entry is dropped,
//     nothing is enqueued, the key is still cleared (opt-out honoured)
//   * the payload carries name / A$ / official link / closes_at / report link
//     / unsubscribe token from the joined catalogue + preferences
//   * the key is cleared only when every entry succeeded — an enqueue error
//     leaves the row for the next run; a second run over cleared rows is a
//     no-op (idempotent)
//   * dryRun reads everything and writes nothing
//   * status_changed alternatives = next two open matches by score,
//     excluding the flipped row

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const { canSendEmailMock, getPrefsMock, enqueueMock } = vi.hoisted(() => ({
  canSendEmailMock: vi.fn(),
  getPrefsMock: vi.fn(),
  enqueueMock: vi.fn(),
}));
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (...a: unknown[]) => canSendEmailMock(...a),
  getEmailPreferences: (...a: unknown[]) => getPrefsMock(...a),
}));
vi.mock("@/lib/email-drip", () => ({
  enqueueRadarDrip: (...a: unknown[]) => enqueueMock(...a),
}));

import {
  enqueueRadarDripsFromMatches,
  campaignForEvent,
  readPendingEmail,
  withoutPendingEmail,
  pickAlternatives,
  refKey,
  type CatalogueRef,
} from "./radar-drips";

// ── Fake Supabase ────────────────────────────────────────────────────────────

interface Tables {
  funding_matches: Array<Record<string, unknown>>;
  app_users: Array<Record<string, unknown>>;
  au_grants: Array<Record<string, unknown>>;
  au_programs: Array<Record<string, unknown>>;
  funding_reports: Array<Record<string, unknown>>;
}

interface Captured {
  updates: Array<{ table: string; patch: Record<string, unknown>; id: unknown }>;
  filters: Array<{ table: string; op: string; col: string; val: unknown }>;
}

function fakeDb(tables: Tables, captured: Captured) {
  return {
    from(table: keyof Tables) {
      const filters: Array<{ op: string; col: string; val: unknown }> = [];
      let patch: Record<string, unknown> | null = null;
      const apply = () => {
        let rows = tables[table] ?? [];
        for (const f of filters) {
          if (f.op === "eq") rows = rows.filter((r) => r[f.col] === f.val);
          if (f.op === "in") rows = rows.filter((r) => (f.val as unknown[]).includes(r[f.col]));
          if (f.op === "not_is_null" && f.col === "last_notified->pending_email") {
            rows = rows.filter((r) => (r.last_notified as Record<string, unknown> | undefined)?.pending_email != null);
          }
        }
        return rows;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq(col: string, val: unknown) {
          filters.push({ op: "eq", col, val });
          captured.filters.push({ table, op: "eq", col, val });
          return chain;
        },
        in(col: string, val: unknown) {
          filters.push({ op: "in", col, val });
          return chain;
        },
        not(col: string, op: string, val: unknown) {
          filters.push({ op: `not_${op}_${val}`, col, val });
          captured.filters.push({ table, op: `not.${op}.${val}`, col, val });
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        update(p: Record<string, unknown>) {
          patch = p;
          return chain;
        },
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          let result: unknown;
          if (patch) {
            const rows = apply();
            for (const r of rows) Object.assign(r, patch);
            captured.updates.push({ table, patch, id: filters.find((f) => f.col === "id")?.val });
            result = { data: rows, error: null };
          } else {
            result = { data: apply().map((r) => ({ ...r })), error: null };
          }
          return Promise.resolve(result).then(onF, onR);
        },
      };
      return chain;
    },
  };
}

const NOW = new Date("2026-09-13T05:05:00.000Z");

function tables(overrides: Partial<Tables> = {}): Tables {
  return {
    funding_matches: [
      {
        id: "m1",
        user_id: "u1",
        project_id: "p1",
        ref_kind: "grant",
        ref_id: "nsw-mvp",
        score: 80,
        status_at_match: "open",
        closes_at: "2026-09-27",
        last_notified: { t14: "2026-09-13", radar_events: [{ event: "deadline_t14", at: "2026-09-13" }], pending_email: [{ event: "deadline_t14", at: "2026-09-13" }] },
      },
      {
        id: "m2",
        user_id: "u1",
        project_id: "p1",
        ref_kind: "program",
        ref_id: "syd-startmate",
        score: 70,
        status_at_match: "open",
        closes_at: "2026-10-10",
        last_notified: { t30: "2026-09-13" },
      },
      {
        id: "m3",
        user_id: "u2",
        project_id: null,
        ref_kind: "grant",
        ref_id: "qld-ignite",
        score: 60,
        status_at_match: "open",
        closes_at: "2026-09-15",
        last_notified: { t3: "2026-09-13", pending_email: [{ event: "deadline_t3", at: "2026-09-13" }] },
      },
    ],
    app_users: [
      { id: "u1", email: "One@Example.com" },
      { id: "u2", email: "two@example.com" },
    ],
    au_grants: [
      { id: "nsw-mvp", name: "MVP Ventures", official_url: "https://mvp.example", amount_max_aud: 50000, closes_at: "2026-09-27", status: "open" },
      { id: "qld-ignite", name: "Ignite Ideas", official_url: "https://ignite.example", amount_max_aud: 200000, closes_at: "2026-09-15", status: "open" },
    ],
    au_programs: [
      { id: "syd-startmate", name: "Startmate", official_url: "https://startmate.example", funding_aud: 120000, applications_close: "2026-10-10", next_cohort_start: null, program_type: "accelerator", status: "open" },
    ],
    funding_reports: [{ id: "r1", user_id: "u1", status: "ready", created_at: "2026-09-01T00:00:00Z" }],
    ...overrides,
  };
}

beforeEach(() => {
  canSendEmailMock.mockReset().mockResolvedValue(true);
  getPrefsMock.mockReset().mockResolvedValue({ unsubscribe_token: "tok-u" });
  enqueueMock.mockReset().mockResolvedValue("queued");
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe("campaignForEvent / readPendingEmail / withoutPendingEmail", () => {
  it("maps the three tiers + status_changed and ignores everything else", () => {
    expect(campaignForEvent("deadline_t30")).toBe("radar_t30");
    expect(campaignForEvent("deadline_t14")).toBe("radar_t14");
    expect(campaignForEvent("deadline_t3")).toBe("radar_t3");
    expect(campaignForEvent("status_changed")).toBe("radar_status_changed");
    expect(campaignForEvent("new_match")).toBeNull();
    expect(campaignForEvent("")).toBeNull();
  });

  it("readPendingEmail tolerates junk and withoutPendingEmail keeps every other key", () => {
    expect(readPendingEmail(null)).toEqual([]);
    expect(readPendingEmail({ pending_email: "x" })).toEqual([]);
    expect(readPendingEmail({ pending_email: [{ event: "deadline_t3" }, null, { at: "x" }, 4] })).toEqual([{ event: "deadline_t3", at: "" }]);
    const ln = { t3: "2026-09-13", radar_events: [1], pending_email: [{ event: "deadline_t3", at: "d" }] };
    expect(withoutPendingEmail(ln)).toEqual({ t3: "2026-09-13", radar_events: [1] });
    expect(ln.pending_email).toBeDefined();
  });
});

describe("pickAlternatives", () => {
  it("returns the next two open matches by score, excluding the flipped row", () => {
    const refs = new Map<string, CatalogueRef>([
      [refKey("grant", "a"), { ref_kind: "grant", ref_id: "a", name: "A", official_url: null, amount_max_aud: 1, closes_at: null, status: "open" }],
      [refKey("grant", "b"), { ref_kind: "grant", ref_id: "b", name: "B", official_url: "https://b", amount_max_aud: 2, closes_at: "2026-10-01", status: "open" }],
      [refKey("program", "c"), { ref_kind: "program", ref_id: "c", name: "C", official_url: null, amount_max_aud: null, closes_at: null, status: "open" }],
      [refKey("grant", "d"), { ref_kind: "grant", ref_id: "d", name: "D", official_url: null, amount_max_aud: null, closes_at: null, status: "closed" }],
    ]);
    const siblings = [
      { ref_kind: "grant" as const, ref_id: "a", score: 50, status_at_match: "open" },
      { ref_kind: "grant" as const, ref_id: "b", score: 90, status_at_match: "open" },
      { ref_kind: "program" as const, ref_id: "c", score: 70, status_at_match: "upcoming" },
      { ref_kind: "grant" as const, ref_id: "d", score: 99, status_at_match: "closed" },
      { ref_kind: "grant" as const, ref_id: "flipped", score: 100, status_at_match: "paused" },
    ];
    const out = pickAlternatives({ ref_kind: "grant", ref_id: "flipped" }, siblings, refs);
    expect(out.map((a) => a.name)).toEqual(["B", "C"]);
    expect(out[0]).toMatchObject({ official_url: "https://b", amount_max_aud: 2, closes_at: "2026-10-01" });
  });
});

// ── Enqueuer ─────────────────────────────────────────────────────────────────

describe("enqueueRadarDripsFromMatches", () => {
  it("supabase_unavailable when no client", async () => {
    const s = await enqueueRadarDripsFromMatches({ now: NOW });
    expect(s).toMatchObject({ ok: false, error: "supabase_unavailable", rows: 0 });
  });

  it("reads only pending rows, enqueues one drip per entry with the joined payload, clears the key", async () => {
    const t = tables();
    const captured: Captured = { updates: [], filters: [] };
    const s = await enqueueRadarDripsFromMatches({ db: fakeDb(t, captured), now: NOW });

    expect(s).toMatchObject({ ok: true, rows: 2, pending: 2, queued: 2, duplicate: 0, unsubscribed: 0, ignored: 0, cleared: 2, errors: 0 });
    expect(captured.filters).toContainEqual({ table: "funding_matches", op: "not.is.null", col: "last_notified->pending_email", val: null });

    expect(enqueueMock).toHaveBeenCalledTimes(2);
    const [email, userId, campaign, payload, opts] = enqueueMock.mock.calls[0];
    expect(email).toBe("one@example.com");
    expect(userId).toBe("u1");
    expect(campaign).toBe("radar_t14");
    expect(payload).toEqual({
      ref_kind: "grant",
      ref_id: "nsw-mvp",
      ref_name: "MVP Ventures",
      closes_at: "2026-09-27",
      amount_max_aud: 50000,
      official_url: "https://mvp.example",
      report_url: "https://blockid.au/funding/report/r1",
      status: "open",
      unsubscribe_token: "tok-u",
    });
    expect((opts as { now: Date }).now).toBe(NOW);
    expect(enqueueMock.mock.calls[1][2]).toBe("radar_t3");
    expect(enqueueMock.mock.calls[1][3]).toMatchObject({ ref_name: "Ignite Ideas", report_url: null });

    // pending_email removed, other keys intact.
    expect(t.funding_matches[0].last_notified).toEqual({ t14: "2026-09-13", radar_events: [{ event: "deadline_t14", at: "2026-09-13" }] });
    expect(t.funding_matches[2].last_notified).toEqual({ t3: "2026-09-13" });
    expect(captured.updates.map((u) => u.id)).toEqual(["m1", "m3"]);

    // One preference lookup per address.
    expect(canSendEmailMock).toHaveBeenCalledTimes(2);
    expect(canSendEmailMock).toHaveBeenCalledWith("one@example.com", "money_radar");
  });

  it("is idempotent — a second run finds nothing", async () => {
    const t = tables();
    const captured: Captured = { updates: [], filters: [] };
    await enqueueRadarDripsFromMatches({ db: fakeDb(t, captured), now: NOW });
    enqueueMock.mockClear();
    const again = await enqueueRadarDripsFromMatches({ db: fakeDb(t, captured), now: NOW });
    expect(again).toMatchObject({ ok: true, rows: 0, queued: 0, cleared: 0 });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("drops entries for an address that opted out of money_radar, enqueues nothing, still clears", async () => {
    canSendEmailMock.mockImplementation(async (email: string) => email !== "one@example.com");
    const t = tables();
    const captured: Captured = { updates: [], filters: [] };
    const s = await enqueueRadarDripsFromMatches({ db: fakeDb(t, captured), now: NOW });
    expect(s).toMatchObject({ queued: 1, unsubscribed: 1, cleared: 2 });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0][0]).toBe("two@example.com");
    expect(t.funding_matches[0].last_notified).not.toHaveProperty("pending_email");
  });

  it("counts duplicates from enqueueRadarDrip and still clears the key", async () => {
    enqueueMock.mockResolvedValue("duplicate");
    const t = tables();
    const s = await enqueueRadarDripsFromMatches({ db: fakeDb(t, { updates: [], filters: [] }), now: NOW });
    expect(s).toMatchObject({ queued: 0, duplicate: 2, cleared: 2, errors: 0 });
  });

  it("leaves the row for the next run when an enqueue fails", async () => {
    enqueueMock.mockImplementation(async (_e: string, userId: string) => (userId === "u1" ? "error" : "queued"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = tables();
    const captured: Captured = { updates: [], filters: [] };
    const s = await enqueueRadarDripsFromMatches({ db: fakeDb(t, captured), now: NOW });
    expect(s).toMatchObject({ queued: 1, errors: 1, cleared: 1 });
    expect(t.funding_matches[0].last_notified).toHaveProperty("pending_email");
    expect(captured.updates.map((u) => u.id)).toEqual(["m3"]);
  });

  it("ignores unknown events and a user without an email, clearing both", async () => {
    const t = tables({
      funding_matches: [
        { id: "m9", user_id: "u1", project_id: null, ref_kind: "grant", ref_id: "nsw-mvp", score: 1, status_at_match: "open", closes_at: null, last_notified: { pending_email: [{ event: "new_match", at: "x" }] } },
        { id: "m10", user_id: "u3", project_id: null, ref_kind: "grant", ref_id: "nsw-mvp", score: 1, status_at_match: "open", closes_at: null, last_notified: { pending_email: [{ event: "deadline_t3", at: "x" }] } },
      ],
    });
    const s = await enqueueRadarDripsFromMatches({ db: fakeDb(t, { updates: [], filters: [] }), now: NOW });
    expect(s).toMatchObject({ rows: 2, pending: 2, ignored: 1, unsubscribed: 1, queued: 0, cleared: 2 });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("dryRun counts what it would queue and writes nothing", async () => {
    const t = tables();
    const captured: Captured = { updates: [], filters: [] };
    const s = await enqueueRadarDripsFromMatches({ db: fakeDb(t, captured), now: NOW, dryRun: true });
    expect(s).toMatchObject({ ok: true, dryRun: true, rows: 2, queued: 2, cleared: 2 });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(captured.updates).toHaveLength(0);
    expect(t.funding_matches[0].last_notified).toHaveProperty("pending_email");
  });

  it("status_changed → radar_status_changed with the next two open matches as alternatives", async () => {
    const t = tables({
      funding_matches: [
        { id: "m1", user_id: "u1", project_id: "p1", ref_kind: "grant", ref_id: "nsw-mvp", score: 80, status_at_match: "paused", closes_at: null, last_notified: { status_changed: "paused", pending_email: [{ event: "status_changed", at: "2026-09-13" }] } },
        { id: "m2", user_id: "u1", project_id: "p1", ref_kind: "program", ref_id: "syd-startmate", score: 70, status_at_match: "open", closes_at: "2026-10-10", last_notified: {} },
        { id: "m3", user_id: "u1", project_id: "p1", ref_kind: "grant", ref_id: "qld-ignite", score: 90, status_at_match: "open", closes_at: "2026-09-15", last_notified: {} },
      ],
    });
    const s = await enqueueRadarDripsFromMatches({ db: fakeDb(t, { updates: [], filters: [] }), now: NOW });
    expect(s).toMatchObject({ queued: 1, cleared: 1 });
    const [, , campaign, payload] = enqueueMock.mock.calls[0];
    expect(campaign).toBe("radar_status_changed");
    expect(payload).toMatchObject({ ref_name: "MVP Ventures", status: "paused" });
    expect((payload as { alternatives: Array<{ name: string }> }).alternatives.map((a) => a.name)).toEqual(["Ignite Ideas", "Startmate"]);
  });
});
