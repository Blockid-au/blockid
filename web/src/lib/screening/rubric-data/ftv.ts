// rubric@v1 — FTV (lead CHRO): 12 guiding questions + overlays FTV-06/08/09.
// Fairness rule: nothing here scores demographic traits or credential
// prestige; rubric.test.ts runs the registry's FTV term guard on every string.

import type { RubricInput } from "./define";

export const FTV_RUBRIC: readonly RubricInput[] = [
  {
    id: "blockid:question:founder_profile:9ae8fd3780184e53", item: "FTV-04",
    question: "What is the lead founder's relevant experience?",
    anchors: [
      "Evidence shows the lead founder has no working exposure to this customer, industry or function.",
      "Relevant experience is asserted but no role, employer, period or outcome can be identified.",
      "Named prior roles in an adjacent field are stated with periods, but none is confirmed by a record or reference.",
      "Directly relevant roles with periods and concrete outcomes are confirmed by at least one record or reference.",
      "Directly relevant roles, including ownership of a comparable product, market or P&L, are confirmed by independent records (ASIC director history, signed reference) and match the pitch.",
    ],
    checklist: [
      "Is each claimed role named with an organisation and a period?",
      "Is at least one role confirmed by a T1/T2 record or reference?",
      "Does the experience touch the same customer, industry or function as the company?",
    ],
    examples: {
      level2: "Deck says the founder spent 6 years in logistics software sales; no reference or record yet.",
      level4: "ASIC history and two signed references confirm the founder ran a freight-software P&L for 5 years before founding.",
    },
    evidenceTypes: ["document", "reference", "asic", "founder_input"],
    level4Tiers: ["T1", "T2"],
    notApplicable: "Never N/A: every company has a lead founder; an unknown answer stays pending until evidence is supplied.",
  },
  {
    id: "blockid:question:founder_profile:7d1532c5f2a434cb", item: "FTV-01",
    question: "Have the founders worked together before?",
    anchors: [
      "Evidence shows the founders met for this venture and have an unresolved conflict or a departure already.",
      "The founders say they know each other but give no shared project, employer or period.",
      "One shared project or employer is named with a period, supported only by the founders' own account.",
      "A shared project or employer with a period and a delivered outcome is supported by a document or reference.",
      "Multiple shared projects over time with delivered outcomes are confirmed by references or records, and roles in this company follow that history.",
    ],
    checklist: [
      "Is a shared project or employer named with a period?",
      "Is the shared history confirmed by a document or third-party reference?",
      "Did the shared work produce a delivered outcome?",
    ],
    examples: {
      level2: "Founders state they built a side project together in 2023; no link or reference.",
      level4: "Two references and a public product page confirm the founders shipped two products together over four years.",
    },
    evidenceTypes: ["reference", "document", "public_url", "founder_input"],
    notApplicable: "N/A for a single-founder company; the question then transfers to FTV-02 role coverage.",
  },
  {
    id: "blockid:question:founder_profile:1a6358c2526fa381", item: "FTV-01",
    question: "What domain expertise does the founding team bring?",
    anchors: [
      "Evidence shows the team has no exposure to the problem domain and misstates basic facts about it.",
      "Domain expertise is claimed in general terms with no specific problem, customer or work history.",
      "Specific domain work is described (customers served, problems handled) but only founder-stated.",
      "Specific domain work is documented and the team's insight about the problem is supported by customer evidence.",
      "Deep, documented domain work is confirmed by references or records and produced a non-obvious insight the company is built on.",
    ],
    checklist: [
      "Does the team name the specific problem it handled before?",
      "Is the domain work supported by a document, reference or public record?",
      "Is there an insight about the problem that only domain exposure would give?",
    ],
    examples: {
      level2: "Founder describes years of handling claims in insurance operations; no reference supplied.",
      level4: "Signed references from two insurers confirm the founder redesigned their claims workflow, the insight behind the product.",
    },
    evidenceTypes: ["reference", "document", "public_url", "founder_input"],
    notApplicable: "Never N/A: domain expertise applies to every company and stage.",
  },
  {
    id: "blockid:question:founder_profile:86630d5700dae95d", item: "FTV-04",
    question: "Any prior startup experience or exits?",
    anchors: [
      "Evidence shows a prior venture ended in an unresolved dispute, insolvency misconduct or a banned-director record.",
      "Prior startup experience is claimed with no company name, role or outcome.",
      "A prior venture is named with the founder's role and outcome, supported only by the founder.",
      "A prior venture, role and outcome are confirmed by ASIC records, a public source or a reference.",
      "A prior venture that scaled or exited is confirmed by records, with the founder in a decision-making role; first-time founders can reach level 3 via FTV-04 industry record instead.",
    ],
    checklist: [
      "Is each prior venture named with the founder's role?",
      "Is the outcome (scaled, sold, closed) stated and dated?",
      "Is the venture confirmed by ASIC, a public source or a reference?",
    ],
    examples: {
      level2: "Founder says they co-founded a SaaS company that was acquired; name given, no record yet.",
      level4: "ASIC extract and the acquirer's announcement confirm the founder was CEO of a company sold in 2021.",
    },
    evidenceTypes: ["asic", "public_url", "reference", "founder_input"],
    level4Tiers: ["T1", "T2"],
    notApplicable: "N/A when every founder is a first-time founder with no prior venture; that is not a penalty and the entry shows pending, not 0.",
  },
  {
    id: "blockid:question:team:d78f9584c696bb84", item: "FTV-03",
    question: "How many people are on the team?",
    anchors: [
      "Evidence shows nobody works full-time on the company.",
      "A headcount is stated without names, roles or full-time/part-time split.",
      "A named roster with roles and full-time/part-time split is given, founder-stated only.",
      "The roster and full-time share are consistent with payroll/STP or signed contracts.",
      "Payroll/STP confirms the full-time roster, founders are full-time, and headcount fits the stage plan (PS/S: founders full-time; A+: functional leads in place).",
    ],
    checklist: [
      "Is there a named roster with roles?",
      "Is the full-time versus part-time split stated for every founder?",
      "Does payroll/STP or a signed contract confirm the roster?",
    ],
    examples: {
      level2: "Deck lists 5 people with roles; two founders full-time, one part-time; no payroll evidence.",
      level4: "STP report confirms 9 staff including all 3 founders full-time, matching the org chart.",
    },
    evidenceTypes: ["payroll", "ato", "contract", "founder_input"],
    level4Tiers: ["T1"],
    notApplicable: "Never N/A: team size and commitment apply at every stage.",
  },
  {
    id: "blockid:question:team:05b12dca2fd5576c", item: "FTV-02",
    question: "What key roles are filled (tech, business, design)?",
    anchors: [
      "Evidence shows both building and selling are outsourced or unfilled.",
      "Roles are listed as intentions with no named person owning build or sell.",
      "Named people own build and sell, founder-stated, with at least one function outsourced.",
      "Named people own build and sell in-house, supported by commits, contracts or payroll.",
      "Build, sell and product/design are owned in-house by named people, confirmed by git history and signed agreements, with the stage-appropriate functional leads in place at A+.",
    ],
    checklist: [
      "Does a named person own product build?",
      "Does a named person own selling to customers?",
      "Is ownership confirmed by git history, payroll or a signed agreement?",
    ],
    examples: {
      level2: "CTO and CEO named; design is contracted to an agency; no commit data shared.",
      level4: "Git connector shows the CTO and two engineers author 90% of commits; the CEO's signed agreement covers sales.",
    },
    evidenceTypes: ["git", "contract", "payroll", "founder_input"],
    notApplicable: "Never N/A: role coverage applies at every stage.",
  },
  {
    id: "blockid:question:team:9363f15231dde2c7", item: "FTV-02",
    question: "What critical roles are still missing?",
    anchors: [
      "Evidence shows a critical gap (no one can build or sell) that the team does not acknowledge.",
      "Gaps are named vaguely ('we need more people') with no link to the plan.",
      "Specific missing roles are named with a reason tied to the plan, founder-stated.",
      "Missing roles are named, prioritised against milestones and budgeted in the model or use of funds.",
      "Missing roles are prioritised, budgeted and already in an active search (role brief, recruiter or offer) that matches the round's milestones.",
    ],
    checklist: [
      "Are the missing roles named specifically?",
      "Is each missing role linked to a milestone or risk?",
      "Is the hire budgeted in the model or use of funds?",
    ],
    examples: {
      level2: "Team says it needs a head of sales next year to reach enterprise buyers.",
      level4: "Use of funds budgets a head of sales in month 2; role brief and recruiter contract are in the data room.",
    },
    evidenceTypes: ["document", "financial_model", "contract", "founder_input"],
    level4Tiers: ["T2", "T3"],
    notApplicable: "Never N/A: a team with no gaps still answers by showing coverage (level 3–4).",
  },
  {
    id: "blockid:question:team:6e680aa9167ae5a6", item: "FTV-07",
    question: "What is your hiring plan for the next 12 months?",
    anchors: [
      "Evidence shows a hiring plan the company cannot fund within its runway.",
      "Hiring intent is stated with no roles, timing or cost.",
      "Roles and timing are listed, founder-stated, without costs or milestone links.",
      "Roles, timing and fully loaded cost are in the model and linked to milestones and runway.",
      "The costed plan links each hire to a milestone, fits runway after the raise, and prior hiring plans were delivered on time.",
    ],
    checklist: [
      "Are roles and timing listed?",
      "Is each hire costed in the financial model?",
      "Does the plan fit the runway after the raise?",
    ],
    examples: {
      level2: "Plan lists 3 engineers and a marketer over 12 months; no costs.",
      level4: "Model costs 4 hires against two milestones; runway stays above 18 months; last year's 3 planned hires joined on schedule.",
    },
    evidenceTypes: ["financial_model", "document", "payroll", "founder_input"],
    level4Tiers: ["T1", "T3"],
    notApplicable: "N/A only when the company states and evidences a deliberate no-hire plan for the period.",
  },
  {
    id: "blockid:question:team_structure:bf8118940f1046c3", item: "FTV-07",
    question: "Do you have a clear org chart?",
    anchors: [
      "Evidence shows reporting lines conflict with contracts or payroll.",
      "Reporting lines are described informally with no chart.",
      "An org chart exists with names and reporting lines, not reconciled to payroll.",
      "The org chart reconciles to payroll/contracts and shows who owns each function.",
      "The org chart reconciles to payroll, names owners for every function, and shows senior hires retained over the last 12 months.",
    ],
    checklist: [
      "Is there a written org chart with names?",
      "Does it reconcile to payroll or contracts?",
      "Does every core function have a named owner?",
    ],
    examples: {
      level2: "Slide shows an org chart of 6 names; no payroll data.",
      level4: "Org chart matches the STP roster; each function has an owner; both senior hires from last year remain.",
    },
    evidenceTypes: ["document", "payroll", "contract"],
    notApplicable: "N/A at PS when the team is founders only (no reporting lines yet).",
  },
  {
    id: "blockid:question:team_structure:78c0a15277b3e586", item: "FTV-07",
    question: "Do you have an advisory board?",
    anchors: [
      "Evidence shows named advisers deny involvement or were listed without consent.",
      "Advisers are claimed without names or roles.",
      "Named advisers with stated areas are listed, founder-stated.",
      "Named advisers have signed advisory agreements with defined scope and equity/fee terms.",
      "Signed advisers cover the company's key gaps, meet on a documented cadence, and at least one gives a reference.",
    ],
    checklist: [
      "Are advisers named with their area of help?",
      "Is there a signed advisory agreement for each?",
      "Is there evidence of real engagement (meeting notes, reference)?",
    ],
    examples: {
      level2: "Deck lists 3 advisers with their areas; no agreements.",
      level4: "Signed agreements for 3 advisers covering regulation and sales; quarterly notes and one reference call.",
    },
    evidenceTypes: ["contract", "reference", "board_minutes", "founder_input"],
    level4Tiers: ["T2"],
    notApplicable: "N/A when the company has a formal board that covers the same gaps (scored under board questions).",
  },
  {
    id: "blockid:question:team_structure:d8e3b1fd289c1b20", item: "FTV-02",
    question: "How are roles and responsibilities defined?",
    anchors: [
      "Evidence shows overlapping or disputed ownership of core decisions.",
      "Responsibilities are described as 'everyone does everything'.",
      "Each founder's area is described in writing, founder-stated.",
      "Written role definitions exist in signed founder or employment agreements.",
      "Signed agreements define roles and decision rights, and the split matches who actually ships and sells (git, CRM).",
    ],
    checklist: [
      "Is each founder's area written down?",
      "Are roles in signed agreements?",
      "Do system records (git, CRM) match the stated split?",
    ],
    examples: {
      level2: "One-pager assigns product to the CTO and sales to the CEO; no agreements.",
      level4: "Founder agreement defines roles and decision rights; git and CRM activity match them.",
    },
    evidenceTypes: ["contract", "document", "git", "crm"],
    notApplicable: "Never N/A: role clarity applies at every stage, including solo founders (scope of contractors).",
  },
  {
    id: "blockid:question:team_structure:a188bb064bd37212", item: "FTV-05",
    question: "Do you have regular board meetings?",
    anchors: [
      "Evidence shows the board has not met in the last two quarters despite outside investors.",
      "Meetings are claimed with no dates, attendees or minutes.",
      "Meeting dates and attendees are listed, without minutes or KPI packs.",
      "Minutes exist for recent meetings on a regular cadence with decisions recorded.",
      "Minutes on a regular cadence record decisions, KPI packs and follow-up on previous actions, showing measurable progress between meetings.",
    ],
    checklist: [
      "Are meeting dates on a regular cadence?",
      "Are minutes kept with decisions recorded?",
      "Do meetings review KPIs and past actions?",
    ],
    examples: {
      level2: "Founders say the board meets quarterly; dates listed, no minutes.",
      level4: "Signed minutes for the last 4 quarters with KPI packs and an action log.",
    },
    evidenceTypes: ["board_minutes", "document"],
    level4Tiers: ["T2", "T3"],
    stages: ["S", "A", "B+"],
    notApplicable: "N/A at PS and whenever there are no outside shareholders or directors yet.",
  },
  {
    id: "FTV-06",
    anchors: [
      "Evidence shows a departed founder holds a large unvested-in-substance stake or there is no founder agreement at all.",
      "Vesting is claimed but no agreement is shared.",
      "A draft or unsigned founder agreement with vesting terms exists.",
      "A signed founder or shareholders agreement applies vesting with a cliff to every founder.",
      "Signed agreements apply cliff vesting to every founder, leaver provisions are defined, and the cap table reflects them.",
    ],
    checklist: [
      "Is there a signed founder or shareholders agreement?",
      "Does vesting with a cliff apply to every founder?",
      "Are good/bad leaver provisions defined?",
    ],
    examples: {
      level2: "Draft shareholders agreement with vesting terms, not yet signed.",
      level4: "Signed SHA: every founder on vesting with a cliff, leaver clauses, reflected in the cap table.",
    },
    notApplicable: "N/A for a single-founder company with no co-founder equity.",
  },
  {
    id: "FTV-08",
    anchors: [
      "Evidence shows metrics presented by founders contradict records or references.",
      "No reference or diligence answer is available to test the founders' claims.",
      "References are offered but only cover general character, not the metrics presented.",
      "References and diligence answers confirm the key metrics presented, with minor explained gaps.",
      "Independent references and diligence answers confirm every key metric, and founders disclosed weaknesses before they were found.",
    ],
    checklist: [
      "Were references or diligence answers obtained?",
      "Do they confirm the key metrics presented?",
      "Did the founders disclose known weaknesses unprompted?",
    ],
    examples: {
      level2: "Two references praise the founders' work ethic; neither comments on revenue or customers.",
      level4: "Three customer references confirm contract values; founders flagged a churned account before diligence.",
    },
    notApplicable: "N/A until at least one reference or diligence answer exists; pending, not 0.",
  },
  {
    id: "FTV-09",
    anchors: [
      "Evidence shows every decision still routes through the CEO and senior leaders have left.",
      "An executive team is claimed with no names or scope.",
      "Named executives exist but decision rights are informal and undocumented.",
      "Named executives own functions with delegated authority recorded in board minutes.",
      "A retained executive bench owns every core function with delegated authority, and board minutes show the CEO focused on strategy and capital.",
    ],
    checklist: [
      "Are executives named for each core function?",
      "Is delegated authority recorded (board minutes, delegation policy)?",
      "Have executives been retained over the last 12 months?",
    ],
    examples: {
      level2: "CFO and VP Sales named; no delegation of authority on record.",
      level4: "Board-approved delegation policy; COO, CFO, VP Sales and VP Eng retained 18+ months.",
    },
    notApplicable: "N/A before Series A.",
  },
];
