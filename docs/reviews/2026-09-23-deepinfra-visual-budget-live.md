# G30 — DeepInfra visual report analysis and shared budget

Founder approval23/09/2026: total AI at most US$0.50/report, DeepInfra only;
implement and deploy immediately with further test suites deferred.

## BlockID

Compiled SHA `6cb2d2db74cba2e62c1b329c75ad3c3981249594`, BUILD_ID
`8WZOI0zE-kZ6HRJPnFotZ`, active4120; prior4119 retained warm. Deployment completed
about10:26UTC. Production build/type compilation succeeded; candidate/public
HTTP, auth, static delivery and compiled SHA checks succeeded. Test suites, lint,
browser acceptance and rollback drill were deferred, not passed. Origin4120 was operationally marked good after the founder-authorized60-second
minimum soak; extended semantic review remains deferred.

The preceding direct-image intake/OCR phase `c2f7b78f54df6fb99d0e9e1f2c1847f837bbbda5`
was also deployed to4119 before this release. The new phase adds:

- Direct PNG/JPEG/WebP vision via exact DeepInfra model
  `Qwen/Qwen3-VL-235B-A22B-Instruct`, with structured observations and uncertainty.
- Bounded PDF page rendering and PPTX/DOCX embedded-image extraction. At most3
  visual units/document within55s; skipped/unreadable units remain explicit.
- One durable report spend scope across intake, text and vision; maximum500000
  microUSD. Reserve before dispatch using model context/output ceilings, settle
  valid usage, retain full holds for failed/unknown attempts. Missing/corrupt
  ledger or stale locks fail closed; no automatic reset. Price policy expires
  23/10/2026 and requires official-price renewal.
- SVI gateway support for authenticated report scopes and visual extraction.
  This budget does not activate research execution or new billing.

No paid inference probe or model-quality benchmark was run. Live source and
operational health do not certify output accuracy, provider model availability
for a real request, or cost per accepted report. Office extraction does not
preserve complete slide layout; full region provenance UI remains open.

## Origin capacity

Explicit retirement quarantined already-dead4116 and4111 after exact identity,
reference and connection review. No live process was killed; artifacts remain,
active/warm origins were preserved and cap5 was not raised. Missing job history
was recorded as unknown, not quiescence proof. Durable job recovery remains open.

## SVI

Live compiled `1a1fd3f1e3d67ff84481bfbb7f30611b040c9bae` carries the same image pipeline
and shared gateway budget. Financial extraction receives native text separately;
unverified OCR/vision observations cannot qualify financial figures or valuation.
Promotion completed at10:29UTC: BUILD_ID `ti_-Ix4IIvMwU3Mn9Ljw1`, active4207,
warm4206. Both public hostnames matched the build. Build succeeded in1min50s
with2GiB peak; static union and service boot enablement completed. Prior raw
reports changed:0. Operator-triggered provider calls/customer writes:0.

Logs: `/tmp/g30-vision-budget-deploy.log`, `/tmp/g30-vision-budget-mark-good.log`,
`/tmp/g30-svi-image-{build,launch,static,promote}.log`.

Full G30 remains in progress: research, financial methodology/lifecycle, durable
jobs/checkpoints, publication/claim audit, full visual UI and semantic qualification
are not closed by this rollout. No new price, SQL migration, historical report
rewrite or full-input retention activation was performed.
