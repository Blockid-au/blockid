# T_SVI_EXC_0011 — Secondary share offers in AU · regulatory map

**Owner:** CLO · **Collaborators:** CFO
**Goal:** Document the AFSL exemptions relevant to BlockID listing **secondary share offers** for AU startups, and recommend the minimum legal structure for v0.5 (broker partnership vs in-house AFSL).

## Regulatory landscape

### Australian Financial Services Licence (AFSL) — Corporations Act 2001 (Cth) s911A
Default rule: any business providing a "financial service" (incl. dealing in financial products — i.e. shares) must hold an AFSL, be authorised under one, or rely on an exemption.

### Relevant exemptions for secondary share dealings

| # | Statute | Use | Limitations |
|---|---------|-----|-------------|
| 1 | **s708(8) — Sophisticated investor** | Offer to investor certified ≥A$2.5M net assets or A$250k gross income | Annual cap removed for sophisticated; **no disclosure required** |
| 2 | **s708(11) — Professional investor** | AFSL holders, listed entities, investment-grade super funds | No disclosure required |
| 3 | **s708(1) Small-scale (20/12/2)** | Up to 20 retail offers / 12 months / A$2M raised | Cap-binding for >Series A scale-ups |
| 4 | **CO 02/273 — Wholesale clients via accountant cert** | Same as s708(8) but evidenced via accountant cert | Cert valid 2 years |
| 5 | **CO 14/26 — Investor-directed portfolio services (IDPS)** | Not applicable — this is for managed account platforms | Out of scope |
| 6 | **CO 10/1102 — Crowd-Sourced Funding** | Up to A$5M / 12 months, retail investors, A$10k cap each | Requires authorised CSF intermediary |
| 7 | **ASIC RG 246 — Conflicted remuneration** | Bans certain commission structures on share advice | Affects pricing model |

### Three viable paths for v0.5

#### Path A — "Sophisticated investor only" (no AFSL needed)
- BlockID is **not** the dealer; we are a directory + matching layer.
- Founders publish secondary offers to verified **sophisticated investors only** (s708(8)).
- Each match → BlockID hands off to founder's lawyer to paper the SPA.
- **Risk:** if ASIC views the directory + matching as "arranging" under s911A, exemption fails.
- **Mitigation:** explicit T&Cs: BlockID provides factual information only, no advice, no transaction execution.
- **Cost:** A$3k–8k for ASIC-friendly T&Cs review.
- **Timeline:** v0.5 ship-able in 2 weeks.

#### Path B — Authorised representative under a partner AFSL
- BlockID becomes AR under a corporate AFSL holder (PrimaryMarkets, OnMarket, equitise, etc.).
- We can "arrange" dealings in shares for retail + wholesale.
- Partner takes 0.5–2% of GMV.
- **Risk:** dependency on partner's compliance regime; revenue share dilutes margins.
- **Cost:** A$15k–35k onboarding + compliance fees + revenue share.
- **Timeline:** 6–10 weeks to onboard.

#### Path C — In-house AFSL
- BlockID applies for its own AFSL (dealing in financial products, providing general advice).
- Requires Responsible Manager(s) with 5y+ relevant experience + A$50k+ NTA + compliance plan.
- **Risk:** 9–18 month ASIC processing; high ongoing audit/reporting burden.
- **Cost:** A$80k–150k year 1, A$50k+ ongoing.
- **Timeline:** v0.5 delayed 6–12 months.

## Recommendation
**Ship v0.5 on Path A (sophisticated-investor-only matching).** This is the minimum legal posture and the fastest to market. Park Path B as a Q4 2026 upgrade once secondary-offer volume justifies the partner fee. Reject Path C unless an institutional API tier (T_0014) demands first-party clearing.

## Decision needed
- [ ] CEO sign-off on Path A v0.5 launch
- [ ] CFO confirm NTA headroom not required for Path A
- [ ] Engage external securities counsel (Gilbert + Tobin Startups team or MinterEllison) for A$3k T&Cs review
- [ ] CLO drafts the "investor verification + sophisticated-cert upload" UX spec (T_0012/0013)

## References
- ASIC RG 121 — Doing financial services business in Australia
- ASIC RG 246 — Conflicted and other banned remuneration
- ASIC INFO 70 — Crowd-Sourced Funding
- Corporations Act 2001 (Cth) ss 708, 911A
