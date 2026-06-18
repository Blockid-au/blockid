// /api/contact-unlock (T_SVI_EXC_0005) — verified investor requests intro
// to a founder. Validates: caller is signed in, account_type=investor,
// verified_at IS NOT NULL, founder.contactable_by_investors=true.
// Sends a templated email to the founder, logs the request.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "https://startupvalueindex.com",
  "Access-Control-Allow-Credentials": "true",
};

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401, headers: CORS });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 500, headers: CORS });

  const { data: meRow } = await supabase
    .from("app_users")
    .select("account_type, verified_at, investor_firm, display_name, email")
    .eq("id", me.id)
    .maybeSingle();
  const meTyped = meRow as { account_type: string; verified_at: string | null; investor_firm: string | null; display_name: string | null; email: string } | null;
  if (!meTyped || meTyped.account_type !== "investor") {
    return NextResponse.json({ ok: false, error: "Investor accounts only" }, { status: 403, headers: CORS });
  }
  if (!meTyped.verified_at) {
    return NextResponse.json({ ok: false, error: "Your investor account is pending verification." }, { status: 403, headers: CORS });
  }

  let body: { ticker?: string; slug?: string; message?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: CORS });
  }
  const ticker = (body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "Invalid ticker" }, { status: 400, headers: CORS });
  }
  const slug = body.slug?.toString().slice(0, 100);
  const message = (body.message ?? "").toString().slice(0, 1500).trim();

  // Resolve founder email via slug → analysis → email.
  let founderEmail: string | null = null;
  if (slug) {
    const { data: analysis } = await supabase
      .from("svi_analyses")
      .select("email")
      .eq("slug", slug)
      .maybeSingle();
    founderEmail = (analysis as { email: string } | null)?.email ?? null;
  }
  if (!founderEmail) {
    return NextResponse.json({ ok: false, error: "Could not resolve founder" }, { status: 404, headers: CORS });
  }

  // Check the founder opted in.
  const { data: profile } = await supabase
    .from("founder_profiles")
    .select("contactable_by_investors, full_name")
    .eq("email", founderEmail)
    .maybeSingle();
  const profileTyped = profile as { contactable_by_investors: boolean; full_name: string | null } | null;
  if (!profileTyped?.contactable_by_investors) {
    return NextResponse.json({ ok: false, error: "This founder has not opened their inbox." }, { status: 403, headers: CORS });
  }

  await supabase.from("contact_unlock_requests").insert({
    investor_id: me.id,
    founder_email: founderEmail,
    ticker,
    slug,
    message: message || null,
  });

  const fromName = meTyped.display_name || meTyped.email;
  const firmLine = meTyped.investor_firm ? `from <strong>${meTyped.investor_firm}</strong> ` : "";
  await sendEmail({
    to: founderEmail,
    subject: `Verified investor ${fromName} wants to chat about ${ticker}`,
    html: `<!doctype html><html><body style="font-family:sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
        <p style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Intro request · Startup Value Index™</p>
        <h1 style="margin:6px 0 14px;font-size:20px">${fromName} ${firmLine}is interested in ${ticker}</h1>
        ${message ? `<blockquote style="margin:12px 0;padding:12px 16px;background:#f1f5f9;border-left:3px solid #0ea5e9;border-radius:0 6px 6px 0;color:#334155;white-space:pre-wrap">${message.replace(/[<>]/g, (c) => c === "<" ? "&lt;" : "&gt;")}</blockquote>` : ""}
        <p style="font-size:14px;color:#475569">Reply to <a href="mailto:${meTyped.email}" style="color:#0f766e">${meTyped.email}</a> to start a conversation. You can revoke investor contact any time in your <a href="https://blockid.au/workspace/founder-profile" style="color:#0f766e">founder profile</a>.</p>
      </div>
    </body></html>`,
  });

  return NextResponse.json({ ok: true }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
