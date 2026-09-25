# Bugfix deployment — 25 September 2026

Both sites deployed and independently checked at 00:46 UTC. Operational release
checks passed; the external edge configuration issue below remains open.

## Changes and fixes

BlockID serving source `0d84e5f7e77aca0b0f9ca82e61feb3024dceec8c` includes the
previous CFO/source/report follow-up plus corrected Stripe observation change
comparison, no stale legacy revenue fallback, explicit callback failure, and
16 existing lint-error repairs. Office import tests exercise actual in-memory
DOCX/PPTX archives. Google consent command queue semantics remain intact.

Focused results: previous combined304 tests; new Stripe95 tests; lint repairs106
tests. Suites overlap and must not be summed. Full source lint before deployment
passed with0 errors/487 warnings. Separate default-memory no-incremental tsc
ran out of heap; canonical8GB deployment tsc subsequently passed with0 errors.

SVI reader-first rollout: bridge08fb7ad6a8f904b11401265aaa57fab911a5d72f on4213
(buildJly9yygllQzEjq9WAoGzu), then full20d7245456f5c25391131c30a46290ff3dede1d6
on4214. Bridge production build passed. Five additional isolated tests against
its immutable release source proved schema3/schema4 EN/VI findings, webHTML,
emailHTML/plaintext and DOCX documentXML parity with full readers. New writer
admission requires both candidate and previous bridge support the quote catalog.

No production reports were generated manually, no paid inference/email sent,
no DB migration or official valuation/scoring activation requested. Scenario
valuation remains scenario-only. Full G31/G32/G33 product/calibration acceptance
is separate from these release gates.

## Outstanding external configuration

Before rollout, public BlockID login reproduced footer email obfuscation,
blocked email-decoder and React418. The source footer fix is included in the
candidate. Separate Google Tags edge injection also caused two CSP violations.
Read-only Cloudflare settings/rules API calls returned403 (Zaraz400), so their
configuration could not be inspected or corrected with available credentials.
No CSP relaxation or script execution allowance was added to hide this issue.
Post-deploy browser results are recorded below.


## Serving identities and final validation

| Site | Source | Build | Active / warm |
| --- | --- | --- | --- |
| BlockID | `0d84e5f7e77aca0b0f9ca82e61feb3024dceec8c` | `yKsqv9v1yzNQFrKVH1zGH` | 4144 / 4143 |
| SVI | `20d7245456f5c25391131c30a46290ff3dede1d6` | `GtvDnB3yUdpYr52nnj5g8` | 4214 / 4213 |

BlockID full pipeline passed **12/12 gates**: incremental secret scan of four
commits, environment/database/Redis, TypeScript, lint, **2,119 suites /42,681
tests passed (2 skipped,0 failures)**, production build,12 candidate browser
smokes,530 pages/1,094 links, source identity and public health,142 post-deploy
hydrated checks passed/2 skipped. The skipped unit cases are the optional G26
PDF/email artifact-writing harnesses. No skipped case is counted as a pass.

An explicit, source-bound, expiring sixth-origin resource permit was validated
against the retained set and resampled by the controller. No origin was stopped
or release artifact removed for this rollout. New BlockID process is supervised
and previous4143 stays warm. After over60seconds plus independent public/browser
checks,4144 was marked operationally verified-good with `--review-deferred`
under the existing founder accelerated policy. The normal30-minute soak and
full financial/product acceptance are not claimed complete.

SVI bridge and full production builds both passed inside aggregate-capped
isolated services. Auth/research protections, dependencies, changed store digest,
process identity and static union were checked. Full promotion admitted the new
quote-reader requirement only once active4214 and warm4213 both supported it.
Both hostname health endpoints returned the expected new build. Existing report
file snapshot comparison found **zero changed prior report files** across each
rollout. This does not certify unknown external job activity or a real new report
canary. No disruptive rollback drill was performed.

Independent Playwright checks after promotion: public BlockID login loads with
readable support email, zero `[data-cfemail]` elements, zero email-decoder scripts
and no reproduced React418. Sample business report loads with its criteria
surface. The two edge Google Tags CSP errors remain; signed-out Google One Tap
messages are separate. SVI scenario renders its signed-out state without console
errors in the observed navigation. Both scenario POST APIs reject anonymous
same-origin requests with401. No authenticated calculation/report canary was
performed; there was no authorized production QA identity fixture in this task.

## Receipts

- BlockID pipeline: `/tmp/followup-blockid-deploy.log`.
- Full unit JSON: `/tmp/blockid-deploy-vitest.json`.
- SVI bridge phases: `/tmp/followup-svi-bridge-{build,launch,static,promote}.log`.
- SVI full phases: `/tmp/followup-svi-{build,launch,static,promote}.log`.
- Forward-reader proof: `/tmp/followup-svi-bridge-forward-parity.json`.
- Public login console: `.playwright-cli/console-2026-09-25T00-40-49-321Z.log`.
- SVI final browser snapshot: `.playwright-cli/page-2026-09-25T00-46-03-932Z.yml`.

These release results supersede the “not deployed” status of the bounded source
slices in the24September follow-up. They do not close the remaining G31/G32/G33
rubric, calibration, official valuation, migration or full-app acceptance gates.
