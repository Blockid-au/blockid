/** Runtime policy shared with the actual checkout, webhook and fulfillment code.
 * New receipt creation and the migration-window pause both default OFF.
 */
export const creditReceiptsEnabled = () => process.env.G30_CREDIT_RECEIPTS === "1";
export const creditPurchasesPaused = () => process.env.G30_CREDIT_PURCHASES_PAUSED === "1";

/** This process's source compatibility, not fleet or database readiness.
 * Without the financial migration we cannot attest atomic legacy-account
 * closure. A real purchase pause independently guarantees no new grant.
 */
export function creditReceiptCapabilities() {
  const paused = creditPurchasesPaused();
  return {
    purchase_authority: "web-receipt-v1" as const,
    creation_enabled: creditReceiptsEnabled(), purchases_paused: paused,
    process_uptime_seconds: Math.floor(process.uptime()),
    capabilities: ["marked_purchase_receipt_when_creation_off", "legacy_pack_guard", "pause_before_event_claim",
      "report_final_projection_and_unavailable_valuation_v1", ...(paused ? ["erased_account_no_new_grant"] : [])],
    erased_account_refusal: { verified: paused, mechanism: paused ? "all_purchase_paths_paused" : "not_attested" },
    receipt_protocol_support: "atomic_receipt_rpc_fail_closed_no_legacy_fallback",
    database_activation_verified: false,
    scope: "this_process" as const,
  };
}
