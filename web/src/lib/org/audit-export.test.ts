// G21 P3-B — organisation audit export: window parsing (defaults, cap,
// inversion), CSV-injection safety on every cell, the stream (header first,
// paging on id desc until a short page, onDone with the count).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const auditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => auditMock(...(a as [])) }));

import type { AuditEventRow } from "@/lib/audit/events";
import { AUDIT_CSV_HEADER, EXPORT_DEFAULT_DAYS, auditRowToCsvLine, parseExportWindow, recordAuditExport, streamOrgAuditCsv } from "./audit-export";

const NOW = new Date("2026-09-21T00:00:00.000Z");

describe("parseExportWindow", () => {
  it("defaults to the last 90 days ending now", () => {
    const r = parseExportWindow(null, null, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.window.to).toBe("2026-09-21T00:00:00.000Z");
      expect(r.window.from).toBe("2026-06-23T00:00:00.000Z");
      expect(r.window.days).toBe(EXPORT_DEFAULT_DAYS);
    }
  });
  it("accepts ISO days, refuses garbage, inversion and windows over 366 days", () => {
    const ok = parseExportWindow("2026-01-01", "2026-03-01", NOW);
    expect(ok).toMatchObject({ ok: true, window: { from: "2026-01-01T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z", days: 59 } });
    expect(parseExportWindow("yesterday", null, NOW)).toMatchObject({ ok: false });
    expect(parseExportWindow("2026-03-01", "2026-01-01", NOW)).toMatchObject({ ok: false, message: "from must be before to." });
    expect(parseExportWindow("2025-01-01", "2026-09-01", NOW).ok).toBe(false);
    expect(parseExportWindow(null, "2026-13-40", NOW).ok).toBe(false);
  });
});

function row(id: number, over: Partial<AuditEventRow> = {}): AuditEventRow {
  return { id, ts: "2026-09-12T00:00:00.000Z", user_id: "u1", actor: "user", action: "cohort.snapshot", resource_type: "batch", resource_id: "b1", detail: { method: "POST", route: "/api/x", status: 201 }, ...over };
}

describe("CSV safety", () => {
  it("prefixes cells starting with = + - @ or a tab with an apostrophe and quotes commas / quotes / newlines", () => {
    const line = auditRowToCsvLine(row(7, { action: "=HYPERLINK(\"x\")", resource_id: "+1", actor: "-cmd", detail: { route: "@import", method: "a,b", status: 'say "hi"' } }));
    const cells = line.split(",");
    expect(cells[6]).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(cells[8]).toBe("'+1");
    expect(cells[3]).toBe("'-cmd");
    expect(line).toContain("'@import");
    expect(line).toContain('"a,b"');
    expect(line).toContain('"say ""hi"""');
    expect(auditRowToCsvLine(row(1, { detail: { route: "\tTab" } }))).toContain("'\tTab");
  });
});

describe("streamOrgAuditCsv", () => {
  async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
    return new Response(stream).text();
  }

  it("emits the header, pages on id desc until a short page, and reports the row count to onDone", async () => {
    const calls: Array<{ beforeId: number | null; limit: number }> = [];
    const page = vi.fn(async ({ beforeId, limit }: { beforeId: number | null; limit: number }) => {
      calls.push({ beforeId, limit });
      if (beforeId === null) return [row(5), row(4)];
      if (beforeId === 4) return [row(3)];
      return [];
    });
    const onDone = vi.fn();
    const text = await drain(streamOrgAuditCsv(["u1"], { from: "2026-06-01T00:00:00.000Z", to: "2026-09-21T00:00:00.000Z", days: 112 }, { page, onDone, pageSize: 2 }));
    const lines = text.trimEnd().split("\r\n");
    expect(lines[0]).toBe(AUDIT_CSV_HEADER);
    expect(lines).toHaveLength(4);
    expect(lines[1]!.startsWith("5,")).toBe(true);
    expect(lines[3]!.startsWith("3,")).toBe(true);
    expect(calls).toEqual([{ beforeId: null, limit: 2 }, { beforeId: 4, limit: 2 }]);
    expect(onDone).toHaveBeenCalledWith(3);
  });

  it("an empty organisation still gets the header and onDone(0)", async () => {
    const onDone = vi.fn();
    const text = await drain(streamOrgAuditCsv([], { from: "a", to: "b", days: 1 }, { page: async () => [], onDone }));
    expect(text).toBe(`${AUDIT_CSV_HEADER}\r\n`);
    expect(onDone).toHaveBeenCalledWith(0);
  });

  it("recordAuditExport writes org.audit.exported with the window + counts and never throws", async () => {
    await recordAuditExport({ id: "u1" }, "org-1", { from: "a", to: "b", days: 90 }, 12, 3);
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "org.audit.exported", resource_type: "investor_organisation", resource_id: "org-1", detail: { from: "a", to: "b", days: 90, rows: 12, seats: 3 } }));
    auditMock.mockRejectedValueOnce(new Error("down"));
    await expect(recordAuditExport({ id: "u1" }, "org-1", { from: "a", to: "b", days: 90 }, 0, 1)).resolves.toBeUndefined();
  });
});
