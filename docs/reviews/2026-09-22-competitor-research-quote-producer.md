# Draft real competitive-research quote producer — 2026-09-22

Status: isolated source and PostgreSQL implementation; no live migration, authenticated route, provider call, customer approval, charge or feature activation. Additive draft 0449 depends on unchanged 0447 plus reviewed 0448 and its financial prerequisites. Keep this draft outside canonical production migrations until the controlled cutover.

## Smallest supported product

The existing `research` feature costs **0.50 credits** in both web and billing-service source. It has no current `platform_config` override. This producer reuses that price for one fresh competitive-research task answering the existing question “Who are the main competitors?” (`blockid:question:market:d6eae1d178553aef`). It does not charge 0.50 for every guiding question, aggregate dimensions, create a new SKU, or assume free plan/team/sandbox entitlements. Other criteria/dimension products require their own existing-deliverable mapping before support.

The application checks `FEATURE_COSTS.research === 0.50` and the pinned current scope registry. SQL fixes the same amount (500000 microcredits) and the reviewed `feature-research-0.50-v1` terms version. A price, registry, scope or mode change fails closed and requires a coordinated source/SQL upgrade. No request-selected amount or future-price fallback exists. This is a versioned copy of the existing single price, not a broad new pricing subsystem.

## Real server/database contract

`issueOwnedCompetitorResearchQuote(verifiedActorId, { analysisId, grantId })` is server-only and defaults to the real Supabase admin client. The eventual authenticated same-origin/CSRF route must supply the actor from its verified session. Extra selection fields are rejected; payer, account, business, revision, wallet, price, cutoff, scope and permission are resolved by the server/database.

1. `read_competitor_research_quote_context` locks and reads the active personal owner, current owned analysis, real wallet and existing sealed association/grant. It rejects stale or revoked authority and returns a consistent context. It creates no association, grant, quote or hold.
2. The server allocates a random quote UUID before building the request. Existing `reanalysisIntentHash` excludes `acceptedQuoteId`, so the UUID and hash have no circular dependency. Existing `prepareReanalysisQuoteDisplay` produces the normal consent terms; `JSON.stringify(display.terms)` supplies exact bytes.
3. `issue_competitor_research_quote` re-resolves current authority under the same lock order, checks the exact registered question/mode, current price/version and every terms field, then inserts immutable quote TEXT and SHA256. It calls existing 0448 authority validation before commit; failure rolls the insert back. A repeated UUID returns the same stored bytes only when every economic/authority identity agrees. JSONB reserialization is never substituted for the stored text.
4. The application returns display success only after receiving the exact committed bytes, digest, amount, UUID and expiry. Ambiguous RPC responses fail closed. The quote is explicitly unapproved, execution disabled. Existing approval echo/`validateReanalysisQuoteConsent` and 0448 reservation remain separate later steps.

The quote cutoff comes from the database observation time; new issuance requires it within five minutes and not in the future. Expiry is no later than 30 minutes or the existing association/grant expiry. Exact existing-UUID retries may retain an older cutoff while authority and quote remain valid. No automatic extension occurs. The present high-level application call allocates a new UUID for each invocation; low-level same-UUID RPC retry is idempotent, and an ambiguous high-level retry can leave an unused unapproved quote rather than risk duplicate charging.

Only the two narrow RPCs are granted to service_role. Browser roles cannot execute them; direct quote INSERT stays revoked. Current read/issue RPCs have no search, model, billing-service HTTP fallback, spending, consent insertion or report publication operation.

## Evidence and remaining dependencies

- Eight real isolated PostgreSQL producer tests passed: context-only no mutation, concurrent byte-exact replay, real issued quote through existing consent/hold/capture, wrong scope/price, changed terms bytes, expiry/future cutoff, revoke/stale report, narrow privileges. The service-role case additionally executes issuance as that actual role with no direct table grant.
- Thirteen Vitest cases across the producer and existing consent contract passed: fixed existing price, quote-ID/hash independence, exact committed bytes, rejected request-selected inputs, future price, stale/expired/mismatched authority, ambiguous insert and invalid receipt.
- Scratch PostgreSQL has no network, ports or host mounts and uses only the existing bounded fixture/image. No production schema or customer transaction was touched. No full application build/typecheck was run for this draft phase.

A future approval path still needs an authenticated quote/admission reader (service_role still lacks direct quote table SELECT), so it can re-read the stored request/terms rather than trust a browser echo. A future route also needs verified authentication/CSRF, request-rate bounds, display of the exact stored quote, explicit customer approval and the existing reservation path. Worker/provider-budget integration, supported evidence retention, result publication, quota/top-up UI and research erasure/reconciliation remain separate activation dependencies. SVI stays unsupported by this producer until its signed-creator and cross-store publication contract exists. Creation of a valid quote is not authorization to perform paid research.
