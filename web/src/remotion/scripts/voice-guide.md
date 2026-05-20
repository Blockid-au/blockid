# Voice-Over Production Guide

## Voice Profile

- **Accent**: Australian English (neutral, professional — Sydney/Melbourne standard)
- **Gender**: Male (match founder Do Van Long)
- **Tone**: Startup founder — confident, inspiring, knowledgeable, never salesy
- **Speed**: 140-160 words per minute (moderate pace, clear enunciation)
- **Model**: ElevenLabs `eleven_multilingual_v2`
- **Voice ID**: Select a voice with warm, authoritative male quality (e.g., "Daniel" or custom clone)
- **Stability**: 0.50 (natural variation)
- **Similarity Boost**: 0.75 (close to selected voice)
- **Style**: 0.40 (moderate expressiveness)

---

## Emotion Markers

Each `ScriptLine` in the data files has an `emotion` field. Use these to control ElevenLabs synthesis parameters and post-production adjustments:

### [NEUTRAL]
- **When**: Logo reveals, silent visuals, CTA end cards
- **Voice**: Calm, steady, professional
- **Speed**: Normal (150 WPM)
- **ElevenLabs stability**: 0.60
- **Notes**: Clean read, no emotional emphasis

### [URGENT]
- **When**: Problem statistics — failure rates, money lost, businesses closed
- **Voice**: Serious, concerned but not alarming. Weight on the numbers.
- **Speed**: Slightly faster (155 WPM) to build tension
- **ElevenLabs stability**: 0.45 (slightly more variation)
- **Emphasis words**: "fail", "closed", "ninety percent", dollar amounts
- **Notes**: Lower pitch slightly. Let the data do the emotional work. Don't overdramatize.

### [INSPIRING]
- **When**: Founder story, vision, roadmap, market opportunity
- **Voice**: Warm, authentic, relatable. Like talking to a friend about your dream.
- **Speed**: Normal (150 WPM)
- **ElevenLabs stability**: 0.50
- **Emphasis words**: "vision", "platform", "from idea to IPO"
- **Notes**: Slight smile in voice. Genuine excitement without hype.

### [EXCITED]
- **When**: Product demo, feature reveals, "watch this" moments
- **Voice**: Energetic, forward-leaning, "wait till you see this" energy
- **Speed**: Slightly faster (155-160 WPM) to match demo energy
- **ElevenLabs stability**: 0.40 (more natural variation)
- **Emphasis words**: "action", "automatically", "under a minute", "right there"
- **Notes**: Higher pitch than baseline. Natural enthusiasm. Imagine demoing to a friend.

### [DRAMATIC]
- **When**: Drop mic sequence — the final emotional punch
- **Voice**: Slow, deliberate, powerful. Each word lands with weight.
- **Speed**: 30% slower than normal (100-110 WPM)
- **ElevenLabs stability**: 0.65 (more controlled, deliberate)
- **Emphasis words**: Every word matters. "Until now" gets the most weight.
- **Notes**: Lower register. Measured delivery. Think keynote closing moment. Let silence do the work between lines.

---

## Pause Guide

Pauses are critical for pacing. Insert silence in the audio track at these points:

| Pause Type | Duration | When to Use |
|------------|----------|-------------|
| **Micro pause** | 0.3s | Between clauses within a sentence |
| **Short pause** | 0.5s | Between sentences within the same topic |
| **Medium pause** | 1.0s | Between topic transitions (e.g., Problem -> Solution) |
| **Long pause** | 1.5s | Before drop mic lines, before key reveals |
| **Dramatic pause** | 2.0s | After "Until now." — let it sink in |
| **Section break** | 1.0-1.5s | Between major sections (marked in SECTIONS array) |

### Specific Pause Placements

**1-Minute Video:**
- 0.5s after "Ninety percent of startups fail." (let it land)
- 0.3s after "In Australia" (geographic emphasis)
- 1.0s before "BlockID changes this." (transition to solution)
- 0.5s after "From Day Zero." (emphasis)
- 1.5s before "AI builds products." (build anticipation)
- 0.5s between "AI builds products." and "BlockID builds businesses." (contrast)

**3-Minute Video:**
- 1.0s after "Nothing builds businesses." (section transition)
- 0.5s after "I'm Do Van Long" (name recognition)
- 1.0s before "BlockID solves all three." (setup the demo)
- 0.3s between each SSE status description (match on-screen animation)
- 1.5s before "But we're just getting started." (shift to vision)
- 0.5s between each roadmap phase (pacing)
- 2.0s of silence before drop mic section begins (dramatic build)
- 1.5s between each drop mic line
- 2.0s after "Until now." (the biggest pause in the video)
- 1.0s before CTA begins (emotional reset)

---

## Pronunciation Guide

| Word/Phrase | Pronunciation | Notes |
|-------------|---------------|-------|
| BlockID | "Block-Eye-Dee" | Two distinct syllables for "ID" |
| .au | "dot-ay-you" | Spell out the TLD |
| SVI | "Ess-Vee-Eye" | Spell out, don't say "svee" |
| AI | "Ay-Eye" | Always spell out |
| ASIC | "Ay-sick" | Australian Securities Commission |
| ESIC | "Ee-sick" | Early Stage Innovation Company |
| ESOP | "Ee-sop" | Employee Share Option Plan |
| Cosmos | "Koz-mos" | Blockchain network |
| Qapita | "Kah-pee-tah" | Competitor name |
| Carta | "Kar-tah" | Competitor name |
| Pulley | "Pull-ee" | Competitor name |
| TAM | "Tam" | Total Addressable Market |
| SAM | "Sam" | Serviceable Addressable Market |
| SOM | "Som" | Serviceable Obtainable Market |
| Auschain | "Oz-chain" | Parent company |
| Do Van Long | "Doh Van Long" | Founder name — Vietnamese pronunciation |

---

## Audio Technical Specs

| Parameter | Value |
|-----------|-------|
| Format | WAV (production), MP3 (preview) |
| Sample rate | 44,100 Hz |
| Bit depth | 16-bit |
| Channels | Mono (voice-over) |
| Loudness | -14 LUFS (broadcast standard) |
| True peak | -1 dBTP maximum |
| Noise floor | Below -60 dB |

---

## ElevenLabs API Integration

```typescript
// Example ElevenLabs synthesis call
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
  {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: scriptLine.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: emotionSettings[scriptLine.emotion].stability,
        similarity_boost: 0.75,
        style: emotionSettings[scriptLine.emotion].style,
        use_speaker_boost: true,
      },
    }),
  },
);
```

### Emotion-to-Settings Map

```typescript
const emotionSettings = {
  neutral:   { stability: 0.60, style: 0.30, speed: 1.00 },
  urgent:    { stability: 0.45, style: 0.50, speed: 1.05 },
  inspiring: { stability: 0.50, style: 0.45, speed: 1.00 },
  excited:   { stability: 0.40, style: 0.55, speed: 1.08 },
  dramatic:  { stability: 0.65, style: 0.60, speed: 0.70 },
};
```

---

## Production Workflow

1. **Script validation**: Run `PITCH_1MIN_WORD_COUNT` and `PITCH_3MIN_WORD_COUNT` exports to verify pacing
2. **Per-line synthesis**: Generate each `ScriptLine` as a separate audio clip with emotion-appropriate settings
3. **Silence insertion**: Add pauses between clips per the Pause Guide above
4. **Assembly**: Concatenate clips with pauses into full voice-over track
5. **Normalization**: Apply -14 LUFS loudness normalization to final track
6. **Sync check**: Align audio timestamps with `startTime`/`endTime` from script data
7. **Caption export**: Use `generateSRT()` and `generateVTT()` functions to create caption files
8. **Review**: Play back with Remotion preview to verify audio-visual sync

---

## File Reference

| File | Content |
|------|---------|
| `pitch-1min.ts` | 60-second script data + SRT/VTT generators |
| `pitch-3min.ts` | 180-second script data + section markers |
| `voice-guide.md` | This file — voice synthesis instructions |

---

## Quality Checklist

- [ ] Every second of video has a corresponding `ScriptLine` (no gaps)
- [ ] All statistics have `source` citations
- [ ] Word count matches target WPM for video duration
- [ ] Pronunciation guide covers all non-obvious terms
- [ ] Pause durations match the Pause Guide
- [ ] Emotion markers are consistent with section tone
- [ ] SRT/VTT output validates against W3C standards
- [ ] Audio loudness meets -14 LUFS broadcast standard
- [ ] No line exceeds 15 seconds (keeps captions readable)
- [ ] Drop mic section has minimum 1.5s pauses between lines
