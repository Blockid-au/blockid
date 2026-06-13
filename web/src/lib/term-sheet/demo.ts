/**
 * Demo Term Sheet AI analysis — used when ANTHROPIC_API_KEY is not set.
 *
 * Realistic, founder-friendly analysis of a typical pre-seed AU SAFE:
 * AUD $500k at $5M post-money cap, 20% discount, MFN with 24-month expiry,
 * no board seat. Quality must match what Sonnet 4.6 would produce so the
 * tool feels live in dev / preview environments.
 */
import type { TermSheetAnalysis } from "./schema";

export const DEMO_TERM_SHEET = `BLOCKID DEMO — SAFE TERM SHEET (Pre-seed)

Issuer: Acme Robotics Pty Ltd (ACN 000 000 000)
Investor: Atlas Ventures Pty Ltd (lead) + 4 co-investors
Investment amount: AUD $500,000 (lead $300k, co-investors $50k each)
Instrument: Standard SAFE (post-money valuation cap)

Valuation cap (post-money): AUD $5,000,000
Discount: 20% on conversion at qualified financing
Most favoured nation: Yes — 24 month expiry from the date of this SAFE
Pro-rata rights: Major investors only (cheques ≥ AUD $100k)
Board seat: No board seat for any SAFE investor
Liquidation preference: 1x non-participating preferred upon conversion to preference shares
Information rights: Quarterly management accounts; annual audited accounts
Closing conditions: Customary; clean ASIC search; sophisticated-investor certificates collected
ESIC: Issuer represents it is currently an Early Stage Innovation Company (ESIC) eligible
No-shop: 30 days from term sheet signing
Founder vesting: Existing 4-year vesting from incorporation, no acceleration
Use of proceeds: 18-month runway, hiring 2 senior engineers + 1 GTM hire`;

export const DEMO_ANALYSIS: TermSheetAnalysis = {
  instrumentType: "SAFE",
  plainEnglishSummary:
    "This is a standard, founder-friendly Australian pre-seed SAFE: AUD $500k coming in at a $5M post-money cap with a 20% discount on the next priced round. Atlas isn't taking a board seat, the MFN expires in 24 months, and pro-rata is limited to cheques over $100k — all good signs that the lead is happy to ride along rather than control the company. The valuation cap sits in the middle of the AU pre-seed band ($1.5M–$10M) so you're not under- or over-pricing. The two terms worth tightening are (a) confirming that founder vesting credits time served from incorporation rather than resetting at SAFE conversion, and (b) capping pro-rata at 18–24 months so it doesn't haunt your Series A.",
  keyTerms: {
    investorAmountAud: 500000,
    valuationCapAud: 5000000,
    discountPct: 20,
    preMoneyAud: null,
    postMoneyAud: 5000000,
    optionPoolPostMoneyPct: null,
    boardSeatsToInvestor: 0,
    liquidationPreference: "1x non-participating",
    proRataRights: true,
    leadInvestorName: "Atlas Ventures Pty Ltd",
  },
  redline: [
    {
      clause: "Pro-rata rights — sunset",
      issue:
        "Pro-rata is granted to major investors with no expiry. At Series A you'll have a cap table cluttered with $100k cheques each holding pre-emptive rights, which slows down rounds and gives small holders blocking leverage.",
      severity: "warning",
      suggestedRevision:
        "Add a 24-month sunset: \"Pro-rata rights expire 24 months after the closing date of this SAFE, or upon the closing of a qualified financing of AUD $3M+, whichever is earlier.\"",
      clause_confidence: 0.95,
      risk_level: "medium",
    },
    {
      clause: "Founder vesting on conversion",
      issue:
        "The term sheet states founders' existing 4-year vesting continues from incorporation, but it's silent on what happens if Atlas's preferred-share documents (drafted at the next priced round) reset vesting. Standard AU investor docs do reset — credit for time served must be negotiated in writing now or you'll lose 18 months of vesting at Series A.",
      severity: "critical",
      suggestedRevision:
        'Add to the SAFE: "On conversion, founders\' shares will retain credit for time served from each founder\'s individual start date and will not be subject to a new vesting cliff. Acceleration on change of control: double-trigger (sale + termination without cause within 12 months)."',
      clause_confidence: 0.85,
      risk_level: "critical",
    },
    {
      clause: "MFN scope",
      issue:
        "MFN with a 24-month expiry is fine, but the clause doesn't specify which terms travel — it could be read as the entire SAFE rather than just economic terms. If you do a strategic SAFE with a different cap structure later, Atlas could claim the better terms wholesale.",
      severity: "info",
      suggestedRevision:
        'Tighten to: "MFN applies to economic terms only (valuation cap, discount, conversion mechanics) and not to governance terms (board, information rights, transfer restrictions)."',
      clause_confidence: 0.9,
      risk_level: "low",
    },
    {
      clause: "ESIC representation",
      issue:
        "The issuer represents ESIC eligibility 'currently'. ESIC eligibility is tested at the time of the share issue, not at SAFE signing — and the company can fall out of eligibility between signing and conversion if assessable income breaches AUD $200k. Investors will lose the 20% offset if the company isn't ESIC at conversion.",
      severity: "warning",
      suggestedRevision:
        'Add: "Issuer will use reasonable endeavours to remain ESIC-eligible until conversion, and will notify investors within 14 days of any event that would cause it to fail the ESIC tests. No clawback or indemnity arises if ESIC eligibility is lost despite reasonable endeavours."',
      clause_confidence: 1.0,
      risk_level: "high",
    },
  ],
  auMarketComparison: {
    summary:
      "Solid AU pre-seed terms — well within the founder-friendly half of the market. The cap, discount, no-board-seat, and limited pro-rata structure all match what Blackbird, AirTree, Skip and Tank Stream offer for similar-stage rounds. Two minor structural fixes (vesting + pro-rata sunset) would put this term sheet ahead of the AU median.",
    deviations: [
      {
        term: "Valuation cap (post-money)",
        yourTerm: "AUD $5.0M",
        auMarketNorm: "AUD $1.5M – $10M (pre-seed median ~$3.5M)",
        verdict: "neutral",
      },
      {
        term: "Discount",
        yourTerm: "20%",
        auMarketNorm: "15–20% at pre-seed",
        verdict: "neutral",
      },
      {
        term: "MFN expiry",
        yourTerm: "24 months",
        auMarketNorm: "12–24 months (or no MFN)",
        verdict: "founder_friendly",
      },
      {
        term: "Board seat",
        yourTerm: "None",
        auMarketNorm: "Observer for $250k+ leads at pre-seed",
        verdict: "founder_friendly",
      },
      {
        term: "Pro-rata threshold",
        yourTerm: "$100k major-investor floor, no sunset",
        auMarketNorm: "$50k–$250k floor, 18–24 month sunset",
        verdict: "investor_friendly",
      },
    ],
  },
  riskFlags: [
    {
      flag: "Vesting reset risk at Series A",
      why: "If Atlas drafts the priced-round shareholders' agreement, the AU default is to reset founder vesting unless 'credit for time served' is explicitly preserved at the SAFE stage. Lock this in now.",
    },
    {
      flag: "ESIC eligibility timing",
      why: "ESIC is tested at share issue (i.e. at conversion). If your company crosses AUD $200k assessable income before the next priced round, investors lose the 20% tax offset and may get cold feet on conversion. Track quarterly and pre-warn.",
    },
    {
      flag: "Pro-rata clutter at Series A",
      why: "Five investors with pro-rata and no sunset means at least 5 conversations to clear the pre-emption process for the Series A. Sunsets make Series A 4–6 weeks faster.",
    },
  ],
  lawyer_questions: [
    "Has each co-investor provided a current accountant certificate confirming wholesale/sophisticated investor status under s708 Corporations Act? If not, the issue may be void.",
    "What is the company's current assessable income — are you within 6 months of breaching the AUD $200k ESIC income threshold?",
    "Are founders' shares currently under a vesting deed? If so, does it survive conversion automatically or does it need to be novated under the Series A shareholders' agreement?",
    "Who controls the 'qualified financing' trigger definition — can a strategic co-investor force conversion with a small bridge at an unfavourable cap?",
    "Are any of the five co-investors related parties under Corporations Act s208? If the company is a public company or has obligations under its constitution, board approval may be required.",
    "Does the no-shop clause prevent founders from responding to unsolicited interest — or just from actively seeking competing term sheets?",
    "What acceleration does the double-trigger provide — full 100% vest on the second trigger, or just the unvested tranche at termination?",
  ],
  founder_actions: [
    "URGENT: Engage an AU startup lawyer (Cornwalls, Gilbert + Tobin, Mills Oakley Ventures, or Lander & Rogers) to add 'credit for time served' and double-trigger acceleration language to the SAFE before signing — this is not a negotiation you can defer.",
    "Confirm ESIC eligibility with your accountant in writing this week: request a written opinion stating the company passes the 100-point innovation test as at the signing date.",
    "Add a pro-rata sunset clause (24 months or qualified financing of AUD $3M+) — model the language from the Blackbird SAFE template and present it to Atlas as a market-standard edit.",
    "Collect sophisticated/wholesale investor certificates from all five co-investors and have your lawyer verify each certificate complies with s761G(7) or s708(8) Corporations Act.",
    "Clarify the MFN scope in writing with Atlas — get agreement that MFN applies only to economic terms, not governance terms, before the SAFE is executed.",
    "Set a calendar alert for 90 days before the SAFE's 24-month MFN expiry to review whether any subsequent SAFEs have better terms that this SAFE should inherit.",
  ],
};
