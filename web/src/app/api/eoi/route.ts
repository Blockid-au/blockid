// /api/eoi (T_SVI_EXC_0013) — verified investor submits Expression of Interest
// against a secondary offer. POST = submit/update; GET = my EOIs.

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
    .select("account_type, segment, verified_at, display_name, email")
    .eq("id", me.id)
    .maybeSingle();
  const meTyped = meRow as { account_type: string; segment: string | null; verified_at: string | null; display_name: string | null; email: string } | null;
  // Entitlement gate: accept the new segment column (investor_angel/investor_vc)
  // added in 0073_user_segments_and_jurisdiction.sql, and keep account_type as
  // a backwards-compat fallback until every row is backfilled.
  const isInvestor = meTyped?.segment === "investor_angel"
    || meTyped?.segment === "investor_vc"
    || meTyped?.account_type === "investor";
  if (!meTyped || !isInvestor || !meTyped.verified_at) {
    return NextResponse.json({ ok: false, error: "Verified investor account required" }, { status: 403, headers: CORS });
  }

  let body: { offer_id?: string; amount_aud?: number; notes?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: CORS });
  }
  if (!body.offer_id) return NextResponse.json({ ok: false, error: "offer_id required" }, { status: 400, headers: CORS });

  const { data: offer } = await supabase
    .from("secondary_offers")
    .select("id, ticker, status, account_id")
    .eq("id", body.offer_id)
    .eq("status", "live")
    .maybeSingle();
  if (!offer) return NextResponse.json({ ok: false, error: "Offer not found or not live" }, { status: 404, headers: CORS });

  const offerTyped = offer as { id: string; ticker: string; status: string; account_id: string };
  const amountAud = typeof body.amount_aud === "number" ? Math.max(1, body.amount_aud) : null;
  const notes = body.notes?.toString().slice(0, 1000) ?? null;

  const { data: existing } = await supabase
    .from("eoi_book")
    .select("id")
    .eq("offer_id", offerTyped.id)
    .eq("investor_id", me.id)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing) {
    await supabase.from("eoi_book").update({ amount_aud: amountAud, notes, updated_at: now }).eq("id", (existing as { id: string }).id);
    return NextResponse.json({ ok: true, action: "updated" }, { headers: CORS });
  }

  await supabase.from("eoi_book").insert({
    offer_id: offerTyped.id,
    investor_id: me.id,
    amount_aud: amountAud,
    notes,
    status: "pending",
  });

  // Notify the founder.
  const { data: founderRow } = await supabase
    .from("app_users")
    .select("email, display_name")
    .eq("id", offerTyped.account_id)
    .maybeSingle();
  const founderTyped = founderRow as { email: string; display_name: string | null } | null;
  if (founderTyped?.email) {
    const fromName = meTyped.display_name || meTyped.email;
    await sendEmail({
      to: founderTyped.email,
      subject: `New EOI on ${offerTyped.ticker}${amountAud ? ` · A$${(amountAud / 1_000).toFixed(0)}K indicative` : ""}`,
      html: `<!doctype html><html><body style="font-family:sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
        <div style="max-width:500px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
          <p style="font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">EOI · Startup Value Index™</p>
          <h1 style="margin:6px 0 12px;font-size:20px">New expression of interest on <strong>${offerTyped.ticker}</strong></h1>
          <p style="font-size:14px"><strong>${fromName}</strong> has registered an EOI${amountAud ? ` for <strong>A$${amountAud.toLocaleString("en-AU")}</strong>` : ""}.</p>
          ${notes ? `<blockquote style="margin:12px 0;padding:12px 16px;background:#f1f5f9;border-left:3px solid #0ea5e9;border-radius:0 6px 6px 0;color:#334155;white-space:pre-wrap">${notes.replace(/[<>]/g, (c) => c === "<" ? "&lt;" : "&gt;")}</blockquote>` : ""}
          <p style="font-size:13px;color:#475569">Review all EOIs in your <a href="https://blockid.au/workspace/secondary-offers" style="color:#0f766e">Secondary Offers dashboard</a>.</p>
        </div>
      </body></html>`,
    });
  }

  return NextResponse.json({ ok: true, action: "created" }, { headers: CORS });
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401, headers: CORS });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, rows: [] });
  const { data } = await supabase
    .from("eoi_book")
    .select("id, offer_id, amount_aud, notes, status, created_at")
    .eq("investor_id", me.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ ok: true, rows: data ?? [] }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
