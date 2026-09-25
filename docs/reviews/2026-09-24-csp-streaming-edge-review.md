# Public login/sample CSP and hydration investigation

24 September 2026, approximately 23:40–23:43 UTC. Read-only anonymous public/direct-origin HTTP and browser checks against the releases in [CFO deployment receipt](2026-09-24-cfo-production-deployment.md). **Source correction implemented and tested locally; not deployed.** No Cloudflare configuration, runtime content, accounts, notifications or release processes changed.

## Findings and scope

Two different edge behaviors cause the reported console messages. Login hydration has a source-owned streaming guard defect. The sample report's two blocked scripts are separate edge-injected Google Tags bootstrap scripts, not broken first-party CSP hashes.

| Surface | Observed result |
| --- | --- |
| Public `/auth/login` | Footer email rewritten to `span.__cf_email__[data-cfemail]`; injected `/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js` blocked by nonce/strict-dynamic CSP; React recoverable hydration error #418 reproduced. Two additional inline Google Tags scripts blocked |
| Direct active origin `127.0.0.1:4143/auth/login` | No obfuscated email, no CSP or React page errors in independent browser check |
| Direct warm origin `127.0.0.1:4142/auth/login` | Same clean result; confirms the issue is not new login chunk logic |
| Public `/sample-business-report` | Two inline CSP violations reproduced; no obfuscated email or React page error in this scoped check |
| Direct sample HTML on both origins | First-party executable inline scripts match response hashes; no edge Google Tags bootstrap snippets |

Origin probes are diagnostic loopback requests and do not certify production authentication. No credentials were entered and no login email or other account action was sent. Signed-out Google One Tap/FedCM messages remain separate from the hydration finding.

## Login root cause: logical DOM order is not streamed wire order

The root layout already emits `<!--email_off-->` and `<!--/email_off-->` inside hidden spans at the start/end of the body. In captured active-origin login HTML, the closing marker's wrapper appears at byte **10,467**, while the real footer mail link arrives at byte **29,774** in a later React Suspense segment. The footer is logically inside the body but is transmitted **after** the root opt-out has closed. Cloudflare therefore receives an unprotected footer email and rewrites both its mail link/text before hydration.

Public HTML contains the expected obfuscation span and injected decoder; neither appears in either origin response. The edge removes the opt-out comment tokens from the processed output; this alone is not evidence of HTML minification causing the fault. The decisive evidence is the late footer's position after the closing marker on the origin wire.

Next's installed streaming guide (`web/node_modules/next/dist/docs/01-app/02-guides/streaming.md`) describes Suspense segments arriving after the static shell. [Cloudflare's documented local email opt-out](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/) applies to text between the comment markers; it does not infer React component ancestry.

## Minimal source correction

- `web/src/components/marketing/footer.tsx`: emit an adjacent opening/closing email-off pair around the complete support mail anchor, including `href`. The pair travels with the footer in the same resolved segment.
- `web/src/components/site/cloudflare-email-off.tsx`: document why root-body markers cannot protect later streamed content by themselves.
- `web/src/components/marketing/footer.test.tsx`: add a real React `renderToPipeableStream`/Suspense regression. Delay the footer until after the root closing marker has been flushed; assert that the most recent rewriter toggle before the mail anchor is now its local opening marker and that the local close follows the anchor.

CSP directives, nonces, hashes, source allowlists and console filters are unchanged. No `unsafe-inline`, decoder allowance, hash for injected code, hydration suppression or disabled SSR was added. The correction targets the reproduced shared-footer issue; other email-bearing late segments require their own local protection if encountered.

## Separate sample/login inline scripts: edge configuration still outstanding

A real browser document response contains two unnonced scripts absent from direct-origin HTML:

1. A bootstrap pushing `GTM-TRHH4MH2` into `google_tags_first_party`.
2. A bootstrap setting `developer_id.dYzg1YT` and dynamically creating a script with `src='/2msc/'`.

The browser reports these as the two blocked inline scripts; their suggested hashes are `sha256-VCrOjv7h5SOfH2PqfdfiHaZPB7uV+SdgfWUz0zpxF9o=` and `sha256-TZ8iak8EOX/gjO/QgcZyFyLgVJCaL6G4LRRxc8LCeX8=`. Public responses vary with request/browser conditions: the minimal Python HTTP fetch did not contain this pair, while browser navigation did. These signatures also match the repository's already documented first-party Google Tags edge signatures.

The exact dashboard feature/rule responsible cannot be proven from response HTML alone without reading edge configuration. A configuration owner should identify and disable the duplicate edge injection for these pages, or establish a separately reviewed CSP/consent-compatible integration. This task does not change the edge or admit those scripts. Adding their hashes merely to silence warnings would execute previously blocked analytics code and is not this fix.

## Verification and remaining acceptance

`npx vitest run src/components/marketing/footer.test.tsx src/components/site/cloudflare-email-off.test.tsx src/app/auth/login/page.test.tsx` — **3 suites, 14 tests passed**. Includes real streamed regression, guard markup and existing signed-in/signed-out deterministic login render checks.

Browser diagnostics used the Playwright skill CLI with the already installed Chromium executable; no browser/dependency installation. Diagnostic HTML resides in task-specific `/tmp/cfo-edge-*.html`; browser log `.playwright-cli/console-2026-09-24T23-41-09-670Z.log` records the public violations and #418. No full build, deployment, authenticated production login or post-fix edge acceptance was performed.

After the next authorized deployment, recheck anonymous public login raw HTML and browser hydration: footer remains readable, no `data-cfemail`/decoder, no #418. The two Google Tags inline blocks can remain until the separate edge issue is resolved; do not report a completely clean browser console while they persist.
