import { createHash } from "node:crypto";
import { z } from "zod";
import { prepareReanalysisRequest, type ServerReanalysisContext } from "./request-contract";

export const REANALYSIS_CONSENT_VERSION = "reanalysis-quote-consent-v1";
/** Resolve from the authorized report record, not from browser IDs or business-level permission alone. */
export interface ServerReanalysisReportBinding {
  reportId: string; site: ServerReanalysisContext["authenticatedSite"];
  businessId: string; accountId: string; baseRevision: string; inputSha256: string;
  /** Immutable internal snapshot reference, never a signed download URL or mutable latest pointer. */
  baseSnapshotRef: string;
  canRead: boolean; canCreateRevision: boolean;
}
const consentSchema = z.object({
  version: z.literal(REANALYSIS_CONSENT_VERSION), decision: z.literal("approve"),
  quoteId: z.string().min(1).max(200), reportId: z.string().min(1).max(200),
  displayedTermsSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Fresh server quote/report projection used both for display and for validating its confirmation.
 * Reuses existing identity/scope/wallet/expiry admission; no parallel pricing or authorization engine.
 */
export function prepareReanalysisQuoteDisplay(raw: unknown, server: ServerReanalysisContext, report: ServerReanalysisReportBinding | null, now = Date.now()) {
  const fail = (error: string) => ({ ok: false as const, error });
  const admitted = prepareReanalysisRequest(raw, server, now);
  if (!admitted.ok) return admitted;
  const request = admitted.request;
  if (!report || !report.canRead || !report.canCreateRevision) return fail("report_revision_permission_required");
  if (!report.reportId.trim() || report.reportId.length > 200 || report.site !== request.site || report.businessId !== request.businessId || report.accountId !== request.accountId) return fail("report_binding_mismatch");
  if (report.baseRevision !== request.baseRevision || report.inputSha256 !== request.inputSha256 || !report.baseSnapshotRef.trim() || report.baseSnapshotRef.length > 500) return fail("report_snapshot_mismatch");
  //0443/0446 ledger precision is .01 credits. Reject rather than round what the user saw.
  if (admitted.creditMicroUnits % 10000 !== 0) return fail("unsupported_credit_precision");
  const quote = server.quote!; // Existing admission has checked the stored server quote.
  const cents = admitted.creditMicroUnits / 10000;
  const terms = {
    version: REANALYSIS_CONSENT_VERSION,
    actorUserId: admitted.requesterUserId, site: request.site,
    businessId: request.businessId, accountId: request.accountId, reportId: report.reportId,
    baseRevision: request.baseRevision, inputSha256: request.inputSha256,
    // Bind an opaque digest, not an internal storage path, into the browser-visible projection.
    baseSnapshotRefSha256: digest(report.baseSnapshotRef),
    scopeVersion: request.scopeVersion, scopeIds: request.scopeIds,
    mode: request.mode, researchPolicyVersion: request.researchPolicyVersion, researchCutoff: request.researchCutoff,
    quoteId: quote.id, pricingVersion: quote.pricingVersion,
    walletId: admitted.walletId, billingOwnerUserId: admitted.billingOwnerUserId,
    creditMicroUnits: admitted.creditMicroUnits,
    displayCredits: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
    expiresAt: new Date(quote.expiresAt).toISOString(),
    chargeRule: "approved_quote_and_successfully_saved_scoped_result_only" as const,
    scoreRule: "may_decrease_or_remain_unchanged" as const,
  };
  return { ok: true as const, terms, displayedTermsSha256: digest(terms), executionAllowed: false as const };
}

/** An approval echo binds displayed terms; it is not a signature or proof a human read the UI.
 * The future authenticated route must persist the receipt immutably before any0446 hold.
 */
export function validateReanalysisQuoteConsent(raw: unknown, rawConsent: unknown, server: ServerReanalysisContext, report: ServerReanalysisReportBinding | null, now = Date.now()) {
  const parsed = consentSchema.safeParse(rawConsent);
  if (!parsed.success) return { ok: false as const, error: "explicit_quote_consent_required" };
  // Always re-read authoritative server context before this call; never reuse display-time auth/quote objects.
  const display = prepareReanalysisQuoteDisplay(raw, server, report, now);
  if (!display.ok) return display;
  const consent = parsed.data;
  if (consent.quoteId !== display.terms.quoteId || consent.reportId !== display.terms.reportId || consent.displayedTermsSha256 !== display.displayedTermsSha256) return { ok: false as const, error: "displayed_quote_terms_changed" };
  return {
    ok: true as const, executionAllowed: false as const,
    requiredNext: "persist_immutable_consent_and_bind_0446_reservation" as const,
    receipt: {
      id: `reanalysis-consent-${display.displayedTermsSha256}`,
      acceptedAt: new Date(now).toISOString(),
      displayedTermsSha256: display.displayedTermsSha256,
      terms: display.terms,
    },
  };
}
