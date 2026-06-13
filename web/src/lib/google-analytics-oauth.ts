import "server-only";

/**
 * Google Analytics 4 OAuth connector — founder-installed integration.
 *
 * Distinct from `@/lib/google-analytics` (service-account reader used for the
 * BlockID internal daily report). This module is the per-user OAuth flow that
 * powers `/dashboard/integrations` and writes results into `svi_evidence`
 * (dimension `mkt`).
 *
 * Env stubs:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 */

const UA = "BlockID.au-evidence-bot";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA_ADMIN_PROPERTIES_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
const GA_DATA_URL = (propertyId: string) =>
  `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "openid",
  "email",
].join(" ");

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

export interface GA4PropertySummary {
  propertyId: string;
  displayName: string;
  accountName: string;
}

export interface GA4Stats {
  propertyId: string;
  displayName: string;
  monthlySessions: number;
  bounceRatePct: number;
  windowDays: number;
}

export function isGoogleAnalyticsOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function buildGoogleAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 0,
  };
}

export async function fetchFirstGa4Property(
  accessToken: string,
): Promise<GA4PropertySummary | null> {
  const res = await fetch(GA_ADMIN_PROPERTIES_URL, {
    headers: {
      "User-Agent": UA,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{ property?: string; displayName?: string }>;
    }>;
  };
  const summaries = json.accountSummaries ?? [];
  for (const acc of summaries) {
    const props = acc.propertySummaries ?? [];
    for (const p of props) {
      if (!p.property) continue;
      const id = p.property.replace(/^properties\//, "");
      return {
        propertyId: id,
        displayName: p.displayName ?? id,
        accountName: acc.displayName ?? "",
      };
    }
  }
  return null;
}

export async function fetchGa4Stats(
  accessToken: string,
  property: GA4PropertySummary,
  windowDays = 30,
): Promise<GA4Stats | null> {
  const body = {
    dateRanges: [{ startDate: `${windowDays}daysAgo`, endDate: "today" }],
    metrics: [{ name: "sessions" }, { name: "bounceRate" }],
  };
  const res = await fetch(GA_DATA_URL(property.propertyId), {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
  };
  const row = json.rows?.[0];
  if (!row) {
    return {
      propertyId: property.propertyId,
      displayName: property.displayName,
      monthlySessions: 0,
      bounceRatePct: 0,
      windowDays,
    };
  }
  const sessions = Number(row.metricValues?.[0]?.value ?? "0");
  const bounceRaw = Number(row.metricValues?.[1]?.value ?? "0");
  const bouncePct = bounceRaw <= 1 ? bounceRaw * 100 : bounceRaw;
  return {
    propertyId: property.propertyId,
    displayName: property.displayName,
    monthlySessions: Math.round(sessions),
    bounceRatePct: Math.round(bouncePct * 10) / 10,
    windowDays,
  };
}

export function scoreGa4Stats(stats: GA4Stats): number {
  let impact = 3;
  if (stats.monthlySessions >= 50_000) impact += 5;
  else if (stats.monthlySessions >= 10_000) impact += 4;
  else if (stats.monthlySessions >= 1_000) impact += 2;
  else if (stats.monthlySessions >= 100) impact += 1;
  if (stats.bounceRatePct > 0 && stats.bounceRatePct <= 40) impact += 2;
  else if (stats.bounceRatePct > 0 && stats.bounceRatePct <= 60) impact += 1;
  return Math.min(10, impact);
}
