// rubric@v1 — PTD (lead CTO): 8 guiding questions + overlays PTD-02/05/06/07.
// Every technical claim needs an artefact (git, analytics, status page, report).

import type { RubricInput } from "./define";

export const PTD_RUBRIC: readonly RubricInput[] = [
  {
    id: "blockid:question:code_git:3c4c4f2386f7a250", item: "PTD-03",
    question: "Do you have a public or private code repository?",
    anchors: [
      "Evidence shows the code sits in an agency's or contractor's account the company does not control.",
      "A repository is claimed but no owner, host or access is shown.",
      "The host and organisation name are stated; ownership is not yet verified.",
      "A connected repository shows the company's organisation owns it and staff hold admin rights.",
      "The company-owned repository has continuous history since the product began, protected main branch and access limited to current staff.",
    ],
    checklist: [
      "Is the repository in an organisation the company controls?",
      "Do current staff (not an agency) hold admin rights?",
      "Is there continuous commit history?",
    ],
    examples: {
      level2: "\"Code is on GitHub under our org\"; no connector yet.",
      level4: "Git connector: company org owns the repo since 2023, branch protection on, 4 staff admins, no agency accounts.",
    },
    evidenceTypes: ["git", "contract"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A for a business with no proprietary software (e.g. a services or hardware business built on third-party tools).",
  },
  {
    id: "blockid:question:code_git:4878e79113de624a", item: "PTD-04",
    question: "What is your tech stack?",
    anchors: [
      "Evidence shows the stack has an unsupported or end-of-life core component with no migration plan.",
      "The stack is listed as buzzwords with no architecture.",
      "Components and hosting are named with a simple architecture description.",
      "The architecture is documented and matches the repository and hosting records, with known limits stated.",
      "Documented architecture matches repo and hosting, has no single point of failure for core paths, and scaling limits are tested.",
    ],
    checklist: [
      "Are the core components and hosting named?",
      "Does the repository or hosting record match the description?",
      "Are single points of failure identified and addressed?",
    ],
    examples: {
      level2: "Next.js, Postgres on Supabase, hosted on AWS Sydney; one diagram.",
      level4: "Architecture doc matches repo; multi-AZ database, load test at 10× current traffic on record.",
    },
    evidenceTypes: ["git", "document", "cloud_billing"],
    level4Tiers: ["T1", "T2"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A for a business with no proprietary software.",
  },
  {
    id: "blockid:question:code_git:d912f0f6b15de7d9", item: "PTD-04",
    question: "Do you have automated tests?",
    anchors: [
      "Evidence shows no automated tests and production incidents caused by untested changes.",
      "Tests are claimed with no suite, runner or results.",
      "A test suite exists in the repository but does not run automatically.",
      "Tests run automatically on every change and block merges when they fail.",
      "Automated tests gate every merge, cover core revenue paths, and the incident rate is low and falling over recent periods.",
    ],
    checklist: [
      "Is there a test suite in the repository?",
      "Do tests run automatically on every change?",
      "Do failing tests block a merge or release?",
    ],
    examples: {
      level2: "Repo has 40 unit tests run by developers locally.",
      level4: "CI runs 1,200 tests on every PR; merges blocked on failure; 2 incidents in 6 months.",
    },
    evidenceTypes: ["git", "document"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A for a business with no proprietary software.",
  },
  {
    id: "blockid:question:code_git:e761a57a9ddf8ce5", item: "PTD-03",
    question: "How many contributors are active?",
    anchors: [
      "Evidence shows no staff commits in the last 90 days, or all commits come from an outside agency.",
      "A contributor count is stated with no repository data.",
      "Contributors are named with roles, founder-stated.",
      "Repository data shows active contributors in the last 90 days and most commits by staff.",
      "Repository data shows steady staff contribution over 6+ months, more than one person able to ship core code, and no key-person concentration.",
    ],
    checklist: [
      "Were there staff commits in the last 90 days?",
      "Do staff (not contractors) author most commits?",
      "Can more than one person ship core code?",
    ],
    examples: {
      level2: "\"3 developers work on the code\", no repo access.",
      level4: "Git connector: 5 staff committers over 9 months, top contributor 35% of commits.",
    },
    evidenceTypes: ["git", "payroll"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A for a business with no proprietary software.",
  },
  {
    id: "blockid:question:website:285c049d72d782d5", item: "PTD-01",
    question: "What is your website or product URL?",
    anchors: [
      "Evidence shows the URL is dead, parked or belongs to another business.",
      "A URL is given but only shows a placeholder or waitlist with no product description.",
      "A live site describes the product and offers a way to sign up or contact.",
      "A live product is reachable (sign-up, demo account or app store listing) and matches the pitch.",
      "The live product is reachable, matches the pitch, and analytics show real users on it in the last 30 days.",
    ],
    checklist: [
      "Does the URL resolve to this company's site?",
      "Can a user reach the actual product (sign-up, demo, store listing)?",
      "Does the live product match what the pitch describes?",
    ],
    examples: {
      level2: "Marketing site with product screenshots and a contact form.",
      level4: "Self-serve sign-up works; product matches the deck; GA4 shows 1,900 active users last month.",
    },
    evidenceTypes: ["public_url", "analytics"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A: every company can give a public URL.",
  },
  {
    id: "blockid:question:website:48ff7ec50dd91ec2", item: "PTD-01",
    question: "Do you have a mobile app?",
    anchors: [
      "Evidence shows the core use case needs mobile, yet there is no mobile access at all.",
      "A mobile app is claimed with no store listing or build.",
      "A mobile build or responsive web app exists and is described, not publicly available.",
      "A mobile app is live in a store (or a responsive web app serves mobile users) and matches the product.",
      "The live mobile app has active users shown in store or analytics data and a rating/review record.",
    ],
    checklist: [
      "Does the core use case need mobile access?",
      "Is the app live in a store or served as responsive web?",
      "Do analytics or store data show active mobile users?",
    ],
    examples: {
      level2: "TestFlight build for site managers; not in the App Store yet.",
      level4: "iOS and Android apps live; 1,200 monthly active users in analytics; 4.6 rating from 180 reviews.",
    },
    evidenceTypes: ["public_url", "analytics"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A when the core use case does not need mobile (e.g. back-office B2B software) and the company states why.",
  },
  {
    id: "blockid:question:website:4efdafd9b3689b60", item: "PTD-01",
    question: "What is your current monthly traffic?",
    anchors: [
      "Evidence shows traffic is negligible or falling with no explanation.",
      "A traffic figure is stated with no source or period.",
      "A monthly figure is stated with its source tool and period, founder-stated.",
      "Analytics export or connector confirms monthly visits and active users.",
      "Analytics confirm several months of visits and active users with a stable or rising trend and the traffic sources behind it.",
    ],
    checklist: [
      "Is the figure from an analytics tool?",
      "Is the period stated?",
      "Is the trend over several months visible?",
    ],
    examples: {
      level2: "\"About 8k visits a month\" per the founder.",
      level4: "GA4 connector: 8.2k → 11.5k monthly visits over 6 months, 40% organic.",
    },
    evidenceTypes: ["analytics", "public_url"],
    level4Tiers: ["T1"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "N/A when the product is not web-delivered (e.g. enterprise on-premise, hardware) and usage is scored under PTD-01 active users.",
  },
  {
    id: "blockid:question:roadmap:a0fa8d89d844ab6a", item: "PTD-08",
    question: "How do you prioritize features?",
    anchors: [
      "Evidence shows priorities change with each customer request and shipped work does not match the stated plan.",
      "Prioritisation is described as intuition with no method.",
      "A method (impact vs effort, customer votes) is described, with a current backlog.",
      "The method is applied to a written roadmap tied to customer data, and shipped work matches it.",
      "The method links features to measured outcomes, shipped work matches the roadmap, and the roadmap sequences an expansion product beyond the first one.",
    ],
    checklist: [
      "Is there a written prioritisation method and backlog?",
      "Does shipped work (changelog, git) match the stated priorities?",
      "Does the roadmap include an expansion product beyond the first?",
    ],
    examples: {
      level2: "RICE scoring sheet for the backlog; no link to shipped work.",
      level4: "Roadmap ranked by retention impact; changelog matches last 2 quarters; payments module sequenced as Act II.",
    },
    evidenceTypes: ["document", "git", "analytics"],
    level4Tiers: ["T1", "T3"],
    stages: ["PS", "S", "A", "B+"],
    notApplicable: "Never N/A.",
  },
  {
    id: "PTD-02",
    anchors: [
      "Evidence shows every cohort decays towards zero usage.",
      "Retention is claimed without cohort data.",
      "A cohort table is shared as a screenshot or spreadsheet, not reconciled to analytics.",
      "Analytics cohorts show usage flattening after the first months for recent cohorts.",
      "Analytics cohorts plateau at a healthy level across many cohorts, newer cohorts retain as well or better, and engagement ratios (DAU/MAU) are stable.",
    ],
    checklist: [
      "Is there a cohort table from analytics?",
      "Do cohorts flatten rather than decay to zero?",
      "Do newer cohorts retain as well as older ones?",
    ],
    examples: {
      level2: "Spreadsheet cohort chart showing 30% month-3 retention.",
      level4: "Mixpanel cohorts: 12 monthly cohorts plateau at 38–45% from month 4; newer cohorts slightly better.",
    },
    notApplicable: "N/A when the product has fewer than three monthly cohorts of users.",
  },
  {
    id: "PTD-05",
    anchors: [
      "Evidence shows a known breach, or customer data handled with no security controls.",
      "Security is claimed ('bank-grade') with no control, test or certificate.",
      "Controls are listed (MFA, encryption, backups) in a policy, not independently tested.",
      "A penetration test or Essential Eight assessment by a third party is on file with findings addressed.",
      "An independent certification (SOC 2 / ISO 27001) or recent pentest with all high findings closed covers the systems holding customer data.",
    ],
    checklist: [
      "Are security controls documented?",
      "Has a third party tested them (pentest, Essential Eight assessment)?",
      "Are high-severity findings closed?",
    ],
    examples: {
      level2: "Security policy lists MFA, encryption at rest and daily backups.",
      level4: "SOC 2 Type I report dated 2026 plus a pentest with all highs remediated.",
    },
    notApplicable: "N/A when the company holds no customer or personal data.",
  },
  {
    id: "PTD-06",
    anchors: [
      "Evidence shows inference and model costs consume most of revenue with no path to improve.",
      "AI costs are not tracked separately.",
      "AI cost per customer or request is estimated, founder-stated.",
      "Cloud/model bills give gross margin after inference, reconciled to revenue.",
      "Bills show gross margin after inference improving over several periods through measured actions (caching, smaller models, pricing).",
    ],
    checklist: [
      "Are inference and model costs tracked separately?",
      "Is gross margin after inference computed from bills?",
      "Is there a measured trend or plan to improve it?",
    ],
    examples: {
      level2: "Founder estimates model costs at 20% of revenue.",
      level4: "Cloud bills: gross margin after inference 58% → 71% over 3 quarters after routing to smaller models.",
    },
    notApplicable: "N/A when the product does not rely on paid model inference or heavy compute.",
  },
  {
    id: "PTD-07",
    anchors: [
      "Evidence shows the stack is commodity and a rival could replicate it quickly.",
      "Proprietary technology is claimed without describing what it is.",
      "The proprietary asset (dataset, model, algorithm) is described with how it was built.",
      "A data inventory or technical document shows the asset's size, source rights and use in the product.",
      "The documented asset grows with usage, the company holds the rights to it, and removing it would measurably worsen the product.",
    ],
    checklist: [
      "Is the proprietary asset described specifically?",
      "Does the company hold the rights to the data or technology?",
      "Does the asset grow or improve with usage?",
    ],
    examples: {
      level2: "Founders describe a labelled dataset of 200k compliance documents.",
      level4: "Data inventory: 1.4M labelled documents under customer licences, growing 30k/month; accuracy drops 18% without it.",
    },
    notApplicable: "N/A before Series A.",
  },
];
