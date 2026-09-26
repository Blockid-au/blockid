// G34 DC10 — the one purpose line shown at every user-data capture point
// (/analyze intake + guest e-mail panel, signup, onboarding wizard, evidence
// upload), EN + VI, plus the autosave status labels the onboarding wizard
// surfaces.
//
// The second sentence is the first sentence of the founder-approved data
// principle verbatim ("Your data belongs to your startup." — memory
// feedback_data_principle; catalogue key `solutions.principle.data`), so a
// capture point never paraphrases the approved wording. No training claim
// either way. Kept as a tiny TS table rather than catalogue keys so client
// components do not pull the whole i18n JSON into their bundle; the
// colocated test pins the VI twin against the catalogue.

export type DataPurposeLocale = "en" | "vi";

/** `analysis` — business / evidence capture; `account` — sign-up and evaluator set-up. */
export type DataPurposeContext = "analysis" | "account";

/**
 * Autosave state of a multi-step form that already persists a draft.
 * `saved-local` = the browser copy was written but the server copy was not.
 */
export type SaveState = "saving" | "saved" | "saved-local" | "unsaved";

export interface DataPurposeCopy {
  analysis: string;
  account: string;
  privacyLink: string;
  privacyHref: string;
  save: Record<SaveState, string>;
}

export const DATA_PURPOSE_COPY: Readonly<Record<DataPurposeLocale, DataPurposeCopy>> = {
  en: {
    analysis: "Used only to analyse this business and prepare your report. Your data belongs to your startup.",
    account: "Used only to run your account and prepare your reports. Your data belongs to your startup.",
    privacyLink: "Privacy policy",
    privacyHref: "/legal/privacy",
    save: {
      saving: "Saving progress…",
      saved: "Progress saved",
      "saved-local": "Progress saved on this device",
      unsaved: "Progress not saved — check your connection",
    },
  },
  vi: {
    analysis: "Chỉ dùng để phân tích doanh nghiệp này và chuẩn bị báo cáo của bạn. Dữ liệu của bạn thuộc về startup của bạn.",
    account: "Chỉ dùng để vận hành tài khoản và chuẩn bị báo cáo của bạn. Dữ liệu của bạn thuộc về startup của bạn.",
    privacyLink: "Chính sách quyền riêng tư",
    // The policy is English; its Vietnamese twin of the AI-analysis clause
    // (2E) is the part written for Vietnamese readers.
    privacyHref: "/legal/privacy#automated-decisions-vi",
    save: {
      saving: "Đang lưu tiến độ…",
      saved: "Đã lưu tiến độ",
      "saved-local": "Đã lưu tiến độ trên thiết bị này",
      unsaved: "Chưa lưu được tiến độ — hãy kiểm tra kết nối",
    },
  },
};

export function dataPurposeCopy(locale: string | null | undefined): DataPurposeCopy {
  return locale === "vi" ? DATA_PURPOSE_COPY.vi : DATA_PURPOSE_COPY.en;
}
