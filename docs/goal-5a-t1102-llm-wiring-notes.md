# Goal 5A — T-1102 LLM Wiring Notes

Short design note explaining the choices made when the nightly C-level review
orchestrator moved from stub mode (T-1100) to real Anthropic Messages API calls
(T-1102). Read this alongside `docs/goal-5a-t1100-scaffold-notes.md` and
`docs/goal-5a-autonomous-quality-gate.md`.

## What T-1102 delivers

- `web/scripts/nightly-clevel-review.mjs` — the T-1100 orchestrator gains a live
  path that calls `client.messages.create()` per persona and writes the
  Anthropic response into the same `{persona}-review-{version}.md` file the
  scaffold used. Stub mode is preserved as a fallback (auto when
  `ANTHROPIC_API_KEY` is unset; forced when `--stub` is passed).
- `web/scripts/lib/clevel-prompts/{cto,cfo,cdo,ciso,cro,cmo}.md` — six persona
  system prompts, one per role.
- `web/scripts/lib/clevel-review-manifest.json` — the per-persona evidence file
  list, extracted out of the script so future edits do not require code
  changes.
- `docs/goal-5a-t1102-llm-wiring-notes.md` — this file.

## Why the prompts live in `.md` files

The system prompts for the six personas are the most-tweaked part of this
pipeline. They will change every time the CEO, the CTO, or the compliance team
learns something new about what a good persona review looks like. Three
consequences:

1. **Non-engineers can edit them.** Product / marketing / legal can PR a prompt
   change without touching TypeScript or ESM code. The prompts are plain
   Markdown, no escape sequences, no template variables to break.
2. **Diffs are readable.** A one-line tone change lands as a one-line diff.
   Prompts inlined as JS string literals become mega-diffs the moment somebody
   reflows a paragraph.
3. **The prompts are self-documenting.** The `.md` files render on GitHub,
   Cursor, and any IDE; nobody has to run the orchestrator to see what the CTO
   agent is being told.

Same reasoning applies to the evidence-file manifest — extracting it into
`clevel-review-manifest.json` means a persona owner can add a new file to their
persona's evidence list without opening the ESM script.

## Token budget math

Per persona, the request rendered by `buildEvidenceBlob()` is:

- system prompt (persona `.md`)         ~1–2K tokens
- prior-review body (capped at 60KB)    ~10–14K tokens
- curated evidence files (3–4 files)    ~2–8K tokens each, cap 60KB each

That averages **~15K input tokens per persona** at steady state (once the prior
review has grown to a real review, not a stub).

Output cap is `max_tokens: 8000`, but real persona reviews land around 4K
output tokens based on the beta.6 evidence files.

Nightly total: **6 personas × ~15K in + ~4K out ≈ 114K tokens/night**.

Model default is `claude-sonnet-5` at the published rates in the claude-api
skill: **US$3 / MTok input, US$15 / MTok output** (there is a US$2 / US$10
introductory rate through 2026-08-31; the sticker rates are used here to be
conservative).

- Nightly input cost:  90K tokens × US$3  / 1M  = US$0.27
- Nightly output cost: 24K tokens × US$15 / 1M  = US$0.36
- **Nightly total:     ~US$0.63 (~AUD$0.98 at 0.64 USD/AUD)**
- **Monthly total:     ~US$19  (~AUD$29)**
- **Yearly total:      ~US$230 (~AUD$350)**

The task specification mentioned AUD$36/month as the target budget; the actual
cost lands below that under sonnet-5 and comfortably below when the
introductory US$2 / US$10 rate applies. The `cost_usd_estimate` in
`clevel-review-history.jsonl` records the per-run figure so cron-health /
routine-heartbeat can catch a runaway job the same night it happens.

## Circuit breaker (follow-up work — not in this PR)

Once `clevel-review-history.jsonl` accumulates a week of data, the nightly cron
route should read the last seven `records`, count entries where
`personas_skipped.length > 0` or `mode === "stub"` unexpectedly, and skip the
run if the failure count exceeds five in seven. That check belongs in the cron
route (`web/src/app/api/cron/nightly-clevel-review/route.ts`), not in the
script, so the script stays runnable from a shell during development.

When the circuit trips, the route should fire a Telegram alert via the
existing operator-alerting surface (`lib/telegram.ts` if it exists, otherwise
the same channel `cron-health` uses). Do not silently no-op — the whole point
is to make the outage visible.

## Model fallback tree

- `MODEL_DEFAULT = "claude-sonnet-5"` — the standard choice; adaptive-thinking
  ready, near-Opus quality on the review workload, priced modestly.
- `MODEL_CHEAP = "claude-haiku-4-5"` — activated when `CLEVEL_REVIEW_CHEAP=1`
  is set on the process env. Same request shape, ~3x cheaper input, ~3x cheaper
  output. Quality is noticeably weaker on synthesis-heavy tasks; use this only
  for CI / staging or as an emergency cost lever.
- Not wired: an automatic degradation on rate-limit / overload responses. If
  `client.messages.create()` throws, the script logs the error and falls back
  to `scaffoldMarkdown()` for that persona — the whole run does not abort.

Both model IDs are sourced from the `claude-api` skill and validated against
its Current Models table at the time of writing. Update `PRICING_USD` in the
script (and this section of the doc) when the catalogue shifts — the cost
estimate consumes the constants directly.

Do NOT invent model names. If you need to add a new fallback, look it up in
the skill first, do not paste from memory.

## What T-1103 will do

T-1103 adds an adversarial "reviewer of reviewers" pass. One extra Anthropic
call runs after the six per-persona reviews land; its job is to read all six
outputs and flag:

- **Contradictions** where two persona reviews recommend incompatible
  actions (e.g. CFO says raise pricing, CRO says drop trial paywall).
- **Coverage gaps** where a finding in one review implies a follow-up that
  none of the other personas addressed.
- **Confidence anomalies** where a persona marks a claim as certain but the
  same file:line was cited as UNKNOWN by another persona.

The output lands at `web/content/reports/reviewer-of-reviewers-{version}.md`
and appends a `reviewer_of_reviewers` sub-record to
`clevel-review-history.jsonl`. Budget: one extra ~30K-token call = ~US$0.15
per night. Same model choice tree (sonnet-5 default, haiku-4-5 cheap).

T-1103 depends on T-1102 landing cleanly — no changes to the per-persona
prompt shape, no changes to the persona `.md` file paths, and no changes to
the history JSONL contract (only additions).
