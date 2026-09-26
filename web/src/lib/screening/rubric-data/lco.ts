// rubric@v1 — LCO (lead CLO): overlays LCO-01…12 (no guiding question maps
// here today). LCO-01 missing IP assignment is a hard red flag at every stage.

import type { RubricInput } from "./define";

export const LCO_RUBRIC: readonly RubricInput[] = [
  {
    id: "LCO-01",
    anchors: [
      "Evidence shows IP created by a founder, employee or contractor is not assigned to the company (hard red flag).",
      "IP ownership is asserted without any deed or clause.",
      "Some founders or staff have signed assignments; contractors or pre-incorporation IP are not covered.",
      "Signed IP assignments cover every founder, employee and contractor, including pre-incorporation IP.",
      "Complete signed assignments are indexed against the contributor list (git, payroll, contractor invoices) with no gaps, and moral-rights consents are included.",
    ],
    checklist: [
      "Has every founder signed an IP assignment, including pre-incorporation work?",
      "Have all employees and contractors signed assignments?",
      "Do the deeds match the contributor list (git, payroll, invoices)?",
    ],
    examples: {
      level2: "Founders' employment agreements include IP clauses; two contractors have not signed.",
      level4: "Deeds for 3 founders (incl. pre-incorporation code), 6 staff and 4 contractors, reconciled to git contributors.",
    },
    notApplicable: "Never N/A: IP ownership applies at every stage.",
  },
  {
    id: "LCO-02",
    anchors: [
      "Evidence shows a conflicting registered trade mark or an opposition against the company's brand.",
      "Registered IP is claimed with no application numbers.",
      "Applications are filed but not yet registered, or only a business name is registered.",
      "IP Australia records confirm the company owns registered trade marks for its core brand in relevant classes.",
      "IP Australia records confirm registered marks (and patents where relevant) owned by the company, clear of conflicts, with filings in key export markets.",
    ],
    checklist: [
      "Is the core brand a registered trade mark owned by the company?",
      "Is the register free of conflicting marks?",
      "Are key export markets covered?",
    ],
    examples: {
      level2: "Trade mark application filed in class 42; not yet registered.",
      level4: "Registered marks in classes 9 and 42 owned by the Pty Ltd; clear search; Madrid filing for NZ and UK.",
    },
    notApplicable: "N/A only when the company operates under a licensed brand it does not own and discloses the licence.",
  },
  {
    id: "LCO-03",
    anchors: [
      "Evidence shows copyleft-licensed code in distributed software with conflicting obligations unaddressed.",
      "Open-source use is not tracked.",
      "Dependencies are listed without licence review.",
      "A licence scan report shows no conflicting obligations in distributed code.",
      "Regular automated licence scans are clean, a policy governs new dependencies, and third-party review confirms freedom to operate.",
    ],
    checklist: [
      "Is there a licence scan of distributed code?",
      "Is it free of conflicting obligations?",
      "Is there a policy for new dependencies?",
    ],
    examples: {
      level2: "Dependency list exported, no licence review.",
      level4: "Quarterly automated scans clean; dependency policy; external FTO review 2026.",
    },
    notApplicable: "N/A when the company distributes no software.",
  },
  {
    id: "LCO-04",
    anchors: [
      "Evidence shows the company carries out a licensed activity without the required licence.",
      "Licensing needs are not assessed.",
      "Required licences are identified; application or authorised-representative arrangement pending.",
      "The relevant register (ASIC AFSL, TGA ARTG, sector register) confirms every licence the activity needs, or confirms none is needed with advice.",
      "Registers confirm every required licence in good standing, conditions are met, and compliance obligations are tracked.",
    ],
    checklist: [
      "Has the company assessed which licences its activity needs?",
      "Does the relevant register confirm each licence?",
      "Are licence conditions tracked?",
    ],
    examples: {
      level2: "Adviser memo says an AFSL authorisation is needed; application pending.",
      level4: "ASIC register confirms authorised-representative status under a named AFSL; compliance calendar on file.",
    },
    notApplicable: "N/A when legal advice confirms the activity needs no licence (the advice itself is the evidence).",
  },
  {
    id: "LCO-05",
    anchors: [
      "Evidence shows an undisclosed eligible data breach or personal data used contrary to the stated policy.",
      "No privacy policy exists.",
      "A privacy policy is published but not mapped to the Australian Privacy Principles.",
      "A privacy policy consistent with the APPs is published and a breach log is kept.",
      "APP-consistent policy, breach log, response plan and a data inventory are maintained, and practices match the policy on inspection.",
    ],
    checklist: [
      "Is a privacy policy published?",
      "Is it consistent with the APPs?",
      "Is a breach log and response plan kept?",
    ],
    examples: {
      level2: "Template privacy policy on the website.",
      level4: "APP-mapped policy, breach log (no eligible breaches), response plan and data inventory reviewed 2026.",
    },
    notApplicable: "N/A when the company handles no personal information.",
  },
  {
    id: "LCO-06",
    anchors: [
      "Evidence shows the business sits in a trust or offshore entity that conflicts with the ASIC record or the investment structure.",
      "The corporate structure is not described.",
      "A single Pty Ltd is stated, not yet checked against ASIC.",
      "The ASIC extract confirms a single Pty Ltd holding the business, with a constitution on file.",
      "The ASIC extract, constitution and cap table agree, the business and its assets sit in the Pty Ltd, and any subsidiaries are wholly owned and disclosed.",
    ],
    checklist: [
      "Does the ASIC extract confirm the company?",
      "Is there a constitution consistent with the record?",
      "Do the business and its assets sit in that company?",
    ],
    examples: {
      level2: "Founder says the company is a Pty Ltd; no extract supplied.",
      level4: "ASIC extract, constitution and cap table agree; domain, IP and contracts held by the Pty Ltd.",
    },
    notApplicable: "Never N/A.",
  },
  {
    id: "LCO-07",
    anchors: [
      "Evidence shows material relationships run on handshake deals or a key contract is terminable on change of control without review.",
      "Material contracts are not identified.",
      "Material contracts are listed, some unsigned.",
      "All material customer and supplier agreements are signed and supplied.",
      "All material agreements are signed, change-of-control and assignment terms are reviewed, and renewals are tracked.",
    ],
    checklist: [
      "Are all material agreements signed?",
      "Are change-of-control terms reviewed?",
      "Are renewals tracked?",
    ],
    examples: {
      level2: "Largest customer on a signed MSA; main supplier on email terms.",
      level4: "Signed MSAs for top 10 customers and key suppliers; change-of-control review memo; renewal calendar.",
    },
    notApplicable: "N/A before the company has any material customer or supplier relationship.",
  },
  {
    id: "LCO-08",
    anchors: [
      "Evidence shows unpaid super, overdue BAS, ATO debt or workers misclassified as contractors.",
      "Compliance is claimed without records.",
      "Lodgements are stated as current, founder-stated.",
      "ATO/STP records confirm super, STP and BAS lodged on time.",
      "ATO/STP records confirm on-time lodgement over 12+ months, no ATO debt, and contractor arrangements reviewed for classification.",
    ],
    checklist: [
      "Are super and STP lodged on time?",
      "Is BAS lodged on time with no ATO debt?",
      "Are contractor classifications reviewed?",
    ],
    examples: {
      level2: "Founder says BAS and super are up to date.",
      level4: "ATO portal extract: no debt, all BAS and STP on time for 18 months; contractor review memo.",
    },
    notApplicable: "N/A when the company has no employees and is not registered for GST.",
  },
  {
    id: "LCO-09",
    anchors: [
      "Evidence shows an undisclosed dispute or proceeding found by a court search.",
      "No disclosure is made about disputes.",
      "The company states there are no disputes, without a search.",
      "A court search and disclosure letter show no pending or threatened proceedings, or disclosed ones are immaterial.",
      "Court searches across relevant jurisdictions and a signed disclosure confirm no material disputes, with a process for handling claims.",
    ],
    checklist: [
      "Has a court search been run?",
      "Is there a signed disclosure of pending or threatened disputes?",
      "Are any disclosed disputes immaterial or resolved?",
    ],
    examples: {
      level2: "\"No disputes\" stated by the founder.",
      level4: "Federal and state court searches clear; signed disclosure letter; one resolved supplier claim documented.",
    },
    notApplicable: "Never N/A.",
  },
  {
    id: "LCO-10",
    anchors: [
      "Evidence shows undisclosed dealings with founder-owned suppliers or customers.",
      "Related-party dealings are not addressed.",
      "Related-party dealings are listed, not approved.",
      "Related-party dealings are disclosed and approved by the board on documented terms.",
      "Disclosed, board-approved dealings on arm's-length terms with independent benchmarking, and a conflicts policy.",
    ],
    checklist: [
      "Are related-party dealings disclosed?",
      "Are they approved by the board?",
      "Are terms shown to be arm's length?",
    ],
    examples: {
      level2: "Founder discloses office rent paid to a family trust; no approval.",
      level4: "Board minute approving the lease at a benchmarked market rate; conflicts policy adopted.",
    },
    notApplicable: "N/A when the company confirms, in a signed disclosure, that there are no related-party dealings.",
  },
  {
    id: "LCO-11",
    anchors: [
      "Evidence shows no insurance despite handling customer data or giving professional advice.",
      "Insurance is claimed without policies.",
      "Some cover is in place (e.g. public liability) but key risks are uncovered.",
      "Current PI, cyber and D&O policies suited to the activity are supplied.",
      "Current policies cover the main risks with adequate limits, reviewed against contract requirements.",
    ],
    checklist: [
      "Are PI, cyber and D&O policies in place where relevant?",
      "Are policies current?",
      "Do limits meet customer contract requirements?",
    ],
    examples: {
      level2: "Public liability only.",
      level4: "Current PI, cyber and D&O certificates; limits match enterprise contract requirements.",
    },
    notApplicable: "N/A when the activity carries none of the risks these policies cover and the company states why.",
  },
  {
    id: "LCO-12",
    anchors: [
      "Evidence shows critical knowledge or access sits with one person and no cover or plan exists.",
      "Key-person risk is not addressed.",
      "Key people are identified; no cover or succession plan.",
      "Key-person cover or a documented succession plan exists for the critical roles.",
      "Cover and succession plans exist, critical knowledge and access are documented and shared, and the plan has been tested.",
    ],
    checklist: [
      "Are key people identified?",
      "Is there key-person cover or a succession plan?",
      "Are critical knowledge and access shared beyond one person?",
    ],
    examples: {
      level2: "CTO identified as key person; no plan.",
      level4: "Key-person policy on the CEO and CTO; runbooks and shared admin access; succession plan tested in a leave period.",
    },
    notApplicable: "Never N/A at the stages it applies.",
  },
];
