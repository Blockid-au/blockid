# BlockID SVI API Endpoints

Base URL: `https://blockid.au` (production) or `http://localhost:3000` (local)

---

## POST /api/svi — Deterministic Compute

**Request:**
```json
{
  "email": "user@example.com",
  "input": {
    "rawText": "We are building a SaaS platform...",
    "fileName": "business-plan.pdf"
  }
}
```

**Response (200):**
```json
{
  "ok": true,
  "slug": "xk9m2p",
  "totalSVI": 118,
  "analysis": {
    "version": "2.0.0",
    "totalSVI": 118,
    "baselineScore": 100,
    "stage": 2,
    "stageLabel": "MVP / Prototype",
    "stageBonus": 10,
    "confidenceMultiplier": 0.35,
    "netAdjustment": 8,
    "dimensions": {
      "ftv": { "score": 62, "weight": 0.15, "signals": [] },
      "mpc": { "score": 71, "weight": 0.18, "signals": [] },
      "ptd": { "score": 45, "weight": 0.12, "signals": [] },
      "tre": { "score": 30, "weight": 0.20, "signals": [] },
      "cgh": { "score": 55, "weight": 0.12, "signals": [] },
      "iri": { "score": 40, "weight": 0.10, "signals": [] },
      "lco": { "score": 60, "weight": 0.08, "signals": [] },
      "svm": { "score": 50, "weight": 0.05, "signals": [] }
    },
    "riskPenalties": [
      { "id": "no_revenue", "label": "Zero revenue at post-seed", "impact": -5 }
    ],
    "evidenceGaps": [
      { "field": "revenue", "label": "No MRR/ARR mentioned", "impact": 0, "action": "Add revenue data" }
    ],
    "percentileRank": 42,
    "weeklyDelta": null
  },
  "persisted": true
}
```

**Error (400):** `{ "ok": false, "error": "Valid email is required" }`

---

## POST /api/svi/ai-score — AI Verification

**Request:**
```json
{
  "rawText": "We are building...",
  "deterministicSVI": 118,
  "deterministicAnalysis": { "..." }
}
```

**Response (200):**
```json
{
  "ok": true,
  "aiSVI": 122,
  "comparison": "agree",
  "discrepancy": 4,
  "strengths": ["Strong founder background", "Clear market problem", "Early traction evident"],
  "weaknesses": ["Revenue not yet proven", "Cap table details missing", "Legal structure unclear"],
  "aiDimensions": {
    "ftv": 65, "mpc": 73, "ptd": 48, "tre": 32,
    "cgh": 50, "iri": 42, "lco": 58, "svm": 52
  },
  "recommendation": "Strong early-stage startup. Focus on revenue validation and formalizing legal structure.",
  "transparencyNote": "Scored based on self-declared text. Confidence limited by absence of URLs or documents.",
  "evidenceQuality": "self_declared"
}
```

`comparison` values: `"agree"` (±8 pts), `"higher"`, `"lower"`

---

## POST /api/svi/research — Competitive Research

**Request:**
```json
{
  "startupDescription": "We are building...",
  "websiteUrl": "https://mystartup.com",
  "keywords": ["fintech", "Australia", "payments"]
}
```

**Response (200):**
```json
{
  "ok": true,
  "marketScore": 68,
  "competitiveScore": 55,
  "growthScore": 72,
  "competitors": [
    {
      "name": "Stripe",
      "url": "https://stripe.com",
      "description": "Global payments platform",
      "threat": "high",
      "differentiator": "We focus on SME compliance"
    }
  ],
  "marketInsights": ["Australian fintech market growing 23% YoY", "..."],
  "competitiveInsights": ["3 direct competitors identified", "..."],
  "growthInsights": ["Strong PMF signals in SME segment", "..."],
  "sources": [
    { "title": "KPMG Fintech Report 2024", "url": "https://..." }
  ],
  "summary": "The market shows strong demand..."
}
```

Threat levels: `"low"` | `"medium"` | `"high"`

Timeout: 60s. On failure/timeout returns scores of 50 with empty arrays.

---

## POST /api/svi/report — Report Generation

**Request:**
```json
{
  "rawText": "We are building...",
  "analysis": { "totalSVI": 118, "..." },
  "aiScore": {
    "aiSVI": 122,
    "comparison": "agree",
    "strengths": ["..."],
    "weaknesses": ["..."],
    "recommendation": "..."
  },
  "research": {
    "marketScore": 68,
    "competitiveScore": 55,
    "growthScore": 72,
    "competitors": [{ "..." }],
    "summary": "..."
  }
}
```

**Response (200):**
```json
{
  "ok": true,
  "report": "# BlockID SVI Report\n\n## Executive Summary\n...",
  "wordCount": 623,
  "generatedAt": "2026-05-19T14:30:00.000Z"
}
```

Report sections: Executive Summary, SVI Score Breakdown, AI Verification, Competitive Landscape, Risk Flags, Evidence Gaps & Next Steps, Recommended Milestones.

---

## GET /api/svi/[slug] — Retrieve Analysis

```
GET /api/svi/xk9m2p
```

Returns the stored analysis for a slug (Supabase lookup). Used by `/svi-results/[slug]` page.
