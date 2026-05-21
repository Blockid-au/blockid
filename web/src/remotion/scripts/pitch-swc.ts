/**
 * BlockID.au — Startup World Cup Sydney 2026 Pitch Video Script
 * Target: Startup World Cup 2026, Sydney Regional (17 June 2026)
 * Duration: 180 seconds @ 30fps (5400 frames)
 *
 * Voice: Professional Australian English, male, startup founder tone
 * Model: Microsoft Edge TTS (en-AU-WilliamMultilingualNeural)
 *
 * 6 Sections:
 *  1. Opening Hook (0:00–0:20) — urgent, dramatic stats
 *  2. The Problem (0:20–0:50) — industry pain, competitors fail
 *  3. The Solution (0:50–1:25) — BlockID demo, Evidence Vault
 *  4. Traction (1:25–1:50) — real metrics, tech stack
 *  5. Market & Business Model (1:50–2:20) — TAM, pricing, AU-first
 *  6. Close & Ask (2:20–3:00) — fundraise, vision, CTA
 */

import type { ScriptLine } from "./pitch-1min";
import { generateSRT, generateVTT, getCitations } from "./pitch-1min";

export { generateSRT, generateVTT, getCitations };

export const PITCH_SWC: ScriptLine[] = [
  // ═══════════════════════════════════════════════
  // SECTION 1: OPENING HOOK (0:00–0:20)
  // Tone: urgent → dramatic
  // ═══════════════════════════════════════════════
  {
    startTime: 0,
    endTime: 3,
    text: "",
    visual:
      "Black screen 0.5s → BlockID.au logo reveal: icon fades in with blue glow (#3B7DD8), text scales up spring animation. Sound: low rumble + chime.",
    emotion: "neutral",
  },
  {
    startTime: 3,
    endTime: 8,
    text: "Last year, three hundred and seventy thousand Australian businesses shut their doors.",
    visual:
      "Dark background (#0B1220). StatCounter: '370,500' in red (#F87171), large center. Subtitle: 'businesses closed in 2025'. Australian map outline with dots disappearing. Citation: ABS June 2025.",
    source: "ABS June 2025",
    emotion: "urgent",
  },
  {
    startTime: 8,
    endTime: 13,
    text: "That is more than one thousand businesses dying every single day. And the number one reason? They ran out of cash — because they had no idea what their startup was actually worth.",
    visual:
      "Counter: '1,014/day' pulses in red. Text reveals line by line: 'Ran out of cash' → 'No idea of value'. Cash icon draining animation.",
    source: "ABS Business Exits 2025",
    emotion: "urgent",
  },
  {
    startTime: 13,
    endTime: 20,
    text: "My name is Do Van Long, founder of BlockID dot ay you, and we are fixing this.",
    visual:
      "Transition: blue wipe. Founder lower-third appears: 'Do Van Long | Founder & CEO | Auschain Pty Ltd'. BlockID logo beside. Confident, forward-looking shot of homepage.",
    emotion: "inspiring",
  },

  // ═══════════════════════════════════════════════
  // SECTION 2: THE PROBLEM (0:20–0:50)
  // Tone: urgent
  // ═══════════════════════════════════════════════
  {
    startTime: 20,
    endTime: 29,
    text: "Right now, if you are an early-stage founder and you want to know your startup's value, you have two options. Pay a consultant five to fifty thousand dollars and wait six weeks. Or guess.",
    visual:
      "Split screen: Left — consultant icon with '$5K–$50K' and '6 weeks' calendar. Right — dice/question marks. Both options feel painful. Red warning glow on prices.",
    source: "Industry average",
    emotion: "urgent",
  },
  {
    startTime: 29,
    endTime: 40,
    text: "Carta, Pulley, Cake Equity — they all manage cap tables, but none of them tell you what your startup is actually worth. They are spreadsheets with a subscription. And they are all built for Silicon Valley, not for Australian founders dealing with ESIC compliance, ASIC regulations, and the A U startup ecosystem.",
    visual:
      "ComparisonTable: Carta, Pulley, Cake Equity logos → each gets a red X on 'AI Valuation', 'Day 0 Start', 'AU Compliance'. BlockID row at bottom with green checkmarks. 'Spreadsheets with a subscription' text punch.",
    emotion: "urgent",
  },
  {
    startTime: 40,
    endTime: 50,
    text: "The result? Sixty percent of Australian startups fail within three years. Founders fly blind.",
    visual:
      "StatCounter: '60%' in red, large. Subtitle: 'fail within 3 years'. Animated graph line crashing down. Text punch: 'Founders fly blind' in white on black. 2-second dramatic hold.",
    source: "ASBFEO 2024",
    emotion: "dramatic",
  },

  // ═══════════════════════════════════════════════
  // SECTION 3: THE SOLUTION (0:50–1:25)
  // Tone: inspiring → excited
  // ═══════════════════════════════════════════════
  {
    startTime: 50,
    endTime: 57,
    text: "BlockID dot ay you is an AI-powered startup valuation platform. In under sixty seconds, our Startup Value Index analyses your startup across eight dimensions — team, market, product, traction, cap table, investor readiness, legal compliance, and competitive moat.",
    visual:
      "Transition: zoom into ScreenDemo showing blockid.au. 8 dimension icons appear in a circle around the SVI gauge. Each lights up as named. '60 seconds' timer graphic.",
    emotion: "inspiring",
  },
  {
    startTime: 57,
    endTime: 63,
    text: "And generates an institutional-grade valuation report.",
    visual:
      "ScreenDemo: SVI report scrolling — Executive Summary, Dimension Breakdown, Market Analysis, Risk Assessment, Action Plan. Pages flip animation. 'Institutional-grade' badge overlay.",
    emotion: "excited",
  },
  {
    startTime: 63,
    endTime: 72,
    text: "But we do not stop at a score. Founders connect their evidence — GitHub commits, Stripe revenue, Google Analytics traffic, LinkedIn profiles — and our AI watches their startup grow in real time.",
    visual:
      "ScreenDemo: Evidence Vault page. GitHub, Stripe, Analytics, LinkedIn connector icons animate connected state (green checkmarks). Score gauge incrementing: +5, +8, +12. 'Real-time growth' label.",
    emotion: "excited",
  },
  {
    startTime: 72,
    endTime: 78,
    text: "We call it the Evidence Vault. Your score goes up as your startup proves itself.",
    visual:
      "Evidence Vault zoomed in — documents uploading, confidence badges animating. SVI score counter ticking up: 85 → 92 → 105 → 118. Green upward arrow animations.",
    emotion: "excited",
  },
  {
    startTime: 78,
    endTime: 85,
    text: "We are the platform that takes founders from Day Zero idea all the way through to exit.",
    visual:
      "FlowDiagram animation: Idea → Validate → MVP → Traction → Fundraise → Growth → Scale → Exit. Each node lights up in brand blue sequence. 'Day 0 to Exit' headline.",
    emotion: "inspiring",
  },

  // ═══════════════════════════════════════════════
  // SECTION 4: TRACTION (1:25–1:50)
  // Tone: excited
  // ═══════════════════════════════════════════════
  {
    startTime: 85,
    endTime: 95,
    text: "BlockID is live today at blockid dot ay you. We have over fifty Australian founders on the platform. We have completed more than two hundred SVI analyses. We have ten free tools live — equity split calculators, dilution modelling, data room builders, term sheet AI.",
    visual:
      "MetricsGrid animation: '50+' founders (blue), '200+' analyses (teal), '10' tools (gold), '$5.5M+' valuations tracked (emerald). Each counter animates up. Tool icons flash: calculator, chart, folder, document.",
    emotion: "excited",
  },
  {
    startTime: 95,
    endTime: 105,
    text: "Our tech stack runs on six AI providers with automatic fallback — Claude, GPT-4, Gemini, and more. We auto-publish daily SEO content. We have full analytics tracking with thirty-seven custom events. And we have done all of this as a solo technical founder with an AI-augmented team — seven AI agents operating as my C-suite.",
    visual:
      "AI provider logos animate in: Claude, GPT, Gemini, OpenAI, ElevenLabs, Edge. '6 AI providers' badge. TeamOrg chart: CEO (human) + 7 AI agents (CTO, CMO, CFO, CPO, CRO, COO, IR). 'AI-Augmented Team' headline.",
    emotion: "excited",
  },

  // ═══════════════════════════════════════════════
  // SECTION 5: MARKET & BUSINESS MODEL (1:50–2:20)
  // Tone: inspiring
  // ═══════════════════════════════════════════════
  {
    startTime: 105,
    endTime: 115,
    text: "Australia has two point seven million active businesses and four hundred and thirty-seven thousand new ones starting every year. The global startup ecosystem is worth four point four trillion dollars. Cap table management alone is a three point two billion dollar market.",
    visual:
      "TAMCircles animation: TAM outer ring '$4.4T global ecosystem', SAM middle ring '$3.2B cap table', SOM inner ring '2.7M AU businesses'. Numbers count up. Australian flag accent.",
    source: "ABS 2025, Startup Genome, Industry Research",
    emotion: "inspiring",
  },
  {
    startTime: 115,
    endTime: 125,
    text: "Our model is simple. Free SVI analysis gets founders in the door. Fifty cents per deep analysis for early adopters. Then forty-nine to four ninety-nine dollars per month for subscriptions. And twenty to sixty thousand dollars per year for accelerator partnerships.",
    visual:
      "Pricing ladder animation: Free → A$0.50/analysis → A$49–$499/month → A$20K–$60K/year enterprise. Each tier slides in from left. Revenue projections bar chart grows.",
    emotion: "inspiring",
  },
  {
    startTime: 125,
    endTime: 130,
    text: "We are Australia-first. ESIC-aware. ASIC-registered. Built by an Australian founder, for Australian founders.",
    visual:
      "Australian flag + ASIC logo + ESIC badge + ABN number animate in. 'Built in Sydney, NSW' map pin. Brand blue accent on 'Australia-first'.",
    emotion: "inspiring",
  },

  // ═══════════════════════════════════════════════
  // SECTION 6: CLOSE & ASK (2:20–3:00)
  // Tone: dramatic → inspiring
  // ═══════════════════════════════════════════════
  {
    startTime: 130,
    endTime: 140,
    text: "BlockID is not a pitch deck. It is a live product with real users generating real analyses every day. We are raising a pre-seed round of five hundred thousand dollars to scale to five hundred users, launch cap table management, and begin equity tokenization on Cosmos blockchain.",
    visual:
      "ScreenDemo: live blockid.au homepage briefly. Then fundraise card: '$500K Pre-Seed'. Milestones: '500 users' → 'Cap Table' → 'Equity Tokenization' → 'Cosmos Blockchain'. Each milestone animates in.",
    emotion: "inspiring",
  },
  {
    startTime: 140,
    endTime: 155,
    text: "Our vision? Every startup in Australia knows its value on day one. Every founder has the tools to grow, fundraise, and exit — without spending fifty thousand dollars on consultants.",
    visual:
      "Vision statement in large elegant type: 'Every startup knows its value on Day 1'. Animated map of Australia with glowing dots representing startups. Dots multiply and connect. '$50K → $0.50' price comparison fades in.",
    emotion: "dramatic",
  },
  {
    startTime: 155,
    endTime: 165,
    text: "BlockID dot ay you — from idea to exit, one platform.",
    visual:
      "DropMic: Screen fades to black. 'BlockID.au' in large white bold text, center. Subtitle: 'From idea to exit, one platform.' Brand blue glow behind logo. 3-second dramatic hold.",
    emotion: "dramatic",
  },
  {
    startTime: 165,
    endTime: 175,
    text: "Thank you.",
    visual:
      "CTASlide: BlockID.au logo (large). 'blockid.au' URL. QR code to website. 'Do Van Long — Founder & CEO'. 'Auschain Pty Ltd — ACN 659 615 111'. 'Try free: blockid.au'. LinkedIn QR. Sydney, Australia.",
    emotion: "neutral",
  },
  {
    startTime: 175,
    endTime: 180,
    text: "",
    visual:
      "Hold CTA slide. Fade to black at 178s. BlockID logo watermark. End.",
    emotion: "neutral",
  },
];

/**
 * Word count for pacing validation.
 * Target: 140–160 WPM for 3-minute pitch = ~420–480 words.
 */
export const PITCH_SWC_WORD_COUNT = PITCH_SWC.reduce(
  (sum, line) => sum + line.text.split(/\s+/).filter(Boolean).length,
  0,
);

/**
 * Section markers for composition scene mapping.
 */
export const SWC_SECTIONS = [
  { name: "Opening Hook",         startTime: 0,   endTime: 20  },
  { name: "The Problem",          startTime: 20,  endTime: 50  },
  { name: "The Solution",         startTime: 50,  endTime: 85  },
  { name: "Traction",             startTime: 85,  endTime: 105 },
  { name: "Market & Business",    startTime: 105, endTime: 130 },
  { name: "Close & Ask",          startTime: 130, endTime: 180 },
];
