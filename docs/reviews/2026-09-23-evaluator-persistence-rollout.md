# G30 — Evaluator persistence before readiness

## Scope and authorization

Founder requested continued G30 implementation with live deployment after each completed slice. This phase continues F02/T02 after assembled-report persistence: evaluator full reports, quota batch completion and automatic intake report status. DeepInfra-only and US$0.50/report remain unchanged. No additional test suites, standalone lint, browser acceptance or operator-paid inference. Colocated contract expectations were updated but not executed. No deploy notifications or direct customer messages.

## Source behavior

Production source `5339080e49b062e1bc719bb4bcdf6f5dc27af17f`:

- Full evaluator generation now requires a snapshot ID/share token and a confirmed canonical-document write before returning success. Its terminal done event is withheld until that stage completes.
- Interactive, batch and automatic intake full-report callers pass the returned canonical document into the evaluation record insert. It is stored with the quota/billing record in one statement; returned JSON must exactly match the normalized input. This replaces the interactive route's separate ignored best-effort update.
- If the evaluation record cannot be confirmed, the interactive route returns503 `report_record_unconfirmed`, no ready webhook and no share URL. A lost response may mean the insert committed; this path does not assert a refund or encourage a fresh paid attempt. Existing status/idempotency lookup remains available, but durable unknown-commit reconciliation is not implemented here.
- Batch items become done only after the evaluation record is confirmed. Automatic intake remains received/unscored with a warning when recording fails. A webhook enqueue failure after confirmed persistence does not turn an otherwise successful interactive/batch report into failure.

The record helper still permits absent canonical JSON for legacy/rescore callers. All three production full-report callers covered here pass the strict full-run result. Snapshot dimensions and canonical JSON remain separate writes; the snapshot helper confirms the affected row ID, not an immutable revision. Same-day share tokens still address mutable daily snapshots. Concurrent quota reservation, atomic debit/report/refund, retry recovery and immutable public links remain open.

## Schema and operational evidence

Read-only zero-row request to live evaluation_reports selected id/report_v2/idempotency_key: HTTP200. No migration required or applied. No old rows rewritten by the operator.

Origin4121 (`g30-origin-4121-79388776fc-56c09338f580.service`, SHA1c30818be) retired explicitly under shared deploy lock, outside active4124/warm4123. Plan fingerprint `b4e180acfce1f98e90de8e4cbc7a54c69020fd2942a0e9a6a527ad901ded7ae1`, observed trackedActivities0/unresolvedJobs0. Scoped unknown-work acknowledgement remains necessary; full quiescence not proven. Artifacts preserved, cap unchanged. Receipt `/tmp/g30-evaluation-origin-retire.log`.

## Deployment

Live23/09/2026 at12:53UTC. Compiled SHA `5339080e49b062e1bc719bb4bcdf6f5dc27af17f`, BUILD_ID `hPoZzFp9nMJ_GEDD4hot-`, active4125/warm4124. Production build/type compilation, candidate HTTP/static, local/public/auth checks and public compiled SHA identity succeeded. Startup errors0; previous release chunks3/3 available. GET `/api/intake` returned405. Unit `g30-origin-4125-d96832849a-6c1d1871ca84.service`.

Operational mark-good completed after the founder-authorized minimum soak, with extended review deferred. Additional suites/browser/rollback drill remain deferred and are not passes. Logs: `/tmp/g30-evaluation-save-deploy.log`, `/tmp/g30-evaluation-save-mark-good.log`. Follow-up source-only test expectation commits `c46fde6e4` and `6baeaea39` do not change the compiled application and were not executed.

## Next source priority: immutable public revisions

Current token consumers include `report-v2/load.ts`, both EN/VI `/tbr/[token]` pages, `/api/svi/report/pdf`, report peers/QA, view tracking and drip/notification token resolution. `svi_snapshots` is a daily projection shared with other writers. A token-only rotation or cloning just the canonical JSON would leave those readers inconsistent.

Next implementation must introduce a revision-aware reader bridge covering the complete rendered projection and access/consent/revocation behavior, deploy that compatible reader first, then add immutable revision persistence and switch all relevant writers with concurrency/unknown-commit handling. Historical tokens must keep their original content and authorization. Existing daily aggregates remain a separate mutable projection. No revision schema/writer has been activated by this slice.

G30 remains in progress. This release is not full finalization, financial atomicity, durable jobs or report-quality certification. SVI keeps its previous live release; this phase changes only BlockID evaluator callers.
