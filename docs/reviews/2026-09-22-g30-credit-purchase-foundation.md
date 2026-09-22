# G30 B02/B03 purchase fulfillment foundation (candidate only)

Implementation is opt-in `G30_CREDIT_RECEIPTS=1`; NOT enabled, NOT migrated, NOT deployed. Billing service remains disabled. Migration0443 generic receipts and0444 order/revenue wrapper are drafts until release owner verifies additive schema, erasure parity and compatible rollback. Existing44xx migration ordering must be checked at integration.

## Implemented

- Checkout uses separate receipt-v1 Stripe idempotency namespace and metadata marker. A service-only immutable order records authenticated account, returned session/livemode, price, credits, subtotal and catalogue version before returning checkout URL. Failed persistence gives no payment link; retry of the same session verifies existing order equality.
- Fulfillment retrieves authoritative session and line items with Stripe server credentials. Requires paid complete payment-mode purchase, one quantity-one one-time AUD price, matching line subtotal, no discount, completed automatic tax calculation, zero shipping, known actual Stripe tax, PaymentIntent. Nonzero tax requires Australian billing country before classifying it as GST; unsupported foreign tax fails for review. The stored order establishes account, price, promised credits/subtotal; metadata is only a cross-check. No invented GST calculation.
- `fulfill_credit_checkout` locks the order and invokes receipt-backed grant with exact immutable economic fingerprint. Balance, ledger, terminal receipt and revenue are one transaction. Concurrent webhook/reconcile calls replay the same receipt. Revenue failure rolls everything back.
- Signed webhook routes credit purchases before legacy insert-only event dedupe. Completion and delayed-payment success both use shared fulfillment; unpaid completion waits, grant/DB/unknown outcome returns503. No fallback to legacy grant or remote billing. Connect-account credit events fail closed; this bounded implementation supports the configured platform account only.
- Reconciliation uses exactly the same purchase RPC, never missing-revenue authorization. New marked purchases continue using receipts even when checkout opt-in is disabled; flipping the flag cannot silently reopen unkeyed fulfillment.
- Existing subscriptions, grandfathered plans, non-credit webhook branches and legacy grant/spend callers remain unchanged. No general event-lease migration is needed for this single mandatory transactional effect; general webhook retry correctness remains open.

## Historical and operational disposition

Orders lacking receipt-v1 metadata or a persisted order are refused for manual evidence review. This includes historical paid sessions where ledger/revenue/event disagree. No inferred refund, automatic historical backfill, regrant or acknowledgement of financial success. With mode enabled, reconciliation reports these as grant_failed/review-required. Operator must reconcile evidence and issue a separately approved repair identity if justified.

The flag only opts NEW checkout creation into this contract. Turning it off is not an escape hatch for purchases already marked. A release predating this compatibility behavior is NOT a valid rollback target after first receipt-backed checkout. Keep compatible code and additive schema, or pause financial mutations while serving reads. Do not enable BILLING_URL or alternate billing webhook writers.

## Minimal evidence

- 5 focused TypeScript tests passed: stable verified inputs, unpaid suppression, historical refusal, ambiguous result same-key retry, extra-line refusal.
- 3 real scratch PostgreSQL tests passed: simultaneous webhook/reconcile receipt equality with one credit ledger/revenue; missing historical order fails; forced revenue constraint failure restores balance and removes operation claim, then retry succeeds. No network, host bind, production database or Stripe writes; scratch container removed.
- Generic0443 tests and earlier evidence remain separately recorded. These checks are bounded, not a complete payment lifecycle or permission audit.

## Explicit remaining activation gates / follow-on

- Source correction: current0442 erase_account retains a pseudonymous app_users tombstone; new financial FKs do not prevent it. Draft0445 integrates orders/operations into the existing financial-record keep-reference map, preserving replay fingerprints without customer contact fields. New credit operations and checkout records lock the account before checking erased_at; completed receipt replay is allowed but cannot recreate a balance. Existing legacy credit writers are outside this guard and remain an activation constraint. No new retention period or legal policy is introduced.
- Root schema ledger/runtime grants/parity, compatible LKG and migration ordering; actual Stripe price/tax behavior checkout acceptance, rollback fixture.
- Financial confirmation outbox/email and per-event observation history are NOT implemented. New receipt path must not send duplicate confirmations by attaching emails directly to replay.
- Legacy callers/non-credit failed-event retry, general event leases, all direct balance writers and remote ambiguity fixes remain separate work. No complete B02/B03 claim.
- Deep-research quote/reserve/capture/refund and missing pitchdeck_speculative price remain open; no new fee invented.
- Frozen catalogue v1 is intentionally immutable. Price/credit changes require a new validated version and retaining old order readers, not changing recorded entitlements.

## Erasure follow-up validation

The new purchase caller stores only economic/Stripe identifiers in its immutable context; name, email, deck text, customer address and contact details are never persisted in these tables. Future generic callers must preserve this restriction or implement a reviewed scrub/hash contract before use. Financial key/fingerprint mutation on erasure would destroy retry identity and is intentionally avoided under the existing financial ledger retention map. Full TypeScript attempt exhausted Node default heap; no typecheck pass is claimed.

Actual draft0445 erase_account executed in scratch PostgreSQL: financial orders/receipt remain, credit_balances is removed, same completed receipt replays unchanged, pending purchase and new generic grant cannot recreate balance. Four purchase/erasure integration cases pass. Erasure-map fixture adds two explicitly draft (not live-observed) FKs and map/SQL parity is checked.

## Concrete staged compatibility / legacy-writer exclusion

Source guards now also cover the shared web `grantCredits` credit_pack_purchase reason: verify authoritative paid session/account/credit amount before legacy balance access. Marked sessions always use receipt fulfillment, even when creation flag is OFF; lookup/receipt ambiguity throws, never falls through. Unmarked historical grants are refused after creation cutover. Other grant reasons are unchanged.

Dormant services/billing explicitly rejects all credit-pack webhook deliveries503 BEFORE its process-local dedupe, and rejects direct credit_pack_purchase grants. It is not another receipt authority; keep BILLING_URL and its webhook destination disabled. This source change does not patch an already running old external binary.

`G30_CREDIT_PURCHASES_PAUSED=1` in a compatible release pauses new checkout URLs and credit-pack fulfillment (including shared legacy grants). Webhook pause occurs BEFORE event claim, so Stripe retains retryability. It leaves subscriptions, ordinary site reads and non-credit events on existing paths. Default unset makes no operational change; it has not been enabled here.

Manual release-owner sequence, not executed:

1. Keep creation `G30_CREDIT_RECEIPTS` OFF. Deploy compatible handler/guards with `G30_CREDIT_PURCHASES_PAUSED=1`, retaining site/read availability. To bridge from a pre-compatible running binary, root must temporarily pause credit-pack entrypoints at the serving proxy/controller or otherwise drain them before switching. Do not assume new environment settings affect old processes.
2. Drain the currently admitted stripe-reconcile request while holding its existing `/tmp/blockid-cron.stripe-reconcile.lock` and the deployment lock in the controller's established order. The source cron runner resolves stable active state at admission but expressly permits an old admitted handler to finish; lock acquisition alone is not proof no separately invoked API request exists. Verify no old credit-pack HTTP handler can still mutate, keep old origins inaccessible to financial entrypoints. Never kill an ambiguous request and treat that as rollback proof.
3. BLOCKED pending the controller-aware schema transition described below. Only after that new admission/recovery transaction exists, manually apply0443,0444,0445 in order with the existing migration ledger procedure and backups/schema privileges ready. Erasure follows actual tombstone map; do not remove its rows. Validate compatible release plus receipt API on permitted synthetic fixtures. No production migration was performed by this work.
4. Establish a known-good rollback release containing these SAME reader/guard capabilities and schema. Pre-compatible releases are excluded from financial rollback; leave them retained for forensic/read-only recovery, not payment serving. All cron/forwarder/billing writers must be inventoried, not just host ports.
5. Only then enable creation receipt mode and unpause purchases on the compatible authority. Toggling creation OFF later still fulfills marked purchases using receipts. If recovery is needed, re-pause financial entrypoints and switch to compatible LKG with schema intact. Never enable the alternate billing service or regrant a historical missing-order session.

The source guards cannot make a retained pre-compatible executable safe. Gate remains open until the release owner proves this deployment/ownership sequence; no financial rollout compatibility claim is inferred from unit tests.

## Controller-aware schema transition — supersedes ordinary deploy assumption above

**STOP before step3 above with the current controller.** `g30-serving-state.py:make_entry` hashes the artifact's sorted `files` and `deferred` migration manifest. `register` rejects any candidate with another digest, and `rollback-target` filters to equal digests. `verify_entry` additionally demands authenticated status `schema_migrations=ok`. Current status only checks whether required filenames exist; it permits extra live migrations and caches for5min. Neither old status=ok nor a green hash match proves exact post-expansion compatibility. Applying SQL and following the ordinary deploy command therefore is not a valid transition procedure.

Concrete staged sequence and explicit not-yet-implemented controller work:

1. Build/deploy compatible financial reader **R0** with creation OFF, purchase writes paused, baseline manifest **M0**. Draft SQL is not active and receipt paths must remain paused; don't claim schema capability active merely because the code exists. Keep a second independently verified same-reader rollback instance **R0b**, also M0; quarantine/exclude pre-compatible binaries from financial serving. Confirm no older admitted purchase handler remains as described above.
2. Build immutable future release **R1** with the actual expanded manifest **M1 = M0 + exactly0443/0444/0445**, matching source SQL checksums and declared financial reader capabilities. Do not register it, select it for traffic, rewrite its frozen manifest or omit required files to make hashes match.
3. Before SQL, the release controller must gain an explicit **locked schema-expansion transaction**, separate from ordinary register. Its reviewed recovery record must pin R0/R0b/R1 SHA and immutable artifact digests, old/new manifest digests, the exact3 migration SHA256 values, baseline live ledger checksums, phase and recovery targets. It must require stable active R0 and verified R0b, pause/drain credit writers, and validate immutable runtime identities. It must reject destructive/removal/changed-checksum migrations and every release outside the pinned finance-compatible set. No such transaction is implemented in the current serving-state controller, so this is the exact unresolved gate.
4. Only that prepared controller transaction may permit the manual apply script0443→0444→0445, record each committed ledger checksum, and validate the expanded live schema/receipt permissions. A failure before all3 finish leaves financial writes paused and serves R0 reads; do not erase partially applied schema or call it successfully transitioned. The state must explicitly retain the intermediate expansion phase and recovery evidence, not reset to ordinary stable based solely on HTTP200.
5. Under the same reviewed transition, start/verify R1 and validate R0/R0b against the expanded database using uncached authenticated status AND exact live checksum/schema attestation. Only then persist narrow compatibility edges for those exact artifact SHAs and schema digests. Ordinary same-digest registration remains unchanged outside that transition. Rollback selection must use these verified edges and the finance-reader allowlist; merely teaching register to accept mismatches is insufficient.
6. Switch to R1 and verify compatible rollback before unpausing/enabling new purchases. Preserve M0/M1 immutable artifacts and the expansion evidence. Financial rollback can target R0b only when its post-expansion verification is recorded; otherwise stay paused/read-only while repairing. Never downgrade by deleting ledger/receipts.

`web/scripts/g30-credit-schema-transition.py` provides a **read-only staging preflight** for steps1–2. It pins artifact SHAs, matches the existing digest algorithm, requires exactly the3 additions with no changed deferrals, validates financial reader capability declarations and hashes exact SQL bytes. Successful shape validation STILL exits2 with `sql_authorized=false` and `controller_admission_supported=false`: metadata alone cannot authorize missing controller semantics. Four offline tests reject unsafe old readers, omitted/deferred required schema and accidental authorization. No real artifact pair/controller transition was executed. The capability JSON is a build declaration, not runtime flag/schema proof.

## Implemented source-only controller admission primitive

`web/scripts/g30-schema-expansion.py` now implements the actual transition decisions (separate from preflight), without a live CLI or IO:

- `prepare`: pins active, independently verified recovery and candidate process/artifact identities; requires stable state, no quarantine, paused financial writes/creation OFF, exact M0→M1 additions, unchanged deferrals, reviewed migration byte hashes, exact baseline ledger and schema attestation.
- `next_migration` / `record_applied`: issue only the next pinned migration identity; require the live ledger to equal baseline plus the exact committed prefix with original checksums. An unplanned migration, changed checksum or out-of-order step is refused. Partial SQL remains an explicit applying state, not a stable/success claim.
- `verify_endpoint` / `seal`: require all three exact runtime identities to pass post-expansion status, capability, receipt-fixture and fresh schema/ledger verification before creating eligibility. Verifying only the candidate cannot seal a rollback edge.
- `fail`: clears endpoint eligibility and preserves the partial state/history for recovery. Failed/partial transitions authorize neither cross-schema admission nor rollback.
- `edge_allowed`: accepts only sealed exact SHA/runtime/PID/startTicks/path/manifest-digest endpoint pairs with matching current schema and ledger; rejects unapproved old binaries, restarted processes, quarantine and schema drift. It never modifies artifact digests or the ordinary equality rule.

Five focused offline state-machine tests pass: partial/failed refusal, changed/unplanned migration refusal, unsafe/restarted rollback exclusion, missing-recovery refusal and post-seal schema drift refusal.

**Remaining integration is explicit:** root's locked controller must call these primitives, atomically persist each transition record, invoke actual read-only schema/process/fixture probes and manual migration runner, and consult the edge predicate for both candidate registration and rollback. The primitive consumes trusted verified probe outputs; it does not establish their truth from arbitrary JSON and is not exposed as operator permission to apply SQL. Existing g30-serving-state CLI remains unchanged and continues to reject digest mismatch. No production transition or migration has occurred. A failed partial transition deliberately requires a separate reviewed recovery operation; there is no automatic reset/retry that erases uncertainty.

## Runnable controller integration (source only; no live execution)

`g30-schema-expansion-controller.py` now implements `prepare`, `next`, `observe`, `seal`, `enroll`, `fail`. Every command requires inherited exclusive deployment and stripe-reconcile lock FDs verified against canonical inodes. State is atomically fsync/rename persisted to `content/reports/g30-schema-expansion.json`; no command executes production SQL, changes a proxy or restarts an origin.

The CLI consumes real observations, not user-supplied attestation JSON: exact process/cwd/listener checks, private authenticated status flags, immutable dependency-manifest fingerprint, source SQL byte hashes, and a same-snapshot read-only pg_dump+full migration ledger. The schema adapter originates from the local reboot attestation work; raw DDL and secrets stay in memory. Its fingerprint covers schema/ledger, not cluster role membership or all extension-owned internals. Authenticated status now forces a fresh manifest/ledger check and exposes only to authenticated callers the financial reader flags and process uptime. Actual ledger/checksum attestation is separate from the status filename check.

`prepare` refuses ANY still-live retained origin that lacks paused compatible reader capability, including quarantined ones, and requires120s startup drain. This deliberately prevents pretending that quarantine alone stopped an old financial handler. Root must complete safe retirement or compatible replacement first. Candidate is unregistered, already running with expanded manifest and expected `pending:3`; that status is admitted only to this prepare probe, never the normal serving path.

`seal` runs the existing real scratch purchase/erasure fixture (network-none container), checks test/SQL hashes pinned at prepare, and verifies all three pinned live endpoints against the expanded database. A changed fixture, failed test, wrong runtime or ledger drift cannot seal. Existing serving-state register, rollback selection and activation consult the explicit transition predicate when its sidecar exists; without a sidecar the old same-digest behavior is unchanged. With a malformed/partial/failed sidecar there is no fallback to equal-digest unsafe readers.

Operational invocation shape (release owner holds both locks in the established controller order; commands below are templates, not executed):

```
python3 scripts/g30-schema-expansion-controller.py --web /home/dovanlong/blockid.au/web --lock-fd 200 --cron-lock-fd 201 prepare --recovery-port <R0b> --candidate-port <R1> --candidate-pid <PID> --candidate-release <immutable-R1-path>
python3 scripts/g30-schema-expansion-controller.py --web /home/dovanlong/blockid.au/web --lock-fd 200 --cron-lock-fd 201 next
# Existing manual apply-migration.sh for ONLY the returned pinned file.
python3 scripts/g30-schema-expansion-controller.py --web /home/dovanlong/blockid.au/web --lock-fd 200 --cron-lock-fd 201 observe --migration <just-applied-file>
# Repeat next/apply/observe separately for each of0443,0444,0445.
python3 scripts/g30-schema-expansion-controller.py --web /home/dovanlong/blockid.au/web --lock-fd 200 --cron-lock-fd 201 seal
# Existing serving-state --register and proxy/controller deployment now require
# the sealed exact edge, followed by normal runtime/gate/rollback checks.
```

Because process environment changes require a new origin, `enroll` explicitly verifies/pins later expanded-schema successor processes rather than accepting PID drift. A successor started with purchases enabled additionally requires `--allow-purchase-writes`; it cannot be admitted before sealed expansion. The same command admits subsequent compatible full-manifest release builds, keeping continued upgrades possible without removing the sidecar or accepting arbitrary old binaries. Admission alone does not mark a successor verified-good: ordinary release gates still govern rollback eligibility.

Validation:6 state-machine tests,5 controller failure-path tests,13 existing serving-state tests passed. Tests mock actual endpoint/database probes; no production adapter call, SQL, state persistence or deployment occurred. Operational work still required: build and freeze the compatible paused baseline/recovery and expanded unregistered candidate, safely retire incompatible live retained origins, then execute the locked migration/attestation sequence with approved local protection. None of these live gates is claimed complete by source tests.

Semantic compatibility also explicitly requires `report_final_projection_and_unavailable_valuation_v1`, reported by the actual authenticated runtime. Same-schema financial readers missing this current report-reader capability cannot prepare, enroll or become an expansion rollback endpoint. This preserves the unavailable-valuation/final-report reader boundary independently of SQL migration digest. A seventh focused state-machine case covers this refusal; no primary rollback state was changed here.
