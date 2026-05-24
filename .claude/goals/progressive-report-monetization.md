# Progressive Report Monetization

## Goal
Replace the all-or-nothing "Unlock Full Report" (2-5 credits) with a progressive,
per-section model that generates 3-5 free summary pages upfront, then lets users
unlock individual sections on demand — paying only for what they need.

## Business Logic

### Tier 1: Free Preview (0 credits)
Generated automatically after every SVI analysis:
- Executive Summary (~300 words) — always free
- SVI Score Breakdown (radar chart + dimension scores) — already shown
- Top 3 Gaps & Next Steps (~200 words) — already shown

### Tier 2: Included Sections (0.50 credits — paid with SVI analysis)
3-5 additional summary sections (~200 words each, auto-generated):
- Market & Problem (summary)
- Product & Technical (summary)
- Traction & Revenue (summary)
- Risk Assessment (summary)
- 30-Day Quick Wins (summary)

These are SHORT summaries — the "hook" that shows value and invites deeper unlock.

### Tier 3: Per-Section Deep Dive (pay per section)
User sees summary → clicks "Read full analysis" → sees credit cost → confirms → generates.

| Section | Summary (included) | Full Analysis | Credit Cost |
|---------|-------------------|---------------|-------------|
| Executive Summary | ~300 words (free) | ~1500 words | 0.50 cr |
| Founder & Team | ~200 words | ~1200 words | 0.50 cr |
| Market Opportunity | ~200 words | ~1500 words | 0.75 cr |
| Product & Tech | ~200 words | ~1200 words | 0.50 cr |
| Traction & Revenue | ~200 words | ~1500 words | 0.75 cr |
| Go-to-Market | ~200 words | ~1200 words | 0.50 cr |
| Cap Table & Governance | ~200 words | ~1000 words | 0.50 cr |
| Investor Readiness | ~200 words | ~1200 words | 0.50 cr |
| Legal & Compliance | ~200 words | ~1000 words | 0.50 cr |
| Strategic Vision & Moat | ~200 words | ~1200 words | 0.50 cr |
| Financial Projections | ~200 words | ~1500 words | 0.75 cr |
| Risk & Mitigation | ~200 words | ~1200 words | 0.50 cr |
| Competitive Intelligence | locked | ~1500 words | 0.75 cr |
| 90-Day Roadmap | locked | ~1500 words | 0.75 cr |
| Board-Ready Summary | locked | ~1000 words | 1.00 cr |
| AU Market Deep Dive | locked | ~1500 words | 1.00 cr |

### Tier 4: Full Report Bundle (discount)
"Unlock All Remaining" button — total of all unpurchased sections at 30% discount.
Typical: ~5.00 credits for all 16 sections (vs ~9.50 individual).

## API Design

### POST /api/svi/report-section
```json
Request:  { sectionId: "market", depth: "full" }
Response: { ok, content, wordCount, creditsCost }
```
- Generates ONE section at a time (fast, no timeout issues)
- Each AI call: ~30s, ~1500 words, within rate limits
- Credit charged AFTER successful generation

### GET /api/svi/report-estimate
```json
Request:  ?sections=market,product,traction
Response: { sections: [...], totalCredits: 2.00, totalWords: ~4500 }
```
- Preview cost before purchase — transparent pricing

## UI Flow

```
┌──────────────────────────────────────────────────┐
│ Your SVI Report                    [12 sections] │
│                                                  │
│ ✅ Executive Summary              FREE    300w   │
│    Full markdown content shown here...           │
│                                                  │
│ ✅ Market & Problem               INCLUDED 200w  │
│    Brief summary shown...                        │
│    ┌──────────────────────────────────┐          │
│    │ 🔓 Read full analysis (0.75 cr) │          │
│    │    ~1,500 words · Market sizing, │          │
│    │    TAM/SAM, validation evidence  │          │
│    └──────────────────────────────────┘          │
│                                                  │
│ 🔒 Competitive Intelligence       LOCKED         │
│    ┌──────────────────────────────────┐          │
│    │ 🔓 Unlock (0.75 cr)            │          │
│    │    ~1,500 words · Named comps,  │          │
│    │    feature comparison, moat     │          │
│    └──────────────────────────────────┘          │
│                                                  │
│ ┌────────────────────────────────────────┐       │
│ │ Unlock All Remaining (5.00 cr)  Save 30% │    │
│ └────────────────────────────────────────┘       │
└──────────────────────────────────────────────────┘
```

## Implementation Plan

### File Changes
1. `web/src/app/api/svi/report-section/route.ts` — NEW: per-section generation
2. `web/src/app/api/svi/report-estimate/route.ts` — NEW: cost preview  
3. `web/src/lib/report-sections.ts` — NEW: section definitions, prompts, pricing
4. `web/src/components/svi/svi-results-panel.tsx` — MODIFY: replace FullReportBanner
5. `web/src/lib/credits.ts` — MODIFY: add per-section costs

### Key Constraints
- Each section generated independently (~30s each, no timeout issues)
- Summary sections auto-generated with SVI analysis (no extra cost)
- Full sections generated on-demand (1 AI call per section)
- Credit cost shown BEFORE generation (transparent pricing rule)
- "Unlock All" bundle at 30% discount
- Generated sections cached in component state + localStorage