# Atomic Brave budget reservations

Source-only: no provider calls, live configuration, customer debits or deployments.

`web/src/lib/reanalysis/brave-budget-store.ts` exports `reserveBraveBudget(directory, request, readPolicy, clock)`. Every worker/release for the same provider account must share a pre-provisioned absolute 0700 directory outside the web root/repository, owned by the process user and with no symlink components. Ledgers are 0600, bounded to 900 entries / 512 KB. An exclusive mkdir lock waits at most 1.5 seconds; atomic rename plus file/directory fsync precede permission to dispatch. This supports a single host/local filesystem; multiple hosts require a transactional shared coordinator.

The trusted reader supplies the existing fresh `BraveResearchBudget`: owner paid authorization, price/expiry, provider policy and external usage. Never accept this from request JSON. Account/wallet/customer consent and durable job admission remain separate requirements. Query text, keys, URLs, snippets and result bodies are never persisted. Scope/idempotency identifiers are hashed.

Local reservations are added conservatively to external usage for question (3), batch (6), UTC day (30), UTC month (900) and paid monthly caps. Verified free allowance is reduced by local free reservations; unknown allowance reserves full list price. A provider snapshot already including local usage may double-count conservatively; never subtract guesses. Before wiring, reconcile prior account usage, including the four validation requests, into the trusted reader and eliminate unbudgeted callers sharing that account.

Only a new durable reservation returns `dispatchAllowed: true`. Exact retries return `replay: true, dispatchAllowed: false`; changed scope under the same ID is rejected. The immutable request includes its original month and cannot be replayed into a new month. Bind a stable reservation ID to a durable job. Never mint new IDs to retry ambiguous provider calls. The worker must execute only the reserved number of requests and separately persist dispatch/result status. A provider timeout or process crash never automatically releases quota/money. Customer credit consent remains false.

## Recovery

Reservations remain counted for the entire month. A process crash while holding `.reservation-lock` causes subsequent calls to fail closed after 1.5 seconds. There is deliberately no time-based takeover: a paused live process could otherwise double-spend. Operator recovery requires stopping every user of that directory, reconciling jobs/ledger while retaining ambiguous reservations, removing only an orphaned lock, and restarting workers. Never delete/reset a ledger to restore availability. Corrupt or unsafe ledgers are rejected unchanged. Monthly ledger cleanup is not automatic.

## Verification

Nine focused tests pass: six independent OS workers racing a two-request budget; replay from a new process without redispatch; persisted exhaustion; each quota dimension; free allowance non-reuse; unknown allowance charged; conflicting ID; stale policy; wrong month/account; corrupted ledger; shared directory and orphaned lock. Strict targeted TypeScript checking passes. Tests use isolated temporary directories and a child-process test-only server-only import shim. No network calls or real credentials.

## Required production wiring

Provision/pin one shared private ledger directory across live/warm releases. Read fresh trusted owner policy and reconciled external usage. After durable job/account/wallet admission, reserve immediately before search and dispatch only on `dispatchAllowed: true`. Store receipt identity in job metadata. Replays/uncertain outcomes require reconciliation, not automatic retry/refund. Keep Brave-derived content ephemeral until retention rights are established. This module does not grant result-retention rights, validate research quality or activate customer research.
