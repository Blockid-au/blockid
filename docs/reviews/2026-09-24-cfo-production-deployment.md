# CFO production deployment receipt — 24 September 2026

Status: both production sites deployed and independently checked at 23:33 UTC. Operational release acceptance is complete under the existing founder-authorized accelerated policy; full-plan/financial acceptance remains open.

## Validation history

- Initial full BlockID run: 42,584 passed, 2 failed, 2 skipped. Failures were the missing scenario audit catalogue entry and raw client error display.
- Corrected both in commit `871f2fee4`; focused audit/UI/scenario verification: 4 suites, 47 tests passed.
- Full-history gitleaks: 14,443 commits / 1.75 GB, no findings. Incremental scan of correction commit also passed.
- Initial ESLint: 16 errors, 488 warnings, explicitly not a pass. The six affected files are unchanged relative to prior production commit `c2e1470662804f1caeafe30439baef91940b875e`.
- No migration, official valuation activation, live score activation, billing, share issuance or notification requested by this deployment.

## Release identities

| Application | Source SHA | Build | Active / warm ports |
| --- | --- | --- | --- |
| BlockID | `871f2fee425f7faf5cbaa487fb4d14a78eb587ea` | `euTqmQtYoKNROtDD9i1TI` | 4143 / 4142 |
| Startup Value Index | `edebcea1127c6432282cf541f5b1f54e7bc47649` | `R5H7MK_-s_2Z6ee8OhAQZ` | 4212 / 4211 |

Both are immutable releases; old active processes remain warm. Public BlockID `/api/status` matched the SHA and `ok:true`; both SVI hostnames `/api/health` matched the new build and `status:ok`. SVI used bounded isolated build, private dependencies, artifact/process identity verification and serialized nginx promotion. SVI report snapshot comparison observed zero changed existing report files during rollout; no manual report generation, paid inference or customer financial mutation was invoked by the operator.

BlockID completed 11/12 deployment gates; ESLint is explicitly skipped/unverified because of unchanged baseline debt, not a pass. Full unit suite: **2,114 suites passed; 42,586 tests passed; 2 tests skipped; 0 failed**. Candidate browser smoke: **12 passed**. Public hydrated smoke: **142 passed, 2 skipped**. Internal-link crawl and production build passed. SVI production build/type check passed; focused test results are recorded in the implementation receipt, not misrepresented as a full SVI suite.

Independent browser/HTTP checks confirmed BlockID's sample report contains **13 criteria rows**, BlockID scenario redirects anonymous visitors to login with the exact return path, SVI scenario shows its sign-in state, and both scenario APIs return **401** to anonymous POSTs. Shared CFO source check passed for all five files. Authenticated live calculation was not exercised: no production QA account fixture was available.

BlockID was marked operationally verified-good with `--review-deferred` after more than 60 seconds and independent checks, under the existing [founder execution policy](../plans/SOURCE-OF-TRUTH.md#founder-execution-update--22092026-accelerate-phases-review-after-implementation). This explicitly defers the normal 30-minute soak/extended review and does not relabel them as passed. SVI's prior active process remains its warm rollback target; no disruptive rollback drill was performed.

Additional browser observations remain open: public BlockID login emitted CSP errors for injected inline/Cloudflare scripts and a recoverable React hydration error; the sample report also emitted two inline-script CSP errors. Both old and new direct-origin login pages loaded without those CSP/hydration errors, and login source/chunk bytes are unchanged by this release. This suggests an edge-transformation issue, but does not establish root cause or certify the full login journey. Google One Tap also logs signed-out/headless-origin errors. These observations are not hidden by the passing scoped smoke suite.

## Operational evidence

- BlockID pipeline: `/tmp/cfo-blockid-deploy-final-20260924.log`.
- Initial failures: `/tmp/cfo-blockid-first-vitest-20260924.{log,json}`; correction tests: `/tmp/cfo-deploy-fix-tests.log`.
- SVI build/launch/static/promote: `/tmp/cfo-svi-{build,launch,static,promote}-20260924.log`.
- SVI private rollout receipt: `~/.local/state/startupvalueindex-runtime/edebcea1127c6432282cf541f5b1f54e7bc47649.rollout.json` (no credential content copied).
- BlockID control state is authoritative in `web/content/reports/g30-serving-state.json`; SVI control state in its private `promotion.json`.
- Two older non-active/non-previous BlockID origins (4137 and 4138) were explicitly drained/stopped using the retirement controller to satisfy admission. Artifacts remain pinned; zero tracked activities/jobs were reported, but untracked job quiescence was **not proven**. No automatic process kill was used to bypass capacity.


## Acceptance boundary

CFO scenario remains scenario_only and question panel remains shadow-only. Full G31/G32/G33 acceptance is not asserted. Existing implementation receipt retains financial calibration, connector producer and official publication blockers.
