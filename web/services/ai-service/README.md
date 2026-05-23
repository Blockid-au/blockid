# BlockID AI Service

## Purpose
Standalone service for AI-heavy operations: SVI analysis, R&D reports, evidence analysis, tech audits.

## Status: PLANNED (Phase 2)
Currently all AI routes run in the main Next.js monolith.
This directory contains the entry point skeleton for when we split.

## Routes to Extract
```
POST /api/rnd              → SSE streaming SVI analysis
POST /api/rnd/sections     → Modular section generation
POST /api/svi/*            → SVI scoring, reports, AI score
POST /api/evidence/analyze → Evidence AI analysis
POST /api/website-tech-audit → Deep tech audit
GET  /api/score            → Score form submission
POST /api/ai/*             → AI equity recommendations
```

## Dependencies
- lib/ai-client.ts (Claude, OpenAI, Gemini providers)
- lib/svi-analysis.ts (SVI computation)
- lib/rnd-analysis.ts (Report generation)
- lib/rnd-input.ts (URL scraping, tech audit)
- lib/github-repo-audit.ts (GitHub analysis)
- lib/credits.ts (credit deduction)
- lib/supabase.ts (database)

## Auth
AI service validates requests via:
- Internal API key (for web → ai calls)
- Session token forwarded from web service

## Scaling
- HPA: 3-10 replicas based on average response latency
- Resource: 1-2 CPU, 2-4GB RAM per pod
- Each pod handles ~5 concurrent AI requests
