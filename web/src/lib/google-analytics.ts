// Google Analytics 4 — Data API reader (service-account auth, reuses the
// Drive service account credentials). Returns null gracefully when not
// configured (no GA_PROPERTY_ID, missing creds, or no access) so the daily
// report still works on internal data alone.
//
// SETUP to enable GA traffic in the report (one-time, in Google Cloud / GA):
//   1. Add  GA_PROPERTY_ID=<numeric property id>  to web/.env
//      (Admin → Property Settings → "Property ID", NOT the G-XXXX measurement id)
//   2. GA Admin → Property Access Management → add the service-account email
//      (GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL) as a Viewer.
//   3. Enable "Google Analytics Data API" on the GCP project.

import { google } from "googleapis";

export interface GA4Report {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  topSources: { source: string; users: number }[];
  topPages: { page: string; views: number }[];
}

export function isGAConfigured(): boolean {
  return !!(
    process.env.GA_PROPERTY_ID &&
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_DRIVE_PRIVATE_KEY
  );
}

/** Pull GA4 traffic for the last `days` full days (default: yesterday only). */
export async function getGA4Report(days = 1): Promise<GA4Report | null> {
  const propertyId = process.env.GA_PROPERTY_ID;
  const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!propertyId || !clientEmail || !privateKey) return null;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });
    const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
    const property = `properties/${propertyId}`;
    const startDate = `${days}daysAgo`;
    const endDate = "yesterday";

    const [core, sources, pages] = await Promise.all([
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics: [
            { name: "activeUsers" },
            { name: "newUsers" },
            { name: "sessions" },
            { name: "screenPageViews" },
          ],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
          limit: "5",
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: "5",
        },
      }),
    ]);

    const m = core.data.rows?.[0]?.metricValues ?? [];
    const num = (i: number) => Number(m[i]?.value ?? 0);

    return {
      activeUsers: num(0),
      newUsers: num(1),
      sessions: num(2),
      pageViews: num(3),
      topSources: (sources.data.rows ?? []).map((r) => ({
        source: r.dimensionValues?.[0]?.value ?? "(unknown)",
        users: Number(r.metricValues?.[0]?.value ?? 0),
      })),
      topPages: (pages.data.rows ?? []).map((r) => ({
        page: r.dimensionValues?.[0]?.value ?? "/",
        views: Number(r.metricValues?.[0]?.value ?? 0),
      })),
    };
  } catch (err) {
    console.error("[ga4] report failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
