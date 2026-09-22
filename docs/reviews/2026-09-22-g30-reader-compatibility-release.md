# Reader-first compatibility release

Target v3.29.2; no new unavailable valuation writer/gather policy enabled. New schema and reader/export guards consume explicit unavailable reports without inventing money or falling back from canonical data. Existing producer changes are type narrowing/availability guards; legacy generation behavior remains. Storage write acknowledgments, cache policy, billing and AI routing are unchanged in this slice.

Independent offline baseline: old f88 schema accepts historical available fixture, rejects same fixture with valid new unavailable valuation; old buildValuationView throws reading methods.filter. Reader slice includes persisted unavailable fixture through unchanged snapshot/assembled/evaluation storage readers and HTML free/standard rendering. Seven focused suites/88 tests passed. Full standalone typecheck first exhausted4GB heap;8GB follow-up exposed narrowing diagnostics now corrected. No final standalone typecheck pass is claimed here; production build remains authoritative under founder-authorized deferred-review profile.

New writers/final findings/full light foundations follow this compatible-reader release. This is not full report accuracy, full question-level research, billing fulfillment or sale acceptance. No production DB or provider call was made for the source slice.

## Live release evidence

22 September2026: build86235095118ad24b02c70c61506418c56ee72656
(v3.29.2) deployed to retained port4102, release C8VaSA60Xqyp5_N_hhUfK.
Production build, endpoint/static checks,12 browser smoke checks,531-page
internal crawl and140 hydrated checks passed (2 auth checks skipped).
Full unit suite was explicitly deferred: deploy ledger records9/10 gates,
1 skipped, not a complete review pass. Gates ended09:29:12UTC.
After deploy command exited0, PID1032348 survived under systemd unit
g30-origin-4102-2440abffc9-a0e5e0419d86.service, PPID1, NRestarts0.
Public samples since09:27:54 returned200 and expected SHA; direct trusted
status/controller ownership verification passed. One manual homepage browser
load succeeded with2 pre-existing console errors; no clean-console claim.
The explicit founder60-second operational soak policy applies; full quality
review remains deferred. Prior release processes remain retained.
