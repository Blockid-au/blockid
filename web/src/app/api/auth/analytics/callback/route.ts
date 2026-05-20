import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/workspace/evidence?error=analytics_failed", request.url));
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/analytics/callback`;

    // Exchange code for token
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
    if (!tokenData.access_token) throw new Error("No access token");

    // Get GA4 properties
    const propertiesRes = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const properties = await propertiesRes.json();

    // Parse state
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    const email = stateData.email;

    // Extract property summaries
    const propertySummaries = (properties.accountSummaries || []).flatMap(
      (acct: any) => (acct.propertySummaries || []).map((p: any) => ({
        property: p.property,
        displayName: p.displayName,
      }))
    );

    // Save to Supabase
    const supabase = getSupabaseAdmin();
    if (supabase && email) {
      await supabase.from("svi_evidence").upsert({
        email,
        evidence_type: "analytics",
        source: "oauth",
        title: `Google Analytics: ${propertySummaries.length} properties`,
        content: JSON.stringify({
          connected: true,
          properties: propertySummaries.slice(0, 5),
          connected_at: new Date().toISOString(),
        }),
        confidence: "connected_source",
        dimension: "tre",
        svi_impact: Math.min(15, Math.max(8, propertySummaries.length * 3)),
      }, { onConflict: "email,evidence_type" });
    }

    return NextResponse.redirect(new URL("/workspace/evidence?connected=analytics", request.url));
  } catch (err) {
    console.error("[analytics-oauth]", err);
    return NextResponse.redirect(new URL("/workspace/evidence?error=analytics_failed", request.url));
  }
}
