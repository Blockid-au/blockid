import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  deriveKey,
  gcmSeal,
  gcmOpen,
  resealToken as resealMjs,
  planTable,
  applyPatches,
  run,
  formatSummary,
  TOKEN_COLUMNS,
} from "./reseal-oauth-tokens.mjs";
import {
  sealToken as sealTs,
  openToken as openTs,
  resealToken as resealTs,
} from "../src/lib/oauth-token-seal";
import { TOKEN_COLUMNS as HEALTH_COLUMNS } from "../src/lib/security/oauth-token-health";

// S23-A — the migration script:
//   * its crypto is a byte-for-byte mirror of src/lib/oauth-token-seal.ts
//     (cross-checked both ways below so the two cannot drift)
//   * dry-run (default) computes the same patches as --write but never
//     calls .update(); --write applies them and is idempotent on a 2nd run
//   * covers BOTH token tables (v2 + legacy) and every token column, the
//     same list the /api/status health signal uses
//   * counts per provider; never emits token bytes in the summary
//   * an unreadable gcm row is counted, never nulled

const HEX = "a".repeat(64);
const HEX2 = "b".repeat(64);
const keys = (cur, prev) => ({ current: deriveKey(cur), previous: deriveKey(prev) });
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// ─── in-memory Supabase stub ───────────────────────────────────────────────

function makeDb(tables) {
  const store = new Map(Object.entries(tables).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  const updates = [];
  const db = {
    updates,
    rows: (t) => store.get(t),
    from(table) {
      const rows = store.get(table);
      return {
        select() {
          let ordered = rows ? [...rows] : null;
          const chain = {
            order(col, { ascending }) {
              if (ordered) ordered.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1));
              return chain;
            },
            range(from, to) {
              if (!ordered) return Promise.resolve({ data: null, error: { message: `relation "${table}" does not exist` } });
              return Promise.resolve({ data: ordered.slice(from, to + 1), error: null });
            },
          };
          return chain;
        },
        update(patch) {
          return {
            eq(col, val) {
              const row = rows?.find((r) => r[col] === val);
              if (!row) return Promise.resolve({ error: { message: "no row" } });
              Object.assign(row, patch);
              updates.push({ table, id: val, cols: Object.keys(patch) });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return db;
}

function fixture(cur = HEX) {
  return {
    oauth_connections_v2: [
      { id: "v2-1", provider: "github", access_token_encrypted: `obf:${b64("gh-a")}`, refresh_token_encrypted: null },
      { id: "v2-2", provider: "github", access_token_encrypted: `obf:${b64("gh-b")}`, refresh_token_encrypted: `obf:${b64("gh-b-r")}` },
      { id: "v2-3", provider: "stripe", access_token_encrypted: gcmSeal("st-ok", deriveKey(cur)), refresh_token_encrypted: null },
      { id: "v2-4", provider: "ga4", access_token_encrypted: null, refresh_token_encrypted: null },
    ],
    oauth_connections: [
      { id: "l-1", provider: "github", access_token: "ghp_raw_1", refresh_token: null },
      { id: "l-2", provider: "github", access_token: "ghp_raw_2", refresh_token: null },
      { id: "l-3", provider: "github", access_token: "ghp_raw_3", refresh_token: null },
      { id: "l-4", provider: "linkedin", access_token: "li_raw", refresh_token: null },
      { id: "l-5", provider: "xero", access_token: `obf:${b64("xero-a")}`, refresh_token: `obf:${b64("xero-r")}` },
    ],
  };
}

// ─── cross-check with the TS module ────────────────────────────────────────

describe("crypto mirror of src/lib/oauth-token-seal.ts", () => {
  it("TS-sealed payloads open in the mjs and vice versa (raw hex key + passphrase)", () => {
    for (const k of [HEX, "a-passphrase"]) {
      const env = { NODE_ENV: "test", OAUTH_TOKEN_ENCRYPTION_KEY: k };
      const fromTs = sealTs("cross-1", env);
      expect(gcmOpen(fromTs, deriveKey(k))).toBe("cross-1");
      const fromMjs = gcmSeal("cross-2", deriveKey(k));
      expect(openTs(fromMjs, env)).toBe("cross-2");
    }
  });

  it("deriveKey matches: 64 hex raw, else sha256", () => {
    expect(deriveKey(HEX).equals(Buffer.from(HEX, "hex"))).toBe(true);
    expect(deriveKey("p").equals(createHash("sha256").update("p").digest())).toBe(true);
  });

  it("resealToken verdicts agree with the TS resealToken on every form", () => {
    const envRot = { NODE_ENV: "test", OAUTH_TOKEN_ENCRYPTION_KEY: HEX2, OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS: HEX };
    const k = keys(HEX2, HEX);
    const cases = [null, `obf:${b64("x")}`, "raw-x", gcmSeal("cur", deriveKey(HEX2)), gcmSeal("prev", deriveKey(HEX)), gcmSeal("lost", deriveKey("c".repeat(64)))];
    for (const c of cases) {
      const a = resealMjs(c, k);
      const b = resealTs(c, envRot);
      expect(a.action).toBe(b.action);
      expect(a.from).toBe(b.from);
      if (a.action === "resealed") expect(openTs(a.sealed, envRot)).toBe(openTs(b.sealed, envRot));
    }
  });

  it("TOKEN_COLUMNS is the same table/column list the /api/status health signal counts", () => {
    expect(TOKEN_COLUMNS.map(({ table, columns }) => ({ table, columns }))).toEqual(HEALTH_COLUMNS.map(({ table, columns }) => ({ table, columns: [...columns] })));
  });
});

// ─── planTable / run ───────────────────────────────────────────────────────

describe("dry-run", () => {
  it("counts per provider on both tables and writes nothing", async () => {
    const db = makeDb(fixture());
    const summary = await run(db, keys(HEX), { write: false });
    expect(summary.mode).toBe("dry-run");
    expect(db.updates).toHaveLength(0);
    const v2 = summary.tables.oauth_connections_v2.counts;
    expect(v2["oauth_connections_v2/*"]).toMatchObject({ rows: 4, resealed: 3, unchanged: 1, unreadable: 0, from: { obf: 3, raw: 0, gcm_previous: 0 } });
    expect(v2["oauth_connections_v2/github"]).toMatchObject({ rows: 2, resealed: 3 }); // 2 access + 1 refresh
    expect(v2["oauth_connections_v2/stripe"]).toMatchObject({ rows: 1, resealed: 0, unchanged: 1 });
    expect(v2["oauth_connections_v2/ga4"]).toMatchObject({ rows: 1, resealed: 0 });
    const legacy = summary.tables.oauth_connections.counts;
    expect(legacy["oauth_connections/*"]).toMatchObject({ rows: 5, resealed: 6, from: { obf: 2, raw: 4 } });
    expect(legacy["oauth_connections/github"]).toMatchObject({ rows: 3, resealed: 3 });
    expect(legacy["oauth_connections/linkedin"]).toMatchObject({ rows: 1, resealed: 1 });
    expect(legacy["oauth_connections/xero"]).toMatchObject({ rows: 1, resealed: 2 });
    expect(summary.patches).toBe(2 + 5); // v2-1, v2-2 + l-1..l-5
  });

  it("patch count = rows with at least one column to change", async () => {
    const db = makeDb(fixture());
    const { patches } = await planTable(db, TOKEN_COLUMNS[1], keys(HEX));
    expect(patches.map((p) => p.id).sort()).toEqual(["l-1", "l-2", "l-3", "l-4", "l-5"]);
    expect(patches.find((p) => p.id === "l-5").patch).toHaveProperty("access_token");
    expect(patches.find((p) => p.id === "l-5").patch).toHaveProperty("refresh_token");
    expect(patches.find((p) => p.id === "l-1").patch).not.toHaveProperty("refresh_token");
  });

  it("the printed summary never contains token bytes", async () => {
    const db = makeDb(fixture());
    const summary = await run(db, keys(HEX), { write: false });
    const text = formatSummary(summary) + JSON.stringify(summary);
    for (const secret of ["ghp_raw_1", "li_raw", "gh-a", "xero-r", b64("gh-a")]) expect(text).not.toContain(secret);
    expect(text).toContain("oauth_connections [linkedin] rows=1 resealed=1 (raw=1)");
    expect(text).toContain("dry-run");
  });

  it("throws without a current key", async () => {
    await expect(run(makeDb(fixture()), keys(undefined, HEX), {})).rejects.toThrow(/OAUTH_TOKEN_ENCRYPTION_KEY/);
  });

  it("a missing legacy table is reported, not fatal", async () => {
    const f = fixture();
    delete f.oauth_connections;
    const summary = await run(makeDb(f), keys(HEX), { write: true });
    expect(summary.tables.oauth_connections.error).toMatch(/does not exist/);
    expect(summary.written).toBe(2);
  });
});

describe("--write", () => {
  it("re-seals every obf:/raw column under the current key; a 2nd run is a no-op", async () => {
    const db = makeDb(fixture());
    const untouchedBefore = db.rows("oauth_connections_v2").find((r) => r.id === "v2-3").access_token_encrypted;
    const first = await run(db, keys(HEX), { write: true });
    expect(first.written).toBe(2 + 5);
    expect(db.updates.map((u) => u.id).sort()).toEqual(["l-1", "l-2", "l-3", "l-4", "l-5", "v2-1", "v2-2"]);
    const env = { NODE_ENV: "test", OAUTH_TOKEN_ENCRYPTION_KEY: HEX };
    for (const r of db.rows("oauth_connections_v2")) {
      if (r.access_token_encrypted) expect(r.access_token_encrypted.startsWith("gcm:")).toBe(true);
      if (r.refresh_token_encrypted) expect(r.refresh_token_encrypted.startsWith("gcm:")).toBe(true);
    }
    for (const r of db.rows("oauth_connections")) expect(r.access_token.startsWith("gcm:")).toBe(true);
    // plaintext preserved through the reseal — the TS reader opens it
    expect(openTs(db.rows("oauth_connections").find((r) => r.id === "l-4").access_token, env)).toBe("li_raw");
    expect(openTs(db.rows("oauth_connections_v2").find((r) => r.id === "v2-2").refresh_token_encrypted, env)).toBe("gh-b-r");
    expect(openTs(db.rows("oauth_connections").find((r) => r.id === "l-5").refresh_token, env)).toBe("xero-r");
    // untouched: the already-current gcm row keeps its exact ciphertext
    expect(db.rows("oauth_connections_v2").find((r) => r.id === "v2-3").access_token_encrypted).toBe(untouchedBefore);

    const second = await run(db, keys(HEX), { write: true });
    expect(second.written).toBe(0);
    expect(second.patches).toBe(0);
    expect(second.tables.oauth_connections_v2.counts["oauth_connections_v2/*"].unchanged).toBe(4);
    expect(second.tables.oauth_connections.counts["oauth_connections/*"].unchanged).toBe(6);
  });

  it("key rotation: previous → current, then the previous key can be dropped", async () => {
    const db = makeDb({
      oauth_connections_v2: [
        { id: "v2-1", provider: "github", access_token_encrypted: gcmSeal("old-sealed", deriveKey(HEX)), refresh_token_encrypted: null },
      ],
      oauth_connections: [],
    });
    const summary = await run(db, keys(HEX2, HEX), { write: true });
    expect(summary.written).toBe(1);
    expect(summary.tables.oauth_connections_v2.counts["oauth_connections_v2/github"].from.gcm_previous).toBe(1);
    const stored = db.rows("oauth_connections_v2")[0].access_token_encrypted;
    expect(openTs(stored, { NODE_ENV: "test", OAUTH_TOKEN_ENCRYPTION_KEY: HEX2 })).toBe("old-sealed");
    expect(openTs(stored, { NODE_ENV: "test", OAUTH_TOKEN_ENCRYPTION_KEY: HEX })).toBeNull();
  });

  it("an unreadable gcm row is counted and left untouched (never nulled)", async () => {
    const lost = gcmSeal("lost", deriveKey("c".repeat(64)));
    const db = makeDb({
      oauth_connections_v2: [{ id: "v2-1", provider: "stripe", access_token_encrypted: lost, refresh_token_encrypted: null }],
      oauth_connections: [],
    });
    const summary = await run(db, keys(HEX), { write: true });
    expect(summary.written).toBe(0);
    expect(summary.unreadable).toBe(1);
    expect(db.rows("oauth_connections_v2")[0].access_token_encrypted).toBe(lost);
  });

  it("applyPatches surfaces a DB error", async () => {
    const db = makeDb({ oauth_connections_v2: [], oauth_connections: [] });
    await expect(applyPatches(db, [{ table: "oauth_connections_v2", id: "nope", patch: { access_token_encrypted: "gcm:x" } }])).rejects.toThrow(/nope/);
  });
});
