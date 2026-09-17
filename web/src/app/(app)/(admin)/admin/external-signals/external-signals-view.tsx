// /admin/external-signals — the open-register allow-list and ingest state
// (G14-S40). Pure view: the page loads `ExternalSignalsAdminData` and the
// colocated test renders this with fixtures.

import Link from "next/link";

import type { ExternalSignalsAdminData } from "@/lib/signals/external-signals-admin";

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  cite_only: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  disabled: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
};

function Badge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? STATUS_TONE.disabled}`}>{status}</span>;
}

const n = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-AU") : "n/a");
const when = (iso: string | null | undefined): string => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "never");

export function ExternalSignalsAdminView({ data }: { data: ExternalSignalsAdminData }) {
  const { sources, fromDb, sourcesError, counts, totalRows, summary, summaryError, historyLines } = data;
  const ingestable = sources.filter((s) => s.status !== "cite_only");
  const citeOnly = sources.filter((s) => s.status === "cite_only");
  return (
    <div className="min-h-svh bg-neutral-50 px-4 py-8 dark:bg-neutral-950" data-testid="admin-external-signals">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">CDO · open AU data</p>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">External signals</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-500 dark:text-neutral-400">
              The licence-gated allow-list behind <code>external_signals</code> (migration 0410). Weekly ingest Sat 03:00 UTC via
              <code> scripts/external-signals/ingest.mjs</code>; a source is ingested only while its row is <code>active</code> with a licence — <code>cite_only</code> rows are
              refused by the CLI. Register rows reach reports at <code>connected_source</code> (S36 cap) for projects with a verified ABN, and feed the register cohort when a
              stage has fewer than 20 scored startups.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/methodology" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
              /methodology
            </Link>
            <Link href="/admin" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
              Admin home
            </Link>
          </div>
        </header>

        {!fromDb ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-testid="external-signals-table-missing">
            <p className="font-medium">external_sources not readable — {sourcesError ?? "unknown"}. Showing the code catalogue.</p>
            <p className="mt-1">
              Apply <code>web/supabase/migrations/0410_external_signals.sql</code> (<code>scripts/db/apply-migration.sh</code>), then run the first ingest (docs/ops/data-sources.md).
            </p>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Register rows</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50" data-testid="external-signals-total">{n(totalRows)}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">across {ingestable.length} ingestable sources · target ≥ 2,000</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Last run</p>
            <p className="mt-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">{summary ? when(summary.ran_at) : "never"}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{summary ? (summary.ok ? "ok" : "errors") + (summary.dry ? " · dry" : "") : (summaryError ?? "")}</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Last run inserted</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{summary ? n(summary.totals.inserted) : "n/a"}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{summary ? `${n(summary.totals.duplicates)} duplicates · ${n(summary.totals.refused)} refused` : "no summary"}</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Allow-set · runs</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{summary ? n(summary.allow_set_size) : "n/a"}</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">ABNs in the ABR allow-set · {n(historyLines)} runs logged</p>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">Sources {fromDb ? "(external_sources)" : "(code catalogue)"}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" data-testid="external-signals-sources">
              <thead className="text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                <tr>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Licence</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Cadence</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Last fetched</th>
                  <th className="py-2 pr-3 text-right">Rows</th>
                  <th className="py-2 pr-3">By signal type</th>
                </tr>
              </thead>
              <tbody className="text-neutral-800 dark:text-neutral-100">
                {[...ingestable, ...citeOnly].map((s) => (
                  <tr key={s.id} className="border-t border-neutral-100 align-top dark:border-neutral-800" data-source-id={s.id} data-source-status={s.status}>
                    <td className="py-2 pr-3">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-dotted">
                        {s.name}
                      </a>
                      <p className="mt-1 max-w-md text-xs text-neutral-500 dark:text-neutral-400">{s.attribution_text}</p>
                      <p className="mt-1 font-mono text-[11px] text-neutral-400">{s.id}</p>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{s.licence}</td>
                    <td className="py-2 pr-3">
                      <Badge status={s.status} />
                    </td>
                    <td className="py-2 pr-3">{s.cadence ?? "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{s.status === "cite_only" ? "—" : when(s.last_fetched_at)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.status === "cite_only" ? "—" : n(s.row_count)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {s.status === "cite_only"
                        ? "never ingested — cited with a link only"
                        : Object.entries(counts[s.id] ?? {})
                            .map(([t, c]) => `${t} ${n(c)}`)
                            .join(" · ") || "no rows"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">Last ingest summary</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            <code>content/reports/external-signals-latest.json</code> as the CLI wrote it. Re-run by hand from <code>web/</code>: <code>node scripts/external-signals/ingest.mjs --dry</code>.
          </p>
          {summary ? (
            <>
              <table className="mt-3 w-full text-sm" data-testid="external-signals-last-run">
                <thead className="text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Parsed</th>
                    <th className="py-2 pr-3 text-right">Kept</th>
                    <th className="py-2 pr-3 text-right">Dupes</th>
                    <th className="py-2 pr-3 text-right">Inserted</th>
                    <th className="py-2 pr-3">Note</th>
                  </tr>
                </thead>
                <tbody className="text-neutral-800 dark:text-neutral-100">
                  {summary.sources.map((s) => (
                    <tr key={s.id} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="py-1.5 pr-3 font-mono text-xs">{s.id}</td>
                      <td className="py-1.5 pr-3">{s.status}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{n(s.parsed)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{n(s.kept)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{n(s.duplicates)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{n(s.inserted)}</td>
                      <td className="py-1.5 pr-3 text-xs text-neutral-500 dark:text-neutral-400">{s.error ?? s.file ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400">Raw JSON</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] leading-relaxed text-neutral-100" data-testid="external-signals-summary-json">
                  {JSON.stringify(summary, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400" data-testid="external-signals-no-run">{summaryError ?? "No run recorded yet."}</p>
          )}
        </section>
      </div>
    </div>
  );
}
