// Internal AI proxy for startupvalueindex.com — lets the sibling standalone
// app on :4002 reuse blockid.au's ai-client (Claude CLI OAuth → Anthropic API
// key → OpenAI → Gemini fallback chain). Locked to server-to-server calls from
// 127.0.0.1 to keep it off the public surface.

import "server-only";
import { NextResponse } from "next/server";
import { callAI } from "@/lib/ai-client";

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

export async function POST(req: Request) {
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
  const rawSystem = typeof body.system === "string" ? body.system.slice(0, MAX_SYSTEM) : "";
  const user = typeof body.user === "string" ? body.user.slice(0, MAX_USER) : "";
  if (!user) {
    return NextResponse.json({ error: "missing_user" }, { status: 400 });
  }
  const wantsJson = body.responseFormat === "json";
  const system = wantsJson ? rawSystem + JSON_PRIMER : rawSystem;
  const callOpts = {
    system,
    user,
    maxTokens: Math.min(body.maxTokens ?? 4000, 16_000),
    temperature: body.temperature ?? (wantsJson ? 0.2 : undefined),
    timeoutMs: Math.min(body.timeoutMs ?? 120_000, 300_000),
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
    if (wantsJson && !looksLikeJson(text)) {
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

    return NextResponse.json({
      ok: true,
      text,
      provider: out.provider,
      responseFormat: wantsJson ? "json" : "text",
      retried,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "ai_call_failed",
        detail: err instanceof Error ? err.message : String(err),
        responseFormat: wantsJson ? "json" : "text",
      },
      { status: 502 },
    );
  }
}
