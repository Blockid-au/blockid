/**
 * credit-balance-cas.fixture.ts — test-only wrapper around PaygFakeDb for the
 * G36-B balance-race tests.
 *
 *  - `onBalanceRead` fires ONCE, right after the first credit_balances
 *    `.maybeSingle()` read: a concurrent writer landing between a route's
 *    read and its write.
 *  - `credit_balances.upsert` gets real ON CONFLICT (user_id) DO UPDATE
 *    semantics (PaygFakeDb maps upsert to a plain insert), so the pre-G36
 *    read → upsert(absolute) code is judged fairly when the tests are run
 *    against it.
 */
import type { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";

export function casTestClient(db: PaygFakeDb, onBalanceRead?: (db: PaygFakeDb) => void) {
  let fired = false;
  return {
    from(table: string) {
      const t = db.from(table);
      return {
        ...t,
        select: (cols = "*", o?: { count?: string; head?: boolean }) => {
          const q = t.select(cols, o);
          const orig = q.maybeSingle.bind(q);
          q.maybeSingle = async () => {
            const r = await orig();
            if (table === "credit_balances" && onBalanceRead && !fired) {
              fired = true;
              onBalanceRead(db);
            }
            return r;
          };
          return q;
        },
        upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => {
          if (table !== "credit_balances") return t.upsert(row);
          const key = opts?.onConflict ?? "user_id";
          const hit = db.rows(table).find((r) => r[key] === row[key]);
          if (hit) Object.assign(hit, row);
          else db.rows(table).push({ ...row });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}
