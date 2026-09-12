// Cloudflare "Email Address Obfuscation" guard (release QA-2 F9).
//
// Root cause of React #418 ("server HTML didn't match the client", text)
// on every page that renders an email address (/auth/login, /pricing,
// /funding/report/demo, /invites/[token], /dashboard/onboarding …):
// Cloudflare's Scrape Shield rewrites `support@blockid.au` in the streamed
// HTML to
//   <a href="/cdn-cgi/l/email-protection#…"><span class="__cf_email__"
//   data-cfemail="…">[email&#160;protected]</span></a>
// and injects `/cdn-cgi/scripts/…/email-decode.min.js` to undo it in the
// browser. That script has no nonce, so the strict CSP blocks it, and
// React then hydrates a text node against a <span> — mismatch, tree
// regenerated on the client. Origin HTML (localhost:4001) is clean; the
// Cloudflare-served copy carries `data-cfemail`.
//
// Cloudflare documents `<!--email_off--> … <!--/email_off-->` as the
// in-page opt-out. JSX cannot emit comment nodes, so the markers are
// written through dangerouslySetInnerHTML on hidden, empty spans placed
// as the first and last children of <body>. Cloudflare's rewriter toggles
// on the comment token itself, so element boundaries do not matter; React
// never diffs innerHTML during hydration, so the wrappers are inert.
//
// The dashboard-level fix (Scrape Shield → Email Address Obfuscation →
// Off) is the belt to this brace; both are safe together.

export const EMAIL_OFF_OPEN = "<!--email_off-->";
export const EMAIL_OFF_CLOSE = "<!--/email_off-->";

export function CloudflareEmailOffStart() {
  return (
    <span
      hidden
      aria-hidden="true"
      data-cf-email-off="start"
      dangerouslySetInnerHTML={{ __html: EMAIL_OFF_OPEN }}
    />
  );
}

export function CloudflareEmailOffEnd() {
  return (
    <span
      hidden
      aria-hidden="true"
      data-cf-email-off="end"
      dangerouslySetInnerHTML={{ __html: EMAIL_OFF_CLOSE }}
    />
  );
}
