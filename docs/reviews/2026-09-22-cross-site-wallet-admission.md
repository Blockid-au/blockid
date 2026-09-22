# Cross-site wallet admission adapter — 2026-09-22

Implemented a pure server adapter around `web/src/lib/reanalysis/request-contract.ts`. A verified handoff UID is identity only: it cannot invent a wallet, account membership or spending permission.

The injected reader must resolve one consistent authoritative snapshot containing an active user, explicit actor/report/account association (including current input hash and revision), site-specific wallet grant linked to that association, and the accepted server quote. Missing, revoked, mismatched or malformed records fail closed. Observations older than 30 seconds or from the future fail; association/grant activation and expiry are checked after lookup completes. Existing contract validation binds quote requester, wallet, billing owner, exact intent and expiry. Reader errors expose no database details. IDs are preserved; no fallback ID mapping is created.

This is **not a live spending permission service**. No production reader, database migration, route, reservation, payment, model call or activation is included. Success still returns `executionAllowed: false` and requires a durable reservation/revision transaction. The later executor must atomically recheck grants, report state, quote and balance, protecting against revocation after this preparatory read. Thirty-second freshness is a conservative preparatory cap, not permission to cache grants for charging. No customer permission has been manufactured or enabled.

Next integration requires review of the actual account/report/wallet schema and ownership semantics; a trusted consistent reader; authenticated session integration; transaction-bound authorization and idempotent reservations/refunds; account lifecycle revocation; and only then customer activation. Neither read access nor technical report creator identity automatically permits charging another wallet.

Validation: 17 focused tests pass (9 adapter cases plus 8 existing contract cases), including separate requester/business owner/payer, both sites, UID-only denial, injected fields, revocation, freshness, account/site/report mismatch and quote binding. Targeted strict TypeScript check passes using repository alias/type roots. No full build/deploy or production changes performed by this task.

Reviewed `web/AGENTS.md` and installed Next authentication guidance before implementation; adapter has no Next runtime API dependency.
