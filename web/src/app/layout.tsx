import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { GoogleAnalytics, GTMNoScript } from "@/components/analytics/google-analytics";
import { OrganizationJsonLd, SoftwareApplicationJsonLd } from "@/components/seo/json-ld";
import { Providers } from "@/components/providers";
import { AuthSyncClient } from "@/components/auth/AuthSyncClient";
import { FeedbackWidget } from "@/components/ui/feedback-widget";
import { ResellerRefCapture } from "@/components/marketing/reseller-ref-capture";
import { TranslationProvider } from "@/components/i18n/translation-provider";
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, type Locale } from "@/lib/i18n/locales";
import { buildSeedCatalog } from "@/lib/i18n/seed-catalog";
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

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce is generated per-request by web/src/proxy.ts and echoed onto the
  // `x-nonce` request header. Threaded onto every inline <script> so they
  // satisfy the strict `script-src 'nonce-...'` CSP (no 'unsafe-inline').
  const h = await headers();
  const nonce = h.get("x-nonce") ?? "";
  const localeRaw = h.get(LOCALE_HEADER) ?? DEFAULT_LOCALE;
  const locale: Locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const htmlLang = locale === "vi" ? "vi-VN" : "en-AU";
  const seedCatalog = buildSeedCatalog(locale);

  return (
    <html
      lang={htmlLang}
      className={`${inter.variable} ${plexMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#0F172A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* GA/GTM connection warm-up. Lighthouse (mobile, throttled) flagged
            "Preconnect to required origins" against
            https://www.google-analytics.com at an estimated 300 ms saving:
            Next already emits <link rel="preload" as="script"> for the
            googletagmanager gtag bundle, so that origin's connection is
            opened early, but google-analytics.com is only reached later from
            inside gtag.js — paying full DNS + TCP + TLS on the critical path.
            These are connection hints only; they add no bytes, execute no
            script, and do not touch the nonce-based CSP (connect-src already
            allows google-analytics.com, script-src already allows
            googletagmanager.com). dns-prefetch is the graceful fallback for
            browsers that ignore preconnect. */}
        <link rel="preconnect" href="https://www.google-analytics.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("blockid_theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full bg-surface-50 text-brand-900 dark:text-ink-800 font-sans flex flex-col">
        <GTMNoScript />
        <Providers>
          {/* Cross-tab SSO sync — Master Upgrade Plan §8.9 stage 2.
              Broadcasts sign-in/out on the `bid-auth` BroadcastChannel
              and calls router.refresh() on peer tab events. */}
          <AuthSyncClient />
          {/* `?ref=<CODE>` deep-link capture — writes blockid_via cookie
              before any signup flow reads it. Task M1 (v3 reseller upgrade). */}
          <ResellerRefCapture />
          <TranslationProvider locale={locale} seed={seedCatalog}>
            {children}
          </TranslationProvider>
          <GoogleAnalytics nonce={nonce} />
          <OrganizationJsonLd />
          <SoftwareApplicationJsonLd />
          <FeedbackWidget />
        </Providers>
      </body>
    </html>
  );
}
