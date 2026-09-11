// POST /api/internal/ai-complete — internal-only AI completion for scripts/agents
// Auth: Bearer CRON_SECRET (same as other cron routes)
import { NextResponse } from "next/server";
import { callAI } from "@/lib/ai-client";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { z } from "zod";

const schema = z.object({
  system: z.string(),
  user: z.string(),
  maxTokens: z.number().int().min(100).max(4000).default(2000),
});

export async function POST(request: Request) {
  // Constant-time, fail-closed when CRON_SECRET is unset (S8-E follow-up:
  // the old `!==` compare against `Bearer ${secret}` opened this route as
  // `Bearer undefined` whenever the env var was missing).
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { system, user, maxTokens } = parsed.data;
  const result = await callAI({ system, user, maxTokens, timeoutMs: 60_000 });
  return NextResponse.json({ text: result.text, model: result.model });
}
