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
  const system = typeof body.system === "string" ? body.system.slice(0, MAX_SYSTEM) : "";
  const user = typeof body.user === "string" ? body.user.slice(0, MAX_USER) : "";
  if (!user) {
    return NextResponse.json({ error: "missing_user" }, { status: 400 });
  }
  try {
    const out = await callAI({
      system,
      user,
      maxTokens: Math.min(body.maxTokens ?? 4000, 16_000),
      temperature: body.temperature,
      timeoutMs: Math.min(body.timeoutMs ?? 120_000, 300_000),
    });
    return NextResponse.json({
      ok: true,
      text: out.text,
      provider: out.provider,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "ai_call_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
