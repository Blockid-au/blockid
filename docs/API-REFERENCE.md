# BlockID.au -- API Reference

> Last verified: 2026-09-19 (G18-B truth sweep) · Base URL: `https://blockid.au` (production) or `http://localhost:4001` (dev)
> All routes use `force-dynamic` rendering. All POST routes accept `Content-Type: application/json` unless noted.
> This file documents the routes an integrator or operator calls by hand (≈ 55 of the 650+ route handlers under
> `web/src/app/api/**`; every mutating route is wrapped by `apiRoute()` and audited). The machine-readable spec
> for the public + keyed partner surface is `GET /api/openapi.json`, rendered at `/developers/api` from
> `web/src/lib/api-docs-registry.ts` — that registry is the source of truth for §9–§10 request/response shapes.

---

## Table of Contents

1. [Auth](#1-auth-apiauth)
2. [SVI](#2-svi-apisvi)
3. [Stripe](#3-stripe-apistripe)
4. [Credits](#4-credits-apicredits)
5. [Evidence](#5-evidence-apievidence)
6. [Tools](#6-tools)
7. [Admin / Cron](#7-admin--cron)
8. [Other](#8-other)
9. [Evaluator API v1](#9-evaluator-api-v1-apiv1evaluations)
10. [Partner, public and session endpoints](#10-partner-public-and-session-endpoints)

---

## Authentication Methods

| Method | Description |
|--------|-------------|
| **Session Cookie** | `blockid_session` HttpOnly cookie set after login. 90-day expiry. |
| **CRON_SECRET** | `Authorization: Bearer $CRON_SECRET` header for cron endpoints. |
| **API Key (v1)** | `Authorization: Bearer bk_live_…` — a per-account key from Workspace → Settings → Enterprise → API keys, scoped (`analyze` on every key by default; `evaluations:read` / `evaluations:write` on evaluator accounts). `POST /api/v1/analyze` is credit-metered with no plan gate; the `/api/v1/evaluations*` routes additionally require the `api.access` entitlement (Fund, Program and Index API plans per `plans.csv`). See [§9](#9-evaluator-api-v1-apiv1evaluations) and [§10](#10-partner-public-and-session-endpoints). |
| **SVI data key** | `Authorization: Bearer svi_live_…` — institutional SVI index key for `GET /api/v1/svi` (tiers free 10/day · team 1k/day · institutional unlimited). |
| **Partner token** | Optional bearer with the `id:public:read` scope on `GET /api/v1/id/{slug}` and `/vc` — lifts the anonymous rate limit; an invalid token is a 401, never a silent fallback. |
| **Public** | No authentication required. |

---

## 1. Auth (`/api/auth`)

### POST /api/auth/request

Request a magic link email for login or Founder Pack save.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  email: string;                    // required, valid email
  intent?: "login" | "save_founder_pack";  // default: "save_founder_pack"
  pendingPayload?: {
    ideaEval?: { inputs: unknown; ideaName?: string };
    equitySplit?: { founders: unknown[]; settings: unknown };
    fundingPlan?: { inputs: unknown };
  };
}
```

**Response (always 200 to prevent email enumeration):**

```typescript
{ ok: true, ttlMinutes: 15 }
```

**Example:**

```bash
curl -X POST https://blockid.au/api/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@example.com","intent":"login"}'
```

---

### POST /api/auth/google

Authenticate via Google Sign-In (ID token).

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  credential: string;  // Google ID token from Sign In With Google
}
```

**Response (200):**

```typescript
{
  ok: true,
  user: {
    id: string;
    email: string;
    plan: string | null;
    role: "user" | "admin";
    displayName: string | null;
  },
  redirect: "/dashboard",
  isAdmin?: true  // only for admin@blockid.au
}
```

**Side effects:** Sets `blockid_session` HttpOnly cookie. Grants 1 free credit to new users.

**Example:**

```bash
curl -X POST https://blockid.au/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential":"eyJhbGciOiJSUzI1NiIs..."}'
```

---

### GET /api/auth/me

Return the currently authenticated user.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (optional -- returns null if not logged in) |
| **Credit cost** | 0 |

**Response (200):**

```typescript
// Authenticated:
{
  ok: true,
  user: {
    id: string;
    email: string;
    plan: string | null;
    role: "user" | "admin";
    displayName: string | null;
  }
}

// Not authenticated:
{ ok: false, user: null }
```

**Example:**

```bash
curl https://blockid.au/api/auth/me \
  -H "Cookie: blockid_session=abc123..."
```

---

### POST /api/auth/logout

Destroy the current session and redirect to home.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie |
| **Credit cost** | 0 |

**Request body:** None

**Response:** 302 redirect to `/`

**Side effects:** Deletes session row from DB. Clears `blockid_session` cookie.

**Example:**

```bash
curl -X POST https://blockid.au/api/auth/logout \
  -H "Cookie: blockid_session=abc123..." \
  -L
```

---

## 2. SVI (`/api/svi`)

### POST /api/svi

Run a Startup Value Index analysis.

| Field | Value |
|-------|-------|
| **Auth** | Public (1 free per email) or Session cookie |
| **Credit cost** | 1 credit (authenticated users) |

**Request body:**

```typescript
{
  email: string;      // required, valid email
  input: {
    rawText: string;  // required, startup description (no max but practical ~10k chars)
    fileName?: string; // optional, e.g. "pitch-deck.pdf"
  };
}
```

**Response (200):**

```typescript
{
  ok: true,
  slug: string,           // e.g. "bk_abc123def456"
  totalSVI: number,       // 30-300
  analysis: {
    version: "2.0.0",
    totalSVI: number,
    baselineSVI: 100,
    netAdjustment: number,
    confidenceMultiplier: number,  // 0.20-1.00
    stage: number,                 // 0-7
    stageLabel: string,
    stageBonus: number,
    percentileRank: number,        // 10, 25, 50, 75, 90
    subs: Array<{
      label: string;
      key: string;                 // ftv, mpc, ptd, tre, cgh, iri, lco, svm
      value: number;               // 0-100
      adjustment: number;
      rationale: string;
      evidence: string[];
      gaps: string[];
    }>,
    riskPenalties: Array<{
      label: string;
      points: number;
      reason: string;
    }>,
    evidenceGaps: Array<{
      priority: "P0" | "P1" | "P2";
      label: string;
      action: string;
      impact: number;
      evidenceType: string;
    }>,
    nextActions: Array<{
      priority: "P0" | "P1" | "P2";
      title: string;
      detail: string;
      impact: string;
    }>,
    signals: SVIExtractedSignals,
    summary: string;
  },
  persisted: boolean,
  balance?: number,       // remaining credits (authenticated only)
  creditsUsed: number     // 0 or 1
}
```

**Error responses:**
- `400` -- Missing email or input text
- `402` -- Insufficient credits or free analysis already used (`{ needsAuth: true }`)

**Example:**

```bash
curl -X POST https://blockid.au/api/svi \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "input": {
      "rawText": "We are building a SaaS platform for Australian startups. We have 3 co-founders with 10 years experience each. Revenue is $50k MRR. We have a pitch deck and cap table ready."
    }
  }'
```

---

### POST /api/svi/ai-score

Get an independent AI-generated SVI score to compare with the deterministic score.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 1 credit |

**Request body:**

```typescript
{
  rawText: string;                   // startup description
  deterministicSVI: number;          // the deterministic SVI score
  deterministicAnalysis: SVIAnalysis; // full analysis object
}
```

**Response (200):**

```typescript
{
  ok: true,
  aiSVI: number,                    // 30-300
  comparison: "agree" | "higher" | "lower",
  discrepancy: number,              // absolute difference
  strengths: string[],              // top 3 strengths
  weaknesses: string[],             // top 3 weaknesses
  aiDimensions: {                   // AI's independent dimension scores
    ftv: number, mpc: number, ptd: number, tre: number,
    cgh: number, iri: number, lco: number, svm: number
  },
  recommendation: string,
  transparencyNote: string,
  evidenceQuality: string,
  balance: number,
  creditsUsed: 1
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/svi/ai-score \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"rawText":"...","deterministicSVI":95,"deterministicAnalysis":{...}}'
```

---

### POST /api/svi/report

Generate a 500-700 word AI-written SVI report.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 3 credits |

**Request body:**

```typescript
{
  rawText: string;        // startup description
  analysis: SVIAnalysis;  // full analysis object
  email: string;          // for logging
}
```

**Response (200):**

```typescript
{
  ok: true,
  report: string,         // markdown-formatted report
  wordCount: number,
  generatedAt: string,    // ISO timestamp
  balance: number,
  creditsUsed: 3
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/svi/report \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"rawText":"...","analysis":{...},"email":"founder@example.com"}'
```

---

### POST /api/svi/research

Run competitive research with web search.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 2 credits |

**Request body:**

```typescript
{
  description: string;    // required, startup/product description
  keywords?: string;      // optional search keywords
  websiteUrl?: string;    // optional company URL
  industry?: string;      // optional industry label
}
```

**Response (200):**

```typescript
{
  ok: true,
  marketScore: number,       // 0-100
  competitiveScore: number,  // 0-100 (higher = more differentiated)
  growthScore: number,       // 0-100
  competitors: Array<{
    name: string;
    url: string;
    description: string;
    threat: "high" | "medium" | "low";
  }>,
  marketInsights: string[],
  competitiveInsights: string[],
  growthInsights: string[],
  sources: Array<{ title: string; url: string }>,
  summary: string,
  balance: number,
  creditsUsed: 2
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/svi/research \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"description":"AI-powered cap table management for Australian startups","industry":"fintech"}'
```

---

### POST /api/svi/rescore

Re-calculate SVI based on accumulated evidence and completed actions.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:** None

**Response (200):**

```typescript
{
  ok: true,
  previousSVI: number,
  newSVI: number,
  evidenceCount: number,
  actionCount: number,
  evidenceBoost: number,
  actionBoost: number
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/svi/rescore \
  -H "Cookie: blockid_session=abc123..."
```

---

### GET /api/svi/check-gate

Check if an email can run a free analysis.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Credit cost** | 0 |

**Query params:** `email` (required)

**Response (200):**

```typescript
{
  ok: true,
  canAnalyze: boolean,
  reason: "free" | "paid_plan" | "free_available" | "credits" | "limit_reached",
  plan?: string,          // if paid_plan
  credits?: number,       // if credits remaining
  totalAnalyses?: number  // if limit_reached
}
```

**Example:**

```bash
curl "https://blockid.au/api/svi/check-gate?email=founder@example.com"
```

---

### POST /api/svi/email-report

Send an SVI report summary email to a given address.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  email: string;    // recipient email
  slug: string;     // SVI analysis slug
  analysis: {
    totalSVI: number;
    stageLabel: string;
    subs: Array<{ label: string; value: number }>;
    evidenceGaps: Array<{ label: string; action: string }>;
  };
}
```

**Response (200):**

```typescript
{ ok: true }
```

**Example:**

```bash
curl -X POST https://blockid.au/api/svi/email-report \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"email":"founder@example.com","slug":"bk_abc123","analysis":{"totalSVI":105,"stageLabel":"MVP","subs":[],"evidenceGaps":[]}}'
```

---

### POST /api/svi/share

Share an SVI report with another person via email.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  email?: string;            // sender email (for logging)
  recipientEmail: string;    // required, who to share with
  slug: string;              // required, SVI analysis slug
  senderName?: string;       // optional display name
}
```

**Response (200):**

```typescript
{ ok: true }
```

**Error responses:**
- `403` -- Authenticated user does not own this SVI analysis

**Example:**

```bash
curl -X POST https://blockid.au/api/svi/share \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"recipientEmail":"investor@fund.com","slug":"bk_abc123","senderName":"Jane Doe"}'
```

---

## 3. Stripe (`/api/stripe`)

### POST /api/stripe/checkout

Create a Stripe Checkout Session for a plan subscription or one-off purchase.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  plan: string;        // required: "founding50" | "founder" | "growth"
  couponCode?: string; // optional Stripe coupon ID
}
```

**Response (200):**

```typescript
{
  ok: true,
  url: string  // Stripe Checkout URL -- redirect user here
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/stripe/checkout \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"plan":"founding50"}'
```

---

### POST /api/stripe/webhook

Stripe webhook receiver. Processes payment events.

| Field | Value |
|-------|-------|
| **Auth** | Stripe webhook signature (`stripe-signature` header) |
| **Credit cost** | 0 |

**Request body:** Raw Stripe event payload (verified via `STRIPE_WEBHOOK_SECRET`)

**Handled events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate plan, grant credits, send confirmation email |
| `checkout.session.completed` (type=svi_analysis) | Grant 1 analysis credit |
| `checkout.session.completed` (type=credit_purchase) | Grant purchased credit pack |
| `customer.subscription.deleted` | Downgrade user to free plan |
| `customer.subscription.updated` | Update plan if price changed |
| `invoice.payment_failed` | Send payment failed email |
| `invoice.paid` | Send payment receipt email (subscription invoices only) |

**Response:** `{ received: true }` (200)

**Example:**

```bash
# Stripe sends this automatically -- not called manually.
# Configure webhook URL in Stripe Dashboard:
# https://blockid.au/api/stripe/webhook
```

---

### POST /api/stripe/portal

Create a Stripe Customer Portal session for subscription management.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:** None

**Response (200):**

```typescript
{
  ok: true,
  url: string  // Stripe portal URL
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/stripe/portal \
  -H "Cookie: blockid_session=abc123..."
```

---

### POST /api/stripe/cancel

Cancel the user's subscription at end of billing period.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body (optional):**

```typescript
{
  reason?: string;    // why they're cancelling
  feedback?: string;  // additional feedback
}
```

**Response (200):**

```typescript
{
  ok: true,
  activeUntil: string  // ISO date when plan expires
}
```

**Side effects:** Sends retention email with COMEBACK30 coupon (30% off).

**Example:**

```bash
curl -X POST https://blockid.au/api/stripe/cancel \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"reason":"too_expensive","feedback":"Love the product but budget is tight"}'
```

---

### POST /api/stripe/reactivate

Undo a pending subscription cancellation.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:** None

**Response (200):**

```typescript
{ ok: true }
```

**Example:**

```bash
curl -X POST https://blockid.au/api/stripe/reactivate \
  -H "Cookie: blockid_session=abc123..."
```

---

### POST /api/stripe/change-plan

Change subscription to a different plan.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  newPlanId: string;  // "founding50" | "founder" | "growth"
}
```

**Response (200):**

```typescript
// Recurring-to-recurring swap:
{ ok: true }

// Change to one-off plan (creates new checkout):
{ ok: true, url: string }
```

**Example:**

```bash
curl -X POST https://blockid.au/api/stripe/change-plan \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"newPlanId":"growth"}'
```

---

### POST /api/stripe/analysis

Create a Stripe Checkout for a single per-analysis SVI payment (guest checkout).

| Field | Value |
|-------|-------|
| **Auth** | Public (email-based) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  email: string;  // required
}
```

**Response (200):**

```typescript
{
  ok: true,
  url: string  // Stripe Checkout URL
}
```

**Notes:** Price is A$1 during early-bird period (before 2026-06-15), A$25 after.

**Example:**

```bash
curl -X POST https://blockid.au/api/stripe/analysis \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@example.com"}'
```

---

## 4. Credits (`/api/credits`)

### GET /api/credits

Get the authenticated user's credit balance and transaction history.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Response (200):**

```typescript
{
  ok: true,
  balance: number,
  plan: string,
  transactions: Array<{
    amount: number;         // positive = grant, negative = spend
    balance_after: number;
    reason: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>
}
```

**Example:**

```bash
curl https://blockid.au/api/credits \
  -H "Cookie: blockid_session=abc123..."
```

---

### POST /api/credits

Purchase a credit pack via Stripe or direct grant (dev fallback).

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  amount: 5 | 10 | 25 | 50;  // credit pack size
}
```

**Credit pack pricing (AUD):**

| Credits | Price |
|---------|-------|
| 5 | $25 |
| 10 | $45 |
| 25 | $100 |
| 50 | $175 |

**Response (200) -- Stripe configured:**

```typescript
{
  ok: true,
  url: string  // Stripe Checkout URL
}
```

**Response (200) -- direct grant (dev):**

```typescript
{
  ok: true,
  balance: number,
  granted: number,
  method: "direct"
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/credits \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"amount":10}'
```

---

### POST /api/credits/check

Pre-flight check: can the user afford a specific feature?

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  feature: string;  // "svi_analysis" | "svi_report" | "term_sheet" | "research" | "ai_score" | "evidence_upload" | "investor_score" | "dilution_calc"
}
```

**Feature costs:**

| Feature | Credits |
|---------|---------|
| `svi_analysis` | 1 |
| `ai_score` | 1 |
| `research` | 2 |
| `svi_report` | 3 |
| `term_sheet` | 3 |
| `evidence_upload` | 0 (free) |
| `investor_score` | 0 (free) |
| `dilution_calc` | 0 (free) |

**Response (200):**

```typescript
{
  ok: true,
  allowed: boolean,
  balance: number,
  cost: number,
  reason?: "insufficient_credits" | "unknown_feature"
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/credits/check \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"feature":"svi_report"}'
```

---

## 5. Evidence (`/api/evidence`)

### GET /api/evidence

List all evidence items for the authenticated user.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Response (200):**

```typescript
{
  ok: true,
  evidence: Array<{
    id: string;
    account_id: string;
    evidence_type: string;      // "text" | "url" | "document" | "github" | "analytics" | "stripe"
    label: string;
    value_or_url: string | null;
    confidence_level: string;   // "self_declared" | "public_url" | "document_uploaded" | "connected_source"
    dimension: string;          // "ftv" | "mpc" | "ptd" | "tre" | "cgh" | "iri" | "lco" | "svm" | "general"
    svi_impact: number;         // estimated SVI boost (3-20 points)
    created_at: string;
  }>
}
```

**Example:**

```bash
curl https://blockid.au/api/evidence \
  -H "Cookie: blockid_session=abc123..."
```

---

### POST /api/evidence

Add an evidence item (text, URL, or metadata entry).

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  evidenceType: string;     // required: "text" | "url" | "document" | "github" | "analytics" | "stripe"
  label: string;            // required: human-readable label
  valueOrUrl?: string;      // the evidence content or URL
  dimension?: string;       // SVI dimension this relates to (default: "general")
}
```

**SVI impact by evidence type:**

| Type | Confidence | SVI Impact |
|------|-----------|------------|
| `text` | self_declared | +3 |
| `url` | public_url | +6 |
| `document` | document_uploaded | +10 |
| `github` | connected_source | +10 |
| `analytics` | connected_source | +8 |
| `stripe` | connected_source | +20 |

**Response (200):**

```typescript
{
  ok: true,
  evidence: { /* full evidence row */ }
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/evidence \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"evidenceType":"url","label":"Company website","valueOrUrl":"https://example.com","dimension":"ptd"}'
```

---

### POST /api/evidence/upload

Upload a file to Google Drive and record it as evidence.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |
| **Content-Type** | `multipart/form-data` |

**Form fields:**

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Required. Max 10MB. Allowed: PDF, DOCX, XLSX, XLS, PNG, JPG, WEBP, CSV |
| `dimension` | string | Optional SVI dimension (default: "ptd") |

**Response (200):**

```typescript
{
  ok: true,
  fileId: string,           // Google Drive file ID
  webViewLink: string,      // Google Drive view URL
  evidenceId: string | null // DB evidence record ID
}
```

**Side effects:** File is shared with `admin@blockid.au` with writer access. File name is prefixed with uploader email.

**Example:**

```bash
curl -X POST https://blockid.au/api/evidence/upload \
  -H "Cookie: blockid_session=abc123..." \
  -F "file=@pitch-deck.pdf" \
  -F "dimension=iri"
```

---

## 6. Tools

### POST /api/score

Compute the legacy Investor-Ready Score.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  email: string;          // required
  companyName?: string;
  inputs: {
    companyName: string;  // required
    sector: string;       // required
    monthlyRevenue?: number;
    monthlyBurn?: number;
    runwayMonths?: number;
    yearsTrading?: number;
    founders?: number;
    esopAllocated?: number;
    targetRaiseAud?: number;
    valuationCapAud?: number;
    // ... additional ScoreInput fields
  };
}
```

**Response (200):**

```typescript
{
  ok: true,
  slug: string,
  totalScore: number,
  subScores: {
    financials: number;
    capTable: number;
    governance: number;
    founder: number;
    documentation: number;
  },
  scoreVersion: string,
  confidenceScore: number,
  missingInputs: string[],
  actionPlan: unknown,
  benchmark: unknown,
  breakdown: unknown,
  persisted: boolean
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/score \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@example.com","inputs":{"companyName":"Acme","sector":"fintech","monthlyRevenue":5000}}'
```

---

### POST /api/term-sheet

AI-powered term sheet analysis.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 3 credits |

**Request body:**

```typescript
{
  termSheet: string;    // required, 100-30000 chars, full term sheet text
  capTable?: Array<{    // optional current cap table
    id: string;
    name: string;
    shares: number;
    shareClass: "common" | "preferred" | "esop" | "safe";
    isFounder?: boolean;
  }> | null;
  round?: {             // optional round details
    preMoneyAud: number;
    raiseAud: number;
    esopTopUpPct: number;
    esopTimingPreMoney: boolean;
    leadInvestorName: string;
  } | null;
}
```

**Response (200):**

```typescript
{
  ok: true,
  mode: "live" | "demo",
  analysis: {
    // Structured term sheet analysis from Claude
  },
  dilution: {
    // Dilution diff computed locally
  } | null,
  balance: number,
  creditsUsed: 3
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/term-sheet \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"termSheet":"TERM SHEET\nCompany: Acme Pty Ltd\nPre-money valuation: AUD $2,000,000\n..."}'
```

---

### POST /api/idea-estimate

Quick keyword-based idea value estimator (deterministic, no AI).

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  text: string;   // required, idea description
  email: string;  // required, valid email
}
```

**Response (200):**

```typescript
{
  ok: true,
  lowAud: number,       // e.g. 100000
  highAud: number,      // e.g. 350000
  strengths: string[],  // up to 2
  gaps: string[],       // up to 2
  nextStep: string      // recommended next action
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/idea-estimate \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"text":"SaaS platform for Australian startup cap tables with $50k MRR","email":"founder@example.com"}'
```

---

### POST /api/investor-link

Create a per-investor share link for a score.

| Field | Value |
|-------|-------|
| **Auth** | Public (email-based ownership verification) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  scoreId: string;           // required, existing score slug
  founderEmail: string;      // required, must match scores.email
  investorEmail?: string;
  investorName?: string;     // max 200 chars
  fundName?: string;         // max 200 chars
  note?: string;             // max 1000 chars
}
```

**Response (200):**

```typescript
{
  ok: true,
  token: string,
  url: string,              // e.g. "https://blockid.au/s/i/abc123"
  investorEmail: string | null,
  investorName: string | null,
  fundName: string | null,
  createdAt: string
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/investor-link \
  -H "Content-Type: application/json" \
  -d '{"scoreId":"bk_abc123","founderEmail":"founder@example.com","investorName":"John Doe","fundName":"Blackbird"}'
```

---

### POST /api/cofounder-match

Submit a co-founder profile for the matching directory.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  fullName: string;
  email: string;
  location: string;
  iAm: string[];              // e.g. ["technical", "designer"]
  lookingFor: string[];        // e.g. ["business", "sales"]
  stage: string;               // e.g. "idea", "mvp", "revenue"
  timeCommitment: string;      // e.g. "full-time", "part-time"
  visibility: string;          // e.g. "public", "anonymous"
  linkedinUrl?: string;
  skills?: string;
  ideaPitch?: string;
}
```

**Response (200):**

```typescript
{
  ok: true,
  id: string  // profile ID
}
```

**Side effects:** Sends confirmation email to founder and alert email to admin.

**Example:**

```bash
curl -X POST https://blockid.au/api/cofounder-match \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Jane Doe","email":"jane@example.com","location":"Sydney","iAm":["technical"],"lookingFor":["business"],"stage":"mvp","timeCommitment":"full-time","visibility":"public"}'
```

---

### POST /api/svi-accounts

Create or update an SVI account.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  email: string;           // required, must match authenticated user
  name?: string;
  startup_name?: string;
  plan?: string;           // default: "founding50"
}
```

**Response (200):**

```typescript
{
  ok: true,
  account: { /* full svi_accounts row */ }
}
```

**Error responses:**
- `403` -- Email does not match authenticated user

**Example:**

```bash
curl -X POST https://blockid.au/api/svi-accounts \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"email":"founder@example.com","name":"Jane Doe","startup_name":"Acme"}'
```

---

### POST /api/actions

Record a user action from an SVI report (for roadmap tracking).

| Field | Value |
|-------|-------|
| **Auth** | Public (email-based) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  email: string;           // required
  actionType: string;      // required, e.g. "evidence_added", "tool_used"
  actionLabel: string;     // required, human-readable label
  dimension?: string;      // SVI dimension
  sourceGap?: string;      // which evidence gap triggered this
  toolSlug?: string;       // which tool was used
  metadata?: Record<string, unknown>;
}
```

**Response (200):**

```typescript
{ ok: true, tracked: boolean }
```

**Example:**

```bash
curl -X POST https://blockid.au/api/actions \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@example.com","actionType":"tool_used","actionLabel":"Used Cap Table tool","toolSlug":"cap-table"}'
```

---

### GET /api/actions

Get action history for a user.

| Field | Value |
|-------|-------|
| **Auth** | Public (email-based) |
| **Credit cost** | 0 |

**Query params:** `email` (required)

**Response (200):**

```typescript
{
  ok: true,
  actions: Array<{
    id: string;
    account_id: string | null;
    email: string;
    action_type: string;
    action_label: string;
    dimension: string | null;
    source_gap: string | null;
    tool_slug: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>
}
```

**Example:**

```bash
curl "https://blockid.au/api/actions?email=founder@example.com"
```

---

## 7. Admin / Cron

### POST /api/admin/drive/upload

Admin-only: upload a file directly to the shared Google Drive folder.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (admin role required) |
| **Credit cost** | 0 |
| **Content-Type** | `multipart/form-data` |

**Form fields:**

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Required. Max 25MB. Same allowed types as evidence upload. |

**Response (200):**

```typescript
{
  success: true,
  id: string,            // Google Drive file ID
  webViewLink: string    // Google Drive view URL
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/admin/drive/upload \
  -H "Cookie: blockid_session=admin_session..." \
  -F "file=@document.pdf"
```

---

### GET /api/cron/svi-notify

Cron: send SVI welcome emails (Day 1) and weekly reports (Day 7, 14, 21...).

| Field | Value |
|-------|-------|
| **Auth** | `Authorization: Bearer $CRON_SECRET` |
| **Credit cost** | 0 |

**Response (200):**

```typescript
{
  ok: true,
  notified: number,   // notifications created
  emailed: number     // emails successfully sent
}
```

**Schedule:** Daily at 22:00 UTC (08:00 AEST).

**Example:**

```bash
curl https://blockid.au/api/cron/svi-notify \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

### GET /api/cron/svi-snapshot

Cron: take daily SVI snapshots for all accounts (for trend tracking).

| Field | Value |
|-------|-------|
| **Auth** | `Authorization: Bearer $CRON_SECRET` |
| **Credit cost** | 0 |

**Response (200):**

```typescript
{
  ok: true,
  processed: number,  // accounts snapshotted
  date: string         // "YYYY-MM-DD"
}
```

**Side effects:** Updates `svi_snapshots` table (upsert by account_id + date). Updates `svi_accounts.current_svi`.

**Example:**

```bash
curl https://blockid.au/api/cron/svi-snapshot \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

### GET /api/cron/growth-insights

Cron: compute daily growth metrics, generate AI recommendations, and email admin report.

| Field | Value |
|-------|-------|
| **Auth** | `Authorization: Bearer $CRON_SECRET` |
| **Credit cost** | 0 |

**Response (200):**

```typescript
{
  ok: true,
  date: string,
  metrics: {
    totalUsers: number,
    newUsersWeek: number,
    newUsersToday: number,
    sviWeek: number,
    sviToday: number,
    leadsWeek: number,
    leadsToday: number,
    totalAccounts: number,
    payingUsers: number,
    evidenceWeek: number,
    scoresViewedWeek: number,
    avgSVI: number,
    avgDelta: number,
    uniqueEmails: number,
    signupRate: number,
    paymentRate: number,
    planDist: Record<string, number>,
    toolUsage: Record<string, number>,
    biggestDropOff: string,
    dropOffRate: number
  },
  recommendations: Array<{
    priority: "critical" | "high" | "medium",
    title: string,
    detail: string,
    impact: string,
    action_type: "pricing" | "ux" | "marketing" | "product" | "retention"
  }>,
  yesterday: object | null  // previous day's metrics for comparison
}
```

**Side effects:** Persists to `growth_insights` table. Sends growth report email to `admin@blockid.au`.

**Example:**

```bash
curl https://blockid.au/api/cron/growth-insights \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 8. Other

### POST /api/lead

Capture a lead from marketing surfaces. Optionally creates a Stripe Checkout for Founding 50.

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  source: string;       // required: "founding50" | "hero" | "pricing" | "svi" | etc.
  email: string;        // required, valid email
  payload?: {           // optional extra data
    name?: string;
    company?: string;
    finalPrice?: number;
    [key: string]: unknown;
  };
}
```

**Response (200):**

```typescript
{
  ok: true,
  checkoutUrl?: string  // only when source="founding50" and Stripe is configured
}
```

**Side effects (when source="founding50"):**
1. Creates Stripe Checkout Session
2. Sends payment link email to the user
3. Saves lead to `leads` table

**Example:**

```bash
curl -X POST https://blockid.au/api/lead \
  -H "Content-Type: application/json" \
  -d '{"source":"founding50","email":"founder@example.com","payload":{"name":"Jane Doe","finalPrice":49}}'
```

---

### POST /api/coupon/validate

Validate a coupon code (informational, does not consume).

| Field | Value |
|-------|-------|
| **Auth** | Public |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  code: string;  // required, coupon code (case-insensitive)
}
```

**Response (200):**

```typescript
// Valid:
{
  ok: true,
  discount_pct: number,       // e.g. 30 for 30% off
  description: string | null
}

// Invalid:
{
  ok: false,
  reason: "Coupon not found" | "Coupon is no longer active" | "Coupon has expired" | "Coupon has reached its usage limit"
}
```

**Example:**

```bash
curl -X POST https://blockid.au/api/coupon/validate \
  -H "Content-Type: application/json" \
  -d '{"code":"COMEBACK30"}'
```

---

### POST /api/coupon/redeem

Redeem a coupon to activate a plan with a discount.

| Field | Value |
|-------|-------|
| **Auth** | Session cookie (required) |
| **Credit cost** | 0 |

**Request body:**

```typescript
{
  code: string;  // required, coupon code
  plan: string;  // required, plan ID (e.g. "founding50")
}
```

**Response (200):**

```typescript
{
  ok: true,
  plan: string,
  originalPrice: number,     // AUD cents
  discountedPrice: number    // AUD cents
}
```

**Side effects:** Increments coupon usage counter. Records in `coupon_redemptions`. Updates user plan + discount in `app_users`.

**Error responses:**
- `401` -- Not authenticated
- `400` -- Invalid coupon code or plan
- `200` with `ok: false` -- Coupon expired, inactive, already redeemed, or usage limit reached

**Example:**

```bash
curl -X POST https://blockid.au/api/coupon/redeem \
  -H "Content-Type: application/json" \
  -H "Cookie: blockid_session=abc123..." \
  -d '{"code":"COMEBACK30","plan":"founding50"}'
```

---

## 9. Evaluator API v1 (`/api/v1/evaluations`)

> G14-S38. Machine-readable copy: `GET /api/openapi.json` (tag `Evaluator API v1`), human copy under `/developers/api`
> (`src/lib/api-docs-registry.ts`, slugs `v1-evaluations-*`). Routes: `src/app/api/v1/evaluations/**`.

Read the startups a Fund/Program evaluator is assessing, pull the Investor Dossier, and read/write their own
Evaluator Assessment — everything the workspace "Startups I'm evaluating" page does, from a script or an
integration (Slack / Affinity / Airtable via the outbound destinations below).

**Auth:** `Authorization: Bearer bk_live_…`. Create a key under Workspace → Settings → Enterprise → API keys with
one or more scopes:

| Scope | Grants |
|-------|--------|
| `analyze` | `POST /api/v1/analyze` (default scope on every key — unchanged since before G14-S38). |
| `evaluations:read` | `GET /api/v1/evaluations`, `.../{id}/dossier`, `.../{id}/assessment`. |
| `evaluations:write` | `POST\|PUT /api/v1/evaluations/{id}/assessment` (implies `evaluations:read`). |

`evaluations:*` scopes may only be granted on an evaluator account (`POST /api/keys` checks this at key
creation); every route additionally 404s a key whose owner is not the evaluator on that row, so a scope is a
ceiling on what a key *could* reach, never a grant to someone else's data.

**Plan gate:** `api.access` — the **Fund, Program and Index API** plans (goal doc F-7 named Fund + Program; `plans.csv`
also grants the flag to Index API and the enterprise tiers). Checked on every call, not just at key creation, so a
downgraded plan stops the key the same minute.

**Auth error ladder** (checked in this order — a spent key never pays for a DB round-trip; scope is checked
after plan, so a lapsed Fund subscription answers 402 not 403):

| Status | `error.code` | When |
|--------|--------------|------|
| `401` | `unauthorized` | Missing / malformed / unknown / revoked `Bearer bk_live_…` key. |
| `429` | `rate_limited` | Key's per-minute budget spent (default 60/min). `Retry-After` header carries the wait. |
| `402` | `plan_required` | Owner's plan no longer carries `api.access`. |
| `403` | `insufficient_scope` | Key lacks the scope this route needs. |

Every response carries `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`, `Cache-Control:
private, no-store` and `X-Robots-Tag: noindex`.

### GET /api/v1/evaluations

List the key owner's own evaluations (keyset-paginated, newest first).

| Field | Value |
|-------|-------|
| **Auth** | `evaluations:read` |
| **Query** | `limit` (1-100, default 25) · `cursor` (from a previous page's `next_cursor`) · `industry` · `stage` (0-12) · `min_fit` (0-100, against the caller's PRIMARY investment mandate) |

**Response (200):** `{ ok, data: PublicEvaluationV1[], next_cursor, has_more, meta: { fit_source: "primary_mandate" | "no_mandate", mandate_id } }` —
`meta.fit_source` is `"no_mandate"` when the key owner has none, so a `min_fit` filter degrades visibly (empty
page) instead of silently. Every row: project card, `owner_kind`, `consent_tier`, `svi`, `fit`, and
`links.{dossier,assessment,workspace}`. Never the founder's email/user id or the invite token.

```bash
curl "https://blockid.au/api/v1/evaluations?limit=25&min_fit=60" \
  -H "Authorization: Bearer $BLOCKID_API_KEY"
```

### GET /api/v1/evaluations/{id}/dossier

The Investor Dossier (ReportV2 + blocks) — the same loader the workspace dossier page uses, with the same
consent masking. Counted as a dossier view (`dossier.viewed`, surface `"api"`).

| Field | Value |
|-------|-------|
| **Auth** | `evaluations:read` |
| **Errors** | `404` for an unknown id *or* an id the key owner does not evaluate (never `403` — existence must not leak). |

### GET/POST/PUT /api/v1/evaluations/{id}/assessment

The key owner's own Evaluator Assessment on one evaluation.

| Field | Value |
|-------|-------|
| **GET auth** | `evaluations:read` — read the caller's current assessment + version history. |
| **POST/PUT auth** | `evaluations:write` — create or update it. `PUT` behaves identically to `POST`. |
| **Body (POST/PUT)** | Every field optional; `status: "submitted"` requires `decision` + `conviction` or the write is refused. |
| **Write path** | Delegates to the same `upsertAssessment` the workspace form uses — Zod validation, draft-in-place / v(n+1) versioning, audit rows and the `assessment.submitted` webhook all fire identically; the API cannot bypass any of it. |
| **Errors** | `400 invalid_body` (Zod issues) · `413` body > 64 kB · `422 missing_decision`/`missing_conviction` · `503` migration 0392 not applied. |

```bash
curl -X POST "https://blockid.au/api/v1/evaluations/$ID/assessment" \
  -H "Authorization: Bearer $BLOCKID_API_KEY" -H "Content-Type: application/json" \
  -d '{"decision":"proceed","conviction":4,"status":"submitted"}'
```

### Outbound destinations (webhooks) — Slack / Affinity / Airtable

An evaluator pulling this API often also wants a push the other way: `POST /api/webhooks` (S20-B; destination
kinds G14-S38) subscribes to `assessment.submitted` and the rest of the [webhook catalogue](/docs#webhooks) and
delivers each event to a destination `kind`:

| `kind` | Delivery | Config (`destination_config`) | Allowed host |
|--------|----------|--------------------------------|--------------|
| `generic` (default) | HMAC-signed JSON (`X-BlockID-Signature`) to any public https url — unchanged since S20-B. | none | any (SSRF-guarded) |
| `slack` | Unsigned Slack Block Kit to an incoming-webhook `url`. | none (`url` IS the credential) | `hooks.slack.com` |
| `affinity` | Unsigned `POST /notes` (+ `POST /list-entries` when `list_id` is set). | `api_key`, `organization_id`, `list_id?` | `api.affinity.co` |
| `airtable` | Unsigned `POST /v0/{base}/{table}` record. | `token`, `base_id` (`appXXXXXXXXXXXXXX`), `table` | `api.airtable.com` |

`destination_config` is sealed at rest the same way as the signing secret and never echoed back — `GET
/api/webhooks` returns only the kind's redacted summary (e.g. `{ base_id, table }`, never the token). Every
non-generic kind is pinned to its fixed host regardless of what `destination_config` says (defence in depth,
`lib/webhooks/destinations/*.ts`).

**Zapier:** there is no dedicated `zapier` kind — use a Zapier **Catch Hook** trigger's URL as a `generic`
destination; Zapier ignores the (absent) signature the same way any other receiver that skips verification
would.

```bash
curl -X POST https://blockid.au/api/webhooks \
  -H "Content-Type: application/json" -H "Cookie: blockid_session=…" \
  -d '{"kind":"slack","url":"https://hooks.slack.com/services/T000/B000/xxxx","events":["assessment.submitted"]}'
```

---

## 10. Partner, public and session endpoints

> Added 2026-09-19 (G18-B). Routes that existed but had no prose here. `POST /api/v1/analyze` and
> `GET /api/v1/id/{slug}` are also in the registry (`/developers/api`, `openapi.json`); the rest are documented
> here only.

### POST /api/v1/analyze — partner SVI analysis (`bk_live_` key)

| Field | Value |
|-------|-------|
| **Auth** | `Authorization: Bearer bk_live_…` (scope `analyze`, the default on every key). No plan gate. |
| **Cost** | One `svi_analysis` credit per successful call, spent after the engine returns; `creditsRemaining` echoes the balance. |
| **Body** | `description` (required; aliases `rawText`, `text`) · `startupName` (`name`) · `websiteUrl` (`website`) · `industry` · `stage`. |
| **Response** | `{ ok, sviScore, stage, stageLabel, dimensions[{key,label,score}], topGaps[{label,impact}], creditsRemaining, meta{version, confidence, summary, riskFlags, allGaps[]} }` |
| **Errors** | `401 unauthorized` (also when the key's per-minute budget is spent) · `402 insufficient_credits` (+ `balance`) · `400 invalid_input` · `500 analysis_failed` (nothing charged). |
| **Source** | `src/app/api/v1/analyze/route.ts`, `lib/api-auth.ts` (`authenticateAPIKey`), `lib/api-scopes.ts`. |

### GET /api/v1/svi — institutional SVI index data (`svi_live_` key)

| Field | Value |
|-------|-------|
| **Auth** | `Authorization: Bearer svi_live_…` (mint at `/workspace/settings/enterprise`). Tiers: free 10/day · team 1,000/day · institutional unlimited. CORS `*`. |
| **Query** | `page`, `pageSize` (≤ 100), `sector`, `sort` (`svi` default), or `ticker=ACME-AU` for a single ticker. |
| **Response** | Paginated anonymised tickers with SVI, sector, stage and movement; a single ticker returns the detail row. |
| **Errors** | `401` (no / bad key) · `429` (tier quota). |
| **Source** | `src/app/api/v1/svi/route.ts` (SVI EXC T_SVI_EXC_0014). |

### GET /api/v1/id/{slug} — public verified business profile (JSON)

| Field | Value |
|-------|-------|
| **Auth** | Anonymous allowed (the `/id/{slug}` page is public and indexable). Optional partner bearer with `id:public:read` lifts the limit from 200/min per IP to 2,000/min; a bad token is `401`. |
| **Response** | `{ ok, data: PublicBusinessProfile, _meta: { authenticated, rateLimitRemaining } }` — `slug`, `legalName`, `verificationLevel` (0–5), `trustScore`, `lastVerifiedAt`, `badges[]`, `capabilityScores`, `attestations[]`, `jurisdiction`, `publicUrl`, `rowKind` (`live` \| `demo`). Nothing outside `PublicBusinessProfileSchema` can reach the client. |
| **Cache** | `public, max-age=300, s-maxage=3600, stale-while-revalidate=60`; `X-Robots-Tag: index, follow`; CORS `*`. |
| **Errors** | `404 not_found` for missing *and* unindexed slugs (no enumeration) · `429 rate_limited`. |
| **Source** | `src/app/api/v1/id/[slug]/route.ts`, `lib/business-id/public-profile.ts`. |

### GET /api/v1/id/{slug}/vc — W3C Verifiable Credential (JWT)

Same auth and rate tiers as the JSON endpoint. Returns `{ jwt, expiresAt, credentialSubject, _meta{cached} }`; a
non-revoked credential younger than 60 days is reused verbatim (stable `jti`), otherwise a fresh one is minted,
recorded in `vc_issued` and queued for the nightly Anvil anchor. `404` unindexed · `410 Gone` when the latest
credential is revoked. Issuer key custody: `docs/runbooks/vc-issuer-key-rotation.md`.

### POST /api/v1/vc/{jti}/revoke — owner-only revocation

Session cookie; the caller must own the underlying business (no admin override). Body `{ reason }` (≤ 500 chars).
Idempotent: a second call returns `{ ok: true, alreadyRevoked: true }` with the original timestamp. The
`/.well-known/revocations` feed is authoritative until the anchor cron catches up.

### Outbound webhooks — `/api/webhooks`

| Route | Auth | Notes |
|-------|------|-------|
| `GET /api/webhooks[?project_id]` | Session | Own endpoints (user + project level); with `project_id` every endpoint of that project (admin+ member). Returns `{ ok, endpoints[], access{allowed, reason}, events }`. |
| `POST /api/webhooks` | Session · plan gate: Growth / Startup Package founders and every evaluator plan | `{ url?, events[], project_id?, description?, kind?, destination_config? }`. `kind` = `generic` (default, HMAC-signed) \| `slack` \| `affinity` \| `airtable` (see §9). `201 { ok, endpoint, secret }` — the secret is shown once. `402 plan_required` · `409 limit_reached` (10 per scope) · `503` no DB. |
| `GET/PATCH/DELETE /api/webhooks/{id}` | Session (owner) | Read, pause / resume / change events, delete. |
| `POST /api/webhooks/{id}/test` | Session (owner) | Sends a `ping` delivery. |
| `GET /api/webhooks/{id}/deliveries` | Session (owner) | Delivery log with retry state (1 min → 10 min → 1 h → 6 h, then dead; 20 consecutive failures pause the endpoint). |

Signature and event catalogue: [/docs#webhooks](https://blockid.au/docs#webhooks) — `X-BlockID-Signature: t=…,v1=…`
(HMAC-SHA256 of `${t}.${rawBody}`), `X-BlockID-Event`, `X-BlockID-Delivery`; events `svi.rescored`,
`evidence.uploaded`, `funding.report_ready`, `evaluation.report_ready`, `assessment.submitted`, `ping`.
Source: `src/app/api/webhooks/**`, `lib/webhooks/{sign,dispatch}.ts`, `lib/webhooks/destinations/*`.

### GET /api/reports/access?project=<uuid|default> — Trusted Business Report quote (G16-B)

Session. Read-only: no Stripe session, no credit debit, no order row. Returns what the founder report page needs to
show the free-tier cut and the confirm-before-charge modal: `{ ok, projectId, included (plan carries
report.premium), paidOrderId, paidOrderStatus, quote{credits, estimatedWords, model, depth, sections},
creditBalance, hasSubscription, price{sku, amount_cents, label} }`. `POST /api/reports/checkout` (Stripe, A$3
guest) and `POST /api/reports/redeem` (credits) re-validate every figure at submit. `401` anonymous · `404`
project not in scope.

### POST /api/analytics/event — funnel event ingest (G16-A)

Session cookie (or, for the two anonymous-emittable events `paywall_view` on `/tbr/*` and `share_link_open`, the
`blockid_anon` cookie / `body.session_id`). Body `{ name, params?, session_id?, consent_granted? }`, one event per
call. The server sets identity and the `qa` flag from the account — a client cannot name `user_id` or `qa`;
`trackEvent()` rejects e-mail / phone / card-looking values. 60 events / minute per user (per session or IP when
anonymous). Reply `{ ok: true }` / `{ ok: false, error }`. Event names emitted server-side (never by this route):
`sign_up`, `svi_analyze`, `svi_score_computed`, `report_view`, `checkout`, `trust_report_purchased`,
`feature_gate_hit`.

### POST /api/pilot/apply — evaluator pilot application (G16-C)

Public (no account). Honeypot `company_website` → `204` and nothing stored; per-IP limit 5 / 10 min → `429` +
`Retry-After`; `PilotApplySchema` (zod) → `400 { error: "invalid_input", issues }`; success `200 { ok: true, id }`
after appending to `content/reports/pilot-applications.jsonl` (gitignored, live checkout), an ops alert (Telegram →
e-mail fallback) and an auto-reply. Audited by `apiRoute` with an anonymous actor. Pilots themselves (Program comp,
30 days, cap 5, never a Stripe payer) are started from `/admin/pilots` and expired by the `pilot-expiry` cron.

### Public index — `/api/index/*`

| Route | Auth | Notes |
|-------|------|-------|
| `GET /api/index/svi?bucket=overall\|sector\|stage&format=json\|csv` | Public | k-anonymised aggregates (threshold 5) — also in the registry (`svi-index`). |
| `GET /api/index/headlines` | Public | Snapshot of the Startup Value Index headline numbers; edge-cached 5 min. |
| `GET /api/index/listings?sector&stage&public_only&revenue_only&sort&order&page&pageSize` | Public | Paginated ranked listing; anonymous tickers, opt-in public names; edge-cached 5 min. |
| `GET /api/index/listing/{ticker}` | Public | One ticker's public detail. |
| `POST /api/index/submit` | Public | Startup submission from `/submit` (zod; notifies ops). |
| `POST /api/index/waitlist` | Public | `{ email, name }` → waitlist row; `400` on a missing field, `503` without a DB. |

---

## Appendix: Environment Variables

> The authoritative, commented list is `web/.env.example` (never commit `web/.env`). The Stripe price ids are
> audited read-only by `docs/ops/stripe-env-audit.md` and their amounts by `docs/ops/pricing-truth.md` (lane A owns
> both). Rows below are the groups an integrator or operator will meet in this document.

| Group | Variables | Used by |
|-------|-----------|---------|
| Database | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | `lib/supabase.ts` — self-hosted Supabase Postgres; migrations are applied by hand (`docs/ops/db-migrations.md`). |
| Billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FOUNDER_STARTER` / `_GROWTH`, `STRIPE_PRICE_INVESTOR_ANGEL` / `_ADVISOR` / `_VC_SMALL` (Scout / Firm / Program), `STRIPE_PRICE_INVESTOR_FUND(_ANNUAL)`, `STRIPE_PRICE_ACCEL_INTAKE(_ANNUAL)`, `STRIPE_PRICE_INDEX_API(_ANNUAL)`, `STRIPE_PRICE_ACCEL_STARTER` / `_GROWTH` (Cohort 25 / 100), `STRIPE_PRICE_TRUST_REPORT_5AUD` (A$3 Trusted Business Report), `STRIPE_PRICE_FUNDING_REPORT`, `STRIPE_PRICE_STARTUP_PACKAGE`, `STRIPE_PRICE_CREDITS_*` | `lib/stripe.ts`, `config/pricing/plans.csv` → `plans.generated.ts`. One Stripe account for everything (resellers never get their own). |
| AI | `ANTHROPIC_API_KEY`, `DEEPINFRA_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` (+ the free-pool providers in `content/ai-provider-registry.json`) | `lib/ai-client.ts` — report chain DeepInfra-first, Anthropic / Gemini / Groq fallbacks, Claude CLI last; daily free-model refresh writes `content/reports/ai-free-models.json`. |
| Auth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `IP_HASH_SALT` | `lib/auth.ts`, `/api/auth/google/*` (server-side OAuth redirect flow + GIS popup), `lib/iphash.ts`. |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `ADMIN_EMAIL` | `lib/email.ts`; `ADMIN_EMAIL` is also the alert fallback when Telegram is unavailable. |
| Ops | `CRON_SECRET` (Bearer on every `/api/cron/*` route, read by `scripts/cron-runner.sh` from `web/.env`), `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`, `NEXT_PUBLIC_SITE_URL`, `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` (off-site backups), `ABR_GUID` (ABN lookup) | `web/scripts/crontab.production`, `scripts/db-backup-offsite.mjs`, `lib/abr.ts`. |

---

## Appendix: Credit Cost Summary

> Source of truth: `FEATURE_COSTS` in `web/src/lib/credits.ts` (admin overrides via `platform_config`). 1 credit =
> A$1 list price (packs bring it to ≈ A$0.60). Every paid run shows its credit cost and word count before it is
> charged, and is spent before the run so a failed run refunds rather than double-charges.

| Feature | Credits | Notes |
|---------|---------|-------|
| SVI analysis (`svi_analysis`, `/api/v1/analyze`, `/api/svi`) | 0.5 | First analysis free for anonymous visitors; from the second run in 30 days an e-mail is asked first. |
| AI score (`ai_score`) | 0.25 | Independent AI scoring pass. |
| Competitive research (`research`) | 0.5 | |
| Term sheet AI (`term_sheet`) | 1 | Analysis + dilution diff + lawyer questions. |
| R&D report (`rnd_report` / `rnd_deep_dive`) | 1 / 1.5 | 3-page preview free. |
| Pitch deck outline / pitch video (`pitch_deck` / `pitch_video`) | 1 / 2 | |
| Idea Lab (`idea_lab`) | 3 | |
| Trusted Business Report (`trust_report`) | 3 (= A$3 guest checkout) | Per startup; re-score of a held startup 1; included in evaluator plan quotas (trial: exactly one). |
| Money Finder report (`lib/funding/reports.ts`) | 3 (= A$3 guest) | Free on Starter, the Startup Package and every evaluator plan. |
| Data room generation (`data_room_generate`) | 3 | Persists the room; the share link is free. |
| Evidence upload · investor score · dilution calculator · free tools | 0 | |

## Appendix: Plans and included credits

> Source of truth: `web/src/config/pricing/plans.csv` (→ `plans.generated.ts`, DB `plans` rows synced by migration
> 0400) and `docs/ops/pricing-truth.md`. Prices are GST-inclusive AUD; annual = 10 × monthly.

| Segment | Plan | Price | Trial | Notes |
|---------|------|-------|-------|-------|
| Founder | Free | A$0 | — | First SVI analysis, public score, 1 profile. |
| Founder | Starter | A$29/mo | 7 d | Workspace, data room, investor links, Founder Radar, Money Finder included. |
| Founder | Growth | A$69/mo | 7 d | + cap table, term sheets, evidence vault, webhooks, weekly snapshots. |
| Founder | Startup Package | A$149 once | — | Guided journey + 25 credits + Growth extras for the package term. |
| Evaluator | Scout | A$79/mo | 7 d (card) | 25 tracked startups, reports included per plan quota. |
| Evaluator | Firm | A$149/mo | 7 d (card) | + advisory equity, advisor portal, white-label. |
| Evaluator | Program | A$349/mo | 7 d (card) | + batch scoring, LP report, `api.access`. |
| Evaluator | Fund | A$999/mo | 7 d | Investor firms; `api.access`. |
| Evaluator | Index API | A$299/mo | — | `api.access`, 1,000 API calls / day, 2 seats. |
| Accelerator | Intake link | A$249/mo | 14 d | `/apply/[slug]` scored intake inbox (`intake.manage`). |
| Accelerator | Cohort 25 / Cohort 100 | A$500/mo (A$5K/yr) / A$1,500/mo (A$15K/yr) | 14 d | Batch scoring + LP / sponsor report. |
| Any | Trusted Business Report | A$3 per startup | — | Pay-as-you-go without a subscription. |

Legacy: the Founding 100 lifetime deal closed 2026-09-01 (buyers keep a legacy plan); A$299 Pro was retired
2026-09-08 (`founder_scale` stays in the catalogue as `public: false`).
