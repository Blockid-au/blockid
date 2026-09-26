// rubric@v1 — TRE (lead CRO, CFO judges revenue items): 8 guiding questions +
// overlays TRE-04/05/07/08/09/10/11/13. "Verified" needs T1/T2; T4 caps at 2.
// Stage medians are dated percentile bands (High Alpha 2025, SaaS Capital 2025),
// never fixed cut-offs.

import type { RubricInput } from "./define";

export const TRE_RUBRIC: readonly RubricInput[] = [
  {
    id: "blockid:question:customer_size:34a4e1d98758e703", item: "TRE-02",
    question: "How many active users/customers do you have?",
    anchors: [
      "Evidence shows no active users or customers, or the stated count is contradicted by system records.",
      "A count is stated with no definition of 'active' and no period.",
      "A count with a definition of 'active' and a period is given, founder-stated or from a screenshot.",
      "A connector or export (billing, analytics, CRM) confirms the active count for a stated period.",
      "System records confirm the active count over several periods with a rising trend, and paying versus free users are separated.",
    ],
    checklist: [
      "Is 'active' defined (e.g. used in last 30 days, paid this month)?",
      "Is the count from a system of record?",
      "Are paying and free users separated?",
    ],
    examples: {
      level2: "\"320 active users\" defined as weekly log-in; screenshot only.",
      level4: "Stripe: 212 paying accounts; analytics: 1,450 monthly active users, both rising for 6 months.",
    },
    evidenceTypes: ["stripe", "analytics", "crm", "xero"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A only before launch; pre-launch demand is then scored through TRE-02 proxies (LOIs, waitlist).",
  },
  {
    id: "blockid:question:customer_size:1b6450bbee7361a3", item: "TRE-03",
    question: "What is your monthly growth rate?",
    anchors: [
      "Evidence shows the key usage or customer metric is shrinking.",
      "A growth percentage is stated with no metric, base or period.",
      "A monthly growth rate names its metric, base and period, founder-stated.",
      "System records confirm the monthly growth of the named metric over at least 3 months.",
      "System records confirm growth over 6+ months that sits in or above the dated stage-median band.",
    ],
    checklist: [
      "Is the metric named (users, customers, revenue)?",
      "Is the base and period stated?",
      "Is the growth confirmed by a system of record over 3+ months?",
    ],
    examples: {
      level2: "\"Growing 15% month on month in sign-ups\" for the last quarter, no export.",
      level4: "Analytics connector: active accounts up 11% a month compounded over 8 months.",
    },
    evidenceTypes: ["analytics", "stripe", "crm"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A before launch or with fewer than 3 months of usage data.",
  },
  {
    id: "blockid:question:customer_size:8683d3f20181479e", item: "TRE-02",
    question: "What are your key engagement metrics?",
    anchors: [
      "Evidence shows users sign up but do not use the core feature.",
      "Engagement is described qualitatively ('users love it').",
      "Named engagement metrics (DAU/MAU, sessions, core actions) are stated, founder-stated.",
      "Analytics confirm the named engagement metrics for a stated period.",
      "Analytics confirm engagement on the core value action over several periods, stable or rising, and it links to retention or payment.",
    ],
    checklist: [
      "Is the core value action named?",
      "Is engagement measured in an analytics tool?",
      "Does engagement link to retention or payment?",
    ],
    examples: {
      level2: "\"DAU/MAU is about 35%\" per the founder.",
      level4: "Mixpanel: 41% DAU/MAU on 'submit compliance pack' for 6 months; engaged accounts convert to paid at 3×.",
    },
    evidenceTypes: ["analytics", "crm"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A before launch.",
  },
  {
    id: "blockid:question:customer_size:0772ed94647c795a", item: "TRE-12",
    question: "What is your user retention rate?",
    anchors: [
      "Evidence shows most users or customers leave within the first months.",
      "A retention figure is stated with no definition or period.",
      "Retention is defined (logo or user, period) and stated, founder-stated.",
      "Billing or analytics cohorts confirm the retention figure for a stated period.",
      "Cohorts from a system of record over 12+ months show retention in or above the dated benchmark band for the model.",
    ],
    checklist: [
      "Is retention defined (users vs customers, period)?",
      "Is it computed from cohorts in a system of record?",
      "Does it cover 12+ months?",
    ],
    examples: {
      level2: "\"90% of customers stay month to month.\"",
      level4: "Stripe cohorts over 14 months: 93% logo retention annualised, consistent across cohorts.",
    },
    evidenceTypes: ["stripe", "analytics", "xero"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A with fewer than 3 months of customer or user history.",
  },
  {
    id: "blockid:question:revenue:e95923a31d3bcb97", item: "TRE-01",
    question: "What is your current MRR/ARR?",
    anchors: [
      "Evidence shows the stated MRR/ARR is contradicted by the billing or accounting system.",
      "MRR/ARR is stated with no period, currency or definition (one-off revenue × 12 counts here).",
      "MRR/ARR is stated with period and currency from a spreadsheet or deck (company- or founder-stated).",
      "A billing or accounting connector (Stripe, Xero) or bank statement confirms recurring revenue for the period.",
      "Connector data confirm recurring revenue for 6+ months, reconciled to the bank, with one-off and related-party revenue excluded.",
    ],
    checklist: [
      "Is the figure recurring (not one-off × 12)?",
      "Is it confirmed by Stripe/Xero or bank statements?",
      "Are related-party and one-off amounts excluded?",
    ],
    examples: {
      level2: "Deck: \"MRR A$18k (June 2026)\"; spreadsheet only.",
      level4: "Stripe connector: MRR A$18.4k in June 2026, reconciled to bank deposits, 7 months of history.",
    },
    evidenceTypes: ["stripe", "xero", "bank"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A while pre-revenue (at PS, TRE-02 demand proxies are scored instead).",
  },
  {
    id: "blockid:question:revenue:dd9adda5c203301e", item: "TRE-03",
    question: "What is your revenue growth rate?",
    anchors: [
      "Evidence shows revenue is declining over the last periods.",
      "A growth rate is stated with no base, period or source.",
      "A growth rate with base and period is stated from a spreadsheet, not reconciled.",
      "Connector or accounting data confirm the growth rate over at least 3 months.",
      "Connector data confirm growth over 12 months in or above the dated stage-median band, without one-off spikes.",
    ],
    checklist: [
      "Are base and period stated?",
      "Is growth confirmed by a billing or accounting system?",
      "Is the growth free of one-off spikes?",
    ],
    examples: {
      level2: "\"Revenue tripled year on year\" from the model.",
      level4: "Xero: revenue A$96k → A$290k over 12 months, monthly series with no one-off spike.",
    },
    evidenceTypes: ["stripe", "xero", "bank"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A while pre-revenue or with fewer than 3 months of revenue.",
  },
  {
    id: "blockid:question:revenue:0ad91b47eaa98a71", item: "TRE-06",
    question: "What are your unit economics (LTV, CAC, margins)?",
    anchors: [
      "Evidence shows each customer loses money after delivery and acquisition costs.",
      "LTV, CAC or margin figures are stated without inputs.",
      "LTV, CAC and gross margin are calculated with stated inputs in a model; churn is assumed.",
      "Gross margin comes from the P&L including services and delivery costs, and CAC and churn from ledger and billing data.",
      "System-of-record unit economics over several periods sit in or above the dated benchmark band, with services and AI delivery costs included.",
    ],
    checklist: [
      "Does gross margin include services and delivery costs?",
      "Is churn observed rather than assumed?",
      "Are inputs from the ledger and billing system?",
    ],
    examples: {
      level2: "Model: LTV A$9k, CAC A$1.5k, GM 80% with an assumed 2% churn.",
      level4: "Xero P&L GM 72% incl. onboarding staff; Stripe churn 1.6%/month; CAC from ledger ÷ CRM, 4 quarters.",
    },
    evidenceTypes: ["xero", "stripe", "crm", "financial_model"],
    level4Tiers: ["T1", "T2"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A while pre-revenue.",
  },
  {
    id: "blockid:question:revenue:e26ca87f3feff2a3", item: "TRE-12",
    question: "What is your path to profitability?",
    anchors: [
      "Evidence shows costs grow faster than revenue with no plan to reverse it.",
      "Profitability is promised with no date, drivers or numbers.",
      "A breakeven date is stated with drivers in a model not tied to actuals.",
      "A model tied to actual revenue and costs shows breakeven with named drivers and sensitivities.",
      "Actuals show margins improving on the modelled path over several periods, and breakeven is reachable within current funding.",
    ],
    checklist: [
      "Is there a dated breakeven point with drivers?",
      "Is the model tied to actual revenue and costs?",
      "Do actuals track the modelled path?",
    ],
    examples: {
      level2: "Model shows breakeven in Q3 2027 at A$1.2M ARR; assumptions not tied to actuals.",
      level4: "Xero actuals match the model within 10% for 3 quarters; breakeven in 14 months is within runway.",
    },
    evidenceTypes: ["xero", "financial_model", "bank"],
    level4Tiers: ["T1", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A: a pre-revenue company answers with the milestones and funding needed to reach revenue.",
  },
  {
    id: "TRE-04",
    anchors: [
      "Evidence shows net revenue retention well below the stage-median band (the cohort base shrinks).",
      "NRR is stated without cohorts or definition.",
      "NRR is calculated from a spreadsheet of accounts, not a billing system.",
      "Billing cohorts confirm NRR in the dated median band.",
      "Billing cohorts over 12+ months confirm NRR in the dated top-quartile band, driven by expansion across many accounts.",
    ],
    checklist: [
      "Is NRR computed from billing cohorts?",
      "Does it include downgrades and churn?",
      "Is the expansion spread across many accounts?",
    ],
    examples: {
      level2: "Spreadsheet NRR of 108% from a list of top accounts.",
      level4: "Stripe cohorts: 124% NRR over 18 months, expansion across 60% of accounts.",
    },
    notApplicable: "N/A before Series A or with fewer than 12 months of billing cohorts.",
  },
  {
    id: "TRE-05",
    anchors: [
      "Evidence shows gross revenue retention well below the dated 'table stakes' band.",
      "GRR is not disclosed or confused with NRR.",
      "GRR is calculated outside the billing system.",
      "Billing cohorts confirm GRR in the dated median band.",
      "Billing cohorts over 12+ months confirm GRR in the dated top band, stable across segments.",
    ],
    checklist: [
      "Is GRR separated from expansion?",
      "Is it computed from billing cohorts?",
      "Is it stable across segments?",
    ],
    examples: {
      level2: "Founder states 92% GRR from a spreadsheet.",
      level4: "Stripe: 94% GRR over 18 months, SMB and mid-market within 2 percentage points of each other.",
    },
    notApplicable: "N/A before Series A or with fewer than 12 months of billing cohorts.",
  },
  {
    id: "TRE-07",
    anchors: [
      "Evidence shows CAC payback far beyond the dated stage band.",
      "Payback is not calculated.",
      "Payback is modelled from assumed CAC and margin.",
      "Payback is calculated from ledger S&M spend, CRM new customers and actual gross margin.",
      "Ledger-based payback over several quarters is in or better than the dated median band and holding as spend scales.",
    ],
    checklist: [
      "Is CAC from ledger spend and CRM counts?",
      "Is gross margin (not revenue) used?",
      "Does payback hold as spend increases?",
    ],
    examples: {
      level2: "Model shows 10-month payback using assumed CAC.",
      level4: "Ledger + CRM: 8-month payback for 4 quarters while S&M spend doubled.",
    },
    notApplicable: "N/A before Series A or without paid acquisition.",
  },
  {
    id: "TRE-08",
    anchors: [
      "Evidence shows lifetime value below acquisition cost using observed churn.",
      "LTV:CAC is not calculated.",
      "LTV:CAC is calculated with assumed churn.",
      "LTV:CAC uses observed churn from billing and CAC from the ledger.",
      "Observed LTV:CAC over several quarters sits comfortably above the dated benchmark band, including margin rather than revenue.",
    ],
    checklist: [
      "Is churn observed from billing data?",
      "Is LTV margin-based?",
      "Is CAC fully loaded from the ledger?",
    ],
    examples: {
      level2: "LTV:CAC of 5:1 with an assumed 1% monthly churn.",
      level4: "Margin-based LTV:CAC of 4.2:1 from 18 months of observed churn and ledger CAC.",
    },
    notApplicable: "N/A before Series A or with fewer than 12 months of churn history.",
  },
  {
    id: "TRE-09",
    anchors: [
      "Evidence shows burn far exceeds net new ARR (burn multiple in the weakest band).",
      "Burn and net new ARR are not reported together.",
      "Burn multiple is computed from management figures.",
      "Bank burn and connector ARR give a burn multiple for the period.",
      "Bank and connector data give a burn multiple in the strongest dated band over several quarters.",
    ],
    checklist: [
      "Is net burn taken from the bank?",
      "Is net new ARR from the billing connector?",
      "Is it tracked over several quarters?",
    ],
    examples: {
      level2: "Founder states burn multiple of about 2.",
      level4: "Bank + Stripe: burn multiple 1.1 averaged over 4 quarters.",
    },
    notApplicable: "N/A while pre-revenue; a cash-flow-positive company reaches level 4 only when bank data confirm it.",
  },
  {
    id: "TRE-10",
    anchors: [
      "Evidence shows sales and marketing spend produces little or no new recurring revenue (weakest dated band).",
      "Magic number is not calculated.",
      "Magic number is computed from management figures.",
      "Ledger S&M spend and billing new ARR give the magic number for recent quarters.",
      "Ledger and billing data show the magic number in the strongest dated band over several quarters.",
    ],
    checklist: [
      "Is S&M spend from the ledger?",
      "Is new recurring revenue from billing?",
      "Is it tracked over several quarters?",
    ],
    examples: {
      level2: "Management deck states magic number 0.8.",
      level4: "Xero + Stripe: magic number 0.9–1.1 over 4 quarters.",
    },
    notApplicable: "N/A before Series A or without material S&M spend.",
  },
  {
    id: "TRE-11",
    anchors: [
      "Evidence shows growth plus margin far below the Rule of 40 with no plan.",
      "Rule of 40 is not reported.",
      "Rule of 40 is computed from management accounts.",
      "Reviewed accounts show growth plus margin near 40.",
      "Reviewed accounts show growth plus margin at or above 40 over several years.",
    ],
    checklist: [
      "Are growth and margin from reviewed accounts?",
      "Is the margin definition stated (EBITDA or FCF)?",
      "Is it sustained over more than one year?",
    ],
    examples: {
      level2: "Management figures: 35% growth + 2% EBITDA margin.",
      level4: "Audited accounts: 45% growth and 5% FCF margin in each of the last 2 years.",
    },
    notApplicable: "N/A before Series B.",
  },
  {
    id: "TRE-13",
    anchors: [
      "Evidence shows the claimed backlog is verbal or unsigned.",
      "Backlog is stated without contracts.",
      "A list of pending contracts with values is shared, unsigned.",
      "Signed contracts confirm contracted revenue not yet live, with start dates.",
      "Signed contracts confirm material backlog with start dates, and past backlog converted to live revenue on schedule.",
    ],
    checklist: [
      "Are backlog contracts signed?",
      "Do they have values and start dates?",
      "Did past backlog convert on time?",
    ],
    examples: {
      level2: "Pipeline sheet lists A$400k of 'committed' deals.",
      level4: "Signed MSAs worth A$620k starting within 6 months; last year's backlog went live on schedule.",
    },
    notApplicable: "N/A when the model has no contracted-ahead revenue (self-serve monthly).",
  },
];
