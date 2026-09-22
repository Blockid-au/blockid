# Exact receipt candidate staging (source-only preparation)

This workflow builds and inspects a private candidate before scheduling the purchase pause. It does not apply migrations, route public traffic, mark a release good, enable receipt creation or start research jobs. Do not use ordinary deployment for the three-file schema expansion; its independent 0447 migration gate is unchanged.

## Reviewed source

Candidate worktree starts at `6009f5da1`. Only the following financial SQL and the two receipt/checkout PostgreSQL fixtures are copied from draft `4776ac3392b0adcfb61539875b2c011de10c1805`:

| File | SHA-256 |
|---|---|
| 0443_credit_operation_receipts.sql | 002a1b403b4539c9120098413f90ef8bed90330d44d5c5841785a7dbc5a92ad7 |
| 0444_credit_checkout_fulfillment.sql | e830e6202f7b45738c345a01f3efed5d0f8dcaef4c4f7f06ff8acff5f74e7d12 |
| 0445_erasure_credit_purchase_receipts.sql | 52217836c9c8f01abeb42b89adaf2ab7ae0e26c564150640faf0e4e30261ef55 |

The committed manifest declares the existing baseline including 0447 plus these exact three files, with three pending entries and unchanged deferrals. It is a candidate declaration, not an applied migration claim. SQL 0446 and 0448–0451 are absent. Privacy metadata retains all seven 0447 cascade-covered FKs, adds the two receipt FKs and points the generated-map parity test to the exact 0445 body.

## Before building

Install the separate reviewed operational-tooling commit into the canonical checkout first, without any financial SQL, manifest or privacy pointer changes. Stage preflight compares exact helper/deploy/resource/freeze/supervisor bytes between source and canonical tooling; older canonical allocation helpers are not accepted. This prerequisite does not deploy a new application binary.

Before staging, create **two private paused baseline clones** of the already frozen receipt-compatible release, each with its own supervised PID/port and existing resource admission. Register both in retained state while keeping public traffic on the unpaused active process. Existing `--register` appends to retained[]; there is no single candidate slot to overwrite. The supervisor accepts an existing direct frozen release, so these two processes need no new build. They must report creation off, purchases paused, full receipt capabilities and observed uptime of at least120 seconds. They need not be verifiedGood yet: do not fabricate a private rollback drill.

Obtain the root operator's stage execution instruction after concurrent deployment completes. Commit the source; preflight refuses dirty or changed SQL/fixtures. Securely provision the candidate worktree's own environment file and dependency symlink using the reviewed current configuration; do not overwrite canonical environment or print secrets. No environment provisioning is included in this source change.

Run from the isolated worktree:

```sh
bash web/scripts/deploy-live.sh --stage-credit-receipts --control-web=/home/dovanlong/blockid.au/web \
  --stage-baseline-port=FIRST_REGISTERED_PAUSED_PORT \
  --stage-baseline-port=SECOND_REGISTERED_PAUSED_PORT
```

The normal deployment lock, stable active verification, exact ledger/catalogue baseline, resource admission, supervisor probe, compile/tests, standalone packaging, immutable runtime freeze and smoke gates still run. No `--skip-build`, `--quick` or rollback combination is accepted in this mode. Existing founder-authorized test deferral controls retain their honest skipped reporting.

Build output, version writes, `.deploy-manifest.json` and the stage-specific `.next-receipt-stage-backup` stay in the isolated worktree. Stage failure restoration never moves/overwrites canonical `/data/backups/next-backup`; it also skips production-log rotation. Release artifacts use canonical `/data/releases` only after resource admission and freeze checks. Frozen artifacts contain the reviewed SQL and honest manifest, but remove copied serving-state, schema-transition, candidate, LKG, retention and deploy-log control JSON. Actual control state is always read from the canonical checkout; no stale state copy is installed there.

The private supervisor launches with `G30_CREDIT_RECEIPTS=0` and `G30_CREDIT_PURCHASES_PAUSED=1`. Active purchases remain unchanged. The candidate must independently report authenticated HTTP200, exact SHA and `schema_migrations: pending:3`, truthful paused capabilities and the verified frozen runtime identity. This status exception is inspection-only; registration and promotion still require normal `ok` and a sealed schema edge.

A separate canonical `g30-receipt-candidate.json` pins preflight/source/ledger and later the frozen artifact and process. A retention pin protects the artifact before launch. This does not add the candidate to serving-state, verifiedGood or rollback eligibility. Another allocation refuses while this stage record remains; it must not silently ignore an unregistered live candidate. Existing serving/rollback artifacts and source branches remain intact.

## Short migration window after the candidate is ready

1. The two paused clones already exist and are retained from before staging. No additional allocation is allowed or needed after the stage record is created. Under the reviewed operational window, select the precreated retained ports with the existing begin/proxy/activate flow (without allocate/register), execute real rollback/forward and mark-good checks, then retire incompatible writers through separately authorized operations. Both baseline manifests already contain 0447. No known-live retained handler is waived merely because it is unrouted/quarantined.
2. Only now schedule the actual purchase pause on the required baseline processes. Recheck truthful runtime flags and drain requirements; the controller requires compatible paused processes with sufficient uptime. Keep receipt creation off. General site/report reading remains available.
3. Hold both the canonical deployment lock (FD200) and `/tmp/blockid-cron.stripe-reconcile.lock` (FD201). The `commands` helper prints the exact reviewed `prepare`, `next`, individual manual apply, `observe`, and `seal` commands:

```sh
python3 web/scripts/g30-receipt-candidate.py commands \
  --source-web=/data/blockid-g30-receipt-candidate/web \
  --control-web=/home/dovanlong/blockid.au/web --lock-fd=200
```

This prints commands only. The command plan pins the second precreated clone as recovery; the first is the intended paused active origin. Complete their actual drill before prepare; the controller still requires verifiedGood for both. The expansion controller now accepts a staging-only canonical control-web: serving/transition state stays canonical; reviewed SQL and isolated fixtures stay with the candidate source.

4. Run `prepare`, then `next`. Compare the returned exact migration/checksum with the reviewed source. An operator explicitly executes the existing `web/scripts/db/apply-migration.sh` for **one** file, then immediately runs `observe` for that file. Repeat in controller order. No loop/script here automatically applies SQL. Do not rewrite immutable baseline/candidate artifacts when the apply script refreshes the source checkout's manifest.
5. Run `seal`: it rechecks all exact SQL/fixture bytes, live ledger/catalogue attestation, paused endpoint identity/capabilities and the real isolated receipt/replay/erasure fixture. A failure preserves paused state; do not mark it healthy or bypass a partial migration.

## Promotion remains a separate reviewed action

`promotion-plan` refuses an unsealed expansion, changed candidate identity or an invalid live sealed edge. It prints the existing register → begin → nginx-switch → activate → gates-passed command sequence and mandatory interlocks; it executes none of them. A printed plan is not evidence of deployment.

Before register, independently check the supervisor identity and current resource permit. Verify exact public SHA after the proxy switch **before** activation. On any switch/public/activation failure, use the already verified warm rollback sequence before proceeding. Then perform the actual rollback/forward drill and soak before mark-good. Purchase unpause and receipt creation remain separate reviewed activations with their own catalogue/economic validation.

Do not paste the generated commands as an unconditional batch: the public identity check and rollback handling are required between the displayed steps. The existing deployment path retains these operational responsibilities; this bounded change does not introduce a second automatic promotion implementation.

## Failure disposition

Failed/unserved candidates and partial preflight records remain pinned for investigation. No helper stops a process, removes an artifact or clears the staging record automatically. Under the deploy lock, verify exact process ownership, outstanding work and retained recovery before an explicitly reviewed disposition. Clearing a preflight record with no artifact/process also requires confirming the recorded source/SHA and that no supervised launch occurred. Preserve the record as audit evidence before clearing it. A partially applied ledger requires financial transition recovery, not restaging from scratch.

## Validation limits

Focused staging/controller/state tests and actual SQL/erasure-map checks are recorded in the handoff. No Next build, private candidate launch, environment edit, production SQL, public routing or promotion was executed while preparing this source. The eventual full compile/freeze/launch inspection is still a required execution gate.

Source preparation validation: 20 candidate-staging tests, 14 serving-state tests, 9 expansion-controller tests, 7 expansion-policy tests, 12 privacy-map/parity tests and 8 isolated actual purchase/erasure tests passed (70 total). Shell syntax and whitespace checks passed. These checks do not claim a completed application compile or launched candidate.

For precreated baseline clones, the resource allocation must bind the exact frozen baseline release SHA (use the reviewed `allocate(data, control_web, candidate_sha=baseline_entry['sha'])` contract under the canonical lock), not the newer tooling checkout HEAD. Supervisor launch and registration independently recheck the real process/release identity and resource permit. No capacity override is introduced.

Fixture continuity: preflight stores hashes of both files after comparing exact bytes with draft4776; inspection and command planning recheck those pins. Expansion prepare must consume the inspected stage's exact candidate/source/fixture/SQL pins rather than newly blessing current test bytes. Changed-fixture-after-preflight and changed-fixture-before-prepare regressions are covered.
