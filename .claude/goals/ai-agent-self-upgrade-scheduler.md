# Goal: AI Agent Self-Upgrade Scheduler

## Mission
Enable BlockID AI agents to self-research and self-upgrade without impacting user-facing operations, rate limits, or development work. Use subscription-based AI models (Claude Code CLI, Codex CLI OAuth) for self-improvement tasks — zero additional API cost.

## Architecture

### AI Model Usage Tiers
```
TIER 1 — User-facing reports (priority: highest)
  Model: Claude Sonnet (heavy) / Haiku (quick)
  Source: Claude CLI OAuth → API key → Proxy fallback
  Budget: $100/month cap
  Hours: 24/7 (always available for users)

TIER 2 — Agent self-upgrade tasks (priority: low)
  Model: Claude CLI OAuth (subscription — $0 extra cost)
  Fallback: Gemini Flash (free), Groq (free), OpenRouter (free)
  Schedule: Off-peak hours only (10pm-6am AEST, weekends)
  Rate: Max 5 requests/hour for upgrades
  
TIER 3 — Background analytics & cron (priority: lowest)
  Model: Gemini Flash (free tier) / Groq (free)
  Schedule: Daily crons at 2am-4am AEST
  Rate: Max 2 requests/minute
```

### Self-Upgrade Task Types

| Task | Agent | Schedule | Model | Est. Tokens |
|------|-------|----------|-------|-------------|
| Competitor pricing check | CFO | Weekly Mon 2am | Gemini Flash | ~2K |
| SEO keyword ranking update | CMO | Weekly Tue 2am | Gemini Flash | ~3K |
| Security header audit | CISO | Daily 3am | None (curl) | 0 |
| Data quality check | CDO | Daily 3:30am | None (SQL) | 0 |
| Report quality sampling | COO | Weekly Wed 2am | Claude CLI | ~4K |
| Prompt optimization test | CTO | Bi-weekly Sat 2am | Claude CLI | ~5K |
| Content gap analysis | CMO | Weekly Thu 2am | Gemini Flash | ~3K |
| AI cost tracking | CFO | Daily 4am | None (file read) | 0 |

### Cost Optimization Rules
1. **Subscription first**: Claude CLI OAuth and Codex CLI OAuth are subscription — zero per-call cost
2. **Free tiers second**: Gemini Flash (15 RPM free), Groq (30 RPM free), OpenRouter (free models)
3. **Paid API last**: Only use ANTHROPIC_API_KEY / OPENAI_API_KEY when subscription unavailable
4. **Budget guard**: Self-upgrade tasks NEVER use paid API if monthly budget >80% consumed
5. **Batch requests**: Combine multiple small checks into one AI call where possible

### Implementation: Cron-Based Scheduler

Use existing `/api/cron/` infrastructure with CRON_SECRET auth:

```
/api/cron/agent-upgrade — Master scheduler
  ├── Check if off-peak hours (AEST)
  ├── Check if user-facing load is low
  ├── Check AI budget remaining
  ├── Run scheduled upgrade tasks
  └── Log results to growth_insights table
```

### Rate Limit Separation
```
User requests:    Unlimited (within plan limits)
Agent upgrades:   5 requests/hour max
Cron background:  2 requests/minute max

Key: rate-limit store separates user vs agent keys:
  "user:{ip}" — user rate limits
  "agent:{task}" — agent self-upgrade limits  
  "cron:{job}" — cron job limits
```

## Files to Create/Modify

| File | Change |
|------|--------|
| `web/src/app/api/cron/agent-upgrade/route.ts` | New: master scheduler |
| `web/src/lib/ai-client.ts` | Add `callAIForUpgrade()` that prefers free/subscription models |
| `web/src/lib/rate-limit.ts` | Add agent/cron rate limit keys |

## Success Criteria
- [ ] Self-upgrade tasks run without using paid API budget
- [ ] User-facing requests never impacted by agent tasks
- [ ] Zero additional AI cost from self-upgrade (subscription + free only)
- [ ] All upgrade results logged for audit