// POST /api/tbr/[token]/view-start
//
// Wave 26A — anonymous open-tracking beacon fired from /tbr/[token]/page.tsx
// on mount. Records IP (server-only), UA-derived device class, country
// (Cloudflare `cf-ipcountry` header when available), and referrer.
//
// Body:   { referrer?: string }
// Reply:  { ok: true, viewId: number } | { ok: false, error }
//
// Rate-limited on IP to prevent single-attacker log flooding (60/min).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    ""
  );
}

/** Classify a UA string into "mobile" | "tablet" | "desktop" | "bot".
 *  Deliberately coarse — never used for fingerprinting, only for the
 *  founder-facing "device" column. */
function deviceClass(ua: string | null): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|preview|linkedinbot|whatsapp|slackbot|discordbot/.test(s)) return "bot";
  if (/ipad|tablet|kindle|silk|playbook/.test(s)) return "tablet";
  if (/mobi|iphone|android.*mobile|blackberry|iemobile/.test(s)) return "mobile";
  return "desktop";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }

  // 60 view-starts per IP per minute — enough for legit reload traffic but
  // stops single-node log flooding attacks.
  const ip = clientIp(request);
  const limited = enforceRateLimit("tbr-view-start", ip || "anon", request, 60, 60_000);
  if (limited) return limited;

  let body: { referrer?: string } = {};
  try {
    body = (await request.json()) as { referrer?: string };
  } catch {
    /* body is optional */
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Fail-open — never block the reader on analytics being down.
    return NextResponse.json({ ok: true, viewId: null });
  }

  // Only insert when the token actually maps to a real snapshot — otherwise
  // an attacker could pollute the table with 4M rows for random tokens.
  const { data: snap } = await supabase
    .from("svi_snapshots")
    .select("id")
    .eq("report_share_token", token)
    .maybeSingle();
  if (!snap) {
    return NextResponse.json({ ok: false, error: "unknown_token" }, { status: 404 });
  }

  const ua = request.headers.get("user-agent");
  const country = request.headers.get("cf-ipcountry") ?? null;
  const referrer = (body.referrer ?? request.headers.get("referer") ?? "").slice(0, 256) || null;

  const { data: inserted, error } = await supabase
    .from("tbr_views")
    .insert({
      share_token: token,
      viewer_ip: ip || null,
      viewer_country: country,
      viewer_ua: ua ? ua.slice(0, 256) : null,
      viewer_device: deviceClass(ua),
      referrer,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: true, viewId: null });
  }

  return NextResponse.json({ ok: true, viewId: (inserted as { id: number }).id });
}
