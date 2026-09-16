// cap-table-input (S-R5): register summary + SHA flag → computeSVI capTableInput; null-safe.

import { describe, expect, it, vi } from "vitest";
import type { GatherDb } from "@/lib/report-pipeline/gather";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { loadCapTableInput } from "./cap-table-input";

type Row = Record<string, unknown>;

/** Minimal GatherDb over three tables with the query shapes the loaders use. */
function db(tables: Record<string, Row[]>): GatherDb {
  const mk = (table: string) => {
    let rows = tables[table] ?? [];
    const q = {
      eq: (col: string, v: unknown) => {
        rows = rows.filter((r) => r[col] === v);
        return q;
      },
      is: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (onfulfilled: (v: { data: Row[] | null; error: null }) => unknown, onrejected?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected),
    };
    return q;
  };
  return { from: (table: string) => ({ select: () => mk(table) as never, upsert: async () => ({ error: null }) }) } as unknown as GatherDb;
}

const OWNER = "owner-1";
const PROJECT = "proj-1";

describe("loadCapTableInput", () => {
  it("maps the register (founder / ESOP / investor %, vesting) + the SHA document into CapTableInput", async () => {
    const d = db({
      shareholders: [
        { account_id: OWNER, project_id: PROJECT, role: "founder", shares_held: 600_000, vesting_months: 48 },
        { account_id: OWNER, project_id: PROJECT, role: "co-founder", shares_held: 200_000, vesting_months: 48 },
        { account_id: OWNER, project_id: PROJECT, role: "investor", shares_held: 100_000, vesting_months: 0 },
      ],
      esop_pool: [{ account_id: OWNER, project_id: PROJECT, total_pool_shares: 100_000, pool_pct: 10 }],
      onchain_documents: [{ user_id: OWNER, document_type: "shareholders_agreement", status: "confirmed" }],
    });
    const input = await loadCapTableInput(d, OWNER, PROJECT);
    expect(input).toEqual({ founderPct: 80, esopPct: 10, investorPct: 10, vestingFlag: true, shaFlag: true, holders: 3 });
    // and it moves CGH when handed to computeSVI
    const signals = extractSignals({ rawText: "Acme — a SaaS idea." });
    const before = computeSVI(signals).subs.find((s) => s.key === "cgh")!.value;
    const after = computeSVI(signals, undefined, undefined, undefined, undefined, undefined, undefined, input).subs.find((s) => s.key === "cgh")!.value;
    expect(after).toBeGreaterThan(before);
  });

  it("no register → null; a failed SHA doc does not count; missing db / ids → null; a throwing loader → null", async () => {
    expect(await loadCapTableInput(db({}), OWNER, PROJECT)).toBeNull();
    const noSha = await loadCapTableInput(db({ shareholders: [{ account_id: OWNER, project_id: PROJECT, role: "founder", shares_held: 100, vesting_months: 0 }], onchain_documents: [{ user_id: OWNER, document_type: "shareholders_agreement", status: "failed" }] }), OWNER, PROJECT);
    expect(noSha).toMatchObject({ founderPct: 100, esopPct: 0, vestingFlag: false, shaFlag: false, holders: 1 });
    expect(await loadCapTableInput(null, OWNER, PROJECT)).toBeNull();
    expect(await loadCapTableInput(db({}), null, PROJECT)).toBeNull();
    const boom = vi.fn(async () => {
      throw new Error("relation does not exist");
    });
    expect(await loadCapTableInput(db({}), OWNER, PROJECT, { loadSummary: boom })).toBeNull();
  });
});
