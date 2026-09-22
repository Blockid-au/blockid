# G30: preserve audited business analysis in criterion details

## Concrete lost-value boundary

`AgentAnalysisResult.content` contains the criterion's extended analysis. Chapter
assembly kept only its first line/highlights and a few risks. The final report
therefore could not present the full analysis in “What we looked at”, even when
it already existed. Reading the original text during chapter assembly would be
unsafe: the grounding audit later revises `criterionResults.content`.

## Implementation

At final `buildReportV2`, attach optional `detailedAnalysis` to each criterion
from the **post-audit** result. Require one matching criterion audit, supported
grounding, no uncited claims or remaining critic issues, non-degraded analysis,
and no applicable high-severity consistency conflict. Rejected detail carries
`withheld` with empty text/citations. Missing or ambiguous audits remove prior
detail. Prior chapter detail never overrides the final audited result.

Keep original narrative wording (including uncertainty, comparisons or investor
implications only where actually written). Retain citation attachments only if
they resolve to a non-missing evidence row and remain cited in final prose.
Distinguish citation-only checks from model-plus-citation audits. Neither label
means an independent market verification or financial validation.

The optional schema is backward compatible. Business-findings projection exposes
the same object. Free baseline reading remains available; existing fixed-layout
print trimming at level 2+ removes the extended narrative along with other
criterion detail. No new paywall, score, billing action or research request.

## Acceptance and limits

Focused tests cover final revised prose versus stale original, unresolved/removed
citations, rejected or uncited financial claims, degraded output, consistency
conflict, missing/duplicate/wrong-section audits, schema/projection preservation,
free reading and existing print trimming, and rejecting malformed persisted
withheld records. Existing report, schema and pipeline checks are run separately.

This preserves analysis already produced in future full pipeline reports. Older
saved reports are not fabricated or backfilled. A narrative withheld by quality
checks stays unavailable. It does not implement paid re-analysis, new competitor
research, criterion question generation or independent verification. Existing
criterion summaries/strengths/risks retain their existing separate publication
behavior; this phase does not upgrade their audit guarantees.
