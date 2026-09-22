# Explicit receipt-stage disposition — source only

The inspected receipt-stage marker deliberately blocks ordinary allocation even after promotion. The new `dispose` command removes only that marker after proving that its exact candidate is the current stable verified-good origin with a distinct retained verified-good healthy warm rollback, and that both directions of the actual sealed financial edge remain valid. It does not unpause purchases, apply SQL, enroll releases, mark good, stop processes or alter routing. The financial transition record, release/static/dependency artifacts and recovery pins remain untouched.

The caller must hold the existing canonical deployment lock and supply the SHA256 of the exact inspected stage bytes reviewed for disposition. No hash is inferred as permission. Partial/failed/unsealed stages, changed candidate PID/start/manifest identity, missing or quarantined/non-good warm origins, unhealthy endpoints and missing stages without a prior archive audit are refused. Canonical stage symlinks and aliased parent directories are refused. Installed canonical/isolated tooling parity now includes the disposition module.

Example after sealed promotion, successful rollback/forward and mark-good (placeholder values require an operator's reviewed exact inputs):

```sh
python3 "$reviewed_source_web/scripts/g30-receipt-candidate.py" dispose \
  --source-web "$reviewed_source_web" \
  --control-web /home/dovanlong/blockid.au/web \
  --expected-stage-sha256 "$reviewed_exact_stage_sha256" \
  --lock-fd 200
```

FD200 must already hold `/tmp/blockid-deploy.lock`; do not remove/recreate its inode. A read-only `sha256sum` of `web/content/reports/g30-receipt-candidate.json` can identify bytes for review, but the command never auto-clears the marker merely because promotion succeeded. This is deliberately limited to the stage's original promoted candidate; if another process has since become active, stop for a separately reviewed disposition.

The tool archives exact stage bytes as0600 `stage.json` beneath the existing owner-private runtime root's `receipt-stage-dispositions/<stage-sha256>/`, outside the web tree. A prepared audit pins candidate, warm, sealed-transition fingerprint and canonical marker path. Atomic Linux `renameat2(RENAME_NOREPLACE)` publication and directory fsync prevent partial or overwritten archive records. After archive verification and fresh live-edge revalidation, the marker's bytes and inode/size/timestamps must still match; only then is that marker unlinked and its parent fsynced. A separate durable completion receipt records disposition. Normal allocator behavior resumes through the absence of this one marker; no allocation bypass is added.

Replay with the same reviewed hash recovers a crash after archive publication, after the prepared audit but before unlink, or after unlink but before the completion receipt. It must still pass the same current live-state checks. A missing marker without the prior matching prepared audit is an error; conflicting archives/audits/completions are never overwritten. No live stage was created or disposed while implementing this source.

Validation:15 focused filesystem/state tests cover successful archival/replay, missing hash/lock, stale bytes/inodes, marker/archive symlinks, partial stages, wrong candidate, not-good/quarantined/missing warm, health/actual-edge refusal, conflicting receipts and each archive/unlink crash window. Existing20 candidate tests also pass. These tests use temporary files and mocked operational health; they do not exercise production SQL or live disposition.
