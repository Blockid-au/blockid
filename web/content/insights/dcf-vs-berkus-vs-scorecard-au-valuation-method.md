# DCF vs Berkus vs Scorecard: How to Pick a Valuation Method (Australia)

*By the BlockID Research Team — published July 2026*

**TL;DR**

- Three of the most-cited startup valuation methods — **DCF, Berkus, and Scorecard** — each answer a *different* question. Picking the wrong one for your stage is the fastest way to lose credibility with an AU investor.
- **Berkus** caps pre-revenue startups at ~A$3M and is best used as a defensible **floor** for pre-product teams.
- **Scorecard** anchors on the AU pre-seed median (~A$2.5M in 2026) and adjusts by peer-relative factors — best for post-launch, pre-revenue or sub-A$50k MRR startups.
- **DCF** only earns its place once you can defend a revenue forecast line-by-line — typically post-A$50k MRR — and even then it belongs as a *sanity check*, not the headline number.
- The right move is almost never one method: triangulate two or three, present the range, and let comparables discipline the outcome. Our [Startup Value Index](/svi) does this in one pass across 13 criteria.

## Why "one method" thinking loses you money

Australian founders routinely pull a single number out of a DCF spreadsheet and walk into a term-sheet meeting expecting to defend it. Sophisticated investors have already run three methods against you before you sit down. If you show up with one, you look like you don't understand the game — and that costs you 10–20% off the top of your valuation before negotiation even starts.

The right frame is diagnostic: **your stage dictates which methods are defensible**, and any credible pitch presents a *range* supported by two or three independent lenses.

| Your stage | Primary method | Secondary | Never use as headline |
| --- | --- | --- | --- |
| Idea only (no code) | Berkus | Scorecard | DCF, revenue multiples |
| Prototype, no revenue | Scorecard | Berkus, Risk-Factor Summation | DCF |
| Post-launch, <A$50k MRR | Scorecard | VC Method, comparable AU rounds | DCF |
| A$50k–A$500k MRR | VC Method | Revenue multiples, Scorecard | Pure DCF |
| >A$500k MRR, profitable path | DCF | Revenue multiples, precedents | Berkus |

If you want a stage-appropriate range without hand-rolling the spreadsheet, run your startup through the free [idea valuation tool](/tools/idea-valuation) — it applies the right lens automatically based on the data you supply.

## Method 1 — Berkus (the pre-revenue floor)

Dave Berkus's framework caps a pre-revenue startup at roughly **A$3M pre-money** by assigning up to ~A$600k of value to each of five value drivers. It is deliberately conservative because it exists to stop founders talking themselves into a A$10M seed on the strength of a pitch deck.

| Value driver | Max A$ | What it de-risks |
| --- | --- | --- |
| Sound idea (base value) | 600,000 | Product risk |
| Working prototype | 600,000 | Technology risk |
| Quality management team | 600,000 | Execution risk |
| Strategic relationships | 600,000 | Market risk |
| Product rollout / early sales | 600,000 | Production / adoption risk |

**When to use it.** Idea-stage founders raising a friends-and-family or angel round of A$100k–A$500k. Berkus gives you a **defensible floor** — "here is why my valuation is *not* A$500k".

**Worked example — Melbourne climate-tech founder, pre-revenue.**

- Sound idea (validated by 40 discovery calls, clear pain): A$500k
- Working prototype (deployed on 3 pilot sites): A$550k
- Team (2 technical co-founders, one ex-CSIRO): A$500k
- Partnerships (LOIs with 2 councils): A$250k
- Rollout (no paying customers yet): A$100k
- **Berkus total: A$1.9M pre-money floor**

That A$1.9M is the number you will not go below. You now layer Scorecard on top to justify why the ceiling should be higher.

**Where Berkus breaks.** It refuses to reward large TAM or defensible IP. A deep-tech spinout with a patent portfolio will be systematically under-valued by pure Berkus — pair it with Scorecard's "size of opportunity" weighting or Risk-Factor Summation.

## Method 2 — Scorecard (the AU peer-relative anchor)

Bill Payne's Scorecard method takes the median pre-money valuation of recent comparable rounds and multiplies it by a weighted score across seven factors, where **1.0 = the peer average**, above 1.0 = better, below 1.0 = worse.

For AU pre-seed in 2026, the median regional pre-money sits around **A$2.5M** (Cut Through Venture Q1 2026, Folklore Ventures Southbound Report). AU seed sits at ~A$6M–A$8M pre-money.

| Factor | Typical weight |
| --- | --- |
| Strength of management team | 30% |
| Size of the opportunity | 25% |
| Product / technology | 15% |
| Competitive environment | 10% |
| Marketing / sales / partnerships | 10% |
| Need for additional investment | 5% |
| Other (ESIC status, customer traction, IP) | 5% |

**Worked example — Sydney B2B SaaS, prototype in market, no revenue.**

| Factor | Weight | Peer-relative score | Weighted |
| --- | --- | --- | --- |
| Team (technical co-founder + repeat operator) | 30% | 1.30 | 0.390 |
| Opportunity (A$400M SAM in AU + NZ) | 25% | 1.10 | 0.275 |
| Product | 15% | 1.00 | 0.150 |
| Competition | 10% | 0.90 | 0.090 |
| Partnerships (2 signed pilots) | 10% | 1.20 | 0.120 |
| Additional investment need | 5% | 1.00 | 0.050 |
| Other (ESIC-registered) | 5% | 1.15 | 0.058 |
| **Total multiplier** | | | **1.133** |

Applied to the A$2.5M regional median: **A$2.5M × 1.133 = A$2.83M pre-money.**

That's a number both sides can walk into a first meeting with. When you add the Berkus floor of A$1.9M from the earlier example, your defensible range for the same startup is **A$1.9M–A$2.8M pre-money** — a tight, credible band.

**Where Scorecard breaks.** It only works if you have honest peer data. If your factor scores drift above 1.5 on every line, you're anchoring on your own optimism, not the market. Cross-check with real recent rounds on Cut Through Venture's weekly digest.

## Method 3 — DCF (the sanity-check, not the headline)

Discounted Cash Flow forecasts free cash flow for 5–10 years, discounts each year back to present value at a risk-adjusted rate, and adds a terminal value. It is the *only* method grounded in first-principles corporate finance — every other method is a shortcut around DCF.

The catch: **small errors in year-3 growth or churn compound violently**. A five-year DCF built on "we'll hit A$10M ARR by year 3" is fiction unless you can defend each cohort with signed contracts or a repeatable acquisition engine.

**Discount rates AU VCs actually apply.**

| Stage | Discount rate | Rationale |
| --- | --- | --- |
| Pre-seed | 50–70% | High mortality, team + idea only |
| Seed | 40–60% | Product exists, PMF unproven |
| Series A | 30–50% | Repeatable acquisition, unit economics visible |
| Series B+ | 20–35% | Scaling a known playbook |

**Worked example — post-launch AU SaaS, A$1M ARR, growing 100% YoY, seed-stage.**

Assumptions:

- Year 1 ARR: A$1M (actual)
- Year 2: A$2M (100% growth)
- Year 3: A$4M (decelerating to 100%)
- Year 4: A$6M (50% growth)
- Year 5: A$8M (33% growth)
- Steady-state FCF margin at year 5: 20% → **A$1.6M year-5 FCF**
- Terminal multiple: 15× steady-state FCF → **A$24M terminal value**
- Discount rate: 45%
- Discount factor at year 5: 1 / (1.45)^5 = 1 / 6.41 = **0.156**
- PV of terminal: A$24M × 0.156 = **~A$3.75M**
- PV of interim FCFs (years 1–4 likely negative or near zero): ~A$0.25M
- **DCF valuation today: ~A$4M pre-money**

Compare this to what the same startup would raise on Scorecard (A$5M–A$7M range at seed) and you see why DCF pulls low for growth-stage software: the discount rate punishes future cash more than the growth rate compensates.

**When DCF earns headline status.** Series B+, profitable AU businesses with predictable churn and CAC. Below that, run it as a floor check — if your "aggressive scenario" DCF still lands below your Scorecard number, your Scorecard is probably too high.

Our [financial projections tool](/tools/financial-projections) builds the underlying 5-year model for you so you can drop assumptions in and see the DCF sanity number in real time.

## How to combine them without cherry-picking

The professional pattern is a **three-lens summary table** at the front of your pitch:

| Method | Range (pre-money) | Notes |
| --- | --- | --- |
| Berkus | A$1.9M | Conservative floor |
| Scorecard | A$2.5M–A$3.0M | AU peer-relative |
| Comparable AU rounds | A$2.5M–A$4.0M | Cut Through Venture Q1 2026 |
| **Ask** | **A$3.0M pre-money** | Mid-range, supported by three methods |

Investors do not object to the ask — they object to *the lack of triangulation*. Three converging methods around A$3M is a much stronger defence than one DCF spitting out A$4.2M.

## Australia-specific levers most method guides miss

Foreign valuation guides skip the three things that actually move AU founder economics:

1. **ESIC status.** The 20% investor tax offset (up to A$200k per investor per year) plus a 10-year CGT exemption widens your investor pool. This typically supports a **10–20% valuation premium** because more angels can afford to write cheques at your ask.
2. **R&D Tax Incentive.** For entities with <A$20M turnover, the refundable offset is **43.5%** of eligible R&D spend. Model this into runway before you set the raise size — a A$1M engineering budget effectively becomes A$565k of net cash burn.
3. **Sophisticated investor thresholds.** Under s708 of the *Corporations Act 2001*, most seed capital comes from sophisticated investors (A$2.5M net assets or A$250k income for two years). This shapes *who* you can pitch to without a formal disclosure document — and therefore shapes the practical valuation ceiling.

## Common mistakes AU founders make with valuation methods

- **Anchoring to US comparables.** San Francisco seed valuations run 2–3× AU medians. Use AU data or get laughed out of the room.
- **Confusing pre-money and post-money.** Post-money = pre-money + round. A 25% offer on A$4M pre-money = A$1M raise; the same 25% on A$4M *post-money* = only A$750k raise.
- **Ignoring the option pool shuffle.** Investors usually require a 10–15% unallocated ESOP *inside* pre-money — that dilution comes out of you, not them.
- **Refusing to walk away.** The best valuation lever is a credible alternative offer. Run parallel processes.
- **Presenting one number.** Present a defensible range with two or three converging methods.

## FAQ

### Which valuation method do AU angel investors actually use?
Most AU angels combine Scorecard (for the peer anchor) with a gut-feel discount for team risk. They rarely build a DCF for pre-revenue deals — but they *will* ask if you have. Come prepared.

### What is a "fair" AU pre-seed valuation in 2026?
Median pre-money is A$2M–A$4M (Cut Through Venture Q1 2026). Strong technical teams with a working prototype and ESIC status push to A$4M–A$6M. Seed rounds cluster A$6M–A$12M pre-money.

### Should I use Berkus if I already have paying customers?
No. Berkus assumes zero revenue. Once you have paying customers, move to Scorecard + VC Method + revenue multiples. Berkus systematically under-values traction.

### How does ESIC affect the valuation number itself?
Not the *number*, but the *achievability*. ESIC widens the pool of eligible angel investors, which fills the round faster and often at the top of your defended range. It is a probability lever, not a multiplier.

### Do I need a formal Independent Expert Report for my raise?
No — not for private capital raises. Independent Expert Reports are only required for ASX-related transactions, related-party deals, or where your constitution mandates one. Use the methods above internally.

### Can I use one method for the pitch and another for the term sheet?
No. Pick a range at the pitch, defend it with two or three methods, and hold that range through the term sheet. Switching methods mid-negotiation signals you were cherry-picking.

### Where can I benchmark AU rounds for the Scorecard median?
Free: [BlockID SVI benchmarks](/svi), Cut Through Venture weekly digest, Folklore Southbound Report, Airtree State of Startup Funding. Paid: PitchBook, Dealroom, CB Insights.

### How do I know when my DCF is defensible?
Rule of thumb: you can defend every input line to a sceptical Series A partner without a spreadsheet in front of you. If you can't, don't lead with the DCF.

---

**Next steps.** Run the free [Startup Value Index](/svi) for a full 13-criteria breakdown across all five methods, or use the [idea valuation tool](/tools/idea-valuation) to generate a stage-appropriate range in under 60 seconds. For a defensible 5-year model to underpin your DCF sanity check, the [financial projections tool](/tools/financial-projections) builds it from your inputs. See [pricing](/pricing) for upgrade options.

*General information only. Not financial or legal advice. Consult a qualified adviser before making decisions.*
