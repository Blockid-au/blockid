/**
 * Shared body + copy builder for /pilot and /vi/pilot (G22-C) — the paid
 * BlockID Cohort Validation Pilot landing (G21 P0-C, F-3: public +
 * indexable). Every visible string resolves through `t()` against the
 * `pilot.page.*` catalogue keys (EN and VI; `messages-parity.test.ts` pins
 * the pair), so the two pages render the same document by construction.
 * Amounts are never literals: caps and the entitlement window come from
 * `PILOT_SKUS` / `PILOT_ENTITLEMENT_DAYS` through `{cap25}` / `{cap50}` /
 * `{days}` tokens; the offer block is the same <PilotOffer /> as
 * /solutions/accelerator#pilot.
 *
 * Test contract (both languages): one H1, `pilot-offer` + two
 * `pilot-offer-card`, `pilot-next-steps` (4 rows), `pilot-data-principle`,
 * `pilot-buy-<sku>` (contact links until the founder mints the prices),
 * `<TrustBand locale>` above the close.
 *
 * Server component.
 */

import Link from "next/link";
import { CalendarCheck, ClipboardCheck, FileText, Users, type LucideIcon } from "lucide-react";
import { t, type Messages } from "@/lib/i18n/t";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FOCUS_RING, FeatureGrid, PageHero, Section, TrustBand } from "@/components/marketing/template";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { PilotOffer, type PilotOfferCopy } from "@/components/marketing/PilotOffer";
import { PILOT_ENTITLEMENT_DAYS, PILOT_SKUS, formatPilotPrice, type PilotSkuId } from "@/lib/pricing/pilot-skus";
import { fillPilotString, pilotUiStrings, type PilotLocale, type PilotUiStrings } from "@/lib/pricing/pilot-strings";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/pilots/offer";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { acceleratorPilotCopy } from "../solutions/evaluator-page-props";
import { fillPrices } from "../solutions/solutions-pricing";

export const PILOT_PATH = "/pilot";
export const PILOT_VI_PATH = "/vi/pilot";

export interface PilotNextStep {
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface PilotPageCopy {
  lang: PilotLocale;
  path: string;
  /** Page-relative prefix for internal links (`""` or `/vi`). */
  prefix: string;
  breadcrumbHome: string;
  breadcrumb: string;
  metaTitle: string;
  metaDescription: string;
  hero: { eyebrow: string; title: string; sub: string; ctaOffer: string; ctaPrograms: string; footnoteLead: string; footnoteTail: string };
  next: { eyebrow: string; title: string; lede: string; steps: readonly PilotNextStep[] };
  data: { eyebrow: string; title: string; principle: string; body: string; method: string; policy: string; questions: string; disclaimer: string };
  close: { title: string; sub: string; primary: string; secondary: string };
  offer: PilotOfferCopy;
  strings: PilotUiStrings;
}

const STEP_ICONS: readonly LucideIcon[] = [CalendarCheck, ClipboardCheck, Users, FileText];

/** Inline text links in the data paragraph — underline + the template focus ring. */
const INLINE_LINK = `rounded-sm underline underline-offset-2 ${FOCUS_RING}`;

/** Pure: the whole page's copy for one catalogue. */
export function buildPilotPageCopy(m: Messages, lang: PilotLocale = "en"): PilotPageCopy {
  const T = (k: string) => t(m, k);
  const vars = {
    cap25: PILOT_SKUS.cohort_pilot_25.applicantsCap,
    cap50: PILOT_SKUS.cohort_pilot_50.applicantsCap,
    days: PILOT_ENTITLEMENT_DAYS,
    price25: formatPilotPrice("cohort_pilot_25"),
  };
  const F = (k: string) => fillPilotString(T(k), vars);
  const base = acceleratorPilotCopy(m);
  const prefix = lang === "vi" ? "/vi" : "";
  return {
    lang,
    path: lang === "vi" ? PILOT_VI_PATH : PILOT_PATH,
    prefix,
    breadcrumbHome: T("pilot.page.breadcrumb.home"),
    breadcrumb: T("pilot.page.breadcrumb"),
    metaTitle: T("meta.pilot.title"),
    metaDescription: F("meta.pilot.description"),
    hero: {
      eyebrow: T("pilot.page.hero.eyebrow"),
      title: T("pilot.page.hero.title"),
      sub: F("pilot.page.hero.sub"),
      ctaOffer: T("pilot.page.hero.cta.offer"),
      ctaPrograms: T("pilot.page.hero.cta.programs"),
      footnoteLead: T("pilot.page.hero.footnote.lead"),
      footnoteTail: T("pilot.page.hero.footnote.tail"),
    },
    next: {
      eyebrow: T("pilot.page.next.eyebrow"),
      title: T("pilot.page.next.title"),
      lede: T("pilot.page.next.lede"),
      steps: STEP_ICONS.map((icon, i) => ({ icon, title: F(`pilot.page.next.step${i + 1}.title`), body: F(`pilot.page.next.step${i + 1}.body`) })),
    },
    data: {
      eyebrow: T("pilot.page.data.eyebrow"),
      title: T("pilot.page.data.title"),
      // The approved data sentence, verbatim in each language (EN constant; VI catalogue line).
      principle: lang === "vi" ? T("solutions.principle.data") : DATA_PRINCIPLE_SENTENCE,
      body: T("pilot.page.data.body"),
      method: T("pilot.page.data.method"),
      policy: T("pilot.page.data.policy"),
      questions: T("pilot.page.data.questions"),
      disclaimer: T("solutions.accelerator.disclaimer"),
    },
    close: {
      title: T("pilot.page.close.title"),
      sub: T("pilot.page.close.sub"),
      primary: T("pilot.page.close.primary"),
      secondary: T("pilot.page.close.secondary"),
    },
    offer: {
      ...base,
      afterLede: base.afterLede ? fillPrices(base.afterLede) : undefined,
      afterTiers: base.afterTiers?.map((tier) => ({ ...tier, price: fillPrices(tier.price), sub: fillPrices(tier.sub) })),
    },
    strings: pilotUiStrings(m, lang),
  };
}

export interface PilotPageBodyProps {
  copy: PilotPageCopy;
  configured: Readonly<Record<PilotSkuId, boolean>>;
}

export function PilotPageBody({ copy, configured }: PilotPageBodyProps) {
  const { lang, prefix } = copy;
  // CTA ids: the EN ids are the G21 ones (funnel events key on them); VI prefixes `vi_`.
  const idPrefix = lang === "vi" ? "vi_pilot" : "pilot";
  const ctaPrefix = `${idPrefix}_page`;
  return (
    <MarketingShell>
      <div lang={lang} data-pilot-lang={lang}>
        <BreadcrumbListJsonLd
          items={[
            { name: copy.breadcrumbHome, href: prefix || "/" },
            { name: copy.breadcrumb, href: copy.path },
          ]}
        />
        <PageHero
          eyebrow={copy.hero.eyebrow}
          title={copy.hero.title}
          sub={copy.hero.sub}
          ctas={[
            { href: "#pilot", label: copy.hero.ctaOffer, ctaId: `${idPrefix}_hero_offer` },
            { href: `${prefix}/solutions/accelerator`, label: copy.hero.ctaPrograms },
          ]}
          align="start"
          footnote={
            <>
              <span className="text-primary">{copy.hero.footnoteLead}</span> <span>{copy.hero.footnoteTail}</span>
            </>
          }
        />

        <PilotOffer id="pilot" ctaPrefix={ctaPrefix} configured={configured} returnPath={`${copy.path}#pilot`} copy={copy.offer} strings={copy.strings} />

        <Section id="next" eyebrow={copy.next.eyebrow} title={copy.next.title} lede={copy.next.lede}>
          <div data-testid="pilot-next-steps">
            <FeatureGrid columns={4} numbered ariaLabel={copy.next.eyebrow} items={copy.next.steps.map((s) => ({ icon: s.icon, title: s.title, body: s.body }))} />
          </div>
        </Section>

        <Section id="data" eyebrow={copy.data.eyebrow} title={copy.data.title} tone="sunken">
          <p className="max-w-3xl text-base leading-relaxed text-primary" data-testid="pilot-data-principle">
            {copy.data.principle}
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-tertiary">
            {copy.data.body} {copy.data.method}{" "}
            <Link href={`${prefix}/methodology`} className={INLINE_LINK}>
              {prefix}/methodology
            </Link>
            . {copy.data.policy}{" "}
            <Link href="/legal/privacy" className={INLINE_LINK}>
              /legal/privacy
            </Link>
            . {copy.data.questions}{" "}
            <a href={`mailto:${LEGAL_ENTITY.supportEmail}`} className={INLINE_LINK}>
              {LEGAL_ENTITY.supportEmail}
            </a>
            .
          </p>
          <div className="mt-8">
            {lang === "vi" ? (
              <p className="max-w-3xl text-xs leading-relaxed text-tertiary" data-testid="pilot-disclaimer-vi">
                {copy.data.disclaimer}
              </p>
            ) : (
              <NotFinancialAdvice kind="not_financial_advice" compact />
            )}
          </div>
        </Section>

        {/* Who stands behind the pilot — entity, methodology version, controls (G21 P0-A), in the page's language (G22-C). */}
        {lang === "vi" ? <TrustBand locale="vi" /> : <TrustBand />}

        <CtaBand
          title={copy.close.title}
          sub={copy.close.sub}
          primary={{ href: "/analyze", label: copy.close.primary, ctaId: `${idPrefix}_final_score` }}
          secondary={{ href: `${prefix}/solutions/accelerator`, label: copy.close.secondary }}
        />
      </div>
    </MarketingShell>
  );
}
