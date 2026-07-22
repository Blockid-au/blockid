// Pure formatter for reseller_requests rows shown at /reseller/requests.
//
// Renders each row into a locale-neutral shape (title EN+VI, subtitle EN+VI,
// details lines EN+VI). The reseller-facing page (P9.3 next_action item 24b)
// consumes this to present the reseller their filed requests bucketed by
// status, including the admin decision_reason on denials so they know WHY.
//
// Kept dependency-free (no DB, no React) so the branching can be unit-tested.
// Currency + numbers formatted via the caller's Intl locale to match the
// Grant modal precedent (tick 62).

import type { ResellerRequestStatus, ResellerRequestType } from "./requests";

export interface ResellerRequestRow {
  id: string;
  request_type: ResellerRequestType;
  status: ResellerRequestStatus;
  payload: Record<string, unknown> | null;
  decision_at: string | null;
  decision_reason: string | null;
  created_at: string;
}

export interface LocalisedLine {
  en: string;
  vi: string;
}

export interface RequestSummary {
  id: string;
  status: ResellerRequestStatus;
  request_type: ResellerRequestType;
  title: LocalisedLine;
  subtitle: LocalisedLine;
  details: LocalisedLine[];
  decision_reason: string | null;
  decision_at: string | null;
  created_at: string;
}

const TIER_ALLOWED = new Set([0, 10, 20, 30, 40]);

function readTier(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const raw = payload.tier_pct;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return TIER_ALLOWED.has(n) ? n : null;
}

function readString(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!payload) return null;
  const v = payload[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function readNumber(
  payload: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!payload) return null;
  const raw = payload[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function fmtNumber(n: number): { en: string; vi: string } {
  return {
    en: new Intl.NumberFormat("en-AU").format(n),
    vi: new Intl.NumberFormat("vi-VN").format(n),
  };
}

function fmtUuidPrefix(id: string): string {
  return id.replace(/[^a-f0-9]/gi, "").slice(0, 8) || id.slice(0, 8);
}

function summariseCodeRequest(row: ResellerRequestRow): RequestSummary {
  const tier = readTier(row.payload);
  const suffix = readString(row.payload, "suggested_suffix");
  const notes = readString(row.payload, "notes");

  const tierLabelEn = tier == null ? "unknown tier" : `${tier}% tier`;
  const tierLabelVi = tier == null ? "bậc không xác định" : `bậc ${tier}%`;

  const details: LocalisedLine[] = [];
  if (suffix) {
    details.push({
      en: `Suggested suffix: ${suffix}`,
      vi: `Hậu tố đề xuất: ${suffix}`,
    });
  }
  if (notes) {
    details.push({
      en: `Notes: ${notes}`,
      vi: `Ghi chú: ${notes}`,
    });
  }

  return {
    id: row.id,
    status: row.status,
    request_type: row.request_type,
    title: {
      en: `New code — ${tierLabelEn}`,
      vi: `Mã mới — ${tierLabelVi}`,
    },
    subtitle: {
      en: "Requires BlockID admin to mint a Stripe promotion code.",
      vi: "Cần quản trị viên BlockID tạo mã khuyến mãi Stripe.",
    },
    details,
    decision_reason: row.decision_reason,
    decision_at: row.decision_at,
    created_at: row.created_at,
  };
}

function summariseOverBudgetApproval(row: ResellerRequestRow): RequestSummary {
  const amount = readNumber(row.payload, "requested_amount") ?? 0;
  const remainingSnapshot = readNumber(row.payload, "remaining_budget_snapshot");
  const targetUserId = readString(row.payload, "target_user_id");
  const reason = readString(row.payload, "reason");
  const amountFmt = fmtNumber(amount);

  const details: LocalisedLine[] = [];
  if (targetUserId) {
    const prefix = fmtUuidPrefix(targetUserId);
    details.push({
      en: `Customer ID: ${prefix}…`,
      vi: `ID khách hàng: ${prefix}…`,
    });
  }
  if (remainingSnapshot != null) {
    const snapshotFmt = fmtNumber(remainingSnapshot);
    details.push({
      en: `Remaining budget at request time: ${snapshotFmt.en} credits`,
      vi: `Ngân sách còn lại khi gửi: ${snapshotFmt.vi} tín dụng`,
    });
  }
  if (reason) {
    details.push({
      en: `Reason: ${reason}`,
      vi: `Lý do: ${reason}`,
    });
  }

  return {
    id: row.id,
    status: row.status,
    request_type: row.request_type,
    title: {
      en: `Over-budget grant — ${amountFmt.en} credits`,
      vi: `Cấp vượt ngân sách — ${amountFmt.vi} tín dụng`,
    },
    subtitle: {
      en: "Requires BlockID admin approval per H.4 / D3-CISO-05.",
      vi: "Cần quản trị viên BlockID phê duyệt theo H.4 / D3-CISO-05.",
    },
    details,
    decision_reason: row.decision_reason,
    decision_at: row.decision_at,
    created_at: row.created_at,
  };
}

function summariseCollateralApproval(row: ResellerRequestRow): RequestSummary {
  const url = readString(row.payload, "collateral_url");
  const purpose = readString(row.payload, "purpose");

  const details: LocalisedLine[] = [];
  if (url) {
    details.push({
      en: `URL: ${url}`,
      vi: `URL: ${url}`,
    });
  }
  if (purpose) {
    details.push({
      en: `Purpose: ${purpose}`,
      vi: `Mục đích: ${purpose}`,
    });
  }

  return {
    id: row.id,
    status: row.status,
    request_type: row.request_type,
    title: {
      en: "Marketing collateral review",
      vi: "Duyệt tài liệu tiếp thị",
    },
    subtitle: {
      en: "Requires BlockID admin sign-off before external distribution.",
      vi: "Cần quản trị viên BlockID duyệt trước khi phát hành ra bên ngoài.",
    },
    details,
    decision_reason: row.decision_reason,
    decision_at: row.decision_at,
    created_at: row.created_at,
  };
}

/**
 * Turn a raw reseller_requests row into a locale-neutral summary. Unknown
 * request_type values fall through to a generic shape so a schema addition
 * doesn't break the surface.
 */
export function summariseRequest(row: ResellerRequestRow): RequestSummary {
  switch (row.request_type) {
    case "code_request":
      return summariseCodeRequest(row);
    case "over_budget_approval":
      return summariseOverBudgetApproval(row);
    case "collateral_approval":
      return summariseCollateralApproval(row);
    default: {
      const fallbackType = String(row.request_type);
      return {
        id: row.id,
        status: row.status,
        request_type: row.request_type,
        title: {
          en: `Request (${fallbackType})`,
          vi: `Yêu cầu (${fallbackType})`,
        },
        subtitle: {
          en: "Pending BlockID admin review.",
          vi: "Đang chờ quản trị viên BlockID duyệt.",
        },
        details: [],
        decision_reason: row.decision_reason,
        decision_at: row.decision_at,
        created_at: row.created_at,
      };
    }
  }
}

export interface RequestBuckets {
  pending: RequestSummary[];
  approved: RequestSummary[];
  denied: RequestSummary[];
  cancelled: RequestSummary[];
}

/**
 * Bucket a summary list by status. Newest-first within each bucket assuming
 * the caller already sorted the rows by created_at DESC.
 */
export function bucketByStatus(summaries: RequestSummary[]): RequestBuckets {
  const buckets: RequestBuckets = {
    pending: [],
    approved: [],
    denied: [],
    cancelled: [],
  };
  for (const s of summaries) {
    buckets[s.status].push(s);
  }
  return buckets;
}
