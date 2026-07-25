// P7-ga4-plan-panel — pure helpers for the Chapter 7 GA4 measurement plan
// panel. Ships the canonical 9-event catalogue derived from the
// au-ga4-measurement-plan.md template (sections 3.1–3.5), a progress
// calculator, and a stable copy pack. No I/O, no imports besides types
// so the vitest suite can pin the event list + progress branches without
// mocking React.

export type Ga4EventStage =
  | "acquisition"
  | "activation"
  | "retention"
  | "revenue"
  | "referral";

export interface Ga4CanonicalEvent {
  id: string;
  name: string;
  stage: Ga4EventStage;
  decision: { en: string; vi: string };
}

// Sourced verbatim from web/content/templates/legal/au-ga4-measurement-plan.md
// §3.1–3.5. Kept in template order so the checklist reads chronologically
// through a founder's funnel (acquisition → activation → retention →
// revenue → referral).
export const GA4_CANONICAL_EVENTS: readonly Ga4CanonicalEvent[] = [
  {
    id: "page_view",
    name: "page_view",
    stage: "acquisition",
    decision: {
      en: "Channel attribution",
      vi: "Phân bổ theo kênh",
    },
  },
  {
    id: "sign_up_initiated",
    name: "sign_up_initiated",
    stage: "acquisition",
    decision: {
      en: "Funnel diagnostic — where signups drop",
      vi: "Chẩn đoán funnel — nơi người dùng bỏ đăng ký",
    },
  },
  {
    id: "sign_up_completed",
    name: "sign_up_completed",
    stage: "acquisition",
    decision: {
      en: "CAC by channel",
      vi: "CAC theo kênh",
    },
  },
  {
    id: "activation_completed",
    name: "{{activation_event_name}}",
    stage: "activation",
    decision: {
      en: "Activation rate + cohort",
      vi: "Tỷ lệ kích hoạt + cohort",
    },
  },
  {
    id: "aha_moment",
    name: "{{aha_event_name}}",
    stage: "activation",
    decision: {
      en: "Product / market fit signal",
      vi: "Tín hiệu Product / Market Fit",
    },
  },
  {
    id: "feature_used",
    name: "feature_used",
    stage: "retention",
    decision: {
      en: "Feature stickiness + retention driver",
      vi: "Độ bám tính năng + động lực giữ chân",
    },
  },
  {
    id: "purchase",
    name: "purchase",
    stage: "revenue",
    decision: {
      en: "Revenue by channel + campaign (GST-exclusive value)",
      vi: "Doanh thu theo kênh + chiến dịch (giá trị chưa GST)",
    },
  },
  {
    id: "subscription_started",
    name: "subscription_started",
    stage: "revenue",
    decision: {
      en: "MRR growth",
      vi: "Tăng trưởng MRR",
    },
  },
  {
    id: "referral_signup_completed",
    name: "referral_signup_completed",
    stage: "referral",
    decision: {
      en: "K-factor + LTV / CAC lift",
      vi: "K-factor + lực đẩy LTV / CAC",
    },
  },
] as const;

export const GA4_TEMPLATE_SLUG = "au-ga4-measurement-plan";
export const GA4_TEMPLATE_ROUTE = `/legal-templates/${GA4_TEMPLATE_SLUG}` as const;

export const GA4_STAGE_LABEL: Record<
  Ga4EventStage,
  { en: string; vi: string }
> = {
  acquisition: { en: "Acquisition", vi: "Thu hút" },
  activation: { en: "Activation", vi: "Kích hoạt" },
  retention: { en: "Retention", vi: "Giữ chân" },
  revenue: { en: "Revenue", vi: "Doanh thu" },
  referral: { en: "Referral", vi: "Giới thiệu" },
};

export interface Ga4ProgressResult {
  wired: number;
  total: number;
  pct: number;
  band: "not-started" | "in-progress" | "investor-ready";
  by_stage: Record<Ga4EventStage, { wired: number; total: number }>;
}

// Wired = the founder ticked the checkbox for that event. Bands mirror
// the InvestorReadinessTile posture: ≥ 75% investor-ready, > 0 in-progress,
// else not-started. Non-boolean / unknown keys are ignored silently so a
// stale localStorage snapshot cannot skew the count.
export function computeGa4PlanProgress(
  checked: Readonly<Record<string, unknown>>,
  events: readonly Ga4CanonicalEvent[] = GA4_CANONICAL_EVENTS,
): Ga4ProgressResult {
  const by_stage: Record<Ga4EventStage, { wired: number; total: number }> = {
    acquisition: { wired: 0, total: 0 },
    activation: { wired: 0, total: 0 },
    retention: { wired: 0, total: 0 },
    revenue: { wired: 0, total: 0 },
    referral: { wired: 0, total: 0 },
  };
  let wired = 0;
  for (const ev of events) {
    by_stage[ev.stage].total += 1;
    if (checked[ev.id] === true) {
      wired += 1;
      by_stage[ev.stage].wired += 1;
    }
  }
  const total = events.length;
  const pct = total === 0 ? 0 : Math.round((wired / total) * 100);
  const band: Ga4ProgressResult["band"] =
    pct >= 75 ? "investor-ready" : wired > 0 ? "in-progress" : "not-started";
  return { wired, total, pct, band, by_stage };
}

export type Ga4CheckedState = Record<string, boolean>;

export function makeEmptyGa4CheckedState(
  events: readonly Ga4CanonicalEvent[] = GA4_CANONICAL_EVENTS,
): Ga4CheckedState {
  const out: Ga4CheckedState = {};
  for (const ev of events) out[ev.id] = false;
  return out;
}

export const GA4_PLAN_DISCLAIMER = {
  en: "General information only, not legal or privacy advice. Confirm your consent flow with a Privacy Act 1988 (Cth) APP-competent adviser before publishing.",
  vi: "Chỉ mang tính thông tin chung, không phải tư vấn pháp lý hoặc quyền riêng tư. Xác nhận flow đồng ý với chuyên gia am hiểu APP theo Privacy Act 1988 (Cth) trước khi phát hành.",
} as const;
