# Privacy Act 1988 — Notifiable Data Breach Clock

Owner: CISO (primary), CLO (secondary), CEO (sign-off on OAIC notification).
Severity: **P0** any time this runbook is opened.

Trigger: any incident where an APP entity (BlockID.au / Auschain Pty Ltd, ACN
659 615 111) becomes aware of "unauthorised access to, unauthorised disclosure
of, or loss of" personal information, and a reasonable person would conclude
that access, disclosure or loss is likely to result in serious harm — Privacy
Act 1988 (Cth) Part IIIC, s26WE. Common upstream runbooks: `secret-leak.md`,
`rls-bypass.md`, `wholesale-gate-breach.md`.

The filename references a "72h" convention used internally for pager escalation
(pager wakes CISO within 72 hours of the incident timestamp). The statutory
clock is different: **the assessment must be completed within 30 days of
becoming aware of the suspected breach** (s26WH). Do not confuse the two — the
30-day clock is the one regulators enforce.

---

## 1. First assessment within 30 days (s26WH)

Start the clock at the moment the CISO on-call is paged. Record the
`awareness_ts` in the incident record — an OAIC investigation will ask for it.
Within 30 days, produce a written assessment answering:

1. What personal information is involved? Classify against the APP definitions
   (identity, contact, financial, sensitive per s6(1)).
2. Who and how many individuals are affected? Enumerate via
   `select distinct user_id from <affected_table> where <breach_predicate>`.
3. Is serious harm likely? Apply the s26WG factors: kind of information,
   sensitivity, security safeguards defeated, likelihood of the information
   being misused, and the nature of the harm (physical, psychological,
   emotional, financial, reputational).
4. What remedial action has been taken and does it prevent serious harm?

Store the completed assessment as
`/secure-backup/oaic-assessment-<incident_id>/assessment.pdf` and register the
SHA-256 in `audit_events` under `action = 'privacy_act_assessment_completed'`.

## 2. OAIC notification template

If the assessment concludes serious harm is likely and remedial action has not
prevented it, notify the OAIC "as soon as practicable" (s26WK). The current
form is at https://forms.oaic.gov.au — the fields we always pre-fill live in
`docs/legal/templates/oaic-ndb-notification.md`. Required content per s26WK(3):

- identity and contact details of the entity
- description of the eligible data breach
- kind or kinds of information involved
- recommendations about the steps individuals should take in response

CEO signs, CLO submits. Attach the assessment PDF and the audit-chain
attestation covering the incident window.

## 3. Contact affected individuals (APP 13.1 + s26WL)

Options in order of preference:

1. Direct notification by email to each affected user's registered address,
   using the template in `docs/legal/templates/ndb-user-notice.md`. Sent from
   `privacy@blockid.au`; do not use marketing infrastructure.
2. If direct notification is not practicable, publish the notice on
   `blockid.au/privacy/data-breach/<incident_id>` and keep it live for a
   minimum of 12 months.

The notice must repeat the four s26WK(3) fields plus the incident reference,
awareness date, and a link to OAIC's complaint form. Record every send in
`audit_events` with `action = 'ndb_user_notified'` and `resource_id = user_id`
so we can prove per-user notification later.

## 4. Evidence preservation

Preserve for a minimum of 7 years (matches Corporations Act record-keeping):

- the full `audit_events` window covering `awareness_ts` +/- 24 hours, exported
  to `/secure-backup/oaic-assessment-<incident_id>/audit-window.csv`
- provider logs pulled during the upstream runbook (Cloudflare / Stripe /
  Supabase / SES)
- any snapshots (`pg_dump`) taken during containment
- SHA-256 checksums for every artefact, appended to `CHECKSUMS.txt`
- the incident-record export from the tracker as PDF

Nothing in `/secure-backup/oaic-assessment-*/` may be deleted without written
approval from CLO plus the CEO.

## 5. OAIC form submission

The submission itself is done through the online form. Do not attempt to send
the notification by email — the OAIC treats email as informal correspondence.
Retain the OAIC-issued reference number in `audit_events` with `action =
'oaic_ndb_submitted'` and `detail->>'oaic_reference'` set. The public register
listing (if the OAIC publishes the incident) must be linked from the incident
record within 24 hours of appearing.

Post-submission, expect a follow-up request within 14 days. Route all
regulator correspondence through `privacy@blockid.au` and CC CLO — no
individual employee should reply directly.
