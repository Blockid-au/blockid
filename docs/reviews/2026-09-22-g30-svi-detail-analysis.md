# G30 annex — question-level detailed analysis and evidence-led updates

Implementation annex under [G30 SOURCE OF TRUTH](../plans/SOURCE-OF-TRUTH.md); this does not create a separate execution queue. SVI source integrated at `919f911`; deployment evidence is recorded separately.

Status: isolated implementation + delivery plan, 22 September 2026. This annex feeds the BlockID G30 source-of-truth; it is not a replacement goal or permission to activate billing. Scope: startupvalueindex.com company results, every company submenu and EN/VI variants; shared research contracts with blockid.au.

## What source inspection established

- `CompetitionTab.tsx` renders q05/q06 summaries and deck claims; it does not expose the existing `state.competitors` landscape. Saved competitor advantage/weakness/moat fields already exist.
- `SixteenAnswers.tsx` contains 16 questions with current per-field reanalysis controls. `AnalyzeButton.tsx` calls `/api/agent/analyze`; the route applies an IP limit, calls `analyzeField`, then `applyFieldNarrative`. It does not establish a scoped authenticated quote/credit-consent transaction. **Do not relabel or reuse this as verified paid market research.** Hardening/replacing this legacy writer is a prerequisite to authoritative new publication.
- `per-field-analyze.ts` supplies existing business context to a language model. `competitor-discovery.ts` likewise uses deck context; it has no retrieval provenance per competitor. Its system prompt prefers archetypes while the user prompt requests real companies: resolve this conflict in the new evidence-first producer. Existing saved content must remain labelled as prior model analysis, not independently verified research.
- `RunState` has answer `evidence_ids` but no corresponding complete evidence registry. Competitor entries have no source URLs/date/claim bindings. An evidence ID alone cannot establish a verified citation. Do not fabricate clickable sources or present old scores as new measurements.
- BlockID `web/src/lib/reanalysis/{scope,request-contract,quote-consent,scoped-public-research,scoped-assessment}.ts` provides relevant boundary foundations. SVI's 16 questions map to related BlockID criteria, not equivalence with all 52 guiding questions.
- SVI `src/lib/scoring/{svi-longitudinal,svi-report}.ts` has versioned longitudinal scoring, fixed profile weights, provenance-bound admitted measurements, supersession and freshness. Admission configuration remains OFF pending account/ownership/lifecycle and publication gates.

## Phase A — safe reader improvement (implemented in this isolated patch)

`SavedAnalysisDetails.tsx` is a shared read-only native disclosure. Integrated into Overview, Dashboard, Report, Market, Competition, Claims, Financials, Valuation, Cap Table, Data Room, Due Diligence and IC. Each section selects relevant saved answers; Report includes all 16. Competition additionally exposes saved alternatives, geography, reported advantages/limitations and moat explanation.

Default view stays compact: one clearly labelled opening control, saved/no-credit subtitle. Opening reveals readable paragraphs, recorded evidence references (explicitly unresolved), missing-source explanation, research availability and return-to-business-overview link. EN/VI; existing light semantic tokens, 44px minimum control, keyboard focus, no animated/nested scroll region. No fetch, mutations, provider calls, credit deduction or score/valuation changes. Existing content is not upgraded into verified evidence. Remove stale customer-facing 'Phase 3' promise on Competition.

Native disclosure follows the [W3C disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) for showing/hiding supporting content with keyboard interaction. UI/UX Pro Max was applied for progressive disclosure, contrast and touch targets; its generated dark-style suggestion was rejected because the user explicitly requires a light template. No broad template change is introduced.

## Phase B — evidence and research worker (P0 before paid activation)

1. Bind actor/account, site, canonical business ID, original report ID/revision/hash and exact scope. Resolve account/ownership on the server; a public slug or source report URL is not authorization. Define a per-scope publication lock and reject stale revisions.
2. Snapshot deck-derived facts, business model, customer job, geography, sector/stage, claimed differentiation, current answers and their source references. Record ambiguities (including unknown stage) rather than making silent assumptions.
3. Produce a question-specific research plan and query budget. Retrieve allowed public sources through an SSRF-safe fetch/search layer; obey access restrictions, do not upload private decks to public search queries, redact personal/confidential inputs. Search queries should use minimum public business context.
4. Store immutable evidence records: canonical URL/domain, title/publisher, publication date if known, retrievedAt, extracted short supporting passage and content hash, source type, business/scope/claim relation and verification status. Distinguish primary evidence, independent reporting, founder claim, model inference and unresolved conflict. Syndicated stories or multiple pages supporting the same underlying fact are one fact for score purposes.
5. Generate structured answers from retrieved passages. Require a claim-to-evidence binding for each material comparison/numeric claim. Check entity identity, unit/currency/time period and source-date consistency before publication. Missing data is 'not established', never zero or inferred fact.
6. Audit unsupported claims and counter-evidence. Withhold unsupported passages; allow an honest incomplete result with useful findings and explicit research limitations. A result without material new verified findings cannot produce a manufactured score/valuation change.
7. Publish an immutable supplement only after quality acceptance. Preserve baseline and previous supplements; update a version pointer atomically. No overwrite of raw legacy RunState files. Export includes the same cited findings and qualification labels.

### Competition supplement: mandatory content

- Research 3–5 real direct/indirect alternatives where source evidence supports identification. If only 1–2 can be verified, show those and the search limitation; never pad to five with guesses. Archetypes are separately labelled context, not verified companies.
- Explain why each is comparable: customer/job, product scope, geography, operating stage and date. Explicitly separate a much larger incumbent or a substitute from a direct same-stage rival.
- Compare product capability, public pricing/business model, observed traction (source/date and metric definition), distribution, switching costs and defensibility. Unknown fields remain unknown. Distinguish vendor claims from independently supported observations.
- Answer 'Is somebody else already doing it better?' by dimension and buyer segment: better / worse / different / not enough evidence, with named sources and reasoning. Do not collapse everything into an unexplained winner score.
- State what this means for the investment thesis and valuation assumptions, confidence, as-of date, contradictory findings, and what additional evidence could overturn the conclusion. Give management 3 concrete follow-up questions tied to gaps.

### Research tasks by question/menu

| Scope | Required business-specific research and output |
|---|---|
| q01 business | Product, paying buyer/user, workflow and revenue model; compare deck positioning with published product/customer evidence. |
| q02 problem | Frequency/severity, current workaround, evidence of willingness to pay; distinguish need from purchase intent. |
| q03 market | Bottom-up TAM/SAM/SOM with explicit units/geography/period and serviceable constraints; triangulate external sector evidence without adding overlapping segments. |
| q04 outcomes | Relevant successes and failures; stage/model/geography comparability and survivorship bias; outcomes are context, not forecasts. |
| q05 competition | Verified 3–5-alternative matrix described above; stronger/weaker/different by dimension. |
| q06 differentiation | Switching costs, distribution, IP/data rights, reproducibility and imitation risk; test claimed moat against alternatives. |
| q07 runway | Dated cash/burn, committed versus potential financing, base/downside runway; request private financial evidence when not public. |
| q08 economics | Cohort-consistent CAC/LTV/payback/margins/retention; separate audited, management-supplied and estimated inputs. |
| q09 claims | Claim-by-claim supported/contradicted/unverified matrix and materiality; trace every status to source passages. |
| q10 risks | Geography/activity-specific primary regulator/registry sources; existence of a rule is not proof of company breach or compliance. |
| q11 valuation | Stage-appropriate methods, comparable selection, currency/date, disclosed inputs, sensitivities and missing prerequisites. |
| q12 ownership | Actual cap table, convertible terms, option pool and round assumptions; labelled scenarios where verified terms unavailable. |
| q13 anti-thesis | Strongest counter-evidence and falsifiable failure conditions with likelihood uncertainty; explain investment consequences. |
| q14 diligence | Prioritized evidence requests with decision impact and responsible party; market research cannot replace confidential documents. |
| q15 next meeting | Specific question, why it matters, expected evidence and what changes the conclusion for each management follow-up. |
| q16 monitoring | Baseline dated KPIs, future measurement cadence, units and adverse thresholds; changes require distinct observations over time. |
| Team / data room / IC | Verify published role/track record cautiously; evidence completeness/permissions for data room; synthesize above with traceable key claims for IC. |

## Phase C — paid request and efficient model routing (P0)

- Distinct controls: **View detailed analysis** opens saved content free; **Research this question** initiates a scoped quote only when enabled. Until activation, show a plain availability message, not a charge-looking disabled/fake button.
- Server-issued quote binds actor/site/business/report revision, selected scope, research budget, model policy, wallet, exact credits, expiry and idempotency key. Show credits, available balance, expected output, limitations and cancellation/charging terms before explicit confirmation. Never charge on disclosure open.
- Insufficient balance routes to verified pricing/top-up checkout, returning to the same business/question. A successful payment funds the wallet; it does not auto-consent to a stale research quote. Obtain a fresh quote where required.
- Reserve once; idempotent job starts once; capture only accepted, published work under the agreed policy; release on pre-publication failure/cancellation/no deliverable. Define partial-output charging before launch, with clear receipt. Duplicate clicks/retry/browser refresh do not double-charge.
- DeepInfra is the primary provider as requested. Use cheaper validated models for extraction/query planning/deduplication, stronger validated reasoning for cross-source synthesis/material contradictions. Cache public evidence with expiry; reuse unchanged source hash and scope inputs. Model output is not retrieval evidence.
- Validate exact current model ID, context capacity, structured-output behavior, per-token price and provider data handling against official catalog at activation. Free-only fallbacks require verified $0 pricing AND sufficient current quota AND measured quality; no assumption of unlimited quota, no paid automatic fallback. Bound cost, tokens, queries, concurrency and retries; lower-priority queues can wait rather than silently downgrade quality. No model or price was selected from stale memory in this phase.
- Shared BlockID foundations must be integrated with SVI account mapping, reviewed admission/lifecycle and legacy-writer exclusion. Source presence alone does not prove production-safe billing. Do not activate 0443–0446 migrations or paid routing through this UI patch.

## Phase D — justified SVI and valuation updates (P1 after B/C)

The user's 'cộng thêm' means incorporate newly evidenced value, not reward expenditure. New information can increase, decrease, leave unchanged or leave insufficient evidence for either SVI or valuation.

- Keep historical score methodology and longitudinal SVI separately labelled. Preserve current fixed profile/weights and reference cohort unless a reviewed, versioned methodology change is approved. Never let an LLM choose per-run weights or convert prose sentiment into authoritative measurements.
- Map accepted findings into the existing admitted-measurement contract only when a defined metric, unit, observation period, source passage/hash and review status are present. Independent facts, not source-count, credit count or number of research runs, determine contribution.
- Use the existing unbounded index design with its fixed weight budget, freshness, correction/supersession and retraction. Do not simply sum prior index values or append each repeated finding as a new positive contribution. Report old/new values, changed component points, method/profile version, cause and evidence. Same evidence repeated produces no uplift; contrary evidence can lower scores; missing/retracted measurements do not masquerade as zero observations.
- Valuation is a separate dated scenario calculation, not SVI × a universal dollar multiplier. Use supported revenue/margin/cash-flow/cap-table/comparable inputs, stage-appropriate methods and confidence ranges. Explain changed assumptions and sensitivities. Mark insufficient evidence when inputs do not support a defensible estimate. Do not add prior and new enterprise values together; explicitly distinguish enterprise value from equity value and pre/post-money.
- Freeze a research supplement with old/new SVI and valuation evaluation status. Publish all dependent visible values from the same accepted revision, or show 'pending assessment'; never display a new score beside an old valuation as if both were updated.

## Phase E — final UX / rollout (P1)

Question card: concise answer, confidence/date, 'View detailed analysis', and enabled scoped research action only after gates. Detail view order: answer → business-specific reasoning → comparison/scenario → strongest supporting and contrary evidence → gaps/follow-up → SVI/valuation effect → source details/history. Start with one reading column; use responsive cards instead of oversized mobile comparison tables. Keep the current company/menu/question in URL, provide breadcrumbs and return-to-overview, restore focus on close. Research progress states: quoted, reserved, retrieving, analyzing, checking, published, partial, failed/refunded. No fake progress percentage.

Roll out saved-reader UI first, then private operator research, then limited authorized users with explicit quotes, then public availability after capture/replay/ownership gates pass. Immutable release, warm known-good rollback, brief smoke on actual routes and report artifact/hash parity. A UI rollback must not lose accepted supplement receipts. Do not remove prior report data or replay provider jobs during deploy.

## Required acceptance before full feature is called complete

- Auth/ownership/CSRF/revision binding, invalid/expired quote, insufficient balance, duplicate requests, retry after provider timeout, failure release and duplicate capture.
- 3–5 supported competitor alternatives OR explicit shortfall; unsupported numbers/names withheld; contradictory primary evidence shown; missing/private evidence not fabricated.
- Repeated fact leaves index unchanged; negative evidence lowers affected component when applicable; stale/superseded/retracted facts respected; historical revision reproducible; no unapproved scoring profile.
- Valuation missing-input and downside cases; no automatic uplift from credits or SVI; all shown methods tied to actual inputs.
- EN/VI, 375px/desktop, keyboard open/close/focus, readable light contrast, working parent links, private content not leaked via sources/exports/cache.
- Read-only opening generates no network mutation/AI request, score write or charge. Build and actual release browser checks remain root deployment gates.

## Isolated validation evidence

16 focused EN/VI server-render assertions passed: saved refs and competition text, escaped HTML, collapsed default, no actionable fake billing button, unavailable state, localized return path, missing-answer output. All company TSX files syntax transformed successfully. This is not a full production build, a paid run or an assertion that legacy API charging/research is fixed. No report files, runtime settings, live releases or customer balances changed.
