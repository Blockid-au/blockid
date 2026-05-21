/**
 * BlockID.au — 1-Minute Pitch Video V2 Script (Updated May 2026)
 * Duration: 60 seconds @ 30fps = 1800 frames
 *
 * Updated content: vesting, equity setup wizard, blockchain sync,
 * AI recommendations, cap table, ESOP, dividends, 11 C-level AI agents
 *
 * Voice: en-AU-WilliamMultilingualNeural (Australian male, natural pace)
 * Design: Big logo first screen, infographics, charts, flow diagrams, synced subtitles
 */

export interface ScriptLineV2 {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  subtitle: string;        // shorter text for on-screen subtitle
  visual: string;           // design direction
  emotion: "neutral" | "urgent" | "inspiring" | "excited" | "dramatic";
}

export const PITCH_1MIN_V2: ScriptLineV2[] = [
  // ─────────────────────────────────────────────
  // SCENE 1: BIG LOGO REVEAL (0-4s)
  // ─────────────────────────────────────────────
  {
    id: "01-logo",
    startSec: 0,
    endSec: 4,
    text: "",
    subtitle: "",
    visual: "LARGE BlockID.au logo (400px icon + 96px text). Blue glow pulse. Tagline: 'AI-Powered Startup Valuation & Equity Platform'. Dark background #0B1220. Whoosh + chime sound.",
    emotion: "neutral",
  },

  // ─────────────────────────────────────────────
  // SCENE 2: PROBLEM — INFOGRAPHIC (4-10s)
  // ─────────────────────────────────────────────
  {
    id: "02-problem",
    startSec: 4,
    endSec: 10,
    text: "Ninety percent of startups fail. In Australia, three hundred and seventy thousand businesses closed last year. The number one reason? They had no idea what they were worth.",
    subtitle: "90% of startups fail. 370,000 AU businesses closed. #1 reason: unknown value.",
    visual: "Infographic: Large '90%' counter in red, Australian map with declining bar chart overlay, cash icon crumbling. ABS June 2025 citation.",
    emotion: "urgent",
  },

  // ─────────────────────────────────────────────
  // SCENE 3: THE GAP (10-15s)
  // ─────────────────────────────────────────────
  {
    id: "03-gap",
    startSec: 10,
    endSec: 15,
    text: "Manual valuation costs five to fifty thousand dollars. Cap table tools start at ninety-nine a month. And none of them tell you what your startup is actually worth.",
    subtitle: "Valuation: A$5K-50K. Cap table: $99/mo. None tell you what you're worth.",
    visual: "3-column comparison infographic: Consultants ($5K-50K, 6 weeks), Carta/Pulley ($99-999/mo, US-only), BlockID ($1, 60 seconds). Red X on first two, green check on BlockID.",
    emotion: "urgent",
  },

  // ─────────────────────────────────────────────
  // SCENE 4: SOLUTION INTRO (15-19s)
  // ─────────────────────────────────────────────
  {
    id: "04-solution",
    startSec: 15,
    endSec: 19,
    text: "BlockID changes this. AI-powered startup valuation in sixty seconds. From one dollar.",
    subtitle: "BlockID: AI valuation in 60 seconds. From A$1.",
    visual: "BlockID brand blue wash. Logo center. Price badge 'A$1' with sparkle. Transition to browser window.",
    emotion: "excited",
  },

  // ─────────────────────────────────────────────
  // SCENE 5: LIVE DEMO — SVI SCORING (19-28s)
  // ─────────────────────────────────────────────
  {
    id: "05-demo-svi",
    startSec: 19,
    endSec: 28,
    text: "Describe your startup, and our AI analyses eight dimensions. Market, team, product, traction, governance, investor readiness, legal, and strategic vision. A full ten-page report in under a minute.",
    subtitle: "8 dimensions analysed. 10-page report. Under 60 seconds.",
    visual: "ScreenDemo: Homepage search → typing → SVI results page with gauge at 142. Then: 8-dimension radar chart infographic (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM) with scores. Quick flash of 10-page report scroll.",
    emotion: "inspiring",
  },

  // ─────────────────────────────────────────────
  // SCENE 6: EQUITY & VESTING (28-37s)
  // ─────────────────────────────────────────────
  {
    id: "06-equity",
    startSec: 28,
    endSec: 37,
    text: "But we don't stop at scoring. Set up your entire equity structure with our wizard. AI suggests the optimal split. Configure vesting schedules with cliff periods. Manage your ESOP pool. All linked to your cap table and growing valuation.",
    subtitle: "Equity wizard → AI split → Vesting → ESOP → Cap table. All connected.",
    visual: "6-step wizard flow infographic: (1) Founder 100% → (2) Add team → (3) AI suggests split (pie chart animates) → (4) Vesting timeline bar (cliff + linear) → (5) ESOP pool slider → (6) Cap table screenshot. Each step lights up sequentially.",
    emotion: "excited",
  },

  // ─────────────────────────────────────────────
  // SCENE 7: BLOCKCHAIN & LIFECYCLE (37-44s)
  // ─────────────────────────────────────────────
  {
    id: "07-blockchain",
    startSec: 37,
    endSec: 44,
    text: "Tokenize your equity on our private blockchain. Sync vesting on-chain. Distribute dividends. Transfer shares. All transparent, all verifiable. From idea to exit, one platform.",
    subtitle: "Blockchain equity tokens. On-chain vesting. Dividends. Idea → Exit.",
    visual: "FlowDiagram: Idea 💡 → Validate 📊 → Equity ⚖️ → Tokenize ⛓️ → Fundraise 💰 → Dividend 🎁 → Exit 🏆. Below: MetaMask wallet icon + 'AUS' token badge + blockchain sync toggle animation.",
    emotion: "inspiring",
  },

  // ─────────────────────────────────────────────
  // SCENE 8: TRACTION & TEAM (44-51s)
  // ─────────────────────────────────────────────
  {
    id: "08-traction",
    startSec: 44,
    endSec: 51,
    text: "BlockID is live today. Fifty-plus founders on the platform. Two hundred analyses completed. Fifteen free tools. Built by one technical founder with eleven AI agents operating as the entire C-suite.",
    subtitle: "50+ founders. 200+ analyses. 15 free tools. 1 founder + 11 AI agents.",
    visual: "MetricsGrid: 4 animated counters (50+ Founders, 200+ Analyses, 15 Tools, 11 AI Agents). Below: Mini org chart — CEO center, 11 agent icons around (CTO, CFO, CMO, CPO, COO, CRO, CHRO, CLO, CISO, CDO, CBO).",
    emotion: "exciting",
  },

  // ─────────────────────────────────────────────
  // SCENE 9: MARKET (51-55s)
  // ─────────────────────────────────────────────
  {
    id: "09-market",
    startSec: 51,
    endSec: 55,
    text: "A four-point-four trillion dollar global startup ecosystem. And not one AI-native valuation platform built for Australia.",
    subtitle: "A$4.4T market. Zero AI-native platforms for Australia.",
    visual: "TAMCircles: TAM $4.4T (outer), SAM $3.2B (middle), SOM $250K Y1 (inner). Stat badge: '2,600 active AU startups' + 'Zero AI valuation platforms' in red.",
    emotion: "inspiring",
  },

  // ─────────────────────────────────────────────
  // SCENE 10: DROP MIC (55-58s)
  // ─────────────────────────────────────────────
  {
    id: "10-dropmic",
    startSec: 55,
    endSec: 58,
    text: "AI builds products. BlockID builds businesses.",
    subtitle: "AI builds products. BlockID builds businesses.",
    visual: "Black screen. Line 1 appears white 48px. Pause. Line 2 appears brand-blue 72px bold. Subtle glow behind 'BlockID'.",
    emotion: "dramatic",
  },

  // ─────────────────────────────────────────────
  // SCENE 11: CTA (58-60s)
  // ─────────────────────────────────────────────
  {
    id: "11-cta",
    startSec: 58,
    endSec: 60,
    text: "Try free at blockid dot ay you.",
    subtitle: "Try free: blockid.au",
    visual: "Large BlockID.au logo. QR code. 'Do Van Long — CEO & Founder'. 'Try free: blockid.au' CTA button in brand blue. Auschain Pty Ltd.",
    emotion: "neutral",
  },
];

export const PITCH_1MIN_V2_WORD_COUNT = PITCH_1MIN_V2.reduce(
  (sum, line) => sum + line.text.split(/\s+/).filter(Boolean).length,
  0,
);
