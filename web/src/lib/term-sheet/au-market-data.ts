/**
 * Australian Private Capital Market — reference dataset.
 *
 * This is intentionally a single static string export. The Term Sheet AI
 * route caches it in Anthropic's prompt cache (1h TTL) so the bulk of every
 * analysis request is served at ~0.1× input cost.
 *
 * DO NOT interpolate Date.now(), process.env, request IDs, or any other
 * varying value into this string — that would silently invalidate the cache
 * on every request. This file is a pure constant.
 *
 * Sources: anonymised AU SAFE / Series A precedents (Blackbird, AirTree,
 * Square Peg, Tidal, Tank Stream, Skip), ATO ESIC guidance, AICD board
 * primers, ILPA standard term sheet (US, used as comparator).
 */

export const AU_MARKET_REFERENCE = `# Australian Private Capital — Term Sheet Reference (2024–2026)

## 1. SAFE valuation caps by stage (AUD, post-money convention)

- Friends & family / pre-incorporation: $750k – $2M cap, 20% discount, MFN with 12-month expiry, no board seat, no pro-rata for sub-$25k cheques.
- Pre-seed (idea + early signal, < $200k ARR): $1.5M – $4M cap, 15–20% discount, MFN with 18–24 month expiry, no board seat, pro-rata only for cheques ≥ $50k.
- Seed (early traction, $100k – $1M ARR): $4M – $10M cap, 10–20% discount (often discount-only at higher caps), MFN, lead investor may take 1 board observer seat (not a director seat) and major-investor pro-rata.
- Post-seed / pre-Series A bridge: $8M – $20M cap, 10% discount or no discount, MFN, occasional 1x non-participating liquidation preference on conversion.
- Outliers: hot AI / dev-tools rounds in 2024–2026 have cleared $15M – $25M post-money caps at pre-seed in Sydney/Melbourne — unusual but not anomalous.

Founders should expect lead investors at AUD $250k+ to negotiate pro-rata + information rights on a SAFE. Anything more (board seat, vetoes, drag) is investor-friendly for the stage.

## 2. Convertible notes (less common in AU than US; signals "not a SAFE")

- Interest: 5–8% simple, AUD-denominated.
- Maturity: 18–24 months.
- Discount: 15–25% on conversion at qualified financing.
- Cap: similar to SAFE caps for the same stage.
- AU founders generally prefer SAFEs because notes carry insolvency risk if conversion is missed at maturity.

## 3. Series A — typical AU institutional terms

- Pre-money valuation: $8M – $30M (median ~$14M – $18M for Sydney SaaS in 2024–2026 per Cut Through Venture data).
- Round size: $2M – $10M (median ~$4M – $5M); larger ($8M+) usually requires a co-lead or US/SG fund crossover.
- Liquidation preference: **1x non-participating preferred** is the AU market standard. Anything participating, multiple-times, or with a cap > 1x is investor-friendly and worth pushing back on.
- Anti-dilution: **broad-based weighted average** is market. Full-ratchet is investor-friendly and a deal-breaker for most AU founders' lawyers.
- Option pool top-up: typically **10–15% of post-money**, funded **pre-money** (existing holders absorb dilution). Investors will push for 15%+; founders should benchmark to 12-month hiring plan and resist topping up beyond that.
- Board: 5-person board is standard at Series A — 2 founders, 1 lead investor (director seat), 1 independent (mutually agreed), 1 observer for the second-largest holder. Single-investor-controlled boards at seed/Series A are a red flag.
- Pro-rata rights: standard for "major investors" (typically defined as ≥$250k or ≥1% of round). MFN with no expiry is investor-friendly.
- Drag-along: triggers at 50%+ preferred + 50%+ common (or majority board). Anything below 50% is investor-friendly.
- Information rights: monthly management accounts, annual audited accounts, board pack, budget — standard. Inspection rights with 5 business days' notice is standard.
- Founder vesting: typically 4-year vest with 1-year cliff, RESET at the round (founders often resist; "credit for time served" is the negotiated middle ground — e.g. 50% vested at close, balance over 24 months).
- Acceleration: single-trigger (on change of control) for founders is founder-friendly; double-trigger (change of control + termination without cause within 12 months) is the most common AU compromise.
- ESOP: ESS rules + Division 83A — qualifying schemes defer tax until disposal or 15 years. Most AU startups run a "founder-friendly" ESOP under the startup concession for unlisted companies < 10 years old + < $50M turnover.

## 4. Australian-specific compliance flags that affect term sheet drafting

### ESIC eligibility (Early Stage Innovation Company)
Investors get a 20% non-refundable carry-forward tax offset (capped at $200k/year) PLUS a 10-year CGT exemption on qualifying investments. Eligibility test the company must pass at the time of issue:
- Incorporated in Australia within the last 3 years (or 6 years with $1M cumulative expenses cap).
- Not listed on any stock exchange.
- Total expenses ≤ AUD $1M in the prior income year.
- Total assessable income ≤ AUD $200k in the prior income year.
- Pass either the 100-point innovation test OR the principles-based test.

If a term sheet is for a company that wants ESIC-eligible investors, the round should close BEFORE the company breaches the $200k income / $1M expenses thresholds. Founders should flag if they are within 6 months of breach.

### R&D Tax Incentive (RDTI)
- Refundable 43.5% offset for companies with aggregated turnover < $20M.
- Non-refundable 38.5% offset for larger companies.
- Term sheet implication: investors may push for an R&D claim covenant (founders certify the FY claim and indemnify against clawback). Standard in AU; not in US precedent docs.

### AUSTRAC (only relevant for fintech / marketplace deals)
- Reporting entity status if the company processes payments, custodies funds, exchanges crypto, or operates a designated remittance service.
- Term sheet may include a covenant that the company maintains AUSTRAC registration — material if breached. Not relevant for SaaS / consumer / B2B software.

### Corporations Act / Section 708 small-scale offering
- AU private companies can raise from up to 20 investors / $2M in any 12-month period without a disclosure document. Above either limit, the company must use a wholesale-investor exemption (s708(8) — sophisticated/professional) or prepare a disclosure document.
- Term sheets often include a representation that all participating investors are wholesale/sophisticated investors with current accountant certificates. Founders should check that retail mates / family aren't accidentally included on the cap table.

### ASIC / share register hygiene
- All issues must be lodged with ASIC within 28 days (Form 484). Most AU term sheets include a closing condition that the company has a clean ASIC search.
- A messy register (missed Form 484 filings, undocumented option grants, ghost shareholders) is a common reason AU term sheets blow up at DD.

## 5. Founder-friendly clauses (push for these)

- **Broad-based weighted average anti-dilution.** Industry standard; full-ratchet is the alternative and is hostile.
- **No participation right on liquidation preference.** "1x non-participating" is the AU standard — investors get their money back OR convert to common, not both.
- **Pro-rata limited to "major investors".** Define "major" at $250k+ or 1%+ of round; otherwise everyone with $5k pro-rata clogs future rounds.
- **MFN with a 24-month expiry** (not perpetual). After 24 months the MFN dies; otherwise old investors can free-ride on every future raise's terms forever.
- **Founder vesting with credit for time served.** Don't reset to zero at the round — negotiate 50% vested at close + 24-month linear thereafter.
- **Single or double-trigger acceleration on change of control for founders.** Single-trigger = full vest on sale. Double-trigger = sale + termination-without-cause within 12 months. Double-trigger is the AU compromise.
- **Drag-along trigger ≥ 50% preferred AND ≥ 50% common.** Means founders can't be dragged into a sale without their own shareholder bloc agreeing.
- **Information rights capped at "major investors"** — full board reporting to a $25k cheque is a perpetual administrative tax.
- **Founder protective provisions.** Some AU rounds preserve founders' approval over a small list of decisions (e.g. removing a founder, changing share class rights affecting founders) — uncommon but defensible.
- **Founder share buy-back at fair market value on departure** — protects founders against a forced sale to the company at par.

## 6. Investor-friendly red flags (push back hard)

- **Full-ratchet anti-dilution.** Adjusts the conversion price to the lowest price ever paid in a future down round. Catastrophic in a flat or down round. Almost never seen in AU; if proposed, walk.
- **Multiple liquidation preferences (>1x).** "2x non-participating" or "1.5x participating" — caps founders' upside until the company sells for a multi-hundred-million-dollar exit. AU norm is 1x non-participating.
- **Participating preferred with no cap.** Investors get their money back AND share pro-rata in the rest. Massively founder-hostile in mid-sized exits.
- **Drag-along threshold below 50%.** "Investors with 30% can drag everyone into a sale" — strips founders of exit control. AU norm is 50%+.
- **Super pro-rata rights** (e.g. lead investor may invest up to 2x their pro-rata in the next round). Pre-empts new leads, kills competitive rounds.
- **MFN clauses with no expiry.** Old investors get the best terms forever — chills every future round.
- **Investor board control at seed.** Lead investor with veto rights over budget, hiring, fundraising at seed = founders are running a project, not a company. AU norm is 1 director seat + 1 observer at most.
- **Redemption rights.** Investor can force the company to buy back their shares after N years at cost + interest. Standard in late-stage US PE deals; rare and hostile in AU early-stage.
- **No-shop / exclusivity clauses > 60 days.** Locks the founder into one term sheet while DD drags. AU norm is 30–45 days.
- **Investor-friendly information rights** (e.g. real-time access to bank accounts, weekly KPI dashboards). Reasonable at Series B+; extreme at seed.
- **"Pay-to-play" provisions.** Existing investors must participate pro-rata in down rounds or have their preferred shares converted to common. Not necessarily hostile, but worth understanding before signing.
- **Founder vesting without credit for time served.** Resets all founder shares to zero at close — punitive if the company is 3+ years old.
- **Co-sale / tag-along on founder secondary** — usually fair, but watch for asymmetric versions where investors have tag-along but founders don't.
- **Reverse vesting on existing founder shares with no acceleration.** If you're already 2 years in and they reset to zero with no double-trigger, your shares are at the company's pleasure.
- **"Founder bad-leaver" definitions that include "for cause" determined by the board.** The board is investor-controlled at Series A — this gives them a unilateral right to call you a bad leaver and claw back unvested shares.

## 7. Red flags specific to convertibles / SAFEs

- **Cap that converts at "lowest of cap, discount, or 80% of next round".** Triple-barrelled conversion mechanics that price below market in any scenario.
- **Most-favored-nation (MFN) with no sunset.** All future SAFEs improve this one's terms forever.
- **Conversion on "qualified financing" defined too broadly** (e.g. any future raise > $100k). Means a small bridge converts the SAFE early at a punitive cap.
- **No-shop on a SAFE.** Genuinely unusual; SAFEs are designed to be light-touch.

## 8. Typical AU deal economics (sanity-check the cap)

- Pre-seed median pre-money (2024–2026): $3M – $5M (Cut Through Venture Q-by-Q data).
- Seed median pre-money: $7M – $12M.
- Series A median pre-money: $14M – $20M (Sydney SaaS).
- Series A median round size: $4M – $6M.
- Median founder ownership at Series A close: 50–62% (across both founders).
- Median ESOP at Series A close: 10–13% (after the round's top-up).
- Median lead-investor stake at Series A: 18–22%.

If a term sheet's numbers fall outside ±30% of these ranges in either direction, flag it for the founder.

## 9. Drafting style — Australian vs US precedent

- AU term sheets are SHORTER than US precedent (typically 4–8 pages vs 12–20 in the US). If you're seeing a 20-page AU term sheet with US drafting tics ("Delaware", "Article", "Stockholder"), the lawyer is using a US template — flag for review.
- "Stockholder" → "shareholder", "Common Stock" → "ordinary shares", "Preferred Stock" → "preference shares" in AU drafting.
- AU term sheets typically defer detailed mechanics (anti-dilution formulas, drag mechanics) to the long-form Shareholders' Agreement. The term sheet itself stays high-level.

## 10. The carbon-copy US-template smell test

Common signs an investor has copy-pasted from a US template without localising:
- Uses "Delaware" or "Delaware General Corporation Law".
- References the "Investor Rights Agreement" and "Voting Agreement" as separate documents (in AU these usually combine into one Shareholders' Agreement).
- Quotes USD instead of AUD.
- Uses "Pre-Money Valuation" with capitalised initials (AU style is sentence case).
- References ROFR (right of first refusal) on transfers — fine substantively but stylistically US.
- Uses "Series Seed" terminology with NVCA forms — the AU equivalent is usually a SAFE or a small priced round under AVCAL/AICD model docs.

If 3+ smells are present, the founder should ask for AU-localised drafting before signing.
`;
