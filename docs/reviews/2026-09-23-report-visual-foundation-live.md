# G30 — Report quality fixes and visual foundation rollout

23/09/2026. This receipt covers the named slices only; the full G30 plan remains
in progress. Founder requested implementation followed by immediate deployment,
with further test suites deferred. Deferred checks are not passes.

## BlockID live

- Compiled SHA: `ae954a4b33f2769229b7f51856527d195530e97f`.
- BUILD_ID: `rqtfiGT_tF-CuKIj1R5wj`; active origin4118, retained warm4117.
- Public `/api/status` and direct origin identity matched the compiled SHA;
  public/local HTTP200, auth health and static delivery succeeded. Origin4118
  is operationally marked good under the founder's accelerated/deferred-review
  policy. This does not certify report semantic quality or a new inference run.
- Release completed about09:31UTC. Logs: `/tmp/g30-immediate-deploy.log`;
  state is owned by `g30-serving-state.py`, not this document.

Delivered code:

1. Scoped DeepInfra timeout strikes isolate the failing model; alternative models
   remain available. Response abort/error/close is handled, with safe transport
   timings. Scoped calls cannot unexpectedly replay through a subprocess.
2. Valuation method labels reflect their ARR heuristics; shared assumptions are
   explicit. New report backtest medians below10 samples are withheld. This is
   not a recalibration of valuation formulas or a rewrite of historical reports.
3. `/api/pitchdeck/ocr` no longer sends truncated base64 as ordinary text to an AI
   model or calls that result vision. It performs bounded PNG/JPEG/WebP decode
   and local EN/VI OCR, preserves the existing entitlement gate and charges no
   credits. Unqualified `forceLlm` returns503; unreadable data is incomplete.
4. Visual metadata contracts bind file/page/slide/region to site, tenant, input
   and revision. Local image preparation normalizes orientation and strips EXIF.
   This foundation does not activate multimodal report analysis or a new upload UI.

DeepInfra remains the primary report provider. No paid benchmark, new model
activation, price change, SQL migration or customer report rewrite was performed.

## Verification disposition

Before the latest no-further-tests instruction, the broad suite recorded42,313
passes and one outdated dossier-copy assertion. That assertion was corrected;
the focused dossier/OCR run passed13 cases. Visual foundation/endpoint/worker
checks passed23 cases, TypeScript and focused lint passed, and a real local OCR
worker read a synthetic financial image correctly. Earlier report review also
recorded1,321 relevant tests and PDF visual inspection.

After the instruction, no additional test suites were started. Deployment used
`--quick`, `G30_DEFER_UNIT_TESTS=1`, `G30_DEFER_EXTENDED_REVIEW=1`, and
`G30_DEFER_CANDIDATE_TESTS=1`. Build, resource/schema/identity admission and basic
HTTP/static checks remained. Lint, unit and browser acceptance for the final
release are deferred; no full-suite pass is claimed. Notifications were disabled.

## Origin capacity

The explicit retirement tool (`1d430ec5e`) retired inactive BlockID4114 and4110
after identity, dependency, active/warm health and tracked-work checks. Both
reported zero tracked activities/unresolved jobs. All release artifacts remain.
The operator acknowledged incomplete detached/external-job coverage; retirement
is not evidence that durable jobs/checkpoints are complete. Current/warm origins
were not stopped and the capacity limit was not raised.

## SVI rollout

Source `ac8f26d23e224bbb4475b6205f5b755cd9a66ab8` is live on4206, BUILD_ID
`tcgMxVsQAfD3eEsvaRZIE`, with4205 retained warm. Both public hostnames reported
the new BUILD_ID; service boot enablement is installed. It adds the same metadata
contract and rejects raster bytes disguised as text/document input. Direct image
analysis remains unactivated. No pre-existing raw report changed during rollout.

The old inactive4206 process (`60940cd8c45d1bc4b2b53185345f2a102c573697`) was
retired after exact PID/start/cwd/unit checks, no effective proxy/dependent
environment references or live TCP connections, and no known nonterminal shared
cache jobs. Its artifact remains. Untracked-work coverage is still incomplete
and recorded as such. The first compiler admission refused transient memory PSI;
the unchanged prepared candidate resumed only after a fresh admission passed.
Build succeeded with2GiB measured peak. No additional tests or rollback drill
were run after the founder's deferral; retained warm identity was verified.

SVI logs: `/tmp/g30-svi-visual-{build,build-resume,launch,static,promote}.log`.
The private controller receipt records completion at09:35UTC and zero provider
calls/customer writes. Source/runtime evidence is also recorded in the SVI repo
at `docs/reviews/2026-09-23-visual-source-foundation-live.md`.

## Remaining scope

Document/slide rendering, real vision interpretation, qualified model routing and
complete attempt accounting, visual claim verification, intake/evidence UI and
cross-site report/export integration remain open in SOT §5.1. Research, financial
lifecycle, persistence and sale-readiness work elsewhere in G30 are not closed
by these deployments. See the canonical plan and component implementation
receipts for their dependencies; benchmark/test deferral is not a quality claim.
