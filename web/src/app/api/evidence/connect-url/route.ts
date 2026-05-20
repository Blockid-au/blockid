// Evidence connector: URL verification
//
// POST /api/evidence/connect-url
// Body: { url, type: "website" | "analytics" | "appstore" }
//
// Validates the URL is reachable, then saves it as evidence with appropriate
// confidence level. GitHub URLs get connected_source (75%) confidence;
// other URLs get public_url (35%) confidence.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type UrlType = "website" | "analytics" | "appstore";

// Map URL type to dimension
function mapDimension(urlType: UrlType): string {
  switch (urlType) {
    case "website":
      return "mpc";
    case "analytics":
      return "tre";
    case "appstore":
      return "ptd";
    default:
      return "general";
  }
}

// Authenticate via session cookie
async function authenticateRequest(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
) {
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value;
  if (!sessionToken) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", sessionToken)
    .maybeSingle();
  if (!session) return null;

  const { data: user } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", session.user_id)
    .single();
  if (!user) return null;

  return { userId: user.id as string, email: user.email as string };
}

// Find or create svi_account
async function findOrCreateAccount(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("svi_accounts")
    .insert({ email, last_active_at: new Date().toISOString() })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:connect-url] svi_accounts insert failed", error);
    return null;
  }
  return created.id as string;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    const auth = await authenticateRequest(supabase);
    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      url?: string;
      type?: UrlType;
    };

    const { url, type: urlType = "website" } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 },
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid URL format" },
        { status: 400 },
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { ok: false, error: "URL must use http or https protocol" },
        { status: 400 },
      );
    }

    // Validate URL is reachable (HEAD request with timeout)
    let reachable = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const headRes = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      reachable = headRes.ok || headRes.status === 405; // 405 = HEAD not allowed but site exists

      // If HEAD fails with 405, try GET
      if (headRes.status === 405) {
        const getController = new AbortController();
        const getTimeout = setTimeout(() => getController.abort(), 8000);
        const getRes = await fetch(url, {
          method: "GET",
          signal: getController.signal,
          redirect: "follow",
        });
        clearTimeout(getTimeout);
        reachable = getRes.ok;
      }
    } catch {
      // Fetch failed — URL is not reachable
      reachable = false;
    }

    if (!reachable) {
      return NextResponse.json(
        { ok: false, error: "URL is not reachable. Please check the URL and try again." },
        { status: 422 },
      );
    }

    // Determine confidence level and evidence type
    const isGitHub = parsedUrl.hostname === "github.com" || parsedUrl.hostname === "www.github.com";
    const confidenceLevel = isGitHub ? "connected_source" : "public_url";
    const evidenceType = isGitHub ? "github" : "url";
    const sviImpact = isGitHub ? 10 : 6;
    const dimension = isGitHub ? "ptd" : mapDimension(urlType);

    // Build label
    const hostname = parsedUrl.hostname.replace(/^www\./, "");
    const pathSnippet = parsedUrl.pathname.length > 1
      ? parsedUrl.pathname.substring(0, 40)
      : "";
    const typeLabel = urlType === "analytics" ? "Analytics" : urlType === "appstore" ? "App Store" : "Website";
    const label = isGitHub
      ? `GitHub: ${hostname}${pathSnippet}`
      : `${typeLabel}: ${hostname}${pathSnippet}`;

    // Save evidence
    const accountId = await findOrCreateAccount(supabase, auth.email);
    if (!accountId) {
      return NextResponse.json(
        { ok: false, error: "Failed to resolve account" },
        { status: 500 },
      );
    }

    const { data: evidence, error } = await supabase
      .from("svi_evidence")
      .insert({
        account_id: accountId,
        evidence_type: evidenceType,
        label,
        value_or_url: url,
        confidence_level: confidenceLevel,
        dimension,
        svi_impact: sviImpact,
        verified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[blockid:connect-url] insert failed", error);
      return NextResponse.json(
        { ok: false, error: "Failed to save evidence" },
        { status: 500 },
      );
    }

    // Trigger rescore (fire-and-forget)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
    const cookieHeader = request.headers.get("cookie") ?? "";
    void fetch(`${siteUrl}/api/evidence/rescore`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }).catch(() => {});
    void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }).catch(() => {});

    return NextResponse.json({ ok: true, evidence, sviDelta: sviImpact });
  } catch (err) {
    console.error("[blockid:connect-url] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
