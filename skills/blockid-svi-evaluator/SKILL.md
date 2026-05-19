---
name: blockid-svi-evaluator
description: >
  Orchestrates the full BlockID Startup Value Index (SVI) evaluation pipeline for blockid.au.
  Coordinates 4 agents — deterministic compute, AI scoring, competitive research, and report generation —
  to produce a complete startup assessment with an SVI score, competitor analysis, and actionable report.
  Use when the user asks to evaluate a startup, score an idea, get SVI, analyze a business plan, find
  competitors, do market/competitive research, or generate an SVI report. Trigger phrases: "evaluate
  startup", "score my idea", "get SVI", "tính SVI", "đánh giá startup", "find competitors for",
  "market research for", "competitive analysis", "generate SVI report", "tạo báo cáo SVI", or when a
  user provides a startup description, business plan, or website URL for assessment.
---

# BlockID SVI Evaluator

Orchestrates 4 sequential agents to produce a complete Startup Value Index assessment for blockid.au.

## Pipeline Overview

```
Input (text / business plan / URL)
  │
  ▼
[1] Deterministic Compute   POST /api/svi
      extractSignals() + computeSVI() → totalSVI, 8 dimensions, penalties
  │
  ▼
[2] AI Scoring Agent        POST /api/svi/ai-score
      Independent Claude verification → aiSVI, comparison, strengths/weaknesses
  │
  ▼
[3] Research Agent          POST /api/svi/research
      Web search loop → marketScore, competitiveScore, growthScore, competitors[]
  │
  ▼
[4] Report Agent            POST /api/svi/report
      500-700w Markdown report combining all signals
  │
  ▼
Synthesized SVI Profile (slug, scores, insights, report)
```

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | Startup description or business plan text |
| `email` | string | Yes | User email for Supabase persistence |
| `websiteUrl` | string | No | Company website URL |
| `keywords` | string[] | No | Industry/sector keywords |
| `mode` | string | No | `"quick"` (step 1 only) \| `"full"` (all 4, default) \| `"research-only"` |

## Step-by-Step Invocation

### Step 1 — Deterministic Compute

```
POST /api/svi
Body: { email, input: { rawText: description, fileName? } }
```

Capture from response: `slug`, `totalSVI`, `analysis.stage`, `analysis.stageLabel`, `analysis.dimensions`, `analysis.riskPenalties[]`, `analysis.evidenceGaps[]`, `analysis.confidenceMultiplier`.

### Step 2 — AI Scoring

```
POST /api/svi/ai-score
Body: { rawText: description, deterministicSVI: totalSVI, deterministicAnalysis: analysis }
```

Capture: `aiSVI`, `comparison` ("agree"|"higher"|"lower"), `discrepancy`, `strengths[]`, `weaknesses[]`, `aiDimensions{}`, `recommendation`. Agreement threshold: ±8 points.

### Step 3 — Competitive Research

```
POST /api/svi/research
Body: { startupDescription: description, websiteUrl?, keywords? }
```

Capture: `marketScore`, `competitiveScore`, `growthScore` (0-100 each), `competitors[]`, `marketInsights[]`, `competitiveInsights[]`, `growthInsights[]`, `sources[]`. Timeout: 60s. Fallback: 50/50/50 on failure.

### Step 4 — Report Generation

```
POST /api/svi/report
Body: {
  rawText: description,
  analysis: deterministicAnalysis,
  aiScore: { aiSVI, comparison, strengths, weaknesses, recommendation },
  research: { marketScore, competitiveScore, growthScore, competitors, summary }
}
```

Capture: `report` (Markdown), `wordCount`, `generatedAt`.

## Output Structure

```json
{
  "slug": "abc123",
  "svi": 118,
  "stage": 2,
  "stageLabel": "MVP / Prototype",
  "confidence": 0.35,
  "dimensions": { "ftv": 62, "mpc": 71, "ptd": 45, "tre": 30, "cgh": 55, "iri": 40, "lco": 60, "svm": 50 },
  "aiSVI": 122,
  "aiComparison": "agree",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "marketScore": 68,
  "competitiveScore": 55,
  "growthScore": 72,
  "competitors": [{ "name": "...", "url": "...", "threat": "medium" }],
  "report": "# SVI Report\n...",
  "riskPenalties": [{ "label": "...", "impact": -12 }],
  "evidenceGaps": [{ "field": "...", "action": "..." }]
}
```

## Mode Shortcuts

- **`quick`**: Step 1 only — fast deterministic score.
- **`research-only`**: Steps 1 + 3 — compute + competitive intel, skip AI scoring + report.
- **`full`** (default): All 4 steps in sequence.

## Error Handling

- Step 1 fails (no Supabase) → use demo slug, continue with returned `analysis`.
- Step 2 fails → set `aiComparison: "unavailable"`, continue.
- Step 3 times out → set scores to 50, `competitors: []`, continue.
- Step 4 fails → return partial result, add `reportError: true`.

## Reference Files

- **[svi-formula.md](references/svi-formula.md)** — SVI v2.0 formula, 8 dimension weights, stage bonuses, 15 risk penalties
- **[api-endpoints.md](references/api-endpoints.md)** — Complete request/response schemas for all 4 API routes
