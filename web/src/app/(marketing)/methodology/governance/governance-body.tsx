/**
 * Shared body for /methodology/governance and /vi/methodology/governance
 * (G21 P0-D). Server component; every figure comes from
 * `buildGovernanceProps()` (pure). The VI mirror renders a short translated
 * summary above the same English sections (the institutional document is
 * English).
 */

import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, PageHero, Prose, Section } from "@/components/marketing/template";
import type { GovernanceProps, GovernanceSection } from "./governance-content";

function GovTable({ table }: { table: NonNullable<GovernanceSection["table"]> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-line-subtle bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line-subtle text-left text-[11px] uppercase tracking-wide text-tertiary">
            {table.columns.map((c) => (
              <th key={c} scope="col" className="px-3 py-2">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-b border-line-subtle/60 align-top">
              {r.map((cell, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? "whitespace-nowrap font-medium text-primary" : "text-tertiary"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface GovernanceBodyProps extends GovernanceProps {
  locale: "en" | "vi";
  /** VI mirror: translated summary paragraphs rendered before the sections. */
  summary?: { title: string; paragraphs: string[]; fullVersionNote: string } | null;
  methodologyHref: string;
}

export function GovernanceBody(p: GovernanceBodyProps) {
  return (
    <MarketingShell>
      <PageHero eyebrow={p.hero.eyebrow} title={p.hero.title} sub={p.hero.subtitle} align="start" />

      <Section id="principle" eyebrow="Human in the loop" title="The one rule every section follows" tone="sunken">
        <blockquote className="max-w-3xl border-l-2 border-accent-600/40 pl-4 text-base leading-relaxed text-primary" data-testid="governance-principle">
          {p.principle}
        </blockquote>
        <p className="mt-4 text-xs text-tertiary" data-testid="governance-version">
          {`Methodology version v${p.version}`} · source document <code className="font-mono">{p.docPath}</code> ·{" "}
          <Link href={p.methodologyHref} className="text-accent underline decoration-dotted">
            back to the methodology
          </Link>
        </p>
      </Section>

      {p.summary ? (
        <Section id="summary" eyebrow="Tóm tắt" title={p.summary.title}>
          <Prose>
            {p.summary.paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            <p className="text-xs text-tertiary">{p.summary.fullVersionNote}</p>
          </Prose>
        </Section>
      ) : null}

      <Section id="contents" eyebrow="Contents" title="Sections">
        <ol className="grid gap-1 text-sm sm:grid-cols-2" data-testid="governance-toc">
          {p.sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-accent underline decoration-dotted">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </Section>

      {p.sections.map((s, i) => (
        <Section key={s.id} id={s.id} eyebrow={`§ ${i + 1}`} title={s.title} tone={i % 2 === 0 ? "sunken" : undefined}>
          <Prose measure="wide">
            {s.paragraphs.map((para, j) => (
              <p key={j}>{para}</p>
            ))}
            {s.bullets ? (
              <ul>
                {s.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            ) : null}
          </Prose>
          {s.table ? <GovTable table={s.table} /> : null}
          {s.after ? (
            <Prose measure="wide" className="mt-4">
              {s.after.map((para, j) => (
                <p key={j}>{para}</p>
              ))}
            </Prose>
          ) : null}
          {s.link ? (
            <p className="mt-4">
              <Link href={p.locale === "vi" ? `/vi${s.link.href}` : s.link.href} className="text-sm font-medium text-accent underline decoration-dotted" data-testid={`governance-link-${s.id}`}>
                {s.link.label}
              </Link>
            </p>
          ) : null}
        </Section>
      ))}

      <CtaBand
        title="See the methodology the rules govern"
        primary={{ href: p.methodologyHref, label: "Read the methodology" }}
        secondary={{ href: "/showcase/blockid/report", label: "See a real report" }}
      />
    </MarketingShell>
  );
}
