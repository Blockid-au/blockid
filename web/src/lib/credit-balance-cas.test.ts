// G36-B — compare-and-set credit balance writes. The bug it pins: grant /
// reversal paths wrote an ABSOLUTE balance computed from a stale read, so a
// concurrent debit landing between the read and the write was erased.
import { describe, expect, it } from "vitest";
import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";
import { adjustCreditBalance, roundCredits, writeOutcomeUnknown, type CasDb } from "./credit-balance-cas";

function seed(balance: number | null, extra: Record<string, unknown> = {}) {
  return new PaygFakeDb(
    { credit_balances: balance === null ? [] : [{ user_id: "u1", balance, lifetime_earned: 10, lifetime_spent: 5, ...extra }] },
    { unique: { credit_balances: [["user_id"]] } },
  );
}

/** Runs `between` once, right after the helper's first balance read — a concurrent writer. */
function withInterleave(db: PaygFakeDb, between: () => void): CasDb {
  let fired = false;
  return {
    from(table: string) {
      const t = db.from(table);
      return {
        ...t,
        select: (cols: string) => {
          const q = t.select(cols);
          const orig = q.maybeSingle.bind(q);
          q.maybeSingle = async () => {
            const r = await orig();
            if (!fired && table === "credit_balances") {
              fired = true;
              between();
            }
            return r;
          };
          return q;
        },
      } as unknown as ReturnType<CasDb["from"]>;
    },
  };
}

describe("adjustCreditBalance", () => {
  it("adds a grant and moves lifetime_earned", async () => {
    const db = seed(100);
    const r = await adjustCreditBalance(db as unknown as CasDb, "u1", 25, { lifetime: { column: "lifetime_earned", delta: 25 } });
    expect(r).toEqual({ ok: true, before: 100, balance: 125 });
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 125, lifetime_earned: 35 });
  });

  it("a debit that lands between the read and the write is NOT erased (old absolute-upsert bug)", async () => {
    const db = seed(100);
    const racing = withInterleave(db, () => {
      // spend_credits_atomic debits 49 while the grant is between read and write.
      db.rows("credit_balances")[0].balance = 51;
    });
    const r = await adjustCreditBalance(racing, "u1", 20, { lifetime: { column: "lifetime_earned", delta: 20 } });
    expect(r).toMatchObject({ ok: true, before: 51, balance: 71 });
    // The old code wrote 100 + 20 = 120 — the 49-credit debit vanished.
    expect(db.rows("credit_balances")[0].balance).toBe(71);
  });

  it("refuses a debit below zero when requireNonNegative, without writing", async () => {
    const db = seed(10);
    const r = await adjustCreditBalance(db as unknown as CasDb, "u1", -19, { requireNonNegative: true });
    expect(r).toEqual({ ok: false, reason: "insufficient", balance: 10 });
    expect(db.rows("credit_balances")[0].balance).toBe(10);
  });

  it("re-checks the floor on the fresh value after contention", async () => {
    const db = seed(50);
    const racing = withInterleave(db, () => {
      db.rows("credit_balances")[0].balance = 30; // a concurrent spend
    });
    const r = await adjustCreditBalance(racing, "u1", -49, { requireNonNegative: true });
    expect(r).toEqual({ ok: false, reason: "insufficient", balance: 30 });
    expect(db.rows("credit_balances")[0].balance).toBe(30);
  });

  it("creates the row for a first grant; refuses a first debit under requireNonNegative", async () => {
    const db = seed(null);
    expect(await adjustCreditBalance(db as unknown as CasDb, "u1", 3, { lifetime: { column: "lifetime_earned", delta: 3 } })).toEqual({ ok: true, before: 0, balance: 3 });
    expect(db.rows("credit_balances")[0]).toMatchObject({ user_id: "u1", balance: 3, lifetime_earned: 3 });
    const empty = seed(null);
    expect(await adjustCreditBalance(empty as unknown as CasDb, "u1", -1, { requireNonNegative: true })).toMatchObject({ ok: false, reason: "insufficient" });
    expect(empty.rows("credit_balances")).toHaveLength(0);
  });

  it("clampAtZero takes what is left instead of refusing, re-checked on the fresh value", async () => {
    const db = seed(50);
    const racing = withInterleave(db, () => {
      db.rows("credit_balances")[0].balance = 20; // a concurrent spend
    });
    expect(await adjustCreditBalance(racing, "u1", -30, { clampAtZero: true })).toEqual({ ok: true, before: 20, balance: 0 });
    expect(db.rows("credit_balances")[0].balance).toBe(0);
    const empty = seed(null);
    expect(await adjustCreditBalance(empty as unknown as CasDb, "u1", -5, { clampAtZero: true })).toEqual({ ok: true, before: 0, balance: 0 });
    expect(empty.rows("credit_balances")).toHaveLength(0);
  });

  it("floors the lifetime counter at zero on a reversal", async () => {
    const db = seed(0, { lifetime_spent: 10 });
    await adjustCreditBalance(db as unknown as CasDb, "u1", 49, { lifetime: { column: "lifetime_spent", delta: -49 } });
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 49, lifetime_spent: 0 });
  });

  it("gives up with 'contention' after maxAttempts and a db_error surfaces", async () => {
    const db = seed(100);
    const always: CasDb = {
      from(table: string) {
        const t = db.from(table);
        return {
          ...t,
          select: (cols: string) => {
            const q = t.select(cols);
            const orig = q.maybeSingle.bind(q);
            q.maybeSingle = async () => {
              const r = await orig();
              db.rows("credit_balances")[0].balance = Number(db.rows("credit_balances")[0].balance) - 1;
              return r;
            };
            return q;
          },
        } as unknown as ReturnType<CasDb["from"]>;
      },
    };
    expect(await adjustCreditBalance(always, "u1", 5, { maxAttempts: 3 })).toMatchObject({ ok: false, reason: "contention" });
    const failing = new PaygFakeDb({ credit_balances: [] }, { failing: ["credit_balances"] });
    expect(await adjustCreditBalance(failing as unknown as CasDb, "u1", 5)).toMatchObject({ ok: false, reason: "db_error" });
  });

  it("rounds to numeric(10,2)", () => {
    expect(roundCredits(0.1 + 0.2)).toBe(0.3);
    expect(roundCredits(10.005 - 0.001)).toBe(10);
  });
});

describe("G36 round 3 — maybeWritten only for network / unknown write errors", () => {
  it.each([
    ["23514 check violation", "23514", false],
    ["23503 FK violation", "23503", false],
    ["42501 permission denied", "42501", false],
    ["42P01 undefined table", "42P01", false],
    ["22P02 invalid input", "22P02", false],
    ["40001 serialization failure", "40001", false],
    ["PGRST204 unknown column", "PGRST204", false],
    ["no code (fetch failed)", "", true],
    ["undefined code", undefined, true],
    ["XX000 internal", "XX000", true],
    ["08006 connection failure", "08006", true],
  ])("%s → writeOutcomeUnknown = %s", (_label, code, expected) => {
    expect(writeOutcomeUnknown({ code })).toBe(expected);
  });

  function failingWrite(db: PaygFakeDb, error: { code?: string; message: string }): CasDb {
    return {
      from(table: string) {
        const t = db.from(table);
        return {
          ...t,
          update: () => {
            const w = { eq: () => w, select: () => Promise.resolve({ data: null, error }) };
            return w;
          },
        } as unknown as ReturnType<CasDb["from"]>;
      },
    };
  }

  it("a definite Postgres rejection on the update is maybeWritten=false; a network error is true", async () => {
    const db = seed(10);
    const definite = await adjustCreditBalance(failingWrite(db, { code: "23514", message: "check" }), "u1", 5);
    expect(definite).toMatchObject({ ok: false, reason: "db_error", maybeWritten: false });
    const network = await adjustCreditBalance(failingWrite(db, { code: "", message: "fetch failed" }), "u1", 5);
    expect(network).toMatchObject({ ok: false, reason: "db_error", maybeWritten: true });
  });
});
