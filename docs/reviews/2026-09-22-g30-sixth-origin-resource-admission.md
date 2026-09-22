# O08 bounded sixth-origin admission proposal and executable source

Default remains OFF. No permit file, production cap/state change, process signal, SQL or deployment occurred. The existing five-origin guard remains authoritative unless a release-owner-created exact permit passes every check. This is resource admission for one additional instrumented origin, not legacy job retirement or O08 completion.

## Observed host resources

Bounded read-only sample:26,411,511,808 bytes MemAvailable (~24.6GiB),8 effective CPUs,5min load0.927, memory/CPU PSIavg10 both0; /data253,127,905,280 bytes available, /tmp14,255,489,024 bytes available. No active permit exists. Prior per-origin RSS sample:4001~759MiB,4101~661MiB,4102~651MiB,4103~467MiB,4104~489MiB; all five live origins remain counted regardless of quarantine or whether they serve traffic. Host-wide available memory includes their current consumption; no subtraction of “legacy” processes creates artificial headroom.

The stage-corrected pre-build budget is **18GiB**: 8GiB operating reserve + max(10GiB aggregate build allowance, 6GiB new candidate ceiling). The compiler and new candidate launch are sequential in the canonical deployment, so adding both allocations would double-count their peak. The build explicitly permits an8GiB single Node heap and may overlap worker/native allocations; the earlier6GiB allowance was insufficient and is not used. An otherwise-approved permit may legitimately refuse a later check as host load changes; this historical sample does not authorize another deployment. This sample is not a future capacity guarantee or a measured build-peak claim.

After the canonical build is complete, launch and registration recheck14GiB (6candidate+8operating) plus CPU/pressure/disk conditions. The canonical `--allocate` occurs before build; systemd launch occurs after build/freeze. Direct low-level launches outside that sequence must not treat a still-running build as complete.

## Concrete admission and enforcement

`g30-resource-admission.py` validates an optional `<application-owner-home>/.local/state/blockid-runtime/g30-resource-admission.json` (outside Git):

- exact candidate40-character commit SHA;
- exact digest of active entry, all retained entries and quarantine list;
- enabled=true, version1, maximum live origins exactly6;
- issued/expires timestamps, at most2h lifetime;
- exactly5 currently counted origins; a sixth already-live/unknown origin prevents further allowance;
- minimum memory above, effective CPU>=4, load5<=half CPUs, CPU PSIavg10<=10%, memory PSIavg10<=0.1%; release-volume free>=16GiB and /tmp free>=6GiB.

No policy or any invalid/expired/mismatched policy fails closed. Checks execute before allocation, again before launch and again before registration. PID/port/schema/rollback checks remain separate and unchanged. A failed/unregistered candidate remains pinned and prevents another admission through the existing candidate alias guard.

The extra candidate systemd unit receives MemoryHigh4G, MemoryMax6G, MemorySwapMax0, CPUQuota200%, TasksMax128. Registration verifies actual unit cgroup memory/CPU enforcement and authenticated runtime SHA plus an installed healthy/non-draining activity registry. Launch metadata and serving-state resourceAdmission retain policy digest, sampled resources and limits. Existing origins receive no new limit and are not stopped. The candidate's6GiB ceiling bounds that unit; it is not a guarantee that every application workload fits, and a failed candidate must retain normal verified rollback protection.

Readonly inspection:

```
python3 scripts/g30-resource-admission.py --web /home/dovanlong/blockid.au/web
```

Permit shape (example only; NOT installed or authorized by this document):

```
{
  "version": 1,
  "enabled": false,
  "max_live_origins": 6,
  "candidate_sha": "<exact final source commit>",
  "retained_digest": "<g30-resource-admission.retained_digest(current serving state)>",
  "issued_at": 0,
  "expires_at": 0
}
```

Root must generate exact values under the existing deployment lock after choosing the final candidate. A source commit, retained-set change, expiry or second extra-origin attempt invalidates the permit; there is no generic environment variable increasing MAX_RETAINED and no automatic renewal. This enables ONE instrumented rollout while preserving all unknown legacy work. It does not establish a repeatable unlimited deployment strategy.

## Replacing instrumented origins / exact remaining work

After the sixth origin is deployed, complete the registry's full detached-task, subprocess and durable-job ownership coverage and validate actual Next drain behavior. A future retirement controller must prove admission closed, all owned work settled/checkpointed and ambiguous effects reconciled before stopping that instrumented origin or releasing a live slot. Until that proof exists, both instrumented and legacy origins consume capacity; this permit cannot authorize a seventh. Do not convert trackedWorkDrained into retirement eligibility merely to keep deploying. Preserve legacy artifacts/PIDs/pins; unknown legacy work is not cancelled.

## Oldest-origin jobs and financial time bounds

Actual Stripe reconciliation source computes `since = now - STRIPE_RECONCILE_LOOKBACK_HOURS` (default48h) on **each invocation**, requests sessions `created >= since`, and caps pagination at500 sessions. This is a purchase-session creation window, not an origin-age cutoff, not payment-completion time, and not an upper duration for already-admitted handlers. A live old origin invoked now can see new paid sessions regardless of its boot date. Older-than-window or paginated-out sessions are not thereby proven fulfilled. Signed webhook delivery is a separate entrypoint and does not use this creation cutoff. Founding50's fixed promo cutoff only applies to that plan, not generic credit packs.

The report worker selects the oldest queued row by enqueued_at and updates started_at/status; inspected schema/caller has no originating PID/startTicks ownership and no creation-age cutoff that proves an old process cannot hold a report. AI stage budgets bound selected dispatches but are not evidence that all detached database/email/provider work has settled. Therefore the financial expansion rule excluding incompatible live writers remains necessary after a sixth slot: more memory does not make an old unkeyed credit grant compatible.

## Evidence

6 targeted admission tests passed (expiry/SHA/set mismatch, seventh-origin refusal, memory/pressure/disk refusal, post-build reserve and systemd cap configuration);14 serving-state tests and10 supervised-launch tests passed. These are mocked checks, not a live sixth-origin test. Real resource sampling was read-only. No operational enablement is claimed.

Runtime confirmation of financial lookback (read-only, PID/startTicks verified):4001 started2026-09-22T04:55:25.78Z,4101 at08:13:10.11Z,4102 at09:27:05.95Z. None configured STRIPE_RECONCILE_LOOKBACK_HOURS; each retained commit's actual source uses default48h, recomputed from invocation Date.now with session created>=since. These start times do not constrain what an old origin could reconcile later. No DB query, Stripe request, job replay or financial mutation was performed for this observation.

Canonical pre-build ordering was verified: deploy-live.sh invokes g30_state --allocate before TypeScript and npm build. Therefore the 18GiB check precedes expensive work; it is not merely a post-build justification. The14GiB launch/register stage applies only after the canonical build/freeze boundary.


Private permit correction: the file resides in the supervisor's existing application-owner runtime directory, resolved through pwd/getuid rather than inherited HOME. Admission opens the directory and file with O_NOFOLLOW, checks directory0700, regular file0600, matching UID and single link, then reads the same checked file descriptor. No permit file or directory is created by inspection. The policy is never tracked/committed: issuing it cannot dirty the checkout or change the candidate SHA. Metadata labels this an operator/release-owner resource decision; it does not claim a separate founder-specific approval. Root/operator creates or atomically replaces the private permit under its existing operational authority.

Private-permit validation:12 targeted tests now pass, including outside-repository account-home resolution,0600/0700 modes, owner mismatch, file/directory symlinks and hardlinks;14 controller and10 supervisor regressions still pass. Only temporary test fixtures were written. No live permit was created or edited.


## Sequential stage correction (source d3ab8bb03)

`deploy-live.sh` synchronously captures `BUILD_OUTPUT=$(npm run build 2>&1)` and checks its exit code before freeze and `SUPERVISED=$(python3 ...g30-supervised-launch.py...)`. Package build is `NODE_OPTIONS=--max-old-space-size=8192 next build --webpack`. Installed Next webpack-build awaits `worker.end()` after compiler results; build also awaits its shutdown promise. No candidate server is launched concurrently with that compiler on this normal path. The early supervisor probe is only a bounded sleep process, not a candidate allocation. Existing retained origins stay live and already consume host MemAvailable.

Thus prebuild admission reserves 8 + max(10, 6) =18GiB; postbuild launch and registration still independently require 8 +6 =14GiB and retain the enforced 6GiB/2CPU candidate caps. No operating reserve, worker allowance, count limit, permit binding/expiry, disk or pressure gate is reduced. The normal failure path does not launch a candidate after a failed build. A surviving unrelated/orphan process consumes measured available memory at the fresh launch check; this does not claim process quiescence or authorize cleanup. If deployment changes to overlap compiler and candidate, the sum budget must be restored or overlap explicitly accounted for. Source-order regression guards the current sequential path.
