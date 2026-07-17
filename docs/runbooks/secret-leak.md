# Secret Leak Runbook

Owner: CISO (primary), CTO (secondary). On-call: platform on-call rotation.
Severity: **P0** when the leaked credential grants write access to production data
(Supabase service_role, Stripe live secret, Cloudflare DNS token, session-signing
secret, `AUDIT_HMAC_SECRET`). **P1** for scoped read-only or third-party sandbox keys.

Trigger: any secret matching a credential pattern committed to any BlockID.au git
repository (public GitHub `Blockid-au/*` or the internal mirror), pasted into a
chat channel or a public artefact, or surfaced by GitHub secret scanning /
truffleHog. **Assume compromise from the first commit that carried the secret** —
do not wait for evidence of exploitation.

---

## 1. Rotate the leaked secret immediately

Rotation is done first, before history rewrite, because rewriting history does
nothing if attackers already scraped the commit.

**Cloudflare DNS API token**
```
op read op://blockid/cloudflare/dns-token-new | \
  CF_DNS_API_TOKEN=$(cat) bash web/scripts/dns/rotate-cf-token.sh
```
Delete the old token in the Cloudflare dashboard once the rotation script
confirms the new one authenticates. Verify DMARC + SPF still resolve.

**Stripe live secret key**
```
STRIPE_ADMIN_TOKEN='...' \
  bash web/scripts/stripe/rotate-restricted-key.sh --scope=live
```
The script creates a replacement restricted key, updates `web/.env` on the app
box, restarts the Next.js server, and revokes the old key. Reconcile any
in-flight webhooks — Stripe retries them for 3 days.

**Supabase `service_role` / `AUDIT_HMAC_SECRET`**
The Supabase dashboard is the source of truth. Rotate under Project Settings ->
API, then update `SUPABASE_SERVICE_ROLE_KEY` in `web/.env` and restart. For
`AUDIT_HMAC_SECRET` follow §4.3 of `docs/AUDIT-CHAIN-RUNBOOK.md` — rotation
writes an `hmac_secret_rotated` row into the chain.

## 2. Rewrite git history (`git filter-repo`)

BFG is deprecated for our workflow; use `git filter-repo` (installed on the app
box, not a runtime dep). Work from a fresh clone — never rewrite on the deploy
tree.

```
git clone --mirror git@github.com:Blockid-au/blockid.au.git /tmp/repo-scrub
cd /tmp/repo-scrub
git filter-repo --invert-paths --path web/.env --path web/.env.local
# for a single leaked value use a replacements file:
echo 'sk_live_REDACTED_ORIGINAL==>sk_live_REDACTED' > /tmp/replacements.txt
git filter-repo --replace-text /tmp/replacements.txt
```

## 3. Force-push and warn the team

```
git push --force --all
git push --force --tags
```
Post to `#security-critical`: "History rewritten on `blockid.au`. All local
clones must be deleted and re-cloned — old commits are gone. Do not attempt to
merge a branch from a pre-rewrite clone." Any open PR must be closed and
re-opened from a fresh branch.

## 4. Audit access logs for the exploitation window

For each rotated credential, pull provider logs covering the interval from the
leaking commit's `AuthorDate` through rotation timestamp:

- Cloudflare: Account Home -> Audit Log; filter by the leaked token.
- Stripe: Dashboard -> Developers -> Logs; filter by API key id.
- Supabase: `select * from postgres_logs where timestamp > '<leak_ts>'` plus
  Studio -> Reports -> API for anonymised IP hits.

Flag any request originating from an IP outside our ASN allow-list
(`web/scripts/security/asn-allowlist.json`) as suspected exploitation. Preserve
raw log exports under `/secure-backup/secret-leak-<utc>/`.

## 5. Privacy Act 1988 assessment

If the credential could have exposed personal information (`app_users`,
`consent_events`, `equity_requests` detail column) treat this as an eligible
data breach under Part IIIC of the Privacy Act 1988 (Cth). Section 26WK
requires an assessment within 30 days of becoming aware; if serious harm is
likely, notify affected individuals and the OAIC as soon as practicable. Cross-
reference `docs/runbooks/privacy-act-72h-clock.md` for the notification template
and clock start conventions.

## 6. Post-mortem

Open a `SEV-1` incident record, link the offline log exports and the rotation
commit hashes, and schedule a blameless post-mortem within 5 business days
using the template at `docs/legal/templates/post-mortem.md`. Publish the
sanitised version to `web/content/reports/post-mortems/`.
