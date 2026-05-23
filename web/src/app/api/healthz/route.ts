// GET /api/healthz — Kubernetes-style health check endpoint
//
// Returns service health status for:
// - Liveness probe (is the process alive?)
// - Readiness probe (can it serve traffic?)
// - Startup probe (has it finished initializing?)
//
// Usage in K8s:
//   livenessProbe:  GET /api/healthz
//   readinessProbe: GET /api/healthz?ready=true
//   startupProbe:   GET /api/healthz?startup=true

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAIConfigured, getAIBudgetStatus } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const checkReady = searchParams.get("ready") === "true";
  const checkStartup = searchParams.get("startup") === "true";
  const verbose = searchParams.get("verbose") === "true";

  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Basic liveness — always check
  checks.process = { ok: true, detail: `uptime: ${Math.round(process.uptime())}s` };

  // Database connectivity
  if (checkReady || checkStartup || verbose) {
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseAdmin()!;
        const { count } = await supabase.from("app_users").select("*", { count: "exact", head: true });
        checks.database = { ok: true, detail: `${count ?? 0} users` };
      } catch (err) {
        checks.database = { ok: false, detail: err instanceof Error ? err.message : "DB error" };
      }
    } else {
      checks.database = { ok: false, detail: "Supabase not configured" };
    }
  }

  // AI provider availability
  if (verbose) {
    checks.ai = { ok: isAIConfigured(), detail: isAIConfigured() ? "providers available" : "no AI providers" };
    const budget = getAIBudgetStatus();
    checks.ai_budget = { ok: budget.percent < 90, detail: `${budget.percent}% used ($${budget.spent}/$${budget.limit})` };
  }

  // Overall status
  const allOk = Object.values(checks).every((c) => c.ok);
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "unhealthy",
      service: "blockid-web",
      version: process.env.npm_package_version ?? "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      checks: verbose ? checks : undefined,
    },
    { status },
  );
}
