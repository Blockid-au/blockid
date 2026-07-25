/**
 * Legal template registry (round 5.6).
 *
 * Ships three AU-flavoured legal templates that the goal doc flagged as raise
 * blockers:
 *   1. Default AU Pty Ltd Constitution — investors expect a written
 *      constitution rather than the s135 replaceable rules.
 *   2. ESOP Scheme Rules — the source-of-truth doc that div83a-checker.ts
 *      validates against.
 *   3. AU-flavoured SAFE — swap Delaware GCL for NSW law + Corps Act refs
 *      so founders don't have to leave the platform.
 *
 * Templates live in `web/content/templates/legal/*.md`. This module reads them
 * lazily (server-only) via node:fs and substitutes `{{placeholder}}` tokens
 * on request. Public — no auth required.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export type LegalTemplateCategory =
  | "corporate"
  | "employment"
  | "fundraising"
  | "ip"
  | "commercial";

export interface LegalTemplateSource {
  label: string;
  url: string;
}

export interface LegalTemplate {
  slug: string;
  title: string;
  category: LegalTemplateCategory;
  /** Aligns with PHASE_LABELS in web/src/lib/showcase/gallery.ts. */
  phase_slug: string;
  /** One-line summary shown on the listing card. */
  summary: string;
  /** Path relative to the repo root — 'web/content/templates/legal/…md'. */
  file_path: string;
  version: string;
  revision_date: string;
  /** Prominent short-form disclaimer surfaced on preview pages. */
  disclaimer: string;
  /** `{{token}}` names the template contains, in the order most humans expect. */
  placeholders: string[];
  sources: LegalTemplateSource[];
}

const DISCLAIMER_SHORT =
  "TEMPLATE ONLY — NOT LEGAL ADVICE. Have this reviewed by an Australian-qualified lawyer before adoption. BlockID does not hold an AFSL and cannot provide personal legal, financial, or tax advice.";

export const LEGAL_TEMPLATES: LegalTemplate[] = [
  {
    slug: "au-pty-ltd-constitution",
    title: "AU Pty Ltd Constitution",
    category: "corporate",
    phase_slug: "phase-1",
    summary:
      "Modern AU proprietary company constitution — displaces s135 replaceable rules and covers share classes, pre-emptive, drag/tag, dividends, meetings, and dispute resolution.",
    file_path: "web/content/templates/legal/au-pty-ltd-constitution.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "adoption_date",
      "share_classes",
      "first_directors",
      "first_director_signature_name",
      "drag_along_threshold",
      "reserved_matter_threshold",
      "debt_ceiling",
      "casting_vote_yes",
      "casting_vote_no",
      "revision_date",
    ],
    sources: [
      {
        label: "Corporations Act 2001 (Cth) — ss136, 140, 249H, 249X",
        url: "https://www.legislation.gov.au/Details/C2024C00278",
      },
      {
        label: "LawPath — AU Pty Ltd Constitution template",
        url: "https://lawpath.com.au/legal-documents/company-constitution",
      },
      {
        label: "Maddocks — Corporate Advisory (drag/tag drafting)",
        url: "https://www.maddocks.com.au/",
      },
    ],
  },
  {
    slug: "au-founder-agreement",
    title: "AU Founder Agreement (co-founder terms + reverse-vesting)",
    category: "corporate",
    phase_slug: "phase-1",
    summary:
      "Chapter-1 co-founder agreement — equity split, 4-year reverse-vesting with 1-year cliff, Good/Bad Leaver, roles + commitment, confidentiality, restraints (NSW ROT cascading), Reserved Matters, deadlock (mediation → Russian Roulette), and Change-of-Control acceleration.",
    file_path: "web/content/templates/legal/au-founder-agreement.md",
    version: "1.0",
    revision_date: "2026-07-25",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "company_business_description",
      "effective_date",
      "founder_1_name",
      "founder_1_address",
      "founder_1_shares",
      "founder_1_pct",
      "founder_1_role",
      "founder_1_commitment",
      "founder_2_name",
      "founder_2_address",
      "founder_2_shares",
      "founder_2_pct",
      "founder_2_role",
      "founder_2_commitment",
      "founder_3_name",
      "founder_3_address",
      "founder_3_shares",
      "founder_3_pct",
      "founder_3_role",
      "founder_3_commitment",
      "issue_price_per_share_aud",
      "vesting_total_months",
      "vesting_cliff_months",
      "unvested_buyback_price_aud",
      "permitted_other_hours_per_week",
      "first_priced_raise_aud",
      "founder_stipend_aud_per_month",
      "bad_leaver_price_aud",
      "restraint_period_1_months",
      "restraint_period_2_months",
      "restraint_period_3_months",
      "restraint_area_1",
      "restraint_area_2",
      "restraint_area_3",
      "related_party_threshold_aud",
      "debt_threshold_aud",
      "governing_state",
      "director_name",
      "annexure_a_disclosures",
      "revision_date",
    ],
    sources: [
      {
        label:
          "Corporations Act 2001 (Cth) — ss 12 (associates), 127 (execution), 168 (Register of Members), 254T (solvency test), 254X, Part 2J.1 (buy-backs)",
        url: "https://www.legislation.gov.au/C2004A00818/latest/text",
      },
      {
        label:
          "Restraints of Trade Act 1976 (NSW) — s 4 (read-down power)",
        url: "https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1976-067",
      },
      {
        label:
          "Copyright Act 1968 (Cth) — Part IX moral rights (ss 195AW, 195AWA)",
        url: "https://www.legislation.gov.au/C1968A00063/latest/text",
      },
      {
        label:
          "Superannuation Guarantee (Administration) Act 1992 (Cth) + Taxation Administration Act 1953 (Cth) Sch 1 (PAYG)",
        url: "https://www.legislation.gov.au/C2004A04435/latest/text",
      },
      {
        label:
          "Electronic Transactions Act 1999 (Cth) — e-signature validity",
        url: "https://www.legislation.gov.au/C2004A00553/latest/text",
      },
      {
        label:
          "Australian Disputes Centre — Guidelines for Commercial Mediation",
        url: "https://disputescentre.com.au/",
      },
      {
        label:
          "Blackbird / AirTree / Square Peg — public term sheets (double-trigger acceleration, 4y/1y vesting norm)",
        url: "https://www.blackbird.vc/starter-kit",
      },
    ],
  },
  {
    slug: "au-esop-scheme-rules",
    title: "AU ESOP Scheme Rules",
    category: "employment",
    phase_slug: "phase-8",
    summary:
      "Employee Share Option Plan rules calibrated to the Div 83A ITAA97 start-up concession — 4-year vest / 1-year cliff, single vs double trigger acceleration, Good/Bad leaver splits.",
    file_path: "web/content/templates/legal/au-esop-scheme-rules.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "scheme_name",
      "company_name",
      "acn",
      "adoption_date",
      "reserve_pool_pct",
      "default_cliff_months",
      "default_vest_months",
      "revision_date",
    ],
    sources: [
      {
        label: "ITAA97 — Division 83A (employee share schemes)",
        url: "https://www.legislation.gov.au/Details/C2024C00263",
      },
      {
        label: "ATO — ESS start-up concession (QC 45684)",
        url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/employee-share-schemes/concessions/start-up-concession",
      },
      {
        label: "ASIC Instrument 2022/1021 — employee incentive scheme relief",
        url: "https://asic.gov.au/regulatory-resources/find-a-document/legislative-instruments/",
      },
    ],
  },
  {
    slug: "au-employment-contract",
    title: "AU Employment Contract (Fair Work-compliant)",
    category: "employment",
    phase_slug: "phase-8",
    summary:
      "Full-time / part-time / casual employment agreement drafted against the Fair Work Act 2009 NES — Modern Award slot, annualised set-off clause, Div-8 IP assignment, NSW / Vic restraint clause, s117 notice, s119 redundancy.",
    file_path: "web/content/templates/legal/au-employment-contract.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "employee_name",
      "employee_address",
      "position_title",
      "reporting_manager",
      "employment_type",
      "modern_award_name",
      "modern_award_code",
      "award_classification",
      "work_location",
      "start_date",
      "probation_period_months",
      "ordinary_hours_per_week",
      "base_salary_aud",
      "pay_frequency",
      "restraint_period",
      "restraint_geography",
      "restraint_scope",
      "post_probation_notice_weeks",
      "governing_state",
      "signing_date",
      "authorised_signatory_name",
      "authorised_signatory_title",
      "revision_date",
    ],
    sources: [
      {
        label: "Fair Work Act 2009 (Cth) — NES, ss61-131 (leave, notice, redundancy)",
        url: "https://www.legislation.gov.au/C2009A00028/latest/text",
      },
      {
        label: "Fair Work Ombudsman — Modern Awards list (121 awards)",
        url: "https://www.fairwork.gov.au/employment-conditions/awards/list-of-awards",
      },
      {
        label: "Superannuation Guarantee (Administration) Act 1992 (Cth)",
        url: "https://www.legislation.gov.au/C2004A04435/latest/text",
      },
      {
        label: "Restraints of Trade Act 1976 (NSW)",
        url: "https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1976-067",
      },
    ],
  },
  {
    slug: "au-ip-assignment-deed-founder",
    title: "AU Founder IP Assignment Deed",
    category: "ip",
    phase_slug: "phase-1",
    summary:
      "Executed as a deed (no consideration needed) — assigns all pre-incorporation and future IP from a founder to the company with retrospective effect, moral rights consent, and Electronic Transactions Act e-signing block.",
    file_path: "web/content/templates/legal/au-ip-assignment-deed-founder.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "company_business_description",
      "founder_name",
      "founder_address",
      "effective_date",
      "director_name",
      "second_director_name",
      "excluded_ip_description",
      "annexure_a_disclosures",
      "annexure_b_ip_description",
      "restraint_period_months",
      "restraint_geography",
      "restraint_scope",
      "governing_state",
      "revision_date",
    ],
    sources: [
      {
        label: "Copyright Act 1968 (Cth) — Part IX (moral rights) + s195AW / s195AWA",
        url: "https://www.legislation.gov.au/C1968A00063/latest/text",
      },
      {
        label: "Patents Act 1990 (Cth) + Designs Act 2003 (Cth) + Trade Marks Act 1995 (Cth)",
        url: "https://www.ipaustralia.gov.au/",
      },
      {
        label: "Corporations Act 2001 (Cth) — s127 execution",
        url: "https://www.legislation.gov.au/C2004A00818/latest/text",
      },
      {
        label: "Electronic Transactions Act 1999 (Cth) — e-signature validity",
        url: "https://www.legislation.gov.au/C2004A00553/latest/text",
      },
      {
        label: "Personal Property Securities Act 2009 (Cth)",
        url: "https://www.legislation.gov.au/C2009A00130/latest/text",
      },
    ],
  },
  {
    slug: "au-ip-assignment-deed-contractor",
    title: "AU Contractor IP Assignment Deed",
    category: "ip",
    phase_slug: "phase-4",
    summary:
      "Closes the raise-blocking gap where contractor code defaults to the contractor (not the company) — assigns Foreground IP, licenses Background IP, procures moral rights consent, and includes a sham-contracting representation.",
    file_path: "web/content/templates/legal/au-ip-assignment-deed-contractor.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "contractor_name",
      "contractor_abn",
      "contractor_address",
      "contractor_signatory_name",
      "contractor_signatory_title",
      "services_agreement_date",
      "services_description",
      "effective_date",
      "director_name",
      "second_director_name",
      "annexure_a_disclosures",
      "annexure_b_deliverables_description",
      "governing_state",
      "revision_date",
    ],
    sources: [
      {
        label: "Copyright Act 1968 (Cth) — s35(6) (default employer/contractor rule) + Part IX",
        url: "https://www.legislation.gov.au/C1968A00063/latest/text",
      },
      {
        label: "Fair Work Act 2009 (Cth) — Part 3-1 (sham contracting)",
        url: "https://www.legislation.gov.au/C2009A00028/latest/text",
      },
      {
        label: "CFMMEU v Personnel Contracting [2022] HCA 1 (contractor vs employee test)",
        url: "https://eresources.hcourt.gov.au/showCase/2022/HCA/1",
      },
      {
        label: "Corporations Act 2001 (Cth) — s127 execution",
        url: "https://www.legislation.gov.au/C2004A00818/latest/text",
      },
      {
        label: "Electronic Transactions Act 1999 (Cth) — e-signature validity",
        url: "https://www.legislation.gov.au/C2004A00553/latest/text",
      },
    ],
  },
  {
    slug: "au-safe",
    title: "AU-flavoured SAFE (Simple Agreement for Future Equity)",
    category: "fundraising",
    phase_slug: "phase-9",
    summary:
      "Post-money SAFE adapted for Australia — NSW governing law, Corporations Act references (not Delaware GCL), sophisticated-investor reps, cap-only / discount-only / cap+discount variants.",
    file_path: "web/content/templates/legal/au-safe.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "company_name",
      "acn",
      "registered_office_address",
      "investor_name",
      "investor_address",
      "investor_abn",
      "purchase_amount_aud",
      "valuation_cap_aud",
      "discount_rate",
      "issue_date",
      "governing_state",
      "variant_cap_only",
      "variant_discount_only",
      "variant_cap_and_discount",
      "revision_date",
    ],
    sources: [
      {
        label: "Y Combinator Post-Money SAFE v1.2 (US reference)",
        url: "https://www.ycombinator.com/documents",
      },
      {
        label: "LawPath — AU SAFE template",
        url: "https://lawpath.com.au/legal-documents/safe-note-simple-agreement-for-future-equity",
      },
      {
        label: "Corporations Act 2001 (Cth) — ss708(8), 708(11), 254T, 127",
        url: "https://www.legislation.gov.au/Details/C2024C00278",
      },
    ],
  },
  {
    slug: "au-customer-loi",
    title: "AU Customer Letter of Intent (non-binding)",
    category: "commercial",
    phase_slug: "phase-2",
    summary:
      "Non-binding customer Letter of Intent — anchors indicative ACV, use case, and PoV acceptance criteria for a raise data room, while forcing s18 ACL / s1041H Corporations Act misleading-conduct guardrails so the founder can safely disclose it to investors.",
    file_path: "web/content/templates/legal/au-customer-loi.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "customer_name",
      "customer_abn_line",
      "customer_address",
      "customer_signatory_name",
      "customer_signatory_title",
      "customer_stakeholders",
      "company_name",
      "acn",
      "registered_office_address",
      "director_name",
      "second_signatory_name",
      "second_signatory_title",
      "product_name",
      "loi_date",
      "intended_use_case",
      "indicative_acv_aud",
      "indicative_seats",
      "preferred_start_date",
      "preferred_payment_terms",
      "target_definitive_date",
      "governing_state",
      "acceptance_criteria",
      "statutory_approvals",
      "revision_date",
    ],
    sources: [
      {
        label:
          "Australian Consumer Law s18 (misleading and deceptive conduct) — Schedule 2 to the Competition and Consumer Act 2010 (Cth)",
        url: "https://www.legislation.gov.au/C2010A00148/latest/text",
      },
      {
        label:
          "Corporations Act 2001 (Cth) — s1041H (misleading conduct in financial products) + s769C + s127 (execution)",
        url: "https://www.legislation.gov.au/C2004A00818/latest/text",
      },
      {
        label:
          "Privacy Act 1988 (Cth) — Australian Privacy Principles (Schedule 1)",
        url: "https://www.legislation.gov.au/C2004A03712/latest/text",
      },
      {
        label:
          "A New Tax System (Goods and Services Tax) Act 1999 (Cth) — s29-70 (tax invoice requirements)",
        url: "https://www.legislation.gov.au/C2004A00446/latest/text",
      },
      {
        label: "Electronic Transactions Act 1999 (Cth) — e-signature validity",
        url: "https://www.legislation.gov.au/C2004A00553/latest/text",
      },
      {
        label:
          "Australian Disputes Centre — Guidelines for Commercial Mediation",
        url: "https://disputescentre.com.au/",
      },
    ],
  },
  {
    slug: "au-customer-discovery-interview-log",
    title: "AU Customer Discovery Interview Log",
    category: "commercial",
    phase_slug: "phase-2",
    summary:
      "Structured discovery-interview log for the Phase-2 (Idea Validation) raise-evidence pack — APP1/APP5 informed-consent block, Mom-Test past-behaviour prompts, red-flag audit, and s18 ACL / s1041H Corps Act guardrails on how the founder may re-use quotes in investor materials.",
    file_path:
      "web/content/templates/legal/au-customer-discovery-interview-log.md",
    version: "1.0",
    revision_date: "2026-07-24",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "interviewer_name",
      "interviewer_email",
      "company_name",
      "acn",
      "product_hypothesis",
      "interview_number",
      "interview_date",
      "interview_channel",
      "current_workflow_short",
      "consent_written_log",
      "consent_named_reference",
      "consent_verbatim_quote",
      "consent_recording_response",
      "recording_storage_location",
      "interviewee_name",
      "interviewee_role",
      "interviewee_company",
      "interviewee_company_abn_line",
      "interviewee_email",
      "sourcing_channel",
      "prior_relationship",
      "compensation_offered",
      "last_time_prompt",
      "answer_past_behaviour",
      "answer_current_workflow",
      "pain_frequency_words",
      "pain_frequency_normalised",
      "pain_time_words",
      "pain_time_hours",
      "pain_cost_words",
      "pain_cost_estimate_aud",
      "pain_rating_words",
      "pain_rating",
      "answer_prior_attempts",
      "answer_purchase_authority",
      "answer_willingness_to_test",
      "pilot_scope",
      "pilot_start_date",
      "pricing_unit",
      "answer_price_indication",
      "quote_1",
      "quote_1_context",
      "quote_2",
      "quote_2_context",
      "quote_3",
      "quote_3_context",
      "signal_specific_past",
      "signal_specific_past_evidence",
      "signal_prior_spend",
      "signal_prior_spend_evidence",
      "signal_introduction",
      "signal_introduction_evidence",
      "signal_budget_line",
      "signal_budget_line_evidence",
      "red_flag_hypothetical",
      "red_flag_hypothetical_evidence",
      "red_flag_leading",
      "red_flag_leading_evidence",
      "confidence_level",
      "followup_evidence_needed",
      "pivot_direction",
      "followup_commitment",
      "followup_date",
      "storage_location",
      "retention_period_days",
      "access_control_list",
      "sample_size_context",
      "reviewer_name",
      "reviewer_date",
      "governing_state",
      "revision_date",
    ],
    sources: [
      {
        label:
          "Privacy Act 1988 (Cth) — Australian Privacy Principles (Schedule 1) — APP 1, 3, 5, 6, 11, 12, 13",
        url: "https://www.legislation.gov.au/C2004A03712/latest/text",
      },
      {
        label:
          "OAIC — APP Guidelines Chapter B (Key concepts) + Chapter 3 (APP 3 collection of personal information)",
        url: "https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines",
      },
      {
        label:
          "Australian Consumer Law s18 (misleading and deceptive conduct) — Schedule 2 to the Competition and Consumer Act 2010 (Cth)",
        url: "https://www.legislation.gov.au/C2010A00148/latest/text",
      },
      {
        label:
          "Corporations Act 2001 (Cth) — s1041H (misleading conduct in financial products)",
        url: "https://www.legislation.gov.au/C2004A00818/latest/text",
      },
      {
        label:
          "Rob Fitzpatrick — The Mom Test (customer-discovery interview discipline)",
        url: "https://www.momtestbook.com/",
      },
      {
        label:
          "Steve Blank — Four Steps to the Epiphany (customer development)",
        url: "https://web.stanford.edu/group/e145/cgi-bin/winter/drupal/upload/handouts/Four_Steps.pdf",
      },
    ],
  },
  {
    slug: "au-pmf-signal-survey",
    title: "AU PMF Signal Survey (\"very disappointed %\")",
    category: "commercial",
    phase_slug: "phase-5",
    summary:
      "Sean Ellis / Rahul Vohra product-market-fit signal survey template for a Phase-5 (PMF / Early Traction) raise-evidence pack — canonical 4-question instrument, APP1/APP5 informed-consent block, denominator-hygiene guardrails, Wilson-CI sample-size floor, and s18 ACL / s1041H Corps Act disclosure rules on how the headline % may be quoted to investors.",
    file_path: "web/content/templates/legal/au-pmf-signal-survey.md",
    version: "1.0",
    revision_date: "2026-07-25",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "product_name",
      "survey_run_number",
      "field_window_start",
      "field_window_end",
      "survey_channel",
      "run_by_name",
      "run_by_email",
      "company_name",
      "acn",
      "product_surface",
      "active_user_definition",
      "eligibility_rule",
      "eligible_population_count",
      "invited_count",
      "excluded_count",
      "excluded_reason",
      "invitation_channel",
      "incentive_offered",
      "reminder_cadence",
      "recency_window_days",
      "consent_aggregate",
      "consent_verbatim_quote",
      "consent_followup_interview",
      "q1_very_disappointed_count",
      "q1_somewhat_disappointed_count",
      "q1_not_disappointed_count",
      "q1_na_no_longer_use_count",
      "total_invitations",
      "responses_started",
      "responses_completed",
      "response_rate_pct",
      "excluded_post_hoc_count",
      "excluded_post_hoc_reason",
      "final_denominator",
      "very_disappointed_pct",
      "somewhat_disappointed_pct",
      "not_disappointed_pct",
      "na_excluded_pct",
      "wilson_ci_low",
      "wilson_ci_high",
      "sample_size_sufficient_narrative",
      "high_expectation_filter",
      "high_exp_n",
      "high_exp_vd_pct",
      "high_exp_interpretation",
      "q3_theme_1",
      "q3_theme_1_count",
      "q3_theme_1_aligned",
      "q3_theme_2",
      "q3_theme_2_count",
      "q3_theme_2_aligned",
      "q3_theme_3",
      "q3_theme_3_count",
      "q3_theme_3_aligned",
      "q4_theme_1",
      "q4_theme_1_count",
      "q4_theme_1_in_roadmap",
      "q4_theme_2",
      "q4_theme_2_count",
      "q4_theme_2_in_roadmap",
      "q4_theme_3",
      "q4_theme_3_count",
      "q4_theme_3_in_roadmap",
      "quote_1_text",
      "quote_1_context",
      "quote_1_consent",
      "quote_2_text",
      "quote_2_context",
      "quote_2_consent",
      "bias_survivorship",
      "bias_survivorship_evidence",
      "bias_leading",
      "bias_leading_evidence",
      "bias_nonresponse",
      "bias_nonresponse_evidence",
      "bias_incentive",
      "bias_incentive_evidence",
      "bias_denominator",
      "bias_denominator_evidence",
      "red_flag_contradiction",
      "red_flag_contradiction_evidence",
      "raw_storage_location",
      "aggregate_storage_location",
      "retention_period_days",
      "access_control_list",
      "sign_off_date",
      "reviewer_name",
      "reviewer_date",
      "governing_state",
      "revision_date",
    ],
    sources: [
      {
        label:
          "Sean Ellis — The Startup Pyramid (2010) — origin of the \"very disappointed %\" PMF signal",
        url: "https://www.startup-marketing.com/the-startup-pyramid/",
      },
      {
        label:
          "Rahul Vohra — How Superhuman Built an Engine to Find Product/Market Fit (First Round Review, 2018)",
        url: "https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/",
      },
      {
        label:
          "Privacy Act 1988 (Cth) — Australian Privacy Principles (Schedule 1) — APP 1, 3, 5, 6, 11, 12, 13",
        url: "https://www.legislation.gov.au/C2004A03712/latest/text",
      },
      {
        label:
          "OAIC — APP Guidelines Chapter B (Key concepts) + Chapter 3 (APP 3 collection of personal information)",
        url: "https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines",
      },
      {
        label:
          "Australian Consumer Law s18 (misleading and deceptive conduct) — Schedule 2 to the Competition and Consumer Act 2010 (Cth)",
        url: "https://www.legislation.gov.au/C2010A00148/latest/text",
      },
      {
        label:
          "Corporations Act 2001 (Cth) — s1041H (misleading conduct in financial products)",
        url: "https://www.legislation.gov.au/C2004A00818/latest/text",
      },
    ],
  },
  {
    slug: "au-ga4-measurement-plan",
    title: "AU GA4 Measurement Plan",
    category: "commercial",
    phase_slug: "phase-7",
    summary:
      "Investor-defensible Google Analytics 4 measurement plan for a Phase-7 (Growth / Analytics) data-room — event taxonomy, GST-hygienic revenue events, APP1/APP3/APP5/APP8/APP11 consent + retention baseline (Privacy Act 1988 (Cth)), cohort-floor and Wilson-CI guardrails, and s18 ACL / s1041H Corps Act misleading-conduct disclosure rules for founder-facing KPI packs.",
    file_path: "web/content/templates/legal/au-ga4-measurement-plan.md",
    version: "1.0",
    revision_date: "2026-07-25",
    disclaimer: DISCLAIMER_SHORT,
    placeholders: [
      "product_name",
      "plan_version",
      "effective_date",
      "plan_owner_name",
      "plan_owner_email",
      "company_name",
      "acn",
      "ga4_property_id",
      "ga4_measurement_id",
      "data_stream_urls",
      "aha_moment_definition",
      "activation_event_name",
      "activation_window_days",
      "retention_period",
      "cohort_dimension",
      "revenue_reconciliation_tolerance_pct",
      "referral_surface_slug",
      "consent_banner_component",
      "consent_banner_screenshot_ref",
      "consent_storage_key",
      "consent_storage_impl",
      "consent_storage_repo_ref",
      "gtag_bootstrap_snippet_ref",
      "gtag_snippet_screenshot_ref",
      "ga4_ip_anonymise_config_ref",
      "privacy_policy_url",
      "privacy_policy_version",
      "privacy_policy_cross_border_section",
      "ga4_retention_months",
      "ga4_retention_screenshot_ref",
      "google_signals_state",
      "user_id_hashing_impl",
      "user_id_hash_test_ref",
      "signup_form_route",
      "acquisition_owner",
      "activation_trigger_description",
      "activation_owner",
      "aha_event_name",
      "aha_trigger_description",
      "retention_owner",
      "feature_slug_enum_ref",
      "revenue_owner",
      "growth_owner",
      "cohort_min_n",
      "ab_test_min_n_per_arm",
      "ab_test_min_lift_pct",
      "retention_period_days",
      "plan_owner_sign_off_date",
      "technical_implementer_name",
      "technical_implementer_sign_off_date",
      "legal_reviewer_name",
      "legal_reviewer_sign_off_date",
      "consent_banner_live_state",
      "purchase_pipeline_live_state",
      "initial_reconciliation_state",
      "revision_date",
    ],
    sources: [
      {
        label:
          "Privacy Act 1988 (Cth) — Australian Privacy Principles (Schedule 1) — APP 1, 3, 5, 6, 8, 11",
        url: "https://www.legislation.gov.au/C2004A03712/latest/text",
      },
      {
        label:
          "OAIC — Guide to securing personal information (APP 11 guidance)",
        url: "https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/guide-to-securing-personal-information",
      },
      {
        label: "Google — Google Consent Mode v2 developer reference",
        url: "https://developers.google.com/tag-platform/security/guides/consent",
      },
      {
        label: "Google — GA4 event taxonomy reference (recommended events)",
        url: "https://developers.google.com/analytics/devguides/collection/ga4/reference/events",
      },
      {
        label:
          "A New Tax System (Goods and Services Tax) Act 1999 (Cth) — s9-70 (GST payable)",
        url: "https://www.legislation.gov.au/C2004A00446/latest/text",
      },
      {
        label:
          "Australian Consumer Law s18 (misleading and deceptive conduct) — Schedule 2 to the Competition and Consumer Act 2010 (Cth)",
        url: "https://www.legislation.gov.au/C2010A00148/latest/text",
      },
      {
        label:
          "Corporations Act 2001 (Cth) — s1041H (misleading conduct in financial products)",
        url: "https://www.legislation.gov.au/C2004A00818/latest/text",
      },
    ],
  },
];

export function getTemplate(slug: string): LegalTemplate | undefined {
  return LEGAL_TEMPLATES.find((t) => t.slug === slug);
}

export function listTemplates(): LegalTemplate[] {
  return LEGAL_TEMPLATES.slice();
}

/**
 * Resolves a template file path against the current working directory.
 * The Next.js server runs from three shapes depending on how it was booted:
 *   - dev:                  cwd = `web/`             → `<cwd>/content/templates/…`
 *   - `npm start` at repo:  cwd = repo root          → `<cwd>/web/content/templates/…`
 *   - standalone (prod):    cwd = `.next/standalone` → `<cwd>/content/templates/…`
 * Round 5.5 QA fix: previously only the first two were handled; the standalone
 * runtime saw `<cwd>/web/content/…` which does not exist under the standalone
 * output (it copies `content/` at the root, not under a `web/` prefix). Now we
 * try both, in order.
 */
function resolveTemplatePath(filePath: string): string {
  const cwd = process.cwd();
  const stripped = filePath.startsWith("web/")
    ? filePath.slice("web/".length)
    : filePath;
  // Dev and standalone both work when the `web/` prefix is dropped and
  // resolved relative to cwd (the standalone output already flattens `web/`).
  const dropWebPrefix = path.join(cwd, stripped);
  if (existsSync(dropWebPrefix)) return dropWebPrefix;
  // Fall back to preserving the full repo-relative path (repo-root cwd).
  return path.join(cwd, filePath);
}

export async function readTemplateRaw(slug: string): Promise<string | null> {
  const tpl = getTemplate(slug);
  if (!tpl) return null;
  try {
    const abs = resolveTemplatePath(tpl.file_path);
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

/**
 * Substitutes `{{token}}` placeholders in the template body.
 *
 * Values are inserted verbatim — callers should sanitise / validate before
 * passing. Unknown tokens are left untouched so the founder can see what
 * still needs filling in when the rendered doc is downloaded.
 *
 * Section blocks like `{{#variant_cap_only}}…{{/variant_cap_only}}` are
 * treated as truthy toggles — passing `variant_cap_only: "true"` keeps the
 * inner text; anything else (or omission) strips the block.
 */
export async function renderTemplate(
  slug: string,
  values: Record<string, string>,
): Promise<string | null> {
  const raw = await readTemplateRaw(slug);
  if (raw == null) return null;
  return applySubstitutions(raw, values);
}

export function applySubstitutions(
  body: string,
  values: Record<string, string>,
): string {
  // 1) Handle section toggles {{#name}}…{{/name}} first — greedy per pair.
  const sectionRe = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let out = body.replace(sectionRe, (_full, name: string, inner: string) => {
    const val = values[name];
    const truthy =
      val === "true" || val === "1" || val === "yes" || val === "on";
    return truthy ? inner : "";
  });

  // 2) Substitute simple {{token}} placeholders.
  const tokenRe = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  out = out.replace(tokenRe, (_full, name: string) => {
    const val = values[name];
    return typeof val === "string" ? val : `{{${name}}}`;
  });

  return out;
}
