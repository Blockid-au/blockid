# Market research for valuation

Founder request 2026-09-26. For the company being analysed, the report's GATHER stage looks up the market size, the main competitors and public reference values of comparable companies (funding rounds, valuations, revenue multiples). It uses at most 5 sources. The results **support** the CFO valuation and never replace it.

Code: `web/src/lib/research/market-research*.ts`, `web/src/lib/valuation/market-references.ts`. Tests: `market-research.test.ts`, `market-research-providers.test.ts`, `market-references.test.ts`, `components/tbr/v2/market-references.test.tsx`, plus blocks in `gather.test.ts` and `valuation-chapter.test.ts`.

## What is searched

Queries are built only from public identifiers, and there are at most 5 of them:

- the company name, and only when a public website link was supplied (a stealth company is never searched by name)
- the website host
- the detected sector category
- the country (Australia)
- the year

Deck text, criterion notes and financials are never sent to a search engine.

## Provider chain (one analysis)

1. **Brave**. Runs through `discoverWithBraveBudget` and its reservation ledger in `~/.local/state/blockid-research/brave-reservations/`. The manual ledger `brave-budget-YYYY-MM.json` counts as committed spend. The monthly cap comes from `brave-policy.json` (`maxPaidUsdPerMonth`, US$5). Each query reserves the US$0.005 list price, because the free allowance is unknown.
   - **quota_exhausted** means Brave returned HTTP 200 with no web results while the monthly figure in `x-ratelimit-limit` / `x-ratelimit-remaining` is 0 (a 402 counts too). The remaining queries are cancelled after 1 request, and `market-research-cache/brave-quota-state.json` makes Brave skip for 24 h or until the month turns.
2. **Claude CLI WebSearch**. At most 1 call, used when Brave is exhausted, unavailable or empty. The command is `claude -p <prompt> --output-format json --model haiku --tools WebSearch --allowedTools WebSearch --permission-mode dontAsk --no-session-persistence --strict-mcp-config --disable-slash-commands --json-schema <schema>`. These flags were verified on CLI 2.1.143 with one manual smoke against "Atlassian": 36 s, 4 turns, 5 URLs.
   - WebSearch is the only available tool.
   - The environment is HOME, PATH and LANG only.
   - The working directory is the empty `~/.local/state/blockid-research/claude-cli-cwd`.
   - It is killed with SIGKILL at its timeout. At most 2 run at once per process.
   - Results are marked `retrieval: "claude_cli_websearch"`.
3. **Otherwise the step is skipped**: `status: "unavailable"` and the report carries on.

## Selection, reading and extraction

- **Ranking** picks at most 5 pages, 1 per host. The order of preference is the company's own site, then statistics, regulator and government bodies, then established business press.
  - Dropped: paywalls and login walls (AFR, The Australian, Bloomberg, Statista, IBISWorld, PitchBook, CB Insights, LinkedIn and similar), press-release wires, SEO market-report mills, review aggregators, links with a query string, and file links.
- **Reading** uses the R01 bounded fetcher (`fetchText`): DNS-pinned SSRF guard, 2 MB cap, no retry, at most 2 redirect hops. Each hop is re-checked and must land on a fetchable public page.
- **Extraction** is 1 DeepInfra call: `taskClass: classify`, which resolves to DeepSeek-V4-Flash inside the per-report US$0.50 scope. The model sees only the number-bearing passages. Code then keeps a fact only when:
  - its quote appears verbatim in the fetched page
  - every number it carries is written in that quote

  Years, dates, currencies and geographies that the quote does not carry are cleared.

## Caps and cost per analysis

| Item | Cap |
| --- | --- |
| Search calls | 5 or fewer (Brave queries + Claude CLI run) |
| Page fetches | 5 or fewer |
| Extraction calls | 1 (about US$0.001–0.003) |
| Wall time | 45 s, absolute |
| Brave spend | at most US$0.025 per analysis, within the US$5/month cap |

The ledger's own caps (`BRAVE_FREE_QUERY_CAPS`) are 3 per question, 6 per batch, 30 per day and 900 per month. That means about 6 uncached analyses a day can use Brave. After that the step falls back to the Claude CLI, and the 7-day cache absorbs repeats.

The step runs in parallel with the 60 s research agent, so it does not lengthen the critical path. The free tier and partial re-runs are **cache-only**: they make no call.

## Cache

The cache lives in `~/.local/state/blockid-research/market-research-cache/<sha256>.json`. The directory is owner-only (0700) and files are 0600.

- **Key**: the normalised company, website host, sector and country, plus the month.
- **How long entries last**:
  - results with verified facts, or a clean "no facts" answer: 7 days
  - unavailable or failed runs: 6 h
- **Pruning**: files are pruned on write (expired first, at most 2,000 kept).
- **Retention**: Brave or CLI result lists and snippets are never stored. Only pages BlockID fetched itself, and quotes checked against them, are stored.

## Where the results appear

- `appendix.marketResearch` (tier `public_unverified`, never "verified").
- **Valuation section**: a "Market references" block with up to 5 sources, figures with links and dates. The free tier does not show it.
- **Cross-check row "Public market references (n sources)"**: the researched revenue multiples × the company's own qualified ARR. It appears only when the valuation chapter itself is available. It never becomes a method, a weight or a consensus input. When the valuation is not estimable, the valuation section shows no figures and the block moves to the appendix.
- **Dashboard-v4 valuation tile**: a one-line hint, "n public market references".
- **MPC / market criterion prompt**: a competitor table marked as public and unverified.

## Raising the Brave quota (founder action)

The key currently authenticates (HTTP 200), but the subscription's monthly quota is 0 (`x-ratelimit-limit: 2, 0`). Until that changes, every analysis falls back to the Claude CLI.

1. At <https://api-dashboard.search.brave.com>, subscribe the key's app to a plan with a monthly allowance. The ledger reserves US$0.005 per query, so US$5 covers about 1,000 queries a month. Check the current plan price on the dashboard.
2. Keep `maxPaidUsdPerMonth` in `brave-policy.json` at or below 5. The ledger enforces it.
3. Delete `~/.local/state/blockid-research/market-research-cache/brave-quota-state.json`. Otherwise Brave stays skipped for up to 24 h.
4. The next paid analysis uses Brave. `reasons` in `appendix.marketResearch` shows `brave_ok`.
