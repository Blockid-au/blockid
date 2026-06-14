import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ReadinessSection {
  id: string;
  name: string;
  weight: number;
  status: "complete" | "partial" | "missing";
  score: number;
  documents: string[];
  missingDocs: string[];
}

// 13-section data room framework (from DATA_ROOM_STRUCTURE.md)
const DATA_ROOM_SECTIONS = [
  { id: "company", name: "Company Formation", weight: 8, requiredDocs: ["Certificate of Incorporation", "ABN/ACN", "Constitution"] },
  { id: "team", name: "Founder & Team", weight: 10, requiredDocs: ["Founder CVs", "LinkedIn profiles", "Team bios"] },
  { id: "equity", name: "Equity & Cap Table", weight: 12, requiredDocs: ["Cap table", "ESOP pool", "Shareholders Agreement"] },
  { id: "financial", name: "Financial Statements", weight: 10, requiredDocs: ["P&L statement", "Cash flow", "Financial projections"] },
  { id: "product", name: "Product & Technology", weight: 8, requiredDocs: ["Product demo", "Technical architecture", "Roadmap"] },
  { id: "market", name: "Market & Competitive", weight: 8, requiredDocs: ["TAM/SAM analysis", "Competitive matrix", "Market research"] },
  { id: "traction", name: "Customer Traction", weight: 10, requiredDocs: ["User metrics", "Customer testimonials", "Case studies"] },
  { id: "legal", name: "Legal & Compliance", weight: 8, requiredDocs: ["IP assignment", "Privacy policy", "Terms of service"] },
  { id: "contracts", name: "Agreements & Contracts", weight: 6, requiredDocs: ["Customer contracts", "Vendor agreements"] },
  { id: "pitch", name: "Pitch Materials", weight: 8, requiredDocs: ["Pitch deck", "Executive summary", "One-pager"] },
  { id: "ip", name: "Intellectual Property", weight: 6, requiredDocs: ["Trademark registrations", "GitHub access", "Patent applications"] },
  { id: "operations", name: "Operations", weight: 4, requiredDocs: ["Org chart", "Hiring plan"] },
  { id: "stage", name: "Stage-Specific", weight: 2, requiredDocs: ["Accelerator docs", "Previous fundraise info"] },
];

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Fetch uploaded documents from data room
  const { data: docs } = await supabase
    .from("data_room_documents")
    .select("name, folder, status")
    .eq("account_id", user.id);

  const uploadedDocs = (docs ?? []).map((d: { name: string }) => d.name.toLowerCase());

  // Also check SVI analysis for signals
  const { data: sviAccount } = await supabase
    .from("svi_accounts")
    .select("analysis")
    .eq("account_id", user.id)
    .maybeSingle();

  const analysis = sviAccount?.analysis as Record<string, unknown> | null;
  const signals = analysis?.signals as Record<string, boolean> | null;

  // Score each section
  const sections: ReadinessSection[] = DATA_ROOM_SECTIONS.map(section => {
    const matched = section.requiredDocs.filter(doc =>
      uploadedDocs.some(u => u.includes(doc.toLowerCase().split(" ")[0]))
    );

    // Supplement with SVI signals for some sections
    let bonusDocs: string[] = [];
    if (section.id === "equity" && signals?.hasCapTable) bonusDocs.push("Cap table (SVI signal)");
    if (section.id === "equity" && signals?.hasVesting) bonusDocs.push("Vesting schedule (SVI signal)");
    if (section.id === "pitch" && signals?.hasPitchDeck) bonusDocs.push("Pitch deck (SVI signal)");
    if (section.id === "market" && signals?.hasMarketSize) bonusDocs.push("Market research (SVI signal)");
    if (section.id === "traction" && signals?.hasUsers) bonusDocs.push("User metrics (SVI signal)");

    const allMatched = [...matched, ...bonusDocs];
    const completedCount = allMatched.length;
    const totalRequired = section.requiredDocs.length;
    const score = Math.min(100, Math.round((completedCount / totalRequired) * 100));
    const status = score >= 80 ? "complete" : score >= 40 ? "partial" : "missing";

    return {
      id: section.id,
      name: section.name,
      weight: section.weight,
      status,
      score,
      documents: allMatched,
      missingDocs: section.requiredDocs.filter(doc =>
        !uploadedDocs.some(u => u.includes(doc.toLowerCase().split(" ")[0])) &&
        !bonusDocs.some(b => b.toLowerCase().includes(doc.toLowerCase().split(" ")[0]))
      ),
    };
  });

  // Overall completeness
  const totalWeight = sections.reduce((s, sec) => s + sec.weight, 0);
  const weightedScore = sections.reduce((s, sec) => s + (sec.score * sec.weight) / 100, 0);
  const completePct = Math.round((weightedScore / totalWeight) * 100);

  const completeSections = sections.filter(s => s.status === "complete").length;
  const partialSections = sections.filter(s => s.status === "partial").length;
  const missingSections = sections.filter(s => s.status === "missing").length;

  // Tier classification
  let tier: "not-started" | "early" | "investor-ready" | "due-diligence-ready";
  let badge: string;
  if (completePct < 20) { tier = "not-started"; badge = "🔴 Not Started"; }
  else if (completePct < 50) { tier = "early"; badge = "🟡 In Progress"; }
  else if (completePct < 75) { tier = "investor-ready"; badge = "🔵 Investor Ready"; }
  else { tier = "due-diligence-ready"; badge = "🟢 Due Diligence Ready"; }

  // Top priority actions
  const priorityActions = sections
    .filter(s => s.status !== "complete")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map(s => ({
      section: s.name,
      missingDocs: s.missingDocs.slice(0, 2),
      sviImpact: `+${Math.round(s.weight * 0.3)} SVI`,
    }));

  return NextResponse.json({
    ok: true,
    completePct,
    tier,
    badge,
    sections: {
      complete: completeSections,
      partial: partialSections,
      missing: missingSections,
    },
    sectionDetails: sections,
    priorityActions,
    targets: {
      antlerPitch: 70,
      seedReady: 80,
      seriesA: 95,
    },
  });
}
