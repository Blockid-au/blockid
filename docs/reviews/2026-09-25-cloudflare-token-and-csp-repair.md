# Cloudflare credentials and live CSP correction —25September2026

Applied and checked at approximately01:12UTC. This supersedes the outstanding
Google Tag Gateway CSP issue in the earlier bugfix deployment receipt.

## Credentials and scope

The two supplied tokens were verified through zone-scoped API reads: the first
accesses startupvalueindex.com; the second accesses blockid.au. Token values are
not included in this receipt or version control. Local BlockID .env/.env.runtime
and SVI .env.local now use the correct per-domain configuration credentials.
All three environment files are ignored by Git and mode0600. Private recovery
material is under the owner's mode0700 state directory, with token files0600.
Existing frozen release/process environment was not rewritten.

Both new tokens permit reading Google Tag Gateway configuration; the BlockID
token also successfully updated it. Both reject cache purge. The previously
working BlockID cache-only token was retained separately after a successful
bounded URL purge; it also cannot purge the SVI zone. SVI cache purge still
requires Cache Purge permission or a separate cache-scoped token.

The canonical purge helper now supports CLOUDFLARE_API_TOKEN_SVI and optional
CLOUDFLARE_CACHE_PURGE_TOKEN / CLOUDFLARE_CACHE_PURGE_TOKEN_SVI overrides, retaining
shared-token fallback. No failed purge is relabelled successful. Fake-token
routing checks passed for shared, separate, cache-override and dotenv modes;
bash syntax and diff checks passed. No app source/bundle changed in this step.

## Live edge correction

BlockID API read confirmed enabled:true, endpoint:/2msc,
measurementId:GTM-TRHH4MH2, hideOriginalIp:true, setUpTag:true. This matches the
observed injected script signatures. Original configuration was retained in
private state. A first minimal change to setUpTag:false read back successfully
but two CSP violations still reproduced. Subsequently enabled:false was applied
and read back exactly, retaining endpoint, ID and privacy fields. A bounded
BlockID URL cache purge succeeded with the existing cache credential.

SVI's gateway API returned200/success with null configuration; no gateway was
created or modified there. CSP directives and application analytics/consent code
were not altered. The change disables the BlockID zone-wide gateway rewrite;
application-owned analytics integration remains in the existing build.

Primary API reference:
https://developers.cloudflare.com/api/resources/google_tag_gateway/subresources/config/

## Browser and health evidence

Independent Playwright navigation after the edge change:
- BlockID canonical /auth/login: no injected gateway bootstrap/loader, no
  email-decoder, no obfuscated email and no CSP/hydration error observed.
- BlockID /sample-business-report: loaded without the previously observed CSP
  errors in this navigation.
- SVI /valuation/scenario: loaded with no console errors in this navigation.

Signed-out identity-provider diagnostics, if emitted, are not an authenticated
login test. No login, paid inference, report generation or email was initiated.

Public health remained healthy: BlockID source
0d84e5f7e77aca0b0f9ca82e61feb3024dceec8c and SVI build
GtvDnB3yUdpYr52nnj5g8. The repair is live Cloudflare configuration; no application
rebuild/redeployment was necessary. Prior full regression evidence remains in
2026-09-25-bugfix-live-deployment.md; this check does not claim every app bug or
remaining G31/G32/G33 acceptance item is closed.
