# G34 research annex — investor screening, comparable systems, lifecycle email

Compiled 25/09/2026 from four web-research agents, two read-only source audits and the dashboard design agent (ui-ux-pro-max). This is the evidence base for [G34](../plans/g34-biz-trust-report-v4-quality-2026-09-25.md). It is not a plan, and it does not certify BlockID compliance or accuracy. Items marked **(U)** rest on secondary sources, unopened primaries or market convention; verify them before they drive scoring logic.

**Public-repo note.** This repository is public. Stage emphasis below is given as relative bands only. Numeric SVI weights belong in private configuration (G34 D24-f).

## 1. Canonical BlockID dimensions

Source: the `svi-scoring` skill and `web/src/lib/report-pipeline/dimension-owners.ts`.

| Code | Canonical name | Lead agent (code) | Primary criteria (code) |
|---|---|---|---|
| FTV | Founder Traction Velocity | CHRO | founder_profile, team, team_structure |
| MPC | Market Pull & Category | CMO | market, gtm_strategy, idea |
| PTD | Product-Tech Depth | CTO | code_git, website |
| TRE | Traction Revenue Evidence | CRO | customer_size, revenue |
| CGH | Capital Governance Health | CFO | **none** |
| IRI | Investor Readiness Index | CLO | documents, dataroom |
| LCO | Legal Compliance Observability | CLO | **none** |
| SVM | Strategic Vision & Moat | CEO | roadmap |

The research agents grouped legal and IP items under their own labels. §3 below redistributes them to the canonical meaning:
- **IRI** covers data-room and diligence readiness.
- **LCO** covers legal, IP, regulatory and compliance evidence.

## 2. Comparable systems — what they score and what page 1 shows

| System | Score / signals | How it is built | Page 1 first | Lesson for BlockID |
|---|---|---|---|---|
| CB Insights | Mosaic 0–1000 on 4 M's (Momentum, Market, Money, Management); Commercial Maturity 1–5; Exit Probability | 4 M's equally weighted; claims 83% accuracy; 30+ / 70+ signals, back-tested ([Mosaic](https://www.cbinsights.com/mosaic-health/), [CM](https://www.cbinsights.com/commercial-maturity/)) | "Outlook": past (maturity), present (health), future (exit) | **Stage ladder separate from quality**; state accuracy |
| PitchBook | VC Exit Predictor, Opportunity Score 0–100 percentile | 46K outcomes; 75% out-of-sample; excludes personal founder traits ([TechCrunch](https://techcrunch.com/2023/03/20/pitchbooks-new-tool-uses-ai-to-predict-which-startups-will-successfully-exit/)) | AI overview, deals, team, score | **Percentile**, exclude demographic proxies, "not a substitute for diligence" |
| Crunchbase | Growth / Heat 0–100; predictions | ML; IPO precision only 59% vs funding 95% ([docs](https://data.crunchbase.com/docs/predictions)) | Prediction tiles; reasons paywalled | Don't hide reasons; label weak predictions |
| Dealroom Signal | 1–100: completeness + team + growth + timing | Timing peaks about 12 months after a round; no accuracy published ([KB](https://knowledge.dealroom.co/knowledge/dealroom-signal-1)) | Signal beside firmographics | **Completeness ≠ quality**; round-readiness timing signal |
| Tracxn | 0–100 "investability" | Average of **percentiles** on Size, Execution, Growth, Team ([FAQ](https://w.tracxn.com/faqs/what-is-tracxn-score)) | Score atop profile | Simple, explainable percentile composite |
| Harmonic / Specter | Thesis relevance; 0–10 competitiveness | ML on headcount by department, stealth, talent flows | Team and headcount growth | Outside-deck signals (hiring, traffic) |
| Affinity | Relationship strength | Email and calendar recency and frequency | Warm paths | Evaluator "warm path" (future) |
| AlphaLens (Deckmatch) | Custom rubric triage | Deck → structured record **traced to source slide** ([site](https://alphalens.ai/solutions/inbound)) | Record + rubric + routing | **Citation per answer to slide or page** |
| V7 Go | Deal score vs fund playbook | Extracts ARR, churn, EBITDA → pass / fail / review ([V7](https://www.v7labs.com/agents/ai-deal-screening-and-triage-agent)) | Metrics → score → gaps | **Triage verdict + missing-items list** |
| Hebbia Matrix | Question × document grid | Every cell cited ([Hebbia](https://www.hebbia.com/blog/how-private-equity-teams-use-hebbia)) | The grid | 52-question matrix with citations |
| Equidam | 5 valuation methods | Scorecard / Checklist / 2 DCF / VC; **method weights change by stage** ([Equidam](https://www.equidam.com/five-startup-valuation-methods/)) | Range + method weights | Show method weights and applicability |
| KingsCrowd | 1–5 stars × 5 axes | Relative ranking (U) | Stars + analyst text | Relative bands |
| Gust | Readiness tips | Historical deals (6K startups) | Suggestions | Founder improvement path |
| Techboard (AU) | Funding detection | **ASIC share-issuance filings** vs announced deals; many AU raises unannounced ([Startup Daily](https://www.startupdaily.net/topic/funding/unknown-knowns-techboard-dug-up-unannounced-startup-investments-and-discovered-its-potentially-the-majority-of-funding/)) | Directory | **ASIC cross-check** of cap table and round claims |
| AirTree / Square Peg / Blackbird / Startmate (AU) | Public frameworks | AirTree paper: Product, Market, Team, Differentiation, Unit Economics, Financials, Deal Terms ([AirTree](https://www.airtree.vc/open-source-vc/the-airtree-investment-process)); Startmate "spikiness not smoothness" ([Startmate](https://www.startmate.com/writing/startmate-accelerator-frequent-questions-and-misconceptions)); Blackbird 7 founder traits ([BB](https://www.blackbird.vc/blog/what-blackbird-looks-for-in-founders-today)) | — | AU-native criteria; **spike flag** |
| VC memo (Sequoia, Visible) | Standard headings | Exec summary → problem → solution → market → traction → competition → GTM → team → financials → **risks & mitigations** → ask ([Visible](https://visible.vc/blog/investment-memo/), [Sequoia](https://sequoiacap.com/article/writing-a-business-plan)) | Thesis in 2–3 sentences, strongest proof first | Page-1 thesis line |

**Best-in-class page 1 (ordered):**
1. Identity + stage label + as-of date.
2. One-sentence thesis.
3. Headline score as a peer percentile, with 3–4 components.
4. Past / present / future outlook.
5. Key-metrics strip.
6. Team block.
7. Top risks and what would change the view.
8. Valuation range with method weights.
9. Evidence status with a link to the exact source.
10. Trend and freshness.

**Pitfalls:**
- Black-box scores.
- Completeness scored as quality.
- Stale, US-centric data (AU raises often unannounced).
- Uncalibrated predictions presented as fact.
- Demographic or credential proxies in founder scores (Dealroom's age and "elite education" factor).
- Self-reported data that can be gamed.
- AI extraction missing chart-only financials.

## 3. Screening criteria catalogue by canonical dimension

**Evidence tiers:**
- **T1** system of record: Stripe/Xero connector, bank statements, ASIC extract, IP Australia register, ATO portal.
- **T2** counterparty-signed: contracts, POs, IP assignment deeds, founder agreements, reference calls, reviewed accounts.
- **T3** company-produced: model, dashboard screenshot, deck.
- **T4** founder-stated.

Only T1–T2 may be labelled **verified**. T3–T4 display as company- or founder-stated. Evidence demanded rises with stage; AirTree: seed diligence is qualitative, growth diligence is quantitative ([AirTree](https://www.airtree.vc/open-source-vc/what-to-include-in-your-startups-data-room)).

**Stages:** PS pre-seed · S seed · A Series A · B+ Series B and later.

**Benchmarks are percentile bands, not cut-offs.** 2021 boom-era figures (Bessemer) sit far above 2025 medians:
- High Alpha 2025: median growth 19–21%, CAC payback 8 months at $1–5M ARR ([HA](https://www.highalpha.com/saas-benchmarks)).
- SaaS Capital 2025: median NRR 101%, GRR 91% ([SC](https://www.saas-capital.com/blog-posts/what-is-a-good-retention-rate-for-a-private-saas-company/)).
- AU round medians (Cut Through Venture 2025): A$1.0M pre-seed / A$2.5M seed / A$11M Series A / A$30M Series B+ ([CTV](https://www.cutthrough.com/insights/state-of-australian-startup-funding-2025)).

### FTV — Founder Traction Velocity

| ID | Criterion | Stage | Indicator | Evidence | Red flag |
|---|---|---|---|---|---|
| FTV-01 | Founder–problem fit ("why you") | PS–A | Domain years; customer conversations | CV T3, references T2 | Can't say why them |
| FTV-02 | Can build and sell in-house | PS–S | Technical + commercial founders present ([First Round 10-yr](https://www.geekwire.com/2015/first-round-releases-10-years-of-investment-data-and-some-of-it-will-surprise-you/)) | Founder agreement T2, git history T1 | Core product outsourced |
| FTV-03 | Full-time commitment | PS–S | Share of founders full-time | Payroll / STP T1 | All part-time |
| FTV-04 | Industry experience / track record | All | Prior exits: 30% vs 18% success ([Gompers et al.](https://www.nber.org/papers/w12592)) | ASIC director history T1 | Unverifiable claims |
| FTV-05 | Velocity between checkpoints | PS–A | Change in shipped work and metrics | Changelog, analytics T1 | Same deck months later |
| FTV-06 | Founder agreement + vesting | PS–A | Cliff vesting (U: 4y/1y convention) | Signed SHA T2 | Departed founder with large stake |
| FTV-07 | Talent magnet | S–B+ | Senior hires, attrition | Org chart, ESOP register | No senior hires post-A |
| FTV-08 | Candour / self-awareness | All | Reference checks (U) | References T2 | Inflated metrics in diligence |
| FTV-09 | Founder-to-CEO scaling | A–B+ | Executive bench ([Ewens & Marx](https://academic.oup.com/rfs/article-abstract/31/4/1532/4604800)) | Board minutes T2 | CEO bottleneck |

Never score age, school or gender. PitchBook deliberately excludes personal traits, and Azoulay et al. find the mean founder age of top-growth firms is 45 ([AER:I](https://www.aeaweb.org/articles?id=10.1257%2Faeri.20180582)), which contradicts any youth heuristic.

### MPC — Market Pull & Category

| ID | Criterion | Stage | Indicator | Evidence | Red flag |
|---|---|---|---|---|---|
| MPC-01 | One-sentence purpose and problem | PS | Clear declarative sentence ([Sequoia](https://sequoiacap.com/article/writing-a-business-plan)) | Deck T3 | Buzzwords |
| MPC-02 | Validated customer pain | PS–S | Interviews, LOIs, pilot → paid (poor PMF 43% of failures, [CB Insights](https://www.cbinsights.com/research/report/startup-failure-reasons-top/)) | LOIs T2 | No customer contact |
| MPC-03 | ICP and buyer defined | S–A | Named ICP, buyer vs user | CRM export T1 | "Everyone" |
| MPC-04 | Bottom-up market size | All | Credible path to a large revenue pool (U threshold) | Sourced model T3 | Top-down "1% of TAM" |
| MPC-05 | Why now | PS–A | Named enabling shift | Citations | No catalyst |
| MPC-06 | Competition + wedge | All | Named rivals, win/loss | Win/loss log T3 | "No competitors" |
| MPC-07 | Repeatable GTM | S–B+ | Payback, sales cycle, channel mix | CRM, ad accounts T1 | Founder-only selling at A+ |
| MPC-08 | Global ceiling beyond AU | S+ | Non-AU revenue share | Revenue by geography T1 | AU-only TAM |
| MPC-09 | Customer concentration | S+ | Top customer share (U threshold) | Receivables ledger T1 | One customer > 30% |

### PTD — Product-Tech Depth

| ID | Criterion | Stage | Indicator | Evidence | Red flag |
|---|---|---|---|---|---|
| PTD-01 | Live product in use | PS–S | Active users | Analytics T1 | Demo-only at seed |
| PTD-02 | Cohort retention flattens | S+ | Cohorts plateau; DAU/MAU ([a16z](https://a16z.com/16-startup-metrics/)) | Analytics T1 | Decay to zero |
| PTD-03 | Code owned in-house | PS–S | Commit share by staff | Git T1 | Agency holds repo |
| PTD-04 | Reliability / scalability | A+ | Uptime, incident rate | Status page, tech DD | Single point of failure |
| PTD-05 | Security and privacy engineering | S+ | SOC 2 / ISO 27001 / Essential Eight | Certificates, pentest T2 | Customer data, no pentest |
| PTD-06 | AI compute economics | S+ | Gross margin after inference ([BVP AI 2025](https://www.bvp.com/atlas/the-state-of-ai-2025)) | Cloud bills T1 | Thin wrapper, ~25% GM, no path |
| PTD-07 | Proprietary data / technology | A+ | Data assets | Data inventory | Commodity stack |
| PTD-08 | Roadmap to "Act II" | S+ | Expansion products | Roadmap T3 | Feature list only |

### TRE — Traction Revenue Evidence

| ID | Criterion | Stage | Indicator (percentile bands) | Evidence | Red flag |
|---|---|---|---|---|---|
| TRE-01 | Verified revenue | S+ | MRR / ARR | Stripe/Xero connector, bank T1 | Spreadsheet only |
| TRE-02 | Pre-revenue proxies | PS | LOIs, paid pilots, waitlist conversion (Startmate cohort 67% pre-revenue) | LOIs T2 | LOIs booked as revenue |
| TRE-03 | Growth rate vs stage | S+ | T2D3 / Q2T3 (AI) / 2025 medians | T1 | Decelerating below median |
| TRE-04 | Net revenue retention | A+ | Median ~101%; strong ≥120% | Billing cohorts T1 | < 100% |
| TRE-05 | Gross revenue retention | A+ | ≥ 90% "table stakes" | T1 | < 80% |
| TRE-06 | Gross margin | S+ | Software ~70%, AI lower ([BVP](https://www.bvp.com/atlas/scaling-to-100-million)) | P&L T1/T2 | Services counted as SaaS |
| TRE-07 | CAC payback | A+ | Median ~8 months at $1–5M ARR | CRM + P&L | > 24 months |
| TRE-08 | LTV:CAC | A+ | ≥ 3:1 (U) | T1 | Assumed churn |
| TRE-09 | Burn multiple | S+ | < 1.5 great (U, Sacks) | Bank + ARR T1 | > 3 |
| TRE-10 | Magic number | A+ | ≥ 0.75 ([Scale VP](https://www.scalevp.com/blog/saas-metrics-a-history-of-the-magic-number)) | T1 | < 0.5 |
| TRE-11 | Rule of 40 | B+ | ≥ 40 | Reviewed accounts T2 | Far below, no plan |
| TRE-12 | Revenue quality | All | Recurring share; related-party share | Ledger T1 | Related-party / one-off |
| TRE-13 | Contracted backlog | A+ | Signed, not yet live | Contracts T2 | Verbal pipeline |

### CGH — Capital Governance Health (new primary criteria; today there are none)

| ID | Criterion | Stage | Indicator | Evidence | Red flag |
|---|---|---|---|---|---|
| CGH-01 | Cap table matches register | All | Cap table = ASIC = company register ([s169](https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/cth/consol_act/ca2001172/s169.html)) | ASIC extract T1 | Mismatch; undocumented SAFEs |
| CGH-02 | Founder ownership | S–B | Stage median bands (U, Carta via secondaries) | Cap table T1 | Very low founder stake early; dead equity |
| CGH-03 | Dilution per round | All | ~18–20% seed / A (U) | Term sheets T2 | > 30% in one round |
| CGH-04 | Runway / default alive | All | ≥ 18–24 months post-raise (U); default alive ([PG](http://paulgraham.com/aord.html)) | Bank + forecast T1 | < 6 months; default dead |
| CGH-05 | Round history vs AU medians | All | CTV 2025 medians | Instruments T2 | Serial bridges |
| CGH-06 | Convertible overhang | PS–A | SAFE / note total and caps | Instruments T2 | Stacked uncapped SAFEs |
| CGH-07 | Board and governance | A+ | Board cadence, minutes | Minutes T2 | No board post-A |
| CGH-08 | ESOP pool | S+ | Pool documented | ESS plan T2 | Options promised, undocumented |
| CGH-09 | Investor quality | All | Credible lead ([Kerr et al.](https://www.nber.org/papers/w15831)) | Investor list | Unvetted investors |
| CGH-10 | Financial controls | S+ | Monthly close; audit from B | Xero T1 | No bookkeeping |

### IRI — Investor Readiness Index

| ID | Criterion | Stage | Indicator | Evidence | Red flag |
|---|---|---|---|---|---|
| IRI-01 | Data-room completeness by stage | All | Required items present for the stage (AirTree list) | Data room T3/T2 | Missing basics |
| IRI-02 | Financial model and assumptions | S+ | 3-statement or driver model with sources | Model T3 + reconciled T1 | Hockey stick, no drivers |
| IRI-03 | Metrics reconciled to systems of record | S+ | Deck metrics = connector / bank | T1 | Deck ≠ ledger |
| IRI-04 | Round terms and ask clarity | All | Raise, instrument, use of funds, milestones | Term sheet / deck | Ask without milestones |
| IRI-05 | Reporting cadence | A+ | Monthly investor or board KPIs | Board packs T2 | No reporting rhythm |
| IRI-06 | References available | S+ | Customers and prior investors reachable | Reference list T2 | Refuses references |
| IRI-07 | ESIC eligibility documentation | PS–S | Early-stage test + 100-point / principles test (ATO; page returned 403, secondaries) | Adviser letter T2 | Claimed without advice |
| IRI-08 | R&D Tax Incentive registration | PS–A | 43.5% refundable offset < A$20M turnover; register ≤ 10 months ([ATO](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/incentives-and-concessions/research-and-development-tax-incentive/r-d-tax-incentive-rates-and-entitlements/refundable-and-non-refundable-offsets)) | AusIndustry registration T1 | Unregistered claims |
| IRI-09 | Liquidity path readiness | A+ | Plausible routes and buyers (G31 LQ overlay) | Comparables T3 | No logical buyer |

### LCO — Legal Compliance Observability (new primary criteria; today there are none)

| ID | Criterion | Stage | Indicator | Evidence | Red flag |
|---|---|---|---|---|---|
| LCO-01 | All IP assigned to company | All | 100% of founders / staff / contractors signed (contractor IP needs written assignment, [IP Australia](https://www.ipaustralia.gov.au/understanding-ip/who-owns-ip)) | Assignment deeds T2 | Pre-incorporation IP with founder |
| LCO-02 | Registered IP | S+ | Trade marks / patents | IP Australia register T1 | Trade mark conflict |
| LCO-03 | Open-source licence / freedom to operate | A+ | Clean scan | Scan report T2 | GPL in distributed code |
| LCO-04 | Regulatory licences | All | AFSL / TGA / sector licences held | Registers T1 | Unlicensed activity |
| LCO-05 | Privacy Act / APPs | S+ | Policy, breach log | Policies T3 | Undisclosed breach |
| LCO-06 | Corporate structure | All | Single Pty Ltd, constitution | ASIC extract T1 | Trust / offshore mismatch |
| LCO-07 | Material contracts in writing | S+ | Signed MSAs; change-of-control review | Contracts T2 | Handshake deals |
| LCO-08 | Employment and tax compliance | S+ | Super / STP, BAS lodged | ATO / STP T1 | Sham contracting, ATO debt |
| LCO-09 | Litigation / disputes | All | None pending | Court searches T1 | Undisclosed disputes |
| LCO-10 | Related-party dealings | All | Disclosed, arm's-length | Board approvals T2 | Founder-owned supplier |
| LCO-11 | Insurance | S+ | PI / cyber / D&O | Policies T2 | None |
| LCO-12 | Key-person continuity | S+ | Cover, succession | Policy T2 | Single-person knowledge |

### SVM — Strategic Vision & Moat

| ID | Criterion | Stage | Indicator | Evidence | Red flag |
|---|---|---|---|---|---|
| SVM-01 | Named moat type | S+ | Network effects / data / switching costs; network effects about 70% of tech value ([NFX](https://www.nfx.com/post/70-percent-value-network-effects)) | Usage data T1 | "Execution" only |
| SVM-02 | Non-consensus insight | PS–S | Contrarian thesis ([Blackbird](https://www.blackbird.vc/blog/what-blackbird-looks-for-in-founders-today)) | Memo T3 | Me-too on a trend |
| SVM-03 | Global ambition | PS–A | World-best target | Plan T3 | Lifestyle ceiling |
| SVM-04 | Path to scale | S+ | Trajectory vs T2D3 / Q2T3 ([BVP Cloud 100](https://www.bvp.com/atlas/the-cloud-100-benchmarks-report)) | Model + T1 history | Hockey stick |
| SVM-05 | Scalable economics | A+ | ARR per FTE; GM trend | Payroll + ARR T1 | Linear, services-like |
| SVM-06 | Capital path to milestones | All | Milestone per round; premature scaling in 74% of failures ([Startup Genome](https://startupgenome.com/insights/premature-scaling-a-deep-dive)) | Plan T3 | Premature scaling |
| SVM-07 | Exit path | A+ | Named acquirers, comparable multiples | Comparables T3 | No logical buyer |
| SVM-08 | Durability against AI substitution | S+ | Retention despite AI substitutes | Cohorts T1 | Foundation-model replicable |

**Top 12 signals investors read first:**
1. Founders and fit (47% of 885 VCs rank team first, [Gompers et al. 2020](https://www.nber.org/papers/w22587)).
2. Build + sell in-house.
3. Velocity since last checkpoint.
4. Verified customer pull.
5. Growth vs stage.
6. Retention.
7. Gross margin incl. AI cost.
8. Burn multiple / CAC payback.
9. Runway / default alive (70% of failures "ran out of capital", CB Insights).
10. Market size + why now.
11. Clean cap table matching ASIC + IP assigned.
12. Moat + global ceiling.

**Stage emphasis (relative only; numbers in private config):**
- FTV: very high PS → medium B+.
- TRE: low PS → very high B+.
- MPC, PTD: high early, easing later.
- CGH, IRI, LCO: rising with stage.
- SVM: steady.

This matches the evidence that the team dominates early and the business later ([Kaplan et al.](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.2008.01429.x)). These are BlockID proposals, not a published standard.

## 4. Lifecycle email and data capture

**Spam Act 2003:**
- Any promotional purpose makes a message a commercial electronic message (CEM). Purely factual messages are designated ([Sch 1](https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/cth/consol_act/sa200366/sch1.html)).
- One promotional block in a "transactional" email broke the exemption. Lululemon paid A$702,900 in March 2026 ([ACMA](https://www.acma.gov.au/articles/2026-03/lululemon-penalised-702k-spam-breaches)).
- Consent: express preferred; unticked; wording, method and time recorded ([ACMA 2024](https://www.acma.gov.au/articles/2024-06/consent-expectations-businesses-using-direct-marketing)).
- Unsubscribe: honoured within 5 business days, working ≥ 30 days, no login or personal info required (Telstra paid A$626k, [ACMA](https://www.acma.gov.au/articles/2025-03/telstra-penalised-spam-breaches)).

**Privacy Act:**
- APP 7 direct-marketing opt-out ([OAIC](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-7-app-7-direct-marketing)).
- From 10/12/2026, privacy policies must disclose automated decision-making ([Landers](https://landers.com.au/legal-insights-news/australian-privacy-law-update-what-app-entities-need-to-know-in-2026)). This is relevant to SVI.

**Deliverability:**
- Gmail/Yahoo bulk rules: SPF, DKIM, DMARC; RFC 8058 one-click unsubscribe; spam rate < 0.3% ([Google](https://support.google.com/a/answer/81126)).
- Gmail rejects non-compliant mail with 5xx from November 2025. Outlook requires authentication from May 2025.
- Separate transactional and marketing subdomains.

**Lifecycle practice:**
- Behaviour-triggered, one call to action, stop on goal ([Customer.io](https://customer.io/learn/lifecycle-marketing/onboarding-email-examples), [Intercom](https://www.intercom.com/help/en/articles/421-create-an-effective-onboarding-series)).
- Median B2B activation about 25% ([Lenny](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)).
- Caps and sunset after 90 days inactive ([Mailjet](https://www.mailjet.com/blog/deliverability/understanding-email-sunset-policies/)).

**Data capture UX:**
- Progressive profiling; visible autosave ([NN/g](https://www.nngroup.com/articles/efficiency-vs-expectations/)).
- Resume links: hashed, scoped, short-lived, single-use ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)).
- A one-line purpose statement at each capture point.

## 5. Source-audit findings used by G34 (read-only, 25/09/2026)

**Report today:**
- Page 1: 4 tiles (SVI, evidence, verdict, valuation), 8-dimension bars, ledger strip.
- Codex's investor screening (6 signals, `score: null`) is committed as logic (a357a1b03); its UI and export wiring were uncommitted at audit time.
- There are 13 criteria / 52 guiding questions, with stable hashed IDs in `lib/reanalysis/scope.ts`. The SVI 16 → 13 map is `SVI_SCOPE_MAP`.
- No per-question scores. No NRR / gross-margin / runway / burn fields in ReportV2.
- Report valuation is always unavailable (empty `TRUSTED_REVENUE_PRODUCERS`). The CFO scenario engine is live in `scenario_only` mode.
- Criterion owner and dimension lead conflict on revenue, idea, website and roadmap. CGH and LCO have no primary criteria.
- The free-tier `lockCards` may lock most screening signals on free and public reports.

**Data capture:**
- `analyses` has no `project_id`.
- Guest analyses are claimed only by cookie, not by verified email; `register-with-card` and `svi-handoff` skip claim.
- The evaluator-created project is not transferred on founder claim, so there are duplicate projects.
- Program-intake decks can fall back to `/tmp`.
- Erasure misses `email_preferences` rows with a null `user_id`, and `svi_notifications.email`.

**Email:**
- Six overlapping onboarding sequences:
  - `lifecycle-mailer` is scheduled every 15 minutes with no enrolments, no preference check and a 404 unsubscribe link.
  - `nurture_email_queue` and `onboarding-sequence` are unscheduled.
  - `lead-nurture` and `weekly-insights` pick rows before filtering.
- No global frequency cap (`canSendMarketingToday` has no callers). No bounce or complaint suppression.
- `cofounder-match` bypasses `sendEmail`.
- Every category defaults to true, and no marketing consent is recorded at signup.
- `/analyze` users receive no follow-up.
- `svi_accounts.last_active_at` is bumped by a cron, so it is not a real activity signal.
