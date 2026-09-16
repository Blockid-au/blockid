// SCN DIRECTION — the 3-step "Google-Maps-style" route the ScnDirectionNavigator
// renders on /workspace/plan (moved off the founder landing in G13-W3-IA3;
// the landing's block 2 now shows ONE recommendation from
// `lib/nav/next-step-recommender.ts`). Pure: analysis actions take precedence
// (they reflect real gaps in the founder's data) and routes are inferred
// from action titles; the stage-driven fallback tops the list up to three.
// Colocated test: direction-steps.test.ts.

import type { DirectionStep } from "@/components/dashboard/scn-direction-navigator";
import type { SVIAnalysis, SVISubScore } from "@/lib/svi-analysis";

/**
 * Map an analysis-generated next-action title to the best workspace route.
 * Keyword-based — keeps the dashboard a self-contained surface.
 */
export function actionToUrl(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("cap table")) return "/workspace/equity/cap-table";
  if (t.includes("vesting")) return "/workspace/esop/vesting";
  if (t.includes("esop")) return "/workspace/esop";
  if (t.includes("pitch deck") || t.includes("data room")) return "/workspace/documents/data-room";
  if (t.includes("financial model") || t.includes("projection")) return "/workspace/evidence/metrics";
  if (t.includes("revenue") || t.includes("paying customer") || t.includes("first customer")) return "/workspace/finance/revenue";
  if (t.includes("analytics")) return "/workspace/evidence/metrics";
  if (t.includes("demo") || t.includes("prototype") || t.includes("product")) return "/workspace/projects";
  if (t.includes("asic") || t.includes("abn") || t.includes("register")) return "/workspace/settings/profile";
  if (t.includes("ip") || t.includes("patent") || t.includes("trademark") || t.includes("legal")) return "/workspace/documents";
  if (t.includes("advisor") || t.includes("team") || t.includes("co-founder")) return "/workspace/equity/shareholders";
  if (t.includes("market") || t.includes("tam") || t.includes("sam")) return "/workspace/score/criteria";
  if (t.includes("moat") || t.includes("evidence")) return "/workspace/evidence";
  if (t.includes("fundraise") || t.includes("raise")) return "/workspace/raise/round";
  return "/workspace/evidence";
}

/** Stage-driven fallback route used when no analysis is available yet. */
export function fallbackDirectionSteps(stage: number): DirectionStep[] {
  if (stage <= 0) {
    return [
      { label: "Describe your idea in detail", detail: "Add target customer, problem, and market — the SVI engine needs this to score Validation.", impact: "+12 SVI", url: "/analyze", priority: "P0" },
      { label: "Capture validation evidence", detail: "Upload customer interviews, waitlist signups, or survey results to the Evidence Vault.", impact: "+10 SVI", url: "/workspace/evidence", priority: "P1" },
      { label: "Map your market (TAM / SAM / SOM)", detail: "Quantify the opportunity so investors can size the prize.", impact: "+8 SVI", url: "/workspace/score/criteria", priority: "P2" },
    ];
  }
  if (stage <= 1) {
    return [
      { label: "Lock in problem validation", detail: "Add interviews, surveys, or waitlist data to the Evidence Vault — move from self-declared to verified.", impact: "+12 SVI", url: "/workspace/evidence", priority: "P0" },
      { label: "Set up your cap table", detail: "Define founder splits, share classes, and vesting before bringing on capital.", impact: "+10 SVI", url: "/workspace/equity/cap-table", priority: "P1" },
      { label: "Ship a working demo", detail: "A live prototype is the highest-signal evidence you can show investors.", impact: "+8 SVI", url: "/workspace/projects", priority: "P2" },
    ];
  }
  if (stage <= 3) {
    return [
      { label: "Acquire 20 paying customers", detail: "Revenue is the strongest validation signal — even small ARR unlocks the Traction layer.", impact: "+18 SVI", url: "/workspace/finance/revenue", priority: "P0" },
      { label: "Finalise your cap table", detail: "Confirm founder/ESOP split, vesting schedules, and shareholders before raise conversations.", impact: "+10 SVI", url: "/workspace/equity/cap-table", priority: "P1" },
      { label: "Draft your pitch deck", detail: "Structure the narrative — problem, solution, traction, team, ask — and store it in your data room.", impact: "+8 SVI", url: "/workspace/documents/data-room", priority: "P2" },
    ];
  }
  if (stage <= 5) {
    return [
      { label: "Build your data room", detail: "Pitch deck, financial model, cap table, contracts — everything investors expect.", impact: "+12 SVI", url: "/workspace/documents/data-room", priority: "P0" },
      { label: "Lock in financial model", detail: "Three-year P&L forecast with unit economics — investors will model your business themselves.", impact: "+10 SVI", url: "/workspace/evidence/metrics", priority: "P1" },
      { label: "Open fundraise pipeline", detail: "Shortlist target investors, plan intros, and start tracking conversations.", impact: "+8 SVI", url: "/workspace/raise/round", priority: "P2" },
    ];
  }
  return [
    { label: "Run your raise process", detail: "Open conversations, share the data room, and track investor signals.", impact: "+10 SVI", url: "/workspace/raise/round", priority: "P0" },
    { label: "Tighten unit economics", detail: "Confirm LTV / CAC, churn, and gross margin — Series-A grade investors will probe these.", impact: "+8 SVI", url: "/workspace/evidence/metrics", priority: "P1" },
    { label: "Plan exit scenarios", detail: "Model acquisition, IPO, or secondary paths so the cap table is exit-ready.", impact: "+6 SVI", url: "/workspace/exit", priority: "P2" },
  ];
}

/** Identify the weakest SVI sub-layer so the navigator can name it as "you are here". */
export function weakestLayerLabel(subs: SVISubScore[] | undefined): string | null {
  if (!subs || subs.length === 0) return null;
  const sorted = [...subs].sort((a, b) => a.value - b.value);
  return sorted[0]?.label ?? null;
}

/**
 * Combine analysis-generated next actions with the stage-driven fallback so we
 * always present 3 steps. Analysis actions take precedence (they reflect real
 * gaps in the founder's data) and routes are inferred from action titles.
 */
export function computeDirectionSteps(analysis: SVIAnalysis | null, stage: number): DirectionStep[] {
  const fromAnalysis: DirectionStep[] = (analysis?.nextActions ?? []).map((a) => ({
    label: a.title,
    detail: a.detail,
    impact: a.impact,
    priority: a.priority,
    url: actionToUrl(a.title),
  }));
  if (fromAnalysis.length >= 3) return fromAnalysis.slice(0, 3);
  const fallback = fallbackDirectionSteps(stage);
  const seen = new Set(fromAnalysis.map((s) => s.label.toLowerCase()));
  const merged = [...fromAnalysis];
  for (const step of fallback) {
    if (merged.length >= 3) break;
    if (seen.has(step.label.toLowerCase())) continue;
    merged.push(step);
  }
  return merged.slice(0, 3);
}
