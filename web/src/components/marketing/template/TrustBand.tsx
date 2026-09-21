/**
 * TrustBand — the compact "who stands behind this score" band (G21 P0-A).
 *
 * Advisor feedback 2026-09-20: trust is the product, and a site that names
 * its operator differently on different pages loses it. This band renders
 * the same four facts on every page that mounts it — operating entity,
 * ACN / ABN, methodology version, support — from `trustRows()` in
 * `lib/site/legal-entity`, followed by four short trust bullets:
 *
 *   1. privacy & evidence controls           → /legal/privacy
 *   2. score disclaimer (general information, not financial product advice —
 *      the sentences come from `DISCLAIMER_SURFACES.general_all`, never a
 *      new wording)
 *   3. append-only audit trail               → /methodology#audit
 *   4. founder consent & data ownership      (`DATA_PRINCIPLE_SENTENCE`, verbatim)
 *
 * Mounted above the closing `CtaBand` on /product, /pricing, /methodology
 * and the /solutions/* persona pages (the home page and
 * /solutions/accelerator mount it from their own lanes). Sits on the
 * `sunken` ground with `RHYTHM.sm` so it reads as a quiet fact strip, not
 * a second hero. Tokens only (no raw hex — `template.test.tsx` pins it);
 * every link is ≥ 44 px and carries `FOCUS_RING`; the grid collapses to one
 * column under `sm` so nothing overflows at 375 px.
 *
 * G22-C: `locale="vi"` renders the same four rows and four bullets from the
 * VI copy table below. The VI disclaimer sentence is lifted from the
 * registered `general_all.body_md_vi` surface and the VI data sentence from
 * the approved `solutions.principle.data` catalogue line — never new
 * wording. Every `/vi` mount passes it; the row VALUES (entity, ACN / ABN,
 * version, e-mail) are identical in both languages by construction.
 *
 * Server component.
 */

import Link from "next/link";
import { FileCheck2, ScrollText, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import { fillEntityTokens, trustRows } from "@/lib/site/legal-entity";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import viMessages from "@/lib/i18n/messages/vi.json";
import { CONTAINER, EYEBROW, FOCUS_RING, MOTION, RHYTHM, TONE_CLASS, headingId } from "./primitives";

export const TRUST_BAND_ID = "trust";

export type TrustBandLocale = "en" | "vi";

/**
 * The approved Vietnamese data sentence (`solutions.principle.data` in
 * vi.json — the line the /vi persona pages print). Read from the catalogue
 * so the band can never drift from it.
 */
export const DATA_PRINCIPLE_SENTENCE_VI: string = fillEntityTokens(
  (viMessages as Record<string, string>)["solutions.principle.data"] ?? DATA_PRINCIPLE_SENTENCE,
);

export interface TrustBandCopy {
  eyebrow: string;
  title: string;
  /** dt labels, in `trustRows()` order: entity · ACN/ABN · methodology version · support. */
  rowLabels: readonly [string, string, string, string];
  rowsAriaLabel: string;
  bulletsAriaLabel: string;
  privacy: { title: string; body: string; linkLabel: string };
  disclaimer: { title: string; linkLabel: string };
  audit: { title: string; body: string; linkLabel: string };
  consent: { title: string; body: string };
}

/** EN + VI copy tables — same structure, same links, same order. */
export const TRUST_BAND_COPY: Readonly<Record<TrustBandLocale, TrustBandCopy>> = {
  en: {
    eyebrow: "Who stands behind the score",
    title: "One operator, one methodology, one audit trail.",
    rowLabels: ["Operating entity", "ACN / ABN", "Methodology version", "Support"],
    rowsAriaLabel: "Operating entity and methodology",
    bulletsAriaLabel: "Trust controls",
    privacy: {
      title: "Privacy and evidence controls",
      body:
        "Evidence is stored in Australia under the Privacy Act 1988 (Cth); every document, link and connector is scoped to the startup that supplied it.",
      linkLabel: "Privacy policy",
    },
    disclaimer: { title: "Score disclaimer", linkLabel: "All disclaimers" },
    audit: {
      title: "Append-only audit trail",
      body:
        "Every score, evidence change and re-run is written to a hash-chained ledger that is never edited in place — a reviewer can replay how a number was reached.",
      linkLabel: "How the audit trail works",
    },
    consent: { title: "Founder consent and data ownership", body: DATA_PRINCIPLE_SENTENCE },
  },
  vi: {
    eyebrow: "Ai đứng sau điểm số",
    title: "Một đơn vị vận hành, một phương pháp, một nhật ký kiểm toán.",
    rowLabels: ["Đơn vị vận hành", "ACN / ABN", "Phiên bản phương pháp", "Hỗ trợ"],
    rowsAriaLabel: "Đơn vị vận hành và phương pháp",
    bulletsAriaLabel: "Các kiểm soát về độ tin cậy",
    privacy: {
      title: "Kiểm soát quyền riêng tư và bằng chứng",
      body:
        "Bằng chứng được lưu trữ tại Úc theo Đạo luật Quyền riêng tư 1988 (Cth); mọi tài liệu, đường dẫn và kết nối đều được giới hạn trong phạm vi startup đã cung cấp.",
      linkLabel: "Chính sách quyền riêng tư",
    },
    disclaimer: { title: "Tuyên bố miễn trừ về điểm số", linkLabel: "Tất cả tuyên bố miễn trừ" },
    audit: {
      title: "Nhật ký kiểm toán chỉ ghi thêm",
      body:
        "Mọi điểm số, thay đổi bằng chứng và lần chạy lại đều được ghi vào một sổ cái chuỗi băm không bao giờ bị sửa tại chỗ — người xét duyệt có thể xem lại cách một con số được hình thành.",
      linkLabel: "Nhật ký kiểm toán hoạt động thế nào",
    },
    consent: { title: "Sự đồng ý của founder và quyền sở hữu dữ liệu", body: DATA_PRINCIPLE_SENTENCE_VI },
  },
};

/**
 * The score disclaimer, derived from the registered "General Site Footer"
 * surface rather than re-worded here: the two sentences that say what the
 * content is (general information) and what it is not (financial product
 * advice / AFSL). The operator sentence and the Terms/Privacy pointer are
 * dropped because the band already carries the entity rows and the links.
 * `locale="vi"` lifts the "thông tin chung" sentence from `body_md_vi` of the
 * same surface (the `[TODO-VI]` review marker stripped) and falls back to
 * the English sentences when the surface carries no translation.
 */
export function scoreDisclaimerText(locale: TrustBandLocale = "en"): string {
  const surface = DISCLAIMER_SURFACES.general_all;
  if (locale === "vi" && surface.body_md_vi) {
    const vi = surface.body_md_vi
      .replace(/\[TODO-VI\]\s*/g, "")
      .replace(/\*\*/g, "")
      .split(/(?<=\.)\s+/)
      .filter((s) => /thông tin chung/i.test(s))
      .join(" ")
      .trim();
    if (vi.length > 0) return vi;
  }
  const body = surface.body_md.replace(/\*\*/g, "");
  const sentences = body.split(/(?<=\.)\s+/);
  return sentences
    .filter(
      (s) =>
        /general information/i.test(s) || /financial product advice/i.test(s),
    )
    .join(" ")
    .trim();
}

export interface TrustBullet {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
}

/**
 * The four bullets, exported so the colocated test can pin their sources.
 * The legal links are the same in both languages (the legal documents are
 * English-only routes); the audit link goes to the locale's methodology page.
 */
export function trustBullets(locale: TrustBandLocale = "en"): TrustBullet[] {
  const c = TRUST_BAND_COPY[locale];
  const prefix = locale === "vi" ? "/vi" : "";
  return [
    {
      icon: ShieldCheck,
      title: c.privacy.title,
      body: c.privacy.body,
      href: "/legal/privacy",
      linkLabel: c.privacy.linkLabel,
    },
    {
      icon: FileCheck2,
      title: c.disclaimer.title,
      body: scoreDisclaimerText(locale),
      href: "/legal/disclaimers",
      linkLabel: c.disclaimer.linkLabel,
    },
    {
      icon: ScrollText,
      title: c.audit.title,
      body: c.audit.body,
      href: `${prefix}/methodology#audit`,
      linkLabel: c.audit.linkLabel,
    },
    {
      icon: UserCheck,
      title: c.consent.title,
      body: c.consent.body,
    },
  ];
}

export interface TrustBandProps {
  /** Section id (default `trust`) — the heading is `${id}-heading`. */
  id?: string;
  eyebrow?: string;
  title?: string;
  /** Methodology version shown in the rows; defaults to the live `SVI_VERSION`. */
  sviVersion?: string;
  /** `vi` renders the VI copy table (every /vi mirror passes it). Default `en`. */
  locale?: TrustBandLocale;
  className?: string;
}

export function TrustBand({
  id = TRUST_BAND_ID,
  eyebrow,
  title,
  sviVersion = SVI_VERSION,
  locale = "en",
  className,
}: TrustBandProps) {
  const copy = TRUST_BAND_COPY[locale];
  // Labels are localised; the VALUES come from `trustRows()` unchanged.
  const rows = trustRows(sviVersion).map((row, i) => ({ ...row, label: copy.rowLabels[i] ?? row.label }));
  const bullets = trustBullets(locale);
  return (
    <section
      id={id}
      aria-labelledby={headingId(id)}
      data-testid="trust-band"
      data-locale={locale}
      lang={locale}
      className={cn("scroll-mt-20 border-t border-line-subtle", TONE_CLASS.sunken, RHYTHM.sm, className)}
    >
      <div className={CONTAINER}>
        <p className={EYEBROW}>{eyebrow ?? copy.eyebrow}</p>
        <h2
          id={headingId(id)}
          className="mt-2 font-display text-xl font-semibold tracking-tight text-balance text-primary sm:text-2xl"
        >
          {title ?? copy.title}
        </h2>

        {/* Entity rows — the same four facts on every page. */}
        <dl
          aria-label={copy.rowsAriaLabel}
          className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 rounded-xl border border-line-subtle bg-surface p-5 shadow-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{row.label}</dt>
              <dd
                className="mt-1 break-words text-sm font-medium text-primary [overflow-wrap:anywhere]"
                data-trust-row={row.label}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Trust bullets — four short facts, each with one link at most. */}
        <ul aria-label={copy.bulletsAriaLabel} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bullets.map((b) => {
            const Icon = b.icon;
            return (
              <li key={b.title} className="flex min-w-0 gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"
                >
                  <Icon strokeWidth={1.75} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-primary">{b.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-secondary [overflow-wrap:anywhere]">{b.body}</p>
                  {b.href && b.linkLabel ? (
                    <Link
                      href={b.href}
                      className={cn(
                        "mt-1 inline-flex min-h-11 items-center text-xs font-medium text-action hover:text-action-hover",
                        MOTION,
                        FOCUS_RING,
                      )}
                    >
                      {b.linkLabel}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default TrustBand;
