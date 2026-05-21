# Goal: Antler Pitch Deck — Professional, Investor-Ready Design

## Mission
Create a visually stunning, investor-grade pitch deck for the Antler Australia pre-seed application (cohort starting 27 July 2026). The deck must be professional, compelling, and aligned with Antler's investment thesis. Use the full BlockID agent team to produce every element.

## Source Content
- [Pitch Deck v1 Outline](../../web/content/pitch/pitch-deck-v1.md) — Full 12-slide script with speaker notes
- [Antler Application](../../web/content/pitch/antler-application.md) — Complete application answers
- [Directory Profile Content](directory-profile-content.md) — Traction data, descriptions
- [MASTER-VISION.md](MASTER-VISION.md) — Market data, TAM/SAM/SOM, roadmap

## Target Audience
Antler Australia partners evaluating pre-seed investments. They look for:
- **Founder quality**: Can this person execute? (Do Van Long = solo founder + live product)
- **Market size**: Is this a big enough opportunity? (A$15B AU startup ecosystem)
- **Traction**: Is there evidence of progress? (50+ founders, 200+ analyses, $2M+ tracked)
- **Product depth**: Is this more than a pitch? (Live product at blockid.au)
- **Scalability**: Can this reach $100M+ ARR? (8-phase roadmap to Unicorn)

## Slide-by-Slide Agent Assignments

| Slide | Title | Agent Owner | Design Skill |
|-------|-------|-------------|-------------|
| 1 | Title/Hero | CMO + Media Studio | `/ui-ux-pro-max` — brand identity, hero layout |
| 2 | The Problem | CMO + RnD | `/media-studio` — infographic, statistics visualization |
| 3 | The Solution | CTO + CPO | `/ui-ux-pro-max` — product screenshots, SVI flow diagram |
| 4 | How It Works | CTO | `/architecture-designer` — system architecture visual |
| 5 | Traction | CRO + CDO | `/analytics` — metrics dashboard mockup |
| 6 | Market Opportunity | CMO + CFO | `/cmo` — TAM/SAM/SOM circles, market data |
| 7 | Business Model | CFO + CRO | `/cfo` — pricing tiers, unit economics |
| 8 | Competition | CMO + RnD | `/rnd` — competitive landscape matrix |
| 9 | Team | CHRO + CPO | `/ui-ux-pro-max` — founder profile, AI team visualization |
| 10 | Roadmap | COO + CTO | `/coo` — 8-phase timeline, milestones |
| 11 | The Ask | CFO + IR | `/investor-relations` — use of funds, raise details |
| 12 | Call to Action | CEO + CMO | `/media-studio` — memorable closing, contact info |

## Design Principles (Antler-aligned)

### Visual Style
- **Clean, minimal, modern** — no clutter, max 5 bullet points per slide
- **Brand colors**: BlockID blue (#2563EB), dark navy (#0F172A), white (#F8FAFC)
- **Typography**: Bold headlines (32-40pt), clean body (18-22pt)
- **Data visualization**: Large numbers, simple charts, infographics over tables
- **Screenshots**: Real product screenshots from blockid.au (not mockups)
- **Consistency**: Same layout grid, same font hierarchy across all slides

### Content Rules
- Every slide tells ONE story
- Lead with the number/stat, then explain
- No walls of text — use visuals + bullet points
- Speaker notes carry the narrative depth
- "Live Product" badge visible throughout

### Antler-Specific Adaptations
- Emphasize **founder capability** (built entire product solo)
- Show **product-market fit signals** (50+ users, 200+ analyses)
- Highlight **Australian market focus** (Antler AU thesis alignment)
- Include **scalability path** (8-phase roadmap, Cosmos blockchain)
- Address **defensibility** (proprietary SVI algorithm, multi-model AI, data moat)

## Implementation Options

### Option A: Remotion (Code-Based Video Slides)
- Use existing Remotion setup in `web/src/remotion/`
- Animated transitions, live data integration
- Export as video (MP4) for Antler video requirement
- Export static frames as PDF pitch deck

### Option B: React PDF (Static PDF)
- Use existing `@react-pdf/renderer` setup
- Professional PDF output matching brand
- Programmatic generation from pitch content
- Can be generated on-demand with live data

### Option C: Design Template (Figma/Canva export)
- Use `/ui-ux-pro-max` to define exact layout specs
- Design in Figma/Canva, export as PDF
- Most visually flexible, requires manual design

**Recommended**: Option A (Remotion) for video + Option B (React PDF) for static deck. Both should be generated from the same content source.

## Deliverables
1. [ ] 12-slide PDF pitch deck (A4 landscape, print-ready)
2. [ ] 3-minute pitch video (Remotion animated, MP4)
3. [ ] Speaker notes document (markdown, per-slide)
4. [ ] One-pager executive summary (PDF, for follow-up emails)
5. [ ] Product demo screenshots (5 key screens from blockid.au)

## Success Criteria
- [ ] All 12 slides complete with real data and product screenshots
- [ ] Consistent brand design across all slides
- [ ] AU compliance disclaimer on financial slides
- [ ] Speaker notes align with Antler application answers
- [ ] Video under 3 minutes with clear narrative arc
- [ ] PDF file size under 10MB