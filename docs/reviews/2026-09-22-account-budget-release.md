# Account authority and economical research — release preparation

## Completed source and checks

BlockID commits 316b6e147 and fe2e14e4b add the signed account-status authority, reject deleted/erased accounts in current-user lookup, and add atomic Brave budget reservations. The authority and existing authentication suite passed 93 tests; budget storage passed nine checks including six independent worker processes. Targeted TypeScript checks passed. Account lookup reads existing schema; no new migration was applied. Budget storage is still unconnected to production search/customer jobs.

SVI compiled source 81e47ee964a768b5dff2cdc5e6a58be93cc24cc1 / BUILD 3LG0rivuOiIsA5DlxeeQQ includes authoritative checks in handoff, session state, signed ingestion, private research and scoring consumers. Thirty-one focused tests and the complete production build/type gate passed. The candidate is running privately on4212; /live and /vi/live return200, unauthenticated intent401, auth/me200. It has NOT been promoted publicly. Eighty-one existing raw report hashes remain unchanged. Private prepared/candidate receipts and logs /tmp/svi-g30-account-build.log and /tmp/svi-g30-account-launch.log record the build and process identity.

Public BlockID remains v3.33.0 / cc229ad49 on4108, warm4107. Public SVI remains d99703d on4215, warm58c7d5c on4214. Existing nginx and BlockID robots hashes remain unchanged. Stopped ONLY our own never-promoted, superseded auth candidates70e379a/4212 and157ace6/4213 after exact process/unit/artifact identity and active/warm health checks; artifacts retained. Port4212 now belongs to the new private candidate. No customer account, report, credit or provider call was used for these deployment probes.

## Exact pending deployment decision

The existing approved plan limits BlockID to six live origins; all six are occupied. Previous retirement approvals explicitly named4101/4102/4103, not4104. Current activity coverage cannot prove completion of every legacy background task. An asynchronous question is pending for stopping ONLY the older4104 origin while preserving its artifact, live4108 and warm4107. No response has yet been treated as approval, and no4104 stop or seventh origin permit has been performed.

Proposed target: g30-origin-4104-055aca3afe-0e5fb944b5fc.service; PID1156768; startTicks446229308; release /data/releases/enJAN6twQ-tNBNmzfbQOT; source c867ce271b12b58b7c8080f562c1ba36fa45f718. Revalidate all pins, routing absence, retained capacity, dependency artifact and current/warm health under /tmp/blockid-deploy.lock immediately before any authorized stop. Preserve artifact and record that legacy quiescence is not proven.

## Execution after decision

1. If approved, stop only the pinned4104 unit, retain its artifact and issue a fresh exact-source, retained-state-bound resource permit for at most two hours with max_live_origins6. Freeze final source/version; do not reuse a stale permit after any commit.
2. Deploy BlockID with the reviewed web/scripts/deploy-live.sh --quick path, G30_NO_NOTIFICATIONS=1, G30_DEFER_UNIT_TESTS=1 and G30_DEFER_EXTENDED_REVIEW=1. Full production build/types, immutable packaging, identity/health/smoke and rollback gates stay enabled. Preserve runtime dirty files and robots bridge. Verify signed authority request/response using a nonexistent synthetic UUID, with no account mutation or valid customer session. Check shared-key equality without outputting keys.
3. Only after the authority endpoint is live, verify the SVI candidate against it. Refresh non-SVI deployment baseline for the legitimate BlockID change; prepare static union, then promote81e47ee, rollbackd99703d and forward using the reviewed /tmp/svi-g30-account-rollout tools under the shared lock. Verify auth rejection headers, legacy analysis guard, /live and /vi/live, report hashes and monitor/boot.
4. Previous SVI warm lacks the new account-status check, although it supports v2 sessions and durable nonces. Record that rollback returns to previous behavior. Before customer paid research activates, active AND warm must include authority checking and transaction-time grant revalidation. A single read cannot authorize a later debit.

No full-plan completion is claimed. The signed read-only account check is not account-wide erasure/export, logout-everywhere, wallet consent, new market findings, SVI rescoring or valuation acceptance. Paid research remains disabled. Brave ledger still requires trusted usage wiring (including prior four requests), durable jobs and rights-aware evidence processing before actual search dispatch.
