// Investor Dossier — G34 RQ25 mandate fit + RQ26 triage verdict (evaluator
// only; server component, no client JS). "Mandate fit: stage ✓ · sector ✓ ·
// ticket ✗ · geography ✓" from the viewer's primary mandate (the one fit-v2
// scorer), then the triage relabel — Read further / Needs more evidence /
// Outside mandate — with the rule that produced it and what the report says
// is missing (dashboard-v4 red flags, pending dimensions, un-evidenced key
// metrics). Never a second investment conclusion; the loader builds
// `triage` for the assessor role alone, and the page renders it only then.

import Link from "next/link";
import { AXIS_GLYPH, AXIS_STATUS_LABEL, type EvaluatorTriage, type TriageVerdict } from "@/lib/evaluations/triage-verdict";

const VERDICT_TONE: Record<TriageVerdict, string> = {
  read_further: "border-l-action",
  needs_evidence: "border-l-warn",
  outside_mandate: "border-l-bear",
};
const VERDICT_GLYPH: Record<TriageVerdict, string> = { read_further: "●", needs_evidence: "◐", outside_mandate: "○" };
const MISSING_MAX = 8;

export function TriageBlock({ triage, requestHref }: { triage: EvaluatorTriage; /** The dossier's existing evidence-request CTA (block 3), when the consent tier can still be raised. */ requestHref?: string | null }) {
  const missing = triage.missing.slice(0, MISSING_MAX);
  const more = triage.missing.length - missing.length;
  return (
    <section aria-labelledby="dossier-triage" className="rounded-2xl border border-surface-200 bg-surface p-5 sm:p-6" data-testid="dossier-triage" data-verdict={triage.verdict}>
      <h2 id="dossier-triage" className="text-lg font-semibold text-ink-900">
        Triage for your mandate
      </h2>

      <p className="mt-2 text-sm text-ink-700" data-testid="triage-mandate">
        <span className="font-medium text-ink-900">Mandate fit: </span>
        {triage.mandate && triage.mandate.axes.length > 0 ? (
          <>
            {triage.mandate.axes.map((a, i) => (
              <span key={a.key} data-axis={a.key} data-status={a.status} title={a.note ?? undefined}>
                {i > 0 ? " · " : ""}
                {a.label} <span aria-hidden="true">{AXIS_GLYPH[a.status]}</span>
                <span className="sr-only"> {AXIS_STATUS_LABEL[a.status]}</span>
              </span>
            ))}
            <span className="ml-2 text-xs text-ink-500">({triage.mandate.label})</span>
          </>
        ) : triage.mandate ? (
          <span className="text-xs text-ink-500">{triage.mandate.label} — no axis breakdown available</span>
        ) : (
          <Link href="/workspace/investor/mandate" className="text-xs text-action hover:underline">
            Set your mandate
          </Link>
        )}
      </p>

      <div className={`mt-3 rounded-r-lg border-l-4 bg-surface-sunken px-4 py-3 ${VERDICT_TONE[triage.verdict]}`}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-ink-900" data-testid="triage-verdict">
            <span aria-hidden="true">{VERDICT_GLYPH[triage.verdict]}</span>
            {triage.verdictLabel}
          </span>
          <span className="text-xs text-ink-500" data-testid="triage-rule">
            Rule: {triage.rule}
          </span>
        </p>
        {missing.length > 0 ? (
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Still missing</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-700" data-testid="triage-missing">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {more > 0 ? <p className="mt-1 text-xs text-ink-500">+{more} more in the report</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-600">No rule-derived gap recorded; this does not establish an absence of risk.</p>
        )}
        {requestHref && triage.verdict === "needs_evidence" ? (
          <a href={requestHref} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-action hover:underline" data-testid="triage-request-evidence">
            Request evidence from founder ↓
          </a>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-ink-500" data-testid="triage-note">
        {triage.note}
      </p>
    </section>
  );
}
