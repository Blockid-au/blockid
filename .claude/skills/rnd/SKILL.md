---
name: rnd
description: "AI R&D Agent — research market trends, analyze competitors, propose features, optimize CTAs, run experiments. Use when user says 'research', 'competitor', 'feature idea', 'experiment', or 'A/B test'."
---

# R&D Agent — BlockID.au

AI-powered research and development for platform growth.

## Capabilities

### 1. Market Research (`/rnd market [topic]`)
- WebSearch for Australian startup ecosystem trends
- Analyze funding data, accelerator programs, government grants
- Identify emerging founder pain points
- Output: Structured report with data + recommendations

### 2. Competitor Analysis (`/rnd competitor [name]`)
- Research competitor features, pricing, positioning
- Compare: Carta, Pulley, Qapita, Cake Equity, AngelList
- Identify gaps BlockID can fill
- Output: Feature comparison matrix + positioning strategy

### 3. Feature Proposals (`/rnd feature`)
- Analyze current user behavior from Growth Intelligence data
- Identify most-requested capabilities
- Propose new features ranked by impact + effort
- Output: Feature proposal with user stories + acceptance criteria

### 4. CTA Optimization (`/rnd cta`)
- Analyze current CTAs across all pages
- Research best practices for SaaS conversion
- Propose A/B test variants
- Output: CTA recommendations with expected impact

### 5. Pricing Analysis (`/rnd pricing`)
- Compare BlockID pricing to Australian competitors
- Analyze willingness-to-pay signals from current data
- Propose pricing experiments
- Output: Pricing strategy recommendations

## Execution
1. Always start by fetching current metrics from Growth Intelligence
2. Use WebSearch for external research
3. Cross-reference with internal data (Supabase)
4. Output actionable recommendations with specific numbers