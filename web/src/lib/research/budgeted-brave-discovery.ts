import "server-only";
import { createHash } from "node:crypto";
import { reserveBraveBudget } from "../reanalysis/brave-budget-store";
import type { BraveResearchBudget } from "../reanalysis/research-cost-policy";
import { createBraveDiscoveryProvider, discoverPublicSources, type ApprovedPublicQuery, type DiscoveryProvider } from "./discover-public-sources";

/** Worker-only composition. All scope, queries and policy come from the durable
 * authorized job, never from arbitrary request JSON. Results remain ephemeral.
 * A reservation is conservative spend accounting, not customer consent.
 */
export async function discoverWithBraveBudget(input: {
  jobId: string; questionId: string; batchId: string; month: string;
  approvedPublicQueries: ApprovedPublicQuery[];
}, deps: {
  directory: string; apiKey?: string; readPolicy: () => Promise<BraveResearchBudget>;
  /** Recheck lease, account, report revision, grant and unexpired consent. */
  assertAuthorized: () => Promise<void>;
  fetch?: typeof fetch; signal?: AbortSignal; now?: () => number;
}) {
  const decisions: Array<{ dispatchAllowed: boolean; reason: string; costMicroUsd: number }> = [];
  const now = deps.now ?? Date.now;
  const raw = createBraveDiscoveryProvider({ apiKey: deps.apiKey, fetch: deps.fetch });
  const valid = [input.jobId, input.questionId, input.batchId].every(v => typeof v === "string" && v.length >= 1 && v.length <= 200)
    && /^\d{4}-\d{2}$/.test(input.month);
  let provider: DiscoveryProvider | undefined;
  if (raw && valid) provider = { id: raw.id, async search(query, options) {
    if (options.signal.aborted) throw Error("discovery_cancelled");
    await deps.assertAuthorized();
    if (options.signal.aborted) throw Error("discovery_cancelled");
    // Full text is hashed; neither query text nor API results enter the ledger.
    // The persisted job month prevents a replay spending again next month.
    const reservationId = createHash("sha256").update(JSON.stringify([
      "brave-dispatch-v1", input.jobId, input.questionId, input.batchId, input.month, query,
    ])).digest("hex");
    const reservation = await reserveBraveBudget(deps.directory, {
      reservationId, month: input.month, questionId: input.questionId,
      batchId: input.batchId, queries: 1,
    }, deps.readPolicy, now);
    decisions.push({ dispatchAllowed: reservation.dispatchAllowed,
      reason: reservation.ok ? reservation.dispatchAllowed ? "reserved" : "replay_requires_reconciliation" : reservation.reason,
      costMicroUsd: reservation.ok ? reservation.costMicroUsd : 0 });
    if (!reservation.dispatchAllowed) throw Error("discovery_budget_denied");
    // Authority may change while waiting for the cross-process budget lock.
    // Failed checks/ambiguous transport do not refund or redispatch the key.
    await deps.assertAuthorized();
    if (options.signal.aborted) throw Error("discovery_cancelled");
    return raw.search(query, options);
  } };
  const discovery = await discoverPublicSources({ approvedPublicQueries: input.approvedPublicQueries,
    providerRequestsApproved: valid }, { provider, signal: deps.signal, now });
  return { discovery, budgetDecisions: decisions, customerCreditsCharged: false as const };
}
