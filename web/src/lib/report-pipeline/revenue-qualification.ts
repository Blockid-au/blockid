/** G30 V01 report-boundary contract. Existing connector writers do NOT emit it.
 * A producer must establish these facts from source; field names are not proof.
 * This deliberately supports native-AUD recurring observations only. Accounting
 * revenue and FX conversions need separate reviewed producers/methods.
 */
export interface RevenueProvenance {
  version: 1;
  producer: string;
  producerVersion: number;
  metric: "mrr";
  currency: "AUD";
  basis: "recurring_contracts";
  amountAud: number;
  asOf: string;
  capturedAt: string;
  complete: true;
  ownerUserId: string;
  projectId: string;
  businessName: string;
  entityId: string;
  sourceEntityId: string;
  sourceId: string;
  sourceProvider: "stripe" | "xero";
  derivation: "native_aud_complete_recurring_contracts";
}
export interface RevenueScope { ownerUserId: string; projectId: string | null; businessName: string; now: number }
export interface RevenueObservation { provider: string; mrrAud: number; capturedAt: string; qualification?: unknown }
export interface RevenueQualification { eligible: boolean; reasons: string[]; provenance: RevenueProvenance | null }

// Deliberately empty: metadata (including user-controlled connector JSON) is
// not attestation. A reviewed authenticated producer must be wired before any
// acceptance is enabled; merely adding an identifier here is insufficient.
const TRUSTED_REVENUE_PRODUCERS: readonly string[] = [];

export function qualifyRevenue(observation: RevenueObservation, scope: RevenueScope): RevenueQualification {
  const reasons: string[] = [];
  const raw = observation.qualification;
  const q = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  if (!TRUSTED_REVENUE_PRODUCERS.includes(`${String(q.producer)}@${String(q.producerVersion)}`)) reasons.push("trusted_producer_unavailable");
  if (q.version !== 1) reasons.push("missing_source_provenance");
  if (q.metric !== "mrr" || q.basis !== "recurring_contracts") reasons.push("recurring_metric_unproven");
  if (q.currency !== "AUD" || q.derivation !== "native_aud_complete_recurring_contracts") reasons.push("currency_or_conversion_unqualified");
  if (q.complete !== true) reasons.push("source_completeness_unproven");
  if (!scope.projectId || q.projectId !== scope.projectId || q.ownerUserId !== scope.ownerUserId || q.businessName !== scope.businessName || !nonempty(q.entityId) || q.sourceEntityId !== q.entityId) reasons.push("business_entity_unqualified");
  if (!nonempty(q.sourceId) || !["stripe", "xero"].includes(observation.provider) || q.sourceProvider !== observation.provider) reasons.push("source_identity_unqualified");
  if (!Number.isFinite(observation.mrrAud) || observation.mrrAud < 0 || q.amountAud !== observation.mrrAud) reasons.push("amount_unqualified");
  const asOf = typeof q.asOf === "string" ? Date.parse(q.asOf) : NaN;
  const captured = Date.parse(observation.capturedAt);
  if (!Number.isFinite(scope.now) || !Number.isFinite(asOf) || !Number.isFinite(captured) || q.capturedAt !== observation.capturedAt || asOf > captured || captured > scope.now || scope.now - asOf >= 90 * 86400000) reasons.push("source_date_unqualified");
  return { eligible: reasons.length === 0, reasons, provenance: reasons.length ? null : q as unknown as RevenueProvenance };
}
