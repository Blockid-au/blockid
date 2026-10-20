// POST /api/cron/ai-balance — hourly (G35 A3, pricing v5 §7.4).
//
// Reads the AI provider balances (DeepInfra /v1/me?checklist=true, OpenRouter
// /credits + /key — GET only), the free-tier probe + health data and the
// Gemini month-to-date ledger, computes burn / runway / level per provider
// (lib/ai/balances.ts) and writes
//   content/reports/ai-balances.json       what /admin/ai-health renders
//   content/reports/ai-balance-flags.json  read by the dispatcher (balance-flags.ts):
//       DeepInfra critical  → report jobs queued, other classes free-tier only
//       OpenRouter critical → paid OpenRouter ids off
// Alerts ops (Telegram → ops-alert e-mail fallback) + founder_notifications,
// once per (provider, level, UTC day). Keys are never logged or returned.
//
// Auth: Bearer CRON_SECRET (lib/security/cron-auth).

import { NextResponse } from "next/server";
import * as fs from "fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { runBalanceCheck, DEFAULT_GEMINI_MONTHLY_BUDGET_USD, type HealthRow, type SpendDay } from "@/lib/ai/balances";
import { balanceFlagsFile, _resetBalanceFlagsCache } from "@/lib/ai/balance-flags";
import { readProviderStatusFile } from "@/lib/ai/provider-status";
import { HEALTH_SNAPSHOT_FILE } from "@/lib/ai/registry";
import { SPEND_HISTORY_FILE, SPEND_LEDGER_FILE, founderUserId } from "@/lib/ai/spend-guard";
import { runtimeReportsPath } from "@/lib/runtime-paths";
import { sendTelegram, mdEscape } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Spend history (closed days) + today's ledger. Bounded read: the history is one line per day. */
function readSpendLedgers(historyFile = SPEND_HISTORY_FILE, ledgerFile = SPEND_LEDGER_FILE): { history: SpendDay[]; today: SpendDay | null } {
  const history: SpendDay[] = [];
  try {
    const lines = fs.readFileSync(historyFile, "utf-8").trim().split("\n").slice(-62);
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as SpendDay;
        if (row && typeof row.day === "string" && typeof row.spent_usd === "number") history.push(row);
      } catch { /* skip a torn line */ }
    }
  } catch { /* no history yet */ }
  let today: SpendDay | null = null;
  try {
    const row = JSON.parse(fs.readFileSync(ledgerFile, "utf-8")) as SpendDay;
    if (row && typeof row.day === "string" && typeof row.spent_usd === "number") today = row;
  } catch { /* none */ }
  return { history, today };
}

function readHealthRows(): HealthRow[] {
  try {
    const snap = JSON.parse(fs.readFileSync(HEALTH_SNAPSHOT_FILE, "utf-8")) as { results?: HealthRow[] };
    return Array.isArray(snap.results) ? snap.results : [];
  } catch {
    return [];
  }
}

function geminiBudget(): number {
  const raw = Number(process.env.GEMINI_MONTHLY_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GEMINI_MONTHLY_BUDGET_USD;
}

async function handle(request: Request): Promise<NextResponse> {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runBalanceCheck({
    paths: {
      balances: runtimeReportsPath("ai-balances.json"),
      flags: balanceFlagsFile(),
      alertState: join(homedir(), ".local/state/blockid-runtime/ai-balance-alerts.json"),
    },
    keys: { deepinfra: process.env.DEEPINFRA_API_KEY || undefined, openrouter: process.env.OPENROUTER_API_KEY || undefined },
    configured: {
      gemini: Boolean(process.env.GOOGLE_GEMINI_API_KEY),
      groq: Boolean(process.env.GROQ_API_KEY),
      cerebras: Boolean(process.env.CEREBRAS_API_KEY),
      sambanova: Boolean(process.env.SAMBANOVA_API_KEY),
    },
    geminiMonthlyBudgetUsd: geminiBudget(),
    readSpend: () => readSpendLedgers(),
    readProbes: () => readProviderStatusFile().providers as Record<string, { status?: string; http_status?: number; checked_at?: string }>,
    readHealth: readHealthRows,
    send: (text) => sendTelegram(mdEscape(text)),
    notifyFounder: async (notice) => {
      const uid = await founderUserId();
      if (!uid) return false;
      const { insertNotification } = await import("@/lib/notifications");
      return insertNotification({ userId: uid, kind: "ai_capacity", payload: notice.payload, dedupeKey: notice.dedupeKey, throttleMs: 24 * 60 * 60_000 });
    },
  });
  _resetBalanceFlagsCache();
  return NextResponse.json({
    ok: true,
    updated_at: result.updated_at,
    flags: { deepinfra_critical: result.flags.deepinfra_critical, openrouter_paid_disabled: result.flags.openrouter_paid_disabled },
    providers: Object.fromEntries(Object.values(result.providers).map((p) => [p.provider, { level: p.level, balance_usd: p.balance_usd, burn_usd_per_day: p.burn_usd_per_day, runway_days: p.runway_days }])),
    alerts: result.alerts,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
