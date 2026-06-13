"use client";

import Script from "next/script";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

/**
 * Loads GA4 (via gtag.js) and optionally Google Tag Manager.
 *
 * - If only GA_MEASUREMENT_ID is set → standalone GA4.
 * - If GTM_ID is also set → GTM container (which should include the GA4 tag).
 * - Both push to window.dataLayer so custom events from trackEvent() work
 *   regardless of which tag management strategy is used.
 */
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID && !GTM_ID) return null;

  return (
    <>
      {/* ── Google Tag Manager (if configured) ── */}
      {GTM_ID && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      )}

      {/* ── GA4 gtag.js (always load if measurement ID is set) ── */}
      {GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', {
                send_page_view: true,
                custom_map: {
                  dimension1: 'article_category',
                  dimension2: 'article_primary_keyword',
                  dimension3: 'content_type',
                  dimension4: 'article_reading_time',
                },
              });
            `}
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
