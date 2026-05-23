# AI Provider Scaling — Always-On Report Generation

## Objective
Ensure BlockID.au can generate full 10/10 page reports 24/7 without rate limiting, using a smart rotation of free and paid AI providers. Target: <A$0.01 per report average cost.

## Current Problem
- Claude OAuth: Best quality (Sonnet 4-6) but rate limited after ~5 calls/session
- TapHoaAPI proxy: 30s gateway timeout + key expired
- Codex GPT: Missing `model.request` scope
- Gemini: Credits depleted
- Result: Only 5-8 out of 10 pages generate before rate limit hits

## Strategy: Multi-Provider Rotation with Fallback

### Tier 1 — Premium (Best Quality)
| Provider | Model | Quality | Rate Limit | Cost |
|----------|-------|---------|------------|------|
| Claude OAuth | claude-sonnet-4-6 | 10/10 | ~5 calls/2min | Free (subscription) |
| Claude OAuth | claude-haiku-4-5 | 7/10 | ~10 calls/2min | Free |

### Tier 2 — Free High-Quality (Research needed)
| Provider | Model | Quality | Rate Limit | Cost |
|----------|-------|---------|------------|------|
| Groq | llama-3.3-70b | 8/10 | 30 req/min | Free |
| Cerebras | llama-3.3-70b | 8/10 | 30 req/min | Free |
| SambaNova | llama-3.1-405b | 9/10 | TBD | Free |
| OpenRouter | gemini-flash-1.5 | 7/10 | 20 req/min | Free |

### Tier 3 — Paid Fallback
| Provider | Model | Quality | Rate Limit | Cost |
|----------|-------|---------|------------|------|
| TapHoaAPI | claude-haiku-4.5 | 7/10 | 30s timeout | Pay per key |
| Anthropic Key | claude-sonnet | 10/10 | 1000 req/min | A$0.003/1K tokens |

## Implementation Plan

### Phase 1: Smart Rotation (CTO)
- [ ] Add Groq as provider in ai-client.ts
- [ ] Add Cerebras as provider
- [ ] Add SambaNova as provider  
- [ ] Implement round-robin rotation per page (alternate providers)
- [ ] Add provider health tracking (success rate per provider)

### Phase 2: Per-Page Provider Selection (CTO)
- [ ] Critical pages (Executive, Market, Competition) → Sonnet/best model
- [ ] Standard pages (Product, Business, Team) → Groq/Llama 70B
- [ ] Simple pages (Risk, Recommendations) → Haiku/fast model
- [ ] Dynamic fallback chain per page

### Phase 3: Rate Limit Aware Scheduling (CTO)
- [ ] Track calls per provider per minute
- [ ] Auto-switch to next provider when approaching limit
- [ ] Exponential backoff with provider rotation
- [ ] Queue system for concurrent user requests

### Phase 4: Cost Optimization (CFO)
- [ ] Track AI cost per report (provider + model + tokens)
- [ ] Dashboard showing cost per page, per provider
- [ ] Alert when free tiers approaching limits
- [ ] Monthly cost projection

## C-Level Sub-Goals

### CTO — Technical Implementation
- [ ] Research and test free providers (Groq, Cerebras, SambaNova)
- [ ] Add new providers to ai-client.ts workerFetch
- [ ] Implement per-page provider rotation
- [ ] Rate limit tracking and auto-switching
- [ ] AI Token Guardian enhancement (monitor all providers)
- [ ] Achieve 10/10 AI pages on every report

### CPO — Product Quality
- [ ] A/B test report quality: Claude Sonnet vs Llama 70B vs Gemini
- [ ] Define minimum quality threshold per page
- [ ] User feedback mechanism on report quality
- [ ] Automatic quality scoring (check word count, JSON validity, narrative flow)

### CFO — Cost Management
- [ ] Track cost per report (tokens × price per provider)
- [ ] Free tier budget monitoring (Groq, Cerebras daily limits)
- [ ] Revenue vs AI cost ratio dashboard
- [ ] Alert system when approaching free tier limits

### CRO — Conversion Impact
- [ ] Measure report completion rate (10/10 pages vs partial)
- [ ] Track conversion: full report → paid upgrade
- [ ] A/B test: quality impact on conversion rate

### COO — Operations
- [ ] Monitor provider uptime and response times
- [ ] Alert system for provider failures
- [ ] Weekly provider performance report
- [ ] Backup plan: manual report queue if all providers down

## Architecture: Round-Robin Per Page

```
Report Request (10 pages)
  │
  ├─ Page 1 (Executive)  → Claude Sonnet (best quality)
  ├─ Page 2 (Market)     → Groq Llama-70B (fast + free)
  ├─ Page 3 (Product)    → Claude Sonnet (rotate back)
  ├─ Page 4 (Business)   → Cerebras Llama-70B (fast + free)
  ├─ Page 5 (Competition)→ Claude Sonnet (critical page)
  ├─ Page 6 (Traction)   → SambaNova Llama-405B (best free)
  ├─ Page 7 (Team)       → Groq Llama-70B
  ├─ Page 8 (Financial)  → Claude Haiku (fast)
  ├─ Page 9 (Risk)       → Cerebras Llama-70B
  └─ Page 10 (Recs)      → Claude Sonnet (final impression)
  
Total time: ~60-90s (parallel where possible)
Cost: ~A$0.002 per report (mostly free)
```

## Acceptance Criteria
1. 10/10 pages AI-generated on every report
2. No report takes longer than 3 minutes
3. Average cost < A$0.01 per report
4. 99.5% report completion rate
5. Provider failover < 5s