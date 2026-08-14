// POST /api/founder/team/ai-fill
//
// Returns AI-suggested team roles based on the startup's stage.
// Does NOT save — caller pre-fills the form and the user decides to accept.
//
// Agent: chro-team.ts
// Uses TEAM_BENCHMARKS and AU_SALARY_BENCHMARKS from chro-team.ts to
// recommend role titles, categories, salary ranges and equity percentages
// appropriate for the startup's current stage.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
import {
  TEAM_BENCHMARKS,
  AU_SALARY_BENCHMARKS,
  assessTeam,
  type TeamMemberProfile,
} from "@/lib/agents/chro-team";

export const dynamic = "force-dynamic";

interface TeamSuggestion {
  role_title: string;
  role_category: string;
  full_name: string;
  equity_pct: number | null;
  salary_aud: number | null;
  start_date: string;
  status: "open" | "planned";
  notes: string;
}

// Equity allocation guide by role category and stage
const EQUITY_GUIDE: Record<string, Record<number, number>> = {
  founder: { 0: 50, 1: 40, 2: 30, 3: 25, 4: 20, 5: 15 },
  "cto": { 0: 10, 1: 8, 2: 6, 3: 5, 4: 3, 5: 2 },
  "vp-product": { 0: 5, 1: 4, 2: 3, 3: 2, 4: 1.5, 5: 1 },
  "vp-sales": { 0: 4, 1: 3, 2: 2, 3: 1.5, 4: 1, 5: 0.75 },
  hire: { 0: 0.5, 1: 0.5, 2: 0.25, 3: 0.25, 4: 0.1, 5: 0.1 },
  advisor: { 0: 1, 1: 0.5, 2: 0.25, 3: 0.1, 4: 0.1, 5: 0.05 },
};

function equityForRole(roleTitle: string, stage: number): number | null {
  const lower = roleTitle.toLowerCase();
  if (lower.includes("founder") || lower.includes("ceo")) {
    return EQUITY_GUIDE.founder[Math.min(stage, 5)] ?? 15;
  }
  if (lower.includes("cto") || lower.includes("technical co")) {
    return EQUITY_GUIDE.cto[Math.min(stage, 5)] ?? 3;
  }
  if (lower.includes("vp product") || lower.includes("product manager")) {
    return EQUITY_GUIDE["vp-product"][Math.min(stage, 5)] ?? 1.5;
  }
  if (lower.includes("vp sales") || lower.includes("sales")) {
    return EQUITY_GUIDE["vp-sales"][Math.min(stage, 5)] ?? 1;
  }
  if (lower.includes("advisor")) {
    return EQUITY_GUIDE.advisor[Math.min(stage, 5)] ?? 0.25;
  }
  return EQUITY_GUIDE.hire[Math.min(stage, 5)] ?? 0.1;
}

function salaryForRole(roleTitle: string): number | null {
  const lower = roleTitle.toLowerCase();
  if (lower.includes("engineer") || lower.includes("developer") || lower.includes("cto")) {
    return AU_SALARY_BENCHMARKS["Software Engineer"]?.senior?.p50 ?? 155000;
  }
  if (lower.includes("product")) {
    return AU_SALARY_BENCHMARKS["Product Manager"]?.senior?.p50 ?? 165000;
  }
  if (lower.includes("design")) {
    return AU_SALARY_BENCHMARKS["Designer"]?.senior?.p50 ?? 135000;
  }
  if (lower.includes("market")) {
    return AU_SALARY_BENCHMARKS["Marketing"]?.senior?.p50 ?? 135000;
  }
  if (lower.includes("data")) {
    return AU_SALARY_BENCHMARKS["Data Scientist"]?.senior?.p50 ?? 170000;
  }
  if (lower.includes("ceo") || lower.includes("founder")) return null; // equity-only pre-seed
  if (lower.includes("advisor")) return null; // equity-only typically
  return 100000; // sensible default
}

function categoryForRole(roleTitle: string): string {
  const lower = roleTitle.toLowerCase();
  if (lower.includes("founder") || lower.includes("ceo") || lower.includes("co-founder")) return "founder";
  if (lower.includes("advisor")) return "advisor";
  return "hire";
}

// Target start date = 1 month from today per role index
function startDate(offsetMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toISOString().split("T")[0];
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "db" }, { status: 503 });

  const projectId = await getProjectIdFromRequest();
  if (!projectId) return NextResponse.json({ ok: false, error: "no project" }, { status: 400 });

  const { data: project } = await sb
    .from("projects")
    .select("name, industry, stage")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  const stage = Number(project?.stage ?? 0);
  const name = project?.name ?? "Your startup";

  // Get existing team members to run assessTeam() for gap analysis
  const { data: existingMembers } = await sb
    .from("team_members")
    .select("role_title, role_category, equity_pct, salary_aud, status")
    .eq("project_id", projectId)
    .eq("user_id", user.id);

  const existingProfiles: TeamMemberProfile[] = (existingMembers ?? []).map((m) => ({
    role: m.role_title,
    seniority: "senior",
    isFounder: m.role_category === "founder",
    equity: Number(m.equity_pct ?? 0),
    salary: Number(m.salary_aud ?? 0),
    location: "au",
  }));

  const assessment = assessTeam({ members: existingProfiles, stage });

  const benchmark = TEAM_BENCHMARKS[stage] ?? TEAM_BENCHMARKS[0];
  const keyRoles = benchmark?.keyRoles ?? ["CEO/Founder"];
  const optionalRoles = benchmark?.optionalRoles ?? [];

  // Build suggestions: missing key roles first, then optional
  const suggestions: TeamSuggestion[] = [];
  let offset = 1;

  const existingRoleLower = existingProfiles.map((p) => p.role.toLowerCase());

  for (const role of [...keyRoles, ...optionalRoles]) {
    const alreadyFilled = existingRoleLower.some((r) =>
      r.includes(role.toLowerCase().split("/")[0].split(" ")[0])
    );
    if (alreadyFilled) continue;

    const isKey = keyRoles.includes(role);
    suggestions.push({
      role_title: role,
      role_category: categoryForRole(role),
      full_name: "",
      equity_pct: equityForRole(role, stage),
      salary_aud: salaryForRole(role),
      start_date: startDate(isKey ? offset : offset + 2),
      status: isKey ? "open" : "planned",
      notes: isKey
        ? `Key role for stage ${stage}. ${assessment.gaps.find((g) => g.includes(role)) ?? "Prioritise hiring."}`
        : `Optional at stage ${stage}. ${assessment.recommendations[0] ?? "Hire when revenue permits."}`,
    });
    offset++;
    if (suggestions.length >= 5) break;
  }

  // If no gaps found, suggest 2 advisor roles
  if (suggestions.length === 0) {
    suggestions.push({
      role_title: "Industry Advisor",
      role_category: "advisor",
      full_name: "",
      equity_pct: equityForRole("advisor", stage),
      salary_aud: null,
      start_date: startDate(1),
      status: "planned",
      notes: "Named sector advisors add credibility (+8 SVI FTV pts). Target: LinkedIn-verifiable background.",
    });
    suggestions.push({
      role_title: "Technical Advisor",
      role_category: "advisor",
      full_name: "",
      equity_pct: equityForRole("advisor", stage),
      salary_aud: null,
      start_date: startDate(2),
      status: "planned",
      notes: "Technical advisor validates your architecture and product roadmap to investors.",
    });
  }

  return NextResponse.json({
    ok: true,
    suggestions,
    assessment,
    meta: {
      startup: name,
      stage,
      benchmarkMinTeam: benchmark?.minTeam ?? 1,
      benchmarkKeyRoles: keyRoles,
    },
  });
}
