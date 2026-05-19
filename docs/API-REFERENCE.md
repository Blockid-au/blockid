# BlockID.au -- API Reference

> 38 endpoints | Base URL: `https://blockid.au` (production) or `http://localhost:3000` (dev)
> All routes use `force-dynamic` rendering. All POST routes accept `Content-Type: application/json` unless noted.

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

---

## Authentication Methods

| Method | Description |
|--------|-------------|
| **Session Cookie** | `blockid_session` HttpOnly cookie set after login. 90-day expiry. |
| **CRON_SECRET** | `Authorization: Bearer $CRON_SECRET` header for cron endpoints. |
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

## Appendix: Environment Variables

| Variable | Required | Used By |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | supabase.ts |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | supabase.ts |
| `STRIPE_SECRET_KEY` | Yes (payments) | stripe.ts |
| `STRIPE_WEBHOOK_SECRET` | Yes (webhooks) | stripe webhook |
| `STRIPE_PRICE_FOUNDING50` | Yes (checkout) | stripe.ts |
| `STRIPE_PRICE_FOUNDER` | For plan | stripe.ts |
| `STRIPE_PRICE_GROWTH` | For plan | stripe.ts |
| `STRIPE_PRICE_SVI_ANALYSIS` | For per-analysis | stripe/analysis |
| `STRIPE_PRICE_SVI_ANALYSIS_25` | Post early-bird | stripe/analysis |
| `ANTHROPIC_API_KEY` | For AI | ai-client.ts |
| `OPENAI_API_KEY` | Fallback AI | ai-client.ts |
| `GOOGLE_GEMINI_API_KEY` | Fallback AI | ai-client.ts |
| `GOOGLE_CLIENT_ID` | Google login | auth/google |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` | Evidence upload | google-drive.ts |
| `GOOGLE_DRIVE_PRIVATE_KEY` | Evidence upload | google-drive.ts |
| `GOOGLE_DRIVE_FOLDER_ID` | Evidence upload | google-drive.ts |
| `SMTP_USER` | Email | email.ts |
| `SMTP_PASS` | Email | email.ts |
| `SMTP_HOST` | Email (default: smtp.gmail.com) | email.ts |
| `SMTP_PORT` | Email (default: 587) | email.ts |
| `SMTP_FROM_EMAIL` | Email (default: BlockID \<admin@blockid.au\>) | email.ts |
| `CRON_SECRET` | Cron auth | cron routes |
| `NEXT_PUBLIC_SITE_URL` | URL generation | email.ts, auth.ts |
| `IP_HASH_SALT` | Privacy | iphash.ts |
| `ADMIN_EMAIL` | Evidence sharing (default: admin@blockid.au) | google-drive.ts |

---

## Appendix: Credit Cost Summary

| Feature | Cost | Notes |
|---------|------|-------|
| SVI Analysis | 1 | First analysis free for unauthenticated users |
| AI Score | 1 | Independent AI scoring comparison |
| Competitive Research | 2 | Uses Claude web search |
| SVI Report | 3 | 500-700 word AI report |
| Term Sheet AI | 3 | Claude-powered analysis + dilution diff |
| Evidence Upload | 0 | Free |
| Investor Score | 0 | Free |
| Dilution Calculator | 0 | Free |

## Appendix: Plan Credits

| Plan | Credits | Recurring | Price |
|------|---------|-----------|-------|
| Free | 1 | No | $0 |
| Starter | 5 | Monthly | -- |
| Founding 50 | 50 | No (lifetime) | A$49 |
| Founder | 50 | Monthly | A$99/mo |
| Growth | 100 | Monthly | A$499/mo |
| Unlimited | 999999 | Monthly | -- |
