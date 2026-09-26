// rubric@v1 — SVM (lead CEO): 3 guiding questions + overlays
// SVM-01/02/04/05/07/08. A moat must be named by type and evidenced.

import type { RubricInput } from "./define";

export const SVM_RUBRIC: readonly RubricInput[] = [
  {
    id: "blockid:question:roadmap:86a493aa575cb75b", item: "SVM-06",
    question: "What are your next 3-6 month milestones?",
    anchors: [
      "Evidence shows the last period's milestones were missed without explanation and new ones repeat them.",
      "Milestones are vague ('grow', 'launch') with no dates or measures.",
      "Specific, dated milestones with measures are listed.",
      "Dated, measurable milestones are linked to the funding and the model, and last period's milestones were mostly met.",
      "Dated, measurable milestones are funded, sequenced to de-risk the next round, and a record shows past milestones met on time.",
    ],
    checklist: [
      "Is each milestone dated and measurable?",
      "Is each milestone funded in the model?",
      "Were last period's milestones met?",
    ],
    examples: {
      level2: "\"Launch payments by November; 50 paying customers by December.\"",
      level4: "Same milestones funded in the model; last quarter's 3 milestones all met on schedule per changelog and Stripe.",
    },
    evidenceTypes: ["document", "financial_model", "git", "stripe"],
    level4Tiers: ["T1", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A.",
  },
  {
    id: "blockid:question:roadmap:ccb348b8ee88d1ad", item: "SVM-03",
    question: "What is your 12-month product vision?",
    anchors: [
      "Evidence shows the vision contradicts what customers are buying or the team can build.",
      "The vision is a slogan with no product scope.",
      "A 12-month product scope is described with target customers.",
      "The vision is sequenced into releases tied to customer evidence and aims beyond a local or lifestyle ceiling.",
      "A sequenced 12-month vision is grounded in customer evidence, funded, and positions the company for a world-best outcome in its category.",
    ],
    checklist: [
      "Is there a concrete 12-month product scope?",
      "Is it tied to customer evidence?",
      "Does it aim beyond a local or lifestyle ceiling?",
    ],
    examples: {
      level2: "Plan to add scheduling and payments to the compliance app next year.",
      level4: "Release plan tied to 40 customer requests, funded in the model, targeting ANZ and UK mid-market builders.",
    },
    evidenceTypes: ["document", "deck", "financial_model"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A.",
  },
  {
    id: "blockid:question:roadmap:af97926d94d1d6ef", item: "SVM-06",
    question: "What key dependencies or blockers exist?",
    anchors: [
      "Evidence shows a critical dependency (platform, regulator, single supplier) the company does not acknowledge.",
      "The company states there are no dependencies or blockers.",
      "Dependencies and blockers are named, without mitigation.",
      "Named dependencies each have a mitigation and an owner.",
      "Named dependencies have mitigations with owners and dates, and the riskiest has already been de-risked (contract, alternative, approval).",
    ],
    checklist: [
      "Are dependencies and blockers named?",
      "Does each have a mitigation and owner?",
      "Has the riskiest been de-risked?",
    ],
    examples: {
      level2: "\"We depend on the Xero API and on hiring a senior engineer.\"",
      level4: "Xero partner agreement signed; fallback MYOB integration built; senior engineer offer accepted.",
    },
    evidenceTypes: ["document", "contract", "founder_input"],
    level4Tiers: ["T2", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A.",
  },
  {
    id: "SVM-01",
    anchors: [
      "Evidence shows no moat: customers switch easily and rivals match the product quickly.",
      "The moat is 'execution' or 'first mover' with no mechanism.",
      "A specific moat type (network effects, data, switching costs, scale) is named with a mechanism.",
      "Usage data support the named moat (e.g. value per user rising with users, low churn from switching costs).",
      "Usage data over time show the moat strengthening, and competitive losses are rare and explained.",
    ],
    checklist: [
      "Is a specific moat type named?",
      "Do usage data support it?",
      "Is it strengthening over time?",
    ],
    examples: {
      level2: "Company names switching costs from customers' stored compliance history.",
      level4: "Churn among accounts with 12+ months of history is a third of newer accounts, over 18 months.",
    },
    notApplicable: "Never N/A at the stages it applies.",
  },
  {
    id: "SVM-02",
    anchors: [
      "Evidence shows the thesis is me-too on a crowded trend.",
      "No distinct belief is stated.",
      "A contrarian belief is stated with reasoning.",
      "The belief is supported by evidence others have missed (data, customer behaviour, regulation).",
      "The belief is supported by evidence and early results show it is being proven right while consensus has not caught up.",
    ],
    checklist: [
      "Is a specific non-consensus belief stated?",
      "Is it supported by evidence?",
      "Do early results support it?",
    ],
    examples: {
      level2: "\"Builders will pay per project, not per seat, despite the industry norm.\"",
      level4: "Memo with data from 30 builders; per-project pricing converting 2× the seat-based rival.",
    },
    notApplicable: "Never N/A at the stages it applies.",
  },
  {
    id: "SVM-04",
    anchors: [
      "Evidence shows the plan requires a growth rate far above anything achieved so far (hockey stick).",
      "Scale is asserted with no trajectory.",
      "A growth plan exists, not compared with history.",
      "The plan extends the achieved trajectory with named drivers, checked against dated growth benchmarks.",
      "System-of-record history supports the plan's trajectory and it sits in or above dated stage benchmarks.",
    ],
    checklist: [
      "Is the plan compared with achieved growth?",
      "Are drivers named?",
      "Is history from a system of record?",
    ],
    examples: {
      level2: "Model projects 3× annual growth; history not shown.",
      level4: "Stripe history of 2.8× year on year for 2 years supports a plan of 2.5×.",
    },
    notApplicable: "N/A with fewer than 6 months of operating history.",
  },
  {
    id: "SVM-05",
    anchors: [
      "Evidence shows revenue per FTE falling and margins shrinking as the company grows (services-like scaling).",
      "Scalability is asserted with no figures.",
      "Revenue per FTE and margin are computed from management figures.",
      "Payroll and ledger data show revenue per FTE and gross margin over several periods.",
      "Payroll and ledger data show revenue per FTE and gross margin improving as the company grows.",
    ],
    checklist: [
      "Is revenue per FTE computed from payroll and ledger?",
      "Is gross margin tracked over time?",
      "Do both improve with growth?",
    ],
    examples: {
      level2: "Management deck: A$140k ARR per FTE.",
      level4: "Xero + STP: ARR per FTE A$110k → A$165k and GM 68% → 74% over 2 years.",
    },
    notApplicable: "N/A before Series A.",
  },
  {
    id: "SVM-07",
    anchors: [
      "Evidence shows no logical buyer and no route to liquidity.",
      "Exit is 'IPO or acquisition' with no names.",
      "Likely acquirer types are named.",
      "Named acquirers are supported by dated comparable transactions and multiples.",
      "Named acquirers with dated comparables, existing strategic relationships, and a clear rationale for why they would buy.",
    ],
    checklist: [
      "Are acquirers named?",
      "Are dated comparables cited?",
      "Is there a strategic relationship with a likely acquirer?",
    ],
    examples: {
      level2: "\"Construction-software platforms would buy us.\"",
      level4: "Three named acquirers, two dated 2024–2025 comparables, integration partnership with one.",
    },
    notApplicable: "N/A before Series A.",
  },
  {
    id: "SVM-08",
    anchors: [
      "Evidence shows customers leaving for general-purpose AI tools that replicate the product.",
      "AI substitution risk is not addressed.",
      "The company explains why AI substitutes do not replace it, without data.",
      "Cohort retention holds since capable AI substitutes appeared, shown by billing or analytics data.",
      "Cohort data show retention holding or improving despite AI substitutes, and the product itself uses AI to deepen its advantage.",
    ],
    checklist: [
      "Is AI substitution risk addressed?",
      "Do cohorts hold since substitutes appeared?",
      "Does the product use AI to deepen its advantage?",
    ],
    examples: {
      level2: "Founder argues workflow integration makes generic chatbots unsuitable.",
      level4: "Stripe cohorts retention unchanged over 18 months; AI features raised expansion revenue.",
    },
    notApplicable: "N/A when no credible AI substitute exists for the product's core job.",
  },
];
