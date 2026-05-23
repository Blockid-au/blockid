/**
 * Budget tracking — $100/month cap.
 *
 * Tracks estimated cost per provider per month. Persisted to /tmp so it
 * survives container restarts within the same host. When budget is exceeded,
 * the generate route returns 429.
 */

import * as fs from "node:fs";

const MONTHLY_BUDGET_USD = 100;
const BUDGET_FILE = "/tmp/blockid-ai-budget.json";

/** Rough cost estimates per 1K tokens (input + output averaged). */
const COST_PER_1K: Record<string, number> = {
  "claude-haiku-4-5-20251001": 0.001,
  "claude-sonnet-4-6": 0.015,
  "gpt-4o-mini": 0.0003,
  "o3-mini": 0.0055,
  "gpt-4.1-mini": 0.002,
  "gemini-2.5-flash": 0.0001,
  "llama-3.3-70b-versatile": 0,
  "deepseek/deepseek-v4-flash:free": 0,
};

interface BudgetData {
  month: string; // "2026-05"
  totalUSD: number;
  calls: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function readBudget(): BudgetData {
  try {
    const raw = fs.readFileSync(BUDGET_FILE, "utf-8");
    const data: BudgetData = JSON.parse(raw);
    if (data.month !== currentMonth()) {
      return { month: currentMonth(), totalUSD: 0, calls: 0 };
    }
    return data;
  } catch {
    return { month: currentMonth(), totalUSD: 0, calls: 0 };
  }
}

function writeBudget(data: BudgetData): void {
  try {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(data));
  } catch {
    /* ignore write errors in read-only FS */
  }
}

/** Record estimated cost for a completed call. */
export function trackCost(model: string, estimatedTokens: number): void {
  const costPer1K = COST_PER_1K[model] ?? 0.001;
  const cost = (estimatedTokens / 1000) * costPer1K;
  const budget = readBudget();
  budget.totalUSD += cost;
  budget.calls += 1;
  writeBudget(budget);
}

/** Returns true when the monthly budget has been fully consumed. */
export function isBudgetExceeded(): boolean {
  return readBudget().totalUSD >= MONTHLY_BUDGET_USD;
}

/** Return current budget status for health / diagnostics. */
export function getBudgetStatus(): {
  month: string;
  spent: number;
  limit: number;
  percent: number;
  calls: number;
} {
  const b = readBudget();
  return {
    month: b.month,
    spent: Math.round(b.totalUSD * 100) / 100,
    limit: MONTHLY_BUDGET_USD,
    percent: Math.round((b.totalUSD / MONTHLY_BUDGET_USD) * 100),
    calls: b.calls,
  };
}
