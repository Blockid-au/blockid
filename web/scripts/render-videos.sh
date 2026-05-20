#!/bin/bash
# Render BlockID pitch videos with Remotion
# Run on a machine with Chrome/Chromium + FFmpeg installed
set -e
cd "$(dirname "$0")/.."

CHROMIUM=${CHROMIUM_PATH:-/usr/bin/chromium}
GL=${GL_MODE:-swiftshader}

echo "Rendering 1-minute pitch video..."
npx remotion render PitchVideo1Min public/video-assets/blockid_pitch1min.mp4 \
  --browser-executable="$CHROMIUM" \
  --gl="$GL" \
  --codec=h264 \
  --quality=90

echo "Rendering 3-minute pitch video..."
npx remotion render PitchVideo3Min public/video-assets/blockid_pitch_3mins.mp4 \
  --browser-executable="$CHROMIUM" \
  --gl="$GL" \
  --codec=h264 \
  --quality=90

echo "Rendering thumbnails..."
npx remotion still PitchVideo1Min public/video-assets/blockid_pitch1min_thumb.png \
  --frame=840 \
  --browser-executable="$CHROMIUM" \
  --gl="$GL"

npx remotion still PitchVideo3Min public/video-assets/blockid_pitch_3mins_thumb.png \
  --frame=2400 \
  --browser-executable="$CHROMIUM" \
  --gl="$GL"

echo ""
echo "All videos rendered to public/video-assets/"
ls -lah public/video-assets/blockid_pitch*.mp4 public/video-assets/blockid_pitch*_thumb.png
