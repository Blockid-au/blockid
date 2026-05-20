#!/bin/bash
# Render BlockID pitch videos with Remotion
# Requirements: Chromium + FFmpeg installed
# Usage: ./scripts/render-videos.sh

set -e
cd "$(dirname "$0")/.."

BROWSER=${CHROMIUM_PATH:-/usr/bin/chromium}
OUT="public/video-assets"
mkdir -p "$OUT"

echo "🎬 BlockID Video Renderer"
echo "========================="
echo "Browser: $BROWSER"
echo "Output: $OUT/"
echo ""

echo "📸 Step 1: Taking screenshots of blockid.au..."
npx tsx scripts/take-screenshots.ts 2>/dev/null || echo "⚠️  Screenshots skipped (need puppeteer-core)"

echo ""
echo "🎬 Step 2: Rendering 1-minute pitch video..."
PUPPETEER_EXECUTABLE_PATH="$BROWSER" npx remotion render PitchVideo1Min "$OUT/pitch-1min.mp4" \
  --browser-executable="$BROWSER" \
  --gl=swiftshader \
  --codec=h264 \
  --quality=90 \
  --concurrency=2

echo ""
echo "🎬 Step 3: Rendering 3-minute pitch video..."
PUPPETEER_EXECUTABLE_PATH="$BROWSER" npx remotion render PitchVideo3Min "$OUT/pitch-3min.mp4" \
  --browser-executable="$BROWSER" \
  --gl=swiftshader \
  --codec=h264 \
  --quality=90 \
  --concurrency=2

echo ""
echo "🖼️  Step 4: Generating thumbnails..."
PUPPETEER_EXECUTABLE_PATH="$BROWSER" npx remotion still PitchVideo1Min "$OUT/thumb-1min.png" \
  --frame=840 --browser-executable="$BROWSER" --gl=swiftshader 2>/dev/null || true
PUPPETEER_EXECUTABLE_PATH="$BROWSER" npx remotion still PitchVideo3Min "$OUT/thumb-3min.png" \
  --frame=2400 --browser-executable="$BROWSER" --gl=swiftshader 2>/dev/null || true

echo ""
echo "📝 Step 5: Generating captions..."
npx tsx -e "
import { PITCH_1MIN, generateSRT } from './src/remotion/scripts/pitch-1min.js';
import { PITCH_3MIN } from './src/remotion/scripts/pitch-3min.js';
import { writeFileSync } from 'fs';
writeFileSync('$OUT/pitch-1min.srt', generateSRT(PITCH_1MIN));
writeFileSync('$OUT/pitch-3min.srt', generateSRT(PITCH_3MIN));
console.log('Captions generated');
"

echo ""
echo "✅ All done!"
ls -lh "$OUT"/*.mp4 "$OUT"/*.srt "$OUT"/*.png 2>/dev/null
