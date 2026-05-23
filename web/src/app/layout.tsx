import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { GoogleAnalytics, GTMNoScript } from "@/components/analytics/google-analytics";
import { OrganizationJsonLd, SoftwareApplicationJsonLd } from "@/components/seo/json-ld";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const SITE_NAME = "BlockID.au — Startup Value Index";
const SITE_DESCRIPTION =
  "Measure, prove and grow your startup value from day one. Get your free Startup Value Index. Evidence-backed scoring for Australian founders.";
const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: "%s | BlockID.au",
  },
  description: SITE_DESCRIPTION,
  applicationName: "BlockID.au",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  keywords: [
    "Trusted Ownership",
    "Cap Table",
    "Equity Management",
    "Australian startup",
    "Investor-Ready Data Rooms",
    "Valuation Intelligence",
    "Fundraising",
    "ASIC",
    "ESIC",
    "ownership management",
    "startup ownership",
    "pre-diligence",
  ],
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE_URL,
    siteName: "BlockID.au",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [{ url: "/images/logo-full.png", width: 1556, height: 880 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/images/logo-full.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION ?? undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#0F172A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("blockid_theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full bg-surface-50 text-brand-900 dark:text-ink-800 font-sans flex flex-col">
        <GTMNoScript />
        <Providers>
          {children}
          <GoogleAnalytics />
          <OrganizationJsonLd />
          <SoftwareApplicationJsonLd />
        </Providers>
      </body>
    </html>
  );
}
