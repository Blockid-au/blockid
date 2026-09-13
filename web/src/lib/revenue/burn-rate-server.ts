// S29-hardening (S28 review #7) — the ONE burn-rate resolver.
//
// `/api/revenue`, `/api/pnl`, `/api/valuation` and `/api/valuation/vc` all
// need "average monthly operating spend" for runway / opex. Before this
// module each route picked its own precedence (`/api/revenue` metrics-first,
// `resolveRevenueFigures` bank-first) and a founder with both saw two burn
// figures on one page. The precedence itself is pure and lives next to the
// P&L resolver (`pickBurnRate` in ./sources.ts, client-safe); this file is
// the I/O wrapper that loads the inputs a route has not already fetched:
//
//   connector Xero opex → bank CSV → startup_metrics manual → none
//
// Pass `xeroSnapshot` / `bankCsv` when the route already has them (the
// revenue dashboard does) so nothing is read twice; `undefined` means
// "load it", `null` means "known absent".

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSnapshotHistory, type ConnectorSnapshotRow } from "@/lib/connectors/snapshots";
import { bankCsvFigures, type BankCsvFigures } from "@/lib/expenses/server";
import { pickBurnRate, type ResolvedBurnRate } from "./sources";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface ResolveBurnRateArgs {
  /** Active project (null → no bank CSV, unscoped snapshots). */
  projectId: string | null | undefined;
  /** Project OWNER (connector snapshots are keyed on the owner, S18-A rule C). */
  ownerUserId: string;
  /** `startup_metrics.burn_rate_aud` the route already read (null / absent → none). */
  metricBurn?: number | null;
  /** Latest Xero snapshot when already loaded; `undefined` → load here. */
  xeroSnapshot?: Pick<ConnectorSnapshotRow, "taken_at" | "metrics"> | null;
  /** Bank CSV figures when already loaded; `undefined` → load here. */
  bankCsv?: BankCsvFigures | null;
}

export async function resolveBurnRate(db: Db, args: ResolveBurnRateArgs): Promise<ResolvedBurnRate> {
  let xeroSnapshot = args.xeroSnapshot;
  if (xeroSnapshot === undefined) {
    const history = await loadSnapshotHistory(db, { userId: args.ownerUserId, projectId: args.projectId ?? null });
    xeroSnapshot = history.xero?.latest ?? null;
  }
  const bankCsv = args.bankCsv === undefined ? await bankCsvFigures(db, args.projectId) : args.bankCsv;
  return pickBurnRate({ xeroSnapshot, bankCsv, metricBurn: args.metricBurn ?? null });
}
