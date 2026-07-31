import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

// Colocated vitest for the server-only hash-chained audit log lib
// (`web/src/lib/audit.ts`) — the compliance-material transition sink
// consumed by every "legally material" write path (consent recorded,
// equity request lifecycle, wholesale verification, plan change,
// chain sync). The DB trigger `audit_events_hash_chain` computes
// curr_hash server-side; this lib layers an HMAC signature the DB
// side cannot forge without the app-only AUDIT_HMAC_SECRET.
//
// Pins the observable contract used by every caller:
//   - signAuditHash: deterministic HMAC-SHA256(hex-decoded curr_hash),
//     explicit-secret override, env fallback, env-missing/too-short
//     rejection, key/message sensitivity
//   - buildAuditPayload: canonical pipe-joined order
//     `prev_hash|epoch(ts)|user_id|actor|action|resource_type|resource_id|detail::text`
//     with null→"" for every string field, detail null|undefined→"{}",
//     JSON.stringify for objects, ts string+Date accepted and floored
//     to whole epoch seconds
//   - appendAudit: no-admin → throw, missing/short secret → throw
//     BEFORE any insert, insert-error / no-row → throw, successful
//     insert populates {curr_hash: ""} placeholder + defaults for
//     nullable inputs, subsequent update stamps hmac_signature keyed
//     on the returned id, update-error is non-fatal (returns row,
//     warns), id coerced to BigInt on return
//
// Fake `SupabaseClient` scripts per-call {data,error} shapes off a FIFO
// queue so the two-step insert-then-update flow can be scripted
// independently per test. `state.adminConfigured=false` returns null
// from getSupabaseAdmin to exercise the no-admin guard.

interface CapturedCall {
  table: string;
  op: "insert" | "update" | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  terminal: "single" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown }>;
  calls: CapturedCall[];
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
};

function nextResponse(): { data: unknown; error: unknown } {
  const next = state.queue.shift() ?? {};
  return { data: next.data ?? null, error: next.error ?? null };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    op: null,
    insertPayload: null,
    updatePayload: null,
    selectCols: null,
    eqCalls: [],
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.insert = (payload: Record<string, unknown>) => {
    op.op = "insert";
    op.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    op.op = "update";
    op.updatePayload = payload;
    return chain;
  };
  chain.select = (cols?: string) => {
    op.selectCols = cols ?? null;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqCalls.push({ col, val });
    return chain;
  };
  chain.single = () => {
    op.terminal = "single";
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

// Silence console.warn from the non-fatal update-failed branch.
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

const SECRET_ORIG = process.env.AUDIT_HMAC_SECRET;

beforeEach(() => {
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  warnSpy.mockClear();
  process.env.AUDIT_HMAC_SECRET = "a".repeat(32); // safe default
});

afterEach(() => {
  if (SECRET_ORIG === undefined) delete process.env.AUDIT_HMAC_SECRET;
  else process.env.AUDIT_HMAC_SECRET = SECRET_ORIG;
});

// ---------------------------------------------------------------------------
// signAuditHash
// ---------------------------------------------------------------------------

describe("audit — signAuditHash", () => {
  it("returns deterministic HMAC-SHA256 hex for same (hash, secret)", async () => {
    const { signAuditHash } = await import("./audit");
    const a = signAuditHash("deadbeef", "s".repeat(32));
    const b = signAuditHash("deadbeef", "s".repeat(32));
    expect(a).toBe(b);
  });

  it("returns 64-char lowercase hex (SHA256 output)", async () => {
    const { signAuditHash } = await import("./audit");
    const sig = signAuditHash("aa", "s".repeat(32));
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses explicit secret when provided (env is ignored)", async () => {
    const { signAuditHash } = await import("./audit");
    process.env.AUDIT_HMAC_SECRET = "envenvenvenvenven"; // 17 chars
    const explicit = "explicitexplicit"; // 16 chars
    const sig = signAuditHash("cafe", explicit);
    const expected = createHmac("sha256", explicit)
      .update("cafe", "hex")
      .digest("hex");
    expect(sig).toBe(expected);
  });

  it("falls back to AUDIT_HMAC_SECRET env when no explicit secret", async () => {
    const { signAuditHash } = await import("./audit");
    process.env.AUDIT_HMAC_SECRET = "envenvenvenvenven"; // 17 chars
    const sig = signAuditHash("cafe");
    const expected = createHmac("sha256", "envenvenvenvenven")
      .update("cafe", "hex")
      .digest("hex");
    expect(sig).toBe(expected);
  });

  it("throws when env secret missing and no explicit passed", async () => {
    const { signAuditHash } = await import("./audit");
    delete process.env.AUDIT_HMAC_SECRET;
    expect(() => signAuditHash("cafe")).toThrow(/AUDIT_HMAC_SECRET/);
  });

  it("throws when env secret shorter than 16 chars", async () => {
    const { signAuditHash } = await import("./audit");
    process.env.AUDIT_HMAC_SECRET = "short"; // <16
    expect(() => signAuditHash("cafe")).toThrow(/too short|AUDIT_HMAC_SECRET/);
  });

  it("explicit secret bypasses env short-check (does not throw)", async () => {
    const { signAuditHash } = await import("./audit");
    process.env.AUDIT_HMAC_SECRET = ""; // empty env
    expect(() => signAuditHash("cafe", "x")).not.toThrow();
  });

  it("different curr_hash → different signature (same secret)", async () => {
    const { signAuditHash } = await import("./audit");
    const secret = "s".repeat(32);
    expect(signAuditHash("aa", secret)).not.toBe(signAuditHash("bb", secret));
  });

  it("different secret → different signature (same curr_hash)", async () => {
    const { signAuditHash } = await import("./audit");
    const one = signAuditHash("aa", "1".repeat(32));
    const two = signAuditHash("aa", "2".repeat(32));
    expect(one).not.toBe(two);
  });

  it("interprets curr_hash as hex (not utf8) when hashing", async () => {
    const { signAuditHash } = await import("./audit");
    const secret = "k".repeat(32);
    const asHex = createHmac("sha256", secret).update("cafe", "hex").digest("hex");
    const asUtf8 = createHmac("sha256", secret).update("cafe", "utf8").digest("hex");
    // Sanity: hex and utf8 diverge for non-numeric-only strings
    expect(asHex).not.toBe(asUtf8);
    expect(signAuditHash("cafe", secret)).toBe(asHex);
  });
});

// ---------------------------------------------------------------------------
// buildAuditPayload
// ---------------------------------------------------------------------------

describe("audit — buildAuditPayload", () => {
  const baseRow = {
    prev_hash: "p" as string | null,
    ts: "2026-01-01T00:00:00.000Z" as string | Date,
    user_id: "u" as string | null,
    actor: "user" as string | null,
    action: "x.done" as string | null,
    resource_type: "startup" as string | null,
    resource_id: "r" as string | null,
    detail: { k: 1 } as unknown,
  };

  it("joins the 8 canonical fields with '|' in fixed order", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload(baseRow);
    // 8 fields → 7 separators
    expect(out.split("|")).toHaveLength(8);
  });

  it("emits fields in the exact order: prev_hash|ts|user_id|actor|action|resource_type|resource_id|detail", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload(baseRow);
    const [prev, ts, uid, actor, action, rt, rid, detail] = out.split("|");
    expect(prev).toBe("p");
    expect(ts).toBe(String(Math.floor(new Date(baseRow.ts as string).getTime() / 1000)));
    expect(uid).toBe("u");
    expect(actor).toBe("user");
    expect(action).toBe("x.done");
    expect(rt).toBe("startup");
    expect(rid).toBe("r");
    expect(detail).toBe(JSON.stringify({ k: 1 }));
  });

  it("prev_hash null → empty string", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, prev_hash: null });
    expect(out.split("|")[0]).toBe("");
  });

  it("user_id null → empty string", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, user_id: null });
    expect(out.split("|")[2]).toBe("");
  });

  it("actor null → empty string", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, actor: null });
    expect(out.split("|")[3]).toBe("");
  });

  it("action null → empty string", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, action: null });
    expect(out.split("|")[4]).toBe("");
  });

  it("resource_type null → empty string", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, resource_type: null });
    expect(out.split("|")[5]).toBe("");
  });

  it("resource_id null → empty string", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, resource_id: null });
    expect(out.split("|")[6]).toBe("");
  });

  it("detail null → '{}' literal", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, detail: null });
    expect(out.split("|")[7]).toBe("{}");
  });

  it("detail undefined → '{}' literal (== null check catches both)", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, detail: undefined });
    expect(out.split("|")[7]).toBe("{}");
  });

  it("detail object → JSON.stringify", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, detail: { a: 1, b: "x" } });
    expect(out.split("|")[7]).toBe(JSON.stringify({ a: 1, b: "x" }));
  });

  it("detail array → JSON.stringify (arrays are non-null objects)", async () => {
    const { buildAuditPayload } = await import("./audit");
    const out = buildAuditPayload({ ...baseRow, detail: [1, 2, 3] });
    expect(out.split("|")[7]).toBe("[1,2,3]");
  });

  it("ts as ISO string → floor epoch seconds", async () => {
    const { buildAuditPayload } = await import("./audit");
    // 2026-01-01T00:00:00.750Z → floor to 1767225600 s
    const out = buildAuditPayload({
      ...baseRow,
      ts: "2026-01-01T00:00:00.750Z",
    });
    const epoch = Math.floor(
      new Date("2026-01-01T00:00:00.750Z").getTime() / 1000,
    );
    expect(out.split("|")[1]).toBe(String(epoch));
  });

  it("ts as Date → floor epoch seconds", async () => {
    const { buildAuditPayload } = await import("./audit");
    const d = new Date("2026-06-15T12:34:56.999Z");
    const out = buildAuditPayload({ ...baseRow, ts: d });
    expect(out.split("|")[1]).toBe(String(Math.floor(d.getTime() / 1000)));
  });

  it("fractional milliseconds are dropped by floor (Date input)", async () => {
    const { buildAuditPayload } = await import("./audit");
    // ms=999 → seconds field unchanged
    const d1 = new Date(1_800_000_000_000); // exact second boundary
    const d2 = new Date(1_800_000_000_999); // +999ms same second
    const out1 = buildAuditPayload({ ...baseRow, ts: d1 });
    const out2 = buildAuditPayload({ ...baseRow, ts: d2 });
    expect(out1.split("|")[1]).toBe(out2.split("|")[1]);
  });
});

// ---------------------------------------------------------------------------
// appendAudit
// ---------------------------------------------------------------------------

describe("audit — appendAudit", () => {
  const baseParams = {
    actor: "user",
    action: "consent.recorded",
    resource_type: "startup",
  };

  it("throws when supabase admin is unavailable", async () => {
    state.adminConfigured = false;
    const { appendAudit } = await import("./audit");
    await expect(appendAudit({ ...baseParams })).rejects.toThrow(
      /Supabase admin client unavailable/,
    );
  });

  it("throws when AUDIT_HMAC_SECRET is missing (no insert attempted)", async () => {
    delete process.env.AUDIT_HMAC_SECRET;
    const { appendAudit } = await import("./audit");
    await expect(appendAudit({ ...baseParams })).rejects.toThrow(
      /AUDIT_HMAC_SECRET/,
    );
    expect(state.calls).toHaveLength(0);
  });

  it("throws when AUDIT_HMAC_SECRET is too short (no insert attempted)", async () => {
    process.env.AUDIT_HMAC_SECRET = "short";
    const { appendAudit } = await import("./audit");
    await expect(appendAudit({ ...baseParams })).rejects.toThrow(
      /AUDIT_HMAC_SECRET/,
    );
    expect(state.calls).toHaveLength(0);
  });

  it("inserts into audit_events table with correct selectCols/terminal", async () => {
    state.queue.push({ data: { id: 1, curr_hash: "abcd" } });
    state.queue.push({}); // update ok
    const { appendAudit } = await import("./audit");
    await appendAudit({ ...baseParams });
    const insert = state.calls.find((c) => c.op === "insert");
    expect(insert?.table).toBe("audit_events");
    expect(insert?.selectCols).toBe("id, curr_hash");
    expect(insert?.terminal).toBe("single");
  });

  it("insert payload defaults user_id/resource_id → null and detail → {}", async () => {
    state.queue.push({ data: { id: 2, curr_hash: "beef" } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    await appendAudit({ ...baseParams });
    const insert = state.calls.find((c) => c.op === "insert")!;
    expect(insert.insertPayload).toMatchObject({
      user_id: null,
      resource_id: null,
      detail: {},
    });
  });

  it("insert payload passes actor/action/resource_type through unchanged", async () => {
    state.queue.push({ data: { id: 3, curr_hash: "aaaa" } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    await appendAudit({
      actor: "webhook:stripe",
      action: "plan.changed",
      resource_type: "subscription",
    });
    const insert = state.calls.find((c) => c.op === "insert")!;
    expect(insert.insertPayload).toMatchObject({
      actor: "webhook:stripe",
      action: "plan.changed",
      resource_type: "subscription",
    });
  });

  it("insert payload sets curr_hash placeholder to empty string (trigger overwrites)", async () => {
    state.queue.push({ data: { id: 4, curr_hash: "abcd" } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    await appendAudit({ ...baseParams });
    const insert = state.calls.find((c) => c.op === "insert")!;
    expect(insert.insertPayload?.curr_hash).toBe("");
  });

  it("provided detail is preserved in insert payload", async () => {
    state.queue.push({ data: { id: 5, curr_hash: "5555" } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    await appendAudit({
      ...baseParams,
      detail: { amount: 100, currency: "AUD" },
    });
    const insert = state.calls.find((c) => c.op === "insert")!;
    expect(insert.insertPayload?.detail).toEqual({
      amount: 100,
      currency: "AUD",
    });
  });

  it("provided user_id + resource_id preserved (not coerced)", async () => {
    state.queue.push({ data: { id: 6, curr_hash: "6666" } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    await appendAudit({
      ...baseParams,
      user_id: "u-123",
      resource_id: "r-999",
    });
    const insert = state.calls.find((c) => c.op === "insert")!;
    expect(insert.insertPayload).toMatchObject({
      user_id: "u-123",
      resource_id: "r-999",
    });
  });

  it("insert error → throws with underlying message", async () => {
    state.queue.push({ error: { message: "duplicate key" } });
    const { appendAudit } = await import("./audit");
    await expect(appendAudit({ ...baseParams })).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("insert returns no data → throws (no row returned)", async () => {
    state.queue.push({ data: null });
    const { appendAudit } = await import("./audit");
    await expect(appendAudit({ ...baseParams })).rejects.toThrow(
      /no row returned/,
    );
  });

  it("success path returns { id: bigint, curr_hash }", async () => {
    state.queue.push({ data: { id: 42, curr_hash: "abcd1234" } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    const out = await appendAudit({ ...baseParams });
    expect(out.curr_hash).toBe("abcd1234");
    expect(typeof out.id).toBe("bigint");
    expect(out.id).toBe(42n);
  });

  it("update stamps hmac_signature keyed on returned id", async () => {
    state.queue.push({ data: { id: 77, curr_hash: "cafebabe" } });
    state.queue.push({});
    const { appendAudit, signAuditHash } = await import("./audit");
    await appendAudit({ ...baseParams });
    const update = state.calls.find((c) => c.op === "update")!;
    expect(update.table).toBe("audit_events");
    expect(update.updatePayload).toEqual({
      hmac_signature: signAuditHash("cafebabe"),
    });
    expect(update.eqCalls).toEqual([{ col: "id", val: 77 }]);
  });

  it("update error is non-fatal — still returns and warns", async () => {
    state.queue.push({ data: { id: 8, curr_hash: "8888" } });
    state.queue.push({ error: { message: "update blocked" } });
    const { appendAudit } = await import("./audit");
    const out = await appendAudit({ ...baseParams });
    expect(out.id).toBe(8n);
    expect(out.curr_hash).toBe("8888");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("update error warning includes the id", async () => {
    state.queue.push({ data: { id: 9, curr_hash: "9999" } });
    state.queue.push({ error: { message: "boom" } });
    const { appendAudit } = await import("./audit");
    await appendAudit({ ...baseParams });
    const calledWith = warnSpy.mock.calls[0];
    expect(calledWith).toBeDefined();
    // console.warn("[audit] hmac_signature update failed for id=", id, msg)
    expect(calledWith?.some((a) => a === 9)).toBe(true);
  });

  it("makes exactly one insert + one update call in success path", async () => {
    state.queue.push({ data: { id: 10, curr_hash: "aabb" } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    await appendAudit({ ...baseParams });
    expect(state.calls.filter((c) => c.op === "insert")).toHaveLength(1);
    expect(state.calls.filter((c) => c.op === "update")).toHaveLength(1);
  });

  it("curr_hash returned by DB is coerced to string on read", async () => {
    // Simulate trigger returning a numeric-looking value; String(...) applied
    // before it flows into the HMAC signer (must remain valid hex).
    state.queue.push({ data: { id: 11, curr_hash: 1234 } });
    state.queue.push({});
    const { appendAudit } = await import("./audit");
    const out = await appendAudit({ ...baseParams });
    expect(out.curr_hash).toBe("1234");
    expect(typeof out.curr_hash).toBe("string");
  });
});
