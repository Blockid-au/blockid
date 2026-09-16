// /workspace/reports — shared server loaders (S-IA2, spec §A.1 row
// `/workspace/reports`).
//
//   loadArchive(userId)          investor packs + assembled reports for the
//                                CALLER (moved verbatim from weekly/page.tsx;
//                                still the shape `ReportArchive` renders).
//   loadAllReports(user, scope)  the "All reports" union: every generated
//                                artefact the signed-in founder has, newest
//                                first, tagged with a `ReportKind` chip.
//
// Every read is wrapped so a table that is not migrated in this environment
// degrades to an empty group instead of failing the page. Owner-keyed reads
// (svi_snapshots) go through the S18-B member-aware scope exactly as
// weekly/page.tsx does; caller-keyed rows (investor packs, assembled
// reports, TBR orders) stay per caller.

import { getSupabaseAdmin } from "@/lib/supabase";
import type { ProjectScope } from "@/lib/projects";
import { resolveSVIAccountIdForPage } from "@/lib/project-members/page-scope";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import type { Role } from "@/lib/c-level/compare-trend";
import type { InvestorPackRow, AssembledReportRow } from "@/components/workspace/report-archive";

// ── Types ────────────────────────────────────────────────────────────────────

/** Chip on the All-reports list. `lp` is reserved: LP artefacts are not persisted yet. */
export type ReportKind = "weekly" | "business" | "investor-pack" | "c-level" | "lp";

export interface ReportListItem {
  /** Unique across sources — `<source>:<row id>`. */
  key: string;
  kind: ReportKind;
  title: string;
  /** ISO timestamp or DATE string; the list is sorted on this, newest first. */
  date: string;
  href: string;
  /** Short secondary text (score delta, status, tier). */
  meta?: string;
  /** True when `href` is a file download rather than an in-app route. */
  download?: boolean;
}

/** `AssembledReportRow` plus the svi_analyses id the saved-report page renders. */
export interface AssembledReportEntry extends AssembledReportRow {
  analysis_id: string | null;
}

export interface ReportArchiveData {
  investorPacks: InvestorPackRow[];
  assembledReports: AssembledReportEntry[];
}

// ── loadArchive — investor packs + assembled reports (per caller) ─────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadArchive(userId: string): Promise<ReportArchiveData> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const investorPacks: InvestorPackRow[] = [];
  const assembledReports: AssembledReportEntry[] = [];

  if (!admin) return { investorPacks, assembledReports };

  try {
    const { data: packs } = await admin
      .from("investor_pack_shares")
      .select("id, share_id, created_at, expires_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (packs) {
      for (const row of packs as any[]) {
        investorPacks.push({
          id: row.id,
          share_id: row.share_id,
          created_at: row.created_at,
          expires_at: row.expires_at,
          is_expired: new Date(row.expires_at).getTime() < now.getTime(),
          download_url: `/api/investor-pack/download/${row.share_id}`,
        });
      }
    }
  } catch { /* investor_pack_shares not yet migrated */ }

  try {
    const { data: reports } = await admin
      .from("assembled_reports")
      .select("id, project_id, analysis_id, tier, created_at, total_words, title")
      .eq("user_id", userId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(20);
    if (reports && (reports as any[]).length > 0) {
      const projectIds = [...new Set((reports as any[]).map((r: any) => r.project_id).filter(Boolean))];
      const nameMap = new Map<string, string>();
      if (projectIds.length > 0) {
        try {
          const { data: projects } = await admin.from("projects").select("id, name").in("id", projectIds);
          if (projects) for (const p of projects as any[]) { if (p.name) nameMap.set(p.id, p.name); }
        } catch { /* ignore */ }
      }
      for (const row of reports as any[]) {
        assembledReports.push({
          id: row.id,
          order_id: row.id,
          tier: typeof row.tier === "string" ? row.tier : "standard",
          created_at: row.created_at,
          word_count: typeof row.total_words === "number" ? row.total_words : 0,
          startup_name: (row.project_id && nameMap.get(row.project_id)) || (typeof row.title === "string" && row.title) || "Startup",
          analysis_id: typeof row.analysis_id === "string" && row.analysis_id ? row.analysis_id : null,
        });
      }
    }
  } catch { /* assembled_reports may not exist yet */ }

  return { investorPacks, assembledReports };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── loadAllReports — the union behind /workspace/reports ─────────────────────

const C_LEVEL_ROLES: ReadonlyArray<{ role: Role; title: string }> = [
  { role: "cfo", title: "CFO — Valuation" },
  { role: "ceo", title: "CEO — Runway" },
  { role: "cto", title: "CTO — Tech Posture" },
  { role: "cmo", title: "CMO — CAC Payback" },
  { role: "cdo", title: "CDO — Data & Privacy" },
];

/** Trust Business Report order states that represent a generated (or generating) artefact. */
const LISTED_ORDER_STATES = new Set(["PAID", "GENERATING", "READY", "SHARED", "EXPIRED"]);

const ORDER_STATUS_META: Record<string, string> = {
  PAID: "Queued",
  GENERATING: "Generating",
  READY: "Ready",
  SHARED: "Shared",
  EXPIRED: "Expired",
};

type Row = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function tierLabel(tier: string): string {
  if (tier === "investor-memo") return "Investor memo";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

async function loadWeeklyItems(
  scope: ProjectScope | null,
  user: { id: string; email: string },
): Promise<ReportListItem[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  try {
    const accountId = await resolveSVIAccountIdForPage(scope, user);
    if (!accountId) return [];
    const { data } = await sb
      .from("svi_snapshots")
      .select("id, snapshot_date, svi_total, delta")
      .eq("account_id", accountId)
      .order("snapshot_date", { ascending: false })
      .limit(12);
    const items: ReportListItem[] = [];
    for (const row of (data ?? []) as Row[]) {
      const id = str(row.id);
      const date = str(row.snapshot_date);
      if (!id || !date) continue;
      const total = num(row.svi_total);
      const delta = num(row.delta);
      const deltaText = delta === null ? "" : ` (${delta >= 0 ? "+" : ""}${delta})`;
      items.push({
        key: `weekly:${id}`,
        kind: "weekly",
        title: "Weekly SVI report",
        date,
        // Each row lands on its own snapshot line (anchor), not the tab root.
        href: `/workspace/reports/weekly#snapshot-${encodeURIComponent(id)}`,
        meta: total === null ? undefined : `SVI ${total}${deltaText}`,
      });
    }
    return items;
  } catch {
    return [];
  }
}

interface OrderRow {
  id: string;
  status: string;
  date: string;
  reportId: string | null;
}

async function loadOrderRows(userId: string): Promise<OrderRow[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  try {
    // Columns are a subset of ORDER_SELECT_COLUMNS (lib/paywall/report-delivery)
    // plus created_at — all defined in 0270_report_orders.sql.
    const { data } = await sb
      .from("report_orders")
      .select("id, status, created_at, paid_at, generated_at, report_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const rows: OrderRow[] = [];
    for (const row of (data ?? []) as Row[]) {
      const id = str(row.id);
      const status = str(row.status);
      if (!id || !status || !LISTED_ORDER_STATES.has(status)) continue;
      const date = str(row.generated_at) ?? str(row.paid_at) ?? str(row.created_at);
      if (!date) continue;
      rows.push({ id, status, date, reportId: str(row.report_id) });
    }
    return rows;
  } catch {
    return [];
  }
}

async function loadCLevelItems(projectId: string | null): Promise<ReportListItem[]> {
  const sb = getSupabaseAdmin();
  if (!sb || !projectId) return [];
  const perRole = await Promise.all(
    C_LEVEL_ROLES.map(async (cfg): Promise<ReportListItem | null> => {
      try {
        // Same filters as c-level/page.tsx loadTrendForRole, latest row only.
        const { data, error } = await sb
          .from("clevel_trend_snapshots")
          .select("id, snapshot_date, week_number")
          .eq("project_id", projectId)
          .eq("role", cfg.role)
          .order("snapshot_date", { ascending: false })
          .limit(1);
        if (error || !data) return null;
        const row = (data as Row[])[0];
        if (!row) return null;
        const date = str(row.snapshot_date);
        if (!date) return null;
        const week = num(row.week_number);
        return {
          key: `c-level:${cfg.role}:${str(row.id) ?? date}`,
          kind: "c-level",
          title: cfg.title,
          date,
          href: `/workspace/reports/c-level/${cfg.role}`,
          meta: week === null ? undefined : `Week ${week}`,
        };
      } catch {
        return null;
      }
    }),
  );
  return perRole.filter((item): item is ReportListItem => item !== null);
}

/**
 * Union of every report artefact for the signed-in founder, newest first.
 *
 * Sources: svi_snapshots (weekly, OWNER-keyed via the page scope),
 * report_orders (Trust Business Report, caller-keyed), assembled_reports
 * not already represented by an order (caller-keyed), investor_pack_shares
 * (caller-keyed) and the latest clevel_trend_snapshots per role
 * (project-keyed). LP reports are not persisted, so none are listed.
 */
export async function loadAllReports(
  user: { id: string; email: string },
  scope: ProjectScope | null,
): Promise<ReportListItem[]> {
  const [weekly, archive, orders, cLevel] = await Promise.all([
    loadWeeklyItems(scope, user),
    loadArchive(user.id),
    loadOrderRows(user.id),
    loadCLevelItems(scope?.projectId ?? null),
  ]);

  const items: ReportListItem[] = [...weekly, ...cLevel];

  const orderedReportIds = new Set<string>();
  for (const order of orders) {
    if (order.reportId) orderedReportIds.add(order.reportId);
    items.push({
      key: `order:${order.id}`,
      kind: "business",
      title: "Trusted Business Report",
      date: order.date,
      href: reportOrderPath(order.id),
      meta: ORDER_STATUS_META[order.status],
    });
  }

  for (const report of archive.assembledReports) {
    if (orderedReportIds.has(report.id)) continue;
    items.push({
      key: `assembled:${report.id}`,
      kind: "business",
      title: `${report.startup_name} — assembled report`,
      date: report.created_at,
      href: `/workspace/reports/${report.analysis_id ?? report.id}`,
      meta: report.word_count > 0
        ? `${tierLabel(report.tier)} · ${report.word_count.toLocaleString("en-AU")} words`
        : tierLabel(report.tier),
    });
  }

  for (const pack of archive.investorPacks) {
    items.push({
      key: `pack:${pack.id}`,
      kind: "investor-pack",
      title: "Investor pack",
      date: pack.created_at,
      href: pack.is_expired ? "/workspace/reports/investor-pack" : pack.download_url,
      meta: pack.is_expired ? "Expired" : "Download PDF",
      download: !pack.is_expired,
    });
  }

  return items.sort((a, b) => timeOf(b.date) - timeOf(a.date));
}
