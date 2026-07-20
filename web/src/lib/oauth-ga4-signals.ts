import "server-only";

export interface Ga4Signals {
  sessions30d: number;
  newUsers30d: number;
  conversions30d: number;
  averageSessionDurationSec: number;
}

interface RunReportResponse {
  rows?: Array<{
    metricValues: Array<{ value?: string }>;
  }>;
}

export async function fetchGa4Signals(
  accessToken: string,
  propertyId: string,
): Promise<Ga4Signals> {
  const trimmed = propertyId.replace(/^properties\//, "");
  const body = {
    dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    metrics: [
      { name: "sessions" },
      { name: "newUsers" },
      { name: "conversions" },
      { name: "averageSessionDuration" },
    ],
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${trimmed}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as RunReportResponse;
  const values = json.rows?.[0]?.metricValues ?? [];
  const num = (i: number): number => Number(values[i]?.value ?? 0) || 0;

  return {
    sessions30d: Math.round(num(0)),
    newUsers30d: Math.round(num(1)),
    conversions30d: Math.round(num(2)),
    averageSessionDurationSec: Math.round(num(3)),
  };
}

export interface Ga4Property {
  propertyId: string;
  displayName: string;
  parent: string;
}

interface AccountSummary {
  account?: string;
  displayName?: string;
  propertySummaries?: Array<{
    property?: string;
    displayName?: string;
    parent?: string;
  }>;
}

interface AccountSummariesResponse {
  accountSummaries?: AccountSummary[];
}

export async function listGa4Properties(
  accessToken: string,
): Promise<Ga4Property[]> {
  const res = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as AccountSummariesResponse;
  const out: Ga4Property[] = [];
  for (const acct of json.accountSummaries ?? []) {
    for (const p of acct.propertySummaries ?? []) {
      const raw = p.property ?? "";
      const propertyId = raw.replace(/^properties\//, "");
      if (!propertyId) continue;
      out.push({
        propertyId,
        displayName: p.displayName ?? propertyId,
        parent: acct.displayName ?? "",
      });
    }
  }
  return out;
}
