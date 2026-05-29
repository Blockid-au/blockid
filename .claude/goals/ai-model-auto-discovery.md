# Goal: AI Model Auto-Discovery & Continuous Availability

## Problem
When an AI model hits rate limit or quota exhaustion, the system falls through the provider chain. If ALL providers are exhausted, analysis fails. We need:
1. Auto-detection of quota exhaustion
2. Auto-discovery of new free models
3. Hot-swap without restart (add to chain at runtime)
4. Guarantee: system NEVER returns "AI unavailable" to a paying user

## Current Provider Chain (9 providers)
1. TapHoaAPI Proxy (Anthropic proxy)
2. Claude CLI OAuth (subscription)
3. OpenAI Codex CLI OAuth (subscription)
4. Google Gemini 2.5 Flash (free tier)
5. Groq llama-3.3-70b (free, 30 req/min)
6. OpenRouter (free models)
7. Anthropic API Key (paid)
8. OpenAI API Key (paid)
9. Ollama (local, last resort)

## Auto-Discovery Mechanism

### Runtime Model Registry
- Store available models in Supabase table `ai_model_registry`
- Columns: provider, model_id, api_key, base_url, rate_limit, quota_remaining, last_used, status (active/exhausted/error)
- Hot-reload: check registry every 5 minutes for new models
- No restart needed — new models picked up automatically

### Quota Tracking
- After each API call: decrement quota_remaining
- When quota_remaining < 10: log warning
- When quota_remaining = 0: mark status = 'exhausted', skip in chain
- Daily reset for free-tier models (Gemini, Groq)

### Auto-Discovery (RnD Agent weekly task)
- Search for new free AI APIs: Together.ai, Cerebras, SambaNova, Hyperbolic
- Test each with a simple prompt
- If working: add to ai_model_registry with status = 'active'
- Current free options to explore:
  - Together.ai: Llama 3.3 70B (free tier)
  - Cerebras: Llama 3.3 70B (fast inference, free)
  - SambaNova: Llama 3.1 405B (free tier)
  - Hyperbolic: various models (free tier)
  - Cloudflare Workers AI (free 10K req/day)

### Failover Priority
1. Subscription models first (best quality, already paid)
2. Free tier models (good quality, limited quota)
3. Self-hosted Ollama (unlimited but slow)
4. NEVER return error to user — queue request if all models busy

## Agent Assignments
- CTO: implement runtime model registry + hot-swap
- RnD: weekly discovery of new free models
- COO: monitor model health in daily report
- CFO: track AI costs vs budget ($100/month cap)

## Success Metrics
- Zero "AI unavailable" errors per month
- Average provider switch time: < 100ms
- 5+ free models always available in chain
- Monthly AI cost: < $50 (mostly free tier)
