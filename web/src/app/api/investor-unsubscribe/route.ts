// GET /api/investor-unsubscribe?email=...&token=...
//
// Wave 31c — investor-side one-click unsubscribe from the drip sequence.
// Token is HMAC-SHA256(email, CRON_SECRET) truncated to 32 hex chars; matches
// what lib/investor-drips/send.ts mints when composing the email footer.
//
// On valid signature: UPSERT into investor_unsubscribes and return a plain
// HTML confirmation page. Idempotent — re-clicks are no-ops.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { unsubscribeToken } from "@/lib/investor-drips/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:48px 24px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 12px;font-size:22px">${title}</h1>
    <div style="color:#475569;font-size:15px;line-height:1.6">${body}</div>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">BlockID.au</p>
  </div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const token = (url.searchParams.get("token") ?? "").trim();

  if (!email || !token || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return page("Invalid link", "This unsubscribe link is malformed. If you keep receiving unwanted emails, reply to any BlockID email and we'll remove you manually.");
  }

  const expected = unsubscribeToken(email);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return page("Invalid link", "This unsubscribe link couldn't be verified. If you keep receiving unwanted emails, reply to any BlockID email and we'll remove you manually.");
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return page("Try again later", "Our database is temporarily unreachable. Please try this link again in a few minutes.");
    }
    // Upsert on the PK so re-clicks are no-ops.
    const { error } = await supabase
      .from("investor_unsubscribes")
      .upsert({ email }, { onConflict: "email" });
    if (error) {
      console.warn("[investor-unsubscribe] upsert failed:", error.message);
      return page("Try again later", "We hit a problem saving your preference. Please try again shortly.");
    }
  } catch (err) {
    console.warn("[investor-unsubscribe] failed:", err);
    return page("Try again later", "We hit a problem saving your preference. Please try again shortly.");
  }

  const safeEmail = email.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return page(
    "You've been unsubscribed",
    `<p>We've removed <strong>${safeEmail}</strong> from the BlockID investor update sequence. You won't receive any further drip emails.</p><p>You can still access any shared Trusted Business Reports you were sent — those links remain live.</p>`,
  );
}
