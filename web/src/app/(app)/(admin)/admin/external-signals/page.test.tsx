// Colocated test for /admin/external-signals (G14-S40): the view renders the
// six catalogue sources with licence + attribution, labels cite-only rows,
// shows the last-run summary table + raw JSON, and the "table missing"
// banner when external_sources is unreadable. The loader is exercised with
// a fake client + a temp root for the summary file.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { darkSurfaceOffences } from "@/design/light-markup";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("server-only", () => ({}));

import { EXTERNAL_SOURCE_CATALOG } from "@/lib/signals/external-sources";
import { loadExternalSignalsAdmin, readIngestSummary, type ExternalSignalsAdminData, type IngestSummary } from "@/lib/signals/external-signals-admin";
import { ExternalSignalsAdminView } from "./external-signals-view";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const SUMMARY: IngestSummary = {
  ok: true,
  dry: false,
  ran_at: "2026-09-13T03:00:12.000Z",
  db: true,
  allow_set_size: 41,
  sources: [
    { id: "business-gov-grants", status: "ok", licence: "CC BY 3.0 AU", file: "/data/grants.csv", parsed: 2200, kept: 2100, filtered_out: 100, duplicates: 900, inserted: 1200, row_count: 1200, error: null },
    { id: "rdti-transparency", status: "ok", licence: "CC BY 2.5 AU", file: "/data/rdti.csv", parsed: 13135, kept: 13128, filtered_out: 7, duplicates: 13128, inserted: 0, row_count: 13128, error: null },
    { id: "abr-bulk", status: "skipped", licence: "CC BY 3.0 AU", file: null, parsed: 0, kept: 0, filtered_out: 0, duplicates: 0, inserted: 0, row_count: null, error: "no input file" },
  ],
  totals: { parsed: 15335, kept: 15228, inserted: 1200, duplicates: 14028, refused: 0, errors: 0 },
  error: null,
};

function data(over: Partial<ExternalSignalsAdminData> = {}): ExternalSignalsAdminData {
  return {
    sources: EXTERNAL_SOURCE_CATALOG.map((s) => (s.id === "rdti-transparency" ? { ...s, row_count: 13128, last_fetched_at: "2026-09-13T03:00:12.000Z" } : s)),
    fromDb: true,
    sourcesError: null,
    counts: { "rdti-transparency": { rdti_registration: 13128 }, "business-gov-grants": { grant_award: 1200 } },
    totalRows: 14328,
    distinctAbns: null,
    summary: SUMMARY,
    summaryError: null,
    historyLines: 2,
    ...over,
  };
}

describe("ExternalSignalsAdminView", () => {
  it("renders every source with licence, attribution (verbatim) and status; cite-only rows are labelled and never counted", async () => {
    const out = await html(<ExternalSignalsAdminView data={data()} />);
    expect(darkSurfaceOffences(out), "G26 light template").toEqual([]);
    expect(out).toContain("<h1");
    expect(out).toContain("External signals");
    expect((out.match(/data-source-id="/g) ?? []).length).toBe(EXTERNAL_SOURCE_CATALOG.length);
    for (const s of EXTERNAL_SOURCE_CATALOG) {
      expect(out).toContain(`data-source-id="${s.id}" data-source-status="${s.status}"`);
      expect(out).toContain(esc(s.attribution_text));
      expect(out).toContain(esc(s.licence));
    }
    expect(out).toContain("never ingested — cited with a link only");
    expect(out).toContain("rdti_registration 13,128");
    expect(out).toContain('data-testid="external-signals-total">14,328<');
    expect(out).not.toContain('data-testid="external-signals-table-missing"');
  });

  it("shows the last run table + raw JSON, and the no-run state when the summary is absent", async () => {
    const out = await html(<ExternalSignalsAdminView data={data()} />);
    expect(out).toContain('data-testid="external-signals-last-run"');
    expect(out).toContain("2026-09-13 03:00 UTC");
    expect(out).toContain("1,200");
    expect(out).toContain("no input file");
    expect(out).toContain('data-testid="external-signals-summary-json"');
    expect(out).toContain(esc('"allow_set_size": 41'));
    const none = await html(<ExternalSignalsAdminView data={data({ summary: null, summaryError: "no run yet", historyLines: 0 })} />);
    expect(none).toContain('data-testid="external-signals-no-run"');
    expect(none).toContain("no run yet");
  });

  it("table missing → banner with the migration hint, catalogue rows still listed", async () => {
    const out = await html(<ExternalSignalsAdminView data={data({ fromDb: false, sourcesError: "table missing (apply 0410)", counts: {}, totalRows: 0 })} />);
    expect(out).toContain('data-testid="external-signals-table-missing"');
    expect(out).toContain("0410_external_signals.sql");
    expect((out.match(/data-source-id="/g) ?? []).length).toBe(7);
  });
});

describe("loadExternalSignalsAdmin / readIngestSummary", () => {
  it("reads the summary file from the root (absent → error string, garbage → error string)", () => {
    const root = mkdtempSync(join(tmpdir(), "ext-admin-"));
    expect(readIngestSummary(root)).toMatchObject({ summary: null, historyLines: 0 });
    expect(readIngestSummary(root).error).toMatch(/no run yet/);
    const dir = join(root, "content", "reports");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "external-signals-latest.json"), JSON.stringify(SUMMARY));
    writeFileSync(join(dir, "external-signals-history.jsonl"), "{}\n{}\n");
    const ok = readIngestSummary(root);
    expect(ok.summary?.allow_set_size).toBe(41);
    expect(ok.historyLines).toBe(2);
    writeFileSync(join(dir, "external-signals-latest.json"), "not json");
    expect(readIngestSummary(root).summary).toBeNull();
  });

  it("with a live client: per-source per-type head counts, cite-only skipped; a 42P01 client → catalogue + zero counts", async () => {
    const root = mkdtempSync(join(tmpdir(), "ext-admin-"));
    const calls: string[] = [];
    const live = {
      from(table: string) {
        const state: { source?: string; type?: string } = {};
        const chain = {
          select: () => chain,
          order: () => chain,
          eq: (col: string, v: string) => {
            if (col === "source_id") state.source = v;
            if (col === "signal_type") state.type = v;
            return chain;
          },
          then: (res: (v: unknown) => unknown) => {
            if (table === "external_sources") return Promise.resolve({ data: EXTERNAL_SOURCE_CATALOG.map((s) => ({ ...s })), error: null }).then(res);
            calls.push(`${state.source}:${state.type}`);
            const count = state.source === "rdti-transparency" && state.type === "rdti_registration" ? 13128 : state.source === "business-gov-grants" && state.type === "grant_award" ? 1200 : 0;
            return Promise.resolve({ count, data: null, error: null }).then(res);
          },
        };
        return chain;
      },
    };
    const d = await loadExternalSignalsAdmin(live, root);
    expect(d.fromDb).toBe(true);
    expect(d.counts).toEqual({ "abr-bulk": {}, "business-gov-grants": { grant_award: 1200 }, "rdti-transparency": { rdti_registration: 13128 }, "funding-announcements": {} });
    expect(d.totalRows).toBe(14328);
    expect(calls.some((c) => c.startsWith("cut-through-venture"))).toBe(false);
    const missing = { from: () => { const chain = { select: () => chain, order: () => chain, then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "42P01", message: "x" } }).then(res) }; return chain; } };
    const m = await loadExternalSignalsAdmin(missing, root);
    expect(m.fromDb).toBe(false);
    expect(m.sourcesError).toBe("table missing (apply 0410)");
    expect(m.sources).toHaveLength(7); // 0410's six + the G24-B funding-announcements feed (0435)
    expect(m.totalRows).toBe(0);
  });
});
