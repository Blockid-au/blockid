/**
 * ElevenLabs Voice-Over Generator for BlockID.au Pitch Videos
 *
 * Generates natural-sounding voiceover with emotion-based settings,
 * SSML-like pauses, and per-line audio files.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=xxx npx tsx src/remotion/scripts/generate-voiceover.ts [1min|3min]
 *
 * Prerequisites:
 *   - ElevenLabs API key (https://elevenlabs.io)
 *   - Voice ID selected (default: "Daniel" — Australian male)
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────────

const API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "onwK4e9ZLuTAKqWW03F9"; // "Daniel" voice
const MODEL = "eleven_multilingual_v2";
const OUTPUT_DIR = join(process.cwd(), "public", "video-assets", "audio");

// Emotion → ElevenLabs voice settings
const EMOTION_SETTINGS: Record<string, { stability: number; style: number; speed: number }> = {
  neutral:   { stability: 0.60, style: 0.30, speed: 1.00 },
  urgent:    { stability: 0.45, style: 0.50, speed: 1.05 },
  inspiring: { stability: 0.50, style: 0.45, speed: 1.00 },
  excited:   { stability: 0.40, style: 0.55, speed: 1.08 },
  dramatic:  { stability: 0.65, style: 0.60, speed: 0.70 },
};

// Pause durations (seconds of silence to insert between lines)
const PAUSE: Record<string, number> = {
  micro: 0.3,
  short: 0.5,
  medium: 1.0,
  long: 1.5,
  dramatic: 2.0,
};

// ── Script Data ─────────────────────────────────────────────────────────

interface ScriptLine {
  id: string;
  text: string;
  emotion: string;
  pauseAfter: string; // key from PAUSE
  notes?: string;
}

const SCRIPT_1MIN: ScriptLine[] = [
  { id: "01-problem-1", text: "Ninety percent of startups fail.", emotion: "urgent", pauseAfter: "short", notes: "Let the stat land" },
  { id: "02-problem-2", text: "In Australia, three hundred and seventy thousand businesses closed last year.", emotion: "urgent", pauseAfter: "short" },
  { id: "03-ai-1", text: "Ninety-seven billion dollars poured into AI startups in 2024 alone.", emotion: "urgent", pauseAfter: "micro" },
  { id: "04-ai-2", text: "But ninety percent of AI startups still fail. Average lifespan? Eighteen months.", emotion: "urgent", pauseAfter: "medium" },
  { id: "05-gap-1", text: "The problem? AI can build products.", emotion: "dramatic", pauseAfter: "micro" },
  { id: "06-gap-2", text: "But it can't value them. It can't split equity. It can't prepare for investors.", emotion: "dramatic", pauseAfter: "micro" },
  { id: "07-gap-3", text: "Manual valuation costs five to fifty thousand dollars. And takes weeks.", emotion: "urgent", pauseAfter: "long" },
  { id: "08-solution", text: "BlockID changes this.", emotion: "inspiring", pauseAfter: "short" },
  { id: "09-demo", text: "AI-powered valuation. In sixty seconds. From Day Zero.", emotion: "excited", pauseAfter: "medium" },
  { id: "10-platform", text: "One platform. Entire startup lifecycle. Idea to exit.", emotion: "inspiring", pauseAfter: "medium" },
  { id: "11-market", text: "A four point four trillion dollar global startup ecosystem. Two thousand six hundred active Australian startups. And not one AI-native valuation platform built for Australia.", emotion: "inspiring", pauseAfter: "long" },
  { id: "12-dropmic-1", text: "AI builds products.", emotion: "dramatic", pauseAfter: "short" },
  { id: "13-dropmic-2", text: "BlockID builds businesses.", emotion: "dramatic", pauseAfter: "dramatic" },
  { id: "14-cta", text: "Try free at blockid dot ay you.", emotion: "neutral", pauseAfter: "short" },
];

const SCRIPT_3MIN: ScriptLine[] = [
  // Opening
  { id: "01-stat-1", text: "Ninety percent of startups fail.", emotion: "urgent", pauseAfter: "short" },
  { id: "02-stat-2", text: "Three hundred and seventy thousand Australian businesses closed last year.", emotion: "urgent", pauseAfter: "short" },
  { id: "03-stat-3", text: "Ninety-seven billion dollars in AI funding. Ninety percent still fail.", emotion: "urgent", pauseAfter: "medium" },
  { id: "04-stat-4", text: "The gap: AI builds products. Nothing builds businesses.", emotion: "dramatic", pauseAfter: "long" },
  // Founder intro
  { id: "05-intro-1", text: "I'm Do Van Long, founder of BlockID.", emotion: "inspiring", pauseAfter: "micro" },
  { id: "06-intro-2", text: "I've seen founders build amazing AI products, then struggle to value them, split equity fairly, or get investor-ready.", emotion: "inspiring", pauseAfter: "medium" },
  // Three problems
  { id: "07-p1", text: "How much is my idea worth? Manual valuation: five to fifty thousand dollars. Two to six weeks.", emotion: "urgent", pauseAfter: "micro" },
  { id: "08-s1", text: "BlockID: AI valuation in sixty seconds. From one dollar.", emotion: "excited", pauseAfter: "short" },
  { id: "09-p2", text: "How do I split equity? Forty-two percent of co-founder disputes destroy startups.", emotion: "urgent", pauseAfter: "micro" },
  { id: "10-s2", text: "BlockID: fair equity calculator based on real contributions.", emotion: "excited", pauseAfter: "short" },
  { id: "11-p3", text: "How do I get investor-ready? Average data room preparation: three to six weeks.", emotion: "urgent", pauseAfter: "micro" },
  { id: "12-s3", text: "BlockID: evidence vault with auto-scored readiness. Upload and your score rises.", emotion: "excited", pauseAfter: "medium" },
  // Demo
  { id: "13-demo-intro", text: "Let me show you how BlockID works.", emotion: "exciting", pauseAfter: "medium" },
  { id: "14-demo-svi", text: "Ten-page AI analysis. Market research. Competitor analysis. Business model evaluation. Actionable recommendations. All in under a minute.", emotion: "excited", pauseAfter: "short" },
  { id: "15-demo-action", text: "Every recommendation links directly to a tool. Complete it, and your score automatically increases.", emotion: "excited", pauseAfter: "short" },
  // Evidence
  { id: "16-evidence", text: "Upload evidence. Pitch decks. Revenue proof. GitHub repos. Each piece of verified evidence lifts your score.", emotion: "inspiring", pauseAfter: "micro" },
  { id: "17-connect", text: "Connect Stripe for revenue. Connect GitHub for code. Your startup's value grows with you.", emotion: "inspiring", pauseAfter: "medium" },
  // Roadmap
  { id: "18-vision", text: "But we're just getting started.", emotion: "inspiring", pauseAfter: "long" },
  { id: "19-roadmap", text: "Equity tokenized on blockchain. Automatic dividend distribution. ESOP that vests with real contributions. From idea to IPO. One platform.", emotion: "inspiring", pauseAfter: "medium" },
  // Market
  { id: "20-market-1", text: "Two thousand six hundred active Australian startups. Three hundred accelerators. Fifteen thousand angel investors.", emotion: "inspiring", pauseAfter: "micro" },
  { id: "21-market-2", text: "And not one AI-native valuation platform built for Australia.", emotion: "dramatic", pauseAfter: "medium" },
  // Competition
  { id: "22-comp", text: "Carta is US-centric. Pulley starts at fundraise. BlockID starts at Day Zero. Before you've even incorporated.", emotion: "exciting", pauseAfter: "medium" },
  // Team
  { id: "23-team", text: "Built for Australian compliance from day one. ASIC registration. ESIC tax incentives. R&D tax offset.", emotion: "neutral", pauseAfter: "medium" },
  // Drop mic
  { id: "24-dm-1", text: "Two hundred and fifty-two billion dollars invested in AI last year.", emotion: "dramatic", pauseAfter: "long" },
  { id: "25-dm-2", text: "Ninety percent of those startups will fail.", emotion: "dramatic", pauseAfter: "long" },
  { id: "26-dm-3", text: "Not because of bad ideas.", emotion: "dramatic", pauseAfter: "long" },
  { id: "27-dm-4", text: "Because nobody helped them prove their value.", emotion: "dramatic", pauseAfter: "long" },
  { id: "28-dm-5", text: "Until now.", emotion: "dramatic", pauseAfter: "dramatic" },
  // CTA
  { id: "29-cta", text: "First analysis free. Start today at blockid dot ay you.", emotion: "neutral", pauseAfter: "short" },
];

// ── ElevenLabs API ──────────────────────────────────────────────────────

async function synthesizeLine(line: ScriptLine): Promise<Buffer> {
  const settings = EMOTION_SETTINGS[line.emotion] ?? EMOTION_SETTINGS.neutral;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: line.text,
        model_id: MODEL,
        voice_settings: {
          stability: settings.stability,
          similarity_boost: 0.75,
          style: settings.style,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error for ${line.id}: ${response.status} ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Generate silence (empty MP3 frame) ──────────────────────────────────

function generateSilence(durationMs: number): Buffer {
  // For proper silence, we'd use ffmpeg. For now, create a marker file.
  // The Remotion composition will handle silence via timing.
  const marker = JSON.stringify({ type: "silence", durationMs });
  return Buffer.from(marker);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] ?? "1min";
  const script = mode === "3min" ? SCRIPT_3MIN : SCRIPT_1MIN;
  const subDir = mode === "3min" ? "3min" : "1min";
  const outDir = join(OUTPUT_DIR, subDir);

  if (!API_KEY) {
    console.error("Set ELEVENLABS_API_KEY environment variable");
    console.log("\nTo get a key: https://elevenlabs.io → Profile → API Keys");
    console.log("\nScript lines for manual recording:\n");
    for (const line of script) {
      console.log(`[${line.emotion.toUpperCase().padEnd(10)}] ${line.text}`);
      console.log(`  Pause after: ${PAUSE[line.pauseAfter]}s\n`);
    }
    process.exit(1);
  }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`\nGenerating ${mode} voiceover (${script.length} lines)...\n`);

  const manifest: Array<{
    id: string;
    file: string;
    text: string;
    emotion: string;
    pauseAfterMs: number;
  }> = [];

  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const fileName = `${line.id}.mp3`;
    const filePath = join(outDir, fileName);

    process.stdout.write(`  [${i + 1}/${script.length}] ${line.id}... `);

    try {
      const audio = await synthesizeLine(line);
      writeFileSync(filePath, audio);
      console.log(`OK (${(audio.length / 1024).toFixed(0)} KB)`);

      manifest.push({
        id: line.id,
        file: `audio/${subDir}/${fileName}`,
        text: line.text,
        emotion: line.emotion,
        pauseAfterMs: Math.round((PAUSE[line.pauseAfter] ?? 0.5) * 1000),
      });
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Rate limit: ElevenLabs allows ~10 req/min on free tier
    if (i < script.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  // Write manifest
  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${manifestPath}`);
  console.log(`Audio files: ${outDir}/`);
  console.log(`Total lines: ${manifest.length}`);
}

main().catch(console.error);
