# Revenue Forecast API Examples & Testing Guide

---

## API Endpoints Overview

```
POST   /api/financial-model                    Generate projection (free preview)
POST   /api/financial-model/save               Save model to DB (2 credits)
GET    /api/financial-model?projectId=...     List all models for project
GET    /api/financial-model/[id]              Fetch single model
GET    /api/financial-model/[id]/projection   Export projection (CSV with ?format=csv)
PUT    /api/financial-model/[id]              Update model metadata
DELETE /api/financial-model/[id]              Soft-delete model
```

---

## 1. Generate Projection (Preview)

**Endpoint:** `POST /api/financial-model`

**Use case:** Founder in wizard preview, no save yet, no credit charge.

**Request:**
```bash
curl -X POST "https://blockid.au/api/financial-model" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "modelType": "saas",
    "currentArrAud": 50000,
    "monthlyGrowthPct": 8,
    "churnPct": 3,
    "cogsPercent": 25,
    "opexMonthlyAud": 35000,
    "fixedCostsAud": 5000,
    "scenario": "base",
    "includeTaxIncentives": true
  }'
```

**Response (200 OK):**
```json
{
  "ok": true,
  "projection": {
    "input": {
      "sector": "saas",
      "startingMrrAud": 4166.67,
      "startingBurnAud": 35000,
      "founderCount": 2,
      "startDate": "2026-08-17",
      "scenario": "base",
      "includeTaxIncentives": true
    },
    "months": [
      {
        "month": 1,
        "date": "2026-08-01",
        "revenueAud": 4167,
        "grossMarginAud": 3125,
        "opexAud": 40000,
        "ebitdaAud": -36875,
        "cashOutflowAud": 36875,
        "cumCashAud": 36875,
        "headcount": 2,
        "taxOffsetAud": 0
      },
      {
        "month": 2,
        "date": "2026-09-01",
        "revenueAud": 4500,
        "grossMarginAud": 3375,
        "opexAud": 40800,
        "ebitdaAud": -37425,
        "cashOutflowAud": 37425,
        "cumCashAud": 74300,
        "headcount": 2,
        "taxOffsetAud": 162
      },
      "... 34 more months ..."
    ],
    "summary": {
      "revenueYear1": 180000,
      "revenueYear2": 600000,
      "revenueYear3": 1500000,
      "burnYear1": 420000,
      "ebitdaYear3": 200000,
      "runwayMonths": 18,
      "peakBurnAud": 37425,
      "scenarioNote": "Base case assumes typical SaaS growth trajectory with 2% monthly OpEx escalation",
      "investorReadinessNote": "Series A funding recommended by month 20 to extend runway beyond cash position."
    },
    "sectorNormsUsed": {
      "sector": "saas",
      "baseMonthlyGrowthPct": 8,
      "grossMarginPct": 75,
      "rdIntensityPct": 20,
      "arrMultipleMidYr3": 15
    },
    "generatedAt": "2026-08-17T12:34:56.123Z",
    "disclaimer": "General information only. Not financial advice. Projections are illustrative estimates based on AU sector benchmarks and may differ materially from actual outcomes."
  },
  "creditsCharged": 0,
  "creditsRemaining": null
}
```

**Error Responses:**

```json
// 400 Bad Request — validation error
{
  "ok": false,
  "error": "`monthlyGrowthPct` must be between -100 and 500.",
  "disclaimer": "..."
}
```

```json
// 402 Payment Required — insufficient credits (if logged in)
{
  "ok": false,
  "error": "Insufficient credits.",
  "creditsRequired": 2,
  "balance": 0,
  "disclaimer": "..."
}
```

```json
// 429 Too Many Requests — rate limited
{
  "ok": false,
  "error": "Too many requests — try again shortly.",
  "retryInSeconds": 30,
  "disclaimer": "..."
}
```

---

## 2. Save Model to Database

**Endpoint:** `POST /api/financial-model/save`

**Use case:** Founder clicks "Save" button after viewing results. Costs 2 credits.

**Request:**
```bash
curl -X POST "https://blockid.au/api/financial-model/save" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Base case - Q3 2026",
    "projection": { /* full projection object from /generate response */ },
    "notes": "Assumes 2 new hires by month 12, typical SaaS trajectory",
    "useForInvestorPack": false
  }'
```

**Response (201 Created):**
```json
{
  "ok": true,
  "model": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Base case - Q3 2026",
    "modelType": "saas",
    "scenario": "base",
    "monthBreakeven": 18,
    "monthsToSeriesA": 20,
    "arrMonth12Aud": 180000,
    "arrMonth24Aud": 520000,
    "arrMonth36Aud": 1500000,
    "peakMonthlyBurnAud": 37425,
    "useForInvestorPack": false,
    "version": 1,
    "createdAt": "2026-08-17T12:35:00Z",
    "updatedAt": "2026-08-17T12:35:00Z",
    "publishedAt": null
  },
  "creditsCharged": 2,
  "creditsRemaining": 43
}
```

---

## 3. List All Models for Project

**Endpoint:** `GET /api/financial-model?projectId=[id]`

**Use case:** Dashboard widget, fetch latest saved model(s).

**Request:**
```bash
curl -X GET "https://blockid.au/api/financial-model?projectId=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "ok": true,
  "models": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Bull case - aggressive marketing",
      "scenario": "bull",
      "monthBreakeven": 14,
      "arrMonth12Aud": 250000,
      "useForInvestorPack": true,
      "publishedAt": "2026-08-17T14:00:00Z",
      "version": 2,
      "createdAt": "2026-08-17T12:34:56Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440003",
      "name": "Conservative - base case",
      "scenario": "base",
      "monthBreakeven": 18,
      "arrMonth12Aud": 180000,
      "useForInvestorPack": false,
      "version": 1,
      "createdAt": "2026-08-16T10:00:00Z"
    }
  ]
}
```

---

## 4. Fetch Single Model with Full Projection

**Endpoint:** `GET /api/financial-model/[id]`

**Use case:** Dashboard "View Details" button, investor pack assembly.

**Request:**
```bash
curl -X GET "https://blockid.au/api/financial-model/660e8400-e29b-41d4-a716-446655440001" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "ok": true,
  "model": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Base case - Q3 2026",
    "modelType": "saas",
    "currentArrAud": 50000,
    "monthlyGrowthPct": 8,
    "churnPct": 3,
    "cogsPercent": 25,
    "opexMonthlyAud": 35000,
    "fixedCostsAud": 5000,
    "includeTaxIncentives": true,
    "scenario": "base",
    "monthBreakeven": 18,
    "monthsToSeriesA": 20,
    "peakMonthlyBurnAud": 37425,
    "arrMonth12Aud": 180000,
    "arrMonth24Aud": 520000,
    "arrMonth36Aud": 1500000,
    "runwayMonths": 18,
    "useForInvestorPack": false,
    "version": 1,
    "createdAt": "2026-08-17T12:35:00Z",
    "updatedAt": "2026-08-17T12:35:00Z",
    "publishedAt": null,
    "projectionData": {
      "input": { /* ...full input... */ },
      "months": [ /* ...36 month objects... */ ],
      "summary": { /* ...summary... */ },
      "sectorNormsUsed": { /* ...norms... */ },
      "generatedAt": "...",
      "disclaimer": "..."
    }
  }
}
```

---

## 5. Export as CSV

**Endpoint:** `GET /api/financial-model/[id]/projection?format=csv`

**Use case:** Founder downloads CSV for spreadsheet analysis.

**Request:**
```bash
curl -X GET "https://blockid.au/api/financial-model/660e8400-e29b-41d4-a716-446655440001/projection?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o financial-projections-saas-base-2026-08-17.csv
```

**Response (200 OK, text/csv):**
```csv
Month,Date,Revenue AUD,COGS AUD,Gross Margin AUD,OpEx AUD,EBITDA AUD,Cash Outflow AUD,Cumulative Cash AUD,Headcount,Tax Offset AUD
1,2026-08-01,4167,1042,3125,40000,-36875,36875,36875,2,0
2,2026-09-01,4500,1125,3375,40800,-37425,37425,74300,2,162
3,2026-10-01,4860,1215,3645,41616,-37971,37971,112271,2,175
4,2026-11-01,5250,1313,3938,42469,-38531,38531,150802,2,188
5,2026-12-01,5670,1418,4253,43358,-39105,39105,189907,2,202
6,2027-01-01,6123,1531,4592,44285,-39693,39693,229600,3,217
...
36,2029-07-01,181800,45450,136350,50000,86350,0,420000,5,0
```

---

## 6. Update Model Metadata

**Endpoint:** `PUT /api/financial-model/[id]`

**Use case:** Founder renames model, toggles "use in investor pack", updates notes.

**Request:**
```bash
curl -X PUT "https://blockid.au/api/financial-model/660e8400-e29b-41d4-a716-446655440001" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Updated: Base case with new marketing spend",
    "useForInvestorPack": true,
    "notes": "Adjusted for post-launch marketing"
  }'
```

**Response (200 OK):**
```json
{
  "ok": true,
  "model": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Updated: Base case with new marketing spend",
    "useForInvestorPack": true,
    "version": 1,
    "updatedAt": "2026-08-17T12:40:00Z",
    "publishedAt": "2026-08-17T12:40:00Z"
  }
}
```

---

## 7. Delete Model (Soft-Delete)

**Endpoint:** `DELETE /api/financial-model/[id]`

**Use case:** Founder removes model from list (but keeps audit trail).

**Request:**
```bash
curl -X DELETE "https://blockid.au/api/financial-model/660e8400-e29b-41d4-a716-446655440001" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (204 No Content):**
```
(empty response body)
```

---

## Testing Script (Node.js / TypeScript)

**File:** `test/financial-model-api.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const API_BASE = "http://localhost:3000";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

describe("Financial Model API", () => {
  let projectId: string;
  let modelId: string;
  let token: string;

  beforeAll(async () => {
    // 1. Create test user
    const { data: authData, error: authErr } = await supabase.auth.signUpWithPassword({
      email: `test-${Date.now()}@example.com`,
      password: "TestPassword123!",
    });
    if (authErr) throw authErr;

    token = authData.session?.access_token!;

    // 2. Create test project
    const { data: projData, error: projErr } = await supabase
      .from("projects")
      .insert({
        name: "Test Startup",
        sector: "saas",
        created_by: authData.user!.id,
      })
      .select("id")
      .single();
    if (projErr) throw projErr;
    projectId = projData.id;
  });

  it("should generate projection without saving (free preview)", async () => {
    const res = await fetch(`${API_BASE}/api/financial-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        projectId,
        modelType: "saas",
        currentArrAud: 50000,
        monthlyGrowthPct: 8,
        churnPct: 3,
        cogsPercent: 25,
        opexMonthlyAud: 35000,
        fixedCostsAud: 5000,
        scenario: "base",
        includeTaxIncentives: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.projection.months.length).toBe(36);
    expect(data.projection.summary.monthBreakeven).toBe(18);
    expect(data.creditsCharged).toBe(0);  // Free preview
  });

  it("should save model (2 credits cost)", async () => {
    // First generate
    const genRes = await fetch(`${API_BASE}/api/financial-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        projectId,
        modelType: "saas",
        currentArrAud: 50000,
        monthlyGrowthPct: 8,
        churnPct: 3,
        cogsPercent: 25,
        opexMonthlyAud: 35000,
        fixedCostsAud: 5000,
        scenario: "base",
        includeTaxIncentives: true,
      }),
    });
    const { projection } = await genRes.json();

    // Then save
    const saveRes = await fetch(`${API_BASE}/api/financial-model/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        projectId,
        name: "Test base case",
        projection,
        notes: "Testing API",
        useForInvestorPack: false,
      }),
    });

    expect(saveRes.status).toBe(201);
    const data = await saveRes.json();
    expect(data.ok).toBe(true);
    expect(data.model.id).toBeDefined();
    expect(data.creditsCharged).toBe(2);
    modelId = data.model.id;
  });

  it("should list models for project", async () => {
    const res = await fetch(`${API_BASE}/api/financial-model?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.models.length).toBeGreaterThan(0);
    expect(data.models[0].id).toBe(modelId);
  });

  it("should fetch full model with projection data", async () => {
    const res = await fetch(`${API_BASE}/api/financial-model/${modelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.model.projectionData.months.length).toBe(36);
  });

  it("should export CSV", async () => {
    const res = await fetch(
      `${API_BASE}/api/financial-model/${modelId}/projection?format=csv`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const csv = await res.text();
    const lines = csv.split("\n");
    expect(lines.length).toBeGreaterThan(36);  // Header + 36 months + empty
  });

  it("should update model", async () => {
    const res = await fetch(`${API_BASE}/api/financial-model/${modelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Updated test base case",
        useForInvestorPack: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.model.name).toBe("Updated test base case");
    expect(data.model.useForInvestorPack).toBe(true);
  });

  it("should soft-delete model", async () => {
    const res = await fetch(`${API_BASE}/api/financial-model/${modelId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(204);

    // Verify it's marked deleted
    const checkRes = await fetch(`${API_BASE}/api/financial-model/${modelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(checkRes.status).toBe(404);  // Or returns is_deleted=true
  });

  it("should validate input and return 400 on invalid ARR", async () => {
    const res = await fetch(`${API_BASE}/api/financial-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        projectId,
        modelType: "saas",
        currentArrAud: -50000,  // Invalid negative
        monthlyGrowthPct: 8,
        churnPct: 3,
        cogsPercent: 25,
        opexMonthlyAud: 35000,
        fixedCostsAud: 5000,
        scenario: "base",
        includeTaxIncentives: true,
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain("ARR");
  });

  it("should enforce rate limiting", async () => {
    // Make 50 rapid requests in short window
    const requests = Array(50)
      .fill(null)
      .map(() =>
        fetch(`${API_BASE}/api/financial-model`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            projectId,
            modelType: "saas",
            currentArrAud: 50000,
            monthlyGrowthPct: 8,
            churnPct: 3,
            cogsPercent: 25,
            opexMonthlyAud: 35000,
            fixedCostsAud: 5000,
            scenario: "base",
            includeTaxIncentives: true,
          }),
        })
      );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Clean up: delete test project
    await supabase.from("projects").delete().eq("id", projectId);
  });
});
```

**Run tests:**
```bash
npm run test -- test/financial-model-api.test.ts
```

---

## cURL Testing Cheatsheet

```bash
# 1. Authenticate (get token)
TOKEN=$(curl -s -X POST "https://blockid.au/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@example.com","password":"pwd"}' | jq -r '.token')

# 2. Generate projection
curl -X POST "https://blockid.au/api/financial-model" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "projectId":"550e8400-e29b-41d4-a716-446655440000",
    "modelType":"saas",
    "currentArrAud":50000,
    "monthlyGrowthPct":8,
    "churnPct":3,
    "cogsPercent":25,
    "opexMonthlyAud":35000,
    "fixedCostsAud":5000,
    "scenario":"base",
    "includeTaxIncentives":true
  }' | jq .

# 3. Extract model ID from response, then save
MODEL_ID=$(curl -s -X POST "https://blockid.au/api/financial-model/save" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{...}' | jq -r '.model.id')

# 4. List models
curl -s "https://blockid.au/api/financial-model?projectId=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 5. Fetch full model
curl -s "https://blockid.au/api/financial-model/$MODEL_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 6. Export CSV
curl -s "https://blockid.au/api/financial-model/$MODEL_ID/projection?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o projection.csv && cat projection.csv

# 7. Update
curl -X PUT "https://blockid.au/api/financial-model/$MODEL_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Updated name","useForInvestorPack":true}' | jq .

# 8. Delete
curl -X DELETE "https://blockid.au/api/financial-model/$MODEL_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\n%{http_code}\n"
```

---

## Postman Collection (JSON)

Import into Postman for easy testing:

```json
{
  "info": {
    "name": "Financial Model API",
    "description": "BlockID Revenue Forecast API testing"
  },
  "item": [
    {
      "name": "Generate Projection",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" },
          { "key": "Authorization", "value": "Bearer {{token}}" }
        ],
        "url": { "raw": "{{baseUrl}}/api/financial-model", "host": ["api", "blockid", "au"] },
        "body": {
          "mode": "raw",
          "raw": "{\"projectId\":\"{{projectId}}\",\"modelType\":\"saas\",\"currentArrAud\":50000,\"monthlyGrowthPct\":8,\"churnPct\":3,\"cogsPercent\":25,\"opexMonthlyAud\":35000,\"fixedCostsAud\":5000,\"scenario\":\"base\",\"includeTaxIncentives\":true}"
        }
      }
    },
    {
      "name": "List Models",
      "request": {
        "method": "GET",
        "header": [
          { "key": "Authorization", "value": "Bearer {{token}}" }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/financial-model?projectId={{projectId}}",
          "host": ["api", "blockid", "au"]
        }
      }
    }
  ],
  "variable": [
    { "key": "baseUrl", "value": "https://blockid.au" },
    { "key": "token", "value": "" },
    { "key": "projectId", "value": "" }
  ]
}
```

---

**End of API Examples & Testing Guide**

These examples cover all common use cases and provide copy-paste templates for testing.
