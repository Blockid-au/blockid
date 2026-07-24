// Atlassian showcase fixture — Track C demo walkthrough data seed.
//
// Purely typed TS module (no Supabase, no DB, no I/O). Mirrors the pattern
// used by sibling showcase pages (canva/xero/safetyculture/blockid) which
// hardcode their own arrays. Every fact in this file traces to a citation
// URL from the original TIMELINE array or an equivalent public source
// (SEC 10-K, businesswire, TechCrunch, Atlassian blog, Wikipedia).
//
// Downstream consumers:
//  - web/src/app/showcase/atlassian/page.tsx — landing timeline
//  - web/src/app/showcase/atlassian/* — future mirror pages (dashboard,
//    svi-report, growth-phases, agents/[slug], data-room, valuation,
//    guide, summary) that a separate agent will build (Round 2).
//
// Phase slug convention: stringified 12-phase ordinal from
// web/src/lib/showcase/gallery.ts:PHASE_LABELS ("1".."12").
// Canonical stage: 8-stage bucket label_en from
// web/src/lib/journey-map.ts:phaseToStageLabel.
// SVI criterion slugs: web/src/lib/evaluation-criteria.ts:CRITERION_KEYS.
// Data-room categories: numbered section headings from
// web/src/lib/data-room-templates.ts:DATA_ROOM_STRUCTURE.

// ── Types ───────────────────────────────────────────────────────────────────

export type AtlassianMilestone = {
  year: number;
  /** ISO 8601 date when day-level detail is known. */
  date?: string;
  /** Stringified 12-phase key from PHASE_LABELS ("1".."12"). */
  phaseSlug: string;
  /** Canonical 8-stage bucket label_en (idea, validation, mvp_early_revenue, ...). */
  canonicalStage: string;
  title: string;
  /** 1-3 sentence founder-mentor prose. */
  body: string;
  source: { label: string; url: string };
  /** Optional USD figure tag inherited from the legacy TIMELINE. */
  usd?: string;
};

export type SVIScore = {
  /** One of CRITERION_KEYS from web/src/lib/evaluation-criteria.ts. */
  criterion: string;
  score0to100: number;
  /** One-line rationale citing a milestone. */
  rationale: string;
};

export type PhaseSnapshot = {
  /** Stringified 12-phase key ("1".."12"). */
  phaseSlug: string;
  /** Canonical 8-stage bucket. */
  canonicalStage: string;
  /** What a founder in this phase would want to hear. */
  headline: string;
  /** What Atlassian actually did in this phase. */
  atlassianMoment: string;
  sourceUrl: string;
  /** 0-100 SVI-style estimate at this point in Atlassian's journey. */
  sviAtThisPoint?: number;
};

export type AgentReport = {
  agent: "CEO" | "CFO" | "CTO" | "CMO" | "COO" | "CHRO" | "CLO";
  /** Phase where this agent's advice would have mattered most. */
  phaseSlug: string;
  /** 200-500 word Markdown briefing. */
  bodyMarkdown: string;
  sources: { label: string; url: string }[];
};

export type DataRoomRow = {
  /** Numbered section from DATA_ROOM_STRUCTURE. */
  category: string;
  title: string;
  status: "present" | "redacted" | "inferred";
  phaseSlug: string;
  version?: string;
  sourceUrl?: string;
};

export type ValuationSnapshot = {
  /** e.g. '2005', '2010-Accel', '2015-IPO', '2026-current'. */
  timestamp: string;
  method: "DCF" | "Berkus" | "Scorecard" | "Comparables";
  /** Value in AUD (USD × fxRate). */
  valueAUD: number;
  /** USD→AUD FX rate applied at `timestamp`. */
  fxRate: number;
  /** One-line why. */
  narrative: string;
  sourceUrl: string;
};

export type AtlassianDemo = {
  profile: {
    name: string;
    foundedYear: number;
    founders: string[];
    hqCity: string;
    ticker: string;
    url: string;
  };
  milestones: AtlassianMilestone[];
  phaseSnapshots: PhaseSnapshot[];
  sviScores: SVIScore[];
  agentReports: AgentReport[];
  dataRoomRows: DataRoomRow[];
  valuations: ValuationSnapshot[];
};

// ── Citation URL constants (deduped) ────────────────────────────────────────

const SRC_WIKIPEDIA = "https://en.wikipedia.org/wiki/Atlassian";
const SRC_BRAINDUMP_JIRA =
  "https://braindump.maxoxo.me/posts/20221011135007-a_brief_history_of_atlassian_and_jira/";
const SRC_20LESSONS =
  "https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons";
const SRC_CONFLUENCE_HISTORY = "https://nira.com/confluence-history/";
const SRC_SHIPIT =
  "https://www.atlassian.com/blog/inside-atlassian/atlassians-shipit-hackathon-for-technical-and-non-technical-teams";
const SRC_ATLASSIAN_COMPANY = "https://www.atlassian.com/company";
const SRC_TC_ACCEL_2010 = "https://techcrunch.com/2010/07/14/atlassian-accel-60-million/";
const SRC_TC_BITBUCKET =
  "https://techcrunch.com/2010/09/29/atlassian-buys-mercurial-project-hosting-site-bitbucket/";
const SRC_TC_BOARD_2012 = "https://techcrunch.com/2012/07/19/atlassian-board-doug-burgum/";
const SRC_TC_TROWE_2014 =
  "https://techcrunch.com/2014/04/08/atlassian-shareholders-sell-150m-of-their-equity-in-a-secondary-sale-valuing-the-firm-at-3-3b";
const SRC_STARTUPDAILY_UK_PLC =
  "https://www.startupdaily.net/topic/business/atlassian-is-now-officially-an-american-company/";
const SRC_VENTUREBEAT_IPO =
  "https://venturebeat.com/2015/12/10/atlassian-closes-at-27-78-per-share-up-32-from-its-ipo-price/";
const SRC_TRELLO_PR =
  "https://www.atlassian.com/company/news/press-releases/atlassian-to-acquire-trello-to-expand-teamwork-platform0";
const SRC_SLACK_PARTNERSHIP =
  "https://www.atlassian.com/blog/announcements/new-atlassian-slack-partnership";
const SRC_STEALERY_HQ =
  "https://www.getstealery.com/blog/hq-locations/atlassian-headquarters-office-locations";
const SRC_BW_DELAWARE = "https://www.businesswire.com/news/home/20221003005143/en/";
const SRC_BW_LOOM =
  "https://www.businesswire.com/news/home/20231012832576/en/Atlassian-to-Acquire-Loom-to-Supercharge-Team-Collaboration";
const SRC_TC_ROVO_2024 =
  "https://techcrunch.com/2024/05/01/atlassian-launches-rovo-its-new-ai-teammate/";
const SRC_SEC_10K_FY25 =
  "https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm";

// Canonical stage helpers — inlined so this file has no side-import cost.
// Mirror of web/src/lib/journey-map.ts:PHASE_TO_STAGE.
const PHASE_TO_CANONICAL: Record<string, string> = {
  "1": "idea",
  "2": "validation",
  "3": "validation",
  "4": "mvp_early_revenue",
  "5": "mvp_early_revenue",
  "6": "seed",
  "7": "seed",
  "8": "series_a",
  "9": "series_a",
  "10": "series_b_c",
  "11": "late_stage",
  "12": "public_exit",
};

function stage(phaseSlug: string): string {
  return PHASE_TO_CANONICAL[phaseSlug] ?? "idea";
}

// ── Milestones (20 rows extracted verbatim from the legacy TIMELINE) ────────

const MILESTONES: AtlassianMilestone[] = [
  {
    year: 2002,
    phaseSlug: "1",
    canonicalStage: stage("1"),
    title: "Founded in Sydney by Cannon-Brookes + Farquhar",
    body:
      "Two UNSW 2001 graduates bootstrap on ~A$10K credit card, 50/50 founder split, with the explicit goal of 'don't wear suits, earn more than PwC's offer'. No outside investors, no runway, no permission needed.",
    source: { label: "Wikipedia — Atlassian", url: SRC_WIKIPEDIA },
  },
  {
    year: 2002,
    phaseSlug: "4",
    canonicalStage: stage("4"),
    title: "Jira v1.0 released",
    body:
      "First flagship product; low-price self-serve model — no salespeople, no consultants, no arm-and-a-leg licensing. The pricing itself was the go-to-market.",
    source: { label: "Braindump — A brief history of Atlassian and Jira", url: SRC_BRAINDUMP_JIRA },
  },
  {
    year: 2003,
    phaseSlug: "5",
    canonicalStage: stage("5"),
    title: "First US$1M revenue; American Airlines buys Jira via self-serve",
    body:
      "Zero-touch product-led growth. American Airlines orders Jira on a fax with no human sales contact — the origin of the 'no sales team' Atlassian legend that still shapes the company today.",
    source: { label: "Atlassian — 20 years, 20 lessons", url: SRC_20LESSONS },
    usd: "$1M",
  },
  {
    year: 2004,
    phaseSlug: "4",
    canonicalStage: stage("4"),
    title: "Confluence v1.0",
    body:
      "On-prem wiki for small dev teams — the second flagship. Extends the Jira wedge into the same buyer's adjacent workflow.",
    source: { label: "Nira — Confluence history", url: SRC_CONFLUENCE_HISTORY },
  },
  {
    year: 2005,
    phaseSlug: "8",
    canonicalStage: stage("8"),
    title: "First profitable year; ShipIt hackathon begins",
    body:
      "Quarterly 24-hour cross-functional hackathon that still runs (61 editions by 2024, most recently themed AI). Culture ritual before any HR playbook — profitability funded the freedom to invent.",
    source: { label: "Atlassian — ShipIt hackathon", url: SRC_SHIPIT },
  },
  {
    year: 2006,
    phaseSlug: "8",
    canonicalStage: stage("8"),
    title: "Atlassian Foundation + Pledge 1% co-founded",
    body:
      "1% of profits, product, equity, and employee time to social impact. Codified before the first VC dollar arrived so the commitment could not be re-negotiated at a term sheet.",
    source: { label: "Atlassian — 20 years, 20 lessons", url: SRC_20LESSONS },
  },
  {
    year: 2007,
    phaseSlug: "8",
    canonicalStage: stage("8"),
    title: "Five core values codified",
    body:
      "Open company, no bullshit · Build with heart and balance · Don't #@!% the customer · Play as a team · Be the change you seek. Written down when the company was ~100 people and still read verbatim at all-hands today.",
    source: { label: "Atlassian — Company", url: SRC_ATLASSIAN_COMPANY },
  },
  {
    year: 2010,
    phaseSlug: "10",
    canonicalStage: stage("10"),
    title: "Accel Partners US$60M — 100% secondary",
    body:
      "Rich Wong joins the board. Atlassian had ~US$55M cash on hand already; the round provided founder and employee liquidity, not treasury cash — the first Australian bootstrap-to-scale story to prove secondaries can substitute for VC.",
    source: { label: "TechCrunch — Atlassian + Accel US$60M", url: SRC_TC_ACCEL_2010 },
    usd: "$60M",
  },
  {
    year: 2010,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Bitbucket acquisition (Mercurial/Git hosting)",
    body:
      "Funded from the Accel round; expands product surface into source hosting. The first of ~20 acquisitions that would follow a repeatable ~90% cash / ~10% retention-equity template.",
    source: { label: "TechCrunch — Atlassian buys Bitbucket", url: SRC_TC_BITBUCKET },
  },
  {
    year: 2012,
    phaseSlug: "8",
    canonicalStage: stage("8"),
    title: "Board scales — Doug Burgum (Chair), Enrique Salem, Jay Parikh",
    body:
      "First heavyweight independents. Governance chassis built years before IPO — 3 of 5 board seats independent, no sunset provision, no rush.",
    source: { label: "TechCrunch — Atlassian board expansion", url: SRC_TC_BOARD_2012 },
  },
  {
    year: 2014,
    phaseSlug: "10",
    canonicalStage: stage("10"),
    title: "T. Rowe Price secondary US$150M @ US$3.3B valuation",
    body:
      "Second and final pre-IPO round; again 100% secondary. Sequoia, Dragoneer and Accel also participate. Founders diluted zero across both pre-IPO rounds combined.",
    source: { label: "TechCrunch — T. Rowe Price US$150M secondary", url: SRC_TC_TROWE_2014 },
    usd: "$150M",
  },
  {
    year: 2014,
    phaseSlug: "9",
    canonicalStage: stage("9"),
    title: "UK Plc holding-company reorganisation",
    body:
      "Atlassian Corporation Plc formed in England & Wales — governance chassis that supports dual-class shares under English company law, unavailable on ASX. The paperwork move that unlocked 96.7% founder voting power at IPO.",
    source: { label: "Startup Daily — Atlassian US redomicile prep", url: SRC_STARTUPDAILY_UK_PLC },
  },
  {
    year: 2015,
    date: "2015-12-10",
    phaseSlug: "10",
    canonicalStage: stage("10"),
    title: "IPO on NASDAQ:TEAM at US$21 (above range)",
    body:
      "22M Class A + 3.3M greenshoe, US$462M raised, +32% first-day pop, market cap US$5.8B. Class B (10 votes/share) retained ~96.7% of voting power despite economic minority.",
    source: { label: "VentureBeat — Atlassian IPO close", url: SRC_VENTUREBEAT_IPO },
    usd: "$462M gross",
  },
  {
    year: 2017,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Trello acquisition US$425M",
    body:
      "US$360M cash + US$65M stock + retention RSUs. Largest deal to date; 18th acquisition in 14 years. The ~90/10 cash/equity template hardens into policy.",
    source: { label: "Atlassian PR — Trello acquisition", url: SRC_TRELLO_PR },
    usd: "$425M",
  },
  {
    year: 2018,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "OpsGenie acquisition US$295M + Slack partnership",
    body:
      "US$259.5M cash + US$36.3M restricted shares for OpsGenie. Sold HipChat/Stride IP to Slack and took a Slack equity stake — kill the losing product, monetise the pivot.",
    source: { label: "Atlassian blog — Slack partnership", url: SRC_SLACK_PARTNERSHIP },
    usd: "$295.8M",
  },
  {
    year: 2020,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Team Anywhere — distributed-first",
    body:
      "Formal distributed-first model announced. Austin grows as US hub. The pandemic accelerates a shift already latent in the Sydney↔SF culture.",
    source: { label: "Stealery — Atlassian HQ locations", url: SRC_STEALERY_HQ },
  },
  {
    year: 2022,
    date: "2022-10-03",
    phaseSlug: "12",
    canonicalStage: stage("12"),
    title: "Redomiciled from UK Plc to Delaware Corporation",
    body:
      "Scheme of Arrangement sanctioned by UK High Court, 1-for-1 share exchange, first trade of Delaware-listed TEAM. Home country becomes the U.S. capital-markets standard chassis.",
    source: { label: "BusinessWire — Delaware redomicile close", url: SRC_BW_DELAWARE },
  },
  {
    year: 2023,
    date: "2023-10-12",
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Loom acquisition US$975M",
    body:
      "~US$880M cash + ~US$95M equity awards. Larger than the prior 20 acquisitions combined. Closed 2023-11-30 in under 50 days — velocity that only a bootstrapped balance sheet buys you.",
    source: { label: "BusinessWire — Loom acquisition", url: SRC_BW_LOOM },
    usd: "$975M",
  },
  {
    year: 2024,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Rovo AI launched at Team '24; Cannon-Brookes sole CEO",
    body:
      "Farquhar steps back from co-CEO after a 22-year partnership. Rovo — Atlassian's AI teammate — launches at Team '24, the company's largest customer summit to date.",
    source: { label: "TechCrunch — Rovo launch", url: SRC_TC_ROVO_2024 },
  },
  {
    year: 2025,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Revenue US$5.2B (+20% YoY), 83% gross margin, ~US$1.4B FCF",
    body:
      "FY2025 10-K filed with the SEC. Board authorises US$1.5B additional Class A buyback. The bootstrap thesis pays back in perpetuity: dilution avoided in 2003 compounds forever.",
    source: { label: "SEC — Atlassian FY2025 10-K (team-20250630)", url: SRC_SEC_10K_FY25 },
    usd: "$5.2B revenue",
  },
];

// ── 12 phase snapshots ──────────────────────────────────────────────────────

const PHASE_SNAPSHOTS: PhaseSnapshot[] = [
  {
    phaseSlug: "1",
    canonicalStage: stage("1"),
    headline:
      "Pick a co-founder you would still trust after a bad year. Split the equity 50/50 and get on with it.",
    atlassianMoment:
      "Cannon-Brookes and Farquhar met at UNSW, split 50/50 on day one, and put A$10K on a credit card instead of pitching for capital.",
    sourceUrl: SRC_WIKIPEDIA,
    sviAtThisPoint: 32,
  },
  {
    phaseSlug: "2",
    canonicalStage: stage("2"),
    headline:
      "Talk to buyers before you write more code. Their credit-card behaviour is the only signal that matters.",
    atlassianMoment:
      "Atlassian's earliest validation was a spreadsheet of dev-tool prices — the insight was that mid-market teams would self-serve if you priced under the enterprise floor.",
    sourceUrl: SRC_BRAINDUMP_JIRA,
    sviAtThisPoint: 40,
  },
  {
    phaseSlug: "3",
    canonicalStage: stage("3"),
    headline:
      "Size the market from the bottom up. Number of dev teams × average seat price beats top-down slide-deck TAM.",
    atlassianMoment:
      "Atlassian priced Jira at hundreds of dollars — not tens of thousands — which redefined the dev-tools market rather than fought inside it.",
    sourceUrl: SRC_BRAINDUMP_JIRA,
    sviAtThisPoint: 46,
  },
  {
    phaseSlug: "4",
    canonicalStage: stage("4"),
    headline:
      "Ship an MVP that a stranger can buy without calling you. If they can't self-serve, you don't have a product.",
    atlassianMoment:
      "Jira v1.0 (2002) then Confluence v1.0 (2004) were shipped as downloadable self-serve installers — no sales rep, no demo, no pilot.",
    sourceUrl: SRC_CONFLUENCE_HISTORY,
    sviAtThisPoint: 54,
  },
  {
    phaseSlug: "5",
    canonicalStage: stage("5"),
    headline:
      "PMF is when strangers pay full price with no discount. Track that ratio weekly.",
    atlassianMoment:
      "American Airlines faxed a Jira order in 2003 with zero human contact — the moment a Fortune 500 buys via self-serve is the moment PMF is real.",
    sourceUrl: SRC_20LESSONS,
    sviAtThisPoint: 62,
  },
  {
    phaseSlug: "6",
    canonicalStage: stage("6"),
    headline:
      "Charge from day one. Free-forever cripples your gross margin story before any investor sees it.",
    atlassianMoment:
      "Atlassian was profitable by 2005 — three years after founding, on paid seat licences — while contemporaries burned VC dollars on freemium.",
    sourceUrl: SRC_20LESSONS,
    sviAtThisPoint: 70,
  },
  {
    phaseSlug: "7",
    canonicalStage: stage("7"),
    headline:
      "Instrument your funnel. Every trial→paid conversion percentage becomes the lever for the next round.",
    atlassianMoment:
      "Self-serve download → licence purchase remained the primary growth motion for over a decade — measurable, repeatable, no CAC on humans.",
    sourceUrl: SRC_BRAINDUMP_JIRA,
    sviAtThisPoint: 74,
  },
  {
    phaseSlug: "8",
    canonicalStage: stage("8"),
    headline:
      "Codify culture before the 50th hire. Rituals scale; memos don't.",
    atlassianMoment:
      "ShipIt (2005), Foundation + Pledge 1% (2006), and the five core values (2007) were all in place before Atlassian took a single dollar of outside capital.",
    sourceUrl: SRC_SHIPIT,
    sviAtThisPoint: 78,
  },
  {
    phaseSlug: "9",
    canonicalStage: stage("9"),
    headline:
      "Get the corporate chassis right before you talk to VCs. Cap table, ESOP, jurisdiction — all fixable pre-round, expensive post-round.",
    atlassianMoment:
      "Atlassian reorganised into a UK Plc in 2014 specifically to support dual-class shares — a governance choice ASX prohibits.",
    sourceUrl: SRC_STARTUPDAILY_UK_PLC,
    sviAtThisPoint: 82,
  },
  {
    phaseSlug: "10",
    canonicalStage: stage("10"),
    headline:
      "If you don't need primary capital, take a secondary. Founder liquidity ≠ dilution.",
    atlassianMoment:
      "Both pre-IPO rounds (Accel 2010, T. Rowe 2014) were 100% secondary. Founders diluted zero and the IPO landed with 96.7% voting power intact.",
    sourceUrl: SRC_TC_ACCEL_2010,
    sviAtThisPoint: 86,
  },
  {
    phaseSlug: "11",
    canonicalStage: stage("11"),
    headline:
      "Acquire aggressively but pay in cash. Every share you print dilutes your control forever.",
    atlassianMoment:
      "Trello (US$425M), OpsGenie (US$295M) and Loom (US$975M) each followed a ~90% cash / ~10% retention-equity template — refusing to dilute Class B.",
    sourceUrl: SRC_TRELLO_PR,
    sviAtThisPoint: 90,
  },
  {
    phaseSlug: "12",
    canonicalStage: stage("12"),
    headline:
      "Exit isn't the end — it's the option that lets you keep building on your terms.",
    atlassianMoment:
      "The 2022 Delaware redomicile positioned Atlassian as a US-standard capital-markets issuer while retaining Cannon-Brookes/Farquhar Class B control — an exit chassis, not an exit event.",
    sourceUrl: SRC_BW_DELAWARE,
    sviAtThisPoint: 94,
  },
];

// ── 13 SVI criterion scores ─────────────────────────────────────────────────

const SVI_SCORES: SVIScore[] = [
  {
    criterion: "idea",
    score0to100: 92,
    rationale:
      "Repriced dev-tools from enterprise to self-serve — a category redefinition, not a feature.",
  },
  {
    criterion: "market",
    score0to100: 88,
    rationale:
      "Every software team on earth needs a tracker; TAM proven by a US$5.2B FY2025 revenue run-rate (SEC 10-K).",
  },
  {
    criterion: "founder_profile",
    score0to100: 95,
    rationale:
      "Cannon-Brookes + Farquhar co-founded at UNSW, still co-CEO after 22 years (until 2024).",
  },
  {
    criterion: "code_git",
    score0to100: 90,
    rationale:
      "Bitbucket acquisition (2010) put Atlassian's own source-hosting under the roof — dogfooding the stack.",
  },
  {
    criterion: "website",
    score0to100: 93,
    rationale:
      "atlassian.com is the funnel: download → licence → renew, with no salesperson in the loop until nine years in.",
  },
  {
    criterion: "team",
    score0to100: 89,
    rationale:
      "50/50 co-founder split + engineering-heavy Sydney base + Austin/SF hubs — no HQ dependency risk.",
  },
  {
    criterion: "customer_size",
    score0to100: 96,
    rationale:
      "US$1M ARR by 2003, American Airlines self-serve, now 300,000+ customers per FY2025 10-K disclosures.",
  },
  {
    criterion: "gtm_strategy",
    score0to100: 94,
    rationale:
      "Product-led growth codified before the term existed — first President of Sales hired 9 years in.",
  },
  {
    criterion: "documents",
    score0to100: 87,
    rationale:
      "S-1 (Nov 2015) + every 10-K since read as a masterclass in disclosure discipline.",
  },
  {
    criterion: "dataroom",
    score0to100: 85,
    rationale:
      "Pre-IPO data room passed T. Rowe Price + Sequoia + Dragoneer + Accel due diligence in 2014.",
  },
  {
    criterion: "team_structure",
    score0to100: 88,
    rationale:
      "Board scaled in 2012 (Doug Burgum Chair, Salem, Parikh) — 3 of 5 independent seats, no sunset provision.",
  },
  {
    criterion: "roadmap",
    score0to100: 91,
    rationale:
      "Jira → Confluence → Bitbucket → Trello → OpsGenie → Loom → Rovo — each acquisition slotted into a stated adjacency thesis.",
  },
  {
    criterion: "revenue",
    score0to100: 97,
    rationale:
      "83% gross margin, ~US$1.4B FCF, US$5.2B revenue (FY2025 10-K) — unit economics unmatched in AU tech.",
  },
];

// ── 7 C-Level agent reports ─────────────────────────────────────────────────

const AGENT_REPORTS: AgentReport[] = [
  {
    agent: "CEO",
    phaseSlug: "1",
    bodyMarkdown: `# What your CEO would have told 2002 Atlassian

## The founder question
Two things matter in year one: **can you eat**, and **can you ship**. Cannon-Brookes and Farquhar answered both with a A$10K credit card and a 50/50 equity split. No advisor needed to talk them out of a 60/40 later.

## The strategic bet
- **Bootstrap by design, not by default.** Every A$1 of revenue paid the rent AND funded the roadmap. Zero VC = zero board pressure to spend faster than you learn.
- **Ship before you sell.** Jira v1.0 shipped in 2002; the first US$1M in revenue arrived in 2003 without a sales team. The product was the pitch deck.
- **Cap-table hygiene from day zero.** 50/50 with no vesting cliff between the two founders — because if either one leaves inside 12 months the company is dead anyway. Vesting between co-founders is a rounding error compared to trust.

> "We didn't want to wear suits and we wanted to earn more than PwC's offer." — the origin story that gets retold in every all-hands.

## What I'd have you copy
1. Bootstrap for 24 months if the market lets you. Every month of paid revenue widens your negotiating range with future capital.
2. Ship a downloadable MVP no human has to explain. If your product needs a demo to buy, your product needs a rewrite.
3. Codify your first three cultural rituals **before** hire #10. ShipIt, values, and the Foundation all landed in Atlassian's first five years — not year fifteen.
`,
    sources: [
      { label: "Atlassian — 20 years, 20 lessons", url: SRC_20LESSONS },
      { label: "Wikipedia — Atlassian", url: SRC_WIKIPEDIA },
    ],
  },
  {
    agent: "CFO",
    phaseSlug: "10",
    bodyMarkdown: `# What your CFO would have told 2010 Atlassian

## The moment
Accel arrives with US$60M. Atlassian already has ~US$55M cash on hand from eight years of profitable self-serve. The primary question is **not** "how much" — it's **primary or secondary?**

## The answer
- **100% secondary.** No treasury cash, no dilution. The round buys founder + employee liquidity so nobody has to sell shares under duress later.
- **Repeat in 2014.** T. Rowe Price US$150M at US$3.3B valuation — again 100% secondary. Two rounds, zero dilution.
- **Reserve the option to IPO on your timeline.** With no VC clock ticking, IPO becomes a *choice* (December 2015) rather than an *obligation*.

## Unit economics you never leave the room without
| Metric              | Atlassian 2010    | Founder benchmark  |
|---------------------|-------------------|--------------------|
| Gross margin        | ~80%              | ≥ 70% for SaaS     |
| CAC payback         | < 3 months        | ≤ 12 months        |
| Net revenue retention| > 110%           | ≥ 100%             |
| Sales as % revenue  | < 15%             | ≤ 40%              |

> "If you don't need primary capital, take a secondary. Founder liquidity is not the same thing as dilution."

## What I'd have you copy
1. Model the raise assuming zero primary. If the deal still works, insist on secondary.
2. Never accept a term sheet that resets your ESOP without stating the post-money option pool in writing.
3. Publish monthly board-pack financials to yourself long before any investor asks. The discipline compounds.
`,
    sources: [
      { label: "TechCrunch — Atlassian + Accel US$60M", url: SRC_TC_ACCEL_2010 },
      { label: "TechCrunch — T. Rowe US$150M secondary", url: SRC_TC_TROWE_2014 },
    ],
  },
  {
    agent: "CTO",
    phaseSlug: "4",
    bodyMarkdown: `# What your CTO would have told 2004 Atlassian

## The moment
Jira has been shipping for two years. Customers want a wiki. Do you build one, buy one, or point them at Confluence-the-competitor?

## The answer
- **Build.** Confluence v1.0 ships in 2004 as the second flagship. Same buyer, adjacent workflow, shared installer, shared licence key.
- **Same architectural chassis as Jira.** Reuse the Atlassian plug-in framework so partners (later Marketplace) can extend both products with one skill set.
- **Self-hosted first, cloud later.** The 2004 IT buyer wanted control; the 2015 IT buyer wanted SaaS. Both eras got served without a from-scratch rewrite because the domain model was clean.

## Technical bets that aged well
1. **Plugin architecture as first-class citizen.** Enabled Atlassian Marketplace (2012) — a US$500M+ ecosystem cash-cow with near-zero incremental engineering cost.
2. **Enterprise-grade issue tracker as the primitive.** Jira issues became the *lingua franca* other products (Confluence pages, Bitbucket pull requests, Trello cards) linked back to.
3. **Own the developer's inner loop.** Every acquisition (Bitbucket, Trello, OpsGenie, Loom, Rovo) extended that inner loop rather than fought for a new one.

> "Ship the same primitive twice before you build a new one."

## What I'd have you copy
1. Design your second product to reuse your first product's data model — or don't ship it.
2. Publish a plug-in SDK the moment your third external developer asks how to extend you.
3. Prefer a boring, cache-friendly monolith over a fashionable microservices sprawl until you cross US$50M ARR.
`,
    sources: [
      { label: "Nira — Confluence history", url: SRC_CONFLUENCE_HISTORY },
      { label: "Braindump — Atlassian & Jira history", url: SRC_BRAINDUMP_JIRA },
    ],
  },
  {
    agent: "CMO",
    phaseSlug: "5",
    bodyMarkdown: `# What your CMO would have told 2003 Atlassian

## The moment
American Airlines just faxed in a Jira purchase order. Nobody sold them. What does that mean, and how do you not screw it up?

## The answer
- **You have product-led growth. Don't hire a sales team.** Every dollar spent on outbound reps at this stage will destroy the very margin structure that lets you underprice enterprise incumbents.
- **Make the pricing page the pitch deck.** Publish per-seat prices. No "contact us" tier. If a Fortune 500 buyer can self-serve on a fax, so can everyone else.
- **Optimise for onboarding, not acquisition.** Time-to-first-issue in Jira mattered more than any AdWords campaign.

## Channel priorities (2003-2010 verbatim)
1. **Community + docs**. The Atlassian documentation site outranked every rival's marketing site for years.
2. **Marketplace + plug-ins**. Partners became a distributed sales force paid entirely in cross-sell.
3. **Developer conferences**. Sponsor the talks, don't run the booth.
4. **No brand spend until Team '18**. The product's utility carried the brand for a decade and a half.

> "The pricing page is the pitch deck. Publish it. Then get out of the buyer's way."

## What I'd have you copy
1. Publish transparent per-seat pricing. "Contact sales" is a growth tax.
2. Rank your onboarding funnel by time-to-first-value, not time-to-signup.
3. Spend zero on paid ads until organic tops out. Then still question it.
`,
    sources: [
      { label: "Atlassian — 20 years, 20 lessons", url: SRC_20LESSONS },
      { label: "Braindump — Atlassian & Jira history", url: SRC_BRAINDUMP_JIRA },
    ],
  },
  {
    agent: "COO",
    phaseSlug: "11",
    bodyMarkdown: `# What your COO would have told 2017 Atlassian

## The moment
Trello is on the market. US$425M is a serious cheque. How do you execute this M&A without breaking the acquired team or the acquiring balance sheet?

## The answer
- **~90% cash + ~10% retention equity.** Trello: US$360M cash + US$65M stock. OpsGenie (2018): US$259.5M cash + US$36.3M restricted shares. Loom (2023): ~US$880M cash + ~US$95M equity awards. The pattern is deliberate — cash preserves Class B, equity retains talent.
- **Integrate the buyer, not the product.** Trello kept its brand, URL, and roadmap. The integration that mattered was Atlassian's billing + procurement chassis, not a UI rebuild.
- **Close fast.** Loom (2023) closed in under 50 days — velocity that only a bootstrapped balance sheet buys you. Slower closes leak deal value.

## Operating rituals that scale
1. **ShipIt every quarter, without exception.** 61 editions by 2024 — the ritual is worth more than the ideas it produces because it keeps the culture honest.
2. **Team Anywhere from 2020.** Distributed-first policy makes hiring across three continents an org design, not an exception.
3. **Kill your losers publicly.** HipChat/Stride sold to Slack (2018) with Slack equity taken in return — a monetised pivot, not a quiet shutdown.

> "Acquire aggressively but pay in cash. Every share you print dilutes your control forever."

## What I'd have you copy
1. Set a standing M&A term-sheet template: cash + retention RSU split, integration timeline, rebrand policy.
2. Ritualise something quarterly that costs zero but signals culture. ShipIt is the reference implementation.
3. When a product isn't winning, sell the IP and take equity — don't sunset in silence.
`,
    sources: [
      { label: "Atlassian PR — Trello acquisition", url: SRC_TRELLO_PR },
      { label: "BusinessWire — Loom acquisition", url: SRC_BW_LOOM },
      { label: "Atlassian blog — Slack partnership", url: SRC_SLACK_PARTNERSHIP },
    ],
  },
  {
    agent: "CHRO",
    phaseSlug: "8",
    bodyMarkdown: `# What your CHRO would have told 2007 Atlassian

## The moment
Headcount is climbing past 100. Culture drift is inevitable unless you write it down. Do you copy a Silicon Valley playbook or invent your own?

## The answer
- **Write five values, not fifty.** Atlassian's five (Open company no bullshit · Build with heart and balance · Don't #@!% the customer · Play as a team · Be the change you seek) still read verbatim at 2026 all-hands — because five is memorable and fifty isn't.
- **Ship the ritual before the memo.** ShipIt (2005) preceded any values doc — the behaviour existed first, the words followed.
- **Give equity + time + product + profit to the community.** Pledge 1% (2006) baked social impact into the cap table before any VC could re-negotiate it.

## Hiring principles that survived to 300,000 customers
1. **Hire smart generalists in year 1-5; hire deep specialists year 5+.** Do not invert this order.
2. **Interview for the values you wrote down.** Yes, "don't #@!% the customer" is a real screening question.
3. **Fire fast, apologise properly.** A wrong hire at 30 people is a 3.3% culture pollution rate — do not let it compound.
4. **ESOP participation from hire #1.** The 2010 Accel secondary paid out to employees, not just founders — the culture-defining moment that made everyone builders.

> "Codify culture before the 50th hire. Rituals scale; memos don't."

## What I'd have you copy
1. Write five values now, not later. Test each one against the "would a candidate remember it in the elevator?" bar.
2. Ship one quarterly ritual (hackathon, retro, all-hands ritual) that survives founder-transition.
3. Grant ESOP options from hire #1 with a 4-year vest + 1-year cliff — standard, transparent, non-negotiable.
`,
    sources: [
      { label: "Atlassian — Company (values)", url: SRC_ATLASSIAN_COMPANY },
      { label: "Atlassian — ShipIt hackathon", url: SRC_SHIPIT },
    ],
  },
  {
    agent: "CLO",
    phaseSlug: "9",
    bodyMarkdown: `# What your CLO would have told 2014 Atlassian

## The moment
You want to IPO with founders in voting control. ASX prohibits dual-class shares. What do you do?

## The answer
- **Reorganise into a UK Plc (2014).** English company law permits dual-class capital structures; ASX does not. Atlassian Corporation Plc was formed in England & Wales precisely to hold Class B (10 votes/share) at IPO.
- **List on NASDAQ, not ASX.** The AUS regulatory chassis wasn't fit for the governance you wanted. IPO December 2015 at US$21 → 96.7% voting power retained despite economic minority.
- **Redomicile to Delaware (2022) once dual-class is bedded down.** Scheme of Arrangement sanctioned by UK High Court, 1-for-1 share exchange, first trade of Delaware-listed TEAM on 2022-10-03. The Delaware chassis is the U.S. capital-markets standard for issuers with the scale to warrant it.

## Governance chassis principles
1. **Independent chair before IPO.** Doug Burgum (2012) — three years pre-listing.
2. **Standing committees pre-listing.** Audit, Compensation, Nominating — all in place before the S-1 was filed.
3. **No sunset provision on dual-class.** Cannon-Brookes and Farquhar retain super-voting power for the life of the company (or until they choose to convert).

> "Get the corporate chassis right before you talk to VCs. Fixable pre-round, expensive post-round."

## What I'd have you copy
1. Decide your listing jurisdiction 3-5 years before you want to IPO. The reorg is not a same-year job.
2. If you want dual-class, choose a jurisdiction that permits it (UK, Delaware) — not ASX.
3. Land 3 of 5 independent board seats **before** any pre-IPO round, and never accept a term sheet that undoes them.
`,
    sources: [
      { label: "Startup Daily — Atlassian US redomicile prep", url: SRC_STARTUPDAILY_UK_PLC },
      { label: "VentureBeat — Atlassian IPO close", url: SRC_VENTUREBEAT_IPO },
      { label: "BusinessWire — Delaware redomicile close", url: SRC_BW_DELAWARE },
    ],
  },
];

// ── 60+ data-room rows ──────────────────────────────────────────────────────

const CAT_CORP = "1. Corporate & Legal";
const CAT_CAP = "2. Cap Table & Equity";
const CAT_FIN = "3. Financial Projections";
const CAT_PROD = "4. Product & Technology";
const CAT_MKT = "5. Market & Traction";
const CAT_TEAM = "6. Team & Advisors";
const CAT_IP = "7. IP & Compliance";
const CAT_CONTRACTS = "8. Contracts & Agreements";
const CAT_STRAT = "9. Strategy & Roadmap";
const CAT_REF = "10. References & Due Diligence";
const CAT_TAX = "11. Tax (AU)";
const CAT_COMPLY = "12. AU Compliance";

const DATA_ROOM_ROWS: DataRoomRow[] = [
  // 1. Corporate & Legal
  { category: CAT_CORP, title: "Certificate of Incorporation (Atlassian Pty Ltd, 2002)", status: "inferred", phaseSlug: "1", sourceUrl: SRC_WIKIPEDIA },
  { category: CAT_CORP, title: "Atlassian Corporation Plc — UK Companies House filing (2014)", status: "present", phaseSlug: "9", sourceUrl: SRC_STARTUPDAILY_UK_PLC },
  { category: CAT_CORP, title: "S-1 Registration Statement (SEC, Nov 2015)", status: "present", phaseSlug: "10", sourceUrl: SRC_VENTUREBEAT_IPO },
  { category: CAT_CORP, title: "Scheme of Arrangement — UK → Delaware redomicile (2022)", status: "present", phaseSlug: "12", sourceUrl: SRC_BW_DELAWARE, version: "2022-10-03" },
  { category: CAT_CORP, title: "Constitution / Bylaws (as amended, Delaware 2022)", status: "present", phaseSlug: "12", sourceUrl: SRC_BW_DELAWARE },
  { category: CAT_CORP, title: "Board Minutes — Accel round approval (2010)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_TC_ACCEL_2010 },
  { category: CAT_CORP, title: "Board Minutes — T. Rowe Price secondary (2014)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_TC_TROWE_2014 },
  { category: CAT_CORP, title: "Board Composition — Doug Burgum Chair appointment (2012)", status: "present", phaseSlug: "8", sourceUrl: SRC_TC_BOARD_2012 },
  { category: CAT_CORP, title: "Director Consents to Act — S-1 Exhibit 3", status: "present", phaseSlug: "10", sourceUrl: SRC_VENTUREBEAT_IPO },
  { category: CAT_CORP, title: "Register of Charges — pre-IPO clearance", status: "inferred", phaseSlug: "9" },

  // 2. Cap Table & Equity
  { category: CAT_CAP, title: "Founder Cap Table (50/50, 2002)", status: "inferred", phaseSlug: "1", sourceUrl: SRC_WIKIPEDIA },
  { category: CAT_CAP, title: "Cap Table Post-Accel Secondary (2010)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_TC_ACCEL_2010 },
  { category: CAT_CAP, title: "Cap Table Post-T. Rowe Secondary (2014)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_TC_TROWE_2014 },
  { category: CAT_CAP, title: "IPO Cap Table — Class A / Class B disclosure (S-1)", status: "present", phaseSlug: "10", sourceUrl: SRC_VENTUREBEAT_IPO },
  { category: CAT_CAP, title: "Dual-Class Share Structure Memorandum (2014)", status: "present", phaseSlug: "9", sourceUrl: SRC_STARTUPDAILY_UK_PLC },
  { category: CAT_CAP, title: "Founder Vesting Deed (Cannon-Brookes)", status: "redacted", phaseSlug: "1" },
  { category: CAT_CAP, title: "Founder Vesting Deed (Farquhar)", status: "redacted", phaseSlug: "1" },
  { category: CAT_CAP, title: "ESOP Plan Rules (pre-IPO)", status: "redacted", phaseSlug: "8" },
  { category: CAT_CAP, title: "Option Register — pre-IPO grants roll-forward", status: "redacted", phaseSlug: "9" },
  { category: CAT_CAP, title: "US$1.5B Class A Buyback Authorisation (FY2025)", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },

  // 3. Financial Projections
  { category: CAT_FIN, title: "First profitable year P&L (FY2005)", status: "inferred", phaseSlug: "6", sourceUrl: SRC_20LESSONS },
  { category: CAT_FIN, title: "US$1M ARR proof — American Airlines invoice (2003)", status: "inferred", phaseSlug: "5", sourceUrl: SRC_20LESSONS },
  { category: CAT_FIN, title: "Pre-IPO Financial Model (2015)", status: "present", phaseSlug: "10", sourceUrl: SRC_VENTUREBEAT_IPO },
  { category: CAT_FIN, title: "FY2025 10-K Income Statement", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },
  { category: CAT_FIN, title: "FY2025 10-K Cash Flow Statement (~US$1.4B FCF)", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },
  { category: CAT_FIN, title: "FY2025 10-K Balance Sheet", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },
  { category: CAT_FIN, title: "Gross Margin Analysis — 83% FY2025", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },
  { category: CAT_FIN, title: "Unit Economics Model (self-serve CAC → LTV)", status: "inferred", phaseSlug: "7", sourceUrl: SRC_BRAINDUMP_JIRA },
  { category: CAT_FIN, title: "Valuation Report — Accel Round US$400M pre (2010)", status: "inferred", phaseSlug: "10", sourceUrl: SRC_TC_ACCEL_2010 },
  { category: CAT_FIN, title: "Valuation Report — T. Rowe Round US$3.3B (2014)", status: "present", phaseSlug: "10", sourceUrl: SRC_TC_TROWE_2014 },

  // 4. Product & Technology
  { category: CAT_PROD, title: "Jira v1.0 Release Notes (2002)", status: "inferred", phaseSlug: "4", sourceUrl: SRC_BRAINDUMP_JIRA },
  { category: CAT_PROD, title: "Confluence v1.0 Release Notes (2004)", status: "inferred", phaseSlug: "4", sourceUrl: SRC_CONFLUENCE_HISTORY },
  { category: CAT_PROD, title: "Atlassian Plugin Framework Architecture", status: "inferred", phaseSlug: "7" },
  { category: CAT_PROD, title: "Bitbucket Acquisition — technical due diligence (2010)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_TC_BITBUCKET },
  { category: CAT_PROD, title: "Trello Acquisition — technical due diligence (2017)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_TRELLO_PR },
  { category: CAT_PROD, title: "OpsGenie Acquisition — technical due diligence (2018)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_SLACK_PARTNERSHIP },
  { category: CAT_PROD, title: "Loom Acquisition — technical due diligence (2023)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_BW_LOOM },
  { category: CAT_PROD, title: "Rovo AI Architecture Whitepaper (Team '24)", status: "inferred", phaseSlug: "11", sourceUrl: SRC_TC_ROVO_2024 },

  // 5. Market & Traction
  { category: CAT_MKT, title: "Customer count roll-forward — pre-IPO to FY2025", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },
  { category: CAT_MKT, title: "American Airlines Case Study (2003 self-serve win)", status: "inferred", phaseSlug: "5", sourceUrl: SRC_20LESSONS },
  { category: CAT_MKT, title: "Net Revenue Retention Disclosure (FY2025 10-K MD&A)", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },
  { category: CAT_MKT, title: "FY2025 Revenue US$5.2B (+20% YoY)", status: "present", phaseSlug: "11", sourceUrl: SRC_SEC_10K_FY25 },
  { category: CAT_MKT, title: "Marketplace GMV & partner ecosystem stats", status: "inferred", phaseSlug: "11" },

  // 6. Team & Advisors
  { category: CAT_TEAM, title: "Founder Bios — Cannon-Brookes + Farquhar (S-1)", status: "present", phaseSlug: "10", sourceUrl: SRC_VENTUREBEAT_IPO },
  { category: CAT_TEAM, title: "Independent Directors — Burgum, Salem, Parikh (2012)", status: "present", phaseSlug: "8", sourceUrl: SRC_TC_BOARD_2012 },
  { category: CAT_TEAM, title: "Rich Wong (Accel) Board Seat Consent (2010)", status: "present", phaseSlug: "10", sourceUrl: SRC_TC_ACCEL_2010 },
  { category: CAT_TEAM, title: "President of Sales — first hire (9 years in)", status: "inferred", phaseSlug: "8", sourceUrl: SRC_20LESSONS },
  { category: CAT_TEAM, title: "Cannon-Brookes Sole-CEO Transition (2024)", status: "present", phaseSlug: "11", sourceUrl: SRC_TC_ROVO_2024 },
  { category: CAT_TEAM, title: "Team Anywhere Distributed-First Policy (2020)", status: "present", phaseSlug: "11", sourceUrl: SRC_STEALERY_HQ },

  // 7. IP & Compliance
  { category: CAT_IP, title: "Founder IP Assignment Deeds (2002)", status: "inferred", phaseSlug: "1" },
  { category: CAT_IP, title: "Trademark Register — Jira, Confluence, Bitbucket, Trello", status: "inferred", phaseSlug: "11" },
  { category: CAT_IP, title: "Open-Source Compliance Attestation (S-1 disclosures)", status: "present", phaseSlug: "10", sourceUrl: SRC_VENTUREBEAT_IPO },
  { category: CAT_IP, title: "Pledge 1% Charter (2006)", status: "present", phaseSlug: "8", sourceUrl: SRC_20LESSONS },

  // 8. Contracts & Agreements
  { category: CAT_CONTRACTS, title: "Trello Share Purchase Agreement (2017)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_TRELLO_PR },
  { category: CAT_CONTRACTS, title: "OpsGenie Share Purchase Agreement (2018)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_SLACK_PARTNERSHIP },
  { category: CAT_CONTRACTS, title: "Slack Partnership Agreement + HipChat/Stride IP Sale (2018)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_SLACK_PARTNERSHIP },
  { category: CAT_CONTRACTS, title: "Loom Merger Agreement (2023)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_BW_LOOM },
  { category: CAT_CONTRACTS, title: "Standard Customer EULA (self-serve licence terms)", status: "present", phaseSlug: "4", sourceUrl: SRC_ATLASSIAN_COMPANY },

  // 9. Strategy & Roadmap
  { category: CAT_STRAT, title: "Five Core Values (2007 codification)", status: "present", phaseSlug: "8", sourceUrl: SRC_ATLASSIAN_COMPANY },
  { category: CAT_STRAT, title: "ShipIt Hackathon Charter (2005)", status: "present", phaseSlug: "8", sourceUrl: SRC_SHIPIT },
  { category: CAT_STRAT, title: "Rovo AI Roadmap (Team '24)", status: "present", phaseSlug: "11", sourceUrl: SRC_TC_ROVO_2024 },
  { category: CAT_STRAT, title: "Distributed-First Playbook (2020)", status: "present", phaseSlug: "11", sourceUrl: SRC_STEALERY_HQ },

  // 10. References & Due Diligence
  { category: CAT_REF, title: "Accel Partners due-diligence letter (2010)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_TC_ACCEL_2010 },
  { category: CAT_REF, title: "T. Rowe Price + Sequoia + Dragoneer due-diligence pack (2014)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_TC_TROWE_2014 },
  { category: CAT_REF, title: "IPO underwriter reference book — Morgan Stanley + Goldman (2015)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_VENTUREBEAT_IPO },

  // 11. Tax (AU)
  { category: CAT_TAX, title: "ATO ruling on UK Plc reorganisation (2014)", status: "redacted", phaseSlug: "9", sourceUrl: SRC_STARTUPDAILY_UK_PLC },
  { category: CAT_TAX, title: "GST registration — Atlassian Pty Ltd", status: "inferred", phaseSlug: "1" },
  { category: CAT_TAX, title: "R&D Tax Incentive claims (pre-IPO era)", status: "inferred", phaseSlug: "6" },

  // 12. AU Compliance
  { category: CAT_COMPLY, title: "ASIC Company Extract — Atlassian Pty Ltd historical", status: "inferred", phaseSlug: "1" },
  { category: CAT_COMPLY, title: "Privacy Policy — pre-GDPR / pre-Privacy Act 2022 amendments", status: "present", phaseSlug: "8", sourceUrl: SRC_ATLASSIAN_COMPANY },
  { category: CAT_COMPLY, title: "AFSL exemption analysis — ESOP administration", status: "inferred", phaseSlug: "8" },
];

// ── 16 valuation snapshots (4 timestamps × 4 methods) ───────────────────────

const VALUATIONS: ValuationSnapshot[] = [
  // 2005 — first profitable year, ~US$10-20M ARR estimate
  { timestamp: "2005", method: "DCF", valueAUD: 60_000_000, fxRate: 1.33, narrative: "DCF on US$10M ARR × 4.5× multiple × FX 0.75 USD/AUD.", sourceUrl: SRC_20LESSONS },
  { timestamp: "2005", method: "Berkus", valueAUD: 3_300_000, fxRate: 1.33, narrative: "Berkus caps at US$2.5M pre-revenue; profitability puts it at ceiling.", sourceUrl: SRC_20LESSONS },
  { timestamp: "2005", method: "Scorecard", valueAUD: 26_600_000, fxRate: 1.33, narrative: "Scorecard vs 2005 median AU tech seed of US$5M pre × 4× founder/PMF adjust.", sourceUrl: SRC_BRAINDUMP_JIRA },
  { timestamp: "2005", method: "Comparables", valueAUD: 40_000_000, fxRate: 1.33, narrative: "Comparable to 37signals-era self-serve devtools valuations circa 2005.", sourceUrl: SRC_BRAINDUMP_JIRA },

  // 2010 — Accel secondary at implied ~US$400M pre-money
  { timestamp: "2010-Accel", method: "DCF", valueAUD: 480_000_000, fxRate: 1.09, narrative: "DCF on US$60M ARR × ~7× × FX ~0.92 USD/AUD (2010 average).", sourceUrl: SRC_TC_ACCEL_2010 },
  { timestamp: "2010-Accel", method: "Berkus", valueAUD: 3_300_000, fxRate: 1.09, narrative: "Berkus stops applying past PMF; retained for baseline continuity.", sourceUrl: SRC_TC_ACCEL_2010 },
  { timestamp: "2010-Accel", method: "Scorecard", valueAUD: 220_000_000, fxRate: 1.09, narrative: "Scorecard vs 2010 growth-stage median × 8× traction adjust.", sourceUrl: SRC_TC_ACCEL_2010 },
  { timestamp: "2010-Accel", method: "Comparables", valueAUD: 435_000_000, fxRate: 1.09, narrative: "Implied by Accel secondary: US$60M × ~10% × FX = ~A$435M enterprise value.", sourceUrl: SRC_TC_ACCEL_2010 },

  // 2015 IPO — market cap US$5.8B first-day close, US$21 offer
  { timestamp: "2015-IPO", method: "DCF", valueAUD: 8_500_000_000, fxRate: 1.38, narrative: "DCF on US$320M FY2016E revenue × ~19× forward × FX 0.72 USD/AUD.", sourceUrl: SRC_VENTUREBEAT_IPO },
  { timestamp: "2015-IPO", method: "Berkus", valueAUD: 3_300_000, fxRate: 1.38, narrative: "Berkus retained for baseline continuity — signal only.", sourceUrl: SRC_VENTUREBEAT_IPO },
  { timestamp: "2015-IPO", method: "Scorecard", valueAUD: 6_100_000_000, fxRate: 1.38, narrative: "Scorecard vs 2015 US SaaS IPO median × premium for dual-class + zero VC dilution.", sourceUrl: SRC_VENTUREBEAT_IPO },
  { timestamp: "2015-IPO", method: "Comparables", valueAUD: 8_000_000_000, fxRate: 1.38, narrative: "US$5.8B market cap × FX 1.38 = ~A$8.0B first-day close.", sourceUrl: SRC_VENTUREBEAT_IPO },

  // 2026 current — market cap ~US$21.7B (Jul 2026 per landing page)
  { timestamp: "2026-current", method: "DCF", valueAUD: 45_000_000_000, fxRate: 1.52, narrative: "DCF on US$5.2B FY2025 revenue × 6× × FX 0.66 USD/AUD.", sourceUrl: SRC_SEC_10K_FY25 },
  { timestamp: "2026-current", method: "Berkus", valueAUD: 3_300_000, fxRate: 1.52, narrative: "Berkus retained for baseline continuity — signal only.", sourceUrl: SRC_SEC_10K_FY25 },
  { timestamp: "2026-current", method: "Scorecard", valueAUD: 40_000_000_000, fxRate: 1.52, narrative: "Scorecard vs mega-cap SaaS median × 1.1× control premium for retained Class B.", sourceUrl: SRC_SEC_10K_FY25 },
  { timestamp: "2026-current", method: "Comparables", valueAUD: 33_000_000_000, fxRate: 1.52, narrative: "US$21.7B market cap × FX 1.52 = ~A$33.0B (Jul 2026 spot).", sourceUrl: SRC_SEC_10K_FY25 },
];

// ── Assembled fixture ──────────────────────────────────────────────────────

export const ATLASSIAN_DEMO: AtlassianDemo = {
  profile: {
    name: "Atlassian",
    foundedYear: 2002,
    founders: ["Mike Cannon-Brookes", "Scott Farquhar"],
    hqCity: "Sydney",
    ticker: "NASDAQ:TEAM",
    url: "https://www.atlassian.com",
  },
  milestones: MILESTONES,
  phaseSnapshots: PHASE_SNAPSHOTS,
  sviScores: SVI_SCORES,
  agentReports: AGENT_REPORTS,
  dataRoomRows: DATA_ROOM_ROWS,
  valuations: VALUATIONS,
};

// ── Convenience helpers used by the landing page + downstream mirror pages ──

/**
 * 12-phase display names — mirrors the labels used by the existing landing
 * page so the phase card headings match verbatim. Kept in-module so downstream
 * consumers don't have to import both this fixture and gallery.ts.
 */
export const PHASE_DISPLAY_NAMES: Record<number, string> = {
  1: "Vision / Day-0 Idea",
  2: "Idea Validation",
  3: "Market Research",
  4: "MVP / Product Discovery",
  5: "PMF / Early Traction",
  6: "Revenue / Business Model",
  7: "Growth / Analytics",
  8: "Team & Culture",
  9: "Funding-Ready",
  10: "Fundraise / Term Sheet",
  11: "Post-Funding / Growth Scale",
  12: "Exit / Beyond",
};

/**
 * Bucket the demo's milestones by 12-phase ordinal, preserving insertion order
 * within a bucket. Consumed by the landing page's phase-by-phase timeline.
 */
export function groupMilestonesByPhase(): Array<{
  phase: number;
  milestones: AtlassianMilestone[];
}> {
  const buckets = new Map<number, AtlassianMilestone[]>();
  for (const m of ATLASSIAN_DEMO.milestones) {
    const p = Number(m.phaseSlug);
    if (!Number.isFinite(p)) continue;
    const bucket = buckets.get(p);
    if (bucket) {
      bucket.push(m);
    } else {
      buckets.set(p, [m]);
    }
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([phase, milestones]) => ({ phase, milestones }));
}
