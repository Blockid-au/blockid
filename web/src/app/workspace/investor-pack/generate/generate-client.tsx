"use client";

// Investor-pack generator — client half.
//
// Shows a preview strip of what will land in the PDF (project name, SVI grade,
// valuation range, readiness score, section counts) and lets the founder
// override the raise amount + use-of-funds before generation. Submit POSTs to
// /api/investor-pack/generate and pipes the returned blob into a downloadable
// object URL so the user immediately gets the file.

import * as React from "react";
import type { InvestorPackData } from "@/lib/investor-pack-assembler";

interface Props {
  preview: InvestorPackData;
}

function formatAud(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(1)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

function bandLabel(band: string): string {
  if (band === "ready") return "Investor ready";
  if (band === "nearly-ready") return "Nearly ready";
  return "Not yet ready";
}

export function InvestorPackGenerateClient({ preview }: Props): React.ReactElement {
  const [raiseAmount, setRaiseAmount] = React.useState<string>(
    preview.ask.raiseAmountAud > 0 ? String(preview.ask.raiseAmountAud) : "",
  );
  const [useOfFunds, setUseOfFunds] = React.useState<string>("");
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const sections = React.useMemo(
    () => [
      { label: "Cover page", ok: true },
      { label: "One-page summary", ok: true },
      {
        label: `SVI dimensions (${preview.svi.dimensions.length})`,
        ok: preview.svi.dimensions.length > 0,
      },
      {
        label: `Fundraise checklist (${preview.checklist.score}/100)`,
        ok: preview.checklist.score > 0,
      },
      {
        label: `Valuation range (${formatAud(preview.valuation.midAud)} mid)`,
        ok: preview.valuation.midAud > 0,
      },
      {
        label: `AU comparables (${preview.comparables.length})`,
        ok: preview.comparables.length > 0,
      },
      { label: `Team (${preview.team.length})`, ok: preview.team.length > 0 },
      {
        label: `Cap table (${preview.capTable.length})`,
        ok: preview.capTable.length > 0,
      },
      { label: "Contact & disclaimer", ok: true },
    ],
    [preview],
  );

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg(null);
    try {
      const body: Record<string, unknown> = {};
      const parsedRaise = Number(raiseAmount.replace(/[^\d.]/g, ""));
      if (Number.isFinite(parsedRaise) && parsedRaise > 0) {
        body.raiseAmountAud = Math.round(parsedRaise);
      }
      if (useOfFunds.trim().length > 0) {
        body.useOfFunds = useOfFunds.trim();
      }

      const res = await fetch("/api/investor-pack/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let msg = `Generation failed (${res.status})`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          /* not json */
        }
        setErrorMsg(msg);
        setStatus("error");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const nameMatch = /filename="?([^"]+)"?/.exec(disposition);
      a.download = nameMatch?.[1] ?? "investor-pack.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unexpected error");
      setStatus("error");
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-800 dark:text-slate-100">
          Generate investor pack
        </h1>
        <p className="text-sm text-ink-600 dark:text-slate-400 mt-1">
          Assembles your SVI, valuation, fundraise readiness, AU comparables,
          team and cap table into a single PDF you can send to investors.
        </p>
      </div>

      <section
        aria-labelledby="pack-preview"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 mb-4"
      >
        <h2
          id="pack-preview"
          className="text-sm font-semibold text-ink-800 dark:text-slate-100 mb-3"
        >
          What will land in the pack
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Startup
            </dt>
            <dd className="mt-1 text-sm font-semibold text-ink-800 dark:text-slate-100">
              {preview.project.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              SVI
            </dt>
            <dd className="mt-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
              {preview.svi.grade}{" "}
              <span className="text-slate-500 dark:text-slate-400 font-normal">
                · {preview.svi.total}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Valuation
            </dt>
            <dd className="mt-1 text-sm font-semibold text-ink-800 dark:text-slate-100">
              {formatAud(preview.valuation.lowAud)} –{" "}
              {formatAud(preview.valuation.highAud)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Readiness
            </dt>
            <dd className="mt-1 text-sm text-ink-800 dark:text-slate-100">
              {bandLabel(preview.checklist.band)}{" "}
              <span className="text-slate-500 dark:text-slate-400">
                · {preview.checklist.score}/100
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sector
            </dt>
            <dd className="mt-1 text-sm text-ink-800 dark:text-slate-100">
              {preview.project.sector ?? "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cost
            </dt>
            <dd className="mt-1 text-sm text-ink-800 dark:text-slate-100">
              5 credits
            </dd>
          </div>
        </dl>

        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          {sections.map((sec) => (
            <li key={sec.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={
                  sec.ok
                    ? "inline-block h-2 w-2 rounded-full bg-emerald-500"
                    : "inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600"
                }
              />
              <span className={sec.ok ? "" : "text-slate-500 dark:text-slate-400"}>
                {sec.label}
                {sec.ok ? "" : " — will render as “Not yet on file”"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={handleGenerate}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 mb-4"
      >
        <fieldset className="space-y-4" disabled={status === "loading"}>
          <legend className="sr-only">Investor pack overrides</legend>
          <div>
            <label
              htmlFor="raise-amount"
              className="block text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              Raise amount (AUD) — optional
            </label>
            <input
              id="raise-amount"
              name="raiseAmountAud"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1500000"
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-ink-800 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Leave blank to omit an ask; the pack will show &ldquo;Amount
              pending&rdquo;.
            </p>
          </div>
          <div>
            <label
              htmlFor="use-of-funds"
              className="block text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              Use of funds — optional
            </label>
            <textarea
              id="use-of-funds"
              name="useOfFunds"
              rows={3}
              maxLength={1000}
              placeholder="e.g. 40% engineering, 35% GTM, 20% hires, 5% runway"
              value={useOfFunds}
              onChange={(e) => setUseOfFunds(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-ink-800 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Blank falls back to the default splits described in the pack.
            </p>
          </div>
          {errorMsg && (
            <div
              role="alert"
              className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200"
            >
              {errorMsg}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-brand-600 hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {status === "loading" ? "Generating…" : "Generate PDF"}
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              5 credits · downloads immediately.
            </p>
          </div>
        </fieldset>
      </form>

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        General information only. Not financial advice. Comparables from public
        reporting. Prepared by Auschain PTY LTD (ACN 659 615 111, ABN 79 659
        615 111).
      </p>
    </div>
  );
}
