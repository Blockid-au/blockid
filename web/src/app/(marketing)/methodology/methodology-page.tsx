/**
 * Shared body for /methodology and /vi/methodology (G14-S36). Server
 * component; every figure comes from `buildMethodologyProps` (pure).
 */

import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import type { MethodologyProps } from "./methodology-content";

const LEVEL_TONE: Record<string, string> = {
  self_declared: "bg-ink-100 text-ink-700",
  public_url: "bg-sky-50 text-sky-800",
  document_uploaded: "bg-amber-50 text-amber-800",
  connected_source: "bg-brand-50 text-brand-700",
  transaction_data: "bg-emerald-50 text-emerald-800",
  third_party_verified: "bg-emerald-100 text-emerald-900",
};

function LevelChip({ level }: { level: string }) {
  return <code className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${LEVEL_TONE[level] ?? "bg-ink-100 text-ink-700"}`}>{level}</code>;
}

export function MethodologyPage(p: MethodologyProps) {
  return (
    <MarketingShell>
      <MarketingHero eyebrow={p.hero.eyebrow} title={p.hero.title} subtitle={p.hero.subtitle} />

      {/* 1. The 8 dimensions — names from DIMENSION_OWNERS, no weights (F-3). */}
      <MarketingSection kicker={p.dims.kicker} title={p.dims.title}>
        <p className="max-w-3xl text-sm leading-relaxed text-tertiary">{p.dims.intro}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="methodology-dimensions">
          {p.dims.items.map((d) => (
            <li key={d.key} id={`dim-${d.key}`} className="rounded-2xl border border-line-subtle bg-white p-6">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">{d.code}</span>
                <h3 className="text-base font-semibold text-primary">{d.title}</h3>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-tertiary">{p.dims.ownerLabel}</dt>
                  <dd className="text-primary">
                    <span className="font-medium">{d.owner}</span>
                    {d.supporting.length > 0 && <span className="text-tertiary"> · {d.supporting.join(", ")}</span>}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-tertiary">{p.dims.criteriaLabel}</dt>
                  <dd className="text-primary">{d.criteria.join(" · ")}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-tertiary">{p.dims.weightsNote}</p>
      </MarketingSection>

      {/* 2. Evidence ladder + caps (D4). */}
      <MarketingSection kicker={p.ladder.kicker} title={p.ladder.title} tone="elevated">
        <p className="max-w-3xl text-sm leading-relaxed text-tertiary">{p.ladder.intro}</p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-line-subtle bg-white">
          <table className="w-full text-sm" data-testid="methodology-ladder">
            <thead>
              <tr className="border-b border-line-subtle text-left text-[11px] uppercase tracking-wide text-tertiary">
                <th className="px-3 py-2">{p.ladder.cols.level}</th>
                <th className="px-3 py-2 text-right">{p.ladder.cols.confidence}</th>
                <th className="px-3 py-2">{p.ladder.cols.meaning}</th>
              </tr>
            </thead>
            <tbody>
              {p.ladder.rows.map((r) => (
                <tr key={r.level} className="border-b border-line-subtle/60 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <LevelChip level={r.level} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">{r.confidencePct}%</td>
                  <td className="px-3 py-2 text-tertiary">{r.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-10 text-lg font-semibold text-primary">{p.caps.title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tertiary">{p.caps.intro}</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-line-subtle bg-white">
          <table className="w-full text-sm" data-testid="methodology-caps">
            <thead>
              <tr className="border-b border-line-subtle text-left text-[11px] uppercase tracking-wide text-tertiary">
                <th className="px-3 py-2">{p.caps.cols.who}</th>
                <th className="px-3 py-2">{p.caps.cols.ceiling}</th>
                <th className="px-3 py-2">{p.caps.cols.rule}</th>
              </tr>
            </thead>
            <tbody>
              {p.caps.rows.map((r) => (
                <tr key={r.origin} className="border-b border-line-subtle/60 align-top">
                  <td className="px-3 py-2 font-medium text-primary">{r.who}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <LevelChip level={r.ceiling} />
                  </td>
                  <td className="px-3 py-2 text-tertiary">{r.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MarketingSection>

      {/* 3. Business verification L0–L5 (level-engine.ts) + multiplier (F-6). */}
      <MarketingSection kicker={p.verification.kicker} title={p.verification.title}>
        <p className="max-w-3xl text-sm leading-relaxed text-tertiary">{p.verification.intro}</p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-line-subtle bg-white">
          <table className="w-full text-sm" data-testid="methodology-verification">
            <thead>
              <tr className="border-b border-line-subtle text-left text-[11px] uppercase tracking-wide text-tertiary">
                <th className="px-3 py-2">{p.verification.cols.level}</th>
                <th className="px-3 py-2">{p.verification.cols.label}</th>
                <th className="px-3 py-2">{p.verification.cols.requires}</th>
                <th className="px-3 py-2 text-right">{p.verification.cols.multiplier}</th>
              </tr>
            </thead>
            <tbody>
              {p.verification.rows.map((r) => (
                <tr key={r.level} className="border-b border-line-subtle/60 align-top">
                  <td className="px-3 py-2 font-mono text-xs text-brand-700">{r.short}</td>
                  <td className="px-3 py-2 font-medium text-primary">{r.label}</td>
                  <td className="px-3 py-2 text-tertiary">{r.requires}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">×{r.multiplier.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-tertiary">{p.verification.multiplierNote}</p>
      </MarketingSection>

      {/* 4. Audit chain. */}
      <MarketingSection kicker={p.audit.kicker} title={p.audit.title} tone="elevated">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-tertiary">
          {p.audit.paragraphs.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          <p>
            <Link href={p.audit.statusHref} className="text-brand-700 underline decoration-dotted">
              /status
            </Link>{" "}
            · <code className="font-mono text-xs">audit_chain: ok | broken | unknown</code>
          </p>
        </div>
      </MarketingSection>

      {/* 5. Model provenance. */}
      <MarketingSection kicker={p.provenance.kicker} title={p.provenance.title}>
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-tertiary">
          {p.provenance.paragraphs.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </MarketingSection>

      {/* 6. Versioning. */}
      <MarketingSection kicker={p.versioning.kicker} title={p.versioning.title} tone="elevated">
        <dl className="grid gap-3 sm:grid-cols-3" data-testid="methodology-versions">
          {p.versioning.rows.map((r) => (
            <div key={r.label} className="rounded-xl border border-line-subtle bg-white p-4">
              <dt className="text-xs uppercase tracking-wide text-tertiary">{r.label}</dt>
              <dd className="mt-1 font-mono text-sm text-primary">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-tertiary">{p.versioning.note}</p>
      </MarketingSection>

      {/* 7. Data ownership — the approved sentence, verbatim. */}
      <MarketingSection kicker={p.data.kicker} title={p.data.title}>
        <blockquote className="max-w-3xl border-l-2 border-brand-300 pl-4 text-base leading-relaxed text-primary" data-testid="methodology-data-principle">
          {p.data.sentence}
        </blockquote>
        {p.data.translated && <p className="mt-3 max-w-3xl pl-4 text-sm leading-relaxed text-tertiary">{p.data.translated}</p>}
      </MarketingSection>

      {/* 7b. Data sources — external_sources rows, attribution verbatim, cite-only labelled (S40). */}
      <MarketingSection kicker={p.sources.kicker} title={p.sources.title} tone="elevated">
        <span id="data-sources" className="block scroll-mt-24" aria-hidden="true" />
        <p className="max-w-3xl text-sm leading-relaxed text-tertiary">{p.sources.intro}</p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-line-subtle bg-white">
          <table className="w-full text-sm" data-testid="methodology-data-sources" data-source-count={p.sources.items.length} data-from-db={p.sources.fromDb ? "1" : "0"}>
            <thead>
              <tr className="border-b border-line-subtle text-left text-[11px] uppercase tracking-wide text-tertiary">
                <th className="px-3 py-2">{p.sources.cols.source}</th>
                <th className="px-3 py-2">{p.sources.cols.licence}</th>
                <th className="px-3 py-2">{p.sources.cols.use}</th>
                <th className="px-3 py-2 whitespace-nowrap">{p.sources.cols.refreshed}</th>
                <th className="px-3 py-2 text-right">{p.sources.cols.rows}</th>
              </tr>
            </thead>
            <tbody>
              {p.sources.items.map((s) => (
                <tr key={s.id} className="border-b border-line-subtle/60 align-top" data-source-id={s.id} data-source-status={s.status}>
                  <td className="px-3 py-2">
                    <a href={s.url} rel="noopener noreferrer" target="_blank" className="font-medium text-primary underline decoration-dotted">
                      {s.name}
                    </a>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-tertiary">{s.attribution}</p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-primary">{s.licence}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${s.citeOnly ? "bg-amber-50 text-amber-800" : s.status === "active" ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-700"}`}>{s.useLabel}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-tertiary">{s.citeOnly ? "—" : s.lastFetchedAt ? s.lastFetchedAt.slice(0, 10) : p.sources.never}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">{s.citeOnly ? "—" : s.rowCount.toLocaleString("en-AU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-tertiary">{p.sources.attributionNote}</p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-tertiary">{p.sources.cohortNote}</p>
      </MarketingSection>

      {/* 8. Calibration link (S39 fills the page). */}
      <MarketingSection kicker={p.calibration.kicker} title={p.calibration.title}>
        <p className="max-w-3xl text-sm leading-relaxed text-tertiary">{p.calibration.body}</p>
        <p className="mt-4">
          <Link href={p.calibration.href} className="text-sm font-medium text-brand-700 underline decoration-dotted">
            {p.calibration.link}
          </Link>
        </p>
      </MarketingSection>

      <MarketingCtaStrip headline={p.cta.title} primary={p.cta.primary} secondary={p.cta.secondary} />
    </MarketingShell>
  );
}
