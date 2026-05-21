// BlockID i18n translations dictionary
// Used by workspace components and email templates.

export const t = {
  en: {
    // Navigation & workspace
    dashboard: "Dashboard",
    evidenceVault: "Evidence Vault",
    dataRoom: "Data Room",
    capTable: "Cap Table",
    weeklyReports: "Weekly Reports",
    roadmap: "Growth Roadmap",
    billing: "Billing",
    profile: "My Profile",
    addEvidence: "Add Evidence",
    getScore: "Get My SVI",
    viewReport: "View Full Report",
    downloadPdf: "Download PDF",
    signIn: "Sign in",
    signOut: "Sign out",
    settings: "Settings",

    // SVI dimensions
    founderTeam: "Founder & Team",
    marketProblem: "Market & Problem",
    productTech: "Product & Technical",
    tractionRevenue: "Traction & Revenue",
    capTableGov: "Cap Table & Governance",
    investorReady: "Investor Readiness",
    legalCompliance: "Legal & Compliance",
    visionMoat: "Strategic Vision & Moat",

    // Report sections
    executiveSummary: "Executive Summary",
    scoreExplained: "Your Score Explained",
    strengths: "Strengths",
    areasToImprove: "Areas to Improve",
    actionPlan: "Action Plan",
    nextSteps: "Next Steps",
    riskAssessment: "Risk Assessment",
    evidenceGaps: "Evidence Gaps",
    doingRight: "What You're Doing Right",
    biggestOpportunity: "Your Biggest Opportunity Right Now",
    growthPlan: "Your 30-Day Growth Plan",
    understandingDimensions: "Understanding Your Dimensions",
    investorReadinessCheck: "Investor Readiness Check",
    yourNextStep: "Your Next Step",

    // Email common
    viewFullReport: "View Full Report",
    signInDashboard: "Sign in to Dashboard",
    viewDashboard: "View your dashboard",
    uploadEvidence: "Upload Evidence",
    unsubscribe: "Unsubscribe",
    manageEmailPrefs: "Manage email preferences",

    // Weekly report
    weeklyInsight: "Weekly Insight",
    topActionsNextWeek: "Top Actions for Next Week",
    thisWeek: "this week",
    noChange: "No change",

    // SVI stages
    concept: "Concept",
    validatedIdea: "Validated Idea",
    mvp: "MVP",
    earlyTraction: "Early Traction",
    revenue: "Revenue",
    growth: "Growth",
    scale: "Scale",
    corporation: "Corporation",

    // Common actions
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    share: "Share",
    copy: "Copy",
    search: "Search",
    filter: "Filter",
    sortBy: "Sort by",
    loading: "Loading...",
    noData: "No data available",
  },
  vi: {
    // Navigation & workspace
    dashboard: "Bang Dieu Khien",
    evidenceVault: "Kho Bang Chung",
    dataRoom: "Phong Du Lieu",
    capTable: "Bang Von",
    weeklyReports: "Bao Cao Tuan",
    roadmap: "Lo Trinh Phat Trien",
    billing: "Thanh Toan",
    profile: "Ho So",
    addEvidence: "Them Bang Chung",
    getScore: "Lay Diem SVI",
    viewReport: "Xem Bao Cao Day Du",
    downloadPdf: "Tai PDF",
    signIn: "Dang nhap",
    signOut: "Dang xuat",
    settings: "Cai dat",

    // SVI dimensions
    founderTeam: "Nha Sang Lap & Doi Ngu",
    marketProblem: "Thi Truong & Van De",
    productTech: "San Pham & Ky Thuat",
    tractionRevenue: "Tang Truong & Doanh Thu",
    capTableGov: "Bang Von & Quan Tri",
    investorReady: "San Sang Goi Von",
    legalCompliance: "Phap Ly & Tuan Thu",
    visionMoat: "Tam Nhin & Loi The",

    // Report sections
    executiveSummary: "Tom Tat Dieu Hanh",
    scoreExplained: "Giai Thich Diem So",
    strengths: "Diem Manh",
    areasToImprove: "Can Cai Thien",
    actionPlan: "Ke Hoach Hanh Dong",
    nextSteps: "Buoc Tiep Theo",
    riskAssessment: "Danh Gia Rui Ro",
    evidenceGaps: "Thieu Bang Chung",
    doingRight: "Nhung Dieu Ban Dang Lam Dung",
    biggestOpportunity: "Co Hoi Lon Nhat Cua Ban Ngay Bay Gio",
    growthPlan: "Ke Hoach Phat Trien 30 Ngay",
    understandingDimensions: "Hieu Cac Chieu Danh Gia",
    investorReadinessCheck: "Kiem Tra San Sang Goi Von",
    yourNextStep: "Buoc Tiep Theo Cua Ban",

    // Email common
    viewFullReport: "Xem Bao Cao Day Du",
    signInDashboard: "Dang Nhap Bang Dieu Khien",
    viewDashboard: "Xem bang dieu khien",
    uploadEvidence: "Tai Len Bang Chung",
    unsubscribe: "Huy dang ky",
    manageEmailPrefs: "Quan ly tuy chon email",

    // Weekly report
    weeklyInsight: "Nhan Dinh Tuan",
    topActionsNextWeek: "Hanh Dong Uu Tien Tuan Toi",
    thisWeek: "tuan nay",
    noChange: "Khong doi",

    // SVI stages
    concept: "Y Tuong",
    validatedIdea: "Y Tuong Da Xac Nhan",
    mvp: "MVP",
    earlyTraction: "Tang Truong Som",
    revenue: "Doanh Thu",
    growth: "Tang Truong",
    scale: "Mo Rong",
    corporation: "Doanh Nghiep",

    // Common actions
    save: "Luu",
    cancel: "Huy",
    delete: "Xoa",
    edit: "Sua",
    share: "Chia se",
    copy: "Sao chep",
    search: "Tim kiem",
    filter: "Loc",
    sortBy: "Sap xep theo",
    loading: "Dang tai...",
    noData: "Khong co du lieu",
  },
} as const;

export type Locale = "en" | "vi";
export type TranslationKey = keyof typeof t.en;

/**
 * Get a translated string by key and locale.
 * Falls back to English if the key is not found in the given locale.
 */
export function tx(key: TranslationKey, locale: Locale): string {
  return t[locale]?.[key] ?? t.en[key] ?? key;
}
