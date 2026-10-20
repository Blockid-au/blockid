// Test-only seed for the verified-review suites (detail / mark-reviewed).
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { verifiedSlaDueAt } from "@/lib/time/au-business-days";
import { sydneyInstant } from "./sla";

export const ORDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
export const ORDER_OVERDUE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
export const ORDER_REFUNDED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
export const ORDER_READY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
export const ORDER_FULL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
export const PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
export const OTHER_PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
export const BUYER = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
export const ADMIN = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";
export const HUB_TRE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
export const HUB_LCO = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
export const HUB_OTHER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
export const CLAIM = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
export const REPORT = "rep-verified-1";

/** Thu 22 Oct 2026, 14:00 Sydney. */
export const NOW = sydneyInstant("2026-10-22", 14);

export function seedTables(): Record<string, Record<string, unknown>[]> {
  const report = demoReportV2();
  const order = (id: string, extra: Record<string, unknown>) => ({
    id,
    user_id: BUYER,
    business_id: PROJECT,
    product_sku: "report_verified",
    tier: "verified",
    status: "IN_REVIEW",
    report_id: REPORT,
    paid_at: sydneyInstant("2026-10-20", 11).toISOString(),
    created_at: sydneyInstant("2026-10-20", 11).toISOString(),
    sla_due_at: verifiedSlaDueAt(sydneyInstant("2026-10-20", 11)).toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    delivered_at: null,
    ...extra,
  });
  return {
    report_orders: [
      order(ORDER, {}),
      order(ORDER_OVERDUE, { paid_at: sydneyInstant("2026-10-15", 11).toISOString(), sla_due_at: verifiedSlaDueAt(sydneyInstant("2026-10-15", 11)).toISOString(), report_id: "rep-2" }),
      order(ORDER_REFUNDED, { status: "REFUNDED", report_id: "rep-3" }),
      order(ORDER_READY, { status: "READY", report_id: "rep-4" }),
      order(ORDER_FULL, { product_sku: "report_full", tier: "full", report_id: "rep-5" }),
    ],
    projects: [
      { id: PROJECT, name: "Acme Robotics", verification_level: 2, abn: "51824753556" },
      { id: OTHER_PROJECT, name: "Other Co", verification_level: 1 },
    ],
    app_users: [
      { id: BUYER, email: "buyer@example.test", display_name: "Jamie Buyer" },
      { id: ADMIN, email: "admin@blockid.au", display_name: "Long Do", role: "admin" },
    ],
    assembled_reports: [{ id: REPORT, report_json: report, payg_tier: null, reviewed: false, reviewed_at: null, reviewed_by: null }],
    svi_dimension_evidence: [
      { id: HUB_TRE, project_id: PROJECT, dimension: "tre", evidence_type: "stripe_mrr", evidence_label: "Stripe MRR export", evidence_value_or_url: "https://dashboard.stripe.com/x", confidence_level: "document_uploaded", is_verified: false, review_status: "none", created_at: "2026-10-01T00:00:00Z" },
      { id: HUB_LCO, project_id: PROJECT, dimension: "lco", evidence_type: "ip_assignment", evidence_label: "IP assignment", evidence_value_or_url: "signed 2025", confidence_level: "document_uploaded", is_verified: false, review_status: "pending", created_at: "2026-10-02T00:00:00Z" },
      { id: HUB_OTHER, project_id: OTHER_PROJECT, dimension: "tre", evidence_type: "x", evidence_label: "Not this startup", confidence_level: "document_uploaded", review_status: "pending", created_at: "2026-10-03T00:00:00Z" },
    ],
    claims: [{ id: CLAIM, project_id: PROJECT, svi_dimension: "tre", claim_key: "mrr", statement: "MRR is A$12k", founder_claimed_value: 12000, extracted_value: null, assessment_status: "claimed", created_at: "2026-10-01T00:00:00Z" }],
    svi_snapshots: [{ id: "snap-1", project_id: PROJECT, analysis_json: { subs: [{ key: "tre", breakdown: [{ source: "self_declared" }], assessed: true }] }, evidence_confidence: 20, created_at: "2026-10-20T00:00:00Z" }],
    report_reviews: [],
    report_review_claims: [],
    founder_notifications: [],
  };
}
