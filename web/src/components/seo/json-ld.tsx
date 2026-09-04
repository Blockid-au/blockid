import { headers } from "next/headers";
import {
  buildItemListJsonLd,
  buildWebPageJsonLd,
  type ItemListJsonLdInput,
  type WebPageJsonLdInput,
} from "@/lib/seo/structured-data";

/**
 * Read the per-request CSP nonce (set by `web/src/proxy.ts` and echoed on
 * the `x-nonce` request header). All JSON-LD `<script>` tags below must
 * emit this nonce so they satisfy the strict `script-src 'nonce-...'`
 * directive (no 'unsafe-inline'). Returns undefined outside a request
 * scope so unit tests do not throw.
 */
async function readNonce(): Promise<string | undefined> {
  try {
    const h = await headers();
    return h.get("x-nonce") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function OrganizationJsonLd() {
  const nonce = await readNonce();
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BlockID.au",
    legalName: "Auschain PTY LTD",
    url: "https://blockid.au",
    logo: "https://blockid.au/images/logo-transparent.png",
    description:
      "The agentic AI valuation platform for business growth from day one. Index valuation, ownership, and execution milestones from idea to scale.",
    email: "admin@blockid.au",
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
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function SoftwareApplicationJsonLd() {
  const nonce = await readNonce();
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "BlockID.au — Startup Value Index",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://blockid.au",
    description:
      "AI-powered startup valuation, ownership management, and investor readiness platform for Australian founders.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "AUD",
      description: "First SVI analysis free",
    },
  };
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function WebPageJsonLd(input: WebPageJsonLdInput) {
  const nonce = await readNonce();
  const data = buildWebPageJsonLd(input);
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function ItemListJsonLd(input: ItemListJsonLdInput) {
  const nonce = await readNonce();
  const data = buildItemListJsonLd(input);
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function FAQJsonLd({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  const nonce = await readNonce();
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
      nonce={nonce}
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
  const nonce = await readNonce();
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
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
