# BlockID v3.33.3 live — receipt compatibility and bounded discovery

Live compiled source: `cba40ad1ea49e7447ba4575a5211689462f83391`, port4111, PID3037030/start449387470, immutable `/data/releases/KJ9KC1OITwuTxHwxD5w6q`. Immediate warm recovery:4110/`0ddc1d7dddaa605e18e08f284bad895dba36d1e6`. Both use the unchanged0447 manifest digest307d6f5973d98e1edbb0943160f24f9cc2e84a89d3a306976c9f660158f0197d.

The source adds receipt-aware purchase handling and authoritative verification before the old insert-only webhook event claim. A temporary Stripe lookup failure now returns retryable503 before claiming; the successful retry carries a single-use bound proof into the legacy grant rather than making another failure-prone lookup after claim. Targeted verification covered the actual same-event retry. Existing purchases remain unpaused and new receipt creation remains off. Trusted status truthfully reports both actual flags false and database activation unverified. Financial tables/migrations remain absent; remote billing-service changes are source-only, not a service deployment claim.

Budgeted discovery now reserves each actual Brave query through the shared private ledger, rechecks authority before dispatch and refuses replays/ambiguous automatic retries. Forty combined budget/discovery checks passed with synthetic fetches. This is worker-facing code, not enabled customer research; no new search/model request or customer debit occurred in this deployment.

## Release evidence and recovery

Full production build/type gate,12 candidate browser smoke cases, endpoint/static and Supabase checks passed. The original deployment then refused registration because available memory fell below its reserve. Public traffic stayed on4110. The completed artifact and candidate process were retained.

After an owned agent typecheck was stopped, the same resource gate admitted the unchanged candidate. Scoped resume reverified immutable dependencies, exact source/process/unit/manifest identity, current4110 CAS and receipt flags, then registered/promoted4111. Fresh local/public exact-SHA, anonymous-auth and six static-asset checks passed. The original failed deployment log remains unchanged; this is a separate successful resume, not a fabricated full-script completion. No extra successful-release snapshot was created by the resume; the immutable active artifact and warm recovery remain retained.

Actual nginx rollback4111→4110→4111 passed, restoring identical configuration bytes (SHA332265f908e2dc2c71bbc8c9712d297917d5c0404367d54099b808a44f611ecf); all other routing stayed unchanged. Accelerated operational mark-good passed after the required soak. Public signed BlockID account authority and SVI synthetic closed-account denial were rechecked successfully. Broad unit/link/extended hydrated reviews remain deferred, not passed.

Evidence: `/tmp/g30-receipt-compatibility-deploy.log`, `/tmp/g30-resume-4111.log`, `/tmp/g30-compatibility-rollback-drill.log`, `/tmp/g30-4111-mark-good.log`. Old4106 alone was drained for tracked work and stopped with exact identity checks; its recovery artifact remains. Untracked legacy background quiescence was not proven.

## Next source, not this live binary

Supervisor policy forwarding/pinning and gated synthesis/independent-review model purposes are committed after this compiled source. The new research model path requires a trusted reservation before every actual model attempt, disables hidden transport retry, and remains unavailable without the durable monetary coordinator. Its targeted tests passed; the full typecheck was stopped to free deployment memory and has not been declared passed. One full-suite G29 date-sensitive fixture failure was reproduced on unchanged source.

Draft financial source4776ac339 fixes both deleted/erased account refusal in0443/0444 with23 isolated PG checks. Draft287bd6d58 adds separate0451 research cancellation/lease/hold/erasure lifecycle with17 isolated PG checks and a preactivation historical payload audit. Neither is canonical/live SQL. Next steps still require the compatible paused pair, exact receipt and research schema transitions, stored quote/approval, durable worker/budgets, accepted publication/capture and complete data lifecycle. Report valuation and SVI changes remain independently evidence-qualified. G30 remains ACTIVE.
