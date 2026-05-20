import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai-status
 * Returns the current AI provider chain status (which keys are configured, which work).
 * Admin-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providers: Array<{
    id: string;
    name: string;
    status: "active" | "configured" | "missing";
    detail: string;
  }> = [];

  // 1. Claude CLI OAuth
  try {
    const fs = await import("fs");
    const path = await import("path");
    const home = process.env.HOME ?? "/root";
    const credPath = path.join(home, ".claude", ".credentials.json");
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      const oauth = creds.claudeAiOauth;
      if (oauth?.accessToken) {
        const expired = oauth.expiresAt && Date.now() > oauth.expiresAt;
        const minutesLeft = oauth.expiresAt ? Math.round((oauth.expiresAt - Date.now()) / 60000) : null;
        providers.push({
          id: "claude-oauth",
          name: "Claude CLI OAuth",
          status: expired ? "configured" : "active",
          detail: expired ? "Token expired — run `claude` CLI to refresh" : `Token valid (${minutesLeft} min left)`,
        });
      } else {
        providers.push({ id: "claude-oauth", name: "Claude CLI OAuth", status: "missing", detail: "No token in credentials file" });
      }
    } else {
      providers.push({ id: "claude-oauth", name: "Claude CLI OAuth", status: "missing", detail: "~/.claude/.credentials.json not found" });
    }
  } catch {
    providers.push({ id: "claude-oauth", name: "Claude CLI OAuth", status: "missing", detail: "Cannot read credentials" });
  }

  // 2. Anthropic API Key
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  providers.push({
    id: "claude-apikey",
    name: "Anthropic API Key",
    status: anthropicKey ? "configured" : "missing",
    detail: anthropicKey ? `Key: ${anthropicKey.slice(0, 12)}...${anthropicKey.slice(-4)}` : "ANTHROPIC_API_KEY not set",
  });

  // 3. Proxy (TapHoaAPI)
  const proxyKey = process.env.ANTHROPIC_PROXY_API_KEY;
  const proxyUrl = process.env.ANTHROPIC_PROXY_BASE_URL;
  if (proxyKey && proxyUrl) {
    const keyCount = proxyKey.split(",").filter(Boolean).length;
    providers.push({
      id: "claude-proxy",
      name: "Anthropic Proxy (TapHoaAPI)",
      status: "active",
      detail: `${keyCount} key(s) configured — ${proxyUrl}`,
    });
  } else {
    providers.push({ id: "claude-proxy", name: "Anthropic Proxy", status: "missing", detail: "ANTHROPIC_PROXY_API_KEY / BASE_URL not set" });
  }

  // 4. Codex OAuth
  try {
    const fs = await import("fs");
    const path = await import("path");
    const home = process.env.HOME ?? "/root";
    const authPath = path.join(home, ".codex", "auth.json");
    if (fs.existsSync(authPath)) {
      providers.push({ id: "openai-codex", name: "OpenAI Codex OAuth", status: "active", detail: "~/.codex/auth.json found" });
    } else {
      providers.push({ id: "openai-codex", name: "OpenAI Codex OAuth", status: process.env.CODEX_ACCESS_TOKEN ? "configured" : "missing", detail: process.env.CODEX_ACCESS_TOKEN ? "CODEX_ACCESS_TOKEN set" : "~/.codex/auth.json not found" });
    }
  } catch {
    providers.push({ id: "openai-codex", name: "OpenAI Codex OAuth", status: "missing", detail: "Cannot check" });
  }

  // 5. OpenAI API Key
  const openaiKey = process.env.OPENAI_API_KEY;
  providers.push({
    id: "openai-apikey",
    name: "OpenAI API Key",
    status: openaiKey ? "configured" : "missing",
    detail: openaiKey ? `Key: ${openaiKey.slice(0, 8)}...${openaiKey.slice(-4)}` : "OPENAI_API_KEY not set",
  });

  // 6. Google Gemini
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  providers.push({
    id: "gemini",
    name: "Google Gemini",
    status: geminiKey ? "configured" : "missing",
    detail: geminiKey ? `Key: ${geminiKey.slice(0, 10)}...${geminiKey.slice(-4)}` : "GOOGLE_GEMINI_API_KEY not set",
  });

  const activeCount = providers.filter((p) => p.status === "active").length;
  const configuredCount = providers.filter((p) => p.status !== "missing").length;

  return NextResponse.json({
    ok: true,
    activeCount,
    configuredCount,
    totalProviders: providers.length,
    providers,
    priority: providers.map((p) => p.id),
  });
}
