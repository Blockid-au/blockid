import { heroLine } from "@/lib/marketing/hero-variants";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import {
  buildItemListJsonLd,
  buildWebPageJsonLd,
  type ItemListJsonLdInput,
  type WebPageJsonLdInput,
} from "@/lib/seo/structured-data";

/**
 * JSON-LD blocks are `type="application/ld+json"` data blocks: browsers
 * never execute them and the CSP inline check runs only for JavaScript
 * types, so they carry no nonce. (S31-D removed the `headers()` read that
 * used to fetch one — it made every page that rendered these dynamic.)
 */

export async function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BlockID.au",
    legalName: LEGAL_ENTITY.operator,
    // QA-3 P2 (2026-09-12): ABN as schema.org taxID; support inbox, not admin@.
    taxID: LEGAL_ENTITY.abn,
    url: "https://blockid.au",
    logo: "https://blockid.au/images/logo-transparent.png",
    // G18-C: G1 from the speakable catalogue — the same sentence as the
    // site og:description (docs/design/messaging.md § 1).
    description: heroLine("FI2").en,
    alternateName: ["BlockID", "Startup Value Index"],
    email: "support@blockid.au",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Sydney",
      addressRegion: "NSW",
      addressCountry: "AU",
    },
    sameAs: [],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * WebSite + SearchAction JSON-LD — powers Google's sitelinks search box on
 * the SERP. The `target` URL matches the /score search route so a query
 * typed into the sitelinks box lands directly on the SVI funnel. Added
 * 2026-09 as part of the P1 SEO backlog closure.
 */
export async function WebSiteSearchJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BlockID.au — Startup Value Index",
    alternateName: ["BlockID", "Startup Value Index"],
    url: "https://blockid.au",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://blockid.au/score?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function SoftwareApplicationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BlockID.au — Startup Value Index",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://blockid.au",
    description:
      "Startup Value Index by BlockID: one rubric for every deal — 8 SVI dimensions, an evidence-backed AUD valuation range and an Investor Dossier for any Australian startup.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "AUD",
      description: "Founders get their first Startup Value Index score free",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function WebPageJsonLd(input: WebPageJsonLdInput) {
  const data = buildWebPageJsonLd(input);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function ItemListJsonLd(input: ItemListJsonLdInput) {
  const data = buildItemListJsonLd(input);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function FAQJsonLd({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function ArticleJsonLd({
  title,
  description,
  url,
  publishedAt,
  updatedAt,
  authorName,
}: {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  updatedAt?: string;
  authorName?: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url,
    datePublished: publishedAt,
    dateModified: updatedAt ?? publishedAt,
    author: {
      "@type": "Organization",
      name: authorName ?? "BlockID.au",
      url: "https://blockid.au",
    },
    publisher: {
      "@type": "Organization",
      name: "BlockID.au",
      logo: {
        "@type": "ImageObject",
        url: "https://blockid.au/images/logo-transparent.png",
      },
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
