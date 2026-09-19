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

---

## 6. G16-A — server-side funnel events (2026-09-19)

The first-dollar funnel is measured **server-side** in `analytics_events`
(`web/supabase/migrations/0077`), not in GA4: the CSP never lets dev hydrate,
ad-blockers drop gtag, and GA4 cannot exclude QA accounts. GA4 still receives
the Measurement-Protocol mirror of every row (`lib/analytics/server.ts`).
Spec: `docs/plans/first-dollar-2026-09-19.md` § 3 A.

### Steps, emit points, idempotency

Names + params are typed once in `web/src/lib/analytics/events.ts`
(`AnalyticsEvent`); every server emit goes through `web/src/lib/analytics/funnel.ts`,
which stamps `qa: true` for live-QA accounts (`isQaEmail`: `qa-live-<stamp>`,
`qa-live-member-<stamp>`, `qa-live-evaluator-<stamp>` @blockid.au) and a
deterministic `event_id` (uuid-shaped SHA-1) where a step must fire once —
`analytics_events.event_id` is UNIQUE and the sink upserts with
`ignoreDuplicates`, so a retry cannot double-count.

| Event | Params | Emitted by | `event_id` key |
|---|---|---|---|
| `sign_up` | `method` (email · magic_link · google · card · temp_password) · `segment` · `persona?` · `qa?` | `lib/auth.ts` on every `app_users` creation (magic link, Google, password, auto-create) · `api/auth/register-with-card` (`card`, persona = account_type) | user id |
| `svi_analyze` | `project_id` · `first` · `score?` · `analysis_id?` · `qa?` | `POST /api/intake` (the S32 first-analysis path — `first` = no earlier saved run for the user, or no prior anon run) · `POST /api/svi` (`first` = no `svi_analysis_usage` row) | user id (or anon key) when `first`, random otherwise |
| `svi_score_computed` | `project_id` · `score` · `slug` · `user_id?` · `analysis_id?` · `qa?` | same two routes once the row exists | analysis id / slug |
| `report_view` | `tier` (free · paid · plan) · `project_id` · `pages_est?` · `qa?` | `/workspace/reports/business` page render (tier from the plan, else a PAID/GENERATING/READY `report_orders` row, else free) · client via `/api/analytics/event` | random (reducer counts distinct actors) |
| `paywall_view` | `surface` · `sku` · `amount_cents` · `project_id?` · `qa?` | **client only** (lane B) via `POST /api/analytics/event` — anonymous `/tbr/*` allowed with the `blockid_anon` session | random |
| `checkout` | `sku` · `amount_cents` · `project_id?` · `order_id?` · `qa?` | `POST /api/reports/checkout` once the Stripe session exists (server truth) · client click via `/api/analytics/event` | Stripe session id |
| `trust_report_purchased` | `sku` · `gross_aud_cents` · `reconciled` · `user_id` · `session_id` · `qa?` | Stripe webhook `checkout.session.completed` (`qa` from the `bid_qa` metadata the checkout route stamps, or the customer e-mail) | — (webhook dedupe) |
| `feature_gate_hit` | `feature` · `source` · `plan` · `segment` · `qa?` | `lib/entitlements.ts recordGateHit` (pass `email` on `UserWithPlan` to get the flag) | random |

### Client ingest — `POST /api/analytics/event`

```
fetch("/api/analytics/event", {
  method: "POST", keepalive: true, headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "paywall_view", params: { surface: "tbr_unlock_rail", sku: "trust_report_5aud", amount_cents: 300, project_id } }),
});
```

One event per call; body `{ name, params?, session_id?, consent_granted? }`.
Allow-list `CLIENT_EMITTABLE_EVENTS` = `paywall_view` · `checkout` · `report_view`
· `dashboard_view` · `share_link_open`; anonymous callers may send only
`paywall_view` / `share_link_open` and must have a session (`blockid_anon`
cookie or `session_id`). The server sets `user_id` (cookie session) and `qa`,
strips `user_id` / `qa` / `email` / `session_id` from the body, rejects PII-looking
values (`trackEvent` guard), rate-limits 60 / min per user (or session / IP)
and stores rows with `source = "client"`. Audit: allow-listed as telemetry in
`src/lib/audit/allowlist.json` (no state of record). `/api/analytics/ingest`
(bearer-token batch SDK) is unchanged.

### Reading it

- `scripts/funnel-report.mjs` (02:50 UTC daily · Mon 03:05 `--weekly`) →
  `content/reports/funnel-daily.jsonl` + `funnel-latest.json` — see
  `docs/ops/crontab-setup.md` § G16-A for the row shape and counting rules.
- `/admin/funnel` renders those files + a live "today so far" query.
- `traction-snapshot.json` → `funnel_7d_v2` (same reducer; `funnel_7d` — top
  event names — is kept for older consumers).
- Ad-hoc: `select event_name, count(*) from analytics_events where ts > now() - interval '14 days' and coalesce((params->>'qa')::boolean, false) = false group by 1 order by 2 desc;`
