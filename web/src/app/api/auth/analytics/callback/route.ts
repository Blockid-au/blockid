import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateSVIAccount, getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=analytics_failed", request.url),
    );
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/analytics/callback`;

    // 1. Exchange code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("No access token from Google");

    // 2. Fetch GA4 property list
    const propertiesRes = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    const propertiesData = await propertiesRes.json();

    // 3. Parse state to get email
    let email: string | undefined;
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
      email = stateData.email;
    } catch {
      return NextResponse.redirect(
        new URL("/workspace/evidence?error=analytics_invalid_state", request.url),
      );
    }

    if (!email) {
      return NextResponse.redirect(
        new URL("/workspace/evidence?error=analytics_no_email", request.url),
      );
    }

    // 4. Extract property summaries
    const propertySummaries = (propertiesData.accountSummaries ?? []).flatMap(
      (acct: { propertySummaries?: { property: string; displayName: string }[] }) =>
        (acct.propertySummaries ?? []).map((p) => ({
          property: p.property,
          displayName: p.displayName,
        })),
    );

    const propertyCount = propertySummaries.length;
    const sviImpact = Math.min(15, Math.max(8, propertyCount * 3));
    const label = `Google Analytics: ${propertyCount} propert${propertyCount === 1 ? "y" : "ies"} connected`;
    const valueJson = JSON.stringify({
      connected: true,
      properties: propertySummaries.slice(0, 5),
      connected_at: new Date().toISOString(),
    });
    const now = new Date().toISOString();

    // 5. Save to database using correct svi_evidence schema
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const projectId = await getProjectIdFromRequest();
      const accountId = await findOrCreateSVIAccount(email, projectId);
      if (accountId) {
        // Save/update OAuth connection token
        await supabase
          .from("oauth_connections")
          .upsert(
            {
              user_email: email,
              provider: "google_analytics",
              provider_user_id: email,
              access_token: tokenData.access_token,
              metadata: { properties: propertySummaries.slice(0, 10), connected_at: now },
              connected_at: now,
              updated_at: now,
            },
            { onConflict: "user_email,provider" },
          )
          .then(({ error }) => {
            if (error) console.warn("[blockid:oauth:analytics] oauth_connections upsert failed", error.message);
          });

        // Upsert evidence with correct schema
        const { data: existingEvidence } = await supabase
          .from("svi_evidence")
          .select("id")
          .eq("account_id", accountId)
          .eq("evidence_type", "analytics")
          .maybeSingle();

        const evidencePayload = {
          account_id: accountId,
          evidence_type: "analytics" as const,
          label,
          value_or_url: valueJson,
          confidence_level: "connected_source" as const,
          dimension: "tre",
          svi_impact: sviImpact,
          verified_at: now,
        };

        if (existingEvidence) {
          await supabase.from("svi_evidence").update(evidencePayload).eq("id", existingEvidence.id);
        } else {
          await supabase.from("svi_evidence").insert({ ...evidencePayload, created_at: now });
        }

        // Fire-and-forget rescore (single endpoint)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
        const cookieHeader = request.headers.get("cookie") ?? "";
        void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
          method: "POST",
          headers: { Cookie: cookieHeader },
        }).catch(() => {});
      }
    }

    return NextResponse.redirect(
      new URL("/workspace/evidence?connected=analytics", request.url),
    );
  } catch (err) {
    console.error("[blockid:oauth:analytics] callback error", err);
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=analytics_failed", request.url),
    );
  }
}
