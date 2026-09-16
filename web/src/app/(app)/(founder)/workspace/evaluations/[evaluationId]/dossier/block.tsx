// Shared block chrome for the Investor Dossier sections (server component).

export function DossierBlock({ n, title, testId, children }: { n: number; title: string; testId: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`dossier-block-${n}`} className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid={testId}>
      <h2 id={`dossier-block-${n}`} className="text-lg font-semibold text-ink-900">
        {n} · {title}
      </h2>
      <div className="mt-3 text-sm text-ink-600">{children}</div>
    </section>
  );
}
