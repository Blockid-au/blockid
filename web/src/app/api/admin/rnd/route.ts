import { NextResponse } from "next/server";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { callAI, isAIConfigured } from "@/lib/ai-client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── Types ──────────────────────────────────────────────────────────────

type RndTopic = "features" | "pricing" | "market" | "cta" | "full";

const VALID_TOPICS = new Set<RndTopic>(["features", "pricing", "market", "cta", "full"]);

// ── System prompt ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior product strategist and market researcher for BlockID.au — an AI-powered startup valuation and ownership platform for Australian founders.

Current platform: SVI scoring (8 dimensions), term sheet AI, credit system ($1-25 per analysis), evidence vault, cap table tools, Stripe payments, bilingual EN/VI. Target: pre-seed to Series A founders in Australia.

Respond in structured markdown with headers, bullet points, and tables.
Be specific with numbers, competitor names, and actionable recommendations.`;

// ── Topic prompts ──────────────────────────────────────────────────────

const TOPIC_PROMPTS: Record<Exclude<RndTopic, "full">, string> = {
  features: `Analyze the current BlockID platform and propose 5-10 feature upgrades. For each feature:

1. **Feature name** and one-line description
2. **Effort** (Low / Medium / High) — estimated dev time
3. **Impact** (Low / Medium / High) — user value and revenue potential
4. **Priority score** (1-10) — effort vs impact
5. **Target user segment** — which founders benefit most
6. **Revenue model** — how it monetizes (credit cost, subscription tier, etc.)

Current features to build on:
- SVI scoring (8 dimensions: team, market, product, traction, financials, legal, network, execution)
- Cap table management and modeling
- Term sheet AI analysis
- Evidence vault (document upload and verification)
- Credit-based pricing ($1-25 per analysis)
- Investor-Ready Score sharing
- Bilingual EN/VI interface
- Guided roadmap by stage

Format as a markdown table followed by detailed descriptions of the top 5 features.`,

  pricing: `Research SaaS pricing models for startup tools and recommend optimal pricing for BlockID.

Compare with these competitors:
- **Carta** — equity management, 409A valuations
- **AngelList** — fundraising, roll-up vehicles
- **Clerky** — legal docs for startups
- **Ownr** — Canadian business registration
- **Stripe Atlas** — incorporation + banking
- **Gust** — investor relationship management
- **Capdesk** / **Ledgy** — equity management

Provide:

## 1. Credit Pricing Optimization
- Current: $1-25 per analysis
- Recommended credit tiers with specific prices
- Bundle pricing (e.g., 10-pack, 50-pack discounts)
- Enterprise/unlimited pricing

## 2. Subscription Plans
- Free tier limits and features
- Pro tier price point and features
- Enterprise tier price point and features
- Annual vs monthly pricing differential

## 3. Promotional Strategies
- Seasonal offers (EOFY, new year, startup week)
- Referral program structure and incentives
- Volume discounts for accelerators/incubators
- Early-bird / Founding member pricing

## 4. Freemium Optimization
- What to give away free (conversion hook)
- Trial duration recommendation
- Paywall placement strategy

Include specific dollar amounts in AUD, conversion rate benchmarks, and expected revenue impact.`,

  market: `Research the Australian startup ecosystem and BlockID's market opportunity.

Provide:

## 1. Total Addressable Market (TAM)
- Number of active startups in Australia (by stage)
- Annual new startup registrations
- VC funding volume in Australia (2023-2025 trends)
- Average startup spend on tools/SaaS

## 2. Serviceable Addressable Market (SAM)
- Pre-seed to Series A founders specifically
- Founders using equity management tools
- Founders seeking valuation tools

## 3. Competition Analysis
For each competitor, provide: name, pricing, target segment, key differentiator, threat level.
- Direct competitors (startup valuation tools)
- Adjacent competitors (cap table, legal, incorporation)
- Potential entrants (banks, accountancy firms, gov programs)

## 4. Market Trends
- AI adoption in startup tools
- Regulatory changes affecting startups (AU specific)
- Remote/distributed founding trends
- Cross-border startup formation

## 5. Strategic Opportunities
- Untapped segments
- Partnership opportunities (accelerators, VCs, gov grants)
- Geographic expansion potential (NZ, SEA)
- Platform ecosystem plays

Include specific numbers, sources where possible, and a 2-year market outlook.`,

  cta: `Generate 10 CTA headline variations for the BlockID.au homepage, optimized for conversion. The target audience is Australian startup founders (pre-seed to Series A).

Provide:

## 1. Hero Headlines (10 variations)
For each: the headline text, a supporting subheadline, and the conversion psychology behind it (e.g., urgency, social proof, curiosity, authority, loss aversion).

## 2. Search Bar Placeholder Text (5 variations)
The main search bar where founders describe their startup idea. Placeholder text that encourages action.

## 3. CTA Button Text (10 variations)
For primary action buttons. Mix of styles: direct, benefit-led, curiosity-driven, urgency.

## 4. Value Proposition Statements (5 variations)
One-liner descriptions of BlockID's core value for use in headers, meta descriptions, and ads.

## 5. Social Proof Suggestions
- Metrics to highlight (number of analyses, founders served, etc.)
- Testimonial frameworks (what quotes to solicit)
- Trust signals (partnerships, certifications, data residency)
- Urgency triggers (limited spots, price increases, seasonal)

## 6. A/B Testing Plan
Recommend which headlines to test first, expected conversion lift ranges, and testing duration.

Be specific and creative. Consider Australian English and cultural context.`,
};

// ── AI call helper ─────────────────────────────────────────────────────

async function runResearch(topic: Exclude<RndTopic, "full">): Promise<string> {
  const { text } = await callAI({
    system: SYSTEM_PROMPT,
    user: TOPIC_PROMPTS[topic],
    maxTokens: 4096,
  });
  return text;
}

// ── Route handler ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 503 });
  }

  try {
    const body = await request.json() as { topic?: string };
    const topic = body.topic as RndTopic | undefined;

    if (!topic || !VALID_TOPICS.has(topic)) {
      return NextResponse.json(
        { ok: false, error: `Invalid topic. Must be one of: ${[...VALID_TOPICS].join(", ")}` },
        { status: 400 },
      );
    }

    if (topic === "full") {
      // Run all four topics in parallel
      const [features, pricing, market, cta] = await Promise.all([
        runResearch("features"),
        runResearch("pricing"),
        runResearch("market"),
        runResearch("cta"),
      ]);

      const report = [
        "# BlockID R&D Full Report",
        "",
        `_Generated ${new Date().toISOString()}_`,
        "",
        "---",
        "",
        "# Part 1: Feature Upgrades",
        "",
        features,
        "",
        "---",
        "",
        "# Part 2: Pricing & Promotions",
        "",
        pricing,
        "",
        "---",
        "",
        "# Part 3: Market Analysis",
        "",
        market,
        "",
        "---",
        "",
        "# Part 4: CTA & Messaging",
        "",
        cta,
      ].join("\n");

      return NextResponse.json({
        ok: true,
        topic: "full",
        report,
        generatedAt: new Date().toISOString(),
      });
    }

    // Single topic
    const report = await runResearch(topic);

    return NextResponse.json({
      ok: true,
      topic,
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[blockid:rnd]", err);
    const message = err instanceof Error ? err.message : "Research failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
