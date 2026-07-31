// Colocated vitest for the server-only consent event recorder.
//
// Every disclaimer ack, ToS acceptance, wholesale certification, and marketing
// opt-in flows through `recordConsent`. The pinned contract callers depend on:
//
//   • row-shape verbatim on the consent_events insert (snake_case columns,
//     ip_address / user_agent from ip / ua, disclaimer_hash + disclaimer_version)
//   • ip || null and ua || null coercion on empty strings
//   • detail ?? {} fallback so undefined does not become a "undefined" jsonb blob
//   • throws when admin client unavailable (silent no-op would defeat compliance)
//   • throws when the insert errors or returns no data
//   • best-effort audit mirror — audit failure is logged but does NOT throw,
//     because the consent row itself is the legal artefact
//   • audit payload keys the disclaimer_kind / version / hash / granted /
//     jurisdiction fields exactly (a rename here breaks the hash chain replay)
//
// Uses a chain-shape fake `SupabaseClient` for the .from().insert().select().single()
// path and a mocked `appendAudit` with failure injection.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── module mocks (must precede the import under test) ──────────────────

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? adminClient : null),
}));

vi.mock("@/lib/audit", () => ({
  appendAudit: (params: unknown) => {
    state.auditCalls.push(params as Record<string, unknown>);
    if (state.auditFail) throw new Error("audit boom");
    return Promise.resolve({ id: 1n, curr_hash: "deadbeef" });
  },
}));

// ─── fake Supabase client ────────────────────────────────────────────────

interface InsertCapture {
  from: string;
  payload: Record<string, unknown>;
  selectCols: string | null;
  terminal: "single" | null;
}

interface FakeState {
  adminConfigured: boolean;
  insertResult: { data: { id: string } | null; error: { message: string } | null };
  auditFail: boolean;
  captures: InsertCapture[];
  auditCalls: Array<Record<string, unknown>>;
}

const state: FakeState = {
  adminConfigured: true,
  insertResult: { data: { id: "consent-uuid-1" }, error: null },
  auditFail: false,
  captures: [],
  auditCalls: [],
};

const adminClient = {
  from(table: string) {
    const capture: InsertCapture = {
      from: table,
      payload: {},
      selectCols: null,
      terminal: null,
    };
    state.captures.push(capture);
    return {
      insert(payload: Record<string, unknown>) {
        capture.payload = payload;
        return {
          select(cols: string) {
            capture.selectCols = cols;
            return {
              single: async () => {
                capture.terminal = "single";
                return state.insertResult;
              },
            };
          },
        };
      },
    };
  },
};

beforeEach(() => {
  state.adminConfigured = true;
  state.insertResult = { data: { id: "consent-uuid-1" }, error: null };
  state.auditFail = false;
  state.captures = [];
  state.auditCalls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── tests ────────────────────────────────────────────────────────────────

describe("hashDisclaimerBody", () => {
  it("produces a stable 64-char sha256 hex over utf-8 bytes", async () => {
    const { hashDisclaimerBody } = await import("./consent");
    const h = hashDisclaimerBody("hello world");
    // sha256("hello world") — canonical fixture from Node docs.
    expect(h).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across calls on the same input", async () => {
    const { hashDisclaimerBody } = await import("./consent");
    expect(hashDisclaimerBody("body")).toBe(hashDisclaimerBody("body"));
  });

  it("distinguishes different bodies (avalanche property)", async () => {
    const { hashDisclaimerBody } = await import("./consent");
    const a = hashDisclaimerBody("body");
    const b = hashDisclaimerBody("Body");
    expect(a).not.toBe(b);
  });

  it("handles empty string as the canonical sha256 of ''", async () => {
    const { hashDisclaimerBody } = await import("./consent");
    expect(hashDisclaimerBody("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes utf-8 encoded multibyte characters (not JS UTF-16)", async () => {
    const { hashDisclaimerBody } = await import("./consent");
    // sha256("é") when encoded as utf-8 (0xc3 0xa9). If the module accidentally
    // used a UTF-16 encoding the hash would drift.
    expect(hashDisclaimerBody("é")).toBe(
      "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c",
    );
  });
});

describe("recordConsent — guards", () => {
  const validParams = {
    user_id: "u-1",
    kind: "tos",
    disclaimer_version: "v2.0-2026-07-16",
    disclaimer_hash: "hash-tos",
    ip: "1.2.3.4",
    ua: "TestAgent/1.0",
    jurisdiction: "AU",
    granted: true,
  };

  it("throws when the Supabase admin client is unavailable (no silent no-op)", async () => {
    state.adminConfigured = false;
    const { recordConsent } = await import("./consent");
    await expect(recordConsent(validParams)).rejects.toThrow(
      /Supabase admin client unavailable/,
    );
    expect(state.captures).toEqual([]);
    expect(state.auditCalls).toEqual([]);
  });

  it("throws when the insert returns a Postgres error, interpolating the message", async () => {
    state.insertResult = { data: null, error: { message: "duplicate key" } };
    const { recordConsent } = await import("./consent");
    await expect(recordConsent(validParams)).rejects.toThrow(
      /insert failed — duplicate key/,
    );
    expect(state.captures).toHaveLength(1);
    expect(state.auditCalls).toEqual([]);
  });

  it("throws when the insert returns no data + no error (defensive branch)", async () => {
    state.insertResult = { data: null, error: null };
    const { recordConsent } = await import("./consent");
    await expect(recordConsent(validParams)).rejects.toThrow(
      /insert failed — no row returned/,
    );
    expect(state.auditCalls).toEqual([]);
  });
});

describe("recordConsent — row shape", () => {
  it("writes the canonical snake_case column set to consent_events", async () => {
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-42",
      kind: "wholesale_certification",
      disclaimer_version: "v1.0-2026-07-16",
      disclaimer_hash: "hash-w",
      ip: "10.0.0.1",
      ua: "curl/8.0",
      jurisdiction: "AU",
      granted: true,
      detail: { certifier: "Jane Accountant, CA" },
    });
    expect(state.captures).toHaveLength(1);
    const cap = state.captures[0];
    expect(cap.from).toBe("consent_events");
    expect(cap.selectCols).toBe("id");
    expect(cap.terminal).toBe("single");
    expect(cap.payload).toEqual({
      user_id: "u-42",
      consent_kind: "wholesale_certification",
      disclaimer_version: "v1.0-2026-07-16",
      disclaimer_hash: "hash-w",
      ip_address: "10.0.0.1",
      user_agent: "curl/8.0",
      jurisdiction: "AU",
      granted: true,
      detail: { certifier: "Jane Accountant, CA" },
    });
  });

  it("coerces empty ip / ua to null (never persists '' — matches DB NULL semantics)", async () => {
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-2",
      kind: "privacy",
      disclaimer_version: "v2.0-2026-07-16",
      disclaimer_hash: "hash-p",
      ip: "",
      ua: "",
      jurisdiction: "AU",
      granted: true,
    });
    const cap = state.captures[0];
    expect(cap.payload.ip_address).toBeNull();
    expect(cap.payload.user_agent).toBeNull();
  });

  it("falls back to {} when detail is omitted (never writes undefined as jsonb)", async () => {
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-3",
      kind: "marketing",
      disclaimer_version: "v1.0-2026-07-16",
      disclaimer_hash: "hash-m",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "AU",
      granted: false,
    });
    const cap = state.captures[0];
    expect(cap.payload.detail).toEqual({});
  });

  it("propagates granted=false into the row without coercion", async () => {
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-4",
      kind: "marketing",
      disclaimer_version: "v1.0-2026-07-16",
      disclaimer_hash: "hash-m",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "AU",
      granted: false,
    });
    expect(state.captures[0].payload.granted).toBe(false);
  });

  it("preserves an arbitrary jurisdiction string verbatim (no allow-list on this layer)", async () => {
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-5",
      kind: "tos",
      disclaimer_version: "v2.0-2026-07-16",
      disclaimer_hash: "hash",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "NZ",
      granted: true,
    });
    expect(state.captures[0].payload.jurisdiction).toBe("NZ");
  });

  it("returns the id from the insert row envelope", async () => {
    state.insertResult = { data: { id: "custom-id-xyz" }, error: null };
    const { recordConsent } = await import("./consent");
    const res = await recordConsent({
      user_id: "u-6",
      kind: "tos",
      disclaimer_version: "v2.0-2026-07-16",
      disclaimer_hash: "hash",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "AU",
      granted: true,
    });
    expect(res).toEqual({ id: "custom-id-xyz" });
  });
});

describe("recordConsent — audit mirror", () => {
  it("appends a matching audit row with the pinned payload shape", async () => {
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-99",
      kind: "equity_offer_disclaimer",
      disclaimer_version: "v1.0-2026-07-16",
      disclaimer_hash: "eo-hash",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "AU",
      granted: true,
    });
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]).toEqual({
      user_id: "u-99",
      actor: "user",
      action: "consent.recorded",
      resource_type: "consent_events",
      resource_id: "consent-uuid-1",
      detail: {
        kind: "equity_offer_disclaimer",
        version: "v1.0-2026-07-16",
        hash: "eo-hash",
        granted: true,
        jurisdiction: "AU",
      },
    });
  });

  it("still resolves {id} when the audit append rejects (best-effort mirror)", async () => {
    state.auditFail = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordConsent } = await import("./consent");
    const res = await recordConsent({
      user_id: "u-10",
      kind: "tos",
      disclaimer_version: "v2.0-2026-07-16",
      disclaimer_hash: "h",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "AU",
      granted: true,
    });
    expect(res.id).toBe("consent-uuid-1");
    expect(errSpy).toHaveBeenCalledTimes(1);
    const firstArg = errSpy.mock.calls[0][0];
    expect(String(firstArg)).toMatch(/audit append failed/);
  });

  it("uses the returned consent id as the audit resource_id (not the input user_id)", async () => {
    state.insertResult = { data: { id: "row-abc" }, error: null };
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-11",
      kind: "tos",
      disclaimer_version: "v2.0-2026-07-16",
      disclaimer_hash: "h",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "AU",
      granted: true,
    });
    expect(state.auditCalls[0].resource_id).toBe("row-abc");
    expect(state.auditCalls[0].user_id).toBe("u-11");
  });

  it("does NOT invoke audit when the insert throws (insert-error path short-circuits)", async () => {
    state.insertResult = { data: null, error: { message: "boom" } };
    const { recordConsent } = await import("./consent");
    await expect(
      recordConsent({
        user_id: "u-12",
        kind: "tos",
        disclaimer_version: "v2.0-2026-07-16",
        disclaimer_hash: "h",
        ip: "1.1.1.1",
        ua: "UA",
        jurisdiction: "AU",
        granted: true,
      }),
    ).rejects.toThrow();
    expect(state.auditCalls).toEqual([]);
  });

  it("mirrors granted=false into the audit detail (matches the row column)", async () => {
    const { recordConsent } = await import("./consent");
    await recordConsent({
      user_id: "u-13",
      kind: "marketing",
      disclaimer_version: "v1.0-2026-07-16",
      disclaimer_hash: "h",
      ip: "1.1.1.1",
      ua: "UA",
      jurisdiction: "AU",
      granted: false,
    });
    expect(state.auditCalls[0].detail).toMatchObject({ granted: false });
  });
});
