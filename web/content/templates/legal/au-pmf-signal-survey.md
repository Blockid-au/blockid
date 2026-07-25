> **NOT LEGAL ADVICE — TEMPLATE ONLY.** This PMF ("very disappointed %")
> Signal Survey template is provided by BlockID (Auschain PTY LTD, ABN 79
> 659 615 111) for early-stage Australian founders to run the Sean Ellis /
> Rahul Vohra product-market-fit signal survey against active users and
> disclose the result in a Phase-5 (PMF / Early Traction) raise-evidence
> pack. BlockID does not hold an Australian Financial Services Licence
> (AFSL) and cannot provide personal legal, financial, or tax advice. The
> **40% "very disappointed"** threshold is a widely cited rule of thumb
> (Sean Ellis 2010, Superhuman 2018), not a statutory test — founders must
> not represent survey results as forecasts, committed revenue, or a
> statistically-significant research finding beyond what the sample
> actually supports. Overstating the strength of the signal risks breaching
> *Australian Consumer Law* s18 (misleading and deceptive conduct in
> trade) or s1041H of the *Corporations Act 2001* (Cth) (misleading
> conduct in financial products) when the result is disclosed in an
> investor deck or data room. Respondents have the right to request access
> to and correction of their personal information under APP 12 and APP 13
> of the *Privacy Act 1988* (Cth) — the *Storage & retention* block below
> records where and for how long that information is held.

---

# PMF SIGNAL SURVEY — {{product_name}}

**Survey run #{{survey_run_number}}** · **Field window:** {{field_window_start}} → {{field_window_end}} · **Channel:** {{survey_channel}}
**Run by:** {{run_by_name}} <{{run_by_email}}>
**On behalf of:** {{company_name}} Pty Ltd (ACN {{acn}})
**Product surface under test:** {{product_surface}}
**Definition of "user" for this run:** {{active_user_definition}}

---

## 1. Sample eligibility (who was invited, who was excluded)

The "very disappointed %" is only defensible when the sample is limited
to **users who have actually experienced the product's core value** —
inviting sign-ups who never activated inflates the "not disappointed"
tail and produces a misleadingly low signal in both directions.

| Field | Value |
|---|---|
| Eligibility rule (activation event + recency) | {{eligibility_rule}} |
| Total eligible users at field start | {{eligible_population_count}} |
| Users invited to respond | {{invited_count}} |
| Users excluded from invitation + reason | {{excluded_count}} — {{excluded_reason}} |
| Invitation channel(s) | {{invitation_channel}} |
| Incentive offered (if any) | {{incentive_offered}} |
| Reminder cadence | {{reminder_cadence}} |

**Founder note:** if *Incentive offered* is anything other than "None",
disclose the incentive alongside the headline "very disappointed %"
result in any investor material — a paid response can materially bias
the signal upward and hiding the incentive risks s18 ACL / s1041H
misleading-conduct exposure.

## 2. Informed consent (APP 1 · APP 5)

The following collection notice was shown to every invitee before the
first survey question:

> "You're receiving this survey because you've used {{product_name}} at
> least once in the last {{recency_window_days}} days. Your answers help
> us decide what to build next and may be summarised (in aggregate, or
> attributed only with your explicit permission) in materials shown to
> prospective investors in {{company_name}} Pty Ltd. You can skip any
> question, stop at any time, or withdraw your consent to be referenced
> in future materials by emailing {{run_by_email}}. Your personal
> information is handled under our Privacy Policy in line with the
> *Privacy Act 1988* (Cth) Australian Privacy Principles."

Consent captured per respondent (stored alongside their answers):

| Consent item | Captured how |
|---|---|
| Consent to aggregate-only use in investor materials | {{consent_aggregate}} |
| Consent to attributed verbatim quote in investor materials | {{consent_verbatim_quote}} |
| Consent to follow-up interview | {{consent_followup_interview}} |

## 3. Survey instrument (Sean Ellis / Rahul Vohra canonical set)

The four canonical PMF-signal questions were asked in this exact order,
with no leading preamble beyond the collection notice above. Adding
preamble that hints at the "right" answer inflates the "very
disappointed" tail and is a **red flag** in diligence.

### 3.1 Question 1 — the disappointment test *(the "very disappointed %" comes from this question only)*

> "How would you feel if you could no longer use {{product_name}}?"

| Option (single-select) | Response count |
|---|---|
| Very disappointed | {{q1_very_disappointed_count}} |
| Somewhat disappointed | {{q1_somewhat_disappointed_count}} |
| Not disappointed (it isn't really useful) | {{q1_not_disappointed_count}} |
| N/A — I no longer use {{product_name}} | {{q1_na_no_longer_use_count}} |

### 3.2 Question 2 — the target-user identifier

> "What type of people do you think would most benefit from
> {{product_name}}?"

Free-text answer. Used to segment Q1 responses for the "high-expectation
customer" analysis in §5.

### 3.3 Question 3 — the value-articulation

> "What is the main benefit you receive from {{product_name}}?"

Free-text answer. Founders must **not** paraphrase these answers into a
value-proposition line for an investor deck without disclosing that the
line is a paraphrase — reporting a paraphrase as a verbatim quote is
misleading conduct under s18 ACL / s1041H Corps Act.

### 3.4 Question 4 — the improvement request

> "How can we improve {{product_name}} for you?"

Free-text answer. Used for the roadmap-alignment audit in §6.

## 4. Response accounting (denominator hygiene)

Investors reject the "very disappointed %" number when the denominator
is fuzzy. Fill in every row — an "unknown" is a red flag.

| Field | Value |
|---|---|
| Total invitations sent | {{total_invitations}} |
| Total responses started | {{responses_started}} |
| Total responses completed (Q1 answered) | {{responses_completed}} |
| Response rate on Q1 (completed ÷ invitations) | {{response_rate_pct}} % |
| Responses excluded post-hoc + reason | {{excluded_post_hoc_count}} — {{excluded_post_hoc_reason}} |
| Final denominator used for the PMF % | {{final_denominator}} |

**Founder note:** the final denominator must **exclude** the "N/A — I no
longer use" cohort from Q1 (they're churned users, not PMF signal), but
you must disclose that exclusion in the same paragraph as the headline
%. Reporting a % that silently drops churned users while calling it a
"survey of all users" is misleading conduct.

## 5. Headline result (with the honest caveats investors expect)

| Metric | Value | Method |
|---|---|---|
| **Very disappointed %** | **{{very_disappointed_pct}} %** | Q1 "Very disappointed" ÷ ({{final_denominator}}) |
| Somewhat disappointed % | {{somewhat_disappointed_pct}} % | Q1 "Somewhat disappointed" ÷ ({{final_denominator}}) |
| Not disappointed % | {{not_disappointed_pct}} % | Q1 "Not disappointed" ÷ ({{final_denominator}}) |
| N/A / churned excluded % | {{na_excluded_pct}} % | Q1 "N/A" ÷ (responses_completed) — disclosed separately |
| 95% confidence interval on Very disappointed % (Wilson) | {{wilson_ci_low}} % — {{wilson_ci_high}} % | Wilson score at α = 0.05, n = {{final_denominator}} |

**Band interpretation (rule of thumb — not a statistical test):**

- **≥ 40 %** very disappointed → PMF signal present (Sean Ellis 2010).
- **25 – 39 %** → PMF close, refine positioning + target segment.
- **< 25 %** → PMF not yet; do not raise on this evidence alone.

**Sample-size guardrail.** The 40 % threshold assumes n ≥ 40 completed
Q1 responses in the eligible cohort. With fewer than 40 responses the
Wilson CI is too wide to justify a raise-decision either way — this
survey run's n = {{final_denominator}}, so
{{sample_size_sufficient_narrative}}.

**High-expectation-customer subset.** Superhuman's 2018 refinement:
rerun the Q1 % on just the segment of respondents who (a) match the
target-user profile you seeded to investors and (b) answered "somewhat
disappointed" — see whether tightening onto that subset lifts the % to
≥ 40 %.

| Subset filter | n | Very disappointed % | Interpretation |
|---|---|---|---|
| All Q1 completers | {{final_denominator}} | {{very_disappointed_pct}} % | Headline number |
| High-expectation subset ({{high_expectation_filter}}) | {{high_exp_n}} | {{high_exp_vd_pct}} % | {{high_exp_interpretation}} |

## 6. Free-text theme audit (Q3 + Q4)

Aggregate Q3 (main benefit) and Q4 (improvement request) answers into
themes. Present the theme counts, not the individual quotes, in an
investor deck unless the respondent gave explicit consent to be quoted
verbatim (see §2).

| Q3 benefit theme | Response count | Aligned to public value-prop? |
|---|---|---|
| {{q3_theme_1}} | {{q3_theme_1_count}} | {{q3_theme_1_aligned}} |
| {{q3_theme_2}} | {{q3_theme_2_count}} | {{q3_theme_2_aligned}} |
| {{q3_theme_3}} | {{q3_theme_3_count}} | {{q3_theme_3_aligned}} |

| Q4 improvement theme | Response count | Currently in roadmap? |
|---|---|---|
| {{q4_theme_1}} | {{q4_theme_1_count}} | {{q4_theme_1_in_roadmap}} |
| {{q4_theme_2}} | {{q4_theme_2_count}} | {{q4_theme_2_in_roadmap}} |
| {{q4_theme_3}} | {{q4_theme_3_count}} | {{q4_theme_3_in_roadmap}} |

## 7. Quote pack for investor materials

Only quotes with the respondent's *Consent to attributed verbatim quote*
recorded in §2 are usable with attribution. All other verbatim quotes
must be anonymised to role + industry only, and must not be trimmed or
paraphrased in a way that changes their meaning (s18 ACL / s1041H Corps
Act).

- **Q3.1:** "{{quote_1_text}}" — {{quote_1_context}} · consent: {{quote_1_consent}}
- **Q4.1:** "{{quote_2_text}}" — {{quote_2_context}} · consent: {{quote_2_consent}}

## 8. Red-flag & bias audit

Investors probe for these biases when a PMF signal looks strong.
Complete the audit before the result leaves the founder team.

| Signal | Present / absent | Evidence |
|---|---|---|
| Sample includes only power-users (survivorship bias) | {{bias_survivorship}} | {{bias_survivorship_evidence}} |
| Invitation email framed the "right" answer | {{bias_leading}} | {{bias_leading_evidence}} |
| Response rate < 30 % (non-response bias) | {{bias_nonresponse}} | {{bias_nonresponse_evidence}} |
| Incentive is > A$20 per response (compensation bias) | {{bias_incentive}} | {{bias_incentive_evidence}} |
| Denominator silently drops "N/A — no longer use" without disclosing it | {{bias_denominator}} | {{bias_denominator_evidence}} |
| **Red flag:** free-text quotes contradict the Q1 result but the deck cites Q1 anyway | {{red_flag_contradiction}} | {{red_flag_contradiction_evidence}} |

## 9. Storage & retention (APP 11 · APP 12 · APP 13)

| Item | Value |
|---|---|
| Storage location of raw responses | {{raw_storage_location}} |
| Storage location of aggregated results | {{aggregate_storage_location}} |
| Retention period (days from field close) | {{retention_period_days}} |
| Named individuals with access (role-based) | {{access_control_list}} |
| Access-request / correction contact | {{run_by_email}} |
| Deletion trigger | Founder honours any APP 12 access request or APP 13 correction request within a reasonable period, and destroys personally-identifiable rows on retention expiry unless the respondent has provided fresh consent under APP 6.2 for a further period. Aggregate (de-identified) result rows may be retained indefinitely. |

## 10. Investor-pack disclosure guardrails

When the "very disappointed %" is included in an investor deck,
one-pager, or data-room evidence file, the founder must:

- (a) state the field window ({{field_window_start}} → {{field_window_end}}),
      the eligibility rule, and the final denominator on the **same
      slide / page** as the headline %;
- (b) not compare the % across runs with different eligibility rules
      without disclosing the change (that is materially misleading under
      s18 ACL);
- (c) disclose any incentive offered and the response rate;
- (d) not extrapolate the % onto the *invited* population or the *total
      signed-up* population without labelling that extrapolation clearly;
- (e) retain a version-controlled copy of this survey log so diligence
      can audit how the number was produced — a materially misleading
      investor communication under s1041H *Corporations Act 2001* (Cth)
      can attract civil and criminal liability regardless of whether the
      misleading statement was made in good faith.

## 11. Sign-off

**Run by:** {{run_by_name}} — {{sign_off_date}}
**Reviewed by (co-founder / mentor / advisor):** {{reviewer_name}} — {{reviewer_date}}

---

*Template version: 1.0 — revision date {{revision_date}}. Governing law
of storage practices: {{governing_state}}, Commonwealth of Australia.*
