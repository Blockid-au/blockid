# Financial expansion: small release stages after authority0447

Status: deployment design from read-only source/runtime inspection on2026-09-22. This document does not apply SQL, enable purchases/research, retire a process, or establish completion of billing. Root reports the independent0447 authority release is now active on4110 and its actual nginx rollback/forward drill passed; the financial drafts remain unapplied. Recheck these pins before execution.

## Reviewed source and concrete gaps

Financial integration is `/data/blockid-g30-billing-integration` commits `051030e4a9452ee1d1f282fa6b8be498eaeca395` and `bac0d1b2a` (authority enforcement). It intentionally transfers runtime/SQL/tests without the earlier financial expansion controller. The controller reference is `/tmp/blockid-g30-stripe-fulfillment/web/scripts/g30-schema-expansion*.py` at `ddb883c60`.

The draft runtime has receipt-aware checkout/webhook/reconciliation and legacy-grant defenses, but does **not** expose the trusted `credit_receipt_capabilities` status object expected by that controller. Status capabilities must be restored as a narrow patch; copying an older complete status route or serving controller would discard newer authority and operational protections.

`G30_CREDIT_RECEIPTS=1` enables new receipt checkout creation. `G30_CREDIT_PURCHASES_PAUSED=1` pauses purchase processing. Both default false; setting neither is not a financial pause. Receipt-marked sessions are still routed through receipt fulfillment when creation is off. The legacy Stripe lookup and remote billing-service credit-pack rejection are meaningful behavior changes even with creation disabled. Deployment must acknowledge these behaviors explicitly.

## Stage1 — compatible runtime on the current0447 manifest

Select only the reviewed purchase compatibility source and its targeted tests, preserving current account-status, report and serving-controller code. Keep unapplied0443–0446/0448 and the upcoming quote migration outside the canonical migration directory. Keep the privacy map/fixture/SQL pointer coherent; do not point runtime source at absent canonical0445 merely to stage a binary.

Add trusted status fields that report actual process behavior: receipt creation enabled, purchases paused, process uptime and the verified receipt capabilities. The earlier controller expects `purchase_authority: web-receipt-v1` and capabilities for receipt-marked purchases when creation is disabled, legacy-pack defense, pausing before event claim, erased-account refusal, and current report projection. These are attestations to implemented/tested behavior, not free-form operator declarations. Derive flags from the functions used by the handlers; do not hardcode a healthy pause state.

Deploy **two independently verified runtime instances on the same honest manifest containing0447**: one active and one warm. They must include the same receipt compatibility and SVI account-status support. Each needs its own pinned process/port, immutable artifact identity and appropriate supervisor configuration; use approved build/launch mechanics rather than copying live process metadata. Keep creation off and use an explicitly scheduled purchase pause for the migration window. Prove forward/rollback with actual nginx, exact public SHA and authenticated local status. The site/report readers remain available while purchase processing is paused.

This pair is necessary because the current0447 cross-digest edge checks the exact ledger baseline plus0447. Applying0443 invalidates that older edge by design. Do not weaken it or rewrite old manifests; establish a new compatible pair whose manifests both already contain0447.

## Stage2 — remove incompatible live writers without losing legacy recovery

The earlier financial controller's `assert_paused` examines **every live retained origin**, including quarantined origins. Two new compatible instances alone do not meet that contract if old processes remain alive. Do not silently skip quarantined processes or waive the requirement based only on public nginx routing.

Runtime inspection distinguishes current SVI from legacy SVI:

- All13 observed live SVI origins4202–4215, excluding stopped4213, had `SVI_SCOPED_REPORT_POLICY=1`. Their scoped AI proxy resolves `g30-serving-state.json` for each request. The current primary SVI path does not require a new fixed-port bridge.
- Legacy SVI4002 lacked that policy. Its `startupvalueindex.service` explicitly sets `BLOCKID_INTERNAL_API_BASE=http://127.0.0.1:4001`. The unscoped client also defaults to4001. This is a real **legacy** dependency, not proof that current SVI sends scoped analysis to4001.
- Source inspection does not prove absence of other callers. Before stopping4001, recheck nginx, systemd units/timers, cron, readable process configuration, sockets and the specific remaining AI callers.

The least intrusive option is a scoped retirement of the known **SVI4002 then BlockID4001** pair, after current/warm SVI and BlockID recovery are established and dependency evidence is reviewed. Preserve both artifacts and rollback material. For4002, preserve its primary standalone bundle and dependencies: the historical service runs from the primary checkout. Do not npm-install/build that primary checkout while it remains a live or required recovery artifact. Freeze/verify a recovery copy and its reader/static compatibility before future primary checkout reuse.

For each selected legacy process, capture exact PID, Linux start ticks, cwd, SHA/build, listening socket and cgroup ownership. Confirm it is neither routed active nor required warm recovery, close admission where supported, and inspect tracked work and unresolved jobs. Preserve the explicit limitation that no tracked jobs/sockets alone does not prove absence of detached or external work. Record retirement as a scoped operational decision under the applicable user authorization, not as fabricated complete quiescence.

Use the exact owning supervisor only after verifying its identity. BlockID4001 was observed in a user-session scope, unlike newer named systemd origins; do not assume a `g30-origin-4001` service exists or stop a parent scope containing unrelated work. SVI4002 has the legacy `startupvalueindex.service`; check its restart/enablement and any recovery automation before retirement so a later boot does not silently restore an incompatible writer. Artifact retention and automatic startup eligibility are separate decisions. Do not disable unrelated units or sweep processes.

Other old BlockID origins need the same scoped handling, leaving the two compatible0447 instances intact. If any actual dependency cannot yet migrate/retire safely, keep it and implement a separately evidenced financial ingress restriction before changing the controller contract. Do not substitute a broad unchecked exclusion list for writer compatibility.

## Stage3 — exact0443–0445 financial expansion

Integrate the existing receipt expansion controller as a narrow current-source adaptation. It already pins three exact migrations, schema/ledger evidence, paused runtime identity, fixture evidence and successor enrollment. Baseline manifests/ledger should include applied0447; the candidate adds exactly0443–0445. Numeric filename order does not require reapplying0447.

Controller dispatch is critical: once a financial transition record exists, evaluate its compatibility decision **before** the ordinary equal-schema shortcut. A prepared/sealed financial record must not be bypassed by returning true for two old same-digest binaries. When no financial record exists, retain the independent0447 behavior. Do not combine predicates using an unconditional OR, expand the0447 allowlist, or copy the old controller wholesale.

Bring migration-diff preflight, prepare/observe/seal, exact runtime registration, rollback selection, activation checks and successor enrollment together. Keep the shared deployment lock and reconciliation lock across the controlled transition. Apply reviewed0443,0444,0445 only through `apply-migration.sh`; observe each exact checksum/ledger/catalog change and regenerate the truthful manifest. Require the scratch receipt/replay/erasure fixtures and healthy pinned origins before sealing. Do not imply that a metadata checksum alone proves an unchanged database catalog.

Creation-off runtime rollback must continue processing valid already marked receipts through the same fulfillment authority. Do not re-enable a remote billing URL or alternate webhook writer. After the receipt-compatible pair and expansion are sealed, purchase unpause and new receipt creation are separate controlled activations with their own configured catalog/economic validation. Retain the historical-session review behavior rather than automatically manufacturing receipts or replaying customer grants during deploy tests.

## Stage4 — separate0446/0448 research storage transition

Do not broaden the0443–0445 receipt allowlist. Add a separate exact research transition for0446 and0448 with their pinned dependencies:0443 receipt operations, applied0447 authority, and the finalized quote producer (anticipated0449; scope is not yet final in this review). Keep execution/admission off throughout partially applied states. A runtime predating0448 authority enforcement is not an execution-compatible rollback.

The research transition must distinguish storage availability from activation. Validate immutable quote/consent, account closure, personal wallet ownership, current report/revision, revocation and lease/finalization checks before admitting a worker. Choose an explicit quote expiry policy compatible with0448's validation at reservation, claim and finish. Do not silently extend an expired approval.

## Stage5 — publish results before enabling paid work

Current0448 writes scoped revision/head/receipt state; it does not publish a new `analyses.full_report_json` or SVI artifact. Complete publication/reconciliation, provider budget settlement, retry/cancellation, held-credit recovery and research-content erasure before the first paid job. The current0448 authority helper supports BlockID personal reports and rejects SVI authority pending its separate signed-creator/cross-store protocol.

## Corrections and remaining precise questions

An initial review concern that0447 wallet grants necessarily block0445 wallet deletion was **incorrect for the current personal-report path**. Current0447 links the association to `analyses` with ON DELETE CASCADE, cascades grants/quotes, and permits parent-driven deletion through its immutable guard.0445 places both `analyses` and `credit_balances` at order30 and sorts `ord,tbl,col`, so analysis deletion occurs first. Primary follow-up `ad99b5b80` tests the actual0442 routine and documents seven authority cascade FKs. Preserve that current privacy metadata when adapting the draft; do not reintroduce the concern as an established blocker. The separate0446 held-job/content lifecycle still needs its actual erasure and reconciliation contract.

0443 `apply_credit_operation` currently checks `erased_at`, not `deleted_at`.0448 covers both for research authority, and current application authority routes reject both. Purchase-level behavior for a soft-deleted account remains a concrete SQL/fixture decision before financial activation; application checks alone do not establish atomic purchase closure semantics.

No financial implementation, production SQL, customer transaction, provider call, process retirement or live deployment was performed for this review document.
