# O08 detached report work, upgraded sockets and local job evidence

Source-only continuation from 6732b1115. No signals, process retirement, capacity changes, live SQL or deployment.

## Implemented coverage

- HTTP upgrade and CONNECT admissions now enter the same persistent registry before their listener runs. During drain new handshakes receive 503; an admitted upgraded/tunnel connection remains tracked until its socket closes, not merely until 101/200 headers finish. Existing sockets are not interrupted by drain.
- Both independent first-analysis engines (`runFirstAnalysisJob` and `runReportV2Job`, including their fire-and-forget starters) retain an activity through their full awaited work and delivery. Activities include only a hashed job reference, never raw analysis/customer/deck identifiers.
- Detached v2 progress writes have independent activity scopes, so completion of the parent or SSE cannot hide a still-pending progress save. SVI account creation, welcome/report email branches and onboarding enqueue writes are independently tracked as well.
- Actual claim/finish dependencies are decorated with persisted local attempt state. `claim_pending` is written before calling the database; a confirmed row becomes `claimed`, a null claim settles only that attempt, and only a true finish acknowledgement settles the obligation. Throw/timeout or false finish preserves `claim_pending`/`finish_unconfirmed` even if the JavaScript job returns. Attempts have distinct IDs, preventing a concurrent losing claim from erasing the winner's evidence.
- `trackedWorkDrained` now additionally requires zero unresolved local job obligations. `retirementEligible` remains false. The read-only quiescence probe reports unresolved count rather than interpreting zero HTTP activity as idle.

The local record proves what this instrumented process attempted and acknowledged. It does **not** create a database lease, make replay idempotent, settle a payment, recover a lost worker, or attribute pre-instrumentation jobs to legacy origins. Existing database claim/finish semantics are preserved. An ambiguous local obligation needs database/external-effect reconciliation; no API clearing it on operator assertion is added.

## Evidence

45 focused registry/ownership/first-analysis tests passed, plus 2 real local Node upgrade/CONNECT socket tests. Scoped TypeScript for registry/hook/ownership test passed. No real production job, email or provider was invoked. Tests cover claim-response ambiguity, false finish, losing concurrent claim, upgraded-socket lifetime and rejection of new handshakes while an admitted connection completes.

## Residual retirement prerequisites

- Remaining independently detached jobs outside these report/SVI branches need explicit lifetime coverage. Startup/global schedulers and child-process/provider worker ownership still need accounting.
- The general report-order queue still lacks durable originating-release ownership in the database; its outer worker is tracked, but this change does not add a claim owner/lease column or infer that a current queue row belongs to an old PID.
- Local unresolved jobs need a verified reconciliation path and crash recovery policy. Database finish acknowledgement is not proof every external payment/email side effect succeeded; associated tracked tasks and durable outbox/receipts remain necessary.
- TLS/custom transports outside the Node HTTP Server hooks require inventory; ordinary upgrade/CONNECT coverage does not assert coverage of every possible server implementation.
- Real Next integration/throughput acceptance must be retained when these hooks are merged; the parent owns the existing real Next fixture and deployment.
- Legacy origins cannot inherit this evidence retroactively. Their quiescence remains unknown; no elapsed-time or socket-idle retirement rule was introduced.
