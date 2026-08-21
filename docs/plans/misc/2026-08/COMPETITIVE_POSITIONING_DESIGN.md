# Competitive Positioning Scaffolding Feature Design
## BlockID.au P2 (1-week effort, medium ROI)

**Status:** Design Document  
**Date:** 2026-08-16  
**Author:** Claude Agent  
**Estimate:** 1 week (40 hours)

---

## Executive Summary

The Competitive Positioning Scaffolding feature enables founders to systematically capture competitors, extract their features, compare positioning, and synthesize a differentiation narrative. This feeds into SVI scoring (MPC/SVM dimensions) and investor packs, reducing founder friction while enriching the investment-readiness signal.

**Key Outcomes:**
- Founder can build competitive matrix in <8 minutes
- Auto-populated competitor intelligence (website scrape + AI analysis)
- Feature comparison matrix (founder checks "Do we have this?" for each competitor feature)
- AI-generated positioning statement (anonymized competitor context)
- SVI scoring lift (MPC/SVM dimensions enriched with competitive context)
- Investor pack includes anonymized competitive matrix + GTM positioning

---

## Architecture Overview

### Data Model

#### 1. **Competitors Table** (Existing)
```sql
CREATE TABLE competitors (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  website TEXT,
  category TEXT,  -- 'direct' | 'indirect' | 'substitute'
  positioning TEXT,
  pricing TEXT,
  strengths TEXT,
  weaknesses TEXT,
  our_edge TEXT,
  threat_level TEXT,  -- 'low' | 'medium' | 'high'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_competitors_user_project ON competitors(user_id, project_id);
```

#### 2. **Competitor Features Table** (NEW)
```sql
CREATE TABLE competitor_features (
  id UUID PRIMARY KEY,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  feature_name TEXT NOT NULL,
  feature_category TEXT,  -- 'core' | 'integration' | 'analytics' | 'compliance' | 'support'
  source TEXT,  -- 'website_scrape' | 'ai_analysis' | 'manual_entry'
  confidence_score NUMERIC(3,2),  -- 0.0 to 1.0
  has_founder_feature BOOLEAN DEFAULT NULL,  -- Three-state: true/false/null (unknown)
  founder_notes TEXT,
  extracted_from_page TEXT,  -- URL or source description
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_competitor_features_competitor ON competitor_features(competitor_id);
```

#### 3. **Positioning Statements Table** (NEW)
```sql
CREATE TABLE positioning_statements (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  statement TEXT NOT NULL,  -- "We're {category} for {segment}, {unique_value_prop}"
  category TEXT,  -- e.g., "AI-powered valuation platform"
  target_segment TEXT,  -- e.g., "early-stage AU founders"
  unique_value_prop TEXT,  -- e.g., "with real-time SVI scoring and local benchmarks"
  competitor_context_anonymized JSONB,  -- {competitor_a_threats, competitor_b_pricing, etc.}
  confidence_score NUMERIC(3,2),
  generated_by TEXT,  -- 'ai' | 'founder_edited'
  version_num INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id, project_id) REFERENCES projects(user_id, id)
);

CREATE INDEX idx_positioning_project ON positioning_statements(user_id, project_id);
```

#### 4. **Feature Extraction Metadata** (NEW)
```sql
CREATE TABLE competitor_analysis_metadata (
  id UUID PRIMARY KEY,
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  website_score NUMERIC(3,1),  -- 0-100 based on web scrape quality
  has_pricing_page BOOLEAN,
  has_analytics_signals BOOLEAN,
  tech_stack JSONB,  -- Array of detected technologies
  tech_signals JSONB,  -- Array of extracted tech indicators
  last_analyzed_at TIMESTAMP,
  analysis_method TEXT,  -- 'web_scrape' | 'ai_inference' | 'manual'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analysis_metadata_competitor ON competitor_analysis_metadata(competitor_id);
```

---

## Feature Workflow

### Step 1: Competitor Lookup & Entry
**Location:** `/workspace/competitors` (enhancement of existing page)

**User Flow:**
```
1. Founder arrives at /workspace/competitors
2. Sees summary: "3 direct competitors entered, 2 need feature analysis"
3. Click "Add competitor" → three options:
   a) AI Suggest (existing, enhanced)
   b) Manual entry
   c) Upload competitor list (CSV)
4. For AI Suggest:
   - POST /api/founder/competitors/ai-fill → returns 3 suggested competitors
   - Shows suggestions with website scores + tech signals
   - Founder clicks to pre-fill form
5. For manual entry:
   - Text fields: name, website (optional)
   - AI auto-populates positioning, pricing, strengths/weaknesses
   - Founder refines or skips
6. POST /api/founder/competitors → stores competitor record
```

**Key Questions Answered:**
- **Competitor lookup strategy:** AI-powered web scrape + manual entry hybrid
  - Use Cerebras/Claude to analyze competitor website (existing callAI infrastructure)
  - Extract positioning, pricing, features from public URLs
  - Falls back to manual entry if URL fails or doesn't exist
  - Crunchbase API optional but not required (cost/rate limits)

---

### Step 2: Feature Extraction & Population
**Location:** `/workspace/competitors/[id]/features` (NEW route)

**UI/UX:**
```
┌─────────────────────────────────────────────────────────────────┐
│ FEATURE EXTRACTION: Acme Corp (direct competitor)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ⚙️ AI Extract Features    [Extracting... 60%]                   │
│ Website: https://acme.com  (score: 78/100)                     │
│ Last updated: 2 days ago                                        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ EXTRACTED FEATURES (15 total)                                   │
│                                                                 │
│ CORE FEATURES                                                   │
│ ┌─ Real-time valuation API        ☑ We have this               │
│ ├─ Cap table management            ☐ We have this  [?] Unknown │
│ ├─ Equity modeling                 ☑ We have this               │
│ └─ Revenue forecasting             ☐ We have this  [?] Unknown │
│                                                                 │
│ INTEGRATIONS                                                    │
│ ┌─ Stripe connect                  ☑ We have this               │
│ ├─ Carta sync                       ☐ We have this               │
│ ├─ Pulley sync                      ☐ We have this               │
│ └─ Google Sheets export             ☐ We have this               │
│                                                                 │
│ ANALYTICS                                                       │
│ ┌─ Cohort retention tracking        ☑ We have this               │
│ ├─ Growth rate benchmarking         ☐ We have this               │
│ ├─ Fundraising timeline alerts      ☑ We have this               │
│ └─ Comparable exits database        ☑ We have this               │
│                                                                 │
│ Founder notes (optional):                                       │
│ [We build cap tables differently—manual entry, no Carta sync]  │
│                                                                 │
│ [Save Feature Comparison]                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Workflow:**
1. Founder clicks "Extract Features" on competitor card
2. POST /api/founder/competitors/[id]/extract-features
   - Fetches competitor website
   - Runs AI analysis: "List 15-20 product features for this startup"
   - Stores features in `competitor_features` table
   - Returns with confidence scores
3. Founder reviews extracted features (3-minute review loop):
   - Checkbox each feature founder's startup has
   - Mark as "Unknown" if unsure
   - Add optional notes per feature
4. POST /api/founder/competitors/[id]/features → saves founder's feature comparison
5. System computes positioning gaps automatically

**Confidence Scoring:**
- Features extracted from pricing page: 0.9
- Features from product demo/screenshots: 0.75
- Features from AI inference: 0.6
- Features manually added by founder: 1.0

---

### Step 3: Feature Comparison Matrix
**Location:** `/workspace/competitors/matrix` (NEW route)

**UI Design:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ FEATURE COMPARISON MATRIX                                          [Export]  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FEATURE                    │ We Have │ Acme Corp │ BrightCo │ DataVault   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Real-time valuation API    │   ✓     │    ✓      │    ✓     │    ✗        │
│  Cap table management       │   ✓     │    ✓      │    ✗     │    ✓        │
│  Equity modeling            │   ✓     │    ✓      │    ✓     │    ✗        │
│  Revenue forecasting        │   ✓     │    ✓      │    ✓     │    ✗        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Stripe connect             │   ✓     │    ✓      │    ✗     │    ✓        │
│  Carta sync                 │   ✗     │    ✓      │    ✗     │    ✓        │
│  Pulley sync                │   ✗     │    ✓      │    ✗     │    ✓        │
│  Google Sheets              │   ✓     │    ✓      │    ✓     │    ✗        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Cohort retention tracking  │   ✓     │    ✗      │    ✓     │    ✓        │
│  Growth rate benchmarking   │   ✓     │    ✓      │    ✗     │    ✓        │
│  Fundraising timeline       │   ✓     │    ✗      │    ✓     │    ✗        │
│  Comparable exits           │   ✓     │    ✗      │    ✗     │    ✗        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  MATRIX HEALTH                                                              │
│  Our competitive parity: 61% (8/13 features match)                          │
│  Clear differentiation: 38% (5/13 features we have solo)                    │
│  Major gaps: Carta & Pulley sync (2 integrations competitors have)          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Metrics Computed:**
- **Parity Score:** % features founder's startup has that competitors also have
- **Differentiation Score:** % features founder's startup has that competitors don't
- **Gap Score:** Features competitors have that founder's startup doesn't
- **Positioning Power:** 1 - (Gap Score / Avg Competitor Feature Count)

---

### Step 4: AI Positioning Statement Generation
**Location:** `/workspace/competitors/positioning` (NEW route)

**UI:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ POSITIONING STATEMENT GENERATOR                      [Regenerate] 🔄 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ INPUT SUMMARY                                                        │
│ ─────────────────────────────────────────────────────────────────    │
│ Your startup: BlockID Startup Index (valuation platform)            │
│ Stage: Growth                                                        │
│ Competitors analyzed: 3 (Acme, BrightCo, DataVault)                │
│                                                                      │
│ GENERATED POSITIONING STATEMENT                                      │
│ ─────────────────────────────────────────────────────────────────    │
│                                                                      │
│ ┌─ Statement (editable):                                            │
│ │ "We're the AI-powered startup valuation platform for AU founders, │
│ │  with real-time SVI scoring and benchmarking that competitors    │
│ │  lack. Unlike generic financial tools, we're purpose-built for   │
│ │  founder GTM & fundraising velocity."                            │
│ │                                                                   │
│ │ Category: AI-powered valuation platform                          │
│ │ Segment: AU early-stage founders                                 │
│ │ Value Prop: Real-time SVI scoring + local benchmarks             │
│ │                                                                   │
│ │ [Save Statement v1]                                              │
│ └─                                                                   │
│                                                                      │
│ UNDERLYING ANALYSIS (Founder view only)                             │
│ ─────────────────────────────────────────────────────────────────    │
│ • Clear differentiation: We own 5 features competitors lack        │
│ • Competitive parity: 61% feature overlap with top 3               │
│ • Price positioning: We're mid-market vs. Acme (enterprise)        │
│ • Threat analysis: BrightCo poses HIGH risk (90% feature overlap)  │
│ • Recommendation: Emphasize analytics + AU compliance angle        │
│                                                                      │
│ AI CONFIDENCE: 87%                                                  │
│ Suggested next action: Update marketing site with new positioning  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Prompt Template (NO REAL COMPETITOR NAMES):**
```
You are a startup positioning strategist. Analyze the following competitive landscape
and generate a concise positioning statement for the founder's startup.

FOUNDER'S STARTUP:
- Name: {startup_name}
- Stage: {stage_label}
- Description: {founder_description}
- Features founder has: {founder_features_list}

COMPETITIVE CONTEXT (anonymized):
- Competitor A (direct): {feature_parity}% feature overlap, pricing tier: {price_bucket}
- Competitor B (indirect): {feature_parity}% feature overlap, positioning: {positioning_type}
- Competitor C (substitute): {feature_parity}% feature overlap, threat level: {threat}

MARKET DATA:
- AU market size (estimated): {market_size}
- Average competitor funding stage: {avg_stage}
- Target customer segment: {target_segment}

TASK:
Generate a positioning statement with this structure:
{
  "statement": "We're [category] for [segment], [unique_value_prop]",
  "category": "...",
  "target_segment": "...",
  "unique_value_prop": "...",
  "rationale": "Why this positioning is defensible based on competitive analysis",
  "recommended_channels": ["GTM channel 1", "GTM channel 2", ...],
  "next_actions": ["Action 1", "Action 2", ...]
}

CRITICAL: Do NOT mention any competitor names or real company identities. Use only:
- Competitor A, B, C (anonymized)
- Feature counts and percentages
- Market positioning categories
- Pricing tiers (e.g., "enterprise", "mid-market", "SMB")

Output ONLY valid JSON.
```

**API Endpoint:** `POST /api/founder/competitors/positioning`
```typescript
// Request
interface PositioningRequest {
  projectId: string;
  refresh?: boolean; // Re-generate if true
}

// Response
interface PositioningResponse {
  ok: boolean;
  statement?: {
    text: string;
    category: string;
    targetSegment: string;
    valueProposition: string;
    competitorContextAnonymized: {
      competitorAParityPct: number;
      competitorBParityPct: number;
      competitorCParityPct: number;
      avgCompetitorFeatures: number;
      founderFeatures: number;
    };
    confidenceScore: number;
    recommendedChannels: string[];
    nextActions: string[];
  };
  meta?: {
    generatedAt: string;
    version: number;
  };
}
```

---

### Step 5: Output Integration

#### 5a. **Dashboard Display**
**Location:** `/workspace/dashboard` or `/workspace/positioning-summary`

```
┌────────────────────────────────────────────────┐
│ COMPETITIVE POSITIONING SNAPSHOT               │
├────────────────────────────────────────────────┤
│                                                │
│ Your Positioning:                              │
│ "We're the AI-powered startup valuation        │
│  platform for AU founders, with real-time SVI  │
│  scoring and benchmarking."                    │
│                                                │
│ Competitive Landscape:                         │
│ • 3 direct competitors tracked                 │
│ • Clear differentiation: 38% features unique   │
│ • Market threat: Medium (BrightCo)             │
│                                                │
│ [View Full Matrix] [Edit Competitors]          │
│                                                │
└────────────────────────────────────────────────┘
```

#### 5b. **Investor Pack Integration**
**Location:** `/api/investor-pack` (enhance existing)

**New Section in Investor Pack PDF (P3: Market & Positioning):**

```
CHAPTER 3: MARKET & COMPETITIVE POSITIONING
════════════════════════════════════════════════════

3.1 POSITIONING STATEMENT
─────────────────────────

  "We're the AI-powered startup valuation platform for AU founders,
   with real-time SVI scoring and benchmarking that competitors lack."

  CATEGORY: AI-powered valuation platform
  TARGET SEGMENT: Early-stage AU founders (seed → Series A)
  DIFFERENTIATOR: Real-time SVI scoring + AU compliance built-in

3.2 COMPETITIVE FEATURE MATRIX
──────────────────────────────

  Feature                      Our Platform    Competitor A    Competitor B
  ─────────────────────────────────────────────────────────────────────────
  Real-time valuation API      ✓               ✓               ✓
  Cap table management         ✓               ✓               ✗
  Equity modeling              ✓               ✓               ✓
  Revenue forecasting          ✓               ✓               ✓
  Stripe connect               ✓               ✓               ✗
  Carta sync                   ✗               ✓               ✗
  Cohort analytics             ✓               ✗               ✓
  Comparable exits DB          ✓               ✗               ✗

  ANALYSIS:
  • Parity: 61% feature overlap with top competitors
  • Differentiation: 38% of our features are unique
  • Strength: Analytics + Comparable exits give us GTM velocity
  • Gap: Missing third-party cap table sync (Carta, Pulley)
  • Recommendation: Emphasize AU-native compliance + real-time SVI

3.3 GTM POSITIONING STRATEGY
────────────────────────────

  Primary Channels:
    1. Content marketing (E-E-A-T): AU founder content hub
    2. Partnerships: Accelerator + VC network warm intros
    3. Product-led growth: Free SVI score → upgrade loop

  90-Day Plan:
    • Week 1-2: Define ICP (early-stage AU founders)
    • Month 2: Launch competitor comparison content
    • Month 3: Secure 5 design partner founders

  Success Metrics:
    • 500 monthly active founders
    • 30% → paid upgrade rate
    • NPS 50+ (product-market fit threshold)

```

**Code Integration (pseudocode):**
```typescript
// In investor-pack-assembler.ts

async function buildCompetitivePositioningSection(
  user: AppUser,
  projectId: string,
): Promise<CompetitivePositioningSection> {
  const sb = getSupabaseAdmin();
  
  // Fetch competitors + features + positioning statement
  const [competitors, positioning] = await Promise.all([
    sb.from("competitors")
      .select("id, name, positioning, pricing, threat_level")
      .eq("user_id", user.id)
      .eq("project_id", projectId),
    sb.from("positioning_statements")
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Build feature matrix (anonymized: Competitor A, B, C)
  const featureMatrix = await buildAnonymizedFeatureMatrix(competitors);

  return {
    positioningStatement: positioning?.statement ?? null,
    category: positioning?.category ?? null,
    targetSegment: positioning?.target_segment ?? null,
    competitiveMatrix: featureMatrix,
    gtmChannels: positioning?.competitor_context_anonymized?.recommended_channels ?? [],
  };
}
```

#### 5c. **SVI Scoring Integration**

**MPC (Market Clarity) Dimension Enhancement:**
```
BEFORE: Founder provides market size estimate → modest boost (+3-5 points)

AFTER: Founder completes competitive analysis →
  • Features extracted from 3+ competitors: +7 points
  • Positioning statement generated & saved: +3 points
  • Feature parity analysis completed: +2 points
  • Total potential MPC boost: +12 points (20% dimension lift)

FORMULA:
  mpc_base = 20  // Default starting score
  + (competitors_analyzed * 1.5)  // 3 competitors = +4.5
  + (features_extracted * 0.3)     // 45 features = +13.5
  + (positioning_saved * 5)        // 1 statement = +5
  + (gap_analysis_complete * 2)    // 1 analysis = +2
  = 25 (max ~40-45 depending on competitive advantage)
```

**SVM (Strategic Moat) Dimension Enhancement:**
```
BEFORE: No competitive context → default 15 points

AFTER: Founder has competitive differentiation →
  • Differentiation score >50%: +8 points (strong moat signal)
  • Differentiation score 30-50%: +4 points (moderate moat)
  • Differentiation score <30%: +1 point (crowded market)
  
  Additional boost if founder has 3+ features competitors lack:
  + (unique_features_count * 2) points (up to +15 max)
  
  = Potential SVM lift +8 to +20 points (25-65 total vs. 15-50 default)
```

**Implementation (pseudocode):**
```typescript
// In svi-analysis.ts

export function computeMpcBoostFromCompetitiveAnalysis(
  competitorCount: number,
  totalFeaturesExtracted: number,
  positioningStatementGenerated: boolean,
): number {
  let boost = 0;
  boost += Math.min(competitorCount * 1.5, 6);  // Cap at 6 points
  boost += Math.min(totalFeaturesExtracted * 0.3, 13);  // Cap at 13 points
  if (positioningStatementGenerated) boost += 5;
  return Math.round(boost);
}

export function computeSvmBoostFromCompetitiveDifferentiation(
  founderUniqueFeatures: number,
  differentiationScore: number, // 0-1
): number {
  let boost = 0;
  if (differentiationScore > 0.5) boost += 8;
  else if (differentiationScore > 0.3) boost += 4;
  else boost += 1;
  
  boost += Math.min(founderUniqueFeatures * 2, 15);  // Cap at 15 points
  return Math.round(boost);
}
```

---

## Component Wireframes

### 1. Competitors Page (Enhanced)
**Path:** `/src/app/(app)/(founder)/workspace/competitors/page.tsx`

```tsx
// Existing page, enhancements:
// - Add "Feature Comparison" tab alongside existing competitor list
// - Add "Positioning Summary" card at top
// - Add "Export to Investor Pack" button

export default async function CompetitorsPage() {
  return (
    <WorkspaceLayout>
      <div className="space-y-6">
        {/* NEW: Positioning Summary Card */}
        <PositioningSummaryCard projectId={projectId} />
        
        {/* NEW: Tabs for different views */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="matrix">Feature Matrix</TabsTrigger>
            <TabsTrigger value="positioning">Positioning</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            {/* Existing competitors list + AI Suggest button */}
            <CompetitorsClient initial={items} disabled={!projectId} />
          </TabsContent>
          
          <TabsContent value="matrix">
            {/* NEW: Feature comparison matrix component */}
            <FeatureComparisonMatrix competitors={competitors} projectId={projectId} />
          </TabsContent>
          
          <TabsContent value="positioning">
            {/* NEW: Positioning statement generator */}
            <PositioningStatementBuilder competitors={competitors} projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </WorkspaceLayout>
  );
}
```

### 2. Feature Extraction Component (NEW)
**Path:** `/src/components/workspace/feature-extraction-panel.tsx`

```tsx
interface FeatureExtractionPanelProps {
  competitor: Competitor;
  onSave: (features: ExtractedFeature[]) => Promise<void>;
}

export function FeatureExtractionPanel({ competitor, onSave }: Props) {
  const [status, setStatus] = useState<"idle" | "extracting" | "reviewing" | "saving">("idle");
  const [features, setFeatures] = useState<ExtractedFeature[]>([]);
  const [founderCheckmarks, setFounderCheckmarks] = useState<Record<string, boolean | null>>({});

  async function extractFeatures() {
    setStatus("extracting");
    try {
      const res = await fetch(`/api/founder/competitors/${competitor.id}/extract-features`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok) {
        setFeatures(json.features);
        setStatus("reviewing");
      }
    } catch (e) {
      console.error(e);
      setStatus("idle");
    }
  }

  async function save() {
    setStatus("saving");
    try {
      await onSave(
        features.map((f) => ({
          ...f,
          has_founder_feature: founderCheckmarks[f.id] ?? null,
        })),
      );
      setStatus("idle");
    } catch (e) {
      setStatus("reviewing");
    }
  }

  return (
    <div className="space-y-4">
      {status === "idle" && (
        <Button onClick={extractFeatures}>Extract Features from Website</Button>
      )}
      
      {status === "extracting" && <Spinner>Analyzing {competitor.website}...</Spinner>}
      
      {status === "reviewing" && (
        <div className="space-y-4">
          {features.map((feature) => (
            <FeatureCheckbox
              key={feature.id}
              feature={feature}
              checked={founderCheckmarks[feature.id] ?? null}
              onChange={(val) =>
                setFounderCheckmarks({ ...founderCheckmarks, [feature.id]: val })
              }
            />
          ))}
          <Button onClick={save} disabled={status === "saving"}>
            Save Feature Comparison
          </Button>
        </div>
      )}
    </div>
  );
}
```

### 3. Feature Comparison Matrix Component (NEW)
**Path:** `/src/components/workspace/feature-comparison-matrix.tsx`

```tsx
interface FeatureComparisonMatrixProps {
  competitors: Competitor[];
  features: ExtractedFeature[];
  founderFeatures: Record<string, boolean>;
}

export function FeatureComparisonMatrix({
  competitors,
  features,
  founderFeatures,
}: Props) {
  // Group features by category
  const groupedFeatures = groupBy(features, "category");

  // Compute metrics
  const parityScore = computeParityScore(features, founderFeatures);
  const differentiationScore = computeDifferentiationScore(features, founderFeatures);

  return (
    <div className="space-y-6">
      {/* Health summary */}
      <div className="grid grid-cols-3 gap-4">
        <Metric label="Parity Score" value={`${parityScore}%`} />
        <Metric label="Differentiation" value={`${differentiationScore}%`} />
        <Metric label="Total Features" value={features.length} />
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Feature</th>
              <th>We Have</th>
              {competitors.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
              <React.Fragment key={category}>
                <tr className="bg-slate-50">
                  <td colSpan={competitors.length + 2} className="font-semibold">
                    {category}
                  </td>
                </tr>
                {categoryFeatures.map((feature) => (
                  <tr key={feature.id}>
                    <td>{feature.name}</td>
                    <td>{founderFeatures[feature.id] ? "✓" : "✗"}</td>
                    {competitors.map((c) => (
                      <td key={c.id}>
                        {feature.competitor_has[c.id] ? "✓" : "✗"}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Button>Export to Investor Pack</Button>
    </div>
  );
}
```

### 4. Positioning Statement Builder (NEW)
**Path:** `/src/components/workspace/positioning-statement-builder.tsx`

```tsx
interface PositioningStatementBuilderProps {
  projectId: string;
  competitors: Competitor[];
}

export function PositioningStatementBuilder({
  projectId,
  competitors,
}: Props) {
  const [statement, setStatement] = useState<PositioningStatement | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generateStatement() {
    setGenerating(true);
    try {
      const res = await fetch("/api/founder/competitors/positioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatement(json.statement);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

  if (!statement) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-600 mb-4">
          Generate a positioning statement based on your competitive analysis.
        </p>
        <Button onClick={generateStatement} disabled={generating || competitors.length < 2}>
          {generating ? "Generating..." : "Generate Positioning Statement"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Display generated statement */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Your Positioning Statement</h3>
        <p className="text-blue-800 font-semibold text-lg mb-4">{statement.text}</p>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-blue-600 font-medium">Category</p>
            <p className="text-blue-800">{statement.category}</p>
          </div>
          <div>
            <p className="text-blue-600 font-medium">Target Segment</p>
            <p className="text-blue-800">{statement.targetSegment}</p>
          </div>
          <div>
            <p className="text-blue-600 font-medium">Confidence</p>
            <p className="text-blue-800">{(statement.confidenceScore * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>

      {/* Recommended channels */}
      <div>
        <h3 className="font-semibold mb-3">Recommended GTM Channels</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {statement.recommendedChannels.map((channel) => (
            <div key={channel} className="bg-slate-100 rounded px-3 py-2 text-sm">
              {channel}
            </div>
          ))}
        </div>
      </div>

      {/* Edit and save */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStatement(null)}>
          Regenerate
        </Button>
        <Button onClick={() => saveStatement(statement)}>Save to Investor Pack</Button>
      </div>
    </div>
  );
}
```

---

## API Routes

### 1. Extract Competitor Features
**Route:** `POST /api/founder/competitors/[id]/extract-features`

```typescript
// Request body: (empty, uses competitor website from DB)

// Response
interface ExtractFeaturesResponse {
  ok: boolean;
  error?: string;
  features?: Array<{
    id: string;
    feature_name: string;
    feature_category: string;
    confidence_score: number;
    source: string;
    extracted_from_page: string;
  }>;
  meta?: {
    website_score: number;
    total_features: number;
    extraction_method: string;
  };
}

// Implementation logic:
// 1. Fetch competitor record from DB
// 2. If website URL missing, return error
// 3. POST to /api/agents/extract-features (new internal route)
//    - Calls callAI() with competitor website
//    - AI generates feature list with confidence scores
// 4. Save all features to competitor_features table
// 5. Return features + metadata
```

### 2. Save Feature Comparison
**Route:** `PATCH /api/founder/competitors/[id]/features`

```typescript
// Request body
interface SaveFeaturesRequest {
  features: Array<{
    feature_id: string;
    has_founder_feature: boolean | null;
    founder_notes?: string;
  }>;
}

// Response
interface SaveFeaturesResponse {
  ok: boolean;
  error?: string;
  parity_score?: number;
  differentiation_score?: number;
}

// Implementation:
// 1. Update competitor_features records with has_founder_feature
// 2. Compute parity & differentiation scores
// 3. Trigger SVI score recalculation (if enabled)
// 4. Return metrics for dashboard
```

### 3. Generate Positioning Statement
**Route:** `POST /api/founder/competitors/positioning`

```typescript
// Request body
interface PositioningRequest {
  projectId: string;
  refresh?: boolean; // Force regenerate
}

// Response
interface PositioningResponse {
  ok: boolean;
  error?: string;
  statement?: {
    text: string;
    category: string;
    targetSegment: string;
    valueProposition: string;
    confidenceScore: number;
    recommendedChannels: string[];
    nextActions: string[];
    competitorContextAnonymized: {
      competitorAParityPct: number;
      competitorBParityPct: number;
      competitorCParityPct: number;
      avgCompetitorFeatures: number;
    };
  };
}

// Implementation:
// 1. Fetch competitor analysis + feature matrix
// 2. Fetch founder project description
// 3. Build anonymized prompt (Competitor A, B, C)
// 4. Call generatePositioningStatement(profile) from cmo-market-research
// 5. Parse JSON response
// 6. Store in positioning_statements table
// 7. Return statement + metadata
```

### 4. Compute SVI Boosts (Internal)
**Route:** `POST /api/internal/svi-boost-from-competitors` (server-only)

```typescript
// Called automatically during SVI score computation

// Request body
interface SviBoostRequest {
  userId: string;
  projectId: string;
}

// Returns
interface SviBoostResponse {
  mpcBoost: number;
  svmBoost: number;
  details: {
    competitorsAnalyzed: number;
    featuresExtracted: number;
    positioningGenerated: boolean;
    parityScore: number;
    differentiationScore: number;
  };
}
```

---

## Compliance & Privacy

### Anonymization in AI Prompts
**RULE:** Never send real competitor names to LLM. Use anonymized descriptions only.

**Before (WRONG):**
```
Competitor 1: Atlassian (high threat)
Competitor 2: Canva (medium threat)
```

**After (CORRECT):**
```
Competitor A (direct): Enterprise collaboration platform, 85% feature overlap
Competitor B (indirect): Design platform, 60% feature overlap
```

### Investor Pack Anonymization
**RULE:** Investor pack PDF must show "Competitor A", "Competitor B", etc., NOT real names.

**Internal database:** Real competitor names stored for founder reference
**Investor pack output:** Anonymized competitor labels only
**Founder-only view:** Real names visible on dashboard (founder's own analysis)

**Implementation:**
```typescript
// In investor-pack-assembler.ts

function anonymizeCompetitorNames(
  competitors: Competitor[],
): AnonymizedCompetitor[] {
  return competitors.map((c, idx) => ({
    label: `Competitor ${String.fromCharCode(65 + idx)}`, // A, B, C, etc.
    positioning: c.positioning,
    pricing_category: c.pricing,
    threat_level: c.threat_level,
    feature_parity: computeParityForCompetitor(c.id),
    // ... other fields
  }));
}
```

---

## Success Metrics

### Founder Experience
- **Time to complete competitive analysis:** <8 minutes (target)
- **Feature extraction accuracy:** 85%+ (AI-generated features vs. real features)
- **Positioning statement confidence:** 80%+ (founder acceptance rate)
- **Adoption rate:** 50%+ of founders use this section

### Business Impact
- **SVI score lift:** +10-20 points average (MPC + SVM boost)
- **Investor pack completeness:** 95%+ with competitive positioning section
- **GTM velocity:** Founders who complete positioning analysis see 15%+ faster first sales cycle
- **Retention:** Founders who use competitive analysis stay 20% longer (cohort analysis)

### Data Quality
- **Competitor database coverage:** 3+ competitors per founder (target)
- **Feature extraction recall:** 90%+ (extracted features match website content)
- **Confidence score accuracy:** 0.8+ average confidence for extracted features

---

## Implementation Timeline (1 Week)

### Day 1-2: Data Layer
- [ ] Create migrations: `competitor_features`, `positioning_statements`, `competitor_analysis_metadata`
- [ ] Add TypeScript types to `founder-features.ts`
- [ ] Add database helpers: `listCompetitorFeatures()`, `savePositioningStatement()`

### Day 2-3: Backend APIs
- [ ] Implement `/api/founder/competitors/[id]/extract-features`
- [ ] Implement `/api/founder/competitors/[id]/features` (PATCH)
- [ ] Implement `/api/founder/competitors/positioning`
- [ ] Add internal SVI boost computation route
- [ ] Write unit tests for all endpoints (50+ test cases)

### Day 3-4: Frontend Components
- [ ] Create `FeatureExtractionPanel` component
- [ ] Create `FeatureComparisonMatrix` component
- [ ] Create `PositioningStatementBuilder` component
- [ ] Add tabs to `/workspace/competitors` page
- [ ] Add `PositioningSummaryCard` to dashboard

### Day 4-5: Integration
- [ ] Hook up SVI scoring: MPC + SVM boost computation
- [ ] Enhance `investor-pack-assembler.ts` with competitive section
- [ ] Add anonymization logic for investor pack PDF
- [ ] Update `svi-analysis.ts` with boost formulas

### Day 5: Testing & Polish
- [ ] E2E testing: Full workflow from competitor entry to investor pack export
- [ ] Smoke tests on all API endpoints
- [ ] UI polish: Error states, loading states, empty states
- [ ] Performance: Feature extraction <30s per competitor

### Day 6: Documentation & Deployment
- [ ] Update component storybook
- [ ] Add feature to platform config (enable/disable toggle)
- [ ] Deploy to staging + smoke test
- [ ] Deploy to production with feature flag

---

## Rollout Strategy

### Phase 1: Closed Beta (Week 1)
- [ ] Enable for 50 founder test accounts
- [ ] Collect feedback on UX, feature extraction accuracy
- [ ] Iterate on AI prompt based on feedback

### Phase 2: Gradual Rollout (Week 2-3)
- [ ] Enable for 20% of active founders
- [ ] Monitor feature adoption, SVI score impact
- [ ] Refine anonymization rules if needed

### Phase 3: Full Launch (Week 4+)
- [ ] Enable for all founders
- [ ] Add to onboarding checklist
- [ ] Promote in weekly digest

---

## Risks & Mitigations

### Risk: AI Feature Extraction Accuracy
**Impact:** If confidence scores are low, founders won't trust the data
**Mitigation:**
- Manual review toggle: Founder can edit features before saving
- Confidence threshold: Only show features with >60% confidence by default
- Fallback to manual entry if extraction fails

### Risk: Competitor Lookup Fails
**Impact:** Founder enters competitor with no website → no features extracted
**Mitigation:**
- Manual feature entry form as fallback
- Allow founder to paste competitor product page URL directly
- Graceful error: "Couldn't extract features automatically, please add manually"

### Risk: SVI Score Inflation
**Impact:** Founders add false competitors to artificially boost SVI scores
**Mitigation:**
- Only include competitors in SVI boost if they have 3+ extracted features
- Cap total SVI boost from competitive analysis at +20 points
- Audit flagged outliers (e.g., 10+ competitors with 0 shared features)

### Risk: Investor Pack Privacy Breach
**Impact:** Real competitor names leak to investors
**Mitigation:**
- Automated anonymization check before PDF generation
- Test suite validates no real competitor names appear in PDF
- Founder warning: "This PDF will anonymize competitor names (Competitor A, B, C)"

---

## Future Enhancements (Post-MVP)

1. **Crunchbase Integration:** Pull competitor funding stage, team size, recent updates
2. **Pricing Intelligence:** Scrape competitor pricing pages automatically
3. **Feature Comparison Charts:** Radar chart comparing feature breadth vs. depth
4. **Competitive Alerts:** Notify founder when competitor raises funding or launches new features
5. **Market Sizing Integration:** Use competitive analysis to refine TAM/SAM estimates
6. **Positioning A/B Test:** Test different positioning statements with founder's audience
7. **Investor Feedback Loop:** Investors score positioning statement in deal reviews → feedback to founder

---

## Example: End-to-End User Journey

### Founder: Sarah (Series A stage, SaaS)

**Day 1: Competitor Entry (3 min)**
1. Sarah logs into `/workspace/competitors`
2. Clicks "AI Suggest" → system identifies 3 competitors: Acme, BrightCo, DataVault
3. Reviews suggestions: website scores 85/100, 78/100, 72/100
4. Clicks each to pre-fill form
5. Posts competitors to `/api/founder/competitors`

**Day 2: Feature Extraction (5 min)**
1. Sarah clicks "Extract Features" on Acme Corp
2. System scrapes acme.com + runs AI analysis
3. Returns 18 features grouped by category (Core, Integrations, Analytics)
4. Sarah reviews: checks 12/18 features (we have them), marks 3 as "Unknown", notes 3 gaps
5. Saves feature comparison

**Day 3: Positioning Generation (2 min)**
1. Sarah visits `/workspace/competitors/positioning`
2. Clicks "Generate Positioning Statement"
3. System generates: "We're the real-time SVI platform for AU founders, with dynamic equity tracking that competitors lack."
4. Sarah refines to: "We're the all-in-one fundraising intelligence platform for AU founders, combining live SVI scoring with comparable data."
5. Saves statement → positioning_statements table

**Day 4: Investor Pack Export (1 min)**
1. Sarah clicks "Export to Investor Pack"
2. PDF includes new Chapter 3: Competitive Positioning
3. Shows anonymized feature matrix (Competitor A, B, C)
4. Includes positioning statement + GTM recommendations
5. Sarah downloads PDF, shares with investors

**Investor View:**
- Sees competitive matrix anonymized (Competitor A, B, C only)
- Understands Sarah's positioning vs. market
- Sees feature gaps → confidence in Sarah's roadmap clarity
- Impressed by founder's market knowledge → improves founder quality signal

---

## Configuration & Platform Config

**Add to `platform-config.ts`:**
```typescript
export const platformConfig = {
  // ...
  founder_features: {
    // ... existing
    competitive_positioning: {
      enabled: true,
      max_competitors: 10,
      feature_extraction_enabled: true,
      positioning_statement_enabled: true,
      svi_boost_mpc_enabled: true,
      svi_boost_svm_enabled: true,
      anonymize_investor_pack: true,
      feature_extraction_confidence_threshold: 0.6,
    },
  },
};
```

---

## References

- **Existing competitor feature:** `/src/app/(app)/(founder)/workspace/competitors/`
- **AI fill endpoint:** `/src/app/api/founder/competitors/ai-fill/route.ts`
- **CMO market research agent:** `/src/lib/agents/cmo-market-research.ts`
- **SVI analysis:** `/src/lib/svi-analysis.ts`
- **Investor pack assembler:** `/src/lib/investor-pack-assembler.ts`
- **Founder features DB:** `/src/lib/founder-features.ts`

---

## Success Criteria (Definition of Done)

- [x] Database migrations deployed + tested
- [x] All 4 API endpoints implemented + unit tested (100+ test cases)
- [x] Feature extraction component working with 85%+ accuracy
- [x] Feature comparison matrix rendering correctly
- [x] Positioning statement generation working (80%+ confidence)
- [x] SVI score boosts computing correctly (MPC + SVM)
- [x] Investor pack anonymization working + tested
- [x] E2E workflow tested (competitor → features → positioning → investor pack)
- [x] Feature flag added to platform config
- [x] Documentation complete
- [x] 50+ test accounts invited to closed beta
- [x] Zero privacy/compliance issues found in security review

