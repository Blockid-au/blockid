import { NextResponse } from "next/server";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { readTractionSnapshotRaw, tractionStatusFrom } from "@/lib/traction/status";
import { countersFromSnapshot, nonNegInt, hasSnapshotWarning } from "@/lib/traction/platform-counters";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/** Missing content is unavailable, not an invented inventory count. */
function countInsightArticles(): number | null {
  try { return readdirSync(join(process.cwd(), "content", "insights")).filter(f => f.endsWith(".md")).length; }
  catch { return null; }
}

// Keep existing metric keys for directory clients. Null means unmeasured;
// metricDetails supplies scope and source time. Never replace a filtered daily
// snapshot with unfiltered database totals or convert an index score to money.
export async function GET() {
  const requestedAt = new Date().toISOString();
  const raw = await readTractionSnapshotRaw(process.cwd()).catch(() => null);
  const snapshotStatus = tractionStatusFrom(raw);
  const snap = countersFromSnapshot(raw);
  const sourceTime = snapshotStatus === "ok" && typeof raw?.generated_at === "string" ? raw.generated_at : null;
  const observed = (section: string, field: string, warning: string) => {
    if (!snap || !raw || hasSnapshotWarning(raw, [warning])) return null;
    return nonNegInt((raw[section] as Record<string, unknown> | undefined)?.[field]);
  };
  const metrics = {
    founders: snap?.founders ?? null,
    analyses: snap?.analyses ?? null,
    valuationsTracked: null,
    tools: null,
    articles: countInsightArticles(),
    monthlyVisitors: null,
    evidenceItems: null,
    connectedSources: null,
    averageSVI: null,
    paidCustomers: snap?.paidCustomers ?? null,
    registeredUsers: observed("users", "total", "app_users:"),
    reportPurchases: observed("tbr", "purchased", "report_orders:"),
    sharedReportSnapshots: observed("tbr", "shared", "svi_snapshots:"),
    reportViews: observed("tbr", "views", "tbr_views:"),
  };
  const definitions: Record<keyof typeof metrics, string> = {
    founders: "Non-evaluator app user accounts, excluding known QA, seeded and erased email patterns; not unique companies.",
    analyses: "All stored svi_analyses rows; includes reruns and may include QA records. Not unique companies or completed customer reports.",
    valuationsTracked: "Unavailable: no approved comparable monetary valuation aggregate; index scores are not money.",
    tools: "Unavailable: no versioned public tool inventory is counted by this endpoint.",
    articles: "Markdown files currently available in content/insights.",
    monthlyVisitors: "Unavailable: no measured monthly visitor source is attached.",
    evidenceItems: "Unavailable: no scoped evidence count in the traction snapshot.",
    connectedSources: "Unavailable: no distinct connected-account count in the traction snapshot.",
    averageSVI: "Unavailable: no approved same-method, same-revision index cohort aggregate.",
    paidCustomers: "Active evaluator subscription rows after account exclusions; not distinct paying users or organisations and not receipt-confirmed payments.",
    registeredUsers: "App user accounts excluding known QA, seeded and erased email patterns; not distinct organisations.",
    reportPurchases: "Report order rows in PAID, GENERATING, READY or SHARED states; raw count, not QA-filtered distinct reports.",
    sharedReportSnapshots: "Snapshot rows with a share token; raw count, not unique companies or public readers.",
    reportViews: "All recorded tbr_views rows; not unique visitors and not QA-filtered.",
  };
  const metricDetails = Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, {
    status: value === null ? "unavailable" : "measured",
    definition: definitions[key as keyof typeof metrics],
    asOf: value === null ? null : key === "articles" ? requestedAt : sourceTime,
    source: value === null ? null : key === "articles" ? "content_inventory" : "traction_snapshot",
  }]));
  return NextResponse.json({
    ok: true, dataStatus: "partial", metrics, metricDetails, company: companyInfo(),
    updatedAt: sourceTime, requestedAt, source: snap ? "traction_snapshot" : "unavailable",
    snapshot: { status: snapshotStatus, generatedAt: typeof raw?.generated_at === "string" ? raw.generated_at : null },
  }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" } });
}

function companyInfo() {
  return {
    name: "BlockID.au",
    legal: LEGAL_ENTITY.operator,
    acn: LEGAL_ENTITY.acn,
    abn: LEGAL_ENTITY.abn,
    founded: 2023,
    location: "Sydney, NSW, Australia",
    industry: ["SaaS", "AI/ML", "FinTech", "Startup Tools"],
    stage: "Pre-seed",
    website: "https://blockid.au",
    tagline: "Score any Australian startup in 60 seconds",
  };
}
