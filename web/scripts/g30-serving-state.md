# G30 retained-origin controller contract

`g30-serving-state.py` owns `web/content/reports/g30-serving-state.json`.
Do not hand-edit it or derive the origin from a PID file alone.

Schema version 1:

```json
{
  "version": 1,
  "phase": "stable",
  "active": {"port": 4100, "pid": 123, "startTicks": "456", "releasePath": "/data/releases/build-id", "sha": "40 hexadecimal characters", "schemaDigest": "64 hexadecimal characters"},
  "previous": null,
  "retained": [],
  "verifiedGood": [4001],
  "quarantined": [],
  "gatesPassedAt": {"4100": 1790050000}
}
```

The example omits retained entries for readability: actual valid state must
include `active` and any `previous` entry in `retained`. Ports are unique;
PID/start ticks and resolved process cwd identify the process. The exact PID
must own the listening socket. Origin `/api/status` SHA and trusted
`schema_migrations=ok` are required for verification. The trusted token is
read from inherited environment or only the two matching keys in `web/.env`;
no shell evaluation or secret output is used.

`schemaDigest` hashes the migration manifest files/deferred set. Initial
promotion also rejects source migration-file changes against the serving SHA.
This is a restricted same-schema release contract, not proof against external
DDL changes. Database changes require the later O09 compatibility workflow.

`phase=stable` means the persisted origin is routed and locally verified; it
does **not** mean the release has passed its soak. `verifiedGood` eligibility
is separate. A candidate enters it only after all release gates and a minimum
30-minute soak; the controller retains the previous verified baseline during
that interval. `--mark-good` additionally re-verifies process/origin/schema
and atomically updates `last-good-build.json` using the immutable entry SHA.
Independent public/quality checks remain the operator's release gate.

Read commands:

- `--web WEB --port`: bare active port; bootstrap 4001 only when state is absent.
  Malformed state or `phase=switching` fails with no port output.
- `--snapshot`: complete schema, including switching state; missing state fails.
- `--verify-active`: stable active entry after live identity/schema verification.
- `--verify-port --listen-port N`: verifies one retained process, even during recovery.
- `--rollback-target`: newest verified-good compatible warm entry, excluding
  quarantined origins. Normally excludes active; during interrupted switching
  the still-good active entry is a valid recovery target.

All mutations and allocation require the inherited exclusive deploy lock:
`--lock-fd 200`. Commands are `--init`, `--allocate`, `--register`, `--begin`,
`--activate --listen-port N`, `--quarantine --listen-port N`, `--gates-passed`,
`--mark-good`, and `--stable`. `--activate --rollback` clears previous-pointer
eligibility; failed origins remain retained and quarantined. `--stable` is
not a proxy reconciliation command and must never replace observed routing
verification. Consumers should use the canonical deploy controller for recovery.

Admission requires at least 1 GiB MemAvailable, fewer than five retained
processes, and a free loopback port from 4100–4199. A pinned unregistered
candidate blocks the next admission. No process is stopped to reclaim resources.
Pins are atomically extended before state publication. Existing pins are preserved.

Explicit retirement is available separately through
[`g30-origin-retire.py`](g30-origin-retire.md). It protects active/previous,
drains a single registered supervised target under the same lock, and retains
all artifacts. Current partial job coverage requires an explicit acknowledgement
of untracked work; deployment itself still never automatically stops origins.

Promotion freezes an independent runtime before launch, binds loopback, verifies
candidate and registers its identity, enters switching, changes both supported
nginx origin references, verifies public identity, then activates persisted state.
Every retained process remains running and pinned. Detached jobs make nginx
worker exit alone insufficient for automatic application retirement; complete
O08 durable-job coverage remains deferred.

On recovery, the controller verifies a warm target, reads actual nginx routing,
switches if necessary, and persists locally verified routing before checking
public identity. External probe failure remains `external_unverified`, never
success, while monitoring can continue against the truthful local origin.
An abandoned switching phase is reconciled under the same lock by watchdog's
warm-only controller request. It never falls back to a cold process restart.

Controller recovery environment guards:

- `G30_REQUIRE_WARM_ROLLBACK=1`: refuse absent/malformed G30 state; no legacy kill path.
- `G30_RECOVERY_EXPECTED_PORT=N`: checked after lock acquisition to reject stale requests.
- `G30_NO_NOTIFICATIONS=1`: preserves the caller's opt-out of deploy-script Telegram notices.

The proxy helper defaults to read-only planning. `--current-port` reports the
validated configured port. Apply uses `--apply --sudo --lock-fd 200`, verifying
an inherited lock or an owning ancestor when sudo closes inherited descriptors.
Only the canonical nginx site configuration and reserved origin ports are allowed.
It preserves symlink target ownership/mode, backs up, tests configuration,
reloads gracefully, and verifies a new worker generation. Its optional drain
result is HTTP-only and never authorizes detached-job termination.

## Accelerated phase capacity (22 September 2026)

Admission counts live or unknown retained processes. An inactive, non-previous,
quarantined entry whose Linux PID directory is absent does not consume a live
process slot. Its state, port reservation and release pin remain intact.
Unreadable procfs and reused PIDs remain counted. This is not job retirement;
live process drain and full O08 completion remain open.
