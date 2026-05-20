/**
 * BlockID.au — 3-Minute Full Platform Demo Video Script
 * Target: Spacubed Fellowship + Google for Startups (supplementary)
 * Duration: 180 seconds @ 30fps
 *
 * Voice: Professional Australian English, male, startup founder tone
 * Model: ElevenLabs multilingual_v2
 */

import type { ScriptLine } from "./pitch-1min";
import { generateSRT, generateVTT, getCitations } from "./pitch-1min";

export { generateSRT, generateVTT, getCitations };

export const PITCH_3MIN: ScriptLine[] = [
  // ═════════════════════════════════════════════
  // SECTION 1: OPENING — THE CRISIS (0-15s)
  // Tone: urgent, serious, data-driven
  // ═════════════════════════════════════════════
  {
    startTime: 0,
    endTime: 3,
    text: "",
    visual:
      "Black screen. Silence for 0.5s. Then BlockID.au logo reveal: icon fades in with blue glow, text scales up with spring animation. Sound: low dramatic rumble + chime.",
    emotion: "neutral",
  },
  {
    startTime: 3,
    endTime: 5,
    text: "Ninety percent of startups fail.",
    visual:
      "Dark background (#0B1220). White text appears one line at a time, typewriter effect. '90%' in large red (#F87171). Subtle particle effect in background.",
    source: "Failory 2026",
    emotion: "urgent",
  },
  {
    startTime: 5,
    endTime: 8,
    text: "Three hundred and seventy thousand Australian businesses closed last year.",
    visual:
      "Second line appears: '370,000 businesses closed' with counter animation. Small citation: ABS June 2025. Australian map outline fades in behind with dots disappearing.",
    source: "ABS June 2025",
    emotion: "urgent",
  },
  {
    startTime: 8,
    endTime: 11,
    text: "Ninety-seven billion dollars poured into AI startups. Ninety percent still fail.",
    visual:
      "Third line: '$97B in AI funding' in gold (#FBBF24). Fourth line: '90% still fail' in red. Money counter animation. AI chip graphic pulses.",
    source: "Second Talent 2024, Stanford HAI 2025",
    emotion: "urgent",
  },
  {
    startTime: 11,
    endTime: 15,
    text: "The gap: AI builds products. Nothing builds businesses.",
    visual:
      "All previous lines fade. Single bold line center screen: 'AI builds products. Nothing builds businesses.' White on black. 1-second pause after text appears. Transition: slow zoom into text.",
    emotion: "urgent",
  },

  // ═════════════════════════════════════════════
  // SECTION 2: FOUNDER INTRO — THE STORY (15-30s)
  // Tone: personal, warm, authentic
  // ═════════════════════════════════════════════
  {
    startTime: 15,
    endTime: 18,
    text: "I'm Do Van Long, founder of BlockID.",
    visual:
      "Transition to BlockID homepage screenshot or founder photo. Lower third appears: 'Do Van Long | Founder & CEO | Auschain Pty Ltd'. Brand blue accent bar.",
    emotion: "neutral",
  },
  {
    startTime: 18,
    endTime: 23,
    text: "I've watched founders build incredible AI products, then struggle to value them, split equity fairly, or get investor-ready.",
    visual:
      "Montage of startup scenes: whiteboard sessions, pitch rehearsals, laptop coding. Subtle overlay of frustration: crossed-out spreadsheets, question marks over valuation numbers.",
    emotion: "inspiring",
  },
  {
    startTime: 23,
    endTime: 27,
    text: "Everyone talks about building with AI. Nobody talks about building the business around it.",
    visual:
      "Split screen: Left — AI tools (ChatGPT, Cursor, Copilot logos). Right — empty space with question marks. Text appears: 'The missing piece'. Arrow points to BlockID logo filling the gap.",
    emotion: "inspiring",
  },
  {
    startTime: 27,
    endTime: 30,
    text: "That's why I built BlockID. The platform that values startups from Day Zero.",
    visual:
      "BlockID logo animates to center. Tagline appears below: 'Where AI meets startup valuation'. Subtle glow effect. Transition wipe to next section.",
    emotion: "inspiring",
  },

  // ═════════════════════════════════════════════
  // SECTION 3: THE 3 PROBLEMS (30-50s)
  // Tone: empathetic, building tension
  // ═════════════════════════════════════════════
  {
    startTime: 30,
    endTime: 33,
    text: "Every founder faces three impossible questions.",
    visual:
      "Dark background. Three card outlines appear, empty, arranged horizontally. Subtle pulse animation. Number '3' appears large then dissolves into the cards.",
    emotion: "urgent",
  },
  {
    startTime: 33,
    endTime: 38,
    text: "First: How much is my startup worth? Manual valuation costs five to fifty thousand dollars and takes two to six weeks.",
    visual:
      "Card 1 flips and fills: 'How much is my idea worth?' with question mark icon. Below: animated price range A$5,000 to A$50,000 in red. Calendar showing '2-6 weeks'. Then: BlockID solution appears: 'AI valuation in 60 seconds, from A$1' in green (#10B981).",
    source: "Industry average",
    emotion: "urgent",
  },
  {
    startTime: 38,
    endTime: 43,
    text: "Second: How do I split equity? Forty-two percent of co-founder disputes destroy startups before they even launch.",
    visual:
      "Card 2 flips: 'How do I split equity?' with pie chart icon. Stat: '42% of co-founder disputes destroy startups' with citation. Pie chart splits unevenly, cracks appear. Then: BlockID solution: 'Fair equity calculator based on real contributions' in green.",
    source: "Noam Wasserman, Harvard",
    emotion: "urgent",
  },
  {
    startTime: 43,
    endTime: 48,
    text: "Third: How do I get investor-ready? The average data room takes three to six weeks to prepare. Most founders never finish.",
    visual:
      "Card 3 flips: 'How do I get investor-ready?' with folder icon. Calendar animation: '3-6 weeks' of prep. Stack of documents growing. Then: BlockID solution: 'Evidence vault + auto-scored readiness' in green.",
    source: "Industry average",
    emotion: "urgent",
  },
  {
    startTime: 48,
    endTime: 50,
    text: "BlockID solves all three. Let me show you.",
    visual:
      "All three cards glow brand blue and shrink. BlockID logo pulses at center. Transition: cards fly toward screen, revealing browser window with blockid.au.",
    emotion: "excited",
  },

  // ═════════════════════════════════════════════
  // SECTION 4: SOLUTION DEMO — SVI ANALYSIS (50-80s)
  // Tone: excited, energetic, "watch this"
  // ═════════════════════════════════════════════
  {
    startTime: 50,
    endTime: 53,
    text: "Here's BlockID in action.",
    visual:
      "LIVE RECORDING: blockid.au homepage loads. Hero section: 'The agentic AI valuation platform'. Clean UI, dark theme. Cursor moves naturally.",
    emotion: "excited",
  },
  {
    startTime: 53,
    endTime: 56,
    text: "You describe your startup idea in plain English.",
    visual:
      "LIVE RECORDING: Cursor moves to search bar with glowing blue border. Typing begins: 'An AI-powered recruitment platform for Australian SMEs using natural language processing to match candidates'. Characters appear with natural typing speed.",
    emotion: "excited",
  },
  {
    startTime: 56,
    endTime: 58,
    text: "BlockID detects your input type automatically.",
    visual:
      "LIVE RECORDING: Input badge appears below text: 'Idea Analysis' in blue tag. Brief highlight glow on the badge.",
    emotion: "excited",
  },
  {
    startTime: 58,
    endTime: 60,
    text: "Enter your email and hit 'Get My SVI'.",
    visual:
      "LIVE RECORDING: Email field filled. Cursor clicks the 'Get My SVI' button. Button depresses with animation. Loading state begins.",
    emotion: "excited",
  },
  {
    startTime: 60,
    endTime: 63,
    text: "Now watch. Our AI agents go to work.",
    visual:
      "LIVE RECORDING: SSE status bar appears at top of page. First message: 'Analyzing your input...' with spinner. Callout arrow annotation pointing to status bar.",
    emotion: "excited",
  },
  {
    startTime: 63,
    endTime: 66,
    text: "Researching your market. Scanning competitors. Evaluating your business model.",
    visual:
      "LIVE RECORDING: SSE messages cycle: 'Researching market size...' then 'Scanning competitors...' then 'Evaluating business model...' Each with different icon. Progress bar fills.",
    emotion: "excited",
  },
  {
    startTime: 66,
    endTime: 68,
    text: "Generating your report.",
    visual:
      "LIVE RECORDING: Final SSE message: 'Generating report...' Progress bar reaches 100%. Brief loading shimmer.",
    emotion: "excited",
  },
  {
    startTime: 68,
    endTime: 72,
    text: "And there it is. Your Startup Viability Index. A comprehensive AI-powered valuation.",
    visual:
      "LIVE RECORDING: Report page loads with animation. SVI Score gauge fills to 138 with satisfying animation. Score appears in large text. Callout: 'SVI Score: 138' with highlight ring.",
    emotion: "excited",
  },
  {
    startTime: 72,
    endTime: 76,
    text: "Ten-page AI analysis. Market research. Competitor analysis. Business model evaluation. Actionable recommendations.",
    visual:
      "LIVE RECORDING: Smooth scroll through report sections: Executive Summary heading, Market & Problem section, Product & Solution section, Competitor Analysis table, Recommendations list. Each section briefly highlighted.",
    emotion: "excited",
  },
  {
    startTime: 76,
    endTime: 80,
    text: "All in under a minute. What used to cost thousands and take weeks.",
    visual:
      "Split comparison overlay: Left panel 'Before BlockID: $5,000-$50,000 | 2-6 weeks' in red. Right panel 'With BlockID: From $1 | Under 60 seconds' in green. Checkmark animation on right.",
    emotion: "excited",
  },

  // ═════════════════════════════════════════════
  // SECTION 5: ACTIONABLE REPORT (80-100s)
  // Tone: still excited, showing depth
  // ═════════════════════════════════════════════
  {
    startTime: 80,
    endTime: 84,
    text: "But here's what makes BlockID different. Every recommendation is actionable.",
    visual:
      "LIVE RECORDING: Zoom into recommendations section of report. Each recommendation has a blue action button next to it: 'Build your cap table ->', 'Upload pitch deck ->', 'Connect revenue ->'. Callout arrows highlight buttons.",
    emotion: "excited",
  },
  {
    startTime: 84,
    endTime: 87,
    text: "Click 'Build your cap table' and the tool opens right there.",
    visual:
      "LIVE RECORDING: Cursor clicks 'Build your cap table ->' button. Smooth transition to Cap Table tool page. Tool loads with equity split interface.",
    emotion: "excited",
  },
  {
    startTime: 87,
    endTime: 91,
    text: "Split equity between founders. Founder sixty percent, co-founder thirty, employee pool ten.",
    visual:
      "LIVE RECORDING: Cap table interface. Inputs filled: Founder 60%, Co-founder 30%, ESOP 10%. Animated pie chart updates in real-time as values change. Color-coded slices.",
    emotion: "excited",
  },
  {
    startTime: 91,
    endTime: 95,
    text: "Complete the action and your score automatically increases.",
    visual:
      "LIVE RECORDING: Navigate back to SVI report. Score delta animation: 'SVI 138 -> 146' with green up arrow and '+8' badge. Score gauge animates from 138 to 146. Celebration micro-animation.",
    emotion: "excited",
  },
  {
    startTime: 95,
    endTime: 100,
    text: "Upload evidence. Pitch decks, revenue proof, GitHub repos. Each piece of verified evidence lifts your score.",
    visual:
      "LIVE RECORDING: Navigate to Evidence Vault. File upload interface. Drag 'pitch-deck.pdf' into upload zone. Upload progress bar. Toast notification: 'SVI +5 points -> New score: 151'. Badge earned animation: 'Pitch Ready' with sparkle effect.",
    emotion: "excited",
  },

  // ═════════════════════════════════════════════
  // SECTION 6: EVIDENCE & GROWTH (100-115s)
  // Tone: building confidence
  // ═════════════════════════════════════════════
  {
    startTime: 100,
    endTime: 105,
    text: "Connect Stripe for revenue tracking. Connect GitHub for code activity. Your startup's value grows with you, automatically.",
    visual:
      "Integration icons appear: Stripe logo, GitHub logo, Google Analytics logo. Connection lines animate from each to BlockID. Dashboard shows live data flowing in. SVI trend chart ticking upward.",
    emotion: "inspiring",
  },
  {
    startTime: 105,
    endTime: 109,
    text: "Your Living Report updates in real time. A dynamic dashboard that evolves as your startup evolves.",
    visual:
      "LIVE RECORDING: Dashboard view. Living Report card with SVI trend chart showing upward trajectory over weeks. Multiple milestone badges on a shelf: 'Idea Validated', 'Pitch Ready', 'Cap Table Set', 'Revenue Tracked'. Badge count: 4 earned.",
    emotion: "inspiring",
  },
  {
    startTime: 109,
    endTime: 115,
    text: "Earn milestone badges as you hit key startup milestones. Each one proves progress to investors.",
    visual:
      "Badge shelf zooms in. Each badge has name and description tooltip. Badges arranged in progression: early stage to growth stage. Investor view preview: 'Investor Dashboard' showing verified badges and score history.",
    emotion: "inspiring",
  },

  // ═════════════════════════════════════════════
  // SECTION 7: THE BIGGER VISION — ROADMAP (115-135s)
  // Tone: visionary, grand, inspiring
  // ═════════════════════════════════════════════
  {
    startTime: 115,
    endTime: 117,
    text: "But we're just getting started.",
    visual:
      "Screen transitions to dark background with subtle star field. Text fades in: 'The Vision'. Dramatic pause.",
    emotion: "inspiring",
  },
  {
    startTime: 117,
    endTime: 120,
    text: "Phase One: AI Analysis. Live now. Proven. Working.",
    visual:
      "Animated roadmap timeline begins. Phase 1 node lights up green with checkmark: 'AI Analysis'. 'LIVE NOW' badge. Screenshots of working product flash behind.",
    emotion: "inspiring",
  },
  {
    startTime: 120,
    endTime: 122,
    text: "Phase Two: Evidence and Validation. Building your proof layer.",
    visual:
      "Phase 2 node lights up with lightning bolt icon: 'Evidence & Validation'. Evidence vault icon. Connection to Phase 1 with animated line.",
    emotion: "inspiring",
  },
  {
    startTime: 122,
    endTime: 124,
    text: "Phase Three: Dollar Valuation Engine. Real numbers, real confidence.",
    visual:
      "Phase 3 node lights up: 'Dollar Valuation Engine'. Dollar sign with AI brain icon. Valuation range graphic: '$500K - $2M'.",
    emotion: "inspiring",
  },
  {
    startTime: 124,
    endTime: 126,
    text: "Phase Four: Full Cap Table Management.",
    visual:
      "Phase 4 node lights up: 'Full Cap Table Management'. Org chart icon. Equity pie chart animation.",
    emotion: "inspiring",
  },
  {
    startTime: 126,
    endTime: 128,
    text: "Phase Five: Blockchain Tokenization on Cosmos.",
    visual:
      "Phase 5 node lights up with blockchain icon: 'Blockchain Tokenization'. Cosmos logo. Token animation: equity shares become digital tokens.",
    emotion: "inspiring",
  },
  {
    startTime: 128,
    endTime: 130,
    text: "Phase Six: Investor Matching and Fundraising.",
    visual:
      "Phase 6 node lights up: 'Investor Matching & Fundraise'. Handshake icon. Matching animation: founder profile connects to investor profile.",
    emotion: "inspiring",
  },
  {
    startTime: 130,
    endTime: 132,
    text: "Phase Seven: Revenue Tracking and Automatic Dividends.",
    visual:
      "Phase 7 node lights up: 'Revenue Tracking & Dividends'. Chart icon with dollar signs flowing to stakeholders automatically.",
    emotion: "inspiring",
  },
  {
    startTime: 132,
    endTime: 135,
    text: "Phase Eight: Growth Journal and Exit Preparation. Equity tokenized on blockchain. Automatic dividends. From idea to IPO, one platform.",
    visual:
      "Phase 8 node lights up: 'Growth Journal & Exit Prep'. Full roadmap zooms out showing all 8 phases connected. Golden line connects Phase 1 to Phase 8. Text overlay: 'From idea to IPO — one platform.' All nodes pulse together.",
    emotion: "inspiring",
  },

  // ═════════════════════════════════════════════
  // SECTION 8: MARKET & BUSINESS MODEL (135-155s)
  // Tone: confident, factual, authoritative
  // ═════════════════════════════════════════════
  {
    startTime: 135,
    endTime: 138,
    text: "The opportunity is massive.",
    visual:
      "Transition to data visualization. Dark background. 'The Market' appears as section header. Globe graphic with startup ecosystem dots.",
    emotion: "inspiring",
  },
  {
    startTime: 138,
    endTime: 142,
    text: "A four-point-four trillion dollar global startup ecosystem. A three-point-two billion dollar cap table and valuation tools market.",
    visual:
      "Animated TAM/SAM/SOM concentric circles. TAM outer ring expands: 'A$4.4T — Global Startup Ecosystem' in light blue. SAM middle ring: 'A$3.2B — Cap Table + Valuation Tools' in medium blue. Numbers count up with animation.",
    source: "Industry research 2025",
    emotion: "inspiring",
  },
  {
    startTime: 142,
    endTime: 146,
    text: "Twenty-six hundred active Australian startups. Three hundred accelerators. Fifteen thousand angel investors.",
    visual:
      "SOM inner circle: 'A$250K Year 1 — 500 AU Startups x A$500'. Australian map with dots representing startups, accelerators, angels. Counter: '2,600 startups' | '300+ accelerators' | '15,000 angels'.",
    source: "Startup Genome, ABS 2025",
    emotion: "inspiring",
  },
  {
    startTime: 146,
    endTime: 149,
    text: "And not one AI-native valuation platform built for Australia.",
    visual:
      "Text punch appears center screen: 'Not one AI-native valuation platform built for Australia.' Red emphasis on 'Not one'. Pause beat. BlockID logo appears below: 'Until now.'",
    emotion: "inspiring",
  },
  {
    startTime: 149,
    endTime: 155,
    text: "Start free. Your first analysis is on us. One dollar per report during early bird. Forty-nine dollars for the Founder plan: a hundred credits, lifetime access. Ninety-nine dollars per month for Growth: two hundred credits, everything included.",
    visual:
      "Pricing cards animate in from bottom, one at a time: 'Free — First Analysis' (green badge) | 'A$1/report — Early Bird' (blue badge) | 'A$49 — Founder Plan: 100 credits, lifetime' (gold badge) | 'A$99/mo — Growth: 200 credits/month' (brand blue badge). Each card has a subtle glow on appear.",
    emotion: "inspiring",
  },

  // ═════════════════════════════════════════════
  // SECTION 9: TEAM & COMPETITIVE ADVANTAGE (155-170s)
  // Tone: proud, strong, confident
  // ═════════════════════════════════════════════
  {
    startTime: 155,
    endTime: 158,
    text: "We're not just another SaaS tool. We're an AI-first company.",
    visual:
      "Transition to org chart section. Header: 'The Team'. Dark background with node layout preparing to populate.",
    emotion: "inspiring",
  },
  {
    startTime: 158,
    endTime: 162,
    text: "One founder supported by nine AI agent C-levels and twenty-three specialized skills. Shipping daily.",
    visual:
      "Org chart animates: Founder & CEO node at top (Do Van Long, photo or avatar). Nine C-level nodes branch below: CTO, CPO, CMO, CFO, COO, CRO, IR, Media, Blockchain. Each node has AI chip icon. '23 specialized skills' counter. 'Ships daily' badge.",
    emotion: "inspiring",
  },
  {
    startTime: 162,
    endTime: 165,
    text: "Built for Australian compliance from day one.",
    visual:
      "Compliance badges appear: Australian flag + 'AU-Native'. List: 'ASIC Registration' checkmark, 'ESIC Tax Incentives' checkmark, 'R&D Tax Offset' checkmark, 'AU Data Residency' checkmark. Company details: 'Auschain Pty Ltd (ACN 659 615 111) | Sydney, NSW'.",
    emotion: "inspiring",
  },
  {
    startTime: 165,
    endTime: 170,
    text: "Carta is US-centric. Pulley starts at fundraise. Qapita covers Asia. BlockID starts at Day Zero. Before you've even incorporated.",
    visual:
      "Competition comparison matrix animates row by row. Headers: Feature | Carta | Pulley | Qapita | BlockID. Rows: AI Valuation (all X except BlockID checkmark), AU-Native (all X except BlockID), Day 0 to Exit (all X except BlockID), From A$1 (all X except BlockID), Blockchain Equity (all X, BlockID 'planned'). BlockID column highlighted in brand blue. Checkmarks glow green.",
    emotion: "inspiring",
  },

  // ═════════════════════════════════════════════
  // SECTION 10: DROP MIC MOMENT (170-178s)
  // Tone: slow, dramatic, powerful — 30% slower pace
  // ═════════════════════════════════════════════
  {
    startTime: 170,
    endTime: 172,
    text: "",
    visual:
      "Screen fades to pure black. 2-second silence. No music. No animation. Just black.",
    emotion: "dramatic",
  },
  {
    startTime: 172,
    endTime: 174,
    text: "Two hundred and fifty-two billion dollars invested in AI last year.",
    visual:
      "White text fades in, center screen, large (80px): '$252 billion invested in AI last year.' Pause after fully visible.",
    source: "Stanford HAI 2025",
    emotion: "dramatic",
  },
  {
    startTime: 174,
    endTime: 175.5,
    text: "Ninety percent of those startups will fail.",
    visual:
      "Previous text fades. New line: '90% of those startups will fail.' in slightly smaller text. Red tint on '90%'. 1-second hold.",
    emotion: "dramatic",
  },
  {
    startTime: 175.5,
    endTime: 176.5,
    text: "Not because of bad ideas.",
    visual:
      "New line replaces: 'Not because of bad ideas.' White text. Pause.",
    emotion: "dramatic",
  },
  {
    startTime: 176.5,
    endTime: 177.5,
    text: "Because nobody helped them prove their value.",
    visual:
      "New line: 'Because nobody helped them prove their value.' Slightly smaller. Emotional weight. 1-second hold.",
    emotion: "dramatic",
  },
  {
    startTime: 177.5,
    endTime: 178,
    text: "",
    visual: "Complete black. 0.5-second silence. Anticipation build.",
    emotion: "dramatic",
  },
  {
    startTime: 178,
    endTime: 180,
    text: "Until now.",
    visual:
      "Bold text in brand blue (#3B7DD8), large (120px), center screen: 'Until now.' Glow effect radiates outward. BlockID logo fades in below. 2-second dramatic hold. Subtle orchestral swell in audio.",
    emotion: "dramatic",
  },

  // ═════════════════════════════════════════════
  // SECTION 11: CTA + CONTACT (180-185s)
  // Tone: warm, inviting, encouraging
  // Note: 5 extra seconds for end card visibility
  // ═════════════════════════════════════════════
  {
    startTime: 180,
    endTime: 183,
    text: "BlockID dot au. Where AI meets startup valuation.",
    visual:
      "Smooth transition from black. BlockID.au logo (large, center) with gentle glow. Below: 'blockid.au' in white (48px). Tagline: 'Where AI meets startup valuation' in slate (#94A3B8).",
    emotion: "neutral",
  },
  {
    startTime: 183,
    endTime: 185,
    text: "First analysis free. Start today.",
    visual:
      "Divider line appears. Below: 'Do Van Long' | 'Founder & CEO, Auschain Pty Ltd'. QR Code animates in (links to linkedin.com/in/dovanlong). Bottom CTA: 'First analysis free. Start today.' in brand blue. 'blockid.au' URL prominent. End card holds for remaining time.",
    emotion: "neutral",
  },
];

/**
 * Total word count for pacing validation.
 * Target: 140-160 WPM for 180-second video (~420-480 words).
 */
export const PITCH_3MIN_WORD_COUNT = PITCH_3MIN.reduce(
  (sum, line) => sum + line.text.split(/\s+/).filter(Boolean).length,
  0,
);

/**
 * Section markers for the 3-minute video.
 * Useful for Remotion composition scene management.
 */
export const SECTIONS = [
  { name: "Opening — The Crisis", startTime: 0, endTime: 15 },
  { name: "Founder — The Story", startTime: 15, endTime: 30 },
  { name: "3 Problems — The Pain", startTime: 30, endTime: 50 },
  { name: "Solution Demo — SVI Analysis", startTime: 50, endTime: 80 },
  { name: "Actionable Report", startTime: 80, endTime: 100 },
  { name: "Evidence & Growth", startTime: 100, endTime: 115 },
  { name: "Bigger Vision — Roadmap", startTime: 115, endTime: 135 },
  { name: "Market & Business Model", startTime: 135, endTime: 155 },
  { name: "Team & Competitive Advantage", startTime: 155, endTime: 170 },
  { name: "Drop Mic — The Moment", startTime: 170, endTime: 180 },
  { name: "CTA — The Call", startTime: 180, endTime: 185 },
] as const;

/**
 * Get script lines for a specific section by name.
 */
export function getSection(sectionName: string): ScriptLine[] {
  const section = SECTIONS.find((s) => s.name === sectionName);
  if (!section) return [];
  return PITCH_3MIN.filter(
    (line) => line.startTime >= section.startTime && line.endTime <= section.endTime,
  );
}
