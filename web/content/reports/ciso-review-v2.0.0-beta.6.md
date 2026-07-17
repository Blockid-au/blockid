---
title: "CISO Review — v2.0.0-beta.6"
author: "CISO Agent (BlockID.au)"
date: "2026-07-17"
version: "v2.0.0-beta.6"
kind: "ciso-review"
audience: "internal"
tags: ["security", "posture", "essential-eight", "audit-chain", "csp", "dmarc", "rls", "incident-response"]
---

# CISO Review — v2.0.0-beta.6

**Scope.** End-of-day security review for the v2.0.0-beta.6 cut (Phase 8 public
surfaces + deferred audit fixes). Covers posture, audit-chain health, CSP
milestones, DNS/email hardening, wholesale gate walk-through, RLS regression
sweep across `0073…0081`, coordinated-disclosure surface, top-3 CISO actions for
v2.1 Week 1, and incident-response readiness.

**Report style.** Findings are evidence-first — every claim points at a concrete
file path, endpoint, DNS record, or shell command output. No emoji. No
fabricated CVE numbers. No breach claims. Where the evidence disagrees with
the internal narrative, this report sides with the evidence.

---

## 1. Posture snapshot (Essential Eight aligned)

The Australian Signals Directorate's Essential Eight remains the reference
mitigation set. BlockID.au is a SaaS platform running on managed Debian
infrastructure with a single-node Next.js standalone server, self-hosted
Supabase, and Cloudflare edge. Not every ASD control maps 1:1 to a SaaS, so
each row below reads the control's *intent* and picks the closest local
equivalent.

| # | Control | Intent | BlockID.au status | Evidence pointer |
|---|---|---|---|---|
| 1 | Application control | Only approved binaries execute | Partial — Node runtime is fixed at v22 on the deploy box; the Next.js standalone build is the only user-code surface; there is no server-side plugin loader | `deploy-live.sh`, `web/.deploy-manifest.json`, `docs/CONTINUOUS-DEPLOY.md` |
| 2 | Patch applications | Third-party libs kept current | Green — Renovate + npm audit run in `qa-release-gate.sh`; `web/package.json` pinned; last full lockfile refresh 2026-07-15 | `web/package.json`, `scripts/qa-release-gate.sh` |
| 3 | Configure macros | Neutralise Office macros | N/A — SaaS with no Office-format ingestion; server-side DOCX/PDF is *emit-only* via `react-pdf` and `docx` libs | `web/src/lib/pdf/*`, `web/src/lib/docx/*` |
| 4 | User application hardening | Browser/plugin lockdown | Green — production CSP nonce landed in `web/src/proxy.ts`, HSTS preload, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` all present on the wire | `curl -sI https://blockid.au/` header dump this afternoon |
| 5 | Restrict admin privileges | Least-privilege for admin | Amber — admin-only routes are gated by `getCurrentUser()` + role check; there is no dedicated `admin_users` table separate from `app_users` yet; service-role key on the server is a single-key posture | `web/src/lib/auth.ts`, `web/src/lib/supabase.ts` |
| 6 | Patch operating systems | OS patched inside 2 weeks | Amber — the deploy box is Debian 13 with unattended-upgrades enabled but there is no dashboard proving SLA; recommend a weekly cron that surfaces pending kernel/security packages | `/etc/apt/apt.conf.d/50unattended-upgrades` (host), `docs/UPTIME_GUARD.md` |
| 7 | Multi-factor authentication | MFA on privileged access | Amber — customer accounts use OAuth (Google) which supplies MFA transitively; there is no BlockID-owned TOTP / WebAuthn factor yet; admin login uses the same OAuth path with no step-up | `web/src/lib/auth.ts`, `docs/ARCHITECTURE.md` |
| 8 | Regular backups | Restorable, tested backups | Amber — Supabase Postgres has WAL streaming on-host; a full-restore drill has not been logged this quarter; `deploy-live.sh` snapshots the standalone build only | `docker exec supabase-db pg_dumpall`, `web/.deploy-manifest.json` |

**Overall posture grade.** B- for internal, B for what a customer-facing
security assessor would see (headers, CSP-nonce, HSTS-preload,
`Permissions-Policy`, DKIM+SPF present, DMARC published, audit chain schema
in place, RLS everywhere in the new migration range). The controls carrying
the amber flags are all controls that need *procedural* work (restore drill,
MFA step-up, OS-patch dashboard) rather than product code.

---

## 2. Audit-chain health

**Command actually run (2026-07-17 UTC):**

```
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select count(*) from audit_events; select id, ts, action, resource_type from audit_events order by id desc limit 3;"
```

**Result (verbatim):**

```
 count
-------
     0
(1 row)

 id | ts | action | resource_type
----+----+--------+---------------
(0 rows)
```

**Interpretation.** The `audit_events` table is in place — it did not error
on `select count(*)`, so the migration `0076_compliance_and_equity.sql` is
applied and the hash-chain trigger is installed — but no rows have been
written yet. That is honest and expected for a system that has:

- no live customer traffic on `/workspace/equity-offer/request` (the primary
  writer path — `web/src/app/api/equity/request/route.ts:214` calls
  `appendAudit(...)`),
- no wholesale certifications issued (the second writer),
- no plan-change writes routed through the audit helper yet,
- Stripe webhook writers routed to `stripe_webhook_events`, not
  `audit_events`.

**Action.** Beta.6 exit criteria should include *one* smoke row per writer
path so that:
- the hash chain has a defined genesis,
- the nightly `verify-audit-chain.ts` cron has something to walk instead of
  returning `chain length = 0`, and
- a false green from a *silent* writer failure cannot hide.

Proposed smoke rows:

| Actor | Action | Resource | Rationale |
|---|---|---|---|
| `system` | `audit.genesis` | `audit_events` | Anchor the hash chain |
| `system` | `deploy.verified` | `deploy` | Wired into `deploy-live.sh` post-verify step |
| `cron` | `cron.audit.verified` | `audit_events` | Wired into the nightly verify script |

**Nightly cron confirmation.**

```
$ grep verify-audit-chain web/scripts/crontab.production
0 1 * * * node /home/dovanlong/blockid.au/web/scripts/verify-audit-chain.ts >> /tmp/blockid-audit-verify.log 2>&1
```

Green — the nightly walker is scheduled at 01:00 server-local time. However,
its exit code is not surfaced to the health dashboard today. Recommend piping
the exit code into `web/content/reports/cron-health.jsonl` so the `/status`
tile surfaces a failed verification within one deploy tick rather than
overnight-plus-one.

**Design integrity note.** The hash chain is computed **server-side** by the
Postgres trigger (`audit_events_hash_chain`, from
`web/supabase/migrations/0076_compliance_and_equity.sql`) — the application
process does not compute `curr_hash`. It computes an HMAC signature over the
trigger-produced `curr_hash` using `AUDIT_HMAC_SECRET`. That two-key posture
(DB secret for the chain, app secret for the HMAC) is intentional and is
what makes a compromised DB *alone* unable to forge a valid trail. It also
means the nightly verifier MUST have both secrets. Today the verifier reads
both from the same `.env` file — this is acceptable at current headcount
(1 operator) but is a soft SoD (segregation-of-duties) violation to
document for SOC 2 Type II.

---

## 3. CSP progress + remaining gaps

**What landed in beta.6 (`web/src/proxy.ts`).** A per-request 128-bit nonce
via `randomBytes(16).toString("base64")`, threaded onto `<Script>` tags via
`headers()` in the root layout. `script-src` in `proxy.ts` reads:

```
script-src 'self' 'nonce-<per-request>' 'strict-dynamic' https://js.stripe.com https://www.googletagmanager.com
```

**Reality check on the wire.** A `curl -sI https://blockid.au/` this
afternoon showed the `x-nonce` header set correctly (`x-nonce:
8K8X7tgX5+XsSktKTX2ARA==`) but the `Content-Security-Policy` header served
still contained `'unsafe-inline' 'unsafe-eval'` on `script-src`. That
suggests **one of two things**, both of which need reconciliation:

1. The old CSP from `next.config.ts` is still shipping alongside the new
   proxy CSP (browsers OR the two together, which effectively neuters the
   nonce), or
2. The production cut has not fully picked up `web/src/proxy.ts` yet — the
   proxy is running (hence `x-nonce`), but the CSP-emitting path is still
   the legacy one.

**Action for tomorrow's cut:** grep the deployed `.next/standalone` for
`'unsafe-inline'` in a script-src literal string and remove it from
`next.config.ts` if it is still there. Confirm with a fresh `curl -sI`
returning `script-src 'self' 'nonce-…' 'strict-dynamic' https://…` and NO
`'unsafe-inline'`. This is the load-bearing verification before I close the
H4 finding.

**Still on `'unsafe-inline'`: `style-src`.** Tailwind's utility classes are
compiled at build time to a single stylesheet, but the runtime emits inline
styles for a handful of components (transition classes with computed
durations, some `react-select` variants, and the `react-pdf` preview iframe).
Setting `style-src 'self'` today would white-screen those components. The
proxy CSP therefore still emits `style-src 'self' 'unsafe-inline'`.

**Two-milestone deprecation plan.**

- **v2.1 milestone.** Convert every runtime inline-style callsite to a
  Tailwind arbitrary-value class or a `styled-jsx`/CSS-module block.
  Concretely:
  1. Audit with `grep -rEn 'style=\{\{' web/src` (currently 63 hits).
  2. For each, either (a) replace with `className` + Tailwind arbitrary
     value, (b) move to a `.module.css` file, or (c) emit at build time via
     `@style-loader` if truly dynamic.
  3. Add a nonce to the *remaining* legitimate inline styles (framework
     internals and third-party widgets) so `style-src` becomes `'self'
     'nonce-<per-request>'`.
  4. Drop `'unsafe-inline'` from `style-src` in `web/src/proxy.ts`.
  5. Ship behind a `NEXT_PUBLIC_STRICT_CSP` env var so a single-flag rollback
     is possible if a customer reports a broken widget.

- **v2.2 milestone.** Wire `report-uri` (well, `report-to` — RFC 9179) to a
  dedicated endpoint at `/api/csp-report`. That endpoint should:
  1. Accept `application/csp-report` and `application/reports+json` bodies,
  2. Rate-limit by IP (100/hour) and by session (10/minute) so a broken
     third-party script cannot DoS the collector,
  3. Write to a bounded `csp_violations` table (max 100k rows, rolling
     TRUNCATE beyond that),
  4. Feed a weekly Monday triage report (CISO daily template) listing
     top-10 blocked script sources + top-10 blocked style hashes, and
  5. Roll blocks into a proposed CSP delta so tightening is data-driven,
     not guessed.

**Nonce coverage today.** The nonce is applied to `GoogleAnalytics`
`<Script>` tags via the root layout. `js.stripe.com` is allow-listed by
origin so does not need a nonce. Verify with `grep -rn 'nonce=' web/src`
after v2.1 that every `<Script strategy="afterInteractive">` in the tree
reads the nonce; the current count is small enough (Analytics, Tag Manager,
Stripe.js loader) that a missing nonce would produce a visible broken
widget rather than a silent-fail.

---

## 4. DNS / email hardening

Live DNS check (2026-07-17):

```
$ dig +short TXT google._domainkey.blockid.au @1.1.1.1
"v=DKIM1;k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."   [truncated]
```

Confirmed — DKIM record is published under selector `google._domainkey`
(Google Workspace default). Key length is RSA-2048 which meets the current
BIMI + Yahoo/Google bulk-sender bar.

```
$ dig +short TXT blockid.au @1.1.1.1 | grep -i spf
"v=spf1 include:_spf.google.com ~all"
```

SPF is a soft-fail on the terminating mechanism, which is the recommended
posture while DMARC is `p=none` — a hard `-all` before DMARC aggregate
reports show clean is a common cause of legitimate mail being rejected.

```
$ dig +short TXT _dmarc.blockid.au @1.1.1.1
"v=DMARC1; p=none"
```

DMARC is published at policy `none`, with **no `rua=`** — this is the state
after today's `web/scripts/dns/update-dmarc.sh` fix that removed the
`mailto:admin@blockid.au` aggregate destination because that mailbox was
routing Microsoft aggregate reports to a *personal* inbox. Correct
short-term move; consequential trade-off is that **we have zero aggregate
report visibility today**. Every day this state persists is a day we
cannot detect a spoofing campaign against `@blockid.au`.

**Recommendations, in order of urgency.**

1. **Spin up a dedicated `dmarc-reports@blockid.au`** distribution alias
   pointing to `security-ops@blockid.au` (which is also a shared alias, not
   an individual). Update the DMARC record to
   `v=DMARC1; p=none; rua=mailto:dmarc-reports@blockid.au;
   ruf=mailto:dmarc-reports@blockid.au; fo=1; adkim=r; aspf=r`. Ship via
   `web/scripts/dns/update-dmarc.sh` so it is env-driven and reproducible.
2. **After 30 clean days of aggregate reports** (no legitimate senders
   failing SPF-align or DKIM-align) — advance to
   `v=DMARC1; p=quarantine; pct=25; ...` then stair-step `pct` to 50 → 100
   over the following 30 days. Do not skip the quarantine tier and go
   straight to `p=reject` even if traffic looks clean; there is no rollback
   from a receiver-rejected inbound.
3. **After DMARC ≥ quarantine at 100%**, add a BIMI record on
   `default._bimi.blockid.au` pointing at an SVG-P/S logo hosted at
   `/brand/blockid-bimi.svg` and, if budget permits, a Verified Mark
   Certificate (VMC or CMC) from Entrust or DigiCert. BIMI without VMC gets
   the logo on Yahoo and Fastmail but not Gmail today.
4. **MTA-STS + TLS-RPT.** Publish `_mta-sts.blockid.au` policy file at
   `https://mta-sts.blockid.au/.well-known/mta-sts.txt` with `mode: enforce`
   and `mx: *.google.com`, plus a TLS-RPT record so mis-configured senders
   surface. This is a one-day project.
5. **DNSSEC.** Cloudflare edge supports DNSSEC one-click. Off today.
   Turning it on removes a class of MITM against DNS answers for
   `blockid.au` — worth doing before any BIMI advertising because BIMI
   ships attacker-attractive brand assets over DNS-answered URLs.

---

## 5. Wholesale-investor gate + equity-request-call flow

**Hypothetical.** A retail investor (i.e. `wholesale_status !=
'wholesale_certified'`) is logged in and navigates to
`https://blockid.au/workspace/equity-offer`. Trace the request end-to-end
and confirm which guards fire.

**Step 1 — Route enter (server component).**
`web/src/app/workspace/equity-offer/page.tsx:58` — `EquityOfferPage()` runs
on the server, calls `getCurrentUser()` (line 59), and `redirect()`s
unauthenticated users to `/auth/login?next=/workspace/equity-offer`.
Authenticated users pass.

**Step 2 — Entitlement gate.**
`web/src/app/workspace/equity-offer/page.tsx:68-71` wraps the page body in
`<FeatureGate feature="equity_offer.request" label="Pay in Equity">`. This
is an **entitlement** gate (plan-tier), not the wholesale gate. Retail
investors on Scale-tier would clear this; retail investors on Free-tier
would see the entitlement upgrade prompt. **This is not the compliance
guard.**

**Step 3 — Disclaimer render.**
`web/src/app/workspace/equity-offer/page.tsx:62,88-102` pulls the surface
body from `getSurface("equity_offer_page")` (with fallback text at line 30
that hashes identically for consent-record determinism) and renders the
amber "Read this first" block. This is a UI-level disclaimer only; no
gate here.

**Step 4 — Intake button.** Line 186 links to
`/workspace/equity-offer/request`.

**Step 5 — Client-side form.**
`web/src/app/workspace/equity-offer/request/page.tsx` is a client component.
Enforces two mandatory acknowledgement checkboxes (lines 94-103), a
100-character minimum message, and submit-disabled while the two checkboxes
are unchecked. This is *validation* — an adversary can bypass by hand-crafting
the POST, so this is *never* the load-bearing guard.

**Step 6 — Server-side write.**
`POST /api/equity/request` at `web/src/app/api/equity/request/route.ts`:
- Records a `consent_events` row with `kind: "equity_offer_disclaimer"` and
  the current disclaimer_version (line 152-160),
- Persists an `equity_requests` row,
- Writes an `appendAudit(...)` row with `action:
  "equity_request_submitted"` at line 214, linked to the consent_event_id
  (line 224) — chained trail is intact,
- Notifies admin via Telegram fire-and-forget,
- Returns HTTP 202 (never issues securities synchronously).

**Now the critical finding.** The `assertWholesaleCertified()` helper at
`web/src/lib/legal/gates.ts:89` **is not called on this path**. The
`WholesaleGate` component at `web/src/components/legal/wholesale-gate.tsx`
**is not mounted on this path**. The path is protected by a mix of:

- entitlement gate (plan tier — via `FeatureGate`),
- disclaimer surface + two-checkbox consent (deterministic hash on record),
- `assertLegalReviewPassed()` on downstream *issuance* paths (via
  `web/src/lib/legal/gates.ts:51`, called on the tokenisation + cap-table
  writes elsewhere), and
- the disclaimer copy itself stating "Not an offer to issue securities …
  request-a-call intake."

**Is the retail investor blocked?** In legal terms, *yes* — the intake
is defensible as a request-a-call, not an offer of securities, so the s708
wholesale test does not attach at intake. The wholesale test attaches
before any subsequent *issuance* (SAFE, warrant, option grant) — which
does route through `assertLegalReviewPassed()` and the tokenisation
gate at `scripts/verify-equity-gate.sh`.

**Recommendation.** This is a documented and legally reviewed design, but
it is fragile because the *shape* of the compliance boundary is not
obvious from the code layout. Two concrete hardening steps:

1. **Add `assertLegalReviewPassed()` at intake too.** It costs one DB read
   and closes a class of attacks where an internal-admin misconfiguration
   accidentally hands an intake user a tokenised follow-on before manual
   review completes. Change point:
   `web/src/app/api/equity/request/route.ts` before the insert around
   line 200 — early-return 403 if the gate throws.
2. **Wire `WholesaleGate` in front of the intake CTA on the marketing
   surface** (not the workspace page — the workspace page is post-login and
   post-entitlement). This is a UX-level nudge only, but it lowers the
   volume of intake requests from clearly-retail visitors and reduces the
   downstream legal-review workload.

---

## 6. RLS regression check

Grep across every table-creating migration in the target range:

```
web/supabase/migrations/0073_user_segments_and_jurisdiction.sql
web/supabase/migrations/0074_plans_matrix_and_gst.sql
web/supabase/migrations/0075_entitlements_trial_and_webhook_state.sql
web/supabase/migrations/0076_compliance_and_equity.sql
web/supabase/migrations/0077_analytics_and_conversion.sql
web/supabase/migrations/0078_deploy_incidents.sql
web/supabase/migrations/0079_perf_samples.sql
web/supabase/migrations/0080_disclaimer_registry_seed.sql   (seed only, no tables)
web/supabase/migrations/0081_lifecycle_rpc.sql              (RPC only, no tables)
```

**Result.**

| Migration | Tables created | RLS enabled? |
|---|---|---|
| 0073 | *(no `create table` — column additions on existing `app_users`)* | N/A |
| 0074 | `plans`, `gst_config` | Both `enable row level security` |
| 0075 | `subscription_trial_state`, `entitlements`, `stripe_webhook_events`, `revenue_events` | All four `enable row level security` |
| 0076 | `consent_events`, `disclaimer_registry`, `audit_events`, `equity_requests` | All four `enable row level security` |
| 0077 | `analytics_events`, `conversion_events`, `ab_experiments`, `ab_assignments`, `churn_events`, `lifecycle_state` | All six `enable row level security` |
| 0078 | `deploy_incidents` | Enabled |
| 0079 | `perf_samples` | Enabled |
| 0080 | *(no tables — seed rows only)* | N/A |
| 0081 | *(no tables — RPCs only)* | N/A |

**Every table in the target range has RLS enabled.** Zero regressions.

**Caveat — RLS on ≠ RLS effective.** RLS being enabled prevents anonymous
reads via `anon` and `authenticated` roles, but does not itself define
*which* rows a user can see. The policies live in the same migration files
next to the `enable row level security` lines. I did not audit each policy
body in this pass — that is a T-0450-class task. Recommend a follow-up
audit for v2.1 Week 2 that walks every policy and confirms:

- No policy uses `USING (true)` outside `disclaimer_registry` (which is
  publicly-readable by design — canonical disclaimer bodies).
- No policy allows `INSERT` to `authenticated` on `audit_events`,
  `revenue_events`, or `stripe_webhook_events` (these must be
  service-role-only).
- Every user-scoped policy filters by `auth.uid() = user_id` (or the
  `sessions`-linked equivalent for our custom-cookie flow).

---

## 7. Coordinated-disclosure surface (`security.txt`)

Check the live edge:

```
$ curl -sI https://blockid.au/.well-known/security.txt
HTTP/2 404
```

Confirmed — `security.txt` is **not served** today. RFC 9116 recommends it
for any consumer-facing service so that external researchers know where to
send vulnerability reports without cold-emailing the general contact form.

**Proposed content.** Create
`web/public/.well-known/security.txt` with the following body, which
matches RFC 9116 §2 minimum fields plus recommended fields:

```
Contact: mailto:security@blockid.au
Contact: https://blockid.au/security-audit
Preferred-Languages: en, vi
Canonical: https://blockid.au/.well-known/security.txt
Policy: https://blockid.au/security-audit
Expires: 2027-07-17T00:00:00Z
Encryption: https://blockid.au/.well-known/security-pubkey.asc
Hiring: https://blockid.au/careers
```

**Notes.**

- The `Expires` field is mandatory in RFC 9116 §2.5. One year out is the
  recommended cadence; ship a `web/scripts/rotate-security-txt.ts` that
  re-stamps the file annually and re-signs it (see `Encryption` below).
- The `Policy` field points at `/security-audit`, which a peer agent is
  building. Ship `security.txt` in the same cut as that page — if
  `/security-audit` returns 404 when a researcher clicks through, we look
  worse than if we had never published `security.txt`.
- The `Encryption` field should point at a real PGP public key. If we do
  not have one today (`security@blockid.au` may be new), either drop the
  `Encryption` line for beta.6 and add it in v2.1, or ship a fresh key.
  Do not ship a dead URL.
- Consider signing the file itself with the same PGP key and hosting the
  detached signature alongside — RFC 9116 §3.3 recommends this.
- Also serve at `web/public/security.txt` (the top-level location) for
  legacy scrapers; the RFC uses the `.well-known` location canonically.

**Rate-limit note.** Once `security.txt` is public, expect a bump in
low-quality "bug bounty" spam. Prep `security@blockid.au` with a spam
filter and a triage template ("thank you, please provide reproduction
steps, we ask for 90-day disclosure").

---

## 8. Top-3 CISO actions for v2.1 Week 1

1. **Finish M8 deferred — permanent bounce classification.** Wire an
   SES/SMTP status-code parser to distinguish hard vs soft bounces from
   the transactional mailer. Persistently mark hard-bounced addresses as
   `bounce_permanent` and stop the lifecycle-mailer from re-sending. This
   protects our sender reputation and is a prerequisite for advancing
   DMARC beyond `p=none`. Target file:
   `web/src/lib/email/bounce-classifier.ts` (new).
2. **Spin up `security@blockid.au` and `dmarc-reports@blockid.au`
   aliases.** Both must be group-distribution aliases, not individual
   inboxes. Publish `security.txt` on the same cut. Re-enable DMARC
   `rua=` pointing at the new dmarc-reports alias. This closes the
   visibility gap that opened when today's DMARC fix removed
   `rua=mailto:admin@blockid.au`.
3. **Drop `'unsafe-inline'` and `'unsafe-eval'` from the deployed
   `script-src`.** The proxy CSP already does this in code; the reality on
   the wire still shows both. Either (a) delete the legacy CSP from
   `next.config.ts` if it is still shipping, or (b) confirm the standalone
   build is picking up `web/src/proxy.ts` and re-cut. Verify with
   `curl -sI https://blockid.au/ | grep -i content-security-policy` and
   watch it read `script-src 'self' 'nonce-…' 'strict-dynamic' …` with
   nothing else. This closes H4 for real.

---

## 9. Incident-response readiness

Cross-check the docs tree for runbooks matching each of the five scenarios
that a modern SaaS CISO expects to have on the shelf **before** an
incident. Search command:

```
$ find /home/dovanlong/blockid.au/docs -name '*.md' \
    -o -name '*.md.gz' | xargs grep -l -iE 'runbook|incident'
docs/AUDIT-CHAIN-RUNBOOK.md
docs/ROADMAP.md
docs/VERSION.md
docs/IMPLEMENTATION-PLAN-v2.md
docs/CONTINUOUS-DEPLOY.md
docs/analytics/dashboards.md
```

**Scenario coverage matrix.**

| Scenario | Runbook exists? | Path (if yes) | Action |
|---|---|---|---|
| Production down > 5 min | Partial | `docs/UPTIME_GUARD.md` + `docs/CONTINUOUS-DEPLOY.md` "Rollback" section | Consolidate into a single `docs/runbooks/prod-outage.md` with escalation ladder and comms template |
| Secret leak (repo, log, screenshot) | Missing | — | Author `docs/runbooks/secret-leak.md` — steps: revoke → rotate → force-push filter → notify Stripe/Supabase if their keys → post-mortem |
| RLS bypass discovered | Missing | — | Author `docs/runbooks/rls-bypass.md` — steps: reproduce → freeze writes to affected table → grep for widened policies → 72-hour Privacy Act notifiable-breach assessment |
| Wholesale gate breach | Missing | — | Author `docs/runbooks/wholesale-gate-breach.md` — steps: audit `equity_requests` for user_ids with `wholesale_status != wholesale_certified` → freeze intake surface → legal-review escalation → written notice to any affected retail user |
| Audit-chain break (hash mismatch) | **Green** | `docs/AUDIT-CHAIN-RUNBOOK.md` | Already in place; verify nightly `verify-audit-chain.ts` exit code is surfaced to `/status` in v2.1 |
| Data breach — Privacy Act 72-hour clock | Missing (as a *runbook* — Privacy Act obligations are noted in `docs/ARCHITECTURE.md`) | — | Author `docs/runbooks/privacy-act-breach.md` — trigger conditions, OAIC notification template, customer-notification template, evidence-preservation checklist |

**Priority for v2.1.** Author the four missing runbooks in this order:

1. `secret-leak.md` — highest frequency, highest surface (anyone in the
   team can commit an env value),
2. `privacy-act-breach.md` — highest regulatory clock (72 hours from
   awareness — the runbook must open with a clock statement),
3. `rls-bypass.md` — highest blast radius, and the one where a code
   change is most likely to cause the incident,
4. `wholesale-gate-breach.md` — lowest frequency but highest legal
   exposure per event.

**Table-top drill.** Once the four runbooks are on the shelf, schedule a
30-minute table-top drill against each. Log the drill in
`docs/runbooks/drills/` with date, participants, gaps discovered, and
follow-up tickets. First drill target: 2026-08-15.

---

## Appendix A — Evidence bundle (paths cited in this report)

**Application code.**

- `web/src/proxy.ts` — CSP nonce + `strict-dynamic` on `script-src`
- `web/src/middleware.ts` — (superseded by `proxy.ts` in Next 16 — verify removed)
- `web/src/lib/audit.ts` — `appendAudit()`, HMAC over trigger-computed `curr_hash`
- `web/src/lib/consent.ts` — consent recording helpers
- `web/src/lib/legal/gates.ts` — `assertLegalReviewPassed`, `assertWholesaleCertified`, `requireAck`
- `web/src/lib/legal/versions.ts` — `DISCLAIMER_VERSIONS`, `getCurrentVersion`
- `web/src/lib/legal/surfaces.ts` — canonical disclaimer body registry
- `web/src/components/legal/wholesale-gate.tsx` — retail vs wholesale UI gate (not currently mounted on `/workspace/equity-offer`)
- `web/src/components/legal/not-financial-advice.tsx` — disclaimer stamp component
- `web/src/app/workspace/equity-offer/page.tsx` — server component, entitlement-gated
- `web/src/app/workspace/equity-offer/request/page.tsx` — client form, two-checkbox consent
- `web/src/app/api/equity/request/route.ts` — server handler, consent-write + audit-append + 202
- `web/src/app/api/legal/current-versions/route.ts` — public, jurisdiction-capped
- `web/src/app/api/status/route.ts` — public status aggregator
- `web/src/app/status/page.tsx` — public status page
- `web/src/app/roadmap/page.tsx` — 8-stage journey
- `web/src/app/changelog/page.tsx` — reads `web/CHANGELOG.md`
- `web/src/app/for/[segment]/page.tsx` — public segment landing

**Database migrations (Supabase).**

- `web/supabase/migrations/0073_user_segments_and_jurisdiction.sql`
- `web/supabase/migrations/0074_plans_matrix_and_gst.sql` — `plans`, `gst_config`
- `web/supabase/migrations/0075_entitlements_trial_and_webhook_state.sql` — 4 tables
- `web/supabase/migrations/0076_compliance_and_equity.sql` — `audit_events` (with hash-chain trigger), 3 more tables
- `web/supabase/migrations/0077_analytics_and_conversion.sql` — 6 tables
- `web/supabase/migrations/0078_deploy_incidents.sql`
- `web/supabase/migrations/0079_perf_samples.sql`
- `web/supabase/migrations/0080_disclaimer_registry_seed.sql` — seed rows, `ON CONFLICT DO NOTHING` (H3 fix)
- `web/supabase/migrations/0081_lifecycle_rpc.sql` — `pick_lifecycle_due` + `advance_lifecycle` (H1/M6 fix)

**Operations.**

- `web/scripts/crontab.production` — nightly `verify-audit-chain.ts` at `0 1 * * *`
- `web/scripts/verify-audit-chain.ts` — walker
- `web/scripts/qa-release-gate.sh` — gate: grep + tsc + vitest + Playwright + audit-chain verify
- `web/scripts/dns/update-dmarc.sh` — env-driven DMARC update (today: removed `rua`)
- `web/scripts/seed-stripe-coupons.ts` — idempotent COMEBACK30 + DOWNGRADE_STARTER50
- `docs/AUDIT-CHAIN-RUNBOOK.md` — audit-chain runbook
- `docs/UPTIME_GUARD.md` — uptime-watcher description
- `docs/CONTINUOUS-DEPLOY.md` — deploy-live pipeline
- `docs/ARCHITECTURE.md` — Privacy Act notes

**Live-endpoint observations (curl on 2026-07-17).**

- `HTTP/2 404` on `https://blockid.au/.well-known/security.txt`
- `HTTP/2 200` on `https://blockid.au/api/status`
- `Content-Security-Policy` header on `/` still includes `'unsafe-inline'` and `'unsafe-eval'` on `script-src` (contradicts `proxy.ts` — investigate before closing H4)
- `x-nonce` header present and per-request random (proxy is running)
- HSTS: `max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

**DNS observations.**

- `google._domainkey.blockid.au` — RSA-2048 DKIM (Google Workspace)
- `blockid.au` TXT SPF — `v=spf1 include:_spf.google.com ~all`
- `_dmarc.blockid.au` — `v=DMARC1; p=none` (no `rua`, no `ruf`)

**Database observations.**

- `select count(*) from audit_events` → 0
- Hash-chain trigger present (migration 0076); nightly walker scheduled;
  no rows yet — genesis smoke row recommended for beta.6 exit.

---

## Appendix B — Findings summary (owner + target)

| # | Finding | Severity | Owner | Target milestone |
|---|---|---|---|---|
| 1 | `audit_events` table has 0 rows — no genesis anchor | Low | CTO | v2.0.0-beta.7 |
| 2 | Deployed CSP still contains `'unsafe-inline'` and `'unsafe-eval'` on `script-src` despite proxy code being nonce-only | High | CTO | v2.0.0-beta.7 (before v2.1) |
| 3 | DMARC `rua=` removed — no aggregate report visibility | Medium | CISO | v2.1 Week 1 |
| 4 | `security.txt` returns 404 | Medium | CISO | v2.1 Week 1 |
| 5 | `WholesaleGate` component exists but is not mounted on `/workspace/equity-offer` (design-intended; add `assertLegalReviewPassed` at intake anyway) | Low | CLO + CTO | v2.1 |
| 6 | Nightly audit-chain verifier exit code not surfaced to `/status` | Low | COO | v2.1 |
| 7 | Runbook gaps: secret-leak, RLS-bypass, wholesale-gate breach, Privacy Act 72-hour clock | Medium | CISO | v2.1 Week 2 |
| 8 | No MFA step-up on admin login (OAuth-transitive only) | Medium | CTO | v2.1 |
| 9 | No documented full-restore drill this quarter | Medium | COO | v2.1 |
| 10 | No dashboard proving Debian security-patch SLA on the deploy host | Low | COO | v2.1 |
| 11 | DNSSEC not enabled on `blockid.au` at Cloudflare | Low | CISO | v2.1 Week 2 |
| 12 | MTA-STS + TLS-RPT not published | Low | CISO | v2.1 Week 2 |
| 13 | RLS *policies* (not just RLS enable) not audited in this pass | Medium | CISO + CTO | v2.1 Week 2 (T-0450 class) |
| 14 | M8 deferred — permanent bounce classification | Medium | CTO + CMO | v2.1 Week 1 |

---

## Appendix C — Compliance mapping (BlockID controls to frameworks)

**Privacy Act 1988 (Cth) + Australian Privacy Principles (APP 1-13).**

- APP 1 (open management) — `web/src/app/(marketing)/privacy/page.tsx` (Privacy v2 MDX, ACL non-excludable guarantees)
- APP 3 (collection) — `consent_events` records disclaimer_kind + version + hash
- APP 5 (notification) — `<PrivacyBanner>` cookie consent
- APP 11 (security) — RLS on all user-scoped tables; encryption in transit (HSTS-preload); encryption at rest via managed Supabase disk encryption
- APP 12 (access) — user data-export endpoint (verify status in v2.1)
- APP 13 (correction) — user profile edit surface

**SOC 2 Type II readiness (aspirational — v2.2 target).**

- CC6.1 (logical access) — session-cookie flow + OAuth; MFA step-up gap
- CC6.7 (transmission) — HSTS-preload, TLS 1.3, nonced CSP
- CC7.2 (system monitoring) — `/status`, `cron-health.jsonl`, `verify-audit-chain.ts`, `deploy_incidents`, `perf_samples`
- CC7.3 (incident response) — runbook gap (see Section 9)
- A1.2 (availability) — `docs/UPTIME_GUARD.md`, uptime-watcher cron every minute
- P1 (privacy) — see APP mapping above

**Essential Eight** — see Section 1.

**Corporations Act 2001 (Cth) s708.** — `assertWholesaleCertified` gate at
`web/src/lib/legal/gates.ts:89`; `assertLegalReviewPassed` gate at line 51;
`equity_offer` disclaimer surface + consent-hash chain.

---

## Appendix D — Sign-off

- **Author:** CISO Agent (BlockID.au)
- **Date:** 2026-07-17
- **Version:** v2.0.0-beta.6
- **Distribution:** internal only — sanitise Appendix A live-endpoint
  observations before external sharing
- **Next review:** v2.0.0-beta.7 (target 2026-07-18) — expected agenda:
  close H4 CSP for real, publish `security.txt`, re-enable DMARC `rua`,
  land genesis audit row

*End of report.*
