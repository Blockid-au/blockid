# O08: explicit origin retirement

`g30-origin-retire.py` retires one **registered, supervised** origin. It defaults
to a read-only plan. It does not select victims, run from deploy, raise the cap,
issue resource permits, change routing, or delete releases. Existing cap and
memory/PSI admission checks still apply after retirement.

## Plan and apply

Read the target identity from `g30-serving-state.py --web WEB --snapshot`.
The exact service name is in `/proc/PID/cgroup` and the supervisor's private
launch metadata under `~/.local/state/blockid-runtime/`. Do not infer it from
the port alone. Use the canonical control web directory, not a build checkout.

```bash
python3 web/scripts/g30-origin-retire.py \
  --web /home/dovanlong/blockid.au/web --port TARGET_PORT --unit EXACT_UNIT
```

The plan contains `expect`, a SHA256 fingerprint of the complete retained
entry (including release SHA, PID/start ticks, path and schema digest) and unit.
For a live origin it checks process/cgroup/socket ownership and authenticated
registry identity. It also checks current/warm health, schema compatibility,
and the canonical web/upload nginx configuration. Plan output is a snapshot;
apply rechecks under the shared deployment lock.

After reviewing that exact target and any direct consumers/external work:

```bash
(
  flock -x 200
  python3 web/scripts/g30-origin-retire.py \
    --web /home/dovanlong/blockid.au/web --port TARGET_PORT --unit EXACT_UNIT \
    --apply --lock-fd 200 --expect FINGERPRINT_FROM_PLAN \
    --reason 'Reviewed exact origin and its dependent work' \
    --acknowledge-untracked-work --timeout 60
) 200>/tmp/blockid-deploy.lock
```

`--acknowledge-untracked-work` is an explicit operational decision for this
identity, not proof of job completion. Current v1 registries always report
`retirementEligible: false`: HTTP and selected jobs are tracked, but other
detached work, database effects and external consumers are not fully covered.
The tool refuses without this acknowledgement unless the registry explicitly
proves retirement eligibility. Never put this flag into unattended deploys.
The reason is persisted in canonical state; do not include secrets/customer data.

## Contract and recovery

- Active and previous origins cannot be retired. A healthy, verified-good,
  compatible previous origin is required; current may still be soaking.
- References in unfinished receipt/schema stages block retirement. Sealed
  transition records and all release artifacts remain intact.
- The tool durably quarantines the target and writes `originRetirements` before
  drain. It waits for zero tracked activities and unresolved jobs, with reliable
  persistence and admission closed. A timeout leaves it quarantined/draining.
- Only SIGTERM is sent, through a Linux pidfd after rechecking identity and
  drain evidence. A populated descendant cgroup blocks retirement even with
  the acknowledgement. There is no SIGKILL escalation.
- Only after the PID disappears and its entire service cgroup is empty does
  the tool stop the empty transient unit and check supervisor status. A reused
  PID is conservatively treated as present. Current/warm health is checked again.
- A dead registered origin can be quarantined to release its counted slot,
  after confirming the unit/group is empty. Its missing registry remains an
  explicit unknown; the acknowledgement is still required.
- Retry the **same apply command/fingerprint** after interruption. A durable
  `signal_requested` record allows completion when the target has exited;
  collected transient units are accepted only with confirmed not-found/inactive
  supervisor state. Missing processes alone never prove jobs completed.
- Retained entries, release pins, manifests, dependencies, logs and schema
  records are preserved. The existing capacity counter excludes missing,
  quarantined, unprotected PIDs. The tool does not promise memory PSI will drop
  immediately or bypass a fresh admission check/permit.

Legacy unsupervised origins, unregistered launches, and live origins without a
working drain registry remain outside this helper. Inspect them separately;
the tool never substitutes an empty socket count for job ownership evidence.
It also does not prove that arbitrary external consumers no longer use a
private origin: review those dependencies before accepting untracked risk.

Validation (isolated fixtures; no production process is stopped):

```bash
python3 web/scripts/g30-origin-retire.test.py
python3 web/scripts/g30-serving-state.test.py
python3 web/scripts/g30-supervised-launch.test.py
```
