/**
 * The app's own first-party inline scripts — ONE source of truth for the
 * components that render them (root layout, GoogleAnalytics) and for the
 * proxy's CSP builders, which allow them by SHA-256 hash
 * (`lib/security/inline-script-hashes.ts`).
 *
 * S31-D (2026-09-13). Until now every inline script carried the per-request
 * nonce, which the root layout read via `headers()` — and that single call
 * made every route dynamic (`cache-control: private, no-store`, every
 * `revalidate` export inert; capacity audit §3). Hash sources let the same
 * scripts run without a nonce, so the layout no longer needs `headers()`
 * and public pages can be ISR + edge-cached. Hash sources are honoured in
 * both CSP modes: alongside `'nonce-…' 'strict-dynamic'` (dynamic pages) and
 * in the nonce-less hash policy (prerendered pages).
 *
 * RULES
 *   • The string rendered into the DOM must be byte-identical to the string
 *     hashed — render `{SNIPPET}` / `dangerouslySetInnerHTML` from these
 *     constants, never a copy. `inline-script-hashes.test.ts` pins them.
 *   • Snippets that depend on env (GA / GTM ids) are built by functions so
 *     the renderer and the proxy agree on the same env at runtime.
 *   • Keep this list short: every hash is ~50 bytes on every response.
 *   • This module is imported by a "use client" component — no Node
 *     built-ins here (hashing lives in inline-script-hashes.ts).
 */

/**
 * Dark-mode class restore — runs before first paint so a dark user never
 * sees a light flash. Renders as a plain `<script>` in `<head>`.
 */
export const THEME_RESTORE_SCRIPT =
  `(function(){try{var t=localStorage.getItem("blockid_theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})()`;

/**
 * Google Consent Mode v2 defaults — DENIED before gtag.js loads (OAIC APP
 * 3 / APP 6 opt-in analytics). Must execute ahead of the afterInteractive
 * gtag.js tag; a parser-inserted `<head>` script always does.
 */
export const GTAG_CONSENT_DEFAULT_SCRIPT = [
  `window.dataLayer=window.dataLayer||[];`,
  `function gtag(){dataLayer.push(arguments);}`,
  `gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});`,
].join("");

/** GTM bootstrap (only when NEXT_PUBLIC_GTM_ID is set). */
export function gtmInitScript(gtmId: string): string {
  return (
    `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
    `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
    `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})` +
    `(window,document,'script','dataLayer','${gtmId}');`
  );
}

/** GA4 `gtag('config', …)` bootstrap (only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set). */
export function gaConfigScript(measurementId: string): string {
  return (
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());` +
    `gtag('config','${measurementId}',{send_page_view:true,custom_map:{dimension1:'article_category',` +
    `dimension2:'article_primary_keyword',dimension3:'content_type',dimension4:'article_reading_time'}});`
  );
}

/**
 * Only `[A-Za-z0-9_-]` ids are interpolated into script text; anything else
 * is treated as unset so a malformed env value can never break out of the
 * string literal (and the renderer + hasher drop it the same way).
 */
export function safeAnalyticsId(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

export interface AnalyticsIds {
  gaMeasurementId: string | null;
  gtmId: string | null;
}

/**
 * The analytics ids as the running bundle sees them. `NEXT_PUBLIC_*` reads
 * are literal so Next inlines them identically into the client, server and
 * proxy bundles at build time.
 */
export function analyticsIdsFromEnv(): AnalyticsIds {
  return {
    gaMeasurementId: safeAnalyticsId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    gtmId: safeAnalyticsId(process.env.NEXT_PUBLIC_GTM_ID),
  };
}

/** Every first-party inline script the root layout can render, given the ids. */
export function firstPartyInlineScripts(ids: AnalyticsIds = analyticsIdsFromEnv()): string[] {
  const out = [THEME_RESTORE_SCRIPT, GTAG_CONSENT_DEFAULT_SCRIPT];
  if (ids.gtmId) out.push(gtmInitScript(ids.gtmId));
  if (ids.gaMeasurementId) out.push(gaConfigScript(ids.gaMeasurementId));
  return out;
}
