# SAFE vs Convertible Note vs Priced Round (Australia, 2026)

*By the BlockID Research Team — published July 2026*

**TL;DR**

- Three instruments dominate AU early-stage fundraising: **SAFEs, convertible notes, and priced equity rounds.** Each is legal in Australia, each has a place, and using the wrong one costs you time, equity, or both.
- **SAFEs** are fastest and cheapest (~A$3k in legals) — best for pre-seed rounds under A$500k when you cannot defend a valuation.
- **Convertible notes** are useful when investors want a security with interest and a maturity date — common for bridge rounds and family-office cheques in Australia.
- **Priced rounds** are the right call once you can defend a valuation with two or three converging methods, when the cheque size exceeds A$500k, or when a lead investor requires it.
- Every AU raise triggers **s708** disclosure requirements — get the sophisticated-investor certificates on file *before* you accept the wire, or the ATO and ASIC will eat your weekend.

## Why the instrument choice matters more than you think

Founders obsess over valuation and ignore the instrument. That's backwards. **The instrument determines when the valuation conversation happens, how much it costs, what protections your investors get, and how much dilution you take at conversion.**

A A$500k SAFE with a A$3M post-money cap and a A$500k priced round at A$3M pre-money look identical on the surface. They are not. The SAFE has a hidden ~13% dilution kicker at your next priced round if you raise at a higher price, and it comes with none of the protective provisions a lead investor will demand at Series A.

Pick your instrument before you pitch. Present it in the deck. Investors respect founders who know what they're offering.

| Instrument | Best for | Legal cost (typical) | Time to close |
| --- | --- | --- | --- |
| SAFE (post-money) | Angel / accelerator / pre-seed <A$500k | A$2k–A$4k | 1–2 weeks |
| Convertible note | Bridge, family office, structured pre-seed | A$5k–A$10k | 3–4 weeks |
| Priced round (SAFE-lite) | Party rounds A$500k–A$1.5M | A$10k–A$15k | 4–6 weeks |
| Priced round (full) | Institutional seed / Series A / lead-led | A$25k–A$60k | 8–14 weeks |

The [term sheet tool](/tools/term-sheet) generates first-draft term sheets for each of these that a lawyer can sanity-check in an hour instead of drafting from scratch.

## Instrument 1 — The SAFE (Simple Agreement for Future Equity)

A SAFE is a contract, not a security. The investor gives you cash today in return for the right to convert into shares at your next priced round (or an exit or a defined maturity date). No interest, no maturity, no board seat.

### Post-money vs pre-money SAFE

The Y Combinator **post-money SAFE** (introduced in 2018 and now standard globally) fixes the investor's ownership percentage on a **post-money** basis. This makes dilution predictable for the investor but shifts *all* future SAFE and priced-round dilution onto the founders.

**Worked example — post-money SAFE.**

- You raise A$500k on a post-money SAFE with a **A$5M post-money valuation cap**.
- Your next priced round: A$8M pre-money, raising A$2M (post-money A$10M).
- The cap (A$5M) is lower than the round price (A$10M), so the cap kicks in.
- SAFE investor ownership on conversion = A$500k / A$5M = **10.00%** of the fully-diluted cap table *before the new money* — locked in.
- After the priced round dilutes everyone by 20% (A$2M / A$10M), the SAFE investor holds **8.00%** on a fully-diluted basis.

**Worked example — same round with a pre-money SAFE.**

- Same A$500k cheque, same A$5M *pre-money* cap.
- Priced round at A$8M pre-money, A$2M raise.
- Under the pre-money SAFE, the investor's price per share is calculated as if the cap were the pre-money — but *everyone else's* dilution is shared.
- Effective SAFE investor ownership on conversion ≈ **9.09%** pre-new-money, **7.27%** post-new-money.

The difference (10% vs 9.09%) may look small, but on a A$50M Series A it compounds to hundreds of thousands of dollars. **Default to post-money in Australia** — every accelerator SAFE (Antler, Startmate, Blackbird's early cheques) uses post-money, and standardisation reduces legal cost.

### Valuation cap and discount — how they interact

Two levers on a SAFE:

- **Valuation cap** — the maximum valuation at which the SAFE converts. Investor's downside protection against you raising at a huge markup.
- **Discount** — a percentage discount to the priced-round price. Typically 15–25%.

The SAFE converts at **whichever is more favourable to the investor** (lower price per share).

**Worked example — cap and discount together.**

- SAFE: A$500k, A$5M post-money cap, 20% discount.
- Priced round: A$6M pre-money, A$2M raise, A$8M post-money.
- **Cap conversion:** A$500k / A$5M = 10.00% of the post-money cap.
- **Discount conversion:** priced round price per share × 0.80 = effective conversion at A$6.4M post-money → A$500k / A$6.4M = 7.81%.
- Cap wins (10% > 7.81%), investor takes 10.00%.

If the priced round had come in at A$4.5M post-money (below the cap), the discount would kick in instead — 20% off a low round is worth more than the cap.

### When SAFEs go wrong in Australia

- **Multiple SAFEs at different caps.** Three A$200k SAFEs at A$3M, A$4M, and A$5M caps stack — and at your priced round they all convert simultaneously, potentially eating 15–20% of your cap table.
- **No option-pool shuffle modelling.** The priced-round investor will demand a 10% post-money ESOP inside pre-money. That dilution comes out of you and the SAFE holders — not them.
- **AU legal quirks.** The standard YC post-money SAFE references Delaware law. Get an AU-law variant (or an AU-law schedule attached) so ASIC and court enforcement are unambiguous.

## Instrument 2 — The Convertible Note

A convertible note is a **debt instrument** that converts into equity at a triggering event (usually the next priced round, sometimes maturity, sometimes exit). Unlike a SAFE, it accrues interest and has a maturity date, at which point it becomes repayable in cash (or forcibly converts, depending on drafting).

**Typical AU convertible note terms in 2026:**

| Term | Common value |
| --- | --- |
| Interest rate | 5–8% p.a., simple |
| Maturity | 18–24 months |
| Valuation cap | Yes — usually A$3M–A$10M for pre-seed to seed |
| Discount | 15–25% to next round |
| Conversion trigger | Qualified financing (usually >A$1M raised) |
| Maturity behaviour | Convert at cap OR repay in cash (negotiated) |

**Worked example — convertible note conversion.**

- A$500k convertible note, 8% interest, A$5M valuation cap, 20% discount, 18-month maturity.
- Priced round 12 months later: A$6M pre-money, A$2M raise.
- Interest accrued: A$500k × 8% × 1.0 = **A$40k**.
- Total to convert: **A$540k**.
- Cap conversion: A$540k / A$5M = **10.80%** of pre-money → after A$2M raise dilutes 25%, investor holds **8.10%** post-money.
- Discount conversion: A$540k at 80% of the A$6M pre-money price → A$540k / A$4.8M = 11.25% of pre-money → 8.44% post-money.
- Discount wins (barely). Investor holds 8.44% post-money.

### When to use a convertible note over a SAFE

- **Family office and HNW investors** often prefer notes because interest and maturity give a semblance of downside protection.
- **Bridge rounds** between priced rounds — the maturity date signals "we intend to close a real round within 18 months".
- **International (US) angel investors** who don't want SAFE tax treatment ambiguity in AU.

For most AU pre-seed rounds, however, a SAFE is faster, cheaper, and just as founder-friendly.

### The maturity-date landmine

The biggest founder trap with convertible notes is the **maturity clause**. If your note matures before you raise a priced round, the investor may:

1. Demand cash repayment (which you probably can't afford), or
2. Force conversion at the cap (fine), or
3. Renegotiate — usually at a lower cap and steeper discount.

Draft with **automatic conversion at maturity at the cap**, or you're handing your investors a call option on your equity 18 months out.

## Instrument 3 — The Priced Round

A priced round issues actual shares (preference shares to investors, usually) at an agreed pre-money valuation. No conversion, no cap, no discount — you and the investor agree a number and cut the paper today.

**Two flavours in AU practice:**

- **SAFE-lite priced round** — a stripped-down term sheet using the AU-adapted NVCA seed template or the Australian Investment Council's model. Suitable for party rounds up to A$1.5M with a lead angel or micro-VC.
- **Full priced round** — the institutional seed or Series A, with liquidation preference, anti-dilution, board seats, information rights, and pre-emption. This is what your lead investor's lawyer drafts.

### Term-sheet clauses that actually matter

| Clause | What to negotiate | Founder-friendly default |
| --- | --- | --- |
| Pre-money valuation | The headline | Range supported by 2–3 methods |
| Round size | Not more than 18 months runway | Enough, not more |
| Liquidation preference | 1× non-participating preferred | Never accept participating outside distressed contexts |
| Anti-dilution | Weighted-average (broad-based) | Never accept full ratchet at seed |
| ESOP pool | Post-money %, topped up inside pre-money | 10% at seed |
| Board seats | 1 investor, 2 founders, 0 independent at seed | Add an independent at Series A |
| Pre-emption | Investors have pro-rata rights on next round | Yes, but cap at existing holding % |
| Drag-along | Threshold at 50%+ of prefs + majority of ords | Never below 50% |
| Vesting | 4-year, 12-month cliff on founder shares | Yes — investors will insist |
| Information rights | Quarterly management accounts + annual audited | Yes, but define what "audited" means |

Draft your first-pass term sheet in the [term sheet tool](/tools/term-sheet), then negotiate the sensitive clauses via the [term sheet workspace](/workspace/term-sheet) which tracks redlines and version history against the AU market defaults.

### Priced-round mechanics — the numbers

**Worked example — full seed priced round.**

- Pre-money: A$6M. Round size: A$2M. Post-money: A$8M.
- Investor stake: A$2M / A$8M = **25%**.
- ESOP top-up to 10% post-money, inside pre-money = **10%**.
- Founders (previously 100% of a 10M-share cap table) end at **65%**.
- Share count target: 20,000,000 fully diluted post-round.

| Holder | Shares | % of fully diluted |
| --- | --- | --- |
| Founder A | 6,500,000 | 32.5% |
| Founder B | 6,500,000 | 32.5% |
| ESOP pool | 2,000,000 | 10.0% |
| Seed investor | 5,000,000 | 25.0% |
| **Total** | **20,000,000** | **100.0%** |

## AU legal and disclosure requirements

Every raise in Australia triggers rules under the *Corporations Act 2001*. Get these wrong and ASIC penalties start at A$16,500 per breach — and the deal itself can be voided.

**Section 708 — small-scale offer exemption.** You can raise from up to **20 investors in any 12-month period, capped at A$2M** without a disclosure document. Beyond that: you need a **sophisticated investor certificate** (s708(8) — A$2.5M net assets or A$250k income for two consecutive years, certified by a qualified accountant) or a **professional investor** classification, otherwise a full prospectus is required.

**Register the certificates.** Every sophisticated investor certificate should be dated within 6 months of the wire and stored on file. ASIC has audited this in 2024–2025.

**AFSL considerations.** If you are marketing to retail investors or running a crowdfunding raise, you need an Australian Financial Services Licence (or a licensed intermediary like Birchal or Equitise). Most seed rounds avoid this by staying inside s708.

**ESIC benefits stack on top.** An [ESIC-registered](/insights/esic-and-rnd-tax-incentive-guide-2026) startup lets its investors claim a **20% tax offset** (up to A$200k) plus **CGT exemption** on shares held >12 months. This significantly widens the sophisticated-investor pool willing to write a cheque.

## Real AU examples: instrument choice by stage

- **Canva** raised its earliest angel money on a mix of convertible notes and priced rounds in 2013 before its Blackbird lead. The founders preferred priced rounds because they could defend a valuation with early enterprise traction.
- **Airwallex** did three sequential post-money SAFEs at rising caps in 2015–2016 before its US$3M Gobi Partners seed. Modelling SAFE conversion up-front saved them ~15% dilution at the Series A.
- **Zeller** did a single priced seed round of A$25M in 2021 (led by Square Peg and Apex) skipping SAFEs entirely — the founders had prior operator credibility (ex-Square Australia) and could defend the number cold.
- **Employment Hero** used convertible notes for its earliest bridge financings before formally pricing at Series A — chosen for tax neutrality with a US-based angel base.
- **Immutable** ran a SAFE-first pre-seed in 2018 before its A$300M raise from Temasek and Tencent; the SAFEs let them close A$2.4M in 6 weeks while the Series A took 5 months.
- **Culture Amp** ran priced rounds throughout, using standard AU seed papers — a deliberate choice to build a clean cap table for the international expansion that followed.

## Common instrument mistakes AU founders make

- **Stacking too many SAFEs at inconsistent caps.** Convert-and-count *before* your priced round.
- **Ignoring the option-pool shuffle.** The priced-round investor will demand a 10% pool inside pre-money.
- **Convertible notes with cash-repay maturity.** Draft mandatory conversion at maturity or you hand investors a put option.
- **No sophisticated-investor certificates on file.** ASIC audits this. Fix it before the wire, not after.
- **Ignoring ESIC.** The 20% investor offset widens the pool by 40–60% for the same ask.
- **Copying US paper wholesale.** Use AU-law variants — Australian courts do not enforce Delaware jurisdictional clauses cleanly.

## FAQ

### Should my first AU pre-seed cheque be a SAFE or a convertible note?
Default to a post-money SAFE unless the investor specifically requires interest and maturity (family offices often do). SAFEs are cheaper (~A$3k vs ~A$7k) and close faster.

### What valuation cap should I use on my first SAFE?
Anchor to your defensible pre-seed range (typically A$2M–A$4M) and set the cap at the top of that range. Too high a cap and you'll dilute yourself when it converts; too low and every future SAFE resets around your first cap.

### Can I use a US-standard YC SAFE in Australia?
Yes, but attach an AU-law schedule addressing jurisdiction, s708 disclosure, and any GST/withholding implications. Most AU startup lawyers have a two-page addendum ready to go.

### What's the maximum I can raise on SAFEs before doing a priced round?
Practically, A$1.5M–A$2M before the cap-table complexity forces a priced round. Also watch the s708 20-investor / A$2M limit unless every SAFE holder is a certified sophisticated investor.

### Do I need a lead investor for a priced round?
Below A$1M — no, a party round works. Above A$1M — yes, a lead sets terms and does DD, which every follower will lean on.

### Are convertible notes tax-deductible interest in Australia?
The interest is generally not deductible against your revenue until paid (and is capitalised on conversion). Talk to your accountant — the ATO treats convertible-note interest inconsistently across structures.

### What is a "sophisticated investor" in Australia?
Under s708(8), any individual who has (a) net assets of A$2.5M, or (b) gross income of A$250k for two consecutive years, and holds a qualified accountant's certificate dated within 6 months.

### Do ESIC benefits apply to SAFE and convertible-note investors?
Only on conversion into shares, and only if the company is ESIC-registered *at the time of the share issue*. This is why some AU angels prefer priced rounds — the ESIC offset kicks in immediately.

---

**Next steps.** Draft your first term sheet in the free [term sheet tool](/tools/term-sheet), negotiate redlines in the [term sheet workspace](/workspace/term-sheet), and benchmark your ask against 2,700+ AU rounds with the [Startup Value Index](/svi). See [pricing](/pricing) for upgrade options.

*General information only. Not financial or legal advice. Consult a qualified adviser before making decisions.*
