import { describe, expect, it } from "vitest";

import {
  bucketByStatus,
  summariseRequest,
  type ResellerRequestRow,
} from "./request-summary";

function row(overrides: Partial<ResellerRequestRow>): ResellerRequestRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    request_type: "code_request",
    status: "pending",
    payload: {},
    decision_at: null,
    decision_reason: null,
    created_at: "2026-07-22T10:00:00Z",
    ...overrides,
  };
}

describe("summariseRequest", () => {
  it("formats a code_request with tier + suffix + notes", () => {
    const s = summariseRequest(
      row({
        request_type: "code_request",
        payload: { tier_pct: 30, suggested_suffix: "SUMMER", notes: "Q3 push" },
      }),
    );
    expect(s.title.en).toBe("New code — 30% tier");
    expect(s.title.vi).toBe("Mã mới — bậc 30%");
    expect(s.details).toEqual([
      { en: "Suggested suffix: SUMMER", vi: "Hậu tố đề xuất: SUMMER" },
      { en: "Notes: Q3 push", vi: "Ghi chú: Q3 push" },
    ]);
  });

  it("falls back gracefully when code_request tier is missing/invalid", () => {
    const s = summariseRequest(
      row({ request_type: "code_request", payload: { tier_pct: 99 } }),
    );
    expect(s.title.en).toBe("New code — unknown tier");
    expect(s.title.vi).toBe("Mã mới — bậc không xác định");
    expect(s.details).toEqual([]);
  });

  it("formats an over_budget_approval with masked target + snapshot + reason", () => {
    const s = summariseRequest(
      row({
        request_type: "over_budget_approval",
        payload: {
          requested_amount: 5000,
          target_user_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          remaining_budget_snapshot: 1234,
          reason: "Onboarding boost",
        },
      }),
    );
    expect(s.title.en).toBe("Over-budget grant — 5,000 credits");
    // vi thousands separator differs
    expect(s.title.vi).toBe("Cấp vượt ngân sách — 5.000 tín dụng");
    expect(s.details[0]).toEqual({
      en: "Customer ID: aaaaaaaa…",
      vi: "ID khách hàng: aaaaaaaa…",
    });
    expect(s.details[1]).toEqual({
      en: "Remaining budget at request time: 1,234 credits",
      vi: "Ngân sách còn lại khi gửi: 1.234 tín dụng",
    });
    expect(s.details[2].en).toBe("Reason: Onboarding boost");
    expect(s.details[2].vi).toBe("Lý do: Onboarding boost");
  });

  it("formats a collateral_approval with url + purpose", () => {
    const s = summariseRequest(
      row({
        request_type: "collateral_approval",
        payload: {
          collateral_url: "https://cdn.example.com/one-pager.pdf",
          purpose: "Trade show handout",
        },
      }),
    );
    expect(s.title.en).toBe("Marketing collateral review");
    expect(s.title.vi).toBe("Duyệt tài liệu tiếp thị");
    expect(s.details[0].en).toBe("URL: https://cdn.example.com/one-pager.pdf");
    expect(s.details[1].vi).toBe("Mục đích: Trade show handout");
  });

  it("carries decision_reason + decision_at through to the summary", () => {
    const s = summariseRequest(
      row({
        status: "denied",
        decision_reason: "Insufficient justification.",
        decision_at: "2026-07-22T12:00:00Z",
      }),
    );
    expect(s.decision_reason).toBe("Insufficient justification.");
    expect(s.decision_at).toBe("2026-07-22T12:00:00Z");
    expect(s.status).toBe("denied");
  });

  it("falls back for an unknown request_type without throwing", () => {
    const s = summariseRequest(
      row({
        // Simulate a future request_type not yet mapped in the switch.
        request_type: "future_kind" as unknown as ResellerRequestRow["request_type"],
        payload: {},
      }),
    );
    expect(s.title.en).toContain("Request");
    expect(s.title.vi).toContain("Yêu cầu");
    expect(s.details).toEqual([]);
  });
});

describe("bucketByStatus", () => {
  it("groups summaries into pending/approved/denied/cancelled preserving order", () => {
    const rows: ResellerRequestRow[] = [
      row({ id: "a", status: "pending" }),
      row({ id: "b", status: "approved" }),
      row({ id: "c", status: "denied", decision_reason: "no" }),
      row({ id: "d", status: "cancelled" }),
      row({ id: "e", status: "pending" }),
    ];
    const buckets = bucketByStatus(rows.map(summariseRequest));
    expect(buckets.pending.map((s) => s.id)).toEqual(["a", "e"]);
    expect(buckets.approved.map((s) => s.id)).toEqual(["b"]);
    expect(buckets.denied.map((s) => s.id)).toEqual(["c"]);
    expect(buckets.cancelled.map((s) => s.id)).toEqual(["d"]);
  });

  it("returns empty buckets for an empty input", () => {
    const buckets = bucketByStatus([]);
    expect(buckets.pending).toEqual([]);
    expect(buckets.approved).toEqual([]);
    expect(buckets.denied).toEqual([]);
    expect(buckets.cancelled).toEqual([]);
  });
});
