/**
 * Google Analytics 4 + GTM event tracking for BlockID.au
 *
 * Usage:
 *   import { trackEvent } from "@/lib/analytics";
 *   trackEvent("svi_submitted", { method: "text" });
 *
 * All events are also pushed to `window.dataLayer` so GTM can pick them up
 * without any additional wiring.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Event definitions ──────────────────────────────────────────────────────
// Typed map: event name → payload shape. Keeps call-sites type-safe.

export interface AnalyticsEventMap {
  // ── SVI Funnel ──
  svi_form_started: { method: "text" | "voice" | "file" | "example" };
  svi_voice_input: Record<string, never>;
  svi_file_uploaded: { file_type: string };
  /** `arm` = the homepage hero one-liner shown (T0250) when the submit came from the hero omnibox. */
  svi_submitted: { method: "text" | "file"; has_file: boolean; arm?: string };
  svi_analysis_complete: { svi_score: number; slug: string };
  svi_result_reset: Record<string, never>;
  svi_paywall_shown: Record<string, never>;
  svi_paywall_checkout_click: Record<string, never>;
  svi_paywall_analysis_click: { price: number };
  svi_paywall_credit_pack_click: { pack: string; credits: number };
  svi_paywall_coupon_submit: { code: string };
  svi_credit_gate_shown: { balance: number; cost: number };
  svi_paywall_founding50_click: Record<string, never>;
  // S31-B: paywall option C is the Starter plan now (Founding 100 closed).
  svi_paywall_starter_click: Record<string, never>;
  svi_section_picker_opened: Record<string, never>;
  svi_modular_submitted: { sectionCount: number };
  svi_modular_complete: { sectionCount: number; totalCredits: number };

  // ── Score Form ──
  // Extended payloads (2026-08-23): capture source attribution + submit-time
  // signal so /score funnel is measurable in GA4 without a rebuild. Keep
  // legacy fields (company_name / total_score) optional for pre-existing
  // dashboards.
  score_form_started: {
    source?: "hero_search" | "direct";
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
  score_form_step: { step: number; step_name: string };
  score_form_submitted: {
    company_name?: string;
    totalScore?: number;
    persisted?: boolean;
    hasValuation?: boolean;
    hasFundingReadiness?: boolean;
  };
  score_result_viewed: { slug?: string; total_score?: number };

  // ── Auth ──
  login_page_viewed: Record<string, never>;
  login_google_clicked: Record<string, never>;
  /** Google sign-in attempt began — `gis` = pop-up button, `redirect` = server-side OAuth. */
  login_google_start: { flow: "gis" | "redirect" };
  login_google_success: Record<string, never>;
  /** Google sign-in failed on the page — `reason` is a short code (see lib/auth/google-sign-in-errors.ts). */
  login_google_error: { flow: "gis" | "redirect"; reason: string };
  login_email_requested: Record<string, never>;
  login_email_verified: Record<string, never>;
  login_password_success: Record<string, never>;
  register_password_success: Record<string, never>;
  partner_code_applied: { valid: boolean };

  // ── Pricing & Checkout ──
  pricing_viewed: Record<string, never>;
  /**
   * G12 (T0268): the Evaluator tab (Scout / Firm / Program / Fund) was shown
   * on /pricing. Pricing v4 (2026-09-16): the Programs tab fires the same
   * event with `tab: "programs"` so the two B2B ladders stay one funnel.
   */
  evaluator_pricing_viewed: { via: "tab" | "deep_link"; tab?: "evaluator" | "programs" };
  /** G12 (S13-A): the 4-step activation checklist under the trial banner was shown; `completed` = steps already done (0–4). */
  evaluator_checklist_viewed: { completed: number };
  /** G12 (S13-A): a checklist step CTA was clicked (1 add startup · 2 run report · 3 set thesis · 4 second startup). */
  evaluator_checklist_step: { step: 1 | 2 | 3 | 4 };
  /** G13 (S-D1): the Investor Dossier (/workspace/evaluations/[id]) was opened — once per page view; `role` = assessor (evaluator) or founder (read-only preview). */
  dossier_view: { evaluation_id: string; consent_tier: string; plan: string; role: "assessor" | "founder" };
  /** G13/G14 GA4 audit leftover: emitted server-side (lib/evaluations/assessments.ts upsertAssessment) whenever an evaluator submits (not drafts) their assessment. */
  assessment_submitted: { evaluation_id: string; decision: "pass" | "track" | "proceed" | "none"; version: number };
  /** G13 (S-D2, §C.5): the evaluator saved a draft or submitted their assessment on the dossier; `decision` = pass | track | proceed | none. */
  investor_decision_saved: { evaluation_id: string; decision: "pass" | "track" | "proceed" | "none"; status: "draft" | "submitted"; version: number };
  /** G13 (S-D2, §C.5): the assessment was shared with the claimed founder; `fields_count` = ticked allow-listed sections (1–4). */
  assessment_shared: { evaluation_id: string; fields_count: number };
  /** G13 (S-D2, §C.5): the assessment history timeline was expanded; `versions` = rows shown. */
  assessment_history_viewed: { evaluation_id: string; versions: number };
  /** G13 (S-D3, §C.5): an IC memo / one-pager was exported from the dossier header. */
  ic_memo_exported: { evaluation_id: string; kind: "memo" | "one_page" };
  /** G13 (S-D3, §C.5): the seats consensus table rendered with ≥ 2 seats. */
  consensus_viewed: { evaluation_id: string; seats: number };
  /** G13 (S-D3, §C.5): an intro was requested — `channel` mailto (Scout) or crm (Firm/Program → investor_contacts; founder side → investor notified). */
  intro_requested: { channel: "mailto" | "crm"; side: "evaluator" | "founder" };
  /**
   * G14 (S34): founder feedback letter "What investors said". `sent` and
   * `opened` are emitted server-side (cron / GET /api/founder/feedback-letter
   * — see lib/analytics/events.ts); `viewed` fires once per landing mount of
   * the block, `action_clicked` on one of its three next-action CTAs.
   * `weakest_dim` = FTV … SVM; never an evaluator id.
   */
  feedback_letter_sent: { letter_id: string; k: number; org_count: number; weakest_dim: string };
  feedback_letter_opened: { letter_id: string; k: number; weakest_dim: string };
  feedback_letter_viewed: { letter_id: string; k: number; weakest_dim: string; phase: string };
  feedback_action_clicked: { letter_id: string; action_id: string; dimension: string; href: string };
  /** G13 (S-D2 E1.4, §C.5): the founder taxonomy confirmation card rendered (unconfirmed row). */
  taxonomy_card_viewed: { project_id: string; unclassified_count: number };
  /** G13 (S-D2 E1.4, §C.5): the founder confirmed the classification; `changed_fields` = axes edited before confirming. */
  taxonomy_confirmed: { project_id: string; changed_fields: number; unclassified_count: number };
  /** G13 (S-D2 E1.4, §C.5): one axis was edited on the confirmation card. */
  taxonomy_edited: { project_id: string; field: "industry" | "business_model" | "stage_key" | "customer_types" | "geo_scope" | "hq_state" | "tags" };
  /** G13 (S-T2, §C.5): the 7-section mandate form was saved; `sections_filled` = sections carrying a value (0–7). */
  mandate_saved: { sections_filled: number; created: boolean };
  /** G13 (S-T2, §C.5): a deal-flow filter changed; `axis` = which control. */
  dealflow_filter_applied: { axis: "industry" | "business_model" | "stage" | "state" | "tags" | "min_fit" | "min_svi" | "moved" | "sort" | "view" | "mandate" };
  /** G13 (S-T2, §C.5): a deal-flow saved view was created; `views` = the user's count afterwards. */
  dealflow_view_saved: { views: number };
  /** G13 (S-T2, §C.5): "Investors who match" rendered for a founder; `matches` = cards shown, `source` = where the candidates came from. */
  founder_match_viewed: { matches: number; source: "mandates" | "prefs" | "mixed" | "none" };
  pricing_toggle_billing: { annual: boolean };
  plan_cta_clicked: { plan: string; label: string };
  /** G25-D: the explicit Pay / Add-card click on /checkout/review — the only Stripe hand-off. */
  checkout_started: { plan: string; kind?: "plan" | "pack" | "sku"; interval?: "monthly" | "annual" | "once"; trial?: boolean; entry?: string; amount_cents?: number };
  /** G25-D: /checkout/review rendered; `entry` = the surface that linked here. */
  checkout_review_viewed: { plan: string; kind: "plan" | "pack" | "sku"; interval: "monthly" | "annual" | "once"; trial: boolean; entry: string; amount_cents: number };
  checkout_completed: { plan: string; value?: number; currency?: string };
  coupon_applied: { code: string; discount_pct: number };

  // ── Lead Capture ──
  lead_form_submitted: { source: string; intent?: string };
  newsletter_signup: Record<string, never>;

  // ── Founding 50 ──
  founding50_viewed: Record<string, never>;
  founding50_submitted: { has_coupon: boolean };
  founding50_checkout_redirect: { price: number };

  // ── Tools ──
  tool_accessed: { tool: string };
  tool_result_generated: { tool: string };

  // ── R&D Agent ──
  rnd_analysis_complete: { svi_score: number; slug: string };
  rnd_deep_dive_upgrade: { from_tier: string };
  rnd_deep_dive_complete: { svi_score: number; slug: string };
  rnd_reanalyze: { slug: string };
  rnd_link_copied: { slug: string };
  report_unlock_click: { page: string };

  // ── Share / Investor Links ──
  investor_link_copied: { slug: string };
  investor_link_viewed: { slug: string };
  investor_pdf_downloaded: { slug: string };

  // ── Workspace ──
  dashboard_viewed: Record<string, never>;
  evidence_added: { evidence_type: string; dimension: string; svi_impact: number };
  evidence_vault_opened: Record<string, never>;
  billing_page_viewed: Record<string, never>;
  plan_upgrade_started: { from_plan: string; to_plan: string };

  // ── Referral ──
  referral_link_copied: Record<string, never>;
  referral_email_shared: Record<string, never>;
  referral_linkedin_shared: Record<string, never>;

  // ── Insight Articles (SEO + GTM keyword tracking) ──
  insight_article_viewed: { slug: string; category: string; primary_keyword: string; keyword_count: number; reading_time: number };
  insight_scroll_depth: { slug: string; depth: 25 | 50 | 75 | 100; category: string };
  insight_read_complete: { slug: string; category: string; primary_keyword: string };
  insight_cta_clicked: { slug: string; cta_label: string; cta_href: string; position: "early" | "mid" | "end" };

  // ── BlockID Startup Index ──
  index_viewed: Record<string, never>;

  // ── Startup Package public listing ──
  startup_listing_viewed: { slug: string };
  startup_listing_contact_submitted: { slug: string };

  // ── Hero / Search ──
  /** T0250 (G11 §4i D-5): which hero one-liner arm the homepage H1 rendered — F1 default, F2/F3 via `?hero=`. */
  hero_variant_shown: { arm: string };
  signup_cta: { location: string };
  search_analyse: { query: string };
  quick_tag_click: { tag: string };

  // ── Workspace actions ──
  analysis_run: { module: string };
  deliverable_download: { type: string };
  crm_push: Record<string, never>;

  // ── Navigation ──
  cta_clicked: { cta_id: string; location: string };
  nav_tool_selected: { tool: string };
  /**
   * G13-W1-IA1 — one sidebar / avatar-menu click. `group` is the
   * `NAV_GROUPS[].id` (or "user-menu" / "footer"), `item` the EN label,
   * `persona` the resolved `PersonaKey`, `phase` the 0..5 nav band.
   */
  nav_click: { group: string; item: string; href: string; persona: string; phase: number };
  /**
   * G13-W3-IA3 — founder landing (/dashboard). `landing_viewed` fires once
   * per mount with the canonical 12-phase id (`GrowthPhaseId`, or "none"
   * before a score), the plan id, the block names rendered and the ones in
   * their empty state. `landing_block_click` is the time-to-first-action
   * marker: `login_*_success` → first `landing_block_click | nav_click`.
   */
  landing_viewed: { phase: string; plan: string; blocks: string; empty_blocks: string; persona: string };
  landing_block_click: { block: string; href: string; phase: string; action: string; persona: string };
  /**
   * G13-W4-IA4 — single /onboarding wizard (3 steps × founder / evaluator
   * flow). `onboarding_step` fires on every step transition (`action` =
   * what advanced it: `persona_pick`, `startup_created`, `mandate_saved`,
   * `skip`, `back` …); `onboarding_completed` once, on the terminal action.
   * Completion rate by persona = completed / step-1 views.
   */
  onboarding_step: { persona: string; step: number; action: string };
  onboarding_completed: { persona: string };
  mobile_menu_opened: Record<string, never>;

  // ── Session ──
  logout: Record<string, never>;

  // ── First-time user tracking ──
  first_report_started: { is_first_time: boolean };
  first_report_completed: { svi_score: number; is_first_time: boolean };
  first_report_section_unlock: { section: string; depth: string; is_first_time: boolean };
  report_locked_preview_click: { page: string; section_title: string };

  // ── Action Plan ──
  action_completed: { action: string };

  // ── Progressive Monetization (T0074) ──
  report_viewed_tier_preview: { report_id: string };
  report_unlock_cta_shown: { section: string; tier: string };
  report_unlock_cta_clicked: { section: string; tier: string };
  report_upgraded_to_paid: { from_tier: string; to_tier: string };

  // ── Marketing pages ──
  roadmap_viewed: Record<string, never>;
  changelog_viewed: Record<string, never>;
  features_viewed: Record<string, never>;
  /**
   * G12 (T0274): `/compare` and its two alias routes. `all` = /compare,
   * `chatgpt` = /compare/chatgpt, `valuers` = /compare/valuers. The
   * evaluator signup funnel events belong to T0269, not here.
   */
  compare_viewed: { variant: "chatgpt" | "valuers" | "all" };

  // ── Reseller module (docs/plans/reseller-module-plan.md § U.9 + user
  //   direction: GA4 for user behavior + BlockID.au SEO/dev-progress
  //   telemetry). All events include reseller_code where applicable so
  //   GA4 audiences can segment by reseller.
  reseller_via_captured: { code: string; source: "url" | "cookie" | "onboarding" };
  reseller_code_validate_started: { code: string };
  reseller_code_validate_result: { code: string; ok: boolean; tier_pct: number | null; reason?: string };
  reseller_consent_shown: { code: string; reseller_name: string };
  reseller_consent_accepted: { code: string; reseller_name: string };
  reseller_consent_declined: { code: string; reseller_name: string };
  reseller_pill_shown: { code: string; tier_pct: number };
  reseller_console_viewed: { page: "dashboard" | "customers" | "codes" | "credits" | "create-startup" | "reports" | "settings"; reseller_id: string };
  reseller_grant_credits_started: { reseller_id: string; amount: number; over_budget: boolean };
  reseller_grant_credits_completed: { reseller_id: string; amount: number; over_budget: boolean };
  reseller_create_startup_started: { reseller_id: string; plan: string };
  reseller_create_startup_completed: { reseller_id: string; plan: string; user_id_hash: string };
  reseller_attribution_committed: { reseller_id: string; via_source: "code" | "provisioned" | "admin_manual" };

  // ── Startup Package (founder-package guided-interview flow) ─────────
  //   See docs/plans/startup-package sub-goals 3-5. Fired from the
  //   client wizard after each server ACK so GA4 captures the funnel
  //   even if the API log rotates.
  package_purchased: { plan_id: string; price: number };
  interview_step_completed: {
    step_key: string;
    char_count: number;
    project_id?: string;
  };
  agent_analysis_ran: {
    step_key: string;
    lead_agent: string;
    credits_spent: number;
    svi_delta: number | null;
  };

  // ── Showcase (Track B) — dev-progress + SEO tracking on the BlockID.au
  //   own workspace + guide. Feeds the "know where we are" dashboard.
  showcase_phase_advanced: { from_phase: number; to_phase: number; sha: string };
  showcase_guide_viewed: { chapter: number; locale: "en" | "vi"; source: "onboarding" | "marketing" };
  showcase_reports_viewed: { total_reports: number; source: "marketing" };
  showcase_report_downloaded: { template: string; phase: number };
  showcase_public_viewed: { referrer: string };
  showcase_integration_wired: { integration: "stripe_founder" | "ga4" | "github" | "blockchain" };

  // ── Pitch Video ──────────────────────────────────────────────────────────
  pitch_video_generated: { startup_id: string };

  // ── Money Finder (/funding, G11 T0242) ───────────────────────────────────
  //   preview     — free preview rendered after the 3-question intake
  //   paywall_hit — the A$3 / 3-credit / plan-included card was shown
  //   report_paid — a full report was unlocked (guest Stripe, credits or plan)
  funding_preview: { state: string; stage: string; grant_count: number; program_count: number };
  funding_paywall_hit: { state: string; stage: string; rail: "guest" | "credits" | "plan" | "anonymous" };
  funding_report_paid: { paid_via: "one_off" | "credits" | "plan"; report_id: string };
  //   funding_directory_viewed — the free directory list pages (T0249):
  //   `/funding/grants` (kind "grants"), `/funding/programs` (kind
  //   "programs", no capital) and `/funding/programs/[capital]` (kind
  //   "programs", `capital` = display name, e.g. "Sydney" / "Remote").
  funding_directory_viewed: { kind: "grants" | "programs"; capital?: string };
  //   radar_upsell_view / _click — the A$3 → Founder Radar (Starter) card
  //   (T0247). `surface` = where it rendered; `variant` = whether the copy
  //   had a real next deadline ("timeline") or fell back ("generic");
  //   `target` on click = which rung the viewer chose.
  radar_upsell_view: {
    surface: "funding_report" | "funding_paywall";
    viewer: "guest" | "founder" | "evaluator";
    variant: "timeline" | "generic";
    report_id?: string;
    paid_reports?: number;
  };
  radar_upsell_click: {
    surface: "funding_report" | "funding_paywall";
    viewer: "guest" | "founder" | "evaluator";
    target: "founder_starter" | "investor_angel";
    report_id?: string;
  };

  // ── Wave 25C — TBR onboarding tour ───────────────────────────────────────
  tbr_onboard_step_clicked: { step: number };

  // ── G14-S33 — money events emitted SERVER-side (lib/analytics/server.ts
  //   emitEvent, GA4 Measurement Protocol) so the weekly GA4 audit sees the
  //   revenue funnel even when no browser tag fired. Typed here so the audit
  //   list (GA4_AUDIT_EVENTS) and the param-name limits are checked once.
  //   trust_report_purchased  — Stripe webhook: report_order checkout paid (A$5 TBR)
  //   evaluator_trial_started — register-with-card on an evaluator plan (Scout/Firm/Program)
  //   subscription_created    — Stripe webhook customer.subscription.created
  //   tbr_share_created       — POST /api/svi/report/share minted a /tbr/<token> link
  trust_report_purchased: { sku: string; gross_aud_cents: number; reconciled: boolean };
  evaluator_trial_started: { plan: string; trial_days: number; account_type: string };
  subscription_created: { plan: string; plan_label?: string; status: string; trialing: boolean; interval: string };
  tbr_share_created: { project_scope: "default" | "project" };

  // ── G19-S45 — Trusted Business Report engagement + clarity (D6) ──────────
  //   tbr_section_view      — a ReportV2 section scrolled into view (one per
  //                           section per page view; IntersectionObserver in
  //                           business-report-client.tsx). `section` = the
  //                           tbr-* section id, `surface` = founder | share.
  //   tbr_export            — PDF / DOCX link clicked (`format`), any surface.
  //   tbr_clarity_answered  — the one-question clarity survey (0–10) answered;
  //                           server twin emitted by POST /api/nps for the
  //                           `tbr_clarity:<snapshotId>` context.
  tbr_section_view: { section: string; surface: "founder" | "share" | "order_page" | "demo"; tier?: string };
  tbr_export: { format: "pdf" | "docx"; surface: string };
  tbr_clarity_answered: { score: number; surface: "founder" | "share"; has_comment: boolean; snapshot_id?: string };

  // ── G25-C free allowance (server-emitted; typed here so the GA4 audit + limits tests cover both maps) ──
  //   free_report_submitted — a free business report reserved for an address (1 | 2 of 2)
  //   free_report_delivered — its PDF e-mail accepted by the provider
  free_report_submitted: { grant_id: string; sequence_no: 1 | 2; source: "guest" | "account"; queued: boolean; analysis_id?: string };
  free_report_delivered: { grant_id: string; sequence_no: 1 | 2; source: "guest" | "account"; analysis_id?: string };

  // ── Global error boundary + 404 ──────────────────────────────────────────
  //   Fired by src/app/error.tsx when the App Router error boundary catches
  //   an uncaught render/data error. `message` is truncated to 200 chars to
  //   keep the GA4 payload well under the 100-byte param-value limit ceiling
  //   for the fields that matter for triage.
  error_boundary_hit: { message: string; digest?: string };
}

// ─── Type-safe tracker ──────────────────────────────────────────────────────

type EventName = keyof AnalyticsEventMap;

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: Record<string, any>[];
  }
}

/**
 * Call `window.gtag` when gtag.js has defined it, otherwise queue the command
 * the way the official snippet does (`dataLayer.push(arguments)`) so gtag.js
 * replays it once it loads. Events fired on mount (`hero_variant_shown`,
 * `funding_directory_viewed`, `compare_viewed` …) run before the
 * `afterInteractive` gtag <Script> has executed; with a bare `window.gtag?.()`
 * they were silently dropped — S23-B's first event audit saw only GA4's
 * automatic events for the whole week. gtag.js only treats a real
 * `arguments` object as a command, hence the classic `function`.
 */
function gtagOrQueue(...args: any[]): void {
  if (typeof window.gtag === "function") {
    window.gtag(...args);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  const queue = window.dataLayer;
  // The rest parameter only satisfies the spread call's typing; the body
  // pushes the real `arguments` object because that is the only shape
  // gtag.js replays as a command (a plain array is ignored).
  (function (..._cmd: any[]) {
    void _cmd;
    // eslint-disable-next-line prefer-rest-params -- see above
    queue.push(arguments as unknown as Record<string, any>);
  })(...args);
}

/**
 * Fire a GA4 event and push to dataLayer (for GTM).
 *
 * Safe to call server-side (no-ops) or when GA is not loaded (queued).
 */
export function trackEvent<E extends EventName>(
  event: E,
  params: AnalyticsEventMap[E],
): void {
  if (typeof window === "undefined") return;

  // GA4 gtag (or the gtag.js replay queue when the script has not run yet)
  gtagOrQueue("event", event, params);

  // GTM dataLayer
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

/**
 * Set GA4 user properties (e.g. after login).
 */
export function setUserProperties(props: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  gtagOrQueue("set", "user_properties", props);
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "user_properties_set", ...props });
}

/**
 * Send a manual GA4 page_view hit (for SPA route changes).
 * Safe to call server-side — no-ops silently.
 */
export function trackPageView(url: string): void {
  if (typeof window === "undefined") return;
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
  gtagOrQueue("config", measurementId, { page_path: url });
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "page_view", page_path: url });
}

/**
 * Track an ecommerce purchase (GA4 recommended event).
 */
export function trackPurchase(params: {
  transaction_id: string;
  value: number;
  currency: string;
  plan: string;
}): void {
  if (typeof window === "undefined") return;
  gtagOrQueue("event", "purchase", {
    transaction_id: params.transaction_id,
    value: params.value,
    currency: params.currency,
    items: [{ item_name: params.plan, price: params.value, quantity: 1 }],
  });
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "purchase", ...params });
}
