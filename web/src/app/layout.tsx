import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Inter, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { GoogleAnalytics, GTMNoScript } from "@/components/analytics/google-analytics";
import { ConsentBanner } from "@/components/analytics/consent-banner";
import { UtmCapture } from "@/components/analytics/utm-capture";
import {
  OrganizationJsonLd,
  SoftwareApplicationJsonLd,
  WebSiteSearchJsonLd,
} from "@/components/seo/json-ld";
import { Providers } from "@/components/providers";
import { AuthSyncClient } from "@/components/auth/AuthSyncClient";
import { FeedbackWidget } from "@/components/ui/feedback-widget";
import { ResellerRefCapture } from "@/components/marketing/reseller-ref-capture";
import { TranslationProvider } from "@/components/i18n/translation-provider";
import { CloudflareEmailOffEnd, CloudflareEmailOffStart } from "@/components/site/cloudflare-email-off";
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, type Locale } from "@/lib/i18n/locales";
import { buildSeedCatalog } from "@/lib/i18n/seed-catalog";
import { heroLine } from "@/lib/marketing/hero-variants";
import { GTAG_CONSENT_DEFAULT_SCRIPT, THEME_RESTORE_SCRIPT, analyticsIdsFromEnv, gaConfigScript } from "@/lib/security/inline-scripts";
import { publicHashModeEnabled } from "@/lib/security/public-cacheable-routes";
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
// G21 P0-B (2026-09-20): the site og:description every page inherits is the
// FI2 sub-line's first breath (the FI1 H1 is the og:title) — evidence-backed
// assessment infrastructure, no price, no agent count. The homepage
// `metadata` has no `openGraph` of its own (money-finder plan §8.1
// correction 8), so this is what the home card shows too. G1 (the press /
// bio line) stays in the catalogue for the Organization JSON-LD.
const OG_TITLE = `${heroLine("FI1").en.replace(/\.$/, "")} · BlockID.au`;
const SITE_DESCRIPTION = heroLine("FI2").en.split(" — ")[0]!.trim() + ".";
const SITE_URL = "https://blockid.au";
// Same resolver as the proxy CSP hasher, so the rendered gtag bootstrap is
// byte-identical to the hashed one.
const GA_MEASUREMENT_ID = analyticsIdsFromEnv().gaMeasurementId;

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
    "Australian startups",
    "startup intelligence",
    "startup valuation",
    "Startup Value Index",
    "AI analysis",
    "GTM strategy",
    "founder tools",
    "Cap Table",
    "Equity Management",
    "Investor-Ready Data Rooms",
    "ASIC",
    "ESIC",
    "ownership management",
    "pre-diligence",
  ],
  authors: [{ name: "BlockID", url: SITE_URL }],
  creator: "BlockID",
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: SITE_URL,
    siteName: "BlockID.au",
    title: OG_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "BlockID" }],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
  // No root-level `alternates.canonical`. Next merges layout metadata into
  // every page, so a default of SITE_URL told Google "the homepage is the
  // canonical" for every page that set no canonical of its own — 24
  // /startup-index/listings/* pages, /auth/login, /s/* … (release QA-1 #5).
  // The homepage declares its own canonical in `(marketing)/page.tsx`; every
  // other page uses `pageMetadata()` or sets `alternates.canonical` itself.
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION ?? undefined,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // S31-D — the ONE `headers()` call that used to sit here made every route
  // dynamic (`private, no-store`, every `revalidate` inert — capacity audit
  // §3). The nonce is no longer needed by this layout: Next threads it onto
  // its own scripts from the request's CSP header, and the app's inline
  // snippets below are allowed by SHA-256 hash in both CSP modes
  // (lib/security/inline-scripts.ts). What remains is the locale.
  //
  //   CSP_PUBLIC_HASH_MODE unset (default) — read the proxy-resolved locale
  //     from the request header exactly as before. Keeps every route
  //     dynamic, i.e. today's behaviour, until the operator opts in.
  //   CSP_PUBLIC_HASH_MODE=1 — no request access at all. Pages without
  //     their own dynamic API use become static / ISR (the proxy then
  //     serves them under the hash CSP). The locale is resolved on the
  //     client by <TranslationProvider> (URL prefix `/vi`, `blockid_locale`
  //     cookie) and `<html lang>` is synced there; the server always emits
  //     the English document, which is what the DOM-walking translator
  //     translated at runtime anyway.
  //
  // The env var is read at RENDER time: for prerendered pages that is
  // `next build`, so flipping it means a rebuild + deploy — see
  // docs/ops/public-page-caching.md.
  let locale: Locale | undefined;
  if (!publicHashModeEnabled()) {
    const h = await headers();
    const localeRaw = h.get(LOCALE_HEADER) ?? DEFAULT_LOCALE;
    locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  }
  const htmlLang = locale === "vi" ? "vi-VN" : "en-AU";
  const seedCatalog = locale ? buildSeedCatalog(locale) : undefined;

  return (
    <html
      lang={htmlLang}
      className={`${inter.variable} ${plexMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0F172A" />
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
        {/* Both inline scripts below are allowed by SHA-256 hash in the
            proxy's CSP (lib/security/inline-script-hashes.ts) — render the
            shared constants verbatim; an edited copy would be blocked. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_RESTORE_SCRIPT }} />
        {/* Google Consent Mode v2 — set defaults to DENIED BEFORE gtag.js
            loads. Required for OAIC APP 3 / APP 6 (opt-in analytics) and to
            keep GA4 from firing a page_view before the visitor has answered
            the ConsentBanner. `wait_for_update` throttles GA4 for 500ms so
            an immediate accept still captures the first page_view. The
            banner's grantConsent()/denyConsent() helpers then push the
            consent-update. A parser-inserted <head> script always executes
            ahead of the afterInteractive gtag.js tag (it used to be a
            `next/script` beforeInteractive, which needed the nonce). */}
        <script id="gtag-consent-default" dangerouslySetInnerHTML={{ __html: GTAG_CONSENT_DEFAULT_SCRIPT }} />
        {/* gtag('js') + gtag('config') must be QUEUED before any component
            fires an event: gtag.js replays dataLayer in order and drops an
            'event' command that precedes every 'config' (no target yet).
            While this bootstrap was an afterInteractive <Script>, every
            mount-time event (hero_variant_shown, funding_preview,
            *_viewed …) landed in the queue ahead of it — the 2026-09-12
            event audit saw only GA4's automatic events for a whole week.
            The gtag.js loader itself stays afterInteractive
            (components/analytics/google-analytics.tsx). */}
        {GA_MEASUREMENT_ID && (
          <script id="google-analytics" dangerouslySetInnerHTML={{ __html: gaConfigScript(GA_MEASUREMENT_ID) }} />
        )}
      </head>
      <body className="min-h-full bg-surface-50 text-brand-900 dark:text-ink-800 font-sans flex flex-col">
        {/* Release QA-2 F9 — Cloudflare Email Obfuscation rewrote every
            rendered email address (footer support@, invite + onboarding
            emails) into a data-cfemail <span>, which React then failed to
            hydrate (#418, text) on every page. The <!--email_off--> markers
            switch the rewriter off for the whole body. */}
        <CloudflareEmailOffStart />
        <GTMNoScript />
        <Providers>
          {/* Cross-tab SSO sync — Master Upgrade Plan §8.9 stage 2.
              Broadcasts sign-in/out on the `bid-auth` BroadcastChannel
              and calls router.refresh() on peer tab events. Reads
              useSearchParams() (the `?logged_in=true` redirect), so on a
              static page it must sit under Suspense (S31-D) — it renders
              null, so the boundary changes nothing visible. */}
          <Suspense fallback={null}>
            <AuthSyncClient />
          </Suspense>
          {/* `?ref=<CODE>` deep-link capture — writes blockid_via cookie
              before any signup flow reads it. Task M1 (v3 reseller upgrade). */}
          <ResellerRefCapture />
          <TranslationProvider locale={locale} seed={seedCatalog}>
            {children}
          </TranslationProvider>
          <GoogleAnalytics />
          {/* First-touch / last-touch attribution capture — writes to
              localStorage + first-party cookies (bid_ft / bid_lt) so
              server routes (e.g. /api/score) and downstream trackEvent
              calls can enrich payloads with utm_source/medium/campaign,
              gclid, fbclid, and referrer. Suspense-wrapped because it
              reads useSearchParams(). */}
          <Suspense fallback={null}>
            <UtmCapture />
          </Suspense>
          <OrganizationJsonLd />
          <SoftwareApplicationJsonLd />
          <WebSiteSearchJsonLd />
          <FeedbackWidget />
        </Providers>
        {/* GA4 consent-mode v2 banner + always-visible revoke pill. Sits
            outside <Providers> so it hydrates independently of dashboard
            surfaces. Consent-default is denied in the <head> Script above;
            this component only fires the consent-update. Wrapped in Suspense
            because Next 15's client hooks (usePathname) trigger a bail-out
            when a parent tree suspends. */}
        <Suspense fallback={null}>
          <ConsentBanner />
        </Suspense>
        <CloudflareEmailOffEnd />
      </body>
    </html>
  );
}
