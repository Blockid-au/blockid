/**
 * PilotOffer — the paid BlockID Cohort Validation Pilot block (G21 P0-C).
 * Mounted at /solutions/accelerator#pilot (and its /vi mirror) and on
 * /pilot; the /pricing Programs tab renders the compact `PilotRung` below.
 *
 * Two offer cards (A$1,500 / ≤ 25 applicants · A$2,500 / ≤ 50), one
 * inclusions list, the success metrics measured together, and — when the
 * page asks for it — the "After the pilot" Cohort 25 / Cohort 100 rungs.
 * Every amount comes from `PILOT_SKUS` / `formatPilotPrice()` or a
 * `fillPrices()` token; no literal price. The buy buttons are
 * <PilotBuyButton /> (client) with `configured` decided on the server, so an
 * unminted price renders a contact link instead of a dead checkout.
 *
 * Test contract: `data-testid="pilot-offer"`, one `pilot-offer-card`
 * per SKU with `data-sku`, `pilot-buy-<sku>` on each button,
 * `pilot-metrics` (6 rows), `pilot-after` when tiers are passed.
 *
 * Server component.
 */

import { Check, type LucideIcon, Landmark, Users } from "lucide-react";
import { FeatureGrid, Section, type FeatureItem } from "@/components/marketing/template";
import {
  PILOT_SKU_IDS,
  PILOT_SKUS,
  formatPilotPrice,
  formatPilotPriceLong,
  type PilotSkuId,
} from "@/lib/pricing/pilot-skus";
import { fillPilotString, type PilotUiStrings } from "@/lib/pricing/pilot-strings";
import { PilotBuyButton } from "./PilotBuyButton";

export interface PilotOfferTier {
  name: string;
  price: string;
  sub: string;
  href: string;
  label: string;
  ctaId?: string;
}

export interface PilotOfferCopy {
  eyebrow: string;
  title: string;
  lede: string;
  /** "Up to {n} applicants" with the cap substituted per card. */
  applicantsLine: string;
  /** "One real intake or your existing cohort" */
  scopeLine: string;
  includesTitle: string;
  includes: readonly string[];
  buyLabel: string;
  metricsTitle: string;
  metricsLede: string;
  metrics: readonly string[];
  afterTitle?: string;
  afterLede?: string;
  afterTiers?: readonly PilotOfferTier[];
}

export interface PilotOfferProps {
  copy: PilotOfferCopy;
  /** `isPilotSkuConfigured(sku)` per SKU, computed by the server page. */
  configured: Readonly<Record<PilotSkuId, boolean>>;
  /** The page the buttons sit on (sign-in return + cancel target). */
  returnPath: string;
  /** The localised control strings (`pilotUiStrings(m, locale)`) for the buy buttons + the "after" eyebrow. */
  strings: PilotUiStrings;
  /** Section id; the accelerator page uses `pilot` so `#pilot` deep links land here. */
  id?: string;
  ctaPrefix?: string;
}

const TIER_ICONS: readonly LucideIcon[] = [Users, Landmark];

export function PilotOffer({ copy, configured, returnPath, strings, id = "pilot", ctaPrefix = "pilot" }: PilotOfferProps) {
  return (
    <>
      <Section id={id} eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} tone="sunken">
        <div data-testid="pilot-offer" className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {PILOT_SKU_IDS.map((sku) => {
            const row = PILOT_SKUS[sku];
            return (
              <article
                key={sku}
                data-testid="pilot-offer-card"
                data-sku={sku}
                className="flex h-full flex-col rounded-xl border border-line-subtle bg-surface p-6 shadow-1 sm:p-8"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  {copy.applicantsLine.replace("{n}", String(row.applicantsCap))}
                </p>
                <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-primary">
                  {formatPilotPrice(sku)}
                  <span className="ml-2 text-base font-medium text-muted">{formatPilotPriceLong(sku).replace(formatPilotPrice(sku), "").trim()}</span>
                </h3>
                <p className="mt-2 text-sm text-secondary">{copy.scopeLine}</p>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{copy.includesTitle}</p>
                <ul className="mt-3 space-y-2">
                  {copy.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-secondary">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <PilotBuyButton
                    sku={sku}
                    configured={configured[sku]}
                    returnPath={returnPath}
                    strings={strings}
                    label={copy.buyLabel.replace("{price}", formatPilotPrice(sku))}
                    ctaId={`${ctaPrefix}_buy_${sku}`}
                  />
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 rounded-xl border border-line-subtle bg-surface p-6 sm:p-8">
          <h3 className="font-display text-lg font-semibold tracking-tight text-primary">{copy.metricsTitle}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">{copy.metricsLede}</p>
          <ol data-testid="pilot-metrics" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {copy.metrics.map((m, i) => (
              <li key={m} className="flex items-start gap-3 text-sm leading-relaxed text-secondary">
                <span aria-hidden="true" className="font-mono text-xs font-semibold text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{m}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {copy.afterTiers && copy.afterTiers.length > 0 ? (
        <Section id={`${id}-after`} eyebrow={strings.afterEyebrow} title={copy.afterTitle} lede={copy.afterLede}>
          <div data-testid="pilot-after">
            <FeatureGrid
              columns={2}
              ariaLabel={copy.afterTitle}
              items={copy.afterTiers.map(
                (t, i): FeatureItem => ({
                  icon: TIER_ICONS[i % TIER_ICONS.length]!,
                  title: `${t.name} — ${t.price}`,
                  body: t.sub,
                  href: t.href,
                  cta: t.label,
                  ctaId: t.ctaId,
                }),
              )}
            />
          </div>
        </Section>
      ) : null}
    </>
  );
}

/**
 * PilotRung — the compact pilot card the /pricing Programs tab shows FIRST,
 * ahead of Cohort 25 / Cohort 100. Isomorphic (no hooks) so the client
 * segment switch can render it; every string comes from `strings`
 * (`pilotUiStrings()` on the server) + the two page-level lines.
 */
export function PilotRung({
  configured,
  returnPath,
  strings,
  title,
  sub,
}: {
  configured: Readonly<Record<PilotSkuId, boolean>>;
  returnPath: string;
  strings: PilotUiStrings;
  title: string;
  sub: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid="pricing-pilot-rung"
      data-locale={strings.locale}
      className="mx-auto mt-8 max-w-5xl rounded-xl border border-action/25 bg-action/5 p-6 sm:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{strings.rungEyebrow}</p>
      <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-primary">{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-secondary">{sub}</p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {PILOT_SKU_IDS.map((sku) => (
          <div key={sku} className="min-w-0 rounded-lg border border-line-subtle bg-surface p-5" data-testid="pricing-pilot-card" data-sku={sku}>
            <p className="text-sm font-semibold text-primary">
              {formatPilotPrice(sku)} <span className="font-normal text-muted">{fillPilotString(strings.rungCard, { n: PILOT_SKUS[sku].applicantsCap })}</span>
            </p>
            <div className="mt-4">
              <PilotBuyButton
                sku={sku}
                configured={configured[sku]}
                returnPath={returnPath}
                strings={strings}
                label={fillPilotString(strings.buyLabel, { price: formatPilotPrice(sku) })}
                variant="secondary"
                ctaId={`pricing_pilot_${sku}`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
