// Client-safe credit types and constants.
//
// Mirrors the section-pricing types from credits.ts (which has "server-only").
// Import this file from client components ("use client") instead of credits.ts.

export type SectionDepth = "scan" | "summary" | "standard" | "deep" | "expert" | "maximum";

export const SECTION_DEPTH_CONFIG: Record<SectionDepth, {
  label: string;
  words: number;
  credits: number;
  description: string;
}> = {
  scan:     { label: "Scan",     words: 100,   credits: 0.10, description: "Quick signal check" },
  summary:  { label: "Summary",  words: 300,   credits: 0.25, description: "Key findings, top 3 takeaways" },
  standard: { label: "Standard", words: 500,   credits: 0.50, description: "Detailed analysis with gaps + recommendations" },
  deep:     { label: "Deep",     words: 1000,  credits: 1.00, description: "Benchmarks, competitor context, action plan" },
  expert:   { label: "Expert",   words: 2000,  credits: 2.00, description: "Consultant-grade with financials and strategy" },
  maximum:  { label: "Maximum",  words: 3000,  credits: 3.00, description: "Exhaustive analysis, no word limit" },
};

export const REPORT_BUNDLES: Record<string, {
  label: string;
  depth: SectionDepth;
  credits: number;
  estWords: number;
  savingsPercent: number;
}> = {
  quick_report:    { label: "Quick Report",    depth: "scan",     credits: 0.50,  estWords: 1000,   savingsPercent: 50 },
  standard_report: { label: "Standard Report", depth: "standard", credits: 1.00,  estWords: 5000,   savingsPercent: 80 },
  deep_report:     { label: "Deep Dive",       depth: "deep",     credits: 1.50,  estWords: 10000,  savingsPercent: 85 },
  expert_report:   { label: "Expert Report",   depth: "expert",   credits: 3.00,  estWords: 20000,  savingsPercent: 85 },
  premium_report:  { label: "Full Premium",    depth: "maximum",  credits: 5.00,  estWords: 30000,  savingsPercent: 83 },
};

/**
 * Calculate total cost for selected sections at chosen depths (client-safe).
 */
export function calculateSectionCost(
  sections: Array<{ sectionId: string; depth: SectionDepth }>,
): {
  items: Array<{ sectionId: string; depth: SectionDepth; credits: number; words: number }>;
  totalCredits: number;
  totalWords: number;
  bestBundle: { key: string; label: string; credits: number; savingsPercent: number } | null;
} {
  const items = sections.map(s => ({
    sectionId: s.sectionId,
    depth: s.depth,
    credits: SECTION_DEPTH_CONFIG[s.depth].credits,
    words: SECTION_DEPTH_CONFIG[s.depth].words,
  }));

  const totalCredits = items.reduce((sum, i) => sum + i.credits, 0);
  const totalWords = items.reduce((sum, i) => sum + i.words, 0);

  // Find best bundle if all 10 sections selected
  let bestBundle: { key: string; label: string; credits: number; savingsPercent: number } | null = null;
  if (sections.length >= 10) {
    for (const [key, bundle] of Object.entries(REPORT_BUNDLES)) {
      if (bundle.credits < totalCredits) {
        if (!bestBundle || bundle.credits < bestBundle.credits) {
          bestBundle = { key, label: bundle.label, credits: bundle.credits, savingsPercent: bundle.savingsPercent };
        }
      }
    }
  }

  return { items, totalCredits, totalWords, bestBundle };
}
