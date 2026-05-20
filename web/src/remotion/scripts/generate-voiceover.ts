/**
 * Voice-Over Generator for BlockID.au Pitch Videos
 *
 * Uses Microsoft Edge TTS (free, no API key, neural voices) with
 * emotion-based SSML for natural human-like delivery.
 *
 * Usage:
 *   npx tsx src/remotion/scripts/generate-voiceover.ts [1min|3min]
 *
 * No API key needed. Uses edge-tts (pip install edge-tts).
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────────

const VOICE = "en-AU-WilliamMultilingualNeural"; // Australian male
const EDGE_TTS = process.env.EDGE_TTS_BIN ?? `${process.env.HOME}/.local/bin/edge-tts`;
const OUTPUT_DIR = join(process.cwd(), "public", "video-assets", "audio");

// Emotion → SSML prosody settings (rate, pitch, volume adjustments)
const EMOTION_SSML: Record<string, { rate: string; pitch: string; volume: string }> = {
  neutral:   { rate: "+0%",  pitch: "+0Hz",  volume: "+0%" },
  urgent:    { rate: "+5%",  pitch: "+10Hz", volume: "+5%" },
  inspiring: { rate: "+0%",  pitch: "+5Hz",  volume: "+3%" },
  excited:   { rate: "+8%",  pitch: "+15Hz", volume: "+8%" },
  dramatic:  { rate: "-30%", pitch: "-10Hz", volume: "+5%" },
};

// Pause durations (ms)
const PAUSE: Record<string, number> = {
  micro: 300,
  short: 500,
  medium: 1000,
  long: 1500,
  dramatic: 2000,
};

// ── Script Data ─────────────────────────────────────────────────────────

interface ScriptLine {
  id: string;
  text: string;
  emotion: string;
  pauseAfter: string;
}

const SCRIPT_1MIN: ScriptLine[] = [
  { id: "01-problem-1", text: "Ninety percent of startups fail.", emotion: "urgent", pauseAfter: "short" },
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
  { id: "01-stat-1", text: "Ninety percent of startups fail.", emotion: "urgent", pauseAfter: "short" },
  { id: "02-stat-2", text: "Three hundred and seventy thousand Australian businesses closed last year.", emotion: "urgent", pauseAfter: "short" },
  { id: "03-stat-3", text: "Ninety-seven billion dollars in AI funding. Ninety percent still fail.", emotion: "urgent", pauseAfter: "medium" },
  { id: "04-stat-4", text: "The gap: AI builds products. Nothing builds businesses.", emotion: "dramatic", pauseAfter: "long" },
  { id: "05-intro-1", text: "I'm Do Van Long, founder of BlockID.", emotion: "inspiring", pauseAfter: "micro" },
  { id: "06-intro-2", text: "I've seen founders build amazing AI products, then struggle to value them, split equity fairly, or get investor-ready.", emotion: "inspiring", pauseAfter: "medium" },
  { id: "07-p1", text: "How much is my idea worth? Manual valuation: five to fifty thousand dollars. Two to six weeks.", emotion: "urgent", pauseAfter: "micro" },
  { id: "08-s1", text: "BlockID: AI valuation in sixty seconds. From one dollar.", emotion: "excited", pauseAfter: "short" },
  { id: "09-p2", text: "How do I split equity? Forty-two percent of co-founder disputes destroy startups.", emotion: "urgent", pauseAfter: "micro" },
  { id: "10-s2", text: "BlockID: fair equity calculator based on real contributions.", emotion: "excited", pauseAfter: "short" },
  { id: "11-p3", text: "How do I get investor-ready? Average data room preparation: three to six weeks.", emotion: "urgent", pauseAfter: "micro" },
  { id: "12-s3", text: "BlockID: evidence vault with auto-scored readiness. Upload and your score rises.", emotion: "excited", pauseAfter: "medium" },
  { id: "13-demo-intro", text: "Let me show you how BlockID works.", emotion: "excited", pauseAfter: "medium" },
  { id: "14-demo-svi", text: "Ten-page AI analysis. Market research. Competitor analysis. Business model evaluation. Actionable recommendations. All in under a minute.", emotion: "excited", pauseAfter: "short" },
  { id: "15-demo-action", text: "Every recommendation links directly to a tool. Complete it, and your score automatically increases.", emotion: "excited", pauseAfter: "short" },
  { id: "16-evidence", text: "Upload evidence. Pitch decks. Revenue proof. GitHub repos. Each piece of verified evidence lifts your score.", emotion: "inspiring", pauseAfter: "micro" },
  { id: "17-connect", text: "Connect Stripe for revenue. Connect GitHub for code. Your startup's value grows with you.", emotion: "inspiring", pauseAfter: "medium" },
  { id: "18-vision", text: "But we're just getting started.", emotion: "inspiring", pauseAfter: "long" },
  { id: "19-roadmap", text: "Equity tokenized on blockchain. Automatic dividend distribution. ESOP that vests with real contributions. From idea to IPO. One platform.", emotion: "inspiring", pauseAfter: "medium" },
  { id: "20-market-1", text: "Two thousand six hundred active Australian startups. Three hundred accelerators. Fifteen thousand angel investors.", emotion: "inspiring", pauseAfter: "micro" },
  { id: "21-market-2", text: "And not one AI-native valuation platform built for Australia.", emotion: "dramatic", pauseAfter: "medium" },
  { id: "22-comp", text: "Carta is US-centric. Pulley starts at fundraise. BlockID starts at Day Zero. Before you've even incorporated.", emotion: "excited", pauseAfter: "medium" },
  { id: "23-team", text: "Built for Australian compliance from day one. ASIC registration. ESIC tax incentives. R&D tax offset.", emotion: "neutral", pauseAfter: "medium" },
  { id: "24-dm-1", text: "Two hundred and fifty-two billion dollars invested in AI last year.", emotion: "dramatic", pauseAfter: "long" },
  { id: "25-dm-2", text: "Ninety percent of those startups will fail.", emotion: "dramatic", pauseAfter: "long" },
  { id: "26-dm-3", text: "Not because of bad ideas.", emotion: "dramatic", pauseAfter: "long" },
  { id: "27-dm-4", text: "Because nobody helped them prove their value.", emotion: "dramatic", pauseAfter: "long" },
  { id: "28-dm-5", text: "Until now.", emotion: "dramatic", pauseAfter: "dramatic" },
  { id: "29-cta", text: "First analysis free. Start today at blockid dot ay you.", emotion: "neutral", pauseAfter: "short" },
];

// ── Generate per-line audio ─────────────────────────────────────────────

function generateLine(line: ScriptLine, outPath: string): boolean {
  const ssml = EMOTION_SSML[line.emotion] ?? EMOTION_SSML.neutral;

  // Build SSML for emotion control
  const ssmlText = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-AU">
  <voice name="${VOICE}">
    <prosody rate="${ssml.rate}" pitch="${ssml.pitch}" volume="${ssml.volume}">
      ${line.text}
    </prosody>
  </voice>
</speak>`;

  // Write SSML to temp file
  const tmpSsml = `/tmp/blockid-tts-${line.id}.ssml`;
  writeFileSync(tmpSsml, ssmlText);

  try {
    // Use edge-tts with rate adjustment for emotion
    const rateFlag = line.emotion === "dramatic" ? "--rate=-25%" : line.emotion === "excited" ? "--rate=+8%" : "--rate=+0%";
    const pitchFlag = line.emotion === "dramatic" ? "--pitch=-5Hz" : line.emotion === "urgent" ? "--pitch=+8Hz" : "--pitch=+0Hz";

    execSync(
      `${EDGE_TTS} --voice "${VOICE}" ${rateFlag} ${pitchFlag} --text "${line.text.replace(/"/g, '\\"')}" --write-media "${outPath}"`,
      { timeout: 30000, encoding: "utf-8" },
    );

    // Cleanup
    try { execSync(`rm -f ${tmpSsml}`); } catch { /* ignore */ }
    return true;
  } catch (err) {
    console.error(`  FAILED: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    try { execSync(`rm -f ${tmpSsml}`); } catch { /* ignore */ }
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
  const mode = process.argv[2] ?? "1min";
  const script = mode === "3min" ? SCRIPT_3MIN : SCRIPT_1MIN;
  const subDir = mode === "3min" ? "3min" : "1min";
  const outDir = join(OUTPUT_DIR, subDir);

  // Check edge-tts is installed
  try {
    execSync(`${EDGE_TTS} --version`, { encoding: "utf-8" });
  } catch {
    console.error("edge-tts not found. Install: pip3 install edge-tts");
    process.exit(1);
  }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`\n🎙️  Generating ${mode} voiceover (${script.length} lines)`);
  console.log(`   Voice: ${VOICE} (Australian English, Male)`);
  console.log(`   Output: ${outDir}/\n`);

  const manifest: Array<{
    id: string;
    file: string;
    text: string;
    emotion: string;
    pauseAfterMs: number;
    sizeKB: number;
  }> = [];

  let success = 0;
  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const fileName = `${line.id}.mp3`;
    const filePath = join(outDir, fileName);

    process.stdout.write(`  [${i + 1}/${script.length}] ${line.id} [${line.emotion}]... `);

    if (generateLine(line, filePath)) {
      const size = Math.round(statSync(filePath).size / 1024);
      console.log(`OK (${size} KB)`);
      manifest.push({
        id: line.id,
        file: `video-assets/audio/${subDir}/${fileName}`,
        text: line.text,
        emotion: line.emotion,
        pauseAfterMs: PAUSE[line.pauseAfter] ?? 500,
        sizeKB: size,
      });
      success++;
    }
  }

  // Write manifest
  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\n✅ Generated: ${success}/${script.length} lines`);
  console.log(`📄 Manifest: ${manifestPath}`);
  console.log(`🎵 Audio: ${outDir}/`);

  // Calculate total duration estimate
  const totalPauseMs = manifest.reduce((s, m) => s + m.pauseAfterMs, 0);
  console.log(`⏱️  Total pause time: ${(totalPauseMs / 1000).toFixed(1)}s`);
}

main();
