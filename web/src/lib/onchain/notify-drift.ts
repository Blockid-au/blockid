// S27-B — founder notification for on-chain register drift.
//
// Written by the weekly chain-reconcile cron when a project's reconciliation
// lands on status `drift`. Throttled to ONE per project per 7 days through
// the notification hub's dedupe key (`chain_drift:<project>`), so a drift
// that persists across weeks nags once a week, not once a run. Never
// written for `unreachable` — an RPC outage is an ops fact, not a founder
// action.

import "server-only";
import { insertNotification } from "@/lib/notifications";
import type { ReconcileResult } from "./read-back";

export const CHAIN_DRIFT_THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

export async function notifyChainDrift(args: {
  ownerUserId: string;
  projectId: string;
  symbol: string | null;
  result: ReconcileResult;
}): Promise<boolean> {
  if (args.result.status !== "drift") return false;
  const { totals } = args.result;
  return insertNotification({
    userId: args.ownerUserId,
    projectId: args.projectId,
    kind: "chain_drift",
    payload: {
      drift_count: totals.driftCount,
      delta: totals.delta,
      unknown: args.result.unknownOnChain.length,
      missing: args.result.missingOnChain.length,
      symbol: args.symbol,
    },
    dedupeKey: `chain_drift:${args.projectId}`,
    throttleMs: CHAIN_DRIFT_THROTTLE_MS,
  });
}
