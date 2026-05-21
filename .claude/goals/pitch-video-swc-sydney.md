# Pitch Video — Startup World Cup Sydney 2026

## Goal
Produce a polished 3-minute pitch video for Startup World Cup Sydney (17 June 2026)
with synchronized voice-over, live product demo recorded via Playwright, and
professional Remotion animations. The video must be ready to submit as a backup
pitch video and publishable on YouTube/LinkedIn.

## Technical Specs
- **Duration:** 180 seconds (5400 frames @ 30fps)
- **Resolution:** 1920x1080 (Full HD)
- **Format:** MP4 (H.264)
- **Voice:** Australian English male (en-AU-WilliamMultilingualNeural via Edge TTS)
- **Output:** `/web/public/video-assets/pitch-swc-sydney.mp4`
- **Captions:** SRT + VTT subtitle files

## Production Pipeline

### Phase 1: Script & Voice (Day 1)
**Owner:** Media Studio Agent

1. **Adapt SWC pitch script** to Remotion ScriptLine format
   - Source: `app-startup-world-cup.md` (3-min pitch script)
   - Target: New file `web/src/remotion/scripts/pitch-swc.ts`
   - 6 sections matching the pitch: Opening Hook → Problem → Solution → Traction → Market → Close
   - Each line has: startTime, endTime, text, visual, emotion, source

2. **Generate voice-over clips** with emotion prosody
   - Use `web/src/remotion/scripts/generate-voiceover.ts`
   - Output: `web/public/video-assets/audio/swc-final/01.mp3` through `NN.mp3`
   - Emotions per section:
     - Opening Hook: `urgent` → `dramatic`
     - Problem: `urgent`
     - Solution: `inspiring` → `excited`
     - Traction: `excited`
     - Market: `neutral` → `inspiring`
     - Close: `dramatic` → `inspiring`

3. **Measure audio durations** and update frame timings
   - Use ffprobe to get exact duration of each clip
   - Calculate frame count per clip: `duration_seconds * 30`
   - Update ScriptLine timings to match audio precisely

### Phase 2: Demo Recording with Playwright (Day 1-2)
**Owner:** CTO Agent

1. **Create Playwright test script**
   - File: `web/tests/record-swc-demo.spec.ts`
   - Target: `https://blockid.au` (production)
   - Viewport: 1920x1080
   - Record flow (synced to Solution section of pitch):

   | Step | Action | Duration | Visual |
   |------|--------|----------|--------|
   | 1 | Load homepage → SVI search visible | 3s | Clean hero shot |
   | 2 | Type "AI-powered marketplace connecting..." | 4s | Typing animation |
   | 3 | Click "Get My SVI" → loading spinner | 2s | Analysis starts |
   | 4 | Results appear → SVI score gauge | 3s | Score reveal moment |
   | 5 | Scroll to dimension breakdown | 3s | 8 dimensions visible |
   | 6 | Scroll to evidence gaps | 2s | Action items visible |
   | 7 | Navigate to Evidence Vault | 3s | Evidence list + Analyze buttons |
   | 8 | Click "Analyze" on an evidence item | 2s | Tier selection modal |
   | 9 | Navigate to Dashboard | 3s | User dashboard overview |
   | 10 | Show Full Report button | 2s | Report generation |

   Total demo: ~27 seconds (will be overlaid on Solution + Traction sections)

2. **Export screenshots** for Remotion ScreenDemo overlay
   - Export key frames as PNG at 1920x1080
   - Store in `web/public/video-assets/screenshots/swc/`

3. **Record video** using Playwright's `page.video()`
   - Output: `web/public/video-assets/demo-swc-raw.webm`
   - Speed up SSE/loading segments to 3-4x

### Phase 3: Remotion Composition (Day 2)
**Owner:** Media Studio Agent

1. **Create SWC composition**
   - File: `web/src/remotion/compositions/PitchVideoSWC.tsx`
   - Register in `web/src/remotion/Root.tsx`
   - 6 scenes synced to voice-over:

   | Scene | Time | Visuals | Audio |
   |-------|------|---------|-------|
   | 1. Opening Hook | 0:00-0:20 | LogoReveal → StatCounter (370K businesses) → dramatic text | Clips 01-03 |
   | 2. Problem | 0:20-0:50 | ComparisonTable (Carta vs BlockID) → "fly blind" text | Clips 04-06 |
   | 3. Solution | 0:50-1:25 | ScreenDemo (Playwright recording) → Evidence Vault demo | Clips 07-10 |
   | 4. Traction | 1:25-1:50 | MetricsGrid (50+ founders, 200+ analyses) → tech stack | Clips 11-13 |
   | 5. Market | 1:50-2:20 | TAMCircles ($4.4T ecosystem) → pricing slide | Clips 14-15 |
   | 6. Close | 2:20-3:00 | DropMic → CTASlide (logo, QR, website) | Clips 16-17 |

2. **Reuse existing components:**
   - `LogoReveal` — Opening
   - `StatCounter` — Metric animations
   - `ScreenDemo` — Browser mockup with demo recording
   - `ComparisonTable` — Carta/Pulley/Cake vs BlockID
   - `TAMCircles` — Market size visualization
   - `MetricsGrid` — Traction metrics
   - `FlowDiagram` — Idea to Exit lifecycle
   - `DropMic` — Closing dramatic text
   - `CTASlide` — End screen with QR code
   - `Subtitle` — Lower-third captions

### Phase 4: Render & Post-Production (Day 2-3)
**Owner:** Media Studio + CTO

1. **Preview in Remotion Studio**
   ```bash
   cd web && npx remotion studio
   ```
   - Check timing sync between voice and visuals
   - Verify ScreenDemo overlay alignment
   - Test all transitions

2. **Render final MP4**
   ```bash
   npx remotion render PitchVideoSWC pitch-swc-sydney.mp4 \
     --codec h264 \
     --crf 18 \
     --pixel-format yuv420p
   ```

3. **Generate captions**
   ```bash
   npx tsx src/remotion/scripts/pitch-swc.ts --srt > public/video-assets/pitch-swc.srt
   npx tsx src/remotion/scripts/pitch-swc.ts --vtt > public/video-assets/pitch-swc.vtt
   ```

4. **Burn-in captions** (optional, for social media)
   ```bash
   ffmpeg -i pitch-swc-sydney.mp4 -vf subtitles=pitch-swc.srt pitch-swc-sydney-captioned.mp4
   ```

5. **Create thumbnail** (1280x720)
   - Frame from the SVI score reveal moment
   - Add text overlay: "BlockID.au — Startup World Cup Sydney 2026"

### Phase 5: Publish & Distribute (Day 3)
**Owner:** CMO

1. Upload to YouTube (unlisted initially)
2. Add to Startup World Cup application
3. Share on LinkedIn with launch post
4. Embed on blockid.au homepage (already has video section)

## Quality Checklist
- [ ] Voice-over clear, natural Australian accent
- [ ] Voice synced with visuals (±0.5s tolerance)
- [ ] Demo recording shows real product (not mockup)
- [ ] All metrics are current (pull from /api/platform-stats)
- [ ] Captions accurate and timed
- [ ] Logo and branding consistent
- [ ] Call-to-action visible in final 10 seconds
- [ ] Audio levels normalized (-14 LUFS)
- [ ] No black frames or rendering artifacts
- [ ] Total duration exactly 180 seconds

## Dependencies
- Existing Remotion components (14 components ready)
- Edge TTS voice generation pipeline (ready)
- Playwright installed in package.json (ready)
- Production site accessible (blockid.au live)
- Pitch script from `app-startup-world-cup.md` (ready)

## Skills Used
- `/media-studio` — Video production, voice, rendering
- `/cto` — Playwright demo recording, Remotion composition
- `/cmo` — Distribution, YouTube, LinkedIn
- `/investor-relations` — Application submission