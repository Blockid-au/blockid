# G30 supervised origins

The 22 September 2026 incident reproduced this lifecycle boundary: an executor-launched `nohup sleep` disappeared when the parent tool completed, while a system transient service survived. The signal sender was not captured. A successful HTTP smoke inside the launching tool is therefore insufficient proof of process lifetime.

`g30-supervised-launch.py` moves each new origin to the system manager (PID 1) in its own `/system.slice/g30-origin-*.service` cgroup. It runs as the calling application user, never root and never a `--user` unit (user linger is disabled). Requirements: systemd supporting `Type=exec` and `ExitType=cgroup`, and authorized noninteractive sudo for systemd-run/systemctl. Dry-run is the default; `--apply --lock-fd 200` requires the existing deployment lease.

The deploy controller now:

1. Runs an independent disposable system-service probe before the expensive build. It exits naturally after ten seconds, bounded by RuntimeMaxSec=15.
2. Freezes the release and loads the existing application environment as before.
3. Calls the helper to launch the candidate; no environment values are placed in command arguments. Only names from trusted `web/.env` are copied from the caller's already-exported environment, plus explicit PORT/HOSTNAME/NODE_ENV/NODE_PATH/PATH/NODE_OPTIONS runtime settings and the SUPABASE_URL/REDIS_URL origins forced by load_env.
4. Waits for systemd-run to exit and verifies stable MainPID/start ticks, PID 1 parentage, matching service cgroup and immutable working directory. The controller invokes a fresh helper check after the launcher helper returns, then again before cutover.
5. Keeps the existing exact PID/start/cwd/listener/SHA/schema and public gates. Supervisor survival alone does not prove application health.

Production units omit `--collect`, use `CollectMode=inactive` and `RemainAfterExit=yes` so failed and unexpected normal exits remain inspectable. An exited service still fails MainPID and HTTP verification; active unit status alone is not health. Only the disposable probe uses `--collect`.

`Restart=no` is deliberate: a crash must trigger verified warm rollback, not an automatic second job runner. `ExitType=cgroup` leaves the service around while descendant work exists. Neither helper nor rollback stops retained services. Explicit scoped retirement is handled separately by [g30-origin-retire.py](g30-origin-retire.md); full job quiescence remains an O08 dependency.

Private artifacts are under the application account's `~/.local/state/blockid-runtime/` (0700), resolved from the account database rather than inherited `HOME`. Each unit has an exclusive 0600 EnvironmentFile, log file, and JSON unit locator written BEFORE systemd-run. The locator records the unit, release, port and artifact paths without environment values, including if launch is interrupted before returning. The CLI only returns paths, unit name, PID/start ticks and cgroup. Files remain for retained processes; do not delete or rotate them during this phase. Artifacts survive temporary-file housekeeping, but transient units do not survive reboot. Existing reboot recovery remains a separate operational gate.

The controller records `.g30-candidate-unit` for diagnostics. `g30-serving-state.json` remains authoritative for origin identity and rollback eligibility. Supervisor units do not replace state pins, quiescence, backup or compatibility requirements.

Before live promotion, the root operator must run the helper on a disposable fixture, finish the launching tool, then independently confirm the unit's PID/cgroup and HTTP identity remain valid. Tests here mock every supervisor command; they do not prove host systemd behavior or secret-file parsing on the host. No test sends signals or contacts production.

On command failure, inspect the named unit and private log locally; the helper intentionally omits raw supervisor stderr because EnvironmentFile diagnostics may echo secrets. Failed launches leave artifacts/processes retained and block admission through the existing candidate pin; do not retry by deleting the pin or killing a port owner.

## Receipt policy flags

New launches explicitly carry `G30_CREDIT_RECEIPTS` and
`G30_CREDIT_PURCHASES_PAUSED`, even when their names are absent from `.env`.
Only exact string `0` or `1` is accepted; absent flags are serialized as `0`.
No other caller environment names gain implicit forwarding. The existing deploy
loader still establishes the environment before this helper; if `.env` already
contains either name, inspect its effective value rather than assuming an
outer-shell export wins that loader.

The private unit metadata records these two nonsecret values as `runtimePolicy`.
Both post-launch process checks compare `/proc/PID/environ` to that pinned
intent and recheck process start ticks. Subsequent `--check` reads the private
metadata and enforces the same values. Historical units without this snapshot
retain legacy checks and are not retroactively attested as receipt-compatible.
The status endpoint's actual runtime flags/capabilities must independently agree
before a paused financial transition is prepared. This helper patch does not
change any running process flags or authorize financial migration/activation.
