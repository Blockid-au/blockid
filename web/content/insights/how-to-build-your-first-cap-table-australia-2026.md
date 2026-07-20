# How to Build Your First Cap Table (Australia, 2026)

*By the BlockID Research Team — published July 2026*

**TL;DR**

- A cap table is a share-by-share record of who owns what — the single source of truth for every future funding round, ESOP grant, and exit.
- For AU startups, your day-one cap table should reflect: **founder shares (with vesting), an unallocated ESOP pool of 10–15%, any SAFE/convertible notes on issue, and priced-round investors.**
- Every issue must be minuted, share certificates recorded, and lodged with ASIC via **Form 484** within 28 days of a change.
- The most common founder mistake is issuing 1,000 shares to each founder and then not being able to cleanly split fractional ESOP grants later — start with **10,000,000 shares** issued to founders combined.
- Ignore the ESOP shuffle and you will be diluted by an extra 5–10% at Series A that you did not model for.

## What a cap table actually is (and what it isn't)

A cap table (short for *capitalisation table*) is a spreadsheet — or better, a live database — that tracks every equity security your company has issued, to whom, on what terms, and what percentage of the fully-diluted company each holder owns.

It is **not** just a founder-split calculator. A serious cap table tracks:

- **Ordinary shares** (founders, ESOP-exercised employees, priced-round investors on ordinaries)
- **Preference shares** (priced-round investors on prefs, with liquidation preferences)
- **Options and warrants** (unexercised ESOP grants, adviser options)
- **Convertibles** (SAFEs, convertible notes — not yet shares, but will convert)
- **Vesting schedules** attached to each grant

Get this right and Series A due diligence takes a week. Get it wrong and a lawyer will bill you A$40k+ to clean it up under time pressure while your priced round is in escrow.

Use the free [cap table tool](/tools/cap-table) to build yours in a browser without spreadsheet gymnastics — it enforces the AU-specific rules below by default.

## Step 1 — Set the founder share count correctly

The single most common mistake is issuing **1 share per founder** at incorporation. It looks tidy, then falls apart the moment you need to grant 0.5% to an early employee — you can't issue half a share.

**Start with 10,000,000 shares issued to founders combined.** This gives you 5 decimal places of resolution for future grants without any splits later.

**Two-founder split (equal), day-one issue:**

| Holder | Shares | % of issued |
| --- | --- | --- |
| Founder A | 5,000,000 | 50.0% |
| Founder B | 5,000,000 | 50.0% |
| **Issued** | **10,000,000** | **100.0%** |

**Three-founder split (60/25/15), day-one issue:**

| Holder | Shares | % of issued |
| --- | --- | --- |
| Founder A (CEO) | 6,000,000 | 60.0% |
| Founder B (CTO) | 2,500,000 | 25.0% |
| Founder C (COO, joined 3 months in) | 1,500,000 | 15.0% |
| **Issued** | **10,000,000** | **100.0%** |

Every one of those blocks should be subject to **founder vesting** — typically 4 years with a 12-month cliff, with the company holding a buy-back right at issue price if a founder leaves. This protects the co-founders who stay, protects the company, and is expected by every serious AU investor.

## Step 2 — Reserve the ESOP pool (before it's too late)

An ESOP (Employee Share Option Plan) grants employees the right to acquire shares at a fixed exercise price. In Australia, most seed-stage ESOPs use the **Division 83A start-up concession** — options taxed at exercise, capital gain on sale, and no upfront tax if the plan meets the eligibility criteria (unlisted, <A$50M turnover, Australian resident employer, <10 years old).

**Reserve 10–15% at incorporation.** If you leave it until your seed round, the investor will *require* the pool to be created inside pre-money — and every share of that pool comes out of your dilution, not theirs.

**Cap table after reserving a 10% ESOP pool (two-founder example):**

| Holder | Shares / options | Fully diluted % |
| --- | --- | --- |
| Founder A | 5,000,000 | 45.0% |
| Founder B | 5,000,000 | 45.0% |
| Unallocated ESOP pool | 1,111,111 | 10.0% |
| **Total fully diluted** | **11,111,111** | **100.0%** |

Note the maths: to end at 10% of the fully-diluted total, you divide founder shares (10,000,000) by 0.90, giving 11,111,111 total — of which 1,111,111 is the pool.

Grant options from the pool over time as you hire. A typical AU seed-stage grant schedule:

| Role | Grant % of fully diluted | Options (of 1,111,111 pool) |
| --- | --- | --- |
| Head of Engineering (hire #1) | 1.00% | 111,111 |
| Head of Growth (hire #2) | 0.75% | 83,333 |
| Senior Engineer | 0.30% | 33,333 |
| Advisor (2-year vest, no cliff) | 0.25% | 27,778 |
| Product Manager | 0.30% | 33,333 |

The [ESOP grants workspace](/workspace/esop/grants) tracks each grant, its vesting schedule, exercise price, and Division 83A eligibility in one place — with the ASIC lodgement reminders built in.

## Step 3 — Model your SAFEs and convertibles *before* they convert

If you raise on a **SAFE (Simple Agreement for Future Equity)** or **convertible note** at pre-seed, those instruments are not shares yet — but they *will* convert at your next priced round, and they will dilute you exactly as if they were shares today.

**Worked example — post-money SAFE conversion.**

- You raised A$500k on a Y Combinator **post-money SAFE** with a **A$5M post-money valuation cap**.
- Your priced seed round lands at **A$8M pre-money, raising A$2M** (post-money A$10M).
- The SAFE cap of A$5M is lower than the A$10M priced-round valuation, so the cap kicks in.
- **SAFE investor ownership on conversion = A$500k / A$5M = 10.00%** of the post-money cap table, calculated *before* the new money.

Now watch what that does to founder dilution.

**Cap table immediately post-seed (all on fully-diluted basis):**

| Holder | Fully diluted % |
| --- | --- |
| Founder A | 33.75% |
| Founder B | 33.75% |
| SAFE investor (converted) | 10.00% |
| Priced-round investors | 20.00% |
| ESOP pool (topped up to 10% post-money) | 10.00% |
| Uncertainty band / rounding | ±0.5% |
| Wait — this doesn't add up | |

It doesn't add up because of the **option-pool shuffle**. The 10% ESOP has to be topped up *inside* pre-money, which comes out of founders and the SAFE investor — not the new priced-round investor. This is where AU founders lose the most equity by accident.

For a clean picture, run this exact scenario through the [dilution calculator](/tools/dilution) — it applies the shuffle, the SAFE conversion, and the ESOP top-up in the correct order.

## Step 4 — Run a priced round without losing the plot

At a priced seed, the mechanics are:

1. **Agree pre-money valuation and round size** (e.g., A$6M pre-money + A$1.5M raise = A$7.5M post-money).
2. **Agree post-money ESOP percentage** (e.g., 10% unallocated pool).
3. **Top up the pool inside pre-money** (dilution comes out of you and any pre-existing holders).
4. **Issue new preference shares** to the incoming investors.
5. **Update the cap table** and file ASIC Form 484 within 28 days.

**Worked seed round — two founders, no prior investors, no SAFEs:**

| Line | % of post-money |
| --- | --- |
| Investor stake (A$1.5M / A$7.5M) | 20.0% |
| ESOP pool (topped up to 10% post-money) | 10.0% |
| Founders combined | 70.0% |
| Founder A | 35.0% |
| Founder B | 35.0% |

Now translate to shares. Target: a post-round fully-diluted count of 20,000,000 shares.

| Holder | Shares | % of fully diluted |
| --- | --- | --- |
| Founder A | 7,000,000 | 35.0% |
| Founder B | 7,000,000 | 35.0% |
| ESOP pool (unallocated) | 2,000,000 | 10.0% |
| Seed investor (preference shares) | 4,000,000 | 20.0% |
| **Total** | **20,000,000** | **100.0%** |

Note that the founders had to *lose* shares in aggregate to get from 10M pre-round to 14M post-round on a fully-diluted basis — this is done via the pool top-up and new preference issue. Your lawyer will paper this via a **share issue resolution**, updated **register of members**, and **ASIC Form 484** lodgement.

## Step 5 — Track it as a live database, not a stale spreadsheet

A cap table maintained in Excel and emailed around is a due-diligence nightmare. By Series A you want:

- A **single source of truth** with version history.
- **Scenario modelling** — "what does my cap table look like at Series A if I raise A$5M on A$25M pre-money?"
- **Automatic dilution calculations** for SAFE and convertible conversion.
- **ESOP grant tracking** with vesting curves, exercise deadlines, and Division 83A flags.
- **ASIC Form 484 reminders** attached to each issue.

The [cap table tool](/tools/cap-table) covers all five, and the [dilution modeller](/tools/dilution) plays forward scenarios so you can see how a A$500k adviser convertible will look after your Series B.

## Real AU cap-table lessons from unicorns

- **Canva** raised its first institutional round from Blackbird in 2013 on a modest pre-money (~US$6M). Careful founder-vesting protection means Melanie Perkins and Cliff Obrecht still held combined majority ownership of the operating structure heading into secondary sales in 2024 — despite raising well over A$500M.
- **Airwallex** ran three post-money SAFEs before its Series A. Because they modelled conversion dilution up-front, the Series A pre-money moved from an internal ask of US$40M to US$85M — the founders held on to ~15% more equity than the naive plan.
- **Zeller** raised a A$25M seed round in 2021 — the largest AU seed on record at the time — with a pre-negotiated 12.5% ESOP pool. Reserving that pool at the seed round meant the Series A only had to top it up by 2%, protecting the founders from the shuffle.
- **Employment Hero** issued founder shares with 4-year vesting from day one; when it hit its 2023 down-round, the vesting schedule was cited as a key reason investors did not push for a founder recap.
- **Immutable** ran its cap table entirely on-chain internally from 2018 — with a mirrored ASIC-lodged register — long before the tokenised-equity thesis became mainstream.
- **Culture Amp** created a large ESOP pool early (~15%) and expanded it twice before Series C, which is credited with retaining most of its 2015-era engineering leadership through IPO discussions.

## Cap-table mistakes that kill AU seed rounds

- **Issuing too few shares.** 1,000 shares per founder cannot cleanly grant 0.3% to a hire.
- **Skipping founder vesting.** No AU seed investor will fund without it. Retrofit is painful.
- **Leaving the ESOP for later.** Every % of pool you didn't reserve becomes dilution at the seed.
- **Not filing ASIC Form 484.** Fines apply after 28 days. Cleanup at DD is expensive.
- **Ignoring SAFE dilution.** Model conversion *before* you sign the priced-round term sheet.
- **No single source of truth.** Multiple spreadsheets = investor loses confidence.
- **Undocumented issue prices.** ASIC and the ATO both want the paper trail — especially for Division 83A.

## FAQ

### How many shares should I issue to founders at incorporation?
10,000,000 combined, split according to the founder agreement. This gives 5 decimal places of resolution for future ESOP grants without needing a share split.

### What ESOP pool size do AU seed investors expect?
10% unallocated at seed, topping up to 12.5–15% by Series A. Reserve inside pre-money at the seed round so the dilution is baked into the round pricing.

### Do I need to file ASIC Form 484 for every share issue?
Yes. Any change to issued share capital, member details, or officeholders must be lodged with ASIC within 28 days. Late fees start at A$95 and escalate.

### What is the Division 83A start-up concession?
A concessional tax treatment for options issued under a qualifying ESOP by an unlisted, <A$50M-turnover, Australian-resident employer less than 10 years old. Options are taxed at exercise, not grant, with capital gain on sale.

### Should I use a SAFE or a priced round for my first cheque?
SAFEs are faster and cheaper (~A$3k in legals vs A$15k+ for a priced round) but defer the valuation conversation. If you can't defend a valuation number, use a SAFE with a valuation cap. See our [SAFE vs convertible vs priced round](/insights/safe-vs-convertible-note-vs-priced-round-australia) guide for the full breakdown.

### Do I need a lawyer for my first cap table?
For incorporation and the founder agreement — yes, spend the A$2k–A$5k. For ongoing ESOP grants and share issues, a tool like [BlockID's cap table workspace](/tools/cap-table) plus a lawyer review at each priced round is standard practice.

### How does the option pool shuffle work?
Investors negotiate the post-money ESOP percentage (say 10%) and require the top-up to sit *inside* pre-money. The dilution comes from founders and any pre-existing holders — not the new investor. Model this in the [dilution tool](/tools/dilution) before you agree a term sheet.

### Can I run my cap table on a blockchain?
Technically yes — Immutable and a handful of AU startups do this internally. But ASIC still requires a lodged register in the traditional format. Use blockchain as a mirror, not a replacement, until AU corporate law catches up.

---

**Next steps.** Build your first cap table in the free [cap table tool](/tools/cap-table), model forward dilution scenarios with the [dilution calculator](/tools/dilution), and manage individual ESOP grants in the [ESOP grants workspace](/workspace/esop/grants). Run your startup through the [Startup Value Index](/svi) to see how your cap-table hygiene scores against 2,700+ AU peers. See [pricing](/pricing) for upgrade options.

*General information only. Not financial or legal advice. Consult a qualified adviser before making decisions.*
