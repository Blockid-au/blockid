# Goal: AI Customer Care Agent — Proactive Startup Intelligence

## Mission
Build an AI agent system that proactively researches market trends, new business opportunities, and competitor updates relevant to each user's startup idea — then delivers personalized insights via dashboard notifications and email. Users feel BlockID is actively working for them even when they're not logged in.

## Org Position
```
Founder & CEO
└── CRO (Chief Revenue Officer)
    └── Customer Success Lead (/customer-success)
        └── AI Customer Care Agent ← THIS ROLE
            ├── Market Intelligence Bot (research new businesses/trends)
            ├── Competitor Watch Bot (track competitor changes)
            └── Opportunity Alert Bot (find partnerships/grants/events)
```

## How It Works

```
User submits startup idea → BlockID stores idea context
  ↓
Weekly cron: AI Customer Care Agent
  ↓
For EACH active user:
  1. Extract keywords from their latest SVI analysis
  2. Research market using AI (callAIForUpgrade — free models)
  3. Compare findings to user's idea (>70% relevance threshold)
  4. If relevant: create insight + notification + optional email
  ↓
User logs in → sees "New insights for your startup" on dashboard
  OR
User gets email: "Market update relevant to [their startup]"
```

## Data Model

### Table: `user_insights`
```sql
CREATE TABLE IF NOT EXISTS public.user_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id),
  project_id UUID REFERENCES public.projects(id),
  insight_type TEXT NOT NULL,  -- 'market_trend', 'competitor_update', 'opportunity', 'new_business'
  title TEXT NOT NULL,
  summary TEXT NOT NULL,       -- 2-3 sentence summary
  detail TEXT,                 -- Full insight content (markdown)
  relevance_score NUMERIC(3,2), -- 0.00-1.00 (only show if >0.70)
  source TEXT,                 -- Where the insight came from
  read_at TIMESTAMPTZ,         -- NULL = unread
  emailed_at TIMESTAMPTZ,      -- NULL = not emailed yet
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_user_insights_user ON public.user_insights(user_id, created_at DESC);
CREATE INDEX idx_user_insights_unread ON public.user_insights(user_id) WHERE read_at IS NULL;
```

## Insight Types

| Type | Description | Frequency | AI? |
|------|-------------|-----------|-----|
| `market_trend` | New market data relevant to user's industry | Weekly | Yes (free) |
| `competitor_update` | Competitor launched new feature/raised funding | Weekly | Yes (free) |
| `opportunity` | Grant, accelerator, event relevant to user | Bi-weekly | Yes (free) |
| `new_business` | New startup/business appeared in user's space | Weekly | Yes (free) |
| `tip` | Actionable advice based on user's SVI stage | Weekly | No (templated) |

## Relevance Matching (>70% threshold)

Extract from user's latest SVI analysis:
```
Keywords: industry, product type, target market, technology
Stage: concept/mvp/revenue/growth
Location: Australia (or international)
```

AI prompt for relevance scoring:
```
Given this startup idea: "{user's raw_input summary}"
And this market update: "{new finding}"
Rate relevance 0.0-1.0. Only return >0.70 if the update 
directly impacts this startup's market, competitors, or strategy.
Return JSON: { relevance: 0.XX, reason: "why relevant" }
```

## Implementation

### Cron Task: `customer-care-insights`
Add to `/api/cron/agent-upgrade`:
- Schedule: weekly (Saturday, dayOfWeek: 6)
- needsAI: true
- Process: For each active user (last login <30 days), generate 1-2 insights
- Rate limit: Max 10 users per run, 30s delay between AI calls
- Only generate if user has at least 1 SVI analysis

### Dashboard: Insights Panel
- Show on dashboard after login: "New insights for your startup"
- Unread count badge in workspace navigation
- Each insight card: title, summary, relevance badge, "Read more" expand
- "Mark as read" on click
- Link to full detail or related report section

### Email: Weekly Insight Digest
- Send weekly (if user has unread insights from past 7 days)
- Subject: "{count} new insights for {startup_name}"
- Content: Top 3 insights with summaries
- CTA: "View All Insights on Dashboard"
- Only send if relevance >0.70 for at least 1 insight
- Respect email preferences (canSendEmail)

## Agent Hierarchy Integration

```
CEO goal: Retain users through proactive value delivery
  └── CRO goal: Increase 7-day return rate from 25% → 40%
      └── Customer Success goal: Each user gets 2+ insights/week
          └── AI Customer Care Agent tasks:
              ├── Market scan (CMO skill: /rnd competitor research)
              ├── Relevance matching (CDO skill: data quality)
              ├── Notification delivery (CTO skill: /api endpoints)
              └── Email delivery (CMO skill: /email templates)
```

## Success Metrics
| Metric | Target |
|--------|--------|
| Insights generated per user/week | 2+ |
| Relevance accuracy (>70% threshold) | 85%+ correct |
| Insight open rate (dashboard) | 40%+ |
| Insight email open rate | 30%+ |
| 7-day return rate improvement | +15% |
| Credit purchase after insight view | 5%+ |

## Implementation Priority
- [ ] Create user_insights table (migration)
- [ ] Add customer-care-insights task to agent-upgrade cron
- [ ] Dashboard insights panel component
- [ ] Unread insights badge in workspace nav
- [ ] Weekly insight digest email
- [ ] Relevance matching with >70% threshold
- [ ] Rate limit: max 10 users/run, 30s between AI calls