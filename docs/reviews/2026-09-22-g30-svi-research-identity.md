# G30 — SVI creator scope and research revision foundation

## Scope

Candidate `71bd5323d6dc0b01a4c6dfdcd0f83ca7b78c9b5f` follows financial-source release `1489a1a`. Deployment evidence is recorded below only after acceptance.

New signed-in uploads bind the verified session creator before analysis starts and seal the completed report's canonical and raw-file hashes. Form fields, matching business names, shared deck text and reviewer permissions cannot establish creator access. Same-creator dedupe requires an unchanged sealed report. Anonymous/historical reports are not claimed; anonymous dedupe is disabled, which may increase baseline model usage. Existing public report reading remains unchanged. A failed completion seal preserves the baseline but denies privileged research.

The read-only `/api/research/context?runId=…` endpoint requires authentication, resolves the exact creator/report revision and returns private, non-cacheable context. It explicitly reports new research unavailable. No quote, provider request, credit capture or publication occurs here.

The server-only supplement store supports all 16 SVI question IDs, exact source snapshots and excerpts, supporting and contrary evidence, confidence rationale, limitations and up to five sourced competitors. Missing competitors remain an explicit coverage limit. An injected trusted acceptance policy is required; structural source matching alone is not semantic verification. Each revision is immutable, publication checks the original report identity again, and compare-and-swap prevents stale results from replacing newer results. Export follows accepted history only and has a 128-revision/8 MiB budget; larger exports require future pagination. Revocation is durable. The store is not connected to a public publisher or model provider.

The separate scoring lifecycle endpoint requires scoped lifecycle authorization, keeps operator review distinct from creator access, and coordinates export/revoke/exact bundle erasure using locks and durable tombstones. Production scoring directories remain unconfigured. These scoped primitives do not constitute account-wide deletion.

## Validation and limits

Focused checks passed: six identity-store tests, eight bundled ingest-route cases, three context cases, one real-store context/supplement integration case, twelve supplement cases and twelve scoring lifecycle cases. Tests use isolated fixtures and mocked provider boundaries; no paid inference or customer transaction was performed. Full production build and rollout results follow below.

Private creator records use a dedicated 0700 directory and 0600 HMAC-signed records. Key rotation needs a deliberate migration/keyring policy. Account-wide export/erase/retention integration, historical verified claims and operator seal repair remain open. Rollback to the preceding release can create unbound reports; these remain ineligible for privileged research rather than being automatically claimed.

## Next implementation order

1. Connect canonical creator/revision context to server-derived question scope and retained source evidence; keep all historical reading free.
2. Produce business-specific research with primary sources, contradictory evidence and explicit source gaps; validate relevance and factual entailment before acceptance.
3. Complete account lifecycle and cross-site wallet mapping, then quote/consent/reserve/job/publication/capture with replay and failure recovery. Do not enable unquoted paid calls.
4. Admit qualified measurements into versioned SVI profiles. Repeated evidence or purchased credits never create score increases. Valuation requires its own adequate inputs and methodology.
5. Render accepted research, history and before/after effects in existing question disclosures; retain light UI and parent navigation. New research availability must reflect actual runtime capability.

G30 remains in progress. This phase does not complete independent research, automatic customer rescoring, calibrated valuation or sale-readiness acceptance.

## Live acceptance —22 September 2026,14:49 UTC

Compiled `71bd5323d6dc0b01a4c6dfdcd0f83ca7b78c9b5f`, BUILD `4pGuWYcyoheXn2IoxPxQE`, was promoted to4209. Full production build/type gate passed in1m44s with2 GiB peak memory. Promotion4208→4209, actual rollback4209→4208 and forward4208→4209 passed, with six public static asset samples and81 pre-existing raw report hashes unchanged. Monitor remained active; the new release unit is boot-enabled. Other origins and non-SVI nginx configuration were preserved. Public and direct-origin context probes returned401 with private/no-store and Cookie variance. No admission POST, paid provider call or credit transaction was used for this release.

Logs: `/tmp/svi-g30-identity-{build,launch,static,promote,rollback,forward,finish}.log`. Private immutable rollout receipt is stored with the release SHA under the existing runtime state directory. Warm4208 retains the prior financial-source release. BlockID remains3.33.0 at4108.

Follow-up review confirmed the older `/api/agent/analyze` route can still mutate report bytes without the new creator/quote contract. This release does not claim to have closed that existing route. Immediate next phase contains it and removes misleading executable UI; a separate public edge rule must survive rollback.
