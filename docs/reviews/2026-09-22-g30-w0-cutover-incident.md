# G30 W0 cutover and recovery — 22 September 2026

**Disposition: candidate failed its soak; production restored to the verified v3.28.2 origin. W0 rollout is not complete.**

## Release and evidence

Candidate commit `1bcd6c8448e6eb63430cae4810e158779c9c4271`, version v3.29.0, immutable release `/data/releases/wzd_ZPSfbF75DAvVakPAF`, process 408501 on port 4100. The controlled deploy passed all 12 gates: secret scan, environment/dependency checks, TypeScript, ESLint (warnings remain), 41,757 unit tests (2 skipped), production build, 12 pre-promotion browser tests, 532-page/1,097-link check and 140 post-promotion browser tests (2 skipped). Gate completion was 06:46:39 UTC. These checks did not prove process survival after the launcher returned.

The prior origin, process 4147939 on port 4001, stayed running throughout. Its immutable identity is commit `3396adc00e78144ec86788db3fb03edf51abb1bc`, release `/data/releases/_XKtVSGWVG0gVr9TtMpey`.

## Incident and recovery

- 06:47:05: public status probe returned HTTP200 with candidate SHA.
- 06:47:35 and 06:48:05: public probes returned HTTP502. A real browser also observed homepage502 at06:47:47.
- Direct checks confirmed port4100 refused connections and candidate PID no longer existed; port4001 remained healthy.
- 06:48:27: root invoked the serialized warm-only rollback with expected active port4100 and deployment notifications disabled.
- 06:48:35: public probe returned HTTP200 with the prior SHA. The controller verified old process/cwd/socket/schema identity, restored stable state to4001 and quarantined4100. No cold restart was needed.

The 30-second sampling interval bounds detection; it does not establish an exact outage duration. Do not claim zero downtime or successful soak. Candidate metadata remains retained/quarantined and cannot be selected as known-good. No off-host backup was provisioned, per the founder's deferral.

## Process lifetime finding

The script launched the candidate using `nohup node server.js ... &`. No success-path kill or cleanup of that PID was found, and inspected kernel logs contained no OOM kill. Candidate logs had no fatal/shutdown record. Executor cleanup of an unsupervised descendant is the leading explanation; the original signal sender was not captured.

A disposable root probe reproduced the lifetime boundary: a `nohup sleep90` child disappeared immediately after its tool command completed, while an equivalent system-manager transient service remained active. This supports moving candidate ownership out of the launching tool process. Systemd257 is available; the user manager has linger disabled, so a system service running as the application user is the intended boundary.

Before another candidate promotion: implement service-owned launch, capture MainPID and exit/signal diagnostics, protect environment values from command arguments/logs, verify survival after launcher exit, preserve retained processes and detached work, then repeat release gates and the full soak. Service restart must not duplicate unfinished jobs; durable job/retirement work remains O08.

## Separate status-reporting defect

Candidate `/api/healthz` correctly reported v3.29.0 and its SHA, but `/api/status` reported the old version because its internal health probe hardcoded port4001. Its SHA came from its own manifest and remained correct after the pre-cutover stamp. The fix must probe the current process's validated port, not the globally active origin, so pre-promotion candidates can verify themselves.

The initial old SHA observed during temporary smoke preceded the script's manifest-copy step. Registration and cutover occurred only after stamping and identity verification; this was not an identity-gate bypass.

## Artifacts

Local investigation artifacts: `/tmp/g30-w0-attempt3-vitest.json`, `/tmp/g30-w0-attempt3-vitest.log`, `/tmp/g30-release-public-curl-health-extended.jsonl`, `/tmp/blockid-production-new.log`, and the controller's serving-state/deploy logs. These paths are evidence locations, not additional implementation plans. No report-quality, sale-ready or 24/7 availability certification follows from this release attempt.

## Repair validation before controlled retry

The candidate launcher now uses a system transient service running as the application user, with private environment/log/locator files outside the repository, no automatic restart, and retained normal/failure exit diagnostics. Ten mocked supervisor cases, eight promotion regressions and nine manual rollback regressions passed. A real synthetic Node fixture launched through the helper survived completion of the entire tool command with the same MainPID, PID1 parent, independent system cgroup and application UID. Literal environment values round-tripped correctly. After its natural exit, exit status remained inspectable. Only that synthetic unit was stopped and its synthetic private files removed; no production origin was stopped. Evidence: `/tmp/g30-supervisor-live-fixture-evidence.json`, `/tmp/g30-supervisor-integrated-shell-tests.log`, `/tmp/g30-supervisor-rollback-regression.log`.

This proves the host supervisor boundary, not production health or soak. The next candidate must repeat every canonical release gate and remain healthy after the full deployment tool exits, then complete the 30-minute soak. Transient units do not survive reboot; O09 remains open. O08 durable job ownership and safe retirement remain open.

The current-process status fix passed 116 targeted tests. Legacy writer admission now defers five scheduled mutation/maintenance endpoints while G30 owns execution; the source cron wrapper is effective immediately and API guards await deployment. Their combined regression checks passed 57 cases plus two Python cron matrices. Existing independent uptime watchers continue; paused maintenance endpoints leave a documented measurement/maintenance gap. These guards do not establish that previously admitted work has finished.

## Bounded request-impact assessment

For [06:44:00,06:50:00)UTC, nginx recorded 1,329 requests and 10 GET502 responses. No report-generation, payment or Stripe-webhook POSTs were identified in this interval. Nine POSTs were experiment exposure (four200), pricing telemetry (four202) and funding preview (one200). Eight payment-related GETs returned200. Nginx lacks upstream release identity, so these totals cannot be attributed exclusively to the candidate.

Internal cron bypasses nginx: the report-email sweep recorded sent0/failed0; Stripe reconciliation scanned27 records over its48-hour window with missed0; one report-order-drain call recorded an error without usable affected-job counts. All seven attempted read-only database count queries failed. Therefore database impact, affected jobs and data loss remain UNKNOWN; request logs alone cannot rule them out. No retries, refunds, data mutations or human notifications were performed during this assessment.

## Follow-up database impact evidence

The initial seven database-query failures were caused by the audit process selecting an unresolved `.env.runtime` hostname (ENOTFOUND), not evidence of a production database outage. After selecting the verified active process configuration, all14 count-only queries returnedHTTP200 and count0: report analyses/jobs/orders, credit transactions, Stripe events, queue activity in the interval, jobs completing across the interval, and current queued/running work. Current backlog is a query-time observation, not a historical snapshot. The drain failure at06:48:01 was curl exit7 after17ms: connection could not be established; no evidence shows the worker started. No recorded report/payment impact was found within the inspected scope, but this does not prove the absence of every form of data loss. Sanitized [aggregate evidence](2026-09-22-g30-w0-incident-impact-aggregates.json). No jobs, balances or payments were changed.
