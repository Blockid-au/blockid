// OAuth evidence connector: LinkedIn callback
//
// Exchanges the OAuth code for an access token, fetches the founder's
// LinkedIn profile via OpenID Connect userinfo, then:
//   1. Saves the connection in oauth_connections
//   2. Creates evidence items in svi_evidence (connected_source, 75% confidence)
//   3. Triggers an SVI rescore
//
// Evidence signals:
//   - hasFounderProfile = true (connecting = credibility signal)
//   - Profile completeness (name, picture, headline)
//   - LinkedIn presence → founder credibility (cgh dimension)

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface LinkedInUserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: { country?: string; language?: string };
}

// Find or create svi_account by email, return account id
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
    .insert({
      email,
      last_active_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[blockid:oauth:linkedin] svi_accounts insert failed", error);
    return null;
  }
  return created.id as string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // LinkedIn may return an error param (e.g. user denied access)
  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/workspace/evidence?error=linkedin_${errorParam}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=linkedin_missing_code", request.url),
    );
  }

  // Decode state to retrieve email and verify CSRF
  let stateData: { email?: string; csrf?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=linkedin_invalid_state", request.url),
    );
  }

  const email = stateData.email;
  if (!email) {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=linkedin_no_email", request.url),
    );
  }

  // Verify CSRF: first 16 chars of session token must match
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  if (stateData.csrf && stateData.csrf !== sessionToken.slice(0, 16)) {
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=linkedin_csrf_mismatch", request.url),
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const redirectUri = `${siteUrl}/api/oauth/linkedin/callback`;

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
      },
    );

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("[blockid:oauth:linkedin] token exchange failed", tokenData);
      throw new Error("No access token returned from LinkedIn");
    }

    // 2. Fetch user profile via OpenID Connect userinfo endpoint
    const userInfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      console.error(
        "[blockid:oauth:linkedin] userinfo failed",
        userInfoRes.status,
        await userInfoRes.text(),
      );
      throw new Error("Failed to fetch LinkedIn profile");
    }

    const profile: LinkedInUserInfo = await userInfoRes.json();

    // 3. Calculate SVI impact based on profile signals
    // Base: 5 points for connecting LinkedIn (founder credibility)
    let sviImpact = 5;

    // Profile completeness bonus
    if (profile.name) sviImpact += 1; // Has a display name
    if (profile.picture) sviImpact += 1; // Has a profile photo
    if (profile.email_verified) sviImpact += 1; // Verified email

    // Cap at 10
    sviImpact = Math.min(10, sviImpact);

    const displayName = profile.name ?? [profile.given_name, profile.family_name].filter(Boolean).join(" ") ?? "LinkedIn User";
    const profileUrl = `https://www.linkedin.com/in/${profile.sub}`;

    const label = `LinkedIn: ${displayName}`;

    const metadata = {
      sub: profile.sub,
      name: displayName,
      given_name: profile.given_name ?? null,
      family_name: profile.family_name ?? null,
      picture: profile.picture ?? null,
      email: profile.email ?? null,
      email_verified: profile.email_verified ?? false,
      locale: profile.locale ?? null,
      profile_url: profileUrl,
      connected_at: new Date().toISOString(),
    };

    // 4. Save to database
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const accountId = await findOrCreateAccount(supabase, email);
      if (accountId) {
        // 4a. Save/update oauth_connections
        await supabase
          .from("oauth_connections")
          .upsert(
            {
              user_email: email,
              provider: "linkedin",
              provider_user_id: profile.sub,
              access_token: tokenData.access_token,
              metadata,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_email,provider" },
          )
          .then(({ error }) => {
            if (error) {
              console.warn(
                "[blockid:oauth:linkedin] oauth_connections upsert failed",
                error.message,
              );
            }
          });

        // 4b. Check if LinkedIn evidence already exists for this account
        const { data: existingEvidence } = await supabase
          .from("svi_evidence")
          .select("id")
          .eq("account_id", accountId)
          .eq("evidence_type", "linkedin")
          .eq("confidence_level", "connected_source")
          .maybeSingle();

        const evidencePayload = {
          account_id: accountId,
          evidence_type: "linkedin" as const,
          label,
          value_or_url: profileUrl,
          confidence_level: "connected_source" as const,
          dimension: "cgh", // Founder credibility & governance
          svi_impact: sviImpact,
          verified_at: new Date().toISOString(),
        };

        if (existingEvidence) {
          await supabase
            .from("svi_evidence")
            .update(evidencePayload)
            .eq("id", existingEvidence.id);
        } else {
          await supabase.from("svi_evidence").insert({
            ...evidencePayload,
            created_at: new Date().toISOString(),
          });
        }

        // 5. Trigger SVI rescore (fire-and-forget)
        const cookieHeader = request.headers.get("cookie") ?? "";
        void fetch(`${siteUrl}/api/evidence/rescore`, {
          method: "POST",
          headers: { Cookie: cookieHeader },
        }).catch(() => {});
        void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
          method: "POST",
          headers: { Cookie: cookieHeader },
        }).catch(() => {});
      }
    }

    // 6. Redirect to evidence vault with success param
    return NextResponse.redirect(
      new URL("/workspace/evidence?connected=linkedin", request.url),
    );
  } catch (err) {
    console.error("[blockid:oauth:linkedin] callback error", err);
    return NextResponse.redirect(
      new URL("/workspace/evidence?error=linkedin_failed", request.url),
    );
  }
}
