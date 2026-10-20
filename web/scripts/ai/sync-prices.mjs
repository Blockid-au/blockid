#!/usr/bin/env node
// A1 (pricing v5 §7.4, G35) — nightly AI price-feed sync.
//
//   node scripts/ai/sync-prices.mjs            # fetch feeds, write files, alert ops (≤ 1/day)
//   node scripts/ai/sync-prices.mjs --dry-run  # fetch + compare, print JSON, write/alert nothing
//
// Cron (web/scripts/crontab.production): 02:13 UTC daily, plain node like the
// other file-based ops crons. Reads only PUBLIC feeds with GET (DeepInfra
// /v1/openai/models + /models/list, OpenRouter /api/v1/models); the DeepInfra
// key from web/.env is sent only if the anonymous GET is refused, and is never
// printed. Writes content/reports/ai-price-feed.json, ai-price-feed-history.jsonl
// and — inside the 7-day window of the founder-pinned report price policy —
// ai-price-policy-renewal.json (a proposal, never applied).
//
// The logic lives in src/lib/ai/price-feed.ts (vitest: price-feed.test.ts);
// this wrapper loads it, the catalogue and the pinned policy through tsx with
// scripts/lib/server-only-hook.mjs (report-attempt-budget.ts is server-only).

import { createRequire, registerHooks } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { WEB_DIR, envVal, sendTelegram, appendJsonl } from "../lib/ops-env.mjs";
import { hooks } from "../lib/server-only-hook.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const webDir = process.env.BLOCKID_WEB_DIR?.trim() || WEB_DIR;
const reports = path.join(webDir, "content", "reports");

async function loadLib() {
  registerHooks(hooks);
  const { register } = await import("tsx/cjs/api");
  process.env.TSX_TSCONFIG_PATH ??= path.join(WEB_DIR, "tsconfig.json");
  register();
  const require = createRequire(import.meta.url);
  const feed = require("../../src/lib/ai/price-feed.ts");
  const budget = require("../../src/lib/ai/report-attempt-budget.ts");
  return { feed, budget };
}

async function main() {
  const started = Date.now();
  const { feed, budget } = await loadLib();
  const policy = { id: budget.REPORT_PRICE_POLICY, expiresAt: budget.REPORT_PRICE_POLICY_EXPIRES_AT, pinned: budget.REPORT_POLICY_PINNED_PRICES };
  const tmp = path.join(homedir(), ".local/state/blockid-runtime");
  const paths = DRY_RUN
    ? { feed: path.join(tmp, "dry-run/ai-price-feed.json"), history: path.join(tmp, "dry-run/ai-price-feed-history.jsonl"), renewal: path.join(tmp, "dry-run/ai-price-policy-renewal.json"), alertState: path.join(tmp, "dry-run/ai-price-sync-alert.json") }
    : {
        feed: path.join(reports, "ai-price-feed.json"),
        history: path.join(reports, "ai-price-feed-history.jsonl"),
        renewal: path.join(reports, "ai-price-policy-renewal.json"),
        alertState: path.join(tmp, "ai-price-sync-alert.json"),
      };
  const result = await feed.runPriceSync({
    policy,
    paths,
    deepinfraApiKey: envVal("DEEPINFRA_API_KEY") || undefined,
    send: async (text) => {
      if (DRY_RUN) { console.log(`[dry-run] would alert:\n${text}`); return false; }
      const r = await sendTelegram(text);
      return Boolean(r.sent);
    },
  });
  const summary = {
    ts: result.generatedAt,
    dry_run: DRY_RUN,
    feeds: result.feeds,
    alertable: result.alertable.map((c) => ({ provider: c.provider, id: c.id, status: c.status, pct: c.changePct, admitted: c.admitted })),
    renewal: result.renewal?.status ?? null,
    alerted: result.alerted,
    alert_skipped: result.alertSkippedReason ?? null,
    duration_ms: Date.now() - started,
  };
  console.log(JSON.stringify(summary));
  if (!DRY_RUN) {
    const ok = result.feeds.deepinfra.ok && result.feeds.openrouter.ok;
    try {
      appendJsonl(path.join(reports, "cron-health.jsonl"), { ts: new Date().toISOString(), endpoint: "ai-price-sync", status: ok ? "ok" : "error", duration_ms: summary.duration_ms, detail: ok ? `${result.alertable.length} alertable` : "feed unavailable" });
    } catch { /* telemetry only */ }
  }
  return 0;
}

main().then((code) => process.exit(code), (err) => {
  console.error(`[sync-prices] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
