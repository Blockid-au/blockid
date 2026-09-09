// The view model behind a published company profile.
//
// Pure, and deliberately so: the founder's publish preview is a client
// component and the public page is a server component, and they must render
// byte-for-byte the same thing. "Show them exactly what will be public before
// they confirm" is only true if the preview IS the page, so both call
// `buildPublicProfile` and hand the result to the same body component.
//
// Everything here comes either from `published_analyses` (typed by the
// founder for publication) or from `analyses.svi` (the derived score summary).
// Nothing is read from `input_text`, `input_url`, `input_filename` or
// `intake`, so no published page can carry an email address, a filename or a
// line of somebody's deck.

import type { CompactSvi } from "@/lib/analyses/payload";
import { SECTOR_LABELS, SVI_BENCHMARKS } from "@/lib/svi-analysis";
import {
  SVI_DIMENSION_KEYS,
  SVI_DIMENSION_LABELS,
  type SviDimensionKey,
} from "./eligibility";

export const SITE_URL = "https://blockid.au";

export type DimensionBand = "early" | "developing" | "strong";

export interface ProfileDimension {
  key: SviDimensionKey;
  label: string;
  value: number;
  band: DimensionBand;
  bandLabel: string;
}

export interface ProfileValuation {
  low: number;
  mid: number;
  high: number;
  /** Method names, weighting stripped — e.g. ["Berkus", "Scorecard"]. */
  methods: string[];
  confidencePct: number;
  currency: string;
}

export interface ProfileNextAction {
  priority: string;
  title: string;
  detail: string;
}

export interface PublicProfile {
  slug: string;
  url: string;
  companyName: string;
  oneLiner: string;
  sector: string;
  sectorLabel: string;
  websiteUrl: string | null;
  stage: number;
  stageLabel: string;
  sviTotal: number;
  /** Where this index value sits against the published band for its stage. */
  standing: string;
  benchmark: { p10: number; p50: number; p90: number } | null;
  dimensions: ProfileDimension[];
  strongest: ProfileDimension | null;
  weakest: ProfileDimension | null;
  valuation: ProfileValuation | null;
  nextActions: ProfileNextAction[];
  analysedAt: string;
  publishedAt: string;
  updatedAt: string;
}

export interface BuildProfileInput {
  slug: string;
  companyName: string;
  oneLiner: string;
  sector: string;
  websiteUrl?: string | null;
  svi: CompactSvi;
  analysedAt: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

function bandFor(value: number): { band: DimensionBand; label: string } {
  if (value >= 70) return { band: "strong", label: "Strong" };
  if (value >= 40) return { band: "developing", label: "Developing" };
  return { band: "early", label: "Early" };
}

/**
 * "Berkus (50%) + Scorecard (50%)" → ["Berkus", "Scorecard"].
 *
 * The named methods are the useful half — they tell a reader which published
 * valuation approach produced the range. The percentage split is internal
 * weighting and does not belong on a customer-facing page.
 */
export function splitValuationMethods(method: string | undefined): string[] {
  if (!method) return [];
  return method
    .split(/\s*[+/,]\s*/)
    .map((part) => part.replace(/\s*\(\s*\d+(\.\d+)?\s*%\s*\)\s*/g, "").trim())
    .filter((part) => part.length > 0);
}

/** Where an index value sits inside the published band for its stage. */
export function describeStanding(total: number, stage: number): string {
  const band = SVI_BENCHMARKS[stage];
  if (!band) return "";
  if (total < band.p10) return "Below the bottom 10% for this stage";
  if (total < band.p25) return "In the bottom quarter for this stage";
  if (total < band.p50) return "Below the median for this stage";
  if (total < band.p75) return "Above the median for this stage";
  if (total < band.p90) return "In the top quarter for this stage";
  return "In the top 10% for this stage";
}

export function formatAud(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `A$${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
  }
  if (value >= 1_000) return `A$${Math.round(value / 1_000)}k`;
  return `A$${Math.round(value).toLocaleString("en-AU")}`;
}

export function formatAuDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildPublicProfile(input: BuildProfileInput): PublicProfile {
  const svi = input.svi;
  const rawDims = svi.dimensions ?? {};
  const dimensions: ProfileDimension[] = SVI_DIMENSION_KEYS.map((key) => {
    const raw = rawDims[key];
    const value = typeof raw === "number" && Number.isFinite(raw)
      ? Math.max(0, Math.min(100, Math.round(raw)))
      : 0;
    const { band, label } = bandFor(value);
    return { key, label: SVI_DIMENSION_LABELS[key], value, band, bandLabel: label };
  });

  const ranked = [...dimensions].sort((a, b) => b.value - a.value);
  const stage = Number.isFinite(svi.stage) ? svi.stage : 0;
  const total = Math.round(svi.totalSVI ?? 0);
  const benchBand = SVI_BENCHMARKS[stage];

  const val = svi.valuation;
  const valuation: ProfileValuation | null =
    val && Number.isFinite(val.mid) && val.mid > 0
      ? {
          low: Math.round(val.low),
          mid: Math.round(val.mid),
          high: Math.round(val.high),
          methods: splitValuationMethods(val.method),
          confidencePct: Math.max(0, Math.min(100, Math.round(val.confidence ?? 0))),
          currency: val.currency || "AUD",
        }
      : null;

  return {
    slug: input.slug,
    url: `${SITE_URL}/listings/${input.slug}`,
    companyName: input.companyName,
    oneLiner: input.oneLiner,
    sector: input.sector,
    sectorLabel: SECTOR_LABELS[input.sector] ?? input.sector,
    websiteUrl: input.websiteUrl ?? null,
    stage,
    stageLabel: svi.stageLabel ?? "",
    sviTotal: total,
    standing: describeStanding(total, stage),
    benchmark: benchBand
      ? { p10: benchBand.p10, p50: benchBand.p50, p90: benchBand.p90 }
      : null,
    dimensions,
    strongest: ranked[0] ?? null,
    weakest: ranked[ranked.length - 1] ?? null,
    valuation,
    nextActions: (svi.nextActions ?? [])
      .filter((a) => a && a.title && a.detail)
      .map((a) => ({ priority: a.priority, title: a.title, detail: a.detail })),
    analysedAt: input.analysedAt,
    publishedAt: input.publishedAt ?? input.analysedAt,
    updatedAt: input.updatedAt ?? input.publishedAt ?? input.analysedAt,
  };
}

// ── Metadata + structured data ───────────────────────────────────────────

/**
 * Per-page title. Company, sector and stage all vary, so no two published
 * pages share one — which is the point: a single template with a swapped
 * name is the doorway-page pattern.
 */
export function profileTitle(p: PublicProfile): string {
  return `${p.companyName} — ${p.sectorLabel}, ${p.stageLabel} stage — Startup Value Index ${p.sviTotal}`;
}

export function profileDescription(p: PublicProfile): string {
  const range = p.valuation
    ? ` Indicative valuation ${formatAud(p.valuation.low)}–${formatAud(p.valuation.high)}.`
    : "";
  return `${p.oneLiner} Scored ${p.sviTotal} on the Startup Value Index across eight dimensions at ${p.stageLabel} stage.${range}`.slice(
    0,
    300,
  );
}

/**
 * Organization + Dataset in one graph.
 *
 * Organization describes the company itself; Dataset describes the scored
 * measurement of it, with each dimension as a `variableMeasured` so the
 * numbers on the page are machine-readable rather than decorative.
 */
export function buildProfileJsonLd(p: PublicProfile): Record<string, unknown> {
  const organisation: Record<string, unknown> = {
    "@type": "Organization",
    "@id": `${p.url}#organization`,
    name: p.companyName,
    description: p.oneLiner,
    address: { "@type": "PostalAddress", addressCountry: "AU" },
  };
  if (p.websiteUrl) organisation.url = p.websiteUrl;

  const variables: Record<string, unknown>[] = [
    {
      "@type": "PropertyValue",
      name: "Startup Value Index",
      value: p.sviTotal,
    },
    ...p.dimensions.map((d) => ({
      "@type": "PropertyValue",
      name: d.label,
      value: d.value,
      minValue: 0,
      maxValue: 100,
    })),
  ];
  if (p.valuation) {
    variables.push(
      {
        "@type": "PropertyValue",
        name: "Indicative valuation (low)",
        value: p.valuation.low,
        unitText: p.valuation.currency,
      },
      {
        "@type": "PropertyValue",
        name: "Indicative valuation (high)",
        value: p.valuation.high,
        unitText: p.valuation.currency,
      },
    );
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      organisation,
      {
        "@type": "Dataset",
        "@id": `${p.url}#analysis`,
        name: `Startup Value Index analysis — ${p.companyName}`,
        description: profileDescription(p),
        url: p.url,
        inLanguage: "en-AU",
        license: `${SITE_URL}/legal/terms`,
        isAccessibleForFree: true,
        dateCreated: p.analysedAt,
        datePublished: p.publishedAt,
        dateModified: p.updatedAt,
        about: { "@id": `${p.url}#organization` },
        creator: {
          "@type": "Organization",
          name: "BlockID.au",
          url: SITE_URL,
        },
        keywords: [
          "Australian startup valuation",
          `${p.sectorLabel} startup Australia`,
          `${p.stageLabel} stage startup`,
          "startup value index",
        ],
        variableMeasured: variables,
      },
    ],
  };
}
