/**
 * Shared body for /methodology/versions and /vi/methodology/versions
 * (G21 P3-C). Server component. The table is `SVI_VERSION_HISTORY`
 * (lib/svi/version-history.ts) — the same rows § 5 of the governance page
 * prints, plus each version's effect on comparability with earlier
 * snapshots. The current version is marked; the change-policy legend is
 * the governance § 6 table in one line per step.
 */

import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, PageHero, Prose, Section } from "@/components/marketing/template";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { CHANGE_TYPE_LABEL, SVI_VERSION_HISTORY, type SviVersionChangeType } from "@/lib/svi/version-history";

const COPY = {
  en: {
    eyebrow: "Methodology",
    title: "Startup Value Index — version history",
    sub: "Every snapshot and every report stores the methodology version it was produced with. A stored score is never silently re-scored by a newer rule set; a re-score is a new snapshot on the new version. This page says what each version changed and whether scores across versions can be compared.",
    currentEyebrow: "Current version",
    current: (v: string) => `Startup Value Index v${v}`,
    currentNote: "Printed on /methodology, on every report and on every Assessment Card. Institutional customers receive written notice of every major change before it ships.",
    tableEyebrow: "History",
    tableTitle: "Versions, newest first",
    columns: ["Version", "Date", "Change", "Type", "Effect on comparability"],
    currentTag: "current",
    legendEyebrow: "Change policy",
    legendTitle: "What a version step means",
    governance: "Read the full score governance",
    methodology: "Back to the methodology",
    ctaTitle: "See the rules the versions follow",
  },
  vi: {
    eyebrow: "Phương pháp",
    title: "Startup Value Index — lịch sử phiên bản",
    sub: "Mọi snapshot và mọi báo cáo đều lưu phiên bản phương pháp đã tạo ra nó. Điểm đã lưu không bao giờ bị chấm lại âm thầm bằng bộ quy tắc mới; chấm lại là một snapshot mới trên phiên bản mới. Trang này nêu mỗi phiên bản đã thay đổi gì và điểm giữa các phiên bản có so sánh được hay không (nội dung bảng bằng tiếng Anh).",
    currentEyebrow: "Phiên bản hiện tại",
    current: (v: string) => `Startup Value Index v${v}`,
    currentNote: "In trên /vi/methodology, trên mọi báo cáo và mọi Assessment Card. Khách hàng tổ chức được thông báo bằng văn bản trước mọi thay đổi lớn.",
    tableEyebrow: "Lịch sử",
    tableTitle: "Các phiên bản, mới nhất trước",
    columns: ["Phiên bản", "Ngày", "Thay đổi", "Loại", "Ảnh hưởng đến khả năng so sánh"],
    currentTag: "hiện tại",
    legendEyebrow: "Chính sách thay đổi",
    legendTitle: "Một bậc phiên bản nghĩa là gì",
    governance: "Đọc toàn bộ phần quản trị điểm số",
    methodology: "Về trang phương pháp",
    ctaTitle: "Xem các quy tắc mà các phiên bản tuân theo",
  },
} as const;

const TYPE_ORDER: SviVersionChangeType[] = ["major", "minor", "patch", "initial"];

export function VersionsBody({ locale }: { locale: "en" | "vi" }) {
  const t = COPY[locale];
  const prefix = locale === "vi" ? "/vi" : "";
  const rows = [...SVI_VERSION_HISTORY].reverse();
  return (
    <MarketingShell>
      <div lang={locale} data-versions-locale={locale}>
      <PageHero eyebrow={t.eyebrow} title={t.title} sub={t.sub} align="start" />

      <Section id="current" eyebrow={t.currentEyebrow} title={t.current(SVI_VERSION)} tone="sunken">
        <p className="max-w-3xl text-sm leading-relaxed text-tertiary" data-testid="versions-current" data-version={SVI_VERSION}>
          {t.currentNote}
        </p>
      </Section>

      <Section id="history" eyebrow={t.tableEyebrow} title={t.tableTitle}>
        <div className="mt-2 overflow-x-auto rounded-xl border border-line-subtle bg-surface">
          <table className="w-full text-sm" data-testid="versions-table" lang="en">
            <thead>
              <tr className="border-b border-line-subtle text-left text-xs uppercase tracking-wide text-tertiary">
                {t.columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.version} className="border-b border-line-subtle/60 align-top" data-version-row={r.version} data-current={r.version === SVI_VERSION ? "true" : undefined}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-primary">
                    {r.version}
                    {r.version === SVI_VERSION ? (
                      <span className="ml-2 rounded-full border border-line-subtle bg-surface-sunken px-2 py-0.5 font-sans text-xs font-medium text-secondary">{t.currentTag}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-tertiary">{r.date}</td>
                  <td className="px-3 py-2 text-tertiary">{r.change}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-tertiary">{r.type === "initial" ? "—" : r.type}</td>
                  <td className="min-w-[16rem] px-3 py-2 text-tertiary">{r.comparability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="policy" eyebrow={t.legendEyebrow} title={t.legendTitle} tone="sunken">
        <Prose measure="wide">
          <ul>
            {TYPE_ORDER.map((k) => (
              <li key={k}>
                <strong>{k}</strong> — {CHANGE_TYPE_LABEL[k].replace(/^[a-z]+ — /, "")}
              </li>
            ))}
          </ul>
        </Prose>
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Link href={`${prefix}/methodology/governance`} className="text-sm font-medium text-accent underline decoration-dotted" data-testid="versions-governance-link">
            {t.governance}
          </Link>
          <Link href={`${prefix}/methodology`} className="text-sm font-medium text-accent underline decoration-dotted" data-testid="versions-methodology-link">
            {t.methodology}
          </Link>
        </p>
      </Section>

      <CtaBand title={t.ctaTitle} primary={{ href: `${prefix}/methodology/governance`, label: t.governance }} secondary={{ href: `${prefix}/methodology`, label: t.methodology }} />
      </div>
    </MarketingShell>
  );
}
