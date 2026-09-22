# G30 R01/R02: investor-facing public source details

Implemented from foundation `43e4c8a23` in an isolated branch. This is source transparency inside the existing report appendix, not completion of the R02 research adapters or verified competitor analysis.

## Result

A compact “Public sources checked” / “Nguồn công khai đã kiểm tra” disclosure shows pages read and the pending relevance status before expansion. Opening it reveals business scope, the competitor question, source titles, roles, fetch timestamps in UTC, unavailable publication dates, and explicit limits on interpretation. Each readable page has a second disclosure for its exact stored excerpt. Blocked/not-found/not-run sources have plain-language reasons rather than raw internal error codes. Exceeding the source cap is visible.

Native details/summary provides keyboard operation without a client runtime or new research request. Source links open separately with noopener/noreferrer; rejected token-bearing/unsafe destinations are not linked. Excerpts render as escaped text. Every interaction has a 44 px target and focus styling; layout uses the report’s existing light semantic tokens, a single column and wrapping long URLs. “Back to report overview” targets the existing dashboard anchor. Existing parent navigation is unchanged.

The block appears whenever the saved ReportV2 appendix contains research records, including free-tier reports. Opening already-collected details has no credit charge, unlock requirement, fetch or payment action. Legacy reports without records omit the block instead of fabricating historical research.

## Skill and verification

Applied `/home/dovanlong/.codex/skills/ui-ux-pro-max/SKILL.md`; design-system lookup recommended minimal layout, readable light contrast and trust/authority styling. Existing typography/tokens were retained to avoid introducing another template. Targeted static render checks cover EN/VI, legacy absence, stored excerpt/date, safe links, blocked reasons, free-tier inclusion, escaping and native closed disclosures. Full TypeScript, broad regression and live browser checks were deliberately not repeated in this branch under the founder’s current pace preference. Root handles integration/release.

## Limits

No claim is made that a page read is a verified competitor or independent confirmation. All records remain relevance pending/non-citable. The UI does not activate search/model inference, compare competitors, validate numeric market claims or change the report score. Other locales currently use the EN fallback for this new block. This change covers the report web appendix, not PDF/DOCX export rendering or the separate lightweight analysis screen. Export parity and full source-detail browser acceptance remain open in the plan.
