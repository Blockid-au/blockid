# Public market discovery foundation — 2026-09-22

Implemented as an unused server-only adapter in `web/src/lib/research/discover-public-sources.ts`. Existing retrieval, report producers, UI, wallet and scoring callers are unchanged. No production configuration, key, provider call or customer credit transaction was made.

## Behavior and admission

`discoverPublicSources` takes up to three distinct reviewed public queries and an injected provider. Only trusted server admission may set `providerRequestsApproved` and `approvedForPublicSearch`; these fields MUST NOT come directly from browser JSON, uploaded decks, AI output or unreviewed customer text. The exact approved query is retained with query ID, provider and timestamp. No deck or report payload is accepted. Structural screening rejects URL/email/control-character and obvious credential-shaped inputs, but cannot prove arbitrary prose is public. A server review/approved-query construction policy is still required before activation.

The adapter requires a provider explicitly; no environment autodetection, default scraping, provider fallback, retries or pagination. Hard limits: three requests, ten unique candidates overall, 128 KiB decoded HTTP body per request, and at most 15 seconds for the whole operation (default ten). Requests run sequentially. Aborts stop new requests, cancel Brave transport and bound waiting even for an injected provider that ignores cancellation. Already accepted candidates survive later failures as partial coverage. Failed calls are still attempts and may incur provider charges.

Candidates carry URL, query provenance, timestamp, `citable: false` and `evidenceStatus: not_retrieved`. Search titles, descriptions/snippets, raw responses and provider error text are never retained. URLs pass existing `publicSourceUrl` and additional literal-IP/local-host screening. Page retrieval must independently resolve/pin public DNS using existing safe retrieval: discovery does not authorize fetching. Empty completed search is distinguishable from unavailable/partial; it never proves no competitor exists.

## Brave verification and activation gates

Official [Web Search documentation](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started) verifies `GET https://api.search.brave.com/res/v1/web/search`, `X-Subscription-Token`, `q`/`count`, and `web.results[].url`. The adapter selects web-only results, disables spell correction/text decoration, refuses redirects, caps streaming bytes and strips everything except URL before returning to discovery.

The [official pricing page](https://brave.com/search/api/) checked on 2026-09-22 lists Search at **$5 per 1,000 requests** with **$5 monthly credits**. This does not establish this account's plan, balance, concurrency quota, storage rights or a permanently free service. Do not use the advertised credit as guaranteed production budget.

Before activation:

1. Operator must provision a server-only Brave API key (suggested configuration name `BRAVE_SEARCH_API_KEY`) and explicitly approve the actual plan/spend cap. The factory accepts the key as an argument and reads no environment itself.
2. Add atomic daily/monthly budget and concurrency admission upstream, including failed-call accounting, account quota verification and cancellation policy. Per-request caps here do not prevent many concurrent jobs spending money.
3. Bind public query approval to authenticated report/question scope; redact confidential deck facts before approval. Do not expose provider creation/admission flags as a public endpoint.
4. Pass returned URLs through safe retrieval, source authority/independence checks, claim-specific evidence review and contradiction assessment before synthesis. Snippets are not evidence, and 3–5 verified competitors are a target, never fabricated to fill a quota.
5. Integrate accepted immutable supplement publication, wallet reservation/capture/refund and reviewed scoring separately. Discovery does not deduct credits or increase SVI/valuation.

## Focused verification

15 mocked tests passed covering explicit admission, unapproved/sensitive queries, provenance/deduplication, grant/private/network URL screening, query/result caps, malformed provider data, redacted failures, pre-cancel, timeout, partial cancellation, official HTTP shape, body cap, invalid JSON/schema, quota response, redirect rejection and stalled response stream. No live Brave requests were used. Build/deploy remain root-controlled.
