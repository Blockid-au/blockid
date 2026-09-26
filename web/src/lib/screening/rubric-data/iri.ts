// rubric@v1 — IRI (lead CLO; CFO sits on the panel for IRI-02/03/08):
// 8 guiding questions + overlays IRI-03/05/06/07/08/09. Data-room
// expectations rise with stage (AirTree: seed qualitative, growth quantitative).

import type { RubricInput } from "./define";

export const IRI_RUBRIC: readonly RubricInput[] = [
  {
    id: "blockid:question:documents:1f6fc9c753d7c096", item: "IRI-04",
    question: "Do you have a pitch deck?",
    anchors: [
      "Evidence shows the deck's key claims conflict with the company's own records.",
      "A deck is mentioned but not supplied, or it has no ask or metrics.",
      "A deck covers problem, solution, market, team and ask, with metrics unsourced.",
      "The deck states the raise, instrument, use of funds and milestones, and its metrics cite a source.",
      "A current deck states a clear ask tied to milestones, and every metric reconciles to a system of record or signed document.",
    ],
    checklist: [
      "Does the deck state the raise, instrument and use of funds?",
      "Are milestones tied to the raise?",
      "Do the deck metrics cite a source?",
    ],
    examples: {
      level2: "12-slide deck with problem, market and team; ask of A$1.5M without milestones.",
      level4: "Current deck: A$1.5M SAFE, use of funds by quarter, 3 milestones; MRR slide matches Stripe.",
    },
    evidenceTypes: ["deck", "stripe", "xero"],
    level4Tiers: ["T1", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A only when the company is not raising and has no investor audience.",
  },
  {
    id: "blockid:question:documents:62c76cf7c9fce351", item: "IRI-02",
    question: "Do you have a financial model or projections?",
    anchors: [
      "Evidence shows projections contradict actuals without explanation (hockey stick with no drivers).",
      "Projections are a single revenue line with no drivers.",
      "A model with revenue and cost drivers exists, assumptions unsourced.",
      "A driver-based or three-statement model has sourced assumptions and starts from actuals.",
      "A linked three-statement, driver-based model starts from reconciled actuals, sources its assumptions and includes scenarios and cash runway.",
    ],
    checklist: [
      "Is the model driver-based (customers, price, churn, hires)?",
      "Does it start from actuals?",
      "Are assumptions sourced and scenarios included?",
    ],
    examples: {
      level2: "Spreadsheet with revenue and headcount drivers; assumptions are the founder's estimates.",
      level4: "Three-statement model seeded from Xero actuals; churn and ACV from Stripe; bear/base/bull scenarios.",
    },
    evidenceTypes: ["financial_model", "xero", "stripe"],
    level4Tiers: ["T1", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A: a pre-revenue model is judged on its cost drivers, milestones and runway.",
  },
  {
    id: "blockid:question:documents:0fd3c89c6e1d2315", item: "IRI-04",
    question: "Do you have a business plan or one-pager?",
    anchors: [
      "Evidence shows the plan contradicts the deck or the model on the ask or milestones.",
      "No written plan or one-pager exists.",
      "A one-pager states what the company does, the market and the ask.",
      "A written plan or one-pager states the ask, use of funds and milestones consistently with the deck and model.",
      "A current plan is consistent with the deck and model, names risks with mitigations, and is dated within the freshness window.",
    ],
    checklist: [
      "Is there a written plan or one-pager?",
      "Is it consistent with the deck and model?",
      "Does it name risks and mitigations?",
    ],
    examples: {
      level2: "One-pager with product, market size and ask.",
      level4: "Dated plan matching deck and model, with a risks-and-mitigations section.",
    },
    evidenceTypes: ["document", "deck", "financial_model"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A when an investor memo or information memorandum covering the same content is scored instead.",
  },
  {
    id: "blockid:question:documents:b02bae8b8d10755c", item: "IRI-01",
    question: "Are your key legal documents prepared?",
    anchors: [
      "Evidence shows a key document is missing where it is legally required (constitution, IP assignment) or documents conflict.",
      "Legal documents are claimed but none is supplied.",
      "Some documents are supplied (constitution, founder agreement) but gaps remain for the stage.",
      "The stage's key documents (constitution, SHA, IP assignments, key contracts) are signed and supplied.",
      "Every key document for the stage is signed, current, consistent with the ASIC record and cap table, and indexed in the data room.",
    ],
    checklist: [
      "Are the constitution and shareholders agreement signed?",
      "Are IP assignments signed by founders and contractors?",
      "Are documents consistent with ASIC and the cap table?",
    ],
    examples: {
      level2: "Constitution and a draft SHA supplied; IP assignments missing.",
      level4: "Signed constitution, SHA, IP deeds and customer MSAs, all consistent with the ASIC extract.",
    },
    evidenceTypes: ["document", "contract", "asic", "data_room"],
    level4Tiers: ["T1", "T2"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A.",
  },
  {
    id: "blockid:question:dataroom:90445a71fe794e79", item: "IRI-01",
    question: "Do you have a structured data room for investors?",
    anchors: [
      "Evidence shows the data room exposes documents inconsistent with the deck or with no access control.",
      "No data room exists; documents are sent ad hoc.",
      "A shared folder exists with some documents but no structure or index.",
      "A data room with an index and access control holds the stage's expected items.",
      "A structured, access-controlled data room holds every expected item for the stage, with an index, versioning and an access log.",
    ],
    checklist: [
      "Is there a single data room with access control?",
      "Is there an index?",
      "Does it hold the items expected at this stage?",
    ],
    examples: {
      level2: "Google Drive folder with deck, model and constitution.",
      level4: "BlockID data room with index, versioned documents, access log and all seed-stage items.",
    },
    evidenceTypes: ["data_room", "document"],
    level4Tiers: ["T2", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A at PS when the company is not yet raising.",
  },
  {
    id: "blockid:question:dataroom:375b42f9f70a36ff", item: "IRI-01",
    question: "What documents are included?",
    anchors: [
      "Evidence shows included documents are outdated or contradict each other.",
      "Contents are described without a list.",
      "A list of contents is given covering some of the stage's expected items.",
      "The list covers the stage's expected items (PS: deck, cap table, constitution, IP deeds; S: + model, key contracts; A+: + accounts, board minutes, KPI packs).",
      "Every expected item is present and current, plus supporting evidence (connector exports, references, policies) mapped to diligence questions.",
    ],
    checklist: [
      "Is there a list of contents?",
      "Does it cover the items expected at this stage?",
      "Are the items current?",
    ],
    examples: {
      level2: "Deck, model and constitution; cap table and IP deeds missing.",
      level4: "All seed items plus Stripe export, 3 reference contacts and privacy policy, indexed to diligence questions.",
    },
    evidenceTypes: ["data_room", "document"],
    level4Tiers: ["T2", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A when no data room exists yet (the previous question carries the gap).",
  },
  {
    id: "blockid:question:dataroom:d954c78126c19807", item: "IRI-01",
    question: "Is it organized by category (legal, financial, product)?",
    anchors: [
      "Evidence shows files are misfiled so that key documents cannot be found.",
      "No organisation; a flat list of files.",
      "Some top-level folders exist but categories are mixed.",
      "Documents are organised by standard categories (corporate, legal, financial, product, team, customers).",
      "Standard categories with an index, consistent naming and dates, so a reviewer can find any expected item quickly.",
    ],
    checklist: [
      "Are there standard categories?",
      "Is naming consistent and dated?",
      "Is there an index a reviewer can follow?",
    ],
    examples: {
      level2: "Folders 'Legal' and 'Misc' with most files in 'Misc'.",
      level4: "Six standard categories, dated file names, and an index linking each item.",
    },
    evidenceTypes: ["data_room"],
    level4Tiers: ["T2", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A when no data room exists yet.",
  },
  {
    id: "blockid:question:dataroom:38e27593719c916a", item: "IRI-01",
    question: "When was it last updated?",
    anchors: [
      "Evidence shows the data room is stale beyond the freshness window while the company claims it is current.",
      "No update date is known.",
      "A last-updated date is stated, not shown by the system.",
      "System timestamps show updates within the freshness window.",
      "System timestamps show regular updates within the freshness window, with financial items refreshed after each month or quarter close.",
    ],
    checklist: [
      "Is there a system timestamp for the last update?",
      "Is it within the freshness window?",
      "Are financial items refreshed after each close?",
    ],
    examples: {
      level2: "Founder says the room was updated last month.",
      level4: "Access log shows weekly updates; financials refreshed after each month-end close.",
    },
    evidenceTypes: ["data_room"],
    level4Tiers: ["T2", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A when no data room exists yet.",
  },
  {
    id: "IRI-03",
    anchors: [
      "Evidence shows a deck metric differs materially from the connector, ledger or bank.",
      "Deck metrics cannot be checked because no system data is shared.",
      "Some deck metrics are checked against exports; differences are unexplained.",
      "The deck's key metrics reconcile to connectors, ledger and bank within a small, explained difference.",
      "Every deck metric reconciles to systems of record for the stated period, and the reconciliation is documented.",
    ],
    checklist: [
      "Is system-of-record data available for the deck's metrics?",
      "Do they reconcile within a small explained difference?",
      "Is the reconciliation documented?",
    ],
    examples: {
      level2: "MRR checked against a Stripe screenshot; customer count not checked.",
      level4: "MRR, customers and cash in the deck all match Stripe, Xero and the bank feed for June 2026.",
    },
    notApplicable: "N/A while pre-revenue with no metrics to reconcile.",
  },
  {
    id: "IRI-05",
    anchors: [
      "Evidence shows investors have not received an update for several quarters.",
      "Reporting is claimed without examples.",
      "Occasional updates are sent without consistent KPIs.",
      "Monthly or quarterly KPI packs are sent on a regular cadence.",
      "Regular KPI packs with consistent metrics, variance to plan and asks, reconciled to systems of record.",
    ],
    checklist: [
      "Are updates sent on a regular cadence?",
      "Do they use consistent KPIs?",
      "Do they report variance to plan?",
    ],
    examples: {
      level2: "Two investor emails last year with different metrics.",
      level4: "Monthly KPI pack for 12 months with the same metrics and variance to budget.",
    },
    notApplicable: "N/A before Series A.",
  },
  {
    id: "IRI-06",
    anchors: [
      "The company refuses references or a reference contradicts its claims.",
      "References are promised but none named.",
      "Named references are listed, not yet contacted.",
      "Customer and prior-investor references were contacted and confirmed their relationship.",
      "Several customer and investor references confirm the key claims, including a churned or critical customer.",
    ],
    checklist: [
      "Are customer references named?",
      "Are prior investors reachable as references?",
      "Did references confirm the key claims?",
    ],
    examples: {
      level2: "List of 3 customer contacts, not yet called.",
      level4: "4 customer and 2 investor references confirmed usage and contract values, including one churned customer.",
    },
    notApplicable: "N/A at PS or when there are no customers or prior investors yet.",
  },
  {
    id: "IRI-07",
    anchors: [
      "Evidence shows ESIC status is claimed while the company fails an early-stage test (e.g. income or expense limits).",
      "ESIC status is claimed with no documentation.",
      "An internal self-assessment of the ESIC tests is supplied.",
      "An adviser letter documents the early-stage tests and the 100-point or principles test.",
      "An adviser letter covers every test for the relevant income year, and investor ESIC forms were issued correctly.",
    ],
    checklist: [
      "Is there an adviser letter?",
      "Does it cover the early-stage tests and the 100-point or principles test?",
      "Is it for the relevant income year?",
    ],
    examples: {
      level2: "Founder's own checklist against the ATO ESIC tests.",
      level4: "Accountant's letter covering all tests for FY2026; investor notices issued.",
    },
    notApplicable: "N/A when the company does not claim or plan to offer ESIC status.",
  },
  {
    id: "IRI-08",
    anchors: [
      "Evidence shows R&D claims were lodged without AusIndustry registration or after the deadline.",
      "R&D Tax Incentive is mentioned with no registration or claim detail.",
      "Eligible activities and costs are identified, registration pending.",
      "AusIndustry registration within the deadline is confirmed for the income year.",
      "Registration is confirmed, activities and costs are documented contemporaneously, and past refunds were received.",
    ],
    checklist: [
      "Is the activity registered with AusIndustry for the income year?",
      "Was registration within the deadline?",
      "Are activities and costs documented contemporaneously?",
    ],
    examples: {
      level2: "Adviser has identified A$400k of eligible spend; registration not lodged.",
      level4: "AusIndustry registration number for FY2025, lodged in time; refund received; timesheets on file.",
    },
    notApplicable: "N/A when the company does no eligible R&D or does not claim the incentive.",
  },
  {
    id: "IRI-09",
    anchors: [
      "Evidence shows a structural block to any transaction (e.g. unassignable key contract, disputed ownership).",
      "Exit is described as 'IPO or acquisition' with no buyer or route.",
      "Plausible routes and buyer types are named without comparables.",
      "Named buyers or routes are supported by dated comparable transactions, and constraints are listed.",
      "Named buyers with dated comparables, known constraints resolved or planned, and existing relationships with likely acquirers.",
    ],
    checklist: [
      "Are specific buyers or routes named?",
      "Are dated comparable transactions cited?",
      "Are transaction constraints (consents, change of control) identified?",
    ],
    examples: {
      level2: "\"Likely acquirers: large construction-software vendors.\"",
      level4: "Three named acquirers with two dated AU comparables; change-of-control consents reviewed; partnership with one acquirer.",
    },
    notApplicable: "N/A before Series A.",
  },
];
