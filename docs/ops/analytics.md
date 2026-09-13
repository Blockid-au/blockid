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

> **Amended 2026-09-13 (live QA lane 1 F6):** the two snippets are in fact inserted at the
> Cloudflare edge (Google tag gateway), not by the container — see §4 for the founder
> switch. The container guidance below still stands for any Custom-HTML tag that is added.

Both looked like **Custom HTML** tags in container `GTM-TRHH4MH2`. GTM injects a Custom-HTML
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

## 4. Cloudflare-injected scripts (founder step — dashboard only)

Live QA lane 1 F6 (2026-09-13) re-read the two blocked snippets from §2 in the *served*
HTML rather than in the container: they are **not** GTM Custom-HTML tags and they are
**not in this repo** (`grep -rn "google_tags_first_party\|developer_id.dYzg1YT" web/src`
returns nothing — only the nonced loader in `google-analytics.tsx`). Cloudflare inserts them
at the edge, without a nonce, on every HTML response. Under `'strict-dynamic'` they can
never run, so each one costs a console error per page view and nothing else — but if the
CSP were ever relaxed both loaders would double-tag GA4.

**Do not fix this in code.** No hash in `proxy.ts`, no `console.error` filter, no CSP
report suppression — the report is the control working. The switches live in the
Cloudflare dashboard for the `blockid.au` zone and only the founder account can flip
them (the API token has no Zone Settings scope):

| Cloudflare feature | What it injects (signature seen on prod) | Setting |
| --- | --- | --- |
| **Google tag gateway for advertisers** (Tag Management → Google tag gateway; a.k.a. Google tag "first-party mode") | inline `(function(w,i,g){…})('window','GTM-TRHH4MH2','google_tags_first_party')` + a second inline GTM loader carrying `developer_id.dYzg1YT` | **OFF** — the app already loads `GTM-TRHH4MH2` through the nonced `<Script>` |
| **Web Analytics automatic setup** (Analytics & Logs → Web Analytics → the site → *Manage site* → JS snippet) | `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/…" data-cf-beacon="…">` — also the cause of the React #418 hydration mismatch (release QA-1 #2) | **OFF** — if the beacon is wanted, add it as a nonced `<Script>` in `web/src/app/layout.tsx` (host already in `script-src`) |
| **Email Address Obfuscation** (Scrape Shield) | `/cdn-cgi/scripts/…/email-decode.min.js` + `<span class="__cf_email__">` on every mailto (release QA-1 #1 / QA-2 F9) | **OFF** — origin already emits `<!--email_off-->` around addresses |

Verify after flipping each one: `curl -s https://blockid.au/pricing | grep -c
"google_tags_first_party\|beacon.min.js\|email-decode"` must print `0`, and DevTools →
Console on `/pricing` and any `/workspace/*` page must show **zero** `Refused to execute
inline script` / `violates the following Content Security Policy` lines. `dataLayer` must
still carry `gtm.js` / `gtm.dom` / `gtm.load` (the in-app loader).

If a future audit finds one of the §2 snippets *and* the container still lists a
Custom-HTML tag, both fixes apply — the container one in §2, the edge one here.

## 5. Checklist for a new tag

- [ ] Native / Community-template tag, not Custom HTML.
- [ ] Every host the tag talks to is in `connect-src` (beacons) and, if it drops pixels,
      `img-src` — see the "every new host is an exfil path" note in `proxy.ts`.
- [ ] `npx vitest run src/proxy` passes (host list is pinned).
- [ ] Console on a production page shows no `Refused to …` line after the container publish.
