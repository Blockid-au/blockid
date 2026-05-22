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
  svi_submitted: { method: "text" | "file"; has_file: boolean };
  svi_analysis_complete: { svi_score: number; slug: string };
  svi_result_reset: Record<string, never>;
  svi_paywall_shown: Record<string, never>;
  svi_paywall_checkout_click: Record<string, never>;
  svi_paywall_analysis_click: { price: number };
  svi_paywall_credit_pack_click: { pack: string; credits: number };
  svi_paywall_coupon_submit: { code: string };
  svi_credit_gate_shown: { balance: number; cost: number };
  svi_paywall_founding50_click: Record<string, never>;
  svi_section_picker_opened: Record<string, never>;
  svi_modular_submitted: { sectionCount: number };
  svi_modular_complete: { sectionCount: number; totalCredits: number };

  // ── Score Form ──
  score_form_started: Record<string, never>;
  score_form_step: { step: number; step_name: string };
  score_form_submitted: { company_name: string };
  score_result_viewed: { total_score: number };

  // ── Auth ──
  login_page_viewed: Record<string, never>;
  login_google_clicked: Record<string, never>;
  login_google_success: Record<string, never>;
  login_email_requested: Record<string, never>;
  login_email_verified: Record<string, never>;
  partner_code_applied: { valid: boolean };

  // ── Pricing & Checkout ──
  pricing_viewed: Record<string, never>;
  plan_cta_clicked: { plan: string; label: string };
  checkout_started: { plan: string };
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

  // ── Navigation ──
  cta_clicked: { cta_id: string; location: string };
  nav_tool_selected: { tool: string };
  mobile_menu_opened: Record<string, never>;
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
 * Fire a GA4 event and push to dataLayer (for GTM).
 *
 * Safe to call server-side (no-ops) or when GA is not loaded.
 */
export function trackEvent<E extends EventName>(
  event: E,
  params: AnalyticsEventMap[E],
): void {
  if (typeof window === "undefined") return;

  // GA4 gtag
  window.gtag?.("event", event, params);

  // GTM dataLayer
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

/**
 * Set GA4 user properties (e.g. after login).
 */
export function setUserProperties(props: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  window.gtag?.("set", "user_properties", props);
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "user_properties_set", ...props });
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
  window.gtag?.("event", "purchase", {
    transaction_id: params.transaction_id,
    value: params.value,
    currency: params.currency,
    items: [{ item_name: params.plan, price: params.value, quantity: 1 }],
  });
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "purchase", ...params });
}
