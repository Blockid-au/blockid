// Organisation audit export (G21 P3-B) — the CSV of `audit_events` rows
// written by the organisation's seats (owner + members) inside a window
// (default: the last 90 days), streamed page by page. Cells go through
// `csvCellGuarded` (RFC-4180 + spreadsheet-formula guard: a cell starting
// with `= + - @` or a tab / CR is prefixed with `'`). The export itself is
// recorded as `org.audit.exported` (who, window, rows).
//
//   parseExportWindow(from, to, now)   pure — ISO dates → [from, to] with the
//                                      defaults and a 366-day cap
//   streamOrgAuditCsv(seats, window)   ReadableStream<Uint8Array>: header,
//                                      then pages of 500 rows (id desc)

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AUDIT_CSV_COLUMNS, csvCellGuarded, type AuditEventRow } from "@/lib/audit/events";
import { appendAudit } from "@/lib/audit";

export const EXPORT_DEFAULT_DAYS = 90;
export const EXPORT_MAX_DAYS = 366;
export const EXPORT_PAGE_SIZE = 500;
export const EXPORT_MAX_ROWS = 50_000;

export interface ExportWindow {
  from: string;
  to: string;
  days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIso(v: string | null | undefined): Date | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s)) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `?from=&to=` → a bounded window. Defaults: to = now, from = to − 90 d; the window is capped at 366 d and never inverted. */
export function parseExportWindow(from: string | null | undefined, to: string | null | undefined, now: Date = new Date()): { ok: true; window: ExportWindow } | { ok: false; message: string } {
  const toDate = parseIso(to) ?? now;
  let fromDate = parseIso(from);
  if (from && !fromDate) return { ok: false, message: "from must be an ISO date (YYYY-MM-DD)." };
  if (to && !parseIso(to)) return { ok: false, message: "to must be an ISO date (YYYY-MM-DD)." };
  if (!fromDate) fromDate = new Date(toDate.getTime() - EXPORT_DEFAULT_DAYS * DAY_MS);
  if (fromDate.getTime() > toDate.getTime()) return { ok: false, message: "from must be before to." };
  if (toDate.getTime() - fromDate.getTime() > EXPORT_MAX_DAYS * DAY_MS) return { ok: false, message: `The window is capped at ${EXPORT_MAX_DAYS} days — export in slices.` };
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS));
  return { ok: true, window: { from: fromDate.toISOString(), to: toDate.toISOString(), days } };
}

/** One CSV line (formula-guarded) — the same columns as the project export. */
export function auditRowToCsvLine(r: AuditEventRow): string {
  const d = (r.detail ?? {}) as Record<string, unknown>;
  return [r.id, r.ts, r.user_id, r.actor, d.actor_role ?? "", d.project_id ?? "", r.action, r.resource_type, r.resource_id, d.method ?? "", d.route ?? "", d.status ?? "", d.ua_family ?? ""].map(csvCellGuarded).join(",");
}

export const AUDIT_CSV_HEADER = AUDIT_CSV_COLUMNS.join(",");

export interface PageReader {
  (args: { seats: string[]; window: ExportWindow; beforeId: number | null; limit: number }): Promise<AuditEventRow[]>;
}

async function defaultPage({ seats, window, beforeId, limit }: Parameters<PageReader>[0]): Promise<AuditEventRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin || seats.length === 0) return [];
  let q = admin
    .from("audit_events")
    .select("id, ts, user_id, actor, action, resource_type, resource_id, detail")
    .in("user_id", seats)
    .gte("ts", window.from)
    .lte("ts", window.to)
    .order("id", { ascending: false })
    .limit(limit);
  if (beforeId != null) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) {
    console.error("[blockid:org-audit-export] page failed", { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as AuditEventRow[];
}

/**
 * Stream the CSV: header first, then pages keyed on `id` descending until a
 * short page, EXPORT_MAX_ROWS or an empty seat list. `onDone(rows)` fires
 * once the stream closes (the route records the audit row with the count).
 */
export function streamOrgAuditCsv(seats: string[], window: ExportWindow, opts: { page?: PageReader; onDone?: (rows: number) => void | Promise<void>; pageSize?: number } = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const page = opts.page ?? defaultPage;
  const size = Math.max(1, Math.min(EXPORT_PAGE_SIZE, opts.pageSize ?? EXPORT_PAGE_SIZE));
  let beforeId: number | null = null;
  let rows = 0;
  let headerSent = false;
  let done = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        controller.enqueue(enc.encode(`${AUDIT_CSV_HEADER}\r\n`));
        headerSent = true;
        return;
      }
      if (done) {
        controller.close();
        return;
      }
      const batch = await page({ seats, window, beforeId, limit: size });
      if (batch.length > 0) {
        controller.enqueue(enc.encode(batch.map(auditRowToCsvLine).join("\r\n") + "\r\n"));
        rows += batch.length;
        beforeId = batch[batch.length - 1]!.id;
      }
      if (batch.length < size || rows >= EXPORT_MAX_ROWS) {
        done = true;
        try {
          await opts.onDone?.(rows);
        } catch {
          /* the export never fails on the ledger */
        }
        controller.close();
      }
    },
  });
}

/** The audit row for the export itself. Never throws. */
export async function recordAuditExport(actor: { id: string }, orgId: string, window: ExportWindow, rows: number, seats: number): Promise<void> {
  try {
    await appendAudit({
      user_id: actor.id,
      actor: "user",
      action: "org.audit.exported",
      resource_type: "investor_organisation",
      resource_id: orgId,
      detail: { from: window.from, to: window.to, days: window.days, rows, seats },
    });
  } catch (err) {
    console.error("[blockid:org-audit-export] audit append failed", err instanceof Error ? err.message : err);
  }
}
