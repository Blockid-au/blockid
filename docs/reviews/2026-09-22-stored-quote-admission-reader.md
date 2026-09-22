# Draft authoritative stored-quote reader — 2026-09-22

Status: isolated source only; no primary changes, production migration, provider request, customer mutation or route activation. Draft 0450 depends on the reviewed 0449 quote producer and 0448/0447 authority functions. All financial drafts remain outside the canonical production migration scope until their controlled cutover.

## Database contract

`read_owned_reanalysis_quote(actor, analysis, quote)` is a narrow service-only RPC. Actor must come from the verified session, not request JSON. The quote must belong to that personal actor/payer; its stored grant resolves the real association and wallet. The RPC reuses 0449's locked context reader and 0448's current-authority validator, including active account, exact report, both hashes, current revision, valid unrevoked association/grant and unexpired immutable quote.

Only the existing competitor question/0.50-credit producer is supported. The read returns the existing `WalletAdmissionSnapshot` shape, a request reconstructed from immutable stored terms, the internal report binding, exact stored terms TEXT and SHA256. `observedAt` is recorded after the complete locked read; timestamps are returned as UTC milliseconds compatible with the existing admission schema. No direct table SELECT permission is added for service_role or browser roles.

This read acquires transaction locks for consistency but inserts or updates no quote, consent, job, report, grant, balance or ledger row. It does not perform search/model work. Authority must still be rechecked in the later 0448 reservation/finalization transaction; a reader result is not transferable execution permission.

## Server integration

- `readOwnedStoredReanalysisQuote` takes only the verified actor and strict `{ analysisId, quoteId }` selection. It validates the RPC envelope, personal owner/payer bindings and exact identifiers, then runs existing `admitReanalysisWithWallet` and `prepareReanalysisQuoteDisplay`. Regenerated terms must equal stored TEXT byte-for-byte and match its stored digest.
- `createOwnedStoredQuoteAdmissionReader` implements the existing `WalletAdmissionReader` contract. The closure binds the authenticated actor and report; query fields cannot substitute another identity/site/account/report. Each invocation makes a fresh database read and rejects requested stale revision/input hashes.
- `validateOwnedStoredQuoteApproval` re-reads before checking the browser approval echo with existing `validateReanalysisQuoteConsent`. It returns the existing validated consent object without storing it or reserving funds. A prior successful display is not reused as authority after revocation.
- The existing snapshot schema is exported for reuse rather than copied into a competing validator. Its validation behavior is unchanged.

The complete server bundle includes an internal immutable snapshot reference needed for reservation. A future route must return only browser-safe stored terms/digest, not this entire bundle. No authenticated route or user flow is introduced here.

## Validation

- 22 Vitest cases passed across reader, existing wallet admission and consent. The optional real-SQL bridge is skipped in the ordinary unit invocation, then actually executed by the database harness.
- Six real isolated PostgreSQL tests passed. They cover exact bytes/current context with unchanged row/balance counts; wrong actor/report/quote; closed/erased account; stale report; revoked grant; expired quote; actual service-role execution with direct SELECT still denied.
- The sixth PostgreSQL case passes the actual RPC JSON envelope into the TypeScript reader, existing admission and existing consent path; its integration test passed. The synthetic envelope uses a temporary0600 file removed after the test.
- Migration reapplication also passed. Scratch PostgreSQL uses the existing image, no network/ports/host mounts, bounded resources and exact cleanup. No full application build/typecheck was run in this bounded reader phase.

Remaining activation work is unchanged: verified route authentication/CSRF/rate controls, exact quote display and explicit approval, admission/reservation integration, provider budgets and worker, result publication and research lifecycle/reconciliation. This task stops after the reader implementation.
