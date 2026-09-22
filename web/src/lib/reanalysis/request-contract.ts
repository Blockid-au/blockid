import { createHash } from "node:crypto";
import { z } from "zod";
import { REANALYSIS_SCOPE_VERSION, resolveReanalysisScopes } from "./scope";

const id = z.string().trim().min(1).max(200);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const reanalysisRequestSchema = z.object({
  site: z.enum(["blockid.au", "startupvalueindex.com"]), businessId: id, accountId: id,
  baseRevision: id, inputSha256: sha, scopeVersion: id, scopeIds: z.array(id).min(1).max(64),
  mode: z.enum(["existing_evidence", "fresh_public_research"]), researchPolicyVersion: id, researchCutoff: z.string().datetime(), acceptedQuoteId: id,
}).strict();
export type ReanalysisRequest = z.infer<typeof reanalysisRequestSchema>;
export interface ServerReanalysisContext {
  /** Established by a server auth adapter. Neither this object nor quote comes from request JSON. */
  authenticatedUserId: string | null;
  authenticatedSite: ReanalysisRequest["site"];
  resource: { businessId: string; accountId: string; ownerUserId: string; revision: string; inputSha256: string; canRead: boolean; canCreateRevision: boolean } | null;
  /** Explicit resolved wallet. UID handoff alone must never manufacture this mapping. */
  wallet: { provider: "blockid_user_credits"; walletId: string; ownerUserId: string; accountId: string; authorizedSite: ReanalysisRequest["site"]; canSpend: boolean } | null;
  quote: { id: string; requesterUserId: string; intentSha256: string; walletId: string; billingOwnerUserId: string; pricingVersion: string; creditMicroUnits: number; expiresAt: string } | null;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Canonical quote binding; scopes are sorted/deduplicated before hashing, never billed per repeated array item. */
export function reanalysisIntentHash(request: ReanalysisRequest): string {
  return hash([request.site, request.businessId, request.accountId, request.baseRevision, request.inputSha256, request.scopeVersion, [...new Set(request.scopeIds)].sort(), request.mode, request.researchPolicyVersion, request.researchCutoff]);
}

/** Pure admission contract. Never spends, reserves, runs research, saves a report or authorizes execution. */
export function prepareReanalysisRequest(raw: unknown, server: ServerReanalysisContext, now = Date.now()) {
  const fail = (error: string) => ({ ok: false as const, error });
  const parsed = reanalysisRequestSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid_request");
  const request = parsed.data;
  if (!server.authenticatedUserId || server.authenticatedSite !== request.site) return fail("authentication_required");
  const resource = server.resource;
  if (!resource || !resource.canRead || !resource.canCreateRevision) return fail("revision_permission_required");
  if (!resource.ownerUserId || resource.businessId !== request.businessId || resource.accountId !== request.accountId) return fail("business_account_mismatch");
  if (resource.revision !== request.baseRevision || resource.inputSha256 !== request.inputSha256) return fail("stale_snapshot");
  if (request.scopeVersion !== REANALYSIS_SCOPE_VERSION) return fail("scope_version_mismatch");
  const scopes = resolveReanalysisScopes(request.site, request.scopeIds);
  if (!scopes) return fail("invalid_scope");
  const wallet = server.wallet;
  if (!wallet || !wallet.canSpend || !wallet.ownerUserId || !wallet.walletId || wallet.accountId !== resource.accountId || wallet.authorizedSite !== request.site) return fail("wallet_authorization_required");
  const quote = server.quote;
  if (!quote || quote.id !== request.acceptedQuoteId || quote.requesterUserId !== server.authenticatedUserId || quote.intentSha256 !== reanalysisIntentHash(request) || quote.walletId !== wallet.walletId || quote.billingOwnerUserId !== wallet.ownerUserId) return fail("approved_quote_required");
  if (!quote.pricingVersion.trim() || !Number.isSafeInteger(quote.creditMicroUnits) || quote.creditMicroUnits < 0) return fail("pricing_unavailable");
  const expiresAt = Date.parse(quote.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || expiresAt <= now) return fail("quote_expired");
  const operationKey = `reanalysis-v1-${hash([reanalysisIntentHash(request), wallet.provider, wallet.walletId, wallet.ownerUserId, quote.pricingVersion, quote.creditMicroUnits])}`;
  return {
    ok: true as const, stage: "validated_intent" as const, executionAllowed: false as const,
    requiredNext: "durable_reservation_and_revision_transaction" as const,
    operationKey, intentSha256: reanalysisIntentHash(request), quoteId: quote.id,
    requesterUserId: server.authenticatedUserId, businessOwnerUserId: resource.ownerUserId,
    billingOwnerUserId: wallet.ownerUserId, walletId: wallet.walletId, creditMicroUnits: quote.creditMicroUnits,
    request: { ...request, scopeIds: scopes.map(scope => scope.id) }, scopes,
  };
}
