"use client";

import Script from "next/script";
import { gaConfigScript, gtmInitScript, safeAnalyticsId } from "@/lib/security/inline-scripts";

// Literal `process.env.NEXT_PUBLIC_*` reads so Next inlines the same values
// into this client bundle that the proxy (which hashes the snippets) sees.
const GA_MEASUREMENT_ID = safeAnalyticsId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
const GTM_ID = safeAnalyticsId(process.env.NEXT_PUBLIC_GTM_ID);

/**
 * Loads GA4 (via gtag.js) and optionally Google Tag Manager.
 *
 * - If only GA_MEASUREMENT_ID is set → standalone GA4.
 * - If GTM_ID is also set → GTM container (which should include the GA4 tag).
 * - Both push to window.dataLayer so custom events from trackEvent() work
 *   regardless of which tag management strategy is used.
 *
 * CSP (S31-D): the two inline bootstraps are the exact strings exported by
 * `lib/security/inline-scripts.ts`, which the proxy allows by SHA-256 hash
 * in both CSP modes — so no nonce is threaded through the root layout any
 * more (the `headers()` read it needed made every page dynamic). The
 * external gtag.js tag is allowed by host (`https://www.googletagmanager.com`
 * in `script-src`). Edit the snippets ONLY in that module.
 */
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID && !GTM_ID) return null;

  return (
    <>
      {/* ── Google Tag Manager (if configured) ── */}
      {GTM_ID && (
        <Script id="gtm-init" strategy="afterInteractive">
          {gtmInitScript(GTM_ID)}
        </Script>
      )}

      {/* ── GA4 gtag.js (always load if measurement ID is set) ── */}
      {GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          {/*
            Consent Mode v2 default (all storage denied) is emitted from
            web/src/app/layout.tsx via an inline <head> script BEFORE this
            file loads. GA4 therefore respects consent even though
            send_page_view remains true — the first page_view is queued
            until the ConsentBanner grants or denies (wait_for_update:500).
          */}
          <Script id="google-analytics" strategy="afterInteractive">
            {gaConfigScript(GA_MEASUREMENT_ID)}
          </Script>
        </>
      )}
    </>
  );
}

/**
 * GTM noscript iframe — place inside <body> for users with JS disabled.
 * Only renders when GTM_ID is set.
 */
export function GTMNoScript() {
  if (!GTM_ID) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
