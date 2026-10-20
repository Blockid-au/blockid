# G30 boot path (L1-4)

Before 20 October 2026 a host reboot was an outage: every origin is a transient
`g30-origin-<port>-….service` (`Restart=no`, unit file in `/run`), nothing
started the serving release at boot, and the watchdog only performs *warm*
rollback to an origin that is already running.

`blockid-boot-serve.service` (`scripts/ops/systemd/`) runs
`web/scripts/g30-boot-serve.sh` once per boot, after docker (Supabase/Redis)
and nginx:

1. takes `/tmp/blockid-deploy.lock` (waits up to 900 s for a running deploy);
2. loads `web/.env` with the same `load_env` deploy-live.sh uses
   (`lib/load-env.sh`);
3. `g30-boot-serve.py --apply --lock-fd 200`:
   * **no-op** when the recorded active process is alive, verifies
     (`verify_entry`) and nginx routes to it;
   * **refuses** when the active process is alive but unverified, or live with
     a routing/phase mismatch — that is the watchdog's warm-recovery case and a
     second copy is never started;
   * otherwise (recorded PID provably gone — the reboot case): waits for
     :8000/:6379, quarantines dead retained origins other than active,
     previous and the fallback target (the documented dead-slot rule, so the
     launcher's capacity admission is not blocked by pre-reboot ghosts; pins
     and history are kept), starts the active release on its recorded port via
     `g30-supervised-launch.py` (frozen `.g30-runtime/<fp>/node_modules` as
     `NODE_PATH`, runtime policy flags from the previous unit's metadata), then
     `g30-serving-state.py --rebind` once it answers; reconciles nginx (and an
     interrupted `switching` phase) under the lock; checks public identity
     (non-fatal, `external_unverified`);
   * if the active release cannot be verified within `--health-timeout`
     (240 s), cold-starts + rebinds the previous release (else the newest
     eligible verified-good origin) and exits 10;
4. on exit 10 releases the lock and runs the canonical warm rollback,
   `G30_REQUIRE_WARM_ROLLBACK=1 G30_RECOVERY_EXPECTED_PORT=<active> deploy-live.sh --rollback --wait`
   (quarantines the failed origin, switches nginx, syncs aliases, verifies public);
5. re-checks `--verify-active` and the nginx upstream; exit 0 only when serving
   is verified, otherwise logs `ESCALATE`.

Log: `/data/logs/blockid-boot-serve.log` plus the unit journal. Plan without
changing anything: `bash web/scripts/g30-boot-serve.sh --dry-run`.

Why not `systemctl enable` the existing `g30-origin-*` units: they are
transient (`UnitFileState=transient`, fragment under `/run/systemd/transient`),
which `systemctl enable` refuses and which do not exist after reboot. Even
persisted, they would start without the deploy lock, every retained origin
would boot (RAM), the serving state would keep the pre-reboot PID/startTicks so
`--verify-active`, cron-runner admission and the watchdog would treat the
healthy origin as an identity failure, and every deploy/retirement would have to
keep enablement in sync. Re-launching through the deploy's own launcher and
rebinding the identity keeps one authority (`g30-serving-state.json`).

After a reboot only the active origin runs: there is no warm rollback target
until the next deploy (the previous entry stays recorded but dead).
`startupvalueindex.service` (port 4002) is a regular enabled unit with
`Restart=always` and already starts at boot.

Tests: `python3 web/scripts/g30-boot-serve.test.py` (all host effects mocked,
including an isolated run of the real wrapper against fake helpers).
