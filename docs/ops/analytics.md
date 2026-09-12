# Analytics ops — GTM / GA4 under the strict CSP

Owner: CMO (container), CTO (CSP). Review when a tag is added to the GTM
container or when `web/src/proxy.ts` changes `script-src`.

Related: `docs/analytics/dashboards.md` (BI), `web/src/components/analytics/google-analytics.tsx`
(loader), `web/src/proxy.ts` (`buildContentSecurityPolicy`, the one enforced policy),
`web/src/proxy.test.ts` (pins it).

---

## 1. How the loader and the CSP fit together

- The site ships **one** enforced `Content-Security-Policy`, built per request in
  `web/src/proxy.ts` with a fresh nonce: `script-src 'self' 'nonce-…' 'strict-dynamic' …`.
  There is **no** `Content-Security-Policy-Report-Only` header any more (release QA-1 #9:
  the stale report-only twin lacked the GTM / GA / GSI hosts and produced 6–8 phantom
  violations per page view in any report sink). `proxy.test.ts` fails if either a second
  policy or a report-only header ever comes back — from the proxy, `lib/security-headers.ts`
  or `next.config.ts`.
- `GoogleAnalytics` (root layout) renders the `gtm.js` bootstrap as an inline
  `<Script nonce={nonce}>`. Under `'strict-dynamic'` a nonced script may load whatever it
  injects **with `createElement('script')`** — that is how `gtm.js` itself, `gtag/js` and
  every *native* GTM tag load.

## 2. Custom-HTML tags do not run — convert them to native tags

Release QA-1 #8 (2026-09-12): every page logs two enforced CSP violations,

```
(function(w,i,g){…      Refused to execute inline script …
(function(w,d,s,l){…    Refused to execute inline script …
```

Both come from **Custom HTML** tags in container `GTM-TRHH4MH2`. GTM injects a Custom-HTML
tag's markup with `innerHTML`, which is *parser-inserted*; `'strict-dynamic'` only trusts
scripts inserted with `createElement`/`appendChild`, and the injected inline `<script>` has
no nonce. So those two tags **never execute** — silently, on every page view. GA4 is
unaffected (it is a native tag: `gtag` is present and `dataLayer` fills).

**Do not fix this with script hashes in `proxy.ts`.** The inline snippets change whenever
someone edits the tag (whitespace included) and each edit would ship a broken CSP until the
next deploy. The fix is in the container:

1. In GTM → Tags, filter type = *Custom HTML*. Today there are two (the `(function(w,i,g)`
   and `(function(w,d,s,l)` snippets — the second is a nested GTM/GA bootstrap that should
   not exist inside a container at all).
2. Replace each with the **native tag template** for the vendor (Google Ads conversion,
   GA4 event, LinkedIn Insight, Meta Pixel, Hotjar … all have Community Template Gallery
   templates). Native and template tags load through `createElement` and therefore inherit
   the nonce's trust.
3. If a vendor truly has no template, do **not** paste its snippet into Custom HTML. Add its
   loader as a nonced `<Script>` in `web/src/components/analytics/google-analytics.tsx`
   (next to the GTM bootstrap), add its hosts to `connect-src` / `img-src` in
   `buildContentSecurityPolicy`, and extend `proxy.test.ts`.
4. Delete the Custom-HTML tag, publish the container, then confirm on the live site:
   DevTools → Console on `/pricing` must show **zero** `Refused to execute inline script`
   lines, and `dataLayer` must still carry `gtm.js` / `gtm.dom` / `gtm.load`.

`'unsafe-inline'` is never added to `script-src` for this. A Custom-HTML tag is, by
construction, arbitrary script chosen inside a third-party UI; the CSP blocking it is the
control working.

## 3. Google Sign-In (GSI) hosts

The Sign in with Google button (`/auth/login`) loads `https://accounts.google.com/gsi/client`
as a nonced script and then opens frames and a stylesheet from the **bare origin**
`https://accounts.google.com/` as well as `/gsi/…` paths. `style-src`, `frame-src` and
`connect-src` therefore allow the whole origin (release QA-1 #10 — the `/gsi/`-only allow
list still logged `Framing 'https://accounts.google.com/' violates frame-src`). Do not narrow
it back to a path.

## 4. Checklist for a new tag

- [ ] Native / Community-template tag, not Custom HTML.
- [ ] Every host the tag talks to is in `connect-src` (beacons) and, if it drops pixels,
      `img-src` — see the "every new host is an exfil path" note in `proxy.ts`.
- [ ] `npx vitest run src/proxy` passes (host list is pinned).
- [ ] Console on a production page shows no `Refused to …` line after the container publish.
