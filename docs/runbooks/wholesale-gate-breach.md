# Wholesale Gate Breach Runbook

Owner: CISO (primary), CLO (secondary). On-call: platform on-call + CLO.
Severity: **P0** — a retail investor accessing an equity-offer surface is a
Corporations Act 2001 s911A / s708 breach and must be triaged before end of day.

Trigger: any confirmed access by a user whose `app_users.wholesale_status` is
not `wholesale_certified` to a surface gated on wholesale certification —
`/workspace/equity-offer`, `/workspace/data-room/*`, the cap-table token
issuance flow, or the `POST /api/equity/request` intake handler. Triggers
include: CSP telemetry showing the page rendered, a `consent_events` row for
`equity_offer_disclaimer` from an uncertified user, or a support ticket in
which the user quotes offer-page copy.

---

## 1. Confirm the breach via `consent_events` + `equity_requests`

Reconstruct exactly which surfaces the user saw and which handlers they hit.
The join below is the canonical query — it is safe to run against production
because both tables are RLS-protected and the CISO on-call is service_role.

```
select
  u.id                    as user_id,
  u.email,
  u.wholesale_status,
  ce.id                   as consent_id,
  ce.consent_kind,
  ce.disclaimer_version,
  ce.ts                   as consent_ts,
  er.id                   as equity_request_id,
  er.status               as request_status,
  er.submitted_at
from app_users u
join consent_events ce  on ce.user_id = u.id
left join equity_requests er on er.consent_event_id = ce.id
where ce.consent_kind = 'equity_offer_disclaimer'
  and u.wholesale_status is distinct from 'wholesale_certified'
order by ce.ts asc;
```

Every row is a candidate breach. Export to
`/secure-backup/wholesale-breach-<utc>/candidates.csv` and hand to CLO.

## 2. Contact affected investor within 24 hours

For each row, send the templated email in `docs/legal/templates/wholesale-breach-notice.md`
from `legal@blockid.au`. The email must (a) state that the offer surface should
not have been shown, (b) confirm no offer has been made and no securities have
been issued, (c) instruct the user to disregard any offer-page content, and
(d) offer wholesale certification if the user is in fact a s708(8)/(11)
investor. Track responses in the incident record.

## 3. ASIC notification — Corporations Act s911A

An unauthorised offer surface engages s911A (financial services without a
licence exception) and s708 (retail-offer defences). ASIC notification is
required within **14 calendar days** where the breach is significant per s912D.
CLO owns the notification — the CISO's role is to produce the timeline and
scope evidence:

- exact `consent_ts` for each affected user
- the disclaimer body hash from `consent_events.disclaimer_hash` and the
  matching row in `disclaimer_registry`
- the audit-chain `curr_hash` window for the incident
- proof of remediation (the WholesaleGate wiring commit hash + deploy time)

Deliver the evidence pack to CLO within 48 hours. If CLO determines the breach
is not significant, that judgment must be recorded in the incident record with
counsel sign-off.

## 4. Audit `wholesale_verifications` for false positives

If any affected user's `wholesale_status` is `wholesale_certified` at the time
of investigation, they were re-certified after the breach or were never
uncertified. Reconcile against `wholesale_verifications`:

```
select user_id, certified_at, accountant_certified,
       personal_gross_income, net_assets, verifier_notes
from wholesale_verifications
where user_id = '<affected>'
order by certified_at asc;
```

A missing row or a row with `accountant_certified = false` and no supporting
document confirms the gate should have blocked; a valid row means the breach
window is bounded by the certification timestamp.

## 5. Tighten the gate at the code layer

The permanent fix is T-1013 in `docs/IMPLEMENTATION-PLAN-v3.1-amended.md`: wire
`assertWholesaleCertified(user.id)` fail-closed at the top of
`web/src/app/api/equity/request/route.ts` and mount the client-side
`<WholesaleGate>` wrapper in `web/src/app/workspace/equity-offer/page.tsx`. The
server-side gate must precede any `consent_events` write so a non-certified
user cannot even generate a consent artefact. Regression test lives at
`web/tests/legal/wholesale-gate.test.ts` — extend it with the specific bypass
that produced the breach.

## 6. Privacy Act cross-reference

If PII beyond the user's own account leaked (for example a target-company
prospectus attached to the offer surface referenced other individuals), also
run `docs/runbooks/privacy-act-72h-clock.md` in parallel.
