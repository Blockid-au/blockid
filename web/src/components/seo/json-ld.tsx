export function OrganizationJsonLd() {
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
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
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "50",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function FAQJsonLd({
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
