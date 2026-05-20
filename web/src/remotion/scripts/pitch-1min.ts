/**
 * BlockID.au — 1-Minute Pitch Video Script
 * Target: Google for Startups Accelerator (Australia)
 * Duration: 60 seconds @ 30fps
 *
 * Voice: Professional Australian English, male, startup founder tone
 * Model: ElevenLabs multilingual_v2
 */

export interface ScriptLine {
  startTime: number; // seconds
  endTime: number; // seconds
  text: string; // voice-over text
  visual: string; // what's on screen
  source?: string; // data citation
  emotion: "neutral" | "urgent" | "inspiring" | "excited" | "dramatic";
}

export const PITCH_1MIN: ScriptLine[] = [
  // ─────────────────────────────────────────────
  // LOGO REVEAL (0-3s)
  // ─────────────────────────────────────────────
  {
    startTime: 0,
    endTime: 3,
    text: "",
    visual:
      "BlockID.au logo reveal: icon fades in with glow, text scales up with spring animation, tagline slides up. Sound: subtle whoosh + chime.",
    emotion: "neutral",
  },

  // ─────────────────────────────────────────────
  // THE PROBLEM — SHOCK STATS (3-10s)
  // ─────────────────────────────────────────────
  {
    startTime: 3,
    endTime: 6,
    text: "Ninety percent of startups fail.",
    visual:
      "Animated counter: 90% in red (#F87171), large center text. Background fades to dark (#0B1220).",
    source: "Failory 2026",
    emotion: "urgent",
  },
  {
    startTime: 6,
    endTime: 10,
    text: "In Australia, three hundred and seventy thousand businesses closed last year alone.",
    visual:
      "Counter animates: 370,000 with 'businesses closed' subtitle in white. Small stat line below: '437,150 started vs 370,500 closed'. ABS source citation bottom-right.",
    source: "ABS June 2025",
    emotion: "urgent",
  },

  // ─────────────────────────────────────────────
  // THE AI EXPLOSION (10-18s)
  // ─────────────────────────────────────────────
  {
    startTime: 10,
    endTime: 14,
    text: "Ninety-seven billion dollars poured into AI startups in twenty twenty-four alone.",
    visual:
      "Animated money counter: $97B in gold (#FBBF24) with AI chip graphic pulsing behind. Dollar signs rain down subtly.",
    source: "Second Talent 2024",
    emotion: "urgent",
  },
  {
    startTime: 14,
    endTime: 18,
    text: "But ninety percent of AI startups still fail. Average lifespan: eighteen months.",
    visual:
      "Counter: 90% fades in red. Timeline graphic: birth to death in 18 months. Small citation: Stanford HAI 2025 + AI4SP.",
    source: "Stanford HAI 2025, AI4SP",
    emotion: "urgent",
  },

  // ─────────────────────────────────────────────
  // THE GAP (18-25s)
  // ─────────────────────────────────────────────
  {
    startTime: 18,
    endTime: 22,
    text: "The problem? AI can build products. But it can't value them. It can't split equity. It can't prepare you for investors.",
    visual:
      "ChatGPT, Claude, Gemini logos appear in a row. Red X marks stamp over each one, one by one. Text: 'Can't value startups' appears below.",
    emotion: "urgent",
  },
  {
    startTime: 22,
    endTime: 25,
    text: "Manual valuation costs five to fifty thousand dollars and takes weeks.",
    visual:
      "Price range animates: A$5,000 to A$50,000. Calendar icon with '2-6 weeks' flipping pages. Red warning glow.",
    source: "Industry average",
    emotion: "urgent",
  },

  // ─────────────────────────────────────────────
  // THE SOLUTION — LIVE DEMO (25-40s)
  // ─────────────────────────────────────────────
  {
    startTime: 25,
    endTime: 27,
    text: "BlockID changes this.",
    visual:
      "Screen wipes to BlockID brand blue (#3B7DD8). Logo appears center. Transition: zoom into browser window showing blockid.au homepage.",
    emotion: "excited",
  },
  {
    startTime: 27,
    endTime: 30,
    text: "",
    visual:
      "LIVE RECORDING: blockid.au homepage. Hero section visible: 'The agentic AI valuation platform'. Cursor moves to search bar with glowing border.",
    emotion: "neutral",
  },
  {
    startTime: 30,
    endTime: 33,
    text: "",
    visual:
      "LIVE RECORDING: User types 'An AI platform for Australian property management' into search bar. Characters appear with typing animation. Input badge appears: 'Idea Analysis' in blue.",
    emotion: "neutral",
  },
  {
    startTime: 33,
    endTime: 35,
    text: "",
    visual:
      "LIVE RECORDING: Cursor clicks 'Get My SVI' button. Button pulses. SSE status bar appears at top.",
    emotion: "neutral",
  },
  {
    startTime: 35,
    endTime: 37,
    text: "",
    visual:
      "LIVE RECORDING: SSE status messages animate: 'Analyzing your input...' then 'Researching market size...' then 'Scanning competitors...' then 'Evaluating business model...' then 'Generating report...'",
    emotion: "neutral",
  },
  {
    startTime: 37,
    endTime: 40,
    text: "AI-powered valuation in sixty seconds. From Day Zero.",
    visual:
      "LIVE RECORDING: SVI Report appears with score animation. Gauge fills to 142. Quick scroll through 10-page report: Executive Summary, Market Analysis, Competitor Scan, Recommendations.",
    emotion: "excited",
  },

  // ─────────────────────────────────────────────
  // WHAT WE SOLVE — FEATURES MONTAGE (40-50s)
  // ─────────────────────────────────────────────
  {
    startTime: 40,
    endTime: 43,
    text: "One platform. Entire lifecycle.",
    visual:
      "Animated flow diagram appears left to right: Idea -> [BlockID Validates] -> MVP -> [Tracks Value] -> Fundraise -> [Cap Table] -> Growth -> [Tokenize Equity] -> Exit. Each node lights up in sequence with brand blue.",
    emotion: "inspiring",
  },
  {
    startTime: 43,
    endTime: 45,
    text: "",
    visual:
      "Quick cut: Evidence Vault screenshot. Document uploads. Toast notification: 'SVI +8 points'. Highlight glow on score change.",
    emotion: "neutral",
  },
  {
    startTime: 45,
    endTime: 47,
    text: "",
    visual:
      "Quick cut: Cap Table tool. Equity split pie chart: Founder 60%, Co-founder 30%, ESOP 10%. Animated slice separation.",
    emotion: "neutral",
  },
  {
    startTime: 47,
    endTime: 49,
    text: "",
    visual:
      "Quick cut: Milestone Badges shelf. 4 badges earned with sparkle animation: 'Idea Validated', 'Pitch Ready', 'Cap Table Set', 'Revenue Tracked'.",
    emotion: "neutral",
  },
  {
    startTime: 49,
    endTime: 50,
    text: "",
    visual:
      "Quick cut: Living Report dashboard card showing SVI trend chart going up over time. Green line, upward trajectory.",
    emotion: "neutral",
  },

  // ─────────────────────────────────────────────
  // TRACTION & MARKET (50-55s)
  // ─────────────────────────────────────────────
  {
    startTime: 50,
    endTime: 53,
    text: "A four-point-four trillion dollar global startup ecosystem. A three-point-two billion dollar cap table market.",
    visual:
      "TAM/SAM/SOM animated concentric circles. TAM (outer, light): A$4.4T. SAM (middle, medium): A$3.2B. Numbers count up as circles expand.",
    source: "Industry research 2025",
    emotion: "inspiring",
  },
  {
    startTime: 53,
    endTime: 55,
    text: "Twenty-six hundred active Australian startups. And not one AI-native valuation platform.",
    visual:
      "SOM (inner, brand blue): A$250K Y1. Stat: '2,600 active startups' with Australian map outline. Text punch: 'Zero AI valuation platforms' in red.",
    source: "Startup Genome, ABS 2025",
    emotion: "inspiring",
  },

  // ─────────────────────────────────────────────
  // DROP MIC MOMENT (55-58s)
  // ─────────────────────────────────────────────
  {
    startTime: 55,
    endTime: 58,
    text: "AI builds products. BlockID builds businesses.",
    visual:
      "Screen fades to pure black (#0B1220). Bold white text appears center, large (96px). 1.5-second dramatic pause after text fully appears. Subtle brand blue glow behind 'BlockID'.",
    emotion: "dramatic",
  },

  // ─────────────────────────────────────────────
  // CTA + CONTACT (58-60s)
  // ─────────────────────────────────────────────
  {
    startTime: 58,
    endTime: 60,
    text: "",
    visual:
      "BlockID.au logo (large, center). Below: 'blockid.au' in white. Tagline: 'Where AI meets startup valuation' in slate. Divider line. 'Do Van Long — Founder & CEO'. QR Code linking to linkedin.com/in/dovanlong. Bottom: 'Try free: blockid.au' in brand blue. Auschain Pty Ltd small text.",
    emotion: "neutral",
  },
];

/**
 * Total word count for pacing validation.
 * Target: 140-160 WPM for 60-second video.
 */
export const PITCH_1MIN_WORD_COUNT = PITCH_1MIN.reduce(
  (sum, line) => sum + line.text.split(/\s+/).filter(Boolean).length,
  0,
);

/**
 * Generate SRT caption content from script lines.
 * Filters out silent lines (no voice-over text).
 */
export function generateSRT(lines: ScriptLine[]): string {
  return lines
    .filter((l) => l.text)
    .map((l, i) => {
      const startH = Math.floor(l.startTime / 3600)
        .toString()
        .padStart(2, "0");
      const startM = Math.floor((l.startTime % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const startS = Math.floor(l.startTime % 60)
        .toString()
        .padStart(2, "0");
      const startMs = Math.round((l.startTime % 1) * 1000)
        .toString()
        .padStart(3, "0");

      const endH = Math.floor(l.endTime / 3600)
        .toString()
        .padStart(2, "0");
      const endM = Math.floor((l.endTime % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const endS = Math.floor(l.endTime % 60)
        .toString()
        .padStart(2, "0");
      const endMs = Math.round((l.endTime % 1) * 1000)
        .toString()
        .padStart(3, "0");

      return `${i + 1}\n${startH}:${startM}:${startS},${startMs} --> ${endH}:${endM}:${endS},${endMs}\n${l.text}\n`;
    })
    .join("\n");
}

/**
 * Generate WebVTT caption content from script lines.
 */
export function generateVTT(lines: ScriptLine[]): string {
  const cues = lines
    .filter((l) => l.text)
    .map((l, i) => {
      const fmt = (t: number) => {
        const h = Math.floor(t / 3600)
          .toString()
          .padStart(2, "0");
        const m = Math.floor((t % 3600) / 60)
          .toString()
          .padStart(2, "0");
        const s = Math.floor(t % 60)
          .toString()
          .padStart(2, "0");
        const ms = Math.round((t % 1) * 1000)
          .toString()
          .padStart(3, "0");
        return `${h}:${m}:${s}.${ms}`;
      };
      return `${i + 1}\n${fmt(l.startTime)} --> ${fmt(l.endTime)}\n${l.text}\n`;
    })
    .join("\n");

  return `WEBVTT\n\n${cues}`;
}

/**
 * Get all lines with data citations for fact-checking.
 */
export function getCitations(
  lines: ScriptLine[],
): Array<{ text: string; source: string; time: string }> {
  return lines
    .filter((l) => l.source)
    .map((l) => ({
      text: l.text,
      source: l.source!,
      time: `${l.startTime}s-${l.endTime}s`,
    }));
}
