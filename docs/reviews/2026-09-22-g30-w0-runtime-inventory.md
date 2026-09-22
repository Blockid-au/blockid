# G30 W0 — runtime inventory, 2026-09-22

Read-only inspection before implementation. No deploy, rollback, cleanup, cron changes, DB writes, notifications or paid calls executed by this inventory. Values below are point-in-time evidence, not continuous-uptime certification.

## Production and recovery identity

- Origin and public `/api/status`: HTTP 200, v3.28.2, SHA `3396adc00e78144ec86788db3fb03edf51abb1bc`.
- Production PID 4147939, port 4001, cwd `/data/releases/_XKtVSGWVG0gVr9TtMpey`; `.next-current` agrees. Last-good record: 2026-09-22 04:56:40 UTC, 12/12 gates.
- `.next-previous`: `/data/releases/fw_KWMj5YJF-5tQ8bfQVK`, v3.28.1, SHA `83c6a55d381d390719667a7b96564472ba2bfc74`. Both releases contain server.js, assets and `.env`; no secret values inspected or reproduced.
- Both release trees contain **867 external dependency symlinks into mutable `web/node_modules`**. Existing release-directory immutability is incomplete. Freeze the fallback's dependencies as well as future candidate dependencies before relying on rollback across package changes.
- Nginx host master PID 4156680 matches `/run/nginx.pid` and owns ports 80/443. Other nginx processes exist; do not target processes by name. `sudo -n nginx -t` passes; passwordless sudo available.
- `/etc/nginx/sites-available/blockid-live`: named upstream `blockid_app` points at 127.0.0.1:4001 and serves apex/www. `upload.blockid.au /api/` separately points at literal 4001. Update both atomically when bridging; preserve other hosts including startupvalueindex.com, staging, chain and explorer.
- AI/stream upstream read/send timeouts are 310s; upload read timeout 300s. Proxy reload does not finish existing requests. No explicit worker-shutdown timeout found in inspected host/site files.

## Automation and ownership

Active user cron: watchdog every 2 minutes; guardian every 2 minutes; external uptime watcher every minute; git-sync deploy 18:00 UTC daily; self-upgrade 18:30 UTC daily; generic server cleanup every 4 hours; weekly disk cleanup Sunday 03:30 UTC. Agent-upgrade HTTP job daily 17:00 also exists; route behavior is outside this inventory's source assessment. Webhook-dispatch is an application webhook job, not evidence of a deploy hook.

At inventory baseline, watchdog only checked deployment lock transiently and could restart a dead PID during deployment. External uptime watcher directly killed/restarted origin after three external failures and requested rollback at five even if origin was healthy. Guardian also requested rollback after local failures. All recovery actions must serialize on the same lease and re-read PID, release and health after acquiring it; alert subprocesses and long-running server children must close inherited lease descriptors.

Self-upgrade has `git reset --hard` on failure/dry-run and reads old project-state task priorities. Its initial lock probe does not reserve the workspace throughout implementation. Coordinate or inhibit this writer during G30 work; a deploy-only lock is insufficient. Git-sync currently tests lock-file existence, meaning a persistent unlocked file can indefinitely suppress it. Do not remove the lock file to work around this: that creates separate lock inodes and races.

## Backup and host availability

- Latest local backup 2026-09-22 02:20:11 UTC: successful, 25,487,351 bytes. This inventory independently verified its SHA256 sidecar against the archive.
- Latest recorded restore drill 2026-09-20 03:45:18 UTC: successful, dump age 1.4h. This is historical drill evidence; no new restore performed.
- Latest offsite attempt 2026-09-22 02:40:06 UTC: **failed**, service account has no Drive quota. Existing runbook offers user OAuth, a Shared Drive, or domain delegation. Requires an authorized usable destination/account; no working offsite recovery is established by local backup success.
- Scheduled local backup daily 02:20, offsite 02:40, restore drill Sunday 03:45. Script comments contain stale schedule differences; actual crontab is the schedule evidence.
- Approximately 37GB RAM available, no swap; root disk 176GB free (34% used). `/data` is separate `/dev/sdb`, 258GB free (8% used). Guardian currently samples `/`, although releases and backups are on `/data`.
- One host remains a failure domain. No second-host traffic failover or independently restorable offsite bundle was demonstrated. “24/24” is an operational objective, not a proven guarantee.

## Safest incremental cutover

Keep public production port 4001 as the compatibility contract initially. Warm and validate the candidate on loopback 4099; preserve old assets needed by open browser sessions. Under one deployment lease, validate an atomic nginx config changing the named upstream and upload API to 4099, reload the correct host nginx, verify public/origin identity and application health, then drain the old nginx workers and active 4001 requests **before** stopping the old origin. Restart the same verified candidate at 4001, validate, switch proxy back, and drain 4099 before ending the temporary process. If draining exceeds budget, keep healthy processes alive and abort/revert traffic; do not achieve a nominal deadline by terminating active reports. A fixed sleep is not proof of completed streams.

Protect current, previous, candidate, draining and eligible last-good releases from every cleanup path. Commit a recoverable transition state before mutations; every failure path must keep at least one verified origin reachable. LKG promotion requires HTTP identity, assets, required dependencies and compatibility checks, not just a process ID or completed shell command. Shared data migrations need expand/contract compatibility; binary rollback cannot safely undo arbitrary writes.

A permanent alternating-port design would avoid the second restart but requires changing all hardcoded callers, watchdogs, guardian probes, PID/state consumers and proxy paths together. Do not introduce it as a partial migration.

## Independent review of W0 recovery changes

Reviewed root's edits to `watchdog.sh`, `uptime-watcher.sh`, and `server-cleanup.sh`. The watchdog now holds the deployment lease over recovery, including dead-PID recovery, and re-probes after acquisition. Server and alert background launches close descriptor 201. The external watcher delegates restart to the origin watchdog, and suppresses rollback when origin HTTP is healthy. Generic cleanup no longer deletes `.next-*` builds by age.

`python3 scripts/cron/g30-recovery-coordination.test.py`: **7 isolated tests passed**. Executed only the watchdog's admission prefix with temporary paths and mocked HTTP, plus the isolated watcher decision branch; no production restart, cleanup, message or network request was executed. Tests cover healthy-origin suppression, held-lease suppression with dead PID, health recovery between initial probe and acquired lease, admission of persistent failure, and external-only failure suppression. Background descriptor closure and build-cleanup protection are source assertions, not live process-lifetime drills.

Limits: origin HTTP 200 is weaker than full application correctness/identity; rollback dispatch is an attempt, not confirmed recovery. Crash-mid-cutover, stream drainage, actual process restart, dependency isolation, host loss and offsite restore still require later gates. W0 changes do not fully close O07/O09 or prove 24/24 availability.
