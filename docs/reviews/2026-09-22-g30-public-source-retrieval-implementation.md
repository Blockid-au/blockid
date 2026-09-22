# G30 R01 supplied-source retrieval phase

Implemented in an isolated worktree from foundation `f89a7a3f6`; no production deployment, customer mutation, search API call, inference or purchase was performed by this task.

## Delivered

- Market gathering reads up to five distinct supplied market links and the first business website link, bounded together. The exact existing question “Who are the main competitors?” and project/business scope accompany the records. No private deck text is sent to a search engine, and this phase does not extract arbitrary URLs from deck text.
- Reuses `funding/fetch-source.ts`: public-address DNS guard and pinned transport, 2 MiB response cap. Research pins five-second request timeout, zero retries and zero redirects. Credentials, query strings, fragments, non-HTTPS/nonstandard ports and known document/share/storage hosts are refused before requesting; rejected URLs are replaced by a withheld marker in records. No cookies or authorization headers are sent.
- Records original safe URL, title, role, fetch time, unknown publication date, normalized-text SHA-256 and an excerpt limited to 180 words/1,600 characters. No complete source body is persisted.
- Distinguishes `not_run`, `not_found`, `blocked` and `found` page retrieval. Requests/cap/target count accompany the result. `found` means readable page, never a verified competitor. No-result does not mean the idea is unique.
- Provides the records to market analysis as untrusted source material. Model-only market output is explicitly labelled hypotheses, and no longer receives a generic evidence register entry or citation ID.
- Stores `appendix.publicResearch` as an optional validated ReportV2 field so the final saved document preserves retrieval provenance. Legacy reports remain valid. A JSON/save-read-shaped schema regression verifies the optional field survives parsing.

## Deliberate limits and next phase

All records have `relevance: not_assessed`, `citable: false`; `verifiedAlternatives` remains zero. Reading a company website does not prove buyer/product/geographic relevance, truthful self-claims or independent corroboration. Next implementation must assess relevance and match exact supporting excerpts to proposed claims before admitting them to the citation register, then produce actual comparable-business analysis. This commit does not meet the completed R01/R02 or investor report quality gates by itself.

Search discovery is explicitly `not_run` because no configured approved provider was found in the prior bounded readiness inventory. There is no speculative paid adapter activation, model-name substitution or invented list of three to five businesses. No search-provider integration is claimed.

The current record contains the initial excerpt, not a semantic passage selector or PDF extractor. Redirected pages, inaccessible sources, PDF/binary data and oversized documents are unavailable in this phase. DNS-resolution latency follows the existing safe-fetch helper; five seconds bounds the request after resolution, not every possible resolver delay. GATHER retains its existing outer timeout behavior. Full background job cancellation and research SLA remain separate work.

Only the market criterion is wired. Source-role `market_or_alternative` is supplied-link scope, not verified competitor classification. No new public source cache or cross-customer reuse is introduced. Web/export evidence drill-down rendering and claim qualification remain subsequent phases; persisted appendix data alone does not mean those interfaces display it.

## Targeted checks

64 tests passed across public source retrieval, GATHER and dispatcher tests. Includes budget limit, absent/404/403/429 states, credential/token rejection, loopback refusal before transport, truncation/redirect refusal, no invented verification, and preservation of existing gather behavior. An additional rerun of the retrieval suite covers ReportV2 JSON round-trip persistence. TypeScript/lint outcomes are recorded in the agent handoff after completion.
