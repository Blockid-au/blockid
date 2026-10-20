// PaygBlock — the "Pay as you go" block on /pricing and /vi/pricing (Pricing
// v5 wave P5, docs/pricing-v5-plan.md §6.7). Three cards — Snapshot / Full /
// Verified — under the plan switcher, plus the Scout break-even line.
//
// Rendered ONLY when `platform_config.payg_enabled` is on: the page reads the
// flag server-side (`getPaygView()`) and passes the view down; with the flag
// off this component returns null, so /pricing is byte-for-byte today's page.
//
// Prices come from the view (platform_config display cents), the bullets from
// the PAYG catalogue (`PAYG_SKUS[...].included`) — nothing here types an
// amount. CTAs land on the existing review-before-pay entry (`/analyze?tier=
// paid`, the confirm step that quotes the price before any charge), never on
// Stripe; Verified needs an account, so its CTA goes through sign-in first.
//
// Server-compatible (no "use client"); the one analytics beacon is the
// existing client <PageViewTracker /> island.

import Link from "next/link";
import { Check } from "lucide-react";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { PAYG_SKUS, PAYG_TIERS, reportSkuForTier, type PaygTier } from "@/lib/pricing/v5-payg";
import {
  PAYG_SCOUT_BREAKEVEN_LINE,
  PAYG_SCOUT_BREAKEVEN_LINE_VI,
  tierPriceLabel,
  type PaygView,
} from "@/lib/pricing/payg-copy";

export type PaygBlockLocale = "en" | "vi";

/** The review-before-pay entry for a tier. Verified signs in first (account required). */
export function paygTierHref(tier: PaygTier): string {
  const entry = `/analyze?tier=paid&payg=${tier}`;
  return tier === "verified" ? `/auth/login?next=${encodeURIComponent(entry)}` : entry;
}

const TIER_NAME: Readonly<Record<PaygTier, string>> = { snapshot: "Snapshot", full: "Full", verified: "Verified" };

const COPY = {
  en: {
    eyebrow: "No subscription",
    title: "Pay as you go",
    lede: "Buy a single report on any Australian startup. You see the price and confirm before anything is charged.",
    suffix: "one-off · inc. GST",
    blurb: {
      snapshot: "The score, the radar and the top risks on one page.",
      full: "The whole Trusted Business Report, with the evidence behind it.",
      verified: "The Full report, with the evidence reviewed by the BlockID team.",
    },
    plus: "Everything in Full, plus:",
    signIn: "Sign-in required — the review is tied to your account.",
    sla: (days: number) => `Delivered within ${days} business ${days === 1 ? "day" : "days"}`,
    cta: { snapshot: "Get a Snapshot", full: "Get the Full report", verified: "Sign in for Verified" },
    breakeven: PAYG_SCOUT_BREAKEVEN_LINE,
  },
  vi: {
    eyebrow: "Không cần gói thuê bao",
    title: "Trả theo lần dùng",
    lede: "Mua một báo cáo lẻ cho bất kỳ startup Úc nào. Bạn thấy giá và xác nhận trước khi bị tính phí.",
    suffix: "một lần · đã gồm GST",
    blurb: {
      snapshot: "Điểm số, biểu đồ radar và các rủi ro chính trên một trang.",
      full: "Toàn bộ Trusted Business Report, kèm bằng chứng phía sau.",
      verified: "Báo cáo Full, với bằng chứng được đội ngũ BlockID xem xét.",
    },
    plus: "Mọi thứ trong Full, cộng thêm:",
    signIn: "Cần đăng nhập — việc xem xét gắn với tài khoản của bạn.",
    sla: (days: number) => `Giao trong vòng ${days} ngày làm việc`,
    cta: { snapshot: "Mua Snapshot", full: "Mua báo cáo Full", verified: "Đăng nhập để mua Verified" },
    breakeven: PAYG_SCOUT_BREAKEVEN_LINE_VI,
  },
} as const;

/** VI renderings of the catalogue bullets (the catalogue itself stays English). */
const INCLUDED_VI: Readonly<Record<string, string>> = {
  "SVI score and 8-dimension radar": "Điểm SVI và biểu đồ radar 8 chiều",
  "Top 3 strengths and top 3 risks": "3 điểm mạnh và 3 rủi ro hàng đầu",
  "Evidence-confidence %": "% độ tin cậy của bằng chứng",
  "1-page PDF": "PDF 1 trang",
  "All 16 sections of the Trusted Business Report": "Đủ 16 phần của Trusted Business Report",
  "Australian comparables": "Các công ty so sánh tại Úc",
  "Evidence register": "Sổ đăng ký bằng chứng",
  "Questions to ask next": "Các câu hỏi nên hỏi tiếp",
  "Full PDF": "PDF đầy đủ",
  "Evidence reviewed by the BlockID team": "Bằng chứng được đội ngũ BlockID xem xét",
  "Investor Pack PDF": "PDF Investor Pack",
  "\"BlockID Reviewed\" badge": "Huy hiệu \"BlockID Reviewed\"",
};

const SLA_BULLET = /^Delivered within \d+ business days?$/;

/**
 * The bullets a tier's card lists. Verified shows only what it adds over
 * Full (the catalogue list is cumulative), and its SLA line is rebuilt from
 * the view so a `verified_sla_business_days` change reaches the page.
 */
export function paygCardBullets(view: PaygView, tier: PaygTier, locale: PaygBlockLocale = "en"): string[] {
  const included = PAYG_SKUS[reportSkuForTier(tier)].included;
  let lines: string[] = [...included];
  if (tier === "verified") {
    const full = new Set(PAYG_SKUS.report_full.included);
    lines = included.filter((l) => !full.has(l) && !SLA_BULLET.test(l));
  }
  const tr = locale === "vi" ? (l: string) => INCLUDED_VI[l] ?? l : (l: string) => l;
  const out = lines.map(tr);
  if (tier === "verified") out.push(COPY[locale].sla(view.slaDays));
  return out;
}

export interface PaygBlockProps {
  view: PaygView;
  locale?: PaygBlockLocale;
}

export function PaygBlock({ view, locale = "en" }: PaygBlockProps) {
  if (!view.enabled) return null;
  const c = COPY[locale];
  return (
    <div
      id="pay-as-you-go"
      data-testid="payg-block"
      lang={locale === "vi" ? "vi" : undefined}
      className="mx-auto mt-10 max-w-6xl scroll-mt-16"
    >
      <PageViewTracker event="payg_tier_viewed" params={{ surface: locale === "vi" ? "pricing_vi" : "pricing" }} />
      <div className="mb-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-action">{c.eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{c.title}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-secondary">{c.lede}</p>
      </div>
      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PAYG_TIERS.map((tier) => (
          <li
            key={tier}
            id={`payg-${tier}`}
            data-testid={`payg-card-${tier}`}
            className="flex flex-col rounded-2xl border border-line-subtle bg-surface p-5 sm:p-6"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{TIER_NAME[tier]}</p>
            <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
              <span className="text-3xl font-semibold leading-none tracking-tight text-primary tabular-nums">
                {tierPriceLabel(view, tier)}
              </span>
              <span className="text-sm text-muted">{c.suffix}</span>
            </p>
            <p className="mt-2 text-sm leading-snug text-secondary">{c.blurb[tier]}</p>
            {tier === "verified" ? <p className="mt-3 text-xs font-medium text-secondary">{c.plus}</p> : null}
            <ul role="list" className="mt-3 flex-1 space-y-1.5">
              {paygCardBullets(view, tier, locale).map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm">
                  <Check size={14} aria-hidden strokeWidth={2.5} className="mt-1 shrink-0 text-action" />
                  <span className="text-secondary">{line}</span>
                </li>
              ))}
            </ul>
            {tier === "verified" ? (
              <p data-testid="payg-verified-signin" className="mt-4 text-xs text-tertiary">
                {c.signIn}
              </p>
            ) : null}
            <Link
              href={paygTierHref(tier)}
              data-cta-id={`pricing_payg_${tier}`}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              {c.cta[tier]}
            </Link>
          </li>
        ))}
      </ul>
      <p data-testid="payg-scout-breakeven" className="mt-6 text-center text-sm text-secondary">
        {c.breakeven}
      </p>
    </div>
  );
}

export default PaygBlock;
