// /showcase/atlassian/data-room — Step 6 of the Atlassian walkthrough.
//
// Renders all 65 ATLASSIAN_DEMO.dataRoomRows[], grouped by the same 12
// numbered folders as DATA_ROOM_STRUCTURE in lib/data-room-templates.ts.
// Each row shows a status pill (present/redacted/inferred), phase badge,
// optional version + source link. A top KPI strip summarises totals and
// counts the Atlassian S-1 exhibits mapped, and a legend documents the
// pill colours.
//
// Plain server component — no Supabase, no cookies, no I/O.

import type { Metadata } from "next";
import Link from "next/link";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import {
  ATLASSIAN_DEMO,
  PHASE_DISPLAY_NAMES,
  type DataRoomRow,
} from "@/lib/showcase/atlassian/fixture";

export const metadata: Metadata = {
  title: "Investor data-room mirror — Atlassian demo — Step 6 — BlockID",
  description:
    "The 12-section BlockID data-room structure filled with Atlassian's public S-1 and 10-K disclosures, with redacted / inferred stubs where the private paperwork is unavailable.",
};

// Folder ordering mirrors DATA_ROOM_STRUCTURE in
// web/src/lib/data-room-templates.ts. Kept as a constant so we don't have
// to import the entire (heavy) templates module just to render a list.
const FOLDER_ORDER = [
  "1. Corporate & Legal",
  "2. Cap Table & Equity",
  "3. Financial Projections",
  "4. Product & Technology",
  "5. Market & Traction",
  "6. Team & Advisors",
  "7. IP & Compliance",
  "8. Contracts & Agreements",
  "9. Strategy & Roadmap",
  "10. References & Due Diligence",
  "11. Tax (AU)",
  "12. AU Compliance",
];

// Master source citation for the whole data-room mirror.
const ATLASSIAN_S1_SEC_URL =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001650372&type=S-1&dateb=&owner=include&count=40";

const STATUS_COPY: Record<
  DataRoomRow["status"],
  { label: string; pill: string; description: string }
> = {
  present: {
    label: "Present",
    pill: "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40",
    description:
      "A public source (S-1, 10-K, press release, ASIC extract, etc.) exists and is cited.",
  },
  redacted: {
    label: "Redacted",
    pill: "bg-amber-500/20 text-amber-200 border border-amber-400/40",
    description:
      "The document exists in Atlassian's data room but is private — a source URL confirms the round or event.",
  },
  inferred: {
    label: "Inferred",
    pill: "bg-sky-500/20 text-sky-200 border border-sky-400/40",
    description:
      "Reconstructed from context — the document is standard for the phase but not directly cited in public disclosures.",
  },
};

function statusPill(status: DataRoomRow["status"]) {
  const meta = STATUS_COPY[status];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}
    >
      {meta.label}
    </span>
  );
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export default function AtlassianDataRoomPage() {
  const rows = ATLASSIAN_DEMO.dataRoomRows;
  const total = rows.length;
  const presentN = rows.filter((r) => r.status === "present").length;
  const redactedN = rows.filter((r) => r.status === "redacted").length;
  const inferredN = rows.filter((r) => r.status === "inferred").length;
  // S-1 exhibit rows: any row whose source URL points at the SEC's EDGAR
  // for Atlassian, or which explicitly references the S-1 in the title.
  const s1MappedN = rows.filter(
    (r) =>
      /sec\.gov/i.test(r.sourceUrl ?? "") ||
      /\bS-1\b/.test(r.title) ||
      /venturebeat.*atlassian/i.test(r.sourceUrl ?? ""),
  ).length;

  const grouped = FOLDER_ORDER.map((cat) => ({
    category: cat,
    rows: rows.filter((r) => r.category === cat),
  }));

  return (
    <AtlassianWalkthroughProvider stepNumber={6}>
      <div className="min-h-screen bg-surface-50">
        <div className="container mx-auto max-w-6xl p-6">
          <nav className="mb-4 text-sm">
            <Link href="/showcase/atlassian" className="text-brand-700 hover:underline">
              ← Atlassian landing
            </Link>
          </nav>

          <header className="mb-6">
            <h1 className="text-3xl font-semibold text-ink-900">
              Atlassian investor data-room mirror
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-700">
              The 12-section BlockID data-room template, populated with
              Atlassian's actual public disclosures where available (S-1,
              10-K, press releases) and redacted / inferred stubs where the
              private paperwork isn't. This is the shape your own data room
              would take once BlockID's C-Level agents start filling it.
            </p>
          </header>

          <section
            aria-label="Data-room KPIs"
            className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <Kpi label="Total items" value={String(total)} hint="across 12 folders" />
            <Kpi
              label="Present"
              value={pct(presentN, total)}
              hint={`${presentN} of ${total} cited publicly`}
              tone="emerald"
            />
            <Kpi
              label="Redacted"
              value={pct(redactedN, total)}
              hint={`${redactedN} of ${total} confirmed but private`}
              tone="amber"
            />
            <Kpi
              label="Inferred"
              value={pct(inferredN, total)}
              hint={`${inferredN} of ${total} standard for phase`}
              tone="sky"
            />
            <Kpi
              label="S-1 exhibits mapped"
              value={String(s1MappedN)}
              hint="Rows tied to the 2015 IPO S-1"
            />
          </section>

          <section
            aria-label="Status legend"
            className="mb-8 rounded-lg border border-white/10 bg-black/40 p-5"
          >
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-100">
              Status legend
            </h2>
            <ul className="grid gap-3 text-sm sm:grid-cols-3">
              {(Object.keys(STATUS_COPY) as Array<DataRoomRow["status"]>).map(
                (s) => (
                  <li key={s} className="flex items-start gap-3">
                    <span className="shrink-0">{statusPill(s)}</span>
                    <span className="text-ink-200">
                      {STATUS_COPY[s].description}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section className="space-y-6">
            {grouped.map(({ category, rows: bucket }) => (
              <div
                key={category}
                className="rounded-lg border border-white/10 bg-black/40 p-5"
                data-category={category}
              >
                <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink-50">
                    {category}
                  </h3>
                  <span className="text-xs text-ink-300">
                    {bucket.length} item{bucket.length === 1 ? "" : "s"}
                  </span>
                </header>
                {bucket.length === 0 ? (
                  <p className="text-sm italic text-ink-400">
                    No rows in this folder for the Atlassian demo.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {bucket.map((row, ri) => {
                      const phaseNum = Number(row.phaseSlug);
                      const phaseLabel =
                        Number.isFinite(phaseNum) && PHASE_DISPLAY_NAMES[phaseNum]
                          ? `Phase ${phaseNum}`
                          : `Phase ${row.phaseSlug}`;
                      return (
                        <li
                          key={`${category}-${ri}`}
                          className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink-100">{row.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-300">
                              {statusPill(row.status)}
                              <span className="inline-flex items-center rounded bg-white/10 px-2 py-0.5 text-ink-100">
                                {phaseLabel}
                              </span>
                              {row.version && (
                                <span className="inline-flex items-center rounded bg-white/5 px-2 py-0.5 font-mono text-ink-200">
                                  v {row.version}
                                </span>
                              )}
                            </div>
                          </div>
                          {row.sourceUrl && (
                            <a
                              href={row.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-xs text-brand-300 hover:text-brand-200 hover:underline"
                            >
                              source →
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </section>

          <aside className="mt-10 rounded-lg border border-brand-200 bg-brand-50 p-5 text-sm text-brand-900">
            <p className="font-medium">
              In BlockID your data room would auto-populate from these templates
              as you progress through the 12 phases.
            </p>
            <p className="mt-1">
              Try{" "}
              <Link href="/dashboard/data-room" className="underline">
                /dashboard/data-room
              </Link>{" "}
              to see the live version for your own startup.
            </p>
          </aside>

          <footer className="mt-8 text-xs text-ink-500">
            Master source for the public rows in this mirror: Atlassian's
            filings on the SEC EDGAR system —{" "}
            <a
              href={ATLASSIAN_S1_SEC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              SEC EDGAR — Atlassian Corporation (CIK 0001650372)
            </a>
            . Every row that is not marked "inferred" links to the specific
            disclosure it maps to.
          </footer>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "emerald" | "amber" | "sky";
}) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-400/30 bg-emerald-500/5"
      : tone === "amber"
        ? "border-amber-400/30 bg-amber-500/5"
        : tone === "sky"
          ? "border-sky-400/30 bg-sky-500/5"
          : "border-white/10 bg-black/40";
  return (
    <div className={`rounded-lg border p-4 ${toneCls}`}>
      <p className="text-[11px] uppercase tracking-wide text-ink-300">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-50">{value}</p>
      <p className="mt-1 text-[11px] text-ink-300">{hint}</p>
    </div>
  );
}
