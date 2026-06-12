import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CEO_GOAL_TREE, getAllAgentGoals, type AgentGoal } from "@/lib/agent-goals/goal-tree";

export const dynamic = "force-dynamic";

const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";

interface AgentStatus {
  agent: string;
  title: string;
  mission: string;
  kpis: AgentGoal["kpis"];
  criteriaOwned: string[];
  reportSections: string[];
  researchFrequency: string;
  researchTopics: string[];
  status: "GREEN" | "YELLOW" | "RED" | "NO_REPORT";
  lastReport: string | null;
  lastReportDate: string | null;
  researchCount: number;
  lastResearchDate: string | null;
}

function readTodayReport(agent: string, today: string): { status: string; content: string } | null {
  const dailyPath = path.join(REPORTS_DIR, `${agent}-daily-${today}.md`);
  const weeklyPath = path.join(REPORTS_DIR, `${agent}-weekly-${today}.md`);
  const filePath = fs.existsSync(dailyPath) ? dailyPath : fs.existsSync(weeklyPath) ? weeklyPath : null;
  if (!filePath) return null;

  const content = fs.readFileSync(filePath, "utf8");
  const statusMatch = content.match(/(GREEN|YELLOW|RED)/i);
  return {
    status: statusMatch ? statusMatch[1].toUpperCase() : "YELLOW",
    content,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // Platform KPIs for CEO
  let platformKPIs = { totalUsers: 0, totalAnalyses: 0, totalAccounts: 0 };
  if (supabase) {
    const [usersRes, analysesRes, accountsRes] = await Promise.all([
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("svi_analyses").select("id", { count: "exact", head: true }),
      supabase.from("svi_accounts").select("id", { count: "exact", head: true }),
    ]);
    platformKPIs = {
      totalUsers: usersRes.count ?? 0,
      totalAnalyses: analysesRes.count ?? 0,
      totalAccounts: accountsRes.count ?? 0,
    };
  }

  // Agent statuses
  const agentStatuses: AgentStatus[] = [];

  for (const goal of getAllAgentGoals()) {
    if (goal.agent === "ceo") continue;

    const agentKey = goal.agent.toLowerCase();
    const report = readTodayReport(agentKey, today);

    // Research count from agent_knowledge_base
    let researchCount = 0;
    let lastResearchDate: string | null = null;
    if (supabase) {
      const { count } = await supabase
        .from("agent_knowledge_base")
        .select("id", { count: "exact", head: true })
        .eq("agent", agentKey);
      researchCount = count ?? 0;

      const { data: lastResearch } = await supabase
        .from("agent_knowledge_base")
        .select("updated_at")
        .eq("agent", agentKey)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastResearchDate = lastResearch?.updated_at?.slice(0, 10) ?? null;
    }

    agentStatuses.push({
      agent: goal.agent,
      title: goal.title,
      mission: goal.mission,
      kpis: goal.kpis,
      criteriaOwned: goal.criteriaOwned,
      reportSections: goal.reportSections,
      researchFrequency: goal.researchFrequency,
      researchTopics: goal.researchTopics,
      status: report ? (report.status as "GREEN" | "YELLOW" | "RED") : "NO_REPORT",
      lastReport: report?.content ?? null,
      lastReportDate: report ? today : null,
      researchCount,
      lastResearchDate,
    });
  }

  // Recent cron health
  let recentCronRuns: Array<{ ts: string; endpoint: string; status: string; duration_ms: number }> = [];
  try {
    const healthPath = path.join(REPORTS_DIR, "cron-health.jsonl");
    if (fs.existsSync(healthPath)) {
      const lines = fs.readFileSync(healthPath, "utf8").split("\n").filter(Boolean);
      recentCronRuns = lines
        .slice(-50)
        .map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean)
        .reverse();
    }
  } catch { /* non-blocking */ }

  return NextResponse.json({
    ceo: {
      title: CEO_GOAL_TREE.title,
      mission: CEO_GOAL_TREE.mission,
      kpis: CEO_GOAL_TREE.kpis,
    },
    platformKPIs,
    agents: agentStatuses,
    recentCronRuns,
    today,
  });
}
