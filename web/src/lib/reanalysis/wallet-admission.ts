import { z } from "zod";
import { prepareReanalysisRequest, reanalysisRequestSchema, type ReanalysisRequest } from "./request-contract";

const id = z.string().min(1).max(200).refine(value => value === value.trim());
const site = z.enum(["blockid.au", "startupvalueindex.com"]);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const activeWindow = { status: z.literal("active"), validFrom: z.string().datetime(), expiresAt: z.string().datetime() };
const snapshotSchema = z.object({
  observedAt: z.string().datetime(),
  user: z.object({ id, status: z.literal("active") }).strict(),
  association: z.object({
    id, actorId: id, site, accountId: id, businessId: id, ownerUserId: id,
    revision: id, inputSha256: sha, canRead: z.literal(true), canCreateRevision: z.literal(true), ...activeWindow,
  }).strict(),
  grant: z.object({
    id, actorId: id, site, accountId: id, associationId: id,
    walletId: id, walletOwnerUserId: id, provider: z.literal("blockid_user_credits"), canSpend: z.literal(true), ...activeWindow,
  }).strict(),
  quote: z.object({
    id, requesterUserId: id, intentSha256: sha, walletId: id, billingOwnerUserId: id,
    pricingVersion: id, creditMicroUnits: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), expiresAt: z.string().datetime(),
  }).strict(),
}).strict();

/** Reader must return one consistent authoritative snapshot, never browser JSON or a UID-derived mapping. */
export type WalletAdmissionSnapshot = z.infer<typeof snapshotSchema>;
export interface WalletAdmissionQuery {
  actorId: string;
  site: ReanalysisRequest["site"];
  businessId: string;
  accountId: string;
  baseRevision: string;
  inputSha256: string;
  acceptedQuoteId: string;
}
export type WalletAdmissionReader = (query: Readonly<WalletAdmissionQuery>) => Promise<unknown>;
const authSchema = z.object({ userId: id, site }).strict();
export const WALLET_ADMISSION_MAX_AGE_MS = 30_000;

/**
 * Server-side adapter only. The caller supplies verified session identity and an authoritative reader.
 * Success validates intent; it neither grants a transferable permission nor reserves/spends credits.
 * Execution must atomically recheck current grants, report revision and quote while reserving funds.
 */
export async function admitReanalysisWithWallet(
  raw: unknown,
  authenticated: { userId: string; site: ReanalysisRequest["site"] } | null,
  read: WalletAdmissionReader,
  now: () => number = Date.now,
) {
  const fail = (error: string) => ({ ok: false as const, error });
  const auth = authSchema.safeParse(authenticated);
  if (!auth.success) return fail("authentication_required");
  const parsed = reanalysisRequestSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid_request");
  const request = parsed.data;
  if (request.site !== auth.data.site) return fail("authentication_required");
  let snapshot: unknown;
  try {
    snapshot = await read(Object.freeze({ actorId: auth.data.userId, site: auth.data.site, businessId: request.businessId, accountId: request.accountId, baseRevision: request.baseRevision, inputSha256: request.inputSha256, acceptedQuoteId: request.acceptedQuoteId }));
  } catch {
    return fail("wallet_admission_unavailable");
  }
  const decoded = snapshotSchema.safeParse(snapshot);
  if (!decoded.success) return fail("wallet_admission_required");
  const { user, association, grant, quote, observedAt } = decoded.data;
  // Read the clock after the reader completes; a slow lookup must not extend validity.
  const timestamp = now();
  const observed = Date.parse(observedAt);
  const valid = (window: { validFrom: string; expiresAt: string }) => Date.parse(window.validFrom) <= timestamp && Date.parse(window.expiresAt) > timestamp;
  if (!Number.isFinite(timestamp) || observed > timestamp || timestamp - observed > WALLET_ADMISSION_MAX_AGE_MS || !valid(association) || !valid(grant)) return fail("wallet_admission_stale");
  if (user.id !== auth.data.userId || association.actorId !== user.id || grant.actorId !== user.id || association.site !== request.site || grant.site !== request.site || association.accountId !== request.accountId || grant.accountId !== association.accountId || grant.associationId !== association.id || association.businessId !== request.businessId) return fail("wallet_admission_mismatch");
  return prepareReanalysisRequest(request, {
    authenticatedUserId: user.id, authenticatedSite: request.site,
    resource: { businessId: association.businessId, accountId: association.accountId, ownerUserId: association.ownerUserId, revision: association.revision, inputSha256: association.inputSha256, canRead: association.canRead, canCreateRevision: association.canCreateRevision },
    wallet: { provider: grant.provider, walletId: grant.walletId, ownerUserId: grant.walletOwnerUserId, accountId: grant.accountId, authorizedSite: grant.site, canSpend: grant.canSpend },
    quote,
  }, timestamp);
}
