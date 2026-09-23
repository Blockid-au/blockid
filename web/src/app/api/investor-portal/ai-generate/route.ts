import { prepareVisualImage } from "@/lib/intake/visual-image";
import { VISUAL_SYSTEM, VISUAL_MODEL, readVisualInterpretation } from "@/lib/intake/visual-interpretation";
import { createReportAttemptBudget } from "@/lib/ai/report-attempt-budget";
// Internal AI proxy for startupvalueindex.com — lets the sibling standalone
// app reuse BlockID's scoped DeepInfra report dispatcher. Free fallback
// qualification remains pending; local SVI fallback is separate. Server calls from
// 127.0.0.1 to keep it off the public surface.

import "server-only";
import { NextResponse } from "next/server";
import { callAI, type AICallOptions } from "@/lib/ai-client";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SYSTEM = 24_000;
const MAX_USER = 80_000;
const ALLOWED_ORIGINS = new Set(["127.0.0.1", "::1", "localhost"]);

function isLocal(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const remote = req.headers.get("x-real-ip") ?? "";
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("127.0.0.1") || host.startsWith("localhost")) return true;
  const chain = [forwarded, remote].join(",").split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length === 0) return true;
  return chain.every((ip) => ALLOWED_ORIGINS.has(ip));
}

interface Body {
  reportBudgetScope?: string;
  imageBase64?: string;
  system?: string;
  user?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  purpose?: string;
  /**
   * When "json", the proxy prepends a strict JSON-only instruction to the
   * system prompt, strips markdown fences from the response, and retries
   * once with a stronger hint if the body doesn't parse. Returned `text`
   * is guaranteed to start with `{` or `[` when the call succeeds.
   *
   * SVI's structured pipelines (per-field analyse, sixteen-answers,
   * market drill-in) should ALWAYS pass "json" — otherwise a chatty
   * model reply breaks the downstream schema parse and the caller
   * silently falls back to a 503.
   */
  responseFormat?: "text" | "json";
}

const JSON_PRIMER =
  "\n\nOUTPUT CONTRACT: Return ONE valid JSON object or array only. " +
  "No markdown code fences. No prose before or after. No comments. " +
  "Every string must be properly escaped. If unsure of a field, use null.";

// Strip <think>...</think> reasoning blocks that Groq/DeepSeek gpt-oss and
// reasoning-tuned models emit before the actual answer. SVI's extractJson
// would otherwise land on the "<" of the think tag and fail. Removing them
// here fixes it for every downstream consumer of this proxy in one place.
function stripThinkTags(raw: string): string {
  // <think>…</think> — greedy across newlines, one or more blocks.
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function stripFences(raw: string): string {
  const noThink = stripThinkTags(raw);
  const fenced = noThink.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : noThink;
  return body.trim();
}

function looksLikeJson(raw: string): boolean {
  const t = stripFences(raw);
  if (!t) return false;
  const head = t[0];
  if (head !== "{" && head !== "[") return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

async function POST_handler(req: Request) {
  if (!isLocal(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sharedSecret = process.env.INVESTOR_PORTAL_AI_TOKEN;
  if (sharedSecret) {
    const auth = req.headers.get("x-investor-portal-token") ?? "";
    if (auth !== sharedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const reportScope = body.reportBudgetScope;
  if (reportScope !== undefined && (!sharedSecret || typeof reportScope !== "string" || !/^svi:run_[A-Za-z0-9_-]{12}$/.test(reportScope))) return NextResponse.json({ error: "invalid_report_budget_scope" }, { status: 400 });
  if (body.purpose === "visual_extract") {
    if (!sharedSecret || !reportScope || typeof body.imageBase64 !== "string" || body.imageBase64.length > 27 * 1024 * 1024 || body.imageBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.imageBase64)) return NextResponse.json({ error: "invalid_visual_request" }, { status: 400 });
    const bytes = Buffer.from(body.imageBase64, "base64");
    if (bytes.toString("base64") !== body.imageBase64) return NextResponse.json({ error: "invalid_visual_request" }, { status: 400 });
    const image = await prepareVisualImage(bytes);
    if (!image.ok) return NextResponse.json({ error: image.reason }, { status: 422 });
    try {
      const out = await callAI({ policy: "blockid-report-v1", attemptBudget: createReportAttemptBudget(reportScope),
        system: VISUAL_SYSTEM, user: "Inspect this business image. Separate visible observations, claims, approximate numbers and missing context.",
        visionImages: [image.bytes], maxTokens: 3000, temperature: 0, timeoutMs: 45000, budgetMs: 45000, agentId: "svi:visual" });
      if (out.model !== VISUAL_MODEL || (out.via ?? out.provider) !== "deepinfra") throw Error("model_mismatch");
      const interpreted = readVisualInterpretation(out.text);
      return NextResponse.json({ ok: true, text: JSON.stringify(interpreted), provider: "deepinfra", model: VISUAL_MODEL, policy: out.policy, purpose: "visual_extract", retried: false });
    } catch { return NextResponse.json({ ok: false, error: "visual_unavailable_or_budget_exhausted" }, { status: 503 }); }
  }
  const research = body.purpose === "research_synthesis" || body.purpose === "research_grounded_review";
  if (research) {
    // Caller authentication is not spend consent. This remains disabled until
    // durable per-call model budget/job authority is wired and reviewed.
    if (!sharedSecret || process.env.SVI_RESEARCH_MODEL_EXECUTION_ENABLED !== "1") {
      return NextResponse.json({ error: "research_model_execution_disabled" }, { status: 503 });
    }
    if (body.responseFormat !== "json" || typeof body.system !== "string" || body.system.length > 12000 || typeof body.user !== "string" || body.user.length > 60000) {
      return NextResponse.json({ error: "invalid_research_model_input" }, { status: 400 });
    }
  }
  const rawSystem = typeof body.system === "string" ? body.system.slice(0, MAX_SYSTEM) : "";
  const user = typeof body.user === "string" ? body.user.slice(0, MAX_USER) : "";
  if (!user) {
    return NextResponse.json({ error: "missing_user" }, { status: 400 });
  }
  const wantsJson = body.responseFormat === "json";
  const system = wantsJson ? rawSystem + JSON_PRIMER : rawSystem;
  const bounded = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(value, max)) : fallback;
  const budgetMs = Math.floor(bounded(body.timeoutMs, research ? 20000 : 120_000, 1_000, research ? 20000 : 240_000));
  // One server-selected policy and deadline cover both the first attempt and
  // optional JSON repair. Request JSON cannot select a paid fallback/provider.
  const callOpts: AICallOptions = {
    policy: "blockid-report-v1",
    ...(reportScope && !research ? { attemptBudget: createReportAttemptBudget(reportScope) } : {}),
    taskClass: body.purpose === "research_synthesis" ? "synthesis" : "report",
    agentId: research ? `svi:${body.purpose}` : "svi:investor-portal",
    budgetMs,
    deadlineAt: Date.now() + budgetMs,
    system,
    user,
    maxTokens: Math.floor(bounded(body.maxTokens, 4000, 1, research ? body.purpose === "research_grounded_review" ? 4000 : 6000 : 16_000)),
    temperature: bounded(body.temperature, 0.2, 0, 1),
    timeoutMs: budgetMs,
  };
  try {
    let out = await callAI(callOpts);
    // Always strip <think>…</think> reasoning blocks, JSON or text mode.
    // gpt-oss / reasoning models emit them by default and downstream
    // consumers (SVI extractJson, chat UIs) treat them as raw output.
    let text = wantsJson ? stripFences(out.text) : stripThinkTags(out.text);
    let retried = false;

    // JSON-mode retry: if the first response isn't parseable JSON, retry
    // once with a much stronger prompt hint. This is cheaper than SVI's
    // silent "markProxyBroken" penalty which locks the proxy for 5 min
    // for ALL tasks on a single stray token.
    if (!research && wantsJson && !looksLikeJson(text)) {
      retried = true;
      const stricter =
        rawSystem +
        JSON_PRIMER +
        "\n\nREPEAT: your previous reply was not valid JSON. " +
        "Return ONLY a JSON object matching what the user requested. " +
        "Start with `{` and end with `}`. No other characters.";
      out = await callAI({ ...callOpts, system: stricter, temperature: 0.1 });
      text = stripFences(out.text);
    }

    if (research && (!looksLikeJson(text) || Buffer.byteLength(text) > 100000 || out.policy !== "blockid-report-v1" || (out.via ?? out.provider) !== "deepinfra")) {
      return NextResponse.json({ error: "research_model_output_rejected" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      ...(research ? { purpose: body.purpose } : {}),
      text,
      provider: out.via ?? out.provider,
      model: out.model,
      policy: out.policy,
      responseFormat: wantsJson ? "json" : "text",
      retried,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "ai_call_failed",
        ...(research ? {} : { detail: err instanceof Error ? err.message : String(err) }),
        responseFormat: wantsJson ? "json" : "text",
      },
      { status: 502 },
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/investor-portal/ai-generate/route.ts", method: "POST" }, POST_handler);
