# Durable research model attempt coordinator

`web/src/lib/ai/research-attempt-coordinator.ts` now supplies a concrete `createResearchAttemptBudget` implementation for the existing DeepInfra per-attempt hook. This is **source only**: there is no live factory caller, ledger provisioning, price activation, provider call or customer charge. The dated DeepInfra draft is not imported or treated as an eligible price policy.

## Trust and exact integration contract

The server passes a durable `context` containing `accountId`, `jobId`, `callId`, `originalMonth` and `grantId`. The stable call identity must represent the authorized job/purpose/review batch and survive retries. The context is cloned; the factory returns the existing `ResearchAttemptBudget` shape. It never creates an admission identity from a clock, request ID or random value. Random UUIDs are used only for temporary filesystem writes.

`readAuthorization(request)` must independently revalidate the durable job, provider account, current lease/report/account authority, explicit applicable spending approval, and exact model/payload binding. It returns:

- An approved grant bound to the full context, expiry, price-policy ID, explicit monthly/job/call monetary and attempt limits, and exact allowed `{model, payloadSha256, promptBytes, maximumOutputTokens}` entries. This binding must be established by trusted server construction of the payload; echoing an arbitrary client request is not authorization.
- An approved, unexpired server price policy containing exact model IDs, positive integer nanoUSD input/output prices, certified model context/provider output ceilings and `completeUsageAccountingCertified`. That last field may be true only when the policy verifies that the reported token totals account for **all** charged completion/reasoning/input tokens under those rates. A plausible model name, generic max-token default or benchmark does not establish it.
- Explicit external month/job/call usage baselines. The coordinator only adds them to its local costs/counts; it never subtracts them or assumes a successful local settlement has reduced externally counted usage. The real accounting authority must identify their coverage. Conservative overlap can cause earlier denial; falsely missing external usage can violate the intended account cap.

A separate mandatory `assertSettlementAuthorized(context)` establishes trusted accounting authority for the original reservation. It must not accept arbitrary HTTP usage values or rely on a browser session alone. The existing `callAI` hook invokes settlement from its own parsed provider transport; a future external settlement endpoint would need additional authenticated receipt binding and must not simply forward request JSON.

Example composition once the unresolved authorities are implemented:

```ts
const attemptBudget = createResearchAttemptBudget({
  directory: explicitSharedPrivateAccountDirectory,
  context: admittedJob.modelCallContext,
  readAuthorization: request => authority.readExactAdmittedModelCall(admittedJob, request),
  assertSettlementAuthorized: context => accounting.assertOriginalCallAuthority(context),
});
// Pass attemptBudget only to the existing scoped DeepInfra callAI invocation.
```

These authorities are intentionally not invented here. No permissive defaults, inactive draft import, fallback provider, free quota or numeric spending cap are supplied by this module.

## Persistence and admission

One **explicitly provisioned**, absolute, non-symlink 0700 directory per provider account must be shared by every worker/release. The original-month file must already exist as a regular, same-owner, single-link 0600 JSON ledger. Missing, corrupt, unsafe, oversize or wrong-account/month state denies access; reserve never silently recreates an empty ledger. A separate controlled provisioning procedure must reconcile prior account usage and establish the correct empty/nonempty ledger baseline. Tests seed synthetic temporary ledgers only.

The ledger envelope is `{version:1, account:SHA256(JSON.stringify(accountId)), month:"YYYY-MM", entries:[...]}`. This is a format description, not a command to reset production data. Entries contain hashed scope/grant/policy identities, payload SHA256, public model IDs, immutable certified rate/ceiling snapshots and usage amounts. Prompts, decks, raw provider responses, secrets and clear job/account IDs are not written.

Every reserve obtains the same cross-process directory lock; it waits at most 1.5 seconds and never removes another worker's existing lock. A crashed lock requires explicit recovery. Directory creation is fsynced; ledger replacement uses an exclusive private temporary file, file fsync, atomic rename and directory fsync. A write/acknowledgment failure can leave a counted reservation, which is safe to reconcile, not permission to redispatch. Lock cleanup removes only the lock obtained by the current invocation. Capacity is bounded to 5,000 entries/4MB per month; exceeding storage capacity fails closed and is not a substitute for an admitted budget limit.

Inside the lock, the coordinator re-reads authorization and rechecks the clock after that asynchronous read. A new dispatch must still be in the **original** month. Policy/grant/model/payload scope must match; changed content under an existing policy/grant ID, changed job limits, attempt-ID mismatch, or scope substitution is rejected. Existing reservation replay returns `dispatchAllowed:false`. The per-attempt ID exactly matches the existing hook's deterministic hash of durable call ID, provider, model and payload digest.

Maximum reservation uses BigInt and upward rounding:

```text
ceil((certifiedContextTokens * inputNanoUsdPerToken
    + certifiedProviderMaxOutputTokens * outputNanoUsdPerToken) / 1000)
```

It independently reserves full context input and full provider output, deliberately conservative even though those jointly constrain actual generation. No characters/token estimate, template-overhead assumption, cache discount, request-visible reasoning omission or stale global price map is used. Values exceeding safe integer storage reject admission. The permit retains the smaller explicitly approved requested output cap for subsequent usage validation. Monthly, job and call totals each include local effective held/settled costs plus their external baselines, and all attempt counts remain consumed after settlement.

## Settlement and uncertainty

Settlement looks up the original context/attempt and stored policy snapshot; it does **not** reprice from a current policy or require the wall clock to remain in the original month. A first reported usage result can reduce the held amount only if the original policy certifies complete usage accounting, values are integral and within input/requested-output/combined-context bounds, and usage is not all zero. The amount is calculated from the original rates with the same BigInt rounding.

Missing, ambiguous, uncertified, zero or out-of-bound usage becomes sticky `unknown`, preserving the entire maximum. An identical settlement replay is idempotent. Any later different settlement is rejected and cannot reduce the previously held amount. Resolving unknowns needs a separate reviewed authoritative reconciliation procedure; this hook has no automatic refund or administrative override. Attempt counts never reset, and a failed settlement-authority check cannot modify the ledger.

## Remaining deployment prerequisites and validation

Implement real durable grant/price-policy issuance, job-bound gateway authorization, reconciled external-account baselines, controlled ledger provisioning/recovery, account and revision revocation, complete billing-usage semantics and retention/erasure policy for hashed accounting identifiers before activation. Hashes remain potentially linkable metadata and do not by themselves anonymize an account. Ensure all research model callers use the same account ledger; this module does not silently modify legacy AI callers or their spending records.

Validation uses real temporary protected files and six independently spawned processes sharing one ledger. It covers concurrent admission, restart replay, missing/corrupt state, symlink/hardlink/file/directory permissions, crashed locks, exact scope/payload/policy binding, cumulative costs and attempt caps, original-month crossing, original-rate settlement, unknown/uncertified retained costs, repeated/contradictory settlement, lost acknowledgment, unauthorized settlement and BigInt overflow/rounding. All transport data and prices are synthetic; there are no paid or provider requests.
