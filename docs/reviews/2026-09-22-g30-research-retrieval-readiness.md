# G30 R01: retrieval readiness and honest research coverage

Read-only source/provider review on 22 September 2026. This note does not activate a search service or certify current competitor analysis.

## Current source

`web/src/lib/adk/agents/market-research.ts` runs two model calls using general knowledge. Its prompt explicitly asks for qualitative trends and known competitor names. It does not search or retrieve competitor websites. The input is clipped to 4,000 characters. `report-pipeline/gather.ts` stores the result as `competitiveResearch` and adds a generic AI-agent evidence row. That row is not an independently retrieved source supporting individual market claims.

A targeted source search found no Brave, Tavily, Serper, SerpAPI or Exa search adapter in the inspected web/services/scripts trees. A secret-safe check of eight conventional search credential names in `web/.env` found none populated. This is a bounded check, not proof that no external account or differently named credential exists. No credential values were displayed, no account was created and no paid search request was made.

Current implementation must therefore distinguish model-suggested competitors from externally researched competitors. Homepage wording must not promise three to five verified competitors until the retrieval and evaluation gates pass.

## Candidate retrieval services

These are public documentation snapshots, not account quota guarantees or procurement decisions:

- Tavily documents 1,000 free credits/month without a card; basic search costs one credit and advanced search two. Basic extraction costs one credit per five successful URLs. Pay-as-you-go is a separate billed mode and must remain disabled without an explicit budget. [Official credits documentation](https://docs.tavily.com/documentation/api-credits).
- Its search API supports explicit depth, maximum results, domain filters, raw-content selection, usage reporting and disabling automatic parameters. A bounded adapter should pin these options and request source material rather than a generated answer. [Official search API](https://docs.tavily.com/documentation/api-reference/endpoint/search).
- Brave currently lists Search at USD5/1,000 requests with USD5 monthly credits and a published 50 queries/second plan capacity. Account enrollment, spending limits, permitted retention and usable capacity require confirmation before choosing it. [Official plan page](https://brave.com/search/api/).

Tavily basic search is a reasonable first free-quota integration candidate; this is an inference from the documented enrollment and bounded request model, not measured search quality. DeepInfra remains the analysis provider. Search credits and BlockID customer credits are different units and must not share a ledger or imply equal value.

## Required implementation boundary

1. Generate bounded public search queries from the business category, geography, buyer and product facts. Do not send whole private decks, customer lists or confidential metrics to search engines.
2. Discover candidate competitors, then retrieve allowed public primary pages using the existing safe-fetch boundary, with request, byte, redirect and deadline limits. Search snippets are discovery clues, not substitutes for source support.
3. Retain URL, title, retrieval time, publication date when present, content hash, extraction status and exact supporting excerpt. Preserve actual unknown dates. Treat retrieved text as untrusted evidence, never instructions.
4. Compare direct, adjacent and substitute competitors by product, customer, geography, business model and differentiation. Seek three to five relevant businesses; report fewer when fewer are supported. Do not fabricate names or declare an idea unique because a query found no result.
5. Tag every criterion's research coverage as retrieved, partial, unavailable or not applicable. Model-only suggestions remain hypotheses with questions to verify. Missing quota/credentials must produce a visible research gap, not an equivalent-looking completed research report.
6. Cache public source snapshots separately from private per-business reasoning. Enforce server-side request/cost limits, no automatic paid spillover, and review actual source quality on held-out investor cases before enabling the adapter.

R01 remains open. Work on source contracts, quota enforcement and synthetic fixtures can proceed before service activation; live web-research acceptance requires a configured provider and measured results.
