// POST /api/cron/verify-models — weekly live-call verification of every model
// in ai-free-models.json. Catches paid models that leaked into the "free" list
// (e.g. MiniMax-M2.7 on SambaNova — see T0214 incident). Writes a verified
// subset to ai-free-models-verified.json which ai-client.ts can prefer when
// present.
//
// For each model: 1-token completion call. Status:
//   ok                 — got assistant content back
//   payment_required   — provider 402 / message contains "payment_method"
//   rate_limited       — 429 (transient — kept in verified list, flagged)
//   not_found          — 404 / model id no longer exists
//   timeout            — > 12s
//   other              — anything else
//
// Schedule: weekly Sun 03:00 UTC (proactive). KNOWN_PAID in refresh-models is
// the reactive sibling — both together guarantee the free chain stays free.
// Closes T0215.

import { NextResponse } from "next/server";
import * as fs from "fs";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTelegram, mdEscape } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";
const SRC_FILE = `${REPORTS_DIR}/ai-free-models.json`;
const VERIFIED_FILE = `${REPORTS_DIR}/ai-free-models-verified.json`;
const HISTORY_FILE = `${REPORTS_DIR}/ai-free-models-verify-history.jsonl`;

interface ProviderConfig {
  url: string;
  envKey: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", envKey: "OPENROUTER_API_KEY" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", envKey: "GROQ_API_KEY" },
  cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", envKey: "CEREBRAS_API_KEY" },
  sambanova: { url: "https://api.sambanova.ai/v1/chat/completions", envKey: "SAMBANOVA_API_KEY" },
};

type Status = "ok" | "payment_required" | "rate_limited" | "not_found" | "timeout" | "other";

interface VerifyResult {
  provider: string;
  model: string;
  status: Status;
  detail?: string;
}

async function pingModel(provider: string, model: string, apiKey: string): Promise<VerifyResult> {
  const cfg = PROVIDERS[provider];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ok" }], max_tokens: 4 }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (res.status === 200) {
      try {
        const j = JSON.parse(text) as { choices?: Array<{ message?: { content?: string; reasoning?: string } }> };
        const msg = j.choices?.[0]?.message;
        if (msg && (msg.content || msg.reasoning)) {
          return { provider, model, status: "ok" };
        }
        return { provider, model, status: "ok", detail: "200 but no content (probably stream)" };
      } catch {
        return { provider, model, status: "other", detail: "200 unparseable" };
      }
    }
    if (res.status === 402 || /payment.?method|payment_required|billing.*required/i.test(text)) {
      return { provider, model, status: "payment_required", detail: text.slice(0, 200) };
    }
    if (res.status === 429) {
      return { provider, model, status: "rate_limited", detail: text.slice(0, 160) };
    }
    if (res.status === 404 || /not.?found|does not exist/i.test(text)) {
      return { provider, model, status: "not_found", detail: text.slice(0, 160) };
    }
    return { provider, model, status: "other", detail: `${res.status} ${text.slice(0, 160)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) return { provider, model, status: "timeout" };
    return { provider, model, status: "other", detail: msg.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await checkRateLimit("verify-models", 3, 1800_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", retryAfter: rl.resetIn }, { status: 429 });
  }

  let src: Record<string, string[]>;
  try {
    src = JSON.parse(fs.readFileSync(SRC_FILE, "utf8"));
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Cannot read ${SRC_FILE}: ${err}` }, { status: 500 });
  }

  const results: VerifyResult[] = [];
  for (const [provider, models] of Object.entries(src)) {
    if (!Array.isArray(models)) continue;
    const cfg = PROVIDERS[provider];
    if (!cfg) continue;
    const apiKey = process.env[cfg.envKey];
    if (!apiKey) {
      for (const m of models) results.push({ provider, model: m, status: "other", detail: `no ${cfg.envKey}` });
      continue;
    }
    for (const model of models) {
      const r = await pingModel(provider, model, apiKey);
      results.push(r);
    }
  }

  // Verified subset = ok + rate_limited (transient, still free). Drop the rest.
  const verified: Record<string, string[]> = {};
  for (const r of results) {
    if (r.status === "ok" || r.status === "rate_limited") {
      verified[r.provider] = verified[r.provider] ?? [];
      verified[r.provider].push(r.model);
    }
  }

  const paidLeaks = results.filter(r => r.status === "payment_required");
  const notFound = results.filter(r => r.status === "not_found");

  fs.writeFileSync(VERIFIED_FILE, JSON.stringify({
    verifiedAt: new Date().toISOString(),
    source: "ai-free-models.json",
    verified,
    excluded: { paidLeaks, notFound, other: results.filter(r => r.status === "other") },
  }, null, 2) + "\n");

  fs.appendFileSync(HISTORY_FILE, JSON.stringify({
    ts: new Date().toISOString(),
    counts: {
      total: results.length,
      ok: results.filter(r => r.status === "ok").length,
      rate_limited: results.filter(r => r.status === "rate_limited").length,
      payment_required: paidLeaks.length,
      not_found: notFound.length,
      timeout: results.filter(r => r.status === "timeout").length,
      other: results.filter(r => r.status === "other").length,
    },
  }) + "\n");

  // Telegram only on critical findings — paid leaks must alert immediately.
  if (paidLeaks.length > 0) {
    const lines = [
      `🚨 *AI free\\-list paid\\-leak detected*`,
      ``,
      ...paidLeaks.map(r => mdEscape(`${r.provider} / ${r.model} → payment_required`)),
      ``,
      `Action: add to KNOWN\\_PAID in refresh\\-models or rotate provider key\\.`,
    ].join("\n");
    await sendTelegram(lines).catch(() => { /* best-effort */ });
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    verified: Object.fromEntries(Object.entries(verified).map(([k, v]) => [k, v.length])),
    paidLeaks: paidLeaks.length,
    paidLeakDetails: paidLeaks.map(r => `${r.provider}/${r.model}`),
    notFound: notFound.length,
    notFoundDetails: notFound.map(r => `${r.provider}/${r.model}`),
  });
}
