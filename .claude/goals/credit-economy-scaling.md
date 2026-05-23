# Goal: Credit Economy & Scaling

## Mission
Design credit system and request handling so BlockID scales from 50 to 50,000 users without degrading quality or frustrating users with timeouts.

## Key Rules
1. **Report caching**: Check if identical report exists before regenerating (0 credits for cached)
2. **Rate limiting**: Per-user limits by plan tier (Free: 5/hr, Founding: 20/hr, Growth: 50/hr)
3. **Request chunking**: Each section = 1 AI call (max 30s), not whole report
4. **Transparent pricing**: Show cost BEFORE every charge
5. **Progressive delivery**: SVI score (free, <5s) → Preview (free, <60s) → Sections (credits, on-demand)
6. **AI model selection**: Cheapest model per depth tier (Haiku for scan, Sonnet for expert)

## Implementation Priority
- P0: Report history on dashboard + cache check before generation
- P1: SVI-to-AUD valuation card
- P2: Rate limit middleware on all AI endpoints
- P3: Google Drive doc generation per report