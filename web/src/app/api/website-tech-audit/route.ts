// Deep Website Technology Audit endpoint
//
// POST /api/website-tech-audit
// Body: { url: string, accountId?: string, analyzeCI?: boolean }
//
// Performs a comprehensive technical analysis of a website URL and returns
// detailed security, performance, tech stack, product maturity data, and
// AI-powered competitive intelligence (SCI score, GTM, elevation plan).
// Optionally creates svi_evidence entries if accountId is provided.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { deepTechAudit, scrapeUrl, type TechAuditResult } from "@/lib/rnd-input";
import { detectSector } from "@/lib/svi-analysis";
import {
  analyzeWebsiteCI,
  computeHeuristicSCI,
  getSectorEbitdaBenchmarks,
  type WebsiteCompetitiveIntelligence,
} from "@/lib/competitive-intelligence";

export const dynamic = "force-dynamic";

async function authenticateRequest() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value;
  if (!sessionToken) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", sessionToken)
    .maybeSingle();
  if (!session) return null;

  const { data: user } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", session.user_id)
    .single();
  if (!user) return null;

  return { userId: user.id as string, email: user.email as string };
}

async function findAccountByEmail(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data?.id as string | null;
}

function buildEvidenceEntries(audit: TechAuditResult, accountId: string) {
  const now = new Date().toISOString();
  const entries: Array<{
    account_id: string;
    evidence_type: string;
    label: string;
    value_or_url: string;
    confidence_level: string;
    dimension: string;
    svi_impact: number;
    verified_at: string;
    created_at: string;
  }> = [];

  // Tech stack evidence → PTD
  const techLabel = audit.evidenceLabels.find((l) => l.startsWith("Tech:"));
  if (techLabel) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: techLabel,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "ptd",
      svi_impact: Math.max(0, audit.signalBoosts.ptdBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // Security evidence → LCO
  const secLabel = audit.evidenceLabels.find((l) => l.startsWith("Security:"));
  if (secLabel) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: secLabel,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "lco",
      svi_impact: Math.max(0, audit.signalBoosts.lcoBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // Performance evidence → PTD
  const perfLabel = audit.evidenceLabels.find((l) => l.startsWith("Performance:"));
  if (perfLabel) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: perfLabel,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "ptd",
      svi_impact: audit.performance.ttfbMs < 500 ? 3 : 0,
      verified_at: now,
      created_at: now,
    });
  }

  // Payment integration detected → PTD (product maturity, not confirmed revenue)
  if (audit.techStack.payments.length > 0) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: `Payment integration detected: ${audit.techStack.payments.join(", ")} (presence only — not confirmed revenue)`,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "ptd",
      svi_impact: Math.max(0, audit.signalBoosts.treBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // Analytics evidence → TRE
  if (audit.techStack.analytics.length > 0) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: `Analytics: ${audit.techStack.analytics.join(", ")}`,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "tre",
      svi_impact: 2,
      verified_at: now,
      created_at: now,
    });
  }

  // CDN/Infrastructure evidence → SVM
  if (audit.techStack.cdn || audit.techStack.hosting) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: `Infra: ${audit.techStack.cdn ?? audit.techStack.hosting}`,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "svm",
      svi_impact: Math.max(0, audit.signalBoosts.svmBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // GitHub link discovered → PTD
  if (audit.productMaturity.githubLink) {
    entries.push({
      account_id: accountId,
      evidence_type: "github",
      label: `GitHub: ${audit.productMaturity.githubLink}`,
      value_or_url: audit.productMaturity.githubLink,
      confidence_level: "connected_source",
      dimension: "ptd",
      svi_impact: 10,
      verified_at: now,
      created_at: now,
    });
  }

  return entries;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; analyzeCI?: boolean };

    if (!body?.url || typeof body.url !== "string") {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }

    // Run deep tech audit and content scrape in parallel
    const [audit, scraped] = await Promise.all([
      deepTechAudit(body.url),
      scrapeUrl(body.url).catch(() => ({ title: "", description: "", text: "", techHints: [] })),
    ]);

    // Detect sector from combined content
    const combinedText = [scraped.title, scraped.description, scraped.text].join(" ");
    const detectedSector = detectSector(combinedText);

    // AI Competitive Intelligence — run if requested OR by default for authenticated users
    let competitiveIntelligence: WebsiteCompetitiveIntelligence | null = null;

    const shouldRunCI = body.analyzeCI !== false; // default: true
    if (shouldRunCI) {
      // Try AI-powered CI analysis first, fall back to heuristic
      const aiCI = await analyzeWebsiteCI(
        body.url,
        { title: scraped.title, description: scraped.description, text: scraped.text },
        audit,
        detectedSector,
      );

      if (aiCI) {
        competitiveIntelligence = aiCI;
      } else {
        // Heuristic fallback — no AI required
        const heuristic = computeHeuristicSCI(audit, detectedSector);
        competitiveIntelligence = {
          ...heuristic,
          marketMaturity: "growing",
          subSector: detectedSector ?? "Technology",
          targetCustomer: "To be determined",
          revenueModelFit: ["SaaS / Subscription", "Transactional", "Marketplace commission"],
          competitors: [],
          uniquePositioning: "Analysis requires more website content",
          gtmStrategy: {
            primaryChannel: "Direct / Inbound",
            phase1: { title: "Discovery", tactics: ["Content marketing", "SEO", "Direct outreach"], timeline: "Month 1-3" },
            phase2: { title: "Traction", tactics: ["Paid acquisition", "Partnerships", "Product-led growth"], timeline: "Month 4-9" },
            phase3: { title: "Scale", tactics: ["Channel sales", "Enterprise outbound", "Community"], timeline: "Month 10-18" },
            estimatedCAC: "Not estimated",
            estimatedLTV: "Not estimated",
            keyMetrics: ["MRR", "CAC", "LTV", "Churn rate"],
          },
          developmentDirection: {
            shortTerm: ["Validate product-market fit", "Acquire first 10 customers", "Build core feature set"],
            mediumTerm: ["Reach $10k MRR", "Hire key roles", "Establish repeatable GTM"],
            longTerm: ["Raise Series A", "Expand market", "Build platform moat"],
            keyMilestones: ["First customer", "$1k MRR", "$10k MRR", "Series A ready"],
          },
          elevationPlan: {
            currentPosition: "Early-stage startup with live website",
            targetPosition: "Revenue-generating startup with defined GTM and traction",
            steps: [
              { title: "Define ICP", detail: "Narrow ideal customer profile to one segment", impact: "Faster sales cycles", timeframe: "Month 1" },
              { title: "Get 10 paying customers", detail: "Founder-led sales, direct outreach", impact: "Validate revenue model", timeframe: "Month 1-3" },
              { title: "Build evidence base", detail: "Document traction, connect analytics and Stripe", impact: "+15 SVI points", timeframe: "Month 2-4" },
            ],
            fundingNeeds: "Pre-seed $200k-$500k to reach product-market fit",
            keyHires: ["Head of Sales / BD", "CTO / Technical Lead", "Marketing Lead"],
          },
          swot: {
            strengths: ["Live product", "Technical foundation in place"],
            weaknesses: ["Limited traction data available", "Market positioning unclear"],
            opportunities: ["Growing digital adoption", "Underserved niche potential"],
            threats: ["Well-funded competitors", "Market commoditisation"],
          },
          ebitdaMetrics: getSectorEbitdaBenchmarks(detectedSector ?? "default"),
          analysisConfidence: 30,
          analysisNotes: "Heuristic analysis only — AI analysis unavailable. Provide more website content for deeper insights.",
        } as WebsiteCompetitiveIntelligence;
      }
    }

    // If authenticated, auto-create evidence entries
    const auth = await authenticateRequest();
    let evidenceCreated = 0;

    if (auth && isSupabaseConfigured()) {
      const accountId = await findAccountByEmail(auth.email);
      if (accountId) {
        const supabase = getSupabaseAdmin()!;
        const entries = buildEvidenceEntries(audit, accountId);

        if (entries.length > 0) {
          const { error } = await supabase
            .from("svi_evidence")
            .upsert(entries, { onConflict: "account_id,evidence_type,dimension" });
          if (!error) {
            evidenceCreated = entries.length;

            // Fire-and-forget rescore (single endpoint to avoid race condition)
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
            const cookieHeader = request.headers.get("cookie") ?? "";
            void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
              method: "POST",
              headers: { Cookie: cookieHeader },
            }).catch(() => {});
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      audit,
      detectedSector,
      competitiveIntelligence,
      evidenceCreated,
    });
  } catch (err) {
    console.error("[blockid:website-tech-audit] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
