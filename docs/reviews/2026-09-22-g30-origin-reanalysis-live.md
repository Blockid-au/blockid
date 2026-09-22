# G30 v3.31.0 operational release evidence

Live build `6732b1115156de4b0de387498705390af1b0465e`, release
`/data/releases/BltwQdjEmjg0PY1bcBhZE`, port4105, PID1328410,
startTicks446501593. System unit
`g30-origin-4105-384ce8283e-44b29f0f5c34.service` remained active after
launch/deploy tools exited, NRestarts0, memory max6GiB and CPU quota2cores.
Controller-only recovery fix is later source commitd3ab8bb03; it is not the
compiled application SHA.

Production build passed. First runtime snapshot refused a changed dependency
fingerprint; concurrent shared test-cache writes were paused and the unserved
failed artifact preserved. Validated --skip-build reused the same build with
corrected build_sha provenance. Independent runtime freeze and12 candidate
browser checks passed, as did basic endpoint/static/database checks. A transient
CPU-pressure check refused registration after smoke; the subsequent registration
passed unchanged resource thresholds after load subsided.

The first manual public identity probe used Python urllib and received403;
cutover reverted to the verified prior origin. Retrying with the existing deploy
curl probe successfully verified the public build identity. The recovery never
stopped the candidate or previous origin. HTTP403 here is a probe-client result,
not evidence that every browser/customer request failed.

Final resumed promotion completed10:50:49UTC. Local/public homepage, public
auth response shape, exact public/direct SHA, retained process identity and three
previous-release static chunks passed. Operational mark-good at10:51:57UTC
used the explicitly deferred-review60-second policy. Public30-second monitor
samples at10:51:04/10:51:34 returned200 withv3.31.0/SHA6732. This does not prove
continuous24/7 availability or full report/billing correctness. Browser homepage
at10:51 showed white bodyrgb255/255/255, darktextrgb30/41/59, investor business
headline and2input/textarea controls;2console errors remain, no clean-console claim.
Full unit/extended hydrated/all-route review remains deferred; earlier aborted
runs are not retroactively labelled complete gate passes.

User explicitly accepted stopping only inactivev3.29.2 atport4102 after the new
release was stable. Root reverified targetPID1032348/start446018795/releaseSHA,
its exact system unit and live/rollback identities; quarantined4102, then stopped
only `g30-origin-4102-2440abffc9-a0e5e0419d86.service`. PID absence confirmed.
Data/artifacts/pins remain. Live retained count returns to5. Compatible rollback
origins4104(v3.30.1) and4103(v3.30.0) remain running/verified. This is scoped risk
acceptance of unknown old detached jobs, not completed O08 quiescence and not
authorization to stop other origins.

This release adds origin work tracking/drain controls and re-analysis request
contracts. New paid re-analysis execution,0443–0446 migrations, fresh research
worker settlement and full goal/sale-readiness acceptance remain open.
