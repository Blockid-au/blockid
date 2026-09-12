import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { callAI } from "@/lib/ai-client";
import { handleSupportQuery } from "@/lib/adk/agents";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

/** Adapter: ADK ModelCaller (system, user, maxTokens) → free callAI(). */
const adkModel = async (system: string, user: string, maxTokens: number): Promise<string> =>
  (await callAI({ system, user, maxTokens, timeoutMs: 60_000 })).text;

// ---------------------------------------------------------------------------
// POST /api/support — Customer-success agent (Google Agent Garden port).
// Triages a support message and returns a grounded reply + escalation flag.
// Body: { message: string }
// ---------------------------------------------------------------------------
async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let message = "";
  try {
    const body = await request.json();
    message = typeof body?.message === "string" ? body.message.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ ok: false, error: "Missing 'message'" }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ ok: false, error: "Message too long (max 4000 chars)" }, { status: 400 });
  }

  try {
    const result = await handleSupportQuery(message, adkModel);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Support agent failed" },
      { status: 500 },
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/support/route.ts", method: "POST" }, POST_handler);
