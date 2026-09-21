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
          <tr className="border-b border-line-subtle text-left text-xs uppercase tracking-wide text-tertiary">
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

/**
 * The page chrome per locale (G22-C): hero, section eyebrows / labels, the
 * version line and the closing band. The institutional document itself (the
 * numbered sections) stays English on the VI mirror — the VI summary above
 * it says so — but nothing a reader navigates by is English there.
 */
export const GOVERNANCE_CHROME = {
  en: {
    heroEyebrow: null as string | null,
    heroTitle: null as string | null,
    heroSub: null as string | null,
    principleEyebrow: "Human in the loop",
    principleTitle: "The one rule every section follows",
    versionLine: (v: string) => `Methodology version v${v}`,
    sourceDocument: "source document",
    backToMethodology: "back to the methodology",
    summaryEyebrow: "Summary",
    contentsEyebrow: "Contents",
    contentsTitle: "Sections",
    sectionEyebrow: (n: number) => `§ ${n}`,
    englishSectionNote: null as string | null,
    ctaTitle: "See the methodology the rules govern",
    ctaPrimary: "Read the methodology",
    ctaSecondary: "See a real report",
  },
  vi: {
    heroEyebrow: "Phương pháp · Quản trị",
    heroTitle: "Startup Value Index — quản trị điểm số",
    heroSub: (v: string) =>
      `Các quy tắc mà phiên bản phương pháp ${v} tuân theo: các chiều, trọng số, phiên bản, phân vị, xung đột, xét duyệt bởi con người, chỉnh sửa và chấm lại — viết cho quản lý chương trình, hội đồng đầu tư và kiểm toán viên của họ (tài liệu đầy đủ bằng tiếng Anh bên dưới).`,
    principleEyebrow: "Con người trong vòng lặp",
    principleTitle: "Quy tắc duy nhất mọi phần đều tuân theo",
    versionLine: (v: string) => `Phiên bản phương pháp v${v}`,
    sourceDocument: "tài liệu nguồn",
    backToMethodology: "về trang phương pháp",
    summaryEyebrow: "Tóm tắt",
    contentsEyebrow: "Mục lục",
    contentsTitle: "Các phần (tiếng Anh)",
    sectionEyebrow: (n: number) => `§ ${n} · tiếng Anh`,
    englishSectionNote: "Phần này là tài liệu quản trị gốc bằng tiếng Anh; bản tiếng Anh là bản có hiệu lực.",
    ctaTitle: "Xem phương pháp mà các quy tắc này điều chỉnh",
    ctaPrimary: "Đọc phương pháp",
    ctaSecondary: "Xem một báo cáo thật",
  },
} as const;

export function GovernanceBody(p: GovernanceBodyProps) {
  const c = GOVERNANCE_CHROME[p.locale];
  const heroTitle = c.heroTitle ?? p.hero.title;
  const heroEyebrow = c.heroEyebrow ?? p.hero.eyebrow;
  const heroSub = typeof c.heroSub === "function" ? c.heroSub(p.version) : (c.heroSub ?? p.hero.subtitle);
  return (
    <MarketingShell>
      <div lang={p.locale}>
      <PageHero eyebrow={heroEyebrow} title={heroTitle} sub={heroSub} align="start" />

      <Section id="principle" eyebrow={c.principleEyebrow} title={c.principleTitle} tone="sunken">
        <blockquote lang="en" className="max-w-3xl border-l-2 border-accent-600/40 pl-4 text-base leading-relaxed text-primary" data-testid="governance-principle">
          {p.principle}
        </blockquote>
        <p className="mt-4 text-xs text-tertiary" data-testid="governance-version">
          {c.versionLine(p.version)} · {c.sourceDocument} <code className="font-mono [overflow-wrap:anywhere]">{p.docPath}</code> ·{" "}
          <Link href={p.methodologyHref} className="inline-flex min-h-11 items-center rounded-sm text-accent underline decoration-dotted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
            {c.backToMethodology}
          </Link>
        </p>
      </Section>

      {p.summary ? (
        <Section id="summary" eyebrow={c.summaryEyebrow} title={p.summary.title}>
          <Prose>
            {p.summary.paragraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            <p className="text-xs text-tertiary">{p.summary.fullVersionNote}</p>
          </Prose>
        </Section>
      ) : null}

      <Section id="contents" eyebrow={c.contentsEyebrow} title={c.contentsTitle}>
        <ol className="grid gap-1 text-sm sm:grid-cols-2" data-testid="governance-toc" lang="en">
          {p.sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-sm text-accent underline decoration-dotted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </Section>

      {/* The institutional document — English in both mirrors (`lang="en"` so AT reads it as such). */}
      <div lang="en" data-testid="governance-sections">
      {p.sections.map((s, i) => (
        <Section key={s.id} id={s.id} eyebrow={c.sectionEyebrow(i + 1)} title={s.title} tone={i % 2 === 0 ? "sunken" : undefined}>
          {c.englishSectionNote && i === 0 ? (
            <p lang="vi" className="mb-4 max-w-3xl text-xs text-tertiary" data-testid="governance-english-note">
              {c.englishSectionNote}
            </p>
          ) : null}
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
              <Link href={p.locale === "vi" ? `/vi${s.link.href}` : s.link.href} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-accent underline decoration-dotted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface" data-testid={`governance-link-${s.id}`}>
                {s.link.label}
              </Link>
            </p>
          ) : null}
        </Section>
      ))}
      </div>

      <CtaBand
        title={c.ctaTitle}
        primary={{ href: p.methodologyHref, label: c.ctaPrimary }}
        secondary={{ href: "/showcase/blockid/report", label: c.ctaSecondary }}
      />
      </div>
    </MarketingShell>
  );
}
