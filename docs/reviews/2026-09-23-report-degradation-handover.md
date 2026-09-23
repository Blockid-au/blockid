# Report pipeline degradation — evidence handover (2026-09-23)

**Status: UNRESOLVED.** Two fixes are live (`832ee5438`, `97f6a1ef7`); a real report run
still degrades 8/8 chapters. This note records what is measured, what is ruled out, and the
one instrumentation step that will settle it. No further guessing.

## Symptom

`node --env-file=.env scripts/run-self-analysis.mjs --report` (tsx-loads `src/`, so it runs
the current source) ends:

```
✗ self-report failed: report fully degraded: 8 deterministic chapters and a placeholder
  summary after 36 calls
diagnostics: failed in complete · deadline wave - · providers struck deepinfra
```

16 × `DeepInfra … failed: Worker timeout (60s)`. Two timeouts strike the provider out for the
whole run (`RUN_STRIKE_THRESHOLD = 2`, `lib/ai/run-strikes.ts:24`), and the report path is
DeepInfra-only under `policy: "blockid-report-v1"` (`ai-client.ts:2515`, `:1770`), so there is
no fallback and every chapter falls back to its deterministic card.

## Ruled out by measurement (all against the live key, 2026-09-23)

| Hypothesis | Test | Result |
|---|---|---|
| Model too slow | one chapter prompt per candidate, `max_tokens 2600` | V3.2 20 s · Qwen3-235B 16 s · V4-Flash 6.5 s |
| Prompt too large | 2.3k → 9.3k → 18.5k → 37k → **74k** prompt tokens | 10.7 s → 23 s → 9.8 s → 2.3 s → **7.9 s** |
| Parallelism | 8 concurrent chapter calls via `fetch` | all 8 in ≤ 7 s |
| Stale keep-alive socket after idle | 2 calls, 70 s idle, 2 more on the same agent | 0.2–1.1 s, no stall |
| The reasoning-off parameter | same call with / without `chat_template_kwargs:{thinking:false}` | 7.2 s vs 6.1 s — not the cause |
| Concurrency/queue limits | defaults `AI_MAX_CONCURRENT=120`, `AI_QUEUE_WAIT_MS=45 s` | not binding |
| Host load | load5 0.59–1.8, memory PSI ≈ 0 during the failing runs | healthy |

## The one reproduction that DID stall — and why it is not the whole story

`https.request` + the shared keep-alive agent, 8 parallel, real 87 KB body:
**7/8 answered in 3–7 s, 1 hung the full 60 s.** With `agent: false`: **8/8 in 5.4 s, 0 stalls.**
That is why `97f6a1ef7` removed connection reuse (`ai-client.ts` `inprocessFetch`).

**But the live run after that deploy still produced 16 timeouts.** So keep-alive reuse was *a*
stall mode, not *the* cause. Do not treat the transport change as the fix; it is retained
because it removed a measured stall and costs ~100 ms of TLS per call, but it did not restore
reports.

## Next step (the only one that separates the remaining cases)

Instrument `inprocessFetch` (`ai-client.ts`) at the timeout site to record, per timed-out call:
body bytes, whether `req` ever emitted `socket`/`connect`/`response`, time to first byte, and
the number of in-flight AI calls at that moment. That distinguishes:

1. request never left the process (socket never assigned → our pooling/eventloop),
2. request sent, no bytes back (provider or network),
3. response started then stalled mid-body (read path).

Until one of those is observed, any further change is a guess. Note `callDeepInfra` also awaits
`reserveResearchAttempt(opts.attemptBudget, …)` before the request (`ai-client.ts` ~:1535) —
worth logging its duration in the same record, since it is new and sits on this path.

## Live state at handover

- `97f6a1ef7` live on port 4117, 11/12 gates, `errors_1h` 0, uptime 24 h 100 %, key pages 200.
- `832ee5438` marked good after its 30-minute soak.
- Report quality KPI unchanged: `/api/status.tbr_quality` still `watch`.
