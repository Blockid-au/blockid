// POST /api/internal/ai-complete — internal-only AI completion for scripts/agents
// Auth: Bearer CRON_SECRET (same as other cron routes)
import { NextResponse } from "next/server";
import { callAI } from "@/lib/ai-client";
import { z } from "zod";

const schema = z.object({
  system: z.string(),
  user: z.string(),
  maxTokens: z.number().int().min(100).max(4000).default(2000),
});

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
