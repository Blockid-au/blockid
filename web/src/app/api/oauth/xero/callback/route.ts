// OAuth evidence connector: Xero callback
//
// Exchanges the OAuth code for an access token, fetches P&L and bank summary
// reports from Xero, then:
//   1. Saves the connection in oauth_connections
//   2. Creates evidence items in svi_evidence (connected_source, 75% confidence)
//   3. Triggers an SVI rescore
//
// Evidence items created:
//   - Xero P&L (3 months) → CFO (financial_health) — always created
//   - Xero Revenue Verified → TRE (traction) — only if income > 0

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sealToken } from "@/lib/oauth-token-seal";
import { findOrCreateSVIAccount } from "@/lib/projects";
import { projectScopeOrRedirect } from "@/lib/project-members/http";
import { oauthSessionOrRedirect } from "@/lib/project-members/oauth-session";
import { XERO_PL_EVIDENCE_DIMENSION, XERO_REVENUE_EVIDENCE_DIMENSION, xeroMetricsFromReports, type XeroReportsResponse } from "@/lib/connectors/xero-metrics";
import { insertConnectorSnapshot } from "@/lib/connectors/snapshots";

export const dynamic = "force-dynamic";

interface XeroTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
}

interface XeroConnection {
  tenantId?: string;
  tenantName?: string;
  tenantType?: string;
}

// S25-A — the report parsers live in lib/connectors/xero-metrics.ts so the
// weekly resync (api/cron/connector-resync) pulls exactly what this
// callback pulls; the callback also seeds the first `connector_snapshots`
// row (source "callback") so growth has a baseline from day one.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";

  if (errorParam) {
    return NextResponse.redirect(
      `${siteUrl}/workspace/evidence?error=xero_${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_missing_code`);
  }

  let stateData: { email?: string; csrf?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_invalid_state`);
  }

  const email = stateData.email;
  if (!email) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_no_email`);
  }

  // Verify CSRF
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value ?? "";
  if (!stateData.csrf || stateData.csrf !== sessionToken.slice(0, 16)) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_csrf_mismatch`);
  }

  // S18-A review P1-2 — the callback runs as the SESSION user and the state
  // email must be theirs; the no-project fallback is the session email.
  const { user, denied: notSession } = await oauthSessionOrRedirect(
    email,
    `${siteUrl}/workspace/evidence`,
    "xero",
  );
  if (notSession) return notSession;

  // S18-A — linking writes oauth_connections + evidence on the project
  // OWNER's svi_accounts row → admin+; gate BEFORE the code exchange.
  const { scope, denied } = await projectScopeOrRedirect(
    "admin",
    `${siteUrl}/workspace/evidence`,
    "xero_forbidden_role",
  );
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;
  const ownerUserId = scope?.ownerUserId ?? user.id;

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_not_configured`);
  }

  const callbackUrl = `${siteUrl}/api/oauth/xero/callback`;

  try {
    // 1. Exchange code for access token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl,
      }),
    });

    const tokenData: XeroTokenResponse = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("[blockid:oauth:xero] token exchange failed", tokenData);
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_token_failed`);
    }

    const accessToken: string = tokenData.access_token;

    // 2. Get tenant (organisation) ID
    const connectionsRes = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!connectionsRes.ok) {
      console.error("[blockid:oauth:xero] failed to fetch connections", connectionsRes.status);
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_connections_failed`);
    }

    const connections: XeroConnection[] = await connectionsRes.json();
    const tenantId = connections[0]?.tenantId;
    const tenantName = connections[0]?.tenantName ?? "Xero Organisation";

    if (!tenantId) {
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_no_tenant`);
    }

    // 3. Fetch P&L report (3 periods)
    const plRes = await fetch(
      "https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?periods=3",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          Accept: "application/json",
        },
      },
    );

    let plData: XeroReportsResponse = {};
    if (plRes.ok) {
      plData = await plRes.json();
    } else {
      console.warn("[blockid:oauth:xero] P&L fetch failed", plRes.status);
    }

    // 4. Fetch bank summary report
    const bankRes = await fetch(
      "https://api.xero.com/api.xro/2.0/Reports/BankSummary",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-Tenant-Id": tenantId,
          Accept: "application/json",
        },
      },
    );

    let bankData: XeroReportsResponse = {};
    if (bankRes.ok) {
      bankData = await bankRes.json();
    } else {
      console.warn("[blockid:oauth:xero] BankSummary fetch failed", bankRes.status);
    }

    // 5. Extract P&L values (shared parsers — S25-A)
    const metrics = xeroMetricsFromReports(plData, bankData, tenantName);
    const { totalIncomeAud, totalExpensesAud, netProfitAud } = metrics;

    const bankReportName = bankData.Reports?.[0]?.ReportName ?? null;

    // 6. Save to database
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_db_unavailable`);
    }

    const accountId = await findOrCreateSVIAccount(dataEmail, projectId);
    if (!accountId) {
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_account_failed`);
    }

    // Save OAuth connection (result checked: a silent failure here is what
    // hid the 0352 schema drift for three months)
    const { error: connErr } = await supabase.from("oauth_connections").upsert(
      {
        // Legacy vault (0027) is keyed on (user_email, provider); account_id
        // + raw_profile were added by 0352. user_email = the OWNER's data key.
        user_email: dataEmail,
        account_id: accountId,
        provider: "xero",
        provider_user_id: tenantId,
        access_token: sealToken(accessToken),
        refresh_token: sealToken(tokenData.refresh_token ?? null),
        raw_profile: JSON.stringify({
          tenantId,
          tenantName,
          totalIncomeAud,
          totalExpensesAud,
          netProfitAud,
          bankReportName,
        }),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_email,provider" },
    );
    if (connErr) {
      console.error("[oauth:xero] oauth_connections upsert failed", { code: connErr.code, message: connErr.message });
      return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero_save_failed`);
    }

    // 6b. S25-A — first dated snapshot (growth baseline for the weekly resync)
    await insertConnectorSnapshot(supabase, {
      userId: ownerUserId,
      projectId,
      provider: "xero",
      metrics,
      source: "callback",
    });

    // 7. Upsert P&L evidence (xero_pl → `iri`, S25-review-2 P3; was the
    //    non-SVI key "financial_health", which the rescore skipped) — always created
    const { data: existingCfo } = await supabase
      .from("svi_evidence")
      .select("id")
      .eq("account_id", accountId)
      .eq("evidence_type", "xero_pl")
      .eq("dimension", XERO_PL_EVIDENCE_DIMENSION)
      .maybeSingle();

    const cfoPayload = {
      account_id: accountId,
      evidence_type: "xero_pl" as const,
      label: "Xero P&L (3 months)",
      value_or_url: JSON.stringify({
        totalIncomeAud,
        totalExpensesAud,
        netProfitAud,
        tenantName,
        connectedAt: new Date().toISOString(),
      }),
      confidence_level: "connected_source" as const,
      dimension: XERO_PL_EVIDENCE_DIMENSION,
      svi_impact: 18,
      verified_at: new Date().toISOString(),
    };

    if (existingCfo) {
      await supabase.from("svi_evidence").update(cfoPayload).eq("id", existingCfo.id);
    } else {
      await supabase.from("svi_evidence").insert({ ...cfoPayload, created_at: new Date().toISOString() });
    }

    // 8. Upsert TRE evidence (xero_revenue → `tre`; was the non-SVI key "traction") — only if income > 0
    if (totalIncomeAud > 0) {
      const { data: existingTre } = await supabase
        .from("svi_evidence")
        .select("id")
        .eq("account_id", accountId)
        .eq("evidence_type", "xero_revenue")
        .eq("dimension", XERO_REVENUE_EVIDENCE_DIMENSION)
        .maybeSingle();

      const incomeDisplay =
        totalIncomeAud >= 1000
          ? `$${(totalIncomeAud / 1000).toFixed(1)}k`
          : `$${totalIncomeAud.toFixed(0)}`;

      const trePayload = {
        account_id: accountId,
        evidence_type: "xero_revenue" as const,
        label: `Xero Revenue Verified`,
        value_or_url: JSON.stringify({
          totalIncomeAud,
          incomeDisplay,
          tenantName,
          connectedAt: new Date().toISOString(),
        }),
        confidence_level: "connected_source" as const,
        dimension: XERO_REVENUE_EVIDENCE_DIMENSION,
        svi_impact: 15,
        verified_at: new Date().toISOString(),
      };

      if (existingTre) {
        await supabase.from("svi_evidence").update(trePayload).eq("id", existingTre.id);
      } else {
        await supabase.from("svi_evidence").insert({ ...trePayload, created_at: new Date().toISOString() });
      }
    }

    // 9. Trigger SVI rescore
    const cookieHeader = request.headers.get("cookie") ?? "";
    void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
    }).catch(() => {});

    return NextResponse.redirect(`${siteUrl}/workspace/evidence?connected=xero`);
  } catch (err) {
    console.error("[blockid:oauth:xero] callback error", err);
    return NextResponse.redirect(`${siteUrl}/workspace/evidence?error=xero`);
  }
}
