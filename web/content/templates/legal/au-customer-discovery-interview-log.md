> **NOT LEGAL ADVICE — TEMPLATE ONLY.** This Customer Discovery Interview Log
> template is provided by BlockID (Auschain PTY LTD, ABN 79 659 615 111) for
> early-stage Australian founders to capture problem-discovery interviews in a
> way that (a) is safe to circulate to prospective investors as Phase-2 raise
> evidence and (b) meets the informed-consent, use-limitation, and
> data-security expectations of the *Privacy Act 1988* (Cth) Australian
> Privacy Principles ("APPs"). BlockID does not hold an Australian Financial
> Services Licence (AFSL) and cannot provide personal legal, financial, or
> tax advice. Founders must not represent the answers below as forecasts,
> committed revenue, or research findings that they are not — doing so risks
> breaching *Australian Consumer Law* s18 (misleading and deceptive conduct
> in trade) or s1041H of the *Corporations Act 2001* (Cth) (misleading
> conduct in financial products). Interview subjects have the right to
> request access to and correction of their personal information under APP12
> and APP13 — the *Storage & retention* block below records where and for
> how long that information is held.

---

# CUSTOMER DISCOVERY INTERVIEW LOG — {{interviewee_name}} ({{interviewee_company}})

**Interview #{{interview_number}}** · **Date:** {{interview_date}} · **Channel:** {{interview_channel}}
**Interviewer:** {{interviewer_name}} <{{interviewer_email}}>
**On behalf of:** {{company_name}} Pty Ltd (ACN {{acn}})
**Product hypothesis under test:** {{product_hypothesis}}

---

## 1. Informed consent (APP 1 · APP 5)

Before the interview began the interviewer read the following collection
notice to the interviewee and recorded the interviewee's response:

> "The purpose of this conversation is to understand how you currently do
> {{current_workflow_short}}. Anything you say may be summarised in a
> written log and referenced (with your identity clearly named or, at your
> preference, anonymised to role + industry only) in materials shown to
> prospective investors in {{company_name}} Pty Ltd. You can decline any
> question, stop the interview at any time, or withdraw your consent to be
> referenced in future materials by emailing {{interviewer_email}}. Your
> personal information is handled under our Privacy Policy in line with the
> *Privacy Act 1988* (Cth) Australian Privacy Principles."

| Consent item | Response |
|---|---|
| Consent to interview + written log | {{consent_written_log}} |
| Consent to be named in an investor data room | {{consent_named_reference}} |
| Consent to be quoted verbatim | {{consent_verbatim_quote}} |
| Consent to audio / video recording | {{consent_recording_response}} |

{{#recording_consent_yes}}
**Recording status:** The interviewee gave express, verifiable consent to
audio recording under APP 3 (collection) and, where the recording captures
sensitive information under APP 3.3, additional express consent to that
sensitive information being collected. The recording is stored at
{{recording_storage_location}} with access limited to the interviewer and
named colleagues under a role-based access policy.
{{/recording_consent_yes}}

{{#recording_consent_no}}
**Recording status:** No audio or video recording was made. Only the
written notes in this log constitute the record of the conversation.
Verbatim quotes below were transcribed by the interviewer in real time
and read back to the interviewee for confirmation before ending the call.
{{/recording_consent_no}}

## 2. Interviewee identity

| Field | Value |
|---|---|
| Name | {{interviewee_name}} |
| Role / title | {{interviewee_role}} |
| Organisation | {{interviewee_company}} ({{interviewee_company_abn_line}}) |
| Business email | {{interviewee_email}} |
| How the interviewee was sourced | {{sourcing_channel}} |
| Prior relationship (if any) | {{prior_relationship}} |
| Compensation offered (if any) | {{compensation_offered}} |

**Founder note:** if *Compensation offered* is anything other than "None",
disclose that compensation alongside every quote used in investor
materials — otherwise the LOI/interview evidence risks being materially
misleading under s18 ACL / s1041H Corporations Act.

## 3. Problem-discovery script (Mom-Test discipline)

The following questions were asked in the order shown. Each response is
recorded in the interviewee's own words as closely as the interviewer
could capture. Where the interviewer added a follow-up prompt, that
prompt is bracketed in italics.

### 3.1 Past-behaviour question (not hypothetical)
**Q:** *"Walk me through the last time you had to {{last_time_prompt}}.
Start from the moment you realised you had to, and take me step by step."*

> {{answer_past_behaviour}}

### 3.2 Current workflow + tools in place
**Q:** *"What are you using to do that today? Include spreadsheets, email
threads, WhatsApp — anything counts."*

> {{answer_current_workflow}}

### 3.3 Quantified pain
| Dimension | Interviewee's own words | Interviewer estimate |
|---|---|---|
| How often does this problem occur | {{pain_frequency_words}} | {{pain_frequency_normalised}} |
| How long does it take each time | {{pain_time_words}} | {{pain_time_hours}} hrs/occurrence |
| Estimated annual cost (labour + tools + errors) | {{pain_cost_words}} | A${{pain_cost_estimate_aud}} |
| Severity self-rating (0-10) | {{pain_rating_words}} | {{pain_rating}} / 10 |

### 3.4 Prior attempts to solve
**Q:** *"What have you tried to fix this? What worked, what didn't, and
why did you stop?"*

> {{answer_prior_attempts}}

### 3.5 Purchase / adoption authority
**Q:** *"If a tool solved this end-to-end tomorrow, who inside your
organisation would need to say 'yes' before you could roll it out to your
team?"*

> {{answer_purchase_authority}}

### 3.6 Willingness to test
**Q:** *"Would you be open to trying an early version — a 30-minute walk
through, or a two-week pilot with your real data — before we finalise the
product?"*

> {{answer_willingness_to_test}}

{{#willing_to_pilot}}
**Pilot commitment captured.** The interviewee agreed in principle to a
{{pilot_scope}} pilot starting {{pilot_start_date}}. This commitment is
recorded here as evidence of demand only and does **not** constitute a
binding purchase order or a Letter of Intent — for the latter, see the
`au-customer-loi` template.
{{/willing_to_pilot}}

### 3.7 Willingness to pay
**Q:** *"If it worked as described, what would you expect to pay per
{{pricing_unit}}? Please quote the price you'd be comfortable paying
without needing to go back to Finance."*

> {{answer_price_indication}}

## 4. Key verbatim quotes

Direct quotes usable (with identity attribution or anonymisation per the
consent recorded above) in investor decks, data-room evidence packs, and
onboarding copy. **Never** trim or paraphrase a quote in a way that
changes its meaning — doing so is misleading conduct under s18 ACL and
s1041H of the *Corporations Act 2001* (Cth).

- **Q1:** "{{quote_1}}" — {{quote_1_context}}
- **Q2:** "{{quote_2}}" — {{quote_2_context}}
- **Q3:** "{{quote_3}}" — {{quote_3_context}}

## 5. Red-flag & signal audit

Founders often hear what they want to hear. The interviewer must actively
mark each of the following signals as **present** or **absent** based on
this interview:

| Signal | Present / absent | Evidence |
|---|---|---|
| Interviewee described a **specific past event** (not a hypothetical) | {{signal_specific_past}} | {{signal_specific_past_evidence}} |
| Interviewee has **already spent money** trying to solve this | {{signal_prior_spend}} | {{signal_prior_spend_evidence}} |
| Interviewee introduced the interviewer to **someone else** experiencing the same pain | {{signal_introduction}} | {{signal_introduction_evidence}} |
| Interviewee volunteered a **budget owner** or budget line | {{signal_budget_line}} | {{signal_budget_line_evidence}} |
| **Red flag:** interviewee only used phrases like "I would" / "someone should" / "it would be great if" | {{red_flag_hypothetical}} | {{red_flag_hypothetical_evidence}} |
| **Red flag:** interviewer led the conversation towards a preferred answer | {{red_flag_leading}} | {{red_flag_leading_evidence}} |

## 6. Interviewer conclusion (Build-Measure-Learn)

**Hypothesis under test (from header):** *{{product_hypothesis}}*

**Confidence level after this interview:** {{confidence_level}}

- ☐ Validated
- ☐ Partially validated — needs {{followup_evidence_needed}}
- ☐ Disconfirmed — pivot to {{pivot_direction}}

{{#disconfirmed_hypothesis}}
**Disconfirmation note.** This interview produced evidence that the
hypothesis in the header is materially wrong. The founder must NOT include
this interview in an investor evidence pack for the current hypothesis —
either update the hypothesis and re-run the interview log, or file this
log under the historical / pivot-evidence folder in the data room.
{{/disconfirmed_hypothesis}}

**Concrete next step agreed with interviewee:** {{followup_commitment}} by
{{followup_date}}.

## 7. Storage & retention (APP 11 · APP 12 · APP 13)

| Item | Value |
|---|---|
| Storage location of this log | {{storage_location}} |
| Storage location of any recording | {{recording_storage_location}} |
| Retention period (days from interview date) | {{retention_period_days}} |
| Named individuals with access (role-based) | {{access_control_list}} |
| Access-request / correction contact | {{interviewer_email}} |
| Deletion trigger | Founder honours any APP12 access request or APP13 correction request within a reasonable period, and destroys the record on retention expiry unless the interviewee has provided fresh consent under APP 6.2 for a further period. |

## 8. Investor-pack disclosure guardrails

When this interview log is included (in whole or in summary form) in an
investor deck, one-pager, or data-room evidence file the founder must:

- (a) state that the interview was **discovery-stage** and **non-binding**;
- (b) not aggregate multiple interviews into a single "customer" count
      without disclosing sample size ({{sample_size_context}});
- (c) attribute quotes exactly as consented above and never merge two
      speakers' words into a single quote;
- (d) if the "willingness to pay" price was hypothetical, mark it
      **indicative — not a signed order** in any table it appears in;
- (e) retain a version-controlled copy of this log to answer diligence
      questions about how the evidence was collected — a materially
      misleading investor communication under s1041H *Corporations Act
      2001* (Cth) can attract civil and criminal liability regardless of
      whether the misleading statement was made in good faith.

## 9. Sign-off

**Interviewer:** {{interviewer_name}} — {{interview_date}}
**Reviewed by (co-founder / mentor / advisor):** {{reviewer_name}} — {{reviewer_date}}

---

*Template version: 1.0 — revision date {{revision_date}}. Governing law
of storage practices: {{governing_state}}, Commonwealth of Australia.*
