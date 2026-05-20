# Media Studio — Detailed Sub-Goals

## Goal MEDIA-1: Setup & Foundation (Week 1-2)

### MEDIA-1.1: Remotion Installation [Week 1]
- [ ] npm install remotion @remotion/cli @remotion/player
- [ ] Create directory: web/src/remotion/
- [ ] Create Root.tsx entry point
- [ ] Create brand.ts (BlockID colors: #3B7DD8 brand, #0B1220 ink, #FBBF24 gold)
- [ ] Create remotion.config.ts
- [ ] Verify: npx remotion preview works
- **Delegated skills**: /cto build

### MEDIA-1.2: Base Components [Week 1-2]
- [ ] LogoReveal.tsx — BlockID logo entrance animation (fade + scale, 2s)
- [ ] MetricCounter.tsx — Counting number animation (0→175 SVI, 0→$500 MRR)
- [ ] SlideTransition.tsx — Smooth fade/slide between scenes
- [ ] LowerThird.tsx — Name/title overlay bar (for presenter identification)
- [ ] CTAOverlay.tsx — End screen: logo + URL + "Try free" button
- [ ] ChartAnimation.tsx — Animated bar chart (for SVI dimension scores)
- [ ] ScreenCapture.tsx — Wrapper for browser recording overlay
- [ ] TextReveal.tsx — Character-by-character text reveal animation
- **Delegated skills**: /ui-ux-pro-max (design), /cto build (implementation)

### MEDIA-1.3: Voice Setup [Week 1]
- [ ] Create ElevenLabs account (elevenlabs.io)
- [ ] Configure "BlockID Narrator" voice (professional, neutral Australian English)
- [ ] Test synthesis: "BlockID helps founders value their startup from day one"
- [ ] Create utility: web/src/lib/voice.ts (generate audio from script)
- [ ] Estimate per-video cost (ElevenLabs pricing)

## Goal MEDIA-2: Pitch Videos (Week 2-4)

### MEDIA-2.1: 1-Minute Pitch Video [Week 2]

**Script (60 seconds):**
```
[0:00-0:05] Logo reveal animation
            "BlockID.au"

[0:05-0:15] Problem (voice-over + text animation)
            "Every startup begins with an idea.
             But how do you know if it's worth building?
             How do you split equity? Track growth? Get investor-ready?"

[0:15-0:30] Solution demo (screen recording)
            User types idea → SVI analysis runs (show status bar:
            "Researching market..." → "Analyzing competition..." → "Generating report...")
            → Score reveals: "SVI 142 ▲"

[0:30-0:45] Features montage (quick cuts, 3s each)
            → 10-page report scrolling
            → Evidence vault with badge earned
            → Cap table tool
            → Pricing: "A$1 per analysis"

[0:45-0:55] Value proposition (voice-over)
            "BlockID values your startup from Day 0.
             AI agents research your market, score your readiness,
             and grow with you to fundraise."

[0:55-1:00] CTA end screen
            Logo + "blockid.au" + "Value your idea free"
```

**Production steps:**
- [ ] Record screen demo with Playwright (SVI analysis flow on blockid.au)
- [ ] Generate voice-over with ElevenLabs (60s narration)
- [ ] Compose in Remotion: PitchVideo1Min.tsx
- [ ] Add captions (burned-in, white text with dark shadow)
- [ ] Render at 1920x1080, 30fps, MP4
- [ ] Review and iterate
- **Deliverable**: MP4 (60s, 1080p, captioned)
- **Delegated skills**: /cto (Playwright recording), /ui-ux-pro-max (visual design)

### MEDIA-2.2: 3-Minute Product Demo [Week 3-4]

**Script (180 seconds):**
```
[0:00-0:10] Logo + "The AI-powered startup valuation platform"

[0:10-0:30] Problem statement (voice-over + animated text)
            "You're building with ChatGPT. You're coding with Cursor.
             But when it comes to valuing your company, splitting equity
             with co-founders, and preparing for investors — where do you go?"

[0:30-0:45] Solution intro
            "BlockID.au — where AI meets startup valuation.
             Built specifically for the problems AI chat can't solve."

[0:45-1:15] Demo Part 1: SVI Analysis
            → Navigate to blockid.au
            → Type idea: "An AI platform for Australian startups..."
            → Show input type detection badge: "Idea Analysis"
            → Click "Get My SVI"
            → Show SSE status bar live: "Analyzing...", "Researching market..."
            → Report appears: scroll through Executive Summary, Market, Product

[1:15-1:35] Demo Part 2: Report Deep Dive
            → Show SVI score with delta: "SVI 142 ▲ +12 vs previous"
            → Show dimension breakdown with info tooltips
            → Show action buttons on recommendations
            → "Each recommendation has a direct action button"

[1:35-1:55] Demo Part 3: Evidence & Growth
            → Navigate to Evidence Vault
            → Upload pitch deck → toast: "SVI +8 points → New score: 150"
            → Show badge earned: "Pitch Ready"
            → Show Living Report on dashboard

[1:55-2:15] Demo Part 4: Equity Tools
            → Cap table tool → split equity between founders
            → Dilution calculator → show investor impact
            → "All tools feed back into your SVI score"

[2:15-2:35] Pricing & Plans
            → "Start free — first analysis on us"
            → "A$1 per additional analysis (early-bird)"
            → "A$49 Founder plan — 100 credits, lifetime access"
            → "A$99/mo Growth — 200 credits/month, everything included"

[2:35-2:50] Roadmap tease
            → "Coming soon: Cosmos blockchain tokenization,
               investor matching, automated dividends"

[2:50-3:00] CTA
            → Logo + "blockid.au"
            → "Value your idea today. First analysis is free."
            → "Where AI meets startup valuation"
```

**Production steps:**
- [ ] Script full Playwright recording sequence (12 screen interactions)
- [ ] Record each demo section separately (easier to re-record)
- [ ] Generate voice-over (180s narration, ElevenLabs)
- [ ] Build Remotion composition: ProductDemo3Min.tsx
- [ ] Add callout annotations (arrows, highlights on key UI elements)
- [ ] Add captions
- [ ] Render at 1920x1080, 30fps, MP4
- **Deliverable**: MP4 (3 min, 1080p, captioned, annotated)
- **Delegated skills**: /cto (Playwright), /ui-ux-pro-max (annotations), /investor-relations (script review)

### MEDIA-2.3: Accelerator Demo Day Video [Week 4]

**Script (60 seconds):**
```
[0:00-0:05] AI avatar (CEO): "Hi, I'm Do Van Long, founder of BlockID.au"
[0:05-0:15] Problem: "80% of AU startups fail because they can't prove their value"
[0:15-0:25] Solution: "BlockID is an AI platform that values startups from Day 0"
[0:25-0:40] Demo: Condensed SVI flow (15s screen recording)
[0:40-0:50] Traction: Animated counters (users, analyses, MRR)
[0:50-0:55] Ask: "We're raising A$X for Y"
[0:55-1:00] Logo + URL + "blockid.au"
```

- [ ] Generate CEO AI avatar with HeyGen (or D-ID)
- [ ] Record condensed screen demo (15s)
- [ ] Splice avatar + demo + metrics
- [ ] Add captions
- **Deliverable**: MP4 (60s, 1080p, avatar + demo)
- **Delegated skills**: /investor-relations (script), /cto (demo recording)

## Goal MEDIA-3: Social Content Pipeline (Weekly, Q3 2026)

### MEDIA-3.1: LinkedIn Video Templates
- [ ] MetricHighlight template: "X analyses this week" (15s, animated counter)
- [ ] FeatureSpotlight template: Single feature showcase (30s)
- [ ] BeforeAfter template: "SVI 85 → 175" story (30s)
- [ ] TestimonialCard template: User quote + avatar (15s)

### MEDIA-3.2: Weekly Content Calendar
| Week | Video | Platform | Duration |
|------|-------|----------|----------|
| 1 | "We launched BlockID.au" announcement | LinkedIn | 30s |
| 2 | "What is SVI?" explainer | LinkedIn + Twitter | 30s |
| 3 | Feature: Evidence Vault | LinkedIn | 30s |
| 4 | Before/After: SVI improvement | LinkedIn + IG | 30s |

### MEDIA-3.3: ProductHunt Launch Video [Q4]
- [ ] 90-second launch video
- [ ] Problem → Solution → Demo → Social proof → CTA
- [ ] Optimized thumbnail (1280x720)
- [ ] Maker comment script

## Goal MEDIA-4: AI Avatar Pipeline (Q4 2026)
- [ ] CEO avatar (Do Van Long) trained on HeyGen
- [ ] Product Expert avatar created
- [ ] Multi-language test: English + Vietnamese
- [ ] Automated weekly metric video (Remotion + cron + data from /analytics)

## Cross-Agent Dependencies
| Need | From Agent | Skill | When |
|------|-----------|-------|------|
| Demo recording | CTO | /cto + Playwright | Every demo video |
| Script review | IR | /investor-relations | Pitch + demo day videos |
| Brand design | CPO | /ui-ux-pro-max | Every visual asset |
| Metrics data | CRO | /analytics | Metric highlight videos |
| Market copy | CMO | /cmo | Problem statement scripts |
| Financial data | CFO | /cfo revenue | Traction slides |

## Quality Checklist (every video)
- [ ] 1080p minimum resolution
- [ ] Burned-in captions (white + dark shadow)
- [ ] BlockID.au watermark (bottom-right, subtle)
- [ ] CTA at end with URL
- [ ] Brand colors consistent (#3B7DD8, #0B1220, #FBBF24)
- [ ] Audio: -14 LUFS (broadcast standard)
- [ ] Duration matches target (±5%)