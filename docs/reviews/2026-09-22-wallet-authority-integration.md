# Wallet authority integration — 2026-09-22

Status: implementation handoff, not production activation. This review used source plus read-only live schema/ledger queries. No migration, customer transaction or provider call was performed. The purpose is to connect existing components rather than create another parallel consent or reservation implementation.

## Physical state and existing implementation

At inspection, primary source and the live migration ledger contain 0440–0442; 0443–0446 are not applied and the credit_operations/reanalysis tables are absent from the live schema. Existing drafts are in `/data/blockid-g30-reservation-consent`, exact HEAD `2098631d24f384b74085849ace97c5007b8cc91a`. Migration changes most recently include `7232bc7c0beccff6f9ac655babe2ce2297cbd91c`; HEAD additionally binds application reservation holds to exact consent/report identity. Reinspect worktree status and migration ledger before applying anything.

| Existing draft | Reuse |
| --- | --- |
| 0443_credit_operation_receipts.sql | credit_operations; operation_id on credit_transactions/usage_logs; apply_credit_operation idempotent grant/spend RPC |
| 0444_credit_checkout_fulfillment.sql | credit_checkout_orders; record_credit_checkout/fulfill_credit_checkout; revenue-event receipt binding |
| 0445_erasure_credit_purchase_receipts.sql | Existing erasure routine expansion for purchase economic records |
| 0446_scoped_reanalysis_jobs.sql | reanalysis_heads, reanalysis_jobs, reanalysis_revisions, **reanalysis_consents**; reserve/lease/checkpoint/release/finalize operations and **enqueue_consented_reanalysis** |

Important correction to the preliminary verbal review: the final section of 0446 already creates an immutable consent audit and atomically binds it to reservation. It locks actor/payer accounts in deterministic order, validates exact serialized terms/digest, amount, report identity, retry lineage and expiry; service_role EXECUTE on bare enqueue_reanalysis is revoked. Do not introduce a duplicate consent table or independent reservation entry point. Extend the existing wrapper and tests.

The deployed wallet is `credit_balances`: its `id` is the real wallet UUID, `user_id` is a unique app_users FK, and balance is numeric with two decimal places. One personal wallet is shared across that user's projects. The adapter provider name `blockid_user_credits` is conceptual; it is not a physical table. `wallet-admission.ts` validates an injected authoritative snapshot but does not itself read a database, create grants or execute spending.

## Actual ownership and access evidence

| Resource | Authoritative binding | Limitation |
| --- | --- | --- |
| Personal wallet | credit_balances.user_id → app_users.id; wallet ID is credit_balances.id | Identifies payer; no report authority or consent implied |
| BlockID personal report | analyses.user_id | NULL guest reports need the existing verified claim flow, not inferred ownership |
| BlockID project | projects.user_id | Project owner, with archived_at checked |
| Legacy project report | svi_analyses.project_id → projects.id | Old email-only rows are not sufficient authority |
| Legacy SVI account | svi_accounts.project_id → projects.id | svi_accounts has no user_id; email/slug must not establish billing ownership |
| Shared project member | project_members.user_id, project_id, accepted status and role | Report edit permission does not automatically permit owner-wallet spending |
| SVI report | Signed creator/revision store: actorId, runId, revision, businessId, canonical report hash and raw hash | Private creator access, explicitly not legal company ownership; contains no account/wallet association |

Relevant source: web/src/lib/projects.ts; web/src/lib/reanalysis/wallet-admission.ts, request-contract.ts and quote-consent.ts; SVI src/lib/report-identity/store.ts. Both app_users.deleted_at and erased_at revoke account access. Pending deletion and PII-only anonymization do not independently revoke it.

## Phase 1 — establish explicit personal-report authority

First customer scope should be actor-owned reports and the actor's own personal wallet. Defer spending another user's/team wallet. Reuse the real wallet row; do not mint another wallet or derive its ID from UID.

Add a migration after the reviewed drafts, tentatively `0447_reanalysis_authority.sql` (number must be rechecked before creation):

- `reanalysis_report_associations`: UUID id, site, report_id, actor_user_id, explicitly defined account_user_id FK, optional project_id/svi_account_id, business_id, revision, input_sha256, raw_sha256, immutable snapshot_ref, authority_kind, read/create-revision permissions, valid_from, expires_at and revoked_at. Unique actor/site/report/revision binding. The account ID namespace must be explicit: personal app_users account versus legacy svi_accounts business record cannot be interchangeable strings.
- `reanalysis_wallet_grants`: UUID id, association_id, actor_user_id, site, real wallet_id FK, wallet_owner_user_id, granting_user_id, consent_version, valid_from/expires_at/revoked_at. Initially enforce actor = payer = personal account owner. The account/report association and grant remain separately revocable.
- `reanalysis_quotes`: UUID id, association/grant IDs, requester_user_id, wallet_id, billing_owner_user_id, canonical intent hash, pricing version, exact credit amount, expiry and immutable terms binding. Do not trust quote terms supplied solely by a service caller as authoritative pricing.

These are proposed schema changes, not existing physical tables. Map their stored records to the current wallet-admission snapshot; do not synthesize association or canSpend merely because SVI handoff has a UID. For SVI, resolve creator access and both current hashes server-side before persisting an association. Business slug identifies a report subject, not ownership of a company. Clarify ownerUserId naming/documentation in the adapter so report controller is not presented as legal business owner.

Route semantics: authenticated same-origin POST creates the explicit report-to-personal-wallet connection after displaying what access is granted. Server resolves the existing wallet and report authority; client cannot select an arbitrary payer. Opening a report, rendering a tab, logging in or fetching a quote creates no grant or charge. Record who accepted the scoped connection and allow revocation.

## Phase 2 — connect existing quote consent to atomic reservation

Reuse `prepareReanalysisQuoteDisplay` and `validateReanalysisQuoteConsent`; persist/re-read server quotes rather than passing client-controlled quote objects. Keep current precision rejection: one ledger unit is .01 credits and creditMicroUnits must divide exactly by10000.

The authenticated same-origin approval route must resolve account status, report authority, current association/grant, exact report revision/hashes and stored quote. It then accepts only the existing approval echo (quoteId, reportId, displayedTermsSha256 and explicit approve decision). Confirmation must show credit amount, research scope, charging-on-success rule and that scores may decrease or remain unchanged. A digest echo binds terms; it is not proof a human read them. Provider search spending permission from the site owner is separate from customer credit consent.

Extend **enqueue_consented_reanalysis**, not a parallel function:

- Lock and re-read association, grant, stored quote and real wallet in the same transaction as hold/consent insertion; validate request actor/site/account/report and wallet-owner relationships.
- Require both actor and payer deleted_at/erased_at null. Existing wrapper checks erased_at only.
- Validate grant validity/revocation, quote expiry, report hash/revision and existing terms binding. Bind association/grant/quote IDs into job authority and operation identity.
- Preserve atomic immutable `reanalysis_consents` insertion and current retry/idempotency semantics. No service-role bypass to bare enqueue.
- Replace implicit baseline adoption from supplied intent with adoption from an authoritative sealed association. Existing INSERT into reanalysis_heads cannot itself prove report authority.

Transaction tests must cover concurrent revoke-versus-reserve, changed quote, stale revision, mismatched wallet/actor/site, duplicate approvals, consent insert failure rolling back the hold, and cancellation/refund replay.

## Phase 3 — worker, publication and lifecycle integration

Recheck active actor/payer and live grant/association on worker claim and finalization. A revoked grant must stop new provider work and prevent an unauthorized result publication/capture; reconcile/release held funds according to the existing job state machine. Expiry/closure must not silently convert a hold into a charge.

Join all applicable report writers to the revision comparison protocol. reanalysis_heads cannot detect updates performed outside its transaction; preserve immutable source snapshots and compare the authoritative report revision before finalization. The SVI filesystem and BlockID database require an explicit publication protocol, not a presumed shared transaction.

Add account-erasure handling for new associations/grants/quotes and research content. Reuse existing financial tombstone retention where justified. Review 0446's immutable-consent UPDATE/DELETE trigger before including consent rows in an erasure routine: do not introduce an erasure failure or casually bypass audit immutability. Keep report payloads out of minimal retained financial receipts.

## Phase 4 — migration and activation

Review and integrate the exact existing draft branch; reconcile 0445 with latest erasure routine; test migrations/RPCs in an isolated database first. Apply through scripts/db/apply-migration.sh and record the ledger/manifest. No deployment auto-applies migrations. Keep mutation tables inaccessible to browser roles; mutations use narrowly scoped server RPCs.

Deploy compatible readers with customer execution disabled, verify authority and no-spend paths, then enable the complete consent/reservation/worker/publication path for supported own-report cases. Rollback must preserve durable jobs/receipts and disable admission without losing holds or duplicating captures. A source-only adapter or successful login does not mean paid research is live.
