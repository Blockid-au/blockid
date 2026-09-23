# G30 — Native document fidelity and visible extraction limits

Founder continuation23/09/2026, under the existing immediate-deploy/no-additional-
tests instruction. DeepInfra-only US$0.50/report policy remains unchanged.

## BlockID source

Source `2590f30b0` corrects two concrete extraction defects:

- PDF parse failure could become printable PDF container bytes, and paragraph
  breaks could become invented slide numbers. PDF business extraction now fails
  empty; only explicit diagnostic callers can request a raw byte view. Actual
  parser page numbers and empty-page positions are preserved. A parser without
  page boundaries supplies document-level text, not fabricated page citations.
- The installed PPTX parser returns `text: string[]`, while intake called `.trim()`
  as though it returned a string and swallowed the resulting error. Text blocks
  now join correctly. Source references use actual slide part paths because the
  library enumerates relationships, not authoritative presentation order.

DOCX text is treated as document-level evidence rather than arbitrarily sliced
slides. Temporary DOCX/PPTX files use private modes and are removed in `finally`.
PDF native extraction uses the in-memory buffer and creates no intake temp file.
Existing visual extraction remains partial/unverified and bounded.

Colocated expectations were updated for the changed contract; no tests were run.
Production build/type compilation succeeded. Compiled SHA
`1c30818be0ec2b7714bb5625b04e9aa673aabfa4`, BUILD_ID `NWK633eY6vi2qGYp00XeM`,
active4121/warm4120. Local/public HTTP200, auth/static health and public SHA
matched at11:09UTC. Additional test suites and browser acceptance were deferred.

## SVI source

Source `ac9241a` exposes existing image/document processing metadata in the EN/VI
analysis timeline, both as individual files finish and when extraction completes.
The UI distinguishes partial/unverified processing, unreadable/unsupported content
and units skipped by time/image limits. An expandable list shows every available
unit state. Candidate `c70aaaee3e2a402154170c7c371b752f1a2cb26d` also retains bounded
extraction metadata on new completed/fallback reports and renders it on overview
and report/print surfaces. No image bytes or additional source text are retained.
Legacy reports are unchanged; absence of metadata does not establish complete
coverage. Email-export coverage parity remains open. It does not claim model
observations are verified financial facts.

## Origin capacity

Superseded BlockID4117 was explicitly drained and stopped using fingerprint
`896e0d2d9bb9b63d5c72cd3000ac1a19ec349a5a10570b4cef0762573c585586`.
Tracked activities and unresolved jobs were both0. Detached/external/database job
ownership coverage remains unknown and was acknowledged; full quiescence is not
claimed. Artifacts remain, active4120/warm4119 were protected, cap5 unchanged.

## Remaining quality work

Full slide rendering, visual-to-native reconciliation, precise region citations,
accepted evidence publication, material-claim validation and qualified numeric
inputs across all BlockID report paths remain open. This phase does not certify
model quality or close G30. No paid inference probe, browser acceptance, SQL
migration, price change or historical report rewrite was performed.

## Concurrent Claude changes reviewed

The first BlockID deployment was stopped before build when another session
committed application changes. It restarted at `1c30818be0ec2b7714bb5625b04e9aa673aabfa4`,
which includes `2590f30b0` and Claude's internal HTTP rewrite fix. Later
`bbb0dda83` changes only deployment probe timeouts, not the application bundle;
compiled identity remains separately recorded. Incremental gitleaks scanned4
commits after previously scanned `6cb2d2db7`, with no findings.

SVI `dcf2b07` adds declared-size/count Office archive admission before inflation;
`dc8c5be` checks redirect destinations before following them. These were read and
integrated before pinning the SVI candidate. This does not claim comprehensive
SSRF isolation or independent semantic quality certification. A separate Claude
session ran its own checks; their results are not attributed to this deployment.

Claude later added `eaffe936f`, correcting DeepInfra mock responses to return
the requested exact model ID. This matches the already-live budget permit
contract; it changes tests only and does not alter the compiled application.

## Sharp packaging correction before freeze

Claude's `048ceb92b` identified missing sharp0.35.4 ESM files in standalone
releases. The in-flight build had already loaded its older tracing configuration.
The operator paused only its deployment controller while the compiler completed,
then copied all13 `dist/*.mjs` files from the installed exact matching sharp
version into the still-unfrozen standalone artifact. Hashes matched before
resuming freeze/promotion; no retained/live release was modified in place.
The source tracing fix is retained for future builds. Compiled application SHA
remains `1c30818be`; this explicit packaging augmentation is part of the receipt.
[Dependency hash evidence](evidence/2026-09-23-sharp-esm-packaging.json).

Candidate GET `/api/intake` and `/api/investor-portal/ai-generate` returned405
(expected POST-only routes), and public GET `/api/intake` also returned405.
This checks route loading only; no customer report or paid inference was invoked.
The retained warm4120 predates this packaging correction and has a known intake
module limitation; it is not certified as a fully working visual rollback.

## Final live checkpoint — 23/09/2026,11:14UTC

BlockID4121 is operationally marked good under the founder-authorized accelerated
soak; semantic review remains deferred. Compiled SHA and package augmentation
are recorded above. SVI compiled `c70aaaee3e2a402154170c7c371b752f1a2cb26d`,
BUILD_ID `8WWZDqy40r1FC3YTTrSg3`, active4208/warm4207. Both public hostnames
matched the build; service boot enablement and static union completed. Build
succeeded in2min7s, peak1.8GiB. Initial prelaunch admission refused CPU reserve;
the unchanged built artifact resumed after load fell, without raising limits.
Prior raw reports changed:0. Operator-triggered provider calls/customer writes:0.

Logs: `/tmp/g30-document-provenance-deploy-resume.log`,
`/tmp/g30-document-provenance-mark-good.log`,
`/tmp/g30-svi-document-{build,launch,launch-resume,static,promote}.log`.
