// G33-T16h — the DeepInfra models the US$0.50 report budget admits (priced in
// lib/ai/report-attempt-budget.ts). A scoped report ladder may only contain
// these: 24/09 canary on 91a1f88b2 — the synthesis ladder fell through to
// moonshotai/Kimi-K2.6, the budget refused it ("report price or request not
// admitted") and both CEO summaries failed. report-attempt-budget.test.ts pins
// this list to the price table so the two cannot drift.
export const REPORT_ADMITTED_MODELS: ReadonlySet<string> = new Set([
  "deepseek-ai/DeepSeek-V3.2",
  "Qwen/Qwen3-235B-A22B-Instruct-2507",
  "deepseek-ai/DeepSeek-V4-Flash",
  "Qwen/Qwen3-VL-235B-A22B-Instruct",
]);
