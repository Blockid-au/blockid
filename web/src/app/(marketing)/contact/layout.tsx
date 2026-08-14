import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us — BlockID.au",
  description:
    "Get in touch with the BlockID team. Based in Sydney, Australia. We respond within one business day.",
  alternates: {
    canonical: "https://blockid.au/contact",
  },
  openGraph: {
    title: "Contact Us — BlockID.au",
    description: "Get in touch with the BlockID team. Based in Sydney, Australia.",
    url: "https://blockid.au/contact",
    siteName: "BlockID.au",
    type: "website",
    locale: "en_AU",
    images: [{ url: "/images/logo-full.png", width: 1556, height: 880, alt: "BlockID.au" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Us — BlockID.au",
    description: "Get in touch with the BlockID team. Based in Sydney, Australia. We respond within one business day.",
    images: ["/images/logo-full.png"],
  },
};

const contactPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact BlockID.au",
  url: "https://blockid.au/contact",
  description:
    "Get in touch with the BlockID team for support, partnership enquiries, or product questions.",
  mainEntity: {
    "@type": "Organization",
    name: "BlockID.au",
    legalName: "Auschain Pty Ltd",
    url: "https://blockid.au",
    email: "admin@blockid.au",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Sydney",
      addressRegion: "NSW",
      addressCountry: "AU",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "admin@blockid.au",
      availableLanguage: "English",
      areaServed: "AU",
    },
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactPageJsonLd) }}
      />
      {children}
    </>
  );
}
