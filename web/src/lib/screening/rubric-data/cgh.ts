// rubric@v1 — CGH (lead CFO): overlays CGH-01…10 (no guiding question maps
// here today). Round and ownership references are dated AU bands, not cut-offs.

import type { RubricInput } from "./define";

export const CGH_RUBRIC: readonly RubricInput[] = [
  {
    id: "CGH-01",
    anchors: [
      "Evidence shows the cap table differs from the members register or the ASIC record, or SAFEs are undocumented.",
      "A cap table is claimed but not shared.",
      "A cap table spreadsheet is shared, not reconciled to the register or ASIC.",
      "The cap table reconciles to the members register (s169) and the current ASIC extract.",
      "The cap table reconciles to the register and ASIC, includes every option, SAFE and note on a fully diluted basis, and each issue has a signed record.",
    ],
    checklist: [
      "Does the cap table match the members register?",
      "Does it match the current ASIC extract?",
      "Are all SAFEs, notes and options included fully diluted?",
    ],
    examples: {
      level2: "Carta-style spreadsheet of holders; no ASIC extract.",
      level4: "ASIC extract (dated this quarter), register and fully diluted cap table agree; every issue has a signed application.",
    },
    notApplicable: "Never N/A: every Pty Ltd has a register; a missing record stays pending until supplied.",
  },
  {
    id: "CGH-02",
    anchors: [
      "Evidence shows founders hold very little for the stage or a departed holder keeps a large dead-equity stake.",
      "Founder ownership is not disclosed.",
      "Founder ownership is stated from a spreadsheet cap table.",
      "Reconciled cap table shows founder ownership within the dated stage band and no material dead equity.",
      "Reconciled cap table shows founders well within the stage band after the planned round, with no dead equity and vesting in place.",
    ],
    checklist: [
      "Is founder ownership taken from a reconciled cap table?",
      "Is there any material dead equity (departed holders, inactive founders)?",
      "Is post-round founder ownership modelled?",
    ],
    examples: {
      level2: "Spreadsheet shows founders at 68% after seed.",
      level4: "Reconciled cap table: founders 62% post-round modelled, no departed holders, all founders vesting.",
    },
    notApplicable: "N/A at PS (founders typically hold everything before outside capital).",
  },
  {
    id: "CGH-03",
    anchors: [
      "Evidence shows a single round diluted holders far beyond the dated stage band or rounds were repriced down repeatedly.",
      "Dilution per round is not disclosed.",
      "Round sizes and pre-money values are stated without documents.",
      "Term sheets or subscription agreements confirm dilution per round.",
      "Signed documents confirm dilution per round within the dated stage band, with the next round's dilution modelled.",
    ],
    checklist: [
      "Is each round documented (term sheet, subscription agreement)?",
      "Is dilution per round computed?",
      "Is the next round's dilution modelled?",
    ],
    examples: {
      level2: "Founder says seed sold 20%; no documents.",
      level4: "Signed SAFE conversion and Series A SSA show 18% and 21% dilution; next round modelled at 20%.",
    },
    notApplicable: "N/A before any outside capital has been raised.",
  },
  {
    id: "CGH-04",
    anchors: [
      "Evidence shows under six months of runway with no committed funding (default dead).",
      "Runway is stated without cash balance or burn.",
      "Runway is computed from stated cash and burn, not from bank data.",
      "Bank data and actual burn give runway, and the default-alive test is computed.",
      "Bank data show a long runway after the round, the company is default alive on current growth, and the forecast matched actual burn last period.",
    ],
    checklist: [
      "Is cash taken from bank statements?",
      "Is burn the actual net burn of recent months?",
      "Is the default-alive test computed?",
    ],
    examples: {
      level2: "\"About 12 months of runway\" from the model.",
      level4: "Bank feed: A$1.9M cash, A$85k net burn → 22 months; default alive at current growth; forecast within 5%.",
    },
    notApplicable: "Never N/A.",
  },
  {
    id: "CGH-05",
    anchors: [
      "Evidence shows serial bridge rounds or a down round without explanation.",
      "Round history is not disclosed.",
      "Round history (date, size, instrument) is listed, founder-stated.",
      "Signed documents confirm the history, and each round sits in the dated AU median band for its stage.",
      "Signed documents confirm a clean progression of rounds in or above the dated AU bands, each with milestones met before the next.",
    ],
    checklist: [
      "Is each round listed with date, size and instrument?",
      "Is each round documented?",
      "Were milestones met between rounds?",
    ],
    examples: {
      level2: "List: pre-seed A$600k SAFE 2024, seed A$2.2M 2025; no documents.",
      level4: "Signed documents for both rounds, sizes in the CTV 2025 bands, milestones met in between.",
    },
    notApplicable: "N/A before any outside capital has been raised.",
  },
  {
    id: "CGH-06",
    anchors: [
      "Evidence shows stacked uncapped SAFEs or notes whose conversion would take control from founders.",
      "Convertibles are mentioned without terms.",
      "Convertibles are listed with amounts and caps, founder-stated.",
      "Signed instruments confirm totals, caps and discounts, and conversion is modelled.",
      "Signed instruments confirm modest capped overhang, and a pro-forma conversion at the next round shows founder control retained.",
    ],
    checklist: [
      "Is every SAFE/note listed with amount, cap and discount?",
      "Are the instruments signed and in the data room?",
      "Is conversion modelled at the next round?",
    ],
    examples: {
      level2: "Founder lists A$750k of SAFEs at a A$6M cap.",
      level4: "Signed SAFEs total A$750k at a A$6M cap; pro-forma conversion at seed shows founders at 64%.",
    },
    notApplicable: "N/A when no SAFE or convertible note has been issued.",
  },
  {
    id: "CGH-07",
    anchors: [
      "Evidence shows no functioning board after outside investment at A+.",
      "A board is claimed without composition or meeting records.",
      "Board composition is listed; meetings irregular or minutes missing.",
      "The board meets on a regular cadence with signed minutes.",
      "The board meets regularly with signed minutes, has an independent director, and runs committees suited to the stage.",
    ],
    checklist: [
      "Is board composition documented?",
      "Are meetings regular with signed minutes?",
      "Is there an independent director?",
    ],
    examples: {
      level2: "Board of 3 listed; met twice last year; no minutes shared.",
      level4: "Signed minutes for 8 consecutive meetings; one independent director; audit committee.",
    },
    notApplicable: "N/A before Series A.",
  },
  {
    id: "CGH-08",
    anchors: [
      "Evidence shows options were promised to staff without a plan or documents.",
      "An option pool is mentioned without size or plan.",
      "Pool size is stated; the plan rules are in draft.",
      "A signed ESS plan exists and grants are recorded in a register.",
      "The signed plan, grant register and cap table agree, the pool is sized for the hiring plan, and ESS reporting is lodged.",
    ],
    checklist: [
      "Is there a signed ESS/option plan?",
      "Are grants recorded in a register that matches the cap table?",
      "Is the pool sized for the hiring plan?",
    ],
    examples: {
      level2: "10% pool described in the deck; plan rules in draft.",
      level4: "Board-approved ESS plan; 14 grants in the register match the cap table; pool covers the 12-month hiring plan.",
    },
    notApplicable: "N/A when the company has no employees beyond the founders and has promised no equity.",
  },
  {
    id: "CGH-09",
    anchors: [
      "Evidence shows an existing investor is unsuitable (sanctioned, in dispute, or blocking) or the named lead denies involvement.",
      "Investors are not named.",
      "Existing and target investors are named, founder-stated.",
      "Existing investors are confirmed by the register and a lead or anchor is confirmed in writing.",
      "A credible lead confirmed in writing (term sheet or letter) plus existing investors known, vetted and supportive by reference.",
    ],
    checklist: [
      "Are existing investors confirmed by the register?",
      "Is a lead or anchor confirmed in writing?",
      "Has any investor given a reference?",
    ],
    examples: {
      level2: "Founder names two angels and says a fund is 'interested'.",
      level4: "Register lists the angels; a signed term sheet from an AU seed fund; both angels give references.",
    },
    notApplicable: "N/A at PS before any fundraising has begun.",
  },
  {
    id: "CGH-10",
    anchors: [
      "Evidence shows no bookkeeping, or accounts months behind.",
      "Financial controls are claimed without records.",
      "Accounts exist in an accounting system but are not closed monthly.",
      "The accounting connector shows a monthly close and reconciled bank accounts.",
      "Monthly close is reconciled and timely, management accounts are reviewed, and an audit is in place from Series B.",
    ],
    checklist: [
      "Is bookkeeping in an accounting system?",
      "Is there a monthly close with reconciled bank accounts?",
      "Is there an audit or review suited to the stage?",
    ],
    examples: {
      level2: "Xero used; bank reconciliation 3 months behind.",
      level4: "Xero connector: closed within 10 days each month for 12 months; audited FY accounts (B+).",
    },
    notApplicable: "Never N/A at the stages it applies.",
  },
];
