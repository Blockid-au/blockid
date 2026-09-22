# SEO route policy and Evaluator pricing default

Source audit at6e50d4dc9; isolated `g30/seo-route-policy`. No global app layout, analytics, CSP, credentials, Search Console properties, database visibility flags or deployment changes.

## Concrete fixes

- `/tbr/demo` and its public band variants already declare indexable metadata and appear in the sitemap, but inherited the robots `/tbr/` block. Narrow allow rules now cover exactly `/tbr/demo`, its query form and descendants; private `/tbr/<token>` URLs remain blocked and noindex. No private token is enumerated or made public.
-204 authenticated `(app)` pages now inherit shared noindex/nofollow metadata in their route-group layout. Existing authentication remains the real access boundary. The shared metadata helper also refuses index=true for known private routes, including locale variants; sitemap has the same exclusion policy as a final guard. Existing database publication/verification filters for `/listings`, `/reports` and `/id` remain intact.
- Sitemap no longer claims static pages changed at every request or supplies today's date when a dynamic record lacks a date. Actual article/publisher/listing/verification timestamps remain; unknown/invalid dates are omitted. No URL removal merely because a timestamp is unknown.
- `/pricing` and `/vi/pricing` now default to Evaluator. Explicit Founder/Programs and existing persona/tab/tier aliases still resolve. Switching tabs clears obsolete aliases while preserving unrelated campaign parameters; copying a Founder URL retains an explicit segment. Prices, entitlements, billing and checkout destinations are unchanged.

## Route-family coverage

Executable `web/scripts/seo-route-inventory.py` scans exact page.tsx/page.ts/page.mdx filenames, strips route groups and emits source-only metadata declarations. At this source pin:382 pages,204 inside the authenticated app group,34 without a local metadata declaration (may inherit layout metadata or be redirect/client wrappers). Output during this audit: `/tmp/g30-seo-route-inventory.json`. This is not a claim that every route was rendered or that missing local metadata means a defect.

| Family | Source policy / evidence |
| --- | --- |
| Home, pricing, solutions, methodology, tools, funding, editorial/docs | Shared pageMetadata emits canonical and OG/Twitter defaults; existing sitemap static-route tests verify actual route resolution and reject redirect/noindex entries. |
| EN/VI mirrors | pageMetadata and sitemap retain reciprocal en/vi/x-default mappings where mirrors are declared. ES/JA private mirrors remain excluded. No language alternate to a nonexistent translated page was invented. |
| Public demos and showcase | Distinct sample metadata/canonicals retained; fixed the concrete robots contradiction for TBR demo only. |
| Public business IDs, listings and ticker reports | Sitemap continues existing verification/publication loader filters. No private database row was read or publication state changed. |
| Workspace/dashboard/admin/reseller/onboarding/checkout | Authenticated group noindex default plus shared private-path discovery policy; existing login redirect/access check retained. No direct index:true declaration found in these app-group page sources. |
| Auth/login, saved analysis, token TBR, funding report, invitations/apply | Existing page noindex/auth mechanisms retained; shared policy prevents accidental sitemap publication/helper index:true. Some roots are outside app group and must continue their route-level auth/noindex checks. |
| Shared-link `/s/*`, verification proofs, compliance workspace, hidden innovator console | Existing noindex declarations/hidden metadata and auth where implemented retained; shared sitemap/helper policy now excludes these families as well. No share token/proof contents read. |
| API/internal endpoints | Existing robots API exclusion retained. No API response headers or proxy/CSP changes made. |
| JSON-LD | Shared Organization/WebPage/Breadcrumb/ItemList builders inspected and existing shape tests run. No fabricated ratings, reviews, offers or company data added. Shape validation is not a Google rich-result eligibility certificate. |

Root metadata already avoids an inherited homepage canonical and has metadataBase/OG defaults; no global-layout edit was needed. Canonical/hreflang source tests protect existing EN/VI behavior. Public sample pages are the appropriate indexed report examples; private customer report URLs stay outside discovery.

## Verification and limits

Focused tests cover private/public boundary cases, demo exception scope, stored-only modification dates, sitemap route/duplicate/visibility contracts, canonical/locale helpers, JSON-LD builders, pricing SSR default and explicit aliases. Scoped noEmit TypeScript passed for shared SEO/robots/tab helpers with a private configuration and incremental output disabled. All Vitest runs use cache=false. No full build, live crawler, private report render or Search Console inspection was performed.

Next deployment acceptance should check actual robots.txt/sitemap.xml, representative EN/VI canonical/hreflang, unauthenticated app redirects and demo crawlability; later Search Console evidence can confirm observed indexing. Google may still display a robots-blocked URL learned elsewhere; noindex requires crawl access, and authentication remains the privacy mechanism. Do not remove private crawl restrictions merely to chase deindexing without considering the route's access contract.

Official references: [Google robots introduction](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [sitemap lastmod guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [localized page annotations](https://developers.google.com/search/docs/specialty/international/localized-versions). Installed Next documentation read: `next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md` and `04-functions/generate-metadata.md`, including nested metadata replacement behavior.

Final focused result before integration:81 tests passed across7 suites; the added shared-link/proof/compliance exclusion cases were rerun separately. No live indexability claim is made.
