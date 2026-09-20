// G21 P3-C — reviewer signature on the web dossier (server component).
// Same fields as the Cohort Report signature (P2-C) and the IC memo PDF:
// Reviewer · Role (· Organisation) · Date · Methodology · Overrides for this
// startup · the "Humans make the decision" line. Assessor only — the founder
// preview never carries a reviewer's identity.

import { signatureLines, type ReviewerSignature } from "@/lib/evaluations/signature";

export function SignatureBlock({ signature }: { signature: ReviewerSignature | null }) {
  if (!signature) return null;
  return (
    <section aria-labelledby="dossier-signature-heading" className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid="dossier-signature" data-section="signature">
      <h2 id="dossier-signature-heading" className="text-lg font-semibold text-ink-900">
        Reviewer signature
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {signatureLines(signature).map((l) => (
          <div key={l.label}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{l.label}</dt>
            <dd className="mt-0.5 text-ink-800" data-signature-field={l.label.toLowerCase()}>
              {l.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-600" data-signature-overrides>
        {signature.overridesLine}
      </p>
      <p className="mt-1 text-xs font-medium text-ink-700" data-signature-humans>
        {signature.humansLine}
      </p>
    </section>
  );
}
