import { NextResponse } from "next/server";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { sendEmail } from "@/lib/email";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { isRepresentativeHealthAnswer } from "@/lib/ai/model-capability";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ai-health
 * Health check for AI providers. Attempts a minimal AI call.
 * If all providers fail, sends alert email to admin.
 *
 * Trigger: cron every 3 hours (after OAuth refresh)
 */
export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = isAIConfigured();

  if (!configured) {
    await alertAdminOncePerDay("not_configured", "No AI providers configured at all");
    return NextResponse.json({ ok: false, error: "No providers configured", alerted: true });
  }

  // Try a minimal AI call
  try {
    const result = await callAI({ priority: "background", // S31-A: crons yield to user traffic
      system: "Reply with exactly: OK",
      user: "health check",
      // W1: 64, not 5 — a reasoning model spends a tiny budget on its hidden
      // trace and answers empty (G30 D-A6), which read as "all providers down".
      maxTokens: 64,
      taskClass: "classify",
    });

    // W1 (pricing v5 §7.2 #1): an answer from a model below the capability
    // floor (Groq allam-2-7b answered every health check while the real
    // chain was degraded) is not evidence that the AI stack is healthy.
    const representative = isRepresentativeHealthAnswer(result.model, result.text);
    if (!representative) {
      const detail = `health answer came from a non-representative model (${result.via ?? result.provider} ${result.model}) — the capable chain did not answer`;
      await alertAdminOncePerDay("non_representative", detail);
      return NextResponse.json({ ok: false, representative: false, provider: result.via ?? result.provider, model: result.model, error: detail });
    }

    return NextResponse.json({
      ok: true,
      representative: true,
      provider: result.via ?? result.provider,
      model: result.model,
      response: result.text.slice(0, 20),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // All providers failed — alert admin (once per UTC day: the token
    // guardian calls this route every 30 min).
    await alertAdminOncePerDay("all_failed", errorMsg);

    return NextResponse.json({
      ok: false,
      error: errorMsg.slice(0, 200),
      alerted: true,
    });
  }
}

function alertStateFile(): string {
  return process.env.AI_HEALTH_ALERT_STATE_FILE || join(homedir(), ".local/state/blockid-runtime/ai-health-alert.json");
}

/** The token guardian hits this route every 30 min — each alert kind is sent
 *  at most once per UTC day. Never throws. */
async function alertAdminOncePerDay(kind: "non_representative" | "all_failed" | "not_configured", error: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const file = alertStateFile();
  let sent: string[] = [];
  try {
    const prior = JSON.parse(await readFile(file, "utf8")) as { day?: unknown; kinds?: unknown };
    if (prior.day === day && Array.isArray(prior.kinds)) sent = prior.kinds.filter((k): k is string => typeof k === "string");
  } catch { /* no state yet */ }
  if (sent.includes(kind)) return;
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify({ day, kinds: [...sent, kind] }), { mode: 0o600 });
  } catch { /* best effort — still alert */ }
  await alertAdmin(error);
}

async function alertAdmin(error: string) {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    const html = `
<!DOCTYPE html>
<html><body style="font-family:Arial;background:#0B1220;color:#F8FAFC;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#0F172A;border:1px solid #1F2A44;border-radius:16px;padding:32px;">
    <p style="color:#EF4444;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;">AI PROVIDER ALERT</p>
    <h1 style="color:#F8FAFC;font-size:20px;margin:8px 0;">All AI Providers Failed</h1>
    <p style="color:#94A3B8;font-size:14px;line-height:1.6;">
      BlockID.au AI system health check failed. No AI provider is currently responding.
      Auto-publish, growth insights, and SVI analysis AI features are affected.
    </p>
    <div style="background:#0B1220;border:1px solid #1F2A44;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#64748B;font-size:11px;margin:0 0 8px;">Error details:</p>
      <p style="color:#FB923C;font-size:13px;font-family:monospace;margin:0;word-break:break-all;">${error.slice(0, 500)}</p>
    </div>
    <p style="color:#94A3B8;font-size:13px;line-height:1.6;margin:16px 0 0;">
      <strong>How to fix:</strong>
    </p>
    <ol style="color:#94A3B8;font-size:13px;line-height:1.8;padding-left:20px;">
      <li>SSH into server and run <code style="color:#60A5FA;">claude</code> to refresh OAuth token</li>
      <li>Or add a new API key at <a href="${siteUrl}/admin/ai-keys" style="color:#3B7DD8;">Admin → AI Keys</a></li>
      <li>Or get a new Gemini key at <a href="https://aistudio.google.com/apikey" style="color:#3B7DD8;">AI Studio</a></li>
    </ol>
    <a href="${siteUrl}/admin/ai-keys" style="display:inline-block;margin-top:16px;background:#3B7DD8;color:#0B1220;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;">Manage AI Keys →</a>
  </div>
</body></html>`;

    await sendEmail({
      to: "admin@blockid.au",
      subject: "⚠️ BlockID AI Alert: All Providers Down",
      html,
    });
  } catch {
    console.error("[ai-health] Failed to send alert email");
  }
}

export { GET as POST };
