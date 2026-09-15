"use client";

// InputEchoPanel — "What we read" (S32-B).
//
// The founder's complaint on 2026-09-15 was that the result did not show the
// full information they had entered. This table is the answer: every fact
// BlockID parsed from the input, each with its source ("from slide 3", "from
// your text", "from https://…"), and a plain "not provided" row where nothing
// was found — so a low score can be read as "you did not tell us" before it
// is read as "you are weak".
//
// Pure presentation over an `InputEcho` (lib/analyses/input-echo.ts). It can
// be fed the echo from the poll endpoint or built client-side from the
// intake with `buildInputEcho` — same object either way.

import * as React from "react";
import { CheckCircle2, CircleDashed, FileText } from "lucide-react";

import type { InputEcho } from "@/lib/analyses/input-echo";
import { cn } from "@/lib/utils";

export interface InputEchoPanelProps {
  echo: InputEcho;
  className?: string;
}

export function InputEchoPanel({ echo, className }: InputEchoPanelProps) {
  const [showClaims, setShowClaims] = React.useState(false);
  return (
    <section
      aria-labelledby="input-echo-heading"
      className={cn("rounded-2xl border border-line-subtle bg-surface-raised p-4 sm:p-5", className)}
      data-testid="analyze-input-echo"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="input-echo-heading" className="text-sm font-semibold text-primary">
          What we read
        </h2>
        <p className="text-xs text-muted" data-testid="analyze-input-echo-count">
          {echo.provided} of {echo.total} facts found · {echo.chars.toLocaleString("en-AU")} characters read
          {echo.truncated ? " (first 65,000 scored)" : ""}
        </p>
      </div>
      <p className="mt-1 text-xs text-secondary">
        Every row below is a fact taken from your input, with where it came from. A row marked{" "}
        <span className="font-medium text-warn">not provided</span> is the cheapest score improvement you have —
        add it and re-run.
      </p>

      <dl className="mt-4 divide-y divide-line-subtle">
        {echo.rows.map((row) => (
          <div key={row.key} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[130px_1fr] sm:gap-4" data-testid={`analyze-echo-${row.key}`}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary">
              {row.value ? (
                <CheckCircle2 aria-hidden strokeWidth={2} className="h-3.5 w-3.5 text-bull" />
              ) : (
                <CircleDashed aria-hidden strokeWidth={2} className="h-3.5 w-3.5 text-warn" />
              )}
              {row.label}
            </dt>
            <dd className="min-w-0">
              {row.value ? (
                <>
                  <p className="break-words text-sm text-primary">{row.value}</p>
                  {row.source && <p className="text-[11px] text-muted">{row.source}</p>}
                </>
              ) : (
                <>
                  <p className="text-sm italic text-warn">Not provided</p>
                  <p className="text-[11px] text-muted">{row.hint}</p>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {echo.slideTitles.length > 0 && (
        <div className="mt-4" data-testid="analyze-echo-slides">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary">
            <FileText aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
            Deck slides read
          </p>
          <ol className="mt-1.5 flex flex-wrap gap-1.5">
            {echo.slideTitles.map((s) => (
              <li key={s.n} className="rounded-md border border-line-subtle bg-surface px-2 py-0.5 text-[11px] text-secondary">
                <span className="font-mono text-tertiary">{s.n}</span> {s.title}
              </li>
            ))}
          </ol>
        </div>
      )}

      {echo.claims.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowClaims((v) => !v)}
            className="text-xs font-semibold text-action hover:underline"
            aria-expanded={showClaims}
            data-testid="analyze-echo-claims-toggle"
          >
            {showClaims ? "Hide" : "Show"} the {echo.claims.length} claim{echo.claims.length === 1 ? "" : "s"} with numbers we found
          </button>
          {showClaims && (
            <ul className="mt-2 space-y-1.5" data-testid="analyze-echo-claims">
              {echo.claims.map((c, i) => (
                <li key={`${c.source}-${i}`} className="text-xs text-secondary">
                  “{c.text}” <span className="text-muted">— {c.source}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {echo.warnings.length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="analyze-echo-warnings">
          {echo.warnings.map((w) => (
            <li key={w} className="text-[11px] text-warn">
              {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default InputEchoPanel;
