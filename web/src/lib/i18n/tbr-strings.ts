// Wave 25 Phase B — Trusted Business Report (TBR) bilingual UI strings.
//
// The TBR shell (headings, TOC labels, band names, methodology copy) renders
// in either English or Vietnamese depending on the `locale` prop passed to
// <BusinessReportClient>. AI-generated narrative (verdict / strengths / gaps
// / next_action) is NOT translated — it comes out of the model in whatever
// language it was produced in. Only the surrounding UI chrome is localised.
//
// Dimension + criterion titles pull their Vietnamese labels from
// `evaluation-criteria.ts` (`titleVi`) — not duplicated here.

export type TbrLocale = "en" | "vi";

export interface TbrStrings {
  reportTitle: string;
  brandBadge: string;
  progressXofY: (scored: number, total: number) => string;
  completedInSeconds: (sec: string) => string;
  partialAnalysis: string;

  // Actions
  shareWithInvestor: string;
  sharing: string;
  downloadPdf: string;
  print: string;
  shareUrlLabel: string;
  copy: string;
  copied: string;
  clickShareFirst: string;
  shareFailed: string;
  languageToggleAria: string;
  switchToVi: string;
  switchToEn: string;

  // Bands
  bandStrong: string;
  bandDeveloping: string;
  bandEarly: string;

  // Verdict templates — plain string with {n} placeholders substituted at
  // render time. Keep short and factual; specifics come from the AI copy.
  verdictStrong: (svi: number, above70: number) => string;
  verdictDeveloping: (svi: number, riskCount: number) => string;
  verdictEarly: (svi: number) => string;

  // Section titles
  secExecutive: string;
  secSvi: string;
  secValuation: string;
  secCriteria: string;
  secRisk: string;
  secRoadmap: string;
  secCohort: string;
  secMethodology: string;

  // TOC groupings
  tocOverview: string;
  tocDimensions: string;
  tocAnalysis: string;
  tocContents: string;

  // Table headers
  thDimension: string;
  thWeight: string;
  thScore: string;
  thPriority: string;
  thContribution: string;
  thThisStartup: string;
  thAuSeedMedian: string;
  thAuTopQuartile: string;
  thVsMedian: string;
  rowTotalSvi: string;
  rowCompositeSvi: string;

  // Dim block chips
  chipWeightOfSvi: (w: number) => string;
  chipHighPriority: string;
  chipMediumPriority: string;
  chipLowPriority: string;
  chipAuBenchmark: string;

  // Criteria pane
  criteriaIntro: string;
  criteriaStrengths: string;
  criteriaGaps: string;
  criteriaNextAction: string;
  criteriaMissingTitle: string;
  criteriaMissingBody: string;
  criteriaReanalyse: string;
  chipWeightAndDim: (w: number, dim: string) => string;

  // Risk register
  riskIntro: string;
  riskDrag: (weight: number, drag: number) => string;

  // Roadmap
  roadmapIntro: (count: number) => string;
  roadmapLift: (pts: number) => string;
  roadmapMeta: (score: number, weight: number) => string;
  roadmapAddEvidence: (section: string) => string;

  // Cohort
  cohortIntro: string;
  cohortFootnote: (industry: string, stage: string) => string;

  // Methodology
  methHeaderSvi: string;
  methBodySvi: string;
  methHeaderDims: string;
  methHeaderCriteria: string;
  methBodyCriteria: string;
  methHeaderValuation: string;
  methBodyValuation: string;
  methHeaderAi: string;
  methBodyAi: string;
  methFooter: (dateStr: string) => string;

  // Empty / no data
  noAnalysisTitle: string;
  noAnalysisBody: string;
  noAnalysisCta: string;
  scoresMissingBody: string;
  scoresMissingCta: string;

  // Footer
  footerDisclaimer: string;
  footerReanalyse: string;

  // Executive summary sub-labels
  execHeroPer100: string;
}

const en: TbrStrings = {
  reportTitle: "Trusted Business Report",
  brandBadge: "BlockID SVI™",
  progressXofY: (s, t) => `${s} of ${t} dimensions`,
  completedInSeconds: (sec) => `completed in ${sec}s`,
  partialAnalysis: "partial analysis",

  shareWithInvestor: "Share with Investor",
  sharing: "Sharing…",
  downloadPdf: "Download PDF",
  print: "Print",
  shareUrlLabel: "Share URL:",
  copy: "Copy",
  copied: "Copied!",
  clickShareFirst: "Click ‘Share with Investor’ first to enable PDF download.",
  shareFailed: "Share failed",
  languageToggleAria: "Switch report language",
  switchToVi: "VI",
  switchToEn: "EN",

  bandStrong: "Investor-Ready",
  bandDeveloping: "Developing",
  bandEarly: "Early-Stage",

  verdictStrong: (svi, above70) =>
    `This business scores ${svi}/100 on the BlockID Startup Value Index — placing it in investor-ready territory. The analysis identified ${above70} dimensions above the 70-point threshold with strong evidence.`,
  verdictDeveloping: (svi, riskCount) =>
    `This business scores ${svi}/100 on the BlockID Startup Value Index — developing, with meaningful gaps to close before Series A or significant angel capital. ${riskCount} dimension${riskCount !== 1 ? "s" : ""} flagged as high-priority focus areas.`,
  verdictEarly: (svi) =>
    `This business scores ${svi}/100 on the BlockID Startup Value Index — early-stage, indicating significant evidence gaps that will limit fundraising options at this point. Concrete evidence-building actions are recommended before approaching investors.`,

  secExecutive: "Executive Summary",
  secSvi: "Business SVI — Weighted Score Breakdown",
  secValuation: "Directional Pre-Money Valuation",
  secCriteria: "Full 13-Criteria Analyst Assessment",
  secRisk: "Risk Register",
  secRoadmap: "Improvement Roadmap",
  secCohort: "Cohort Comparison — AU Seed Benchmarks",
  secMethodology: "Methodology & Appendix",

  tocOverview: "Overview",
  tocDimensions: "8 Dimensions",
  tocAnalysis: "Analysis",
  tocContents: "Contents",

  thDimension: "Dimension",
  thWeight: "Weight",
  thScore: "Score",
  thPriority: "Priority",
  thContribution: "Contribution",
  thThisStartup: "This Startup",
  thAuSeedMedian: "AU Seed Median",
  thAuTopQuartile: "AU Top Quartile",
  thVsMedian: "vs Median",
  rowTotalSvi: "Total SVI",
  rowCompositeSvi: "Composite SVI",

  chipWeightOfSvi: (w) => `${w}% of total SVI`,
  chipHighPriority: "high priority",
  chipMediumPriority: "medium priority",
  chipLowPriority: "low priority",
  chipAuBenchmark: "AU Market Benchmark",

  criteriaIntro:
    "Granular assessment across all 13 investor evaluation criteria — derived from the 8 SVI dimension analyses above. Each criterion maps to a primary SVI dimension and contributes to the composite score.",
  criteriaStrengths: "Strengths",
  criteriaGaps: "Gaps",
  criteriaNextAction: "Next Action (This Week)",
  criteriaMissingTitle: "Criteria synthesis not yet available",
  criteriaMissingBody:
    "Re-run the pitchdeck analysis (Wave 24+) to generate the full 13-criteria breakdown. This section requires the latest analysis version.",
  criteriaReanalyse: "Re-analyse now",
  chipWeightAndDim: (w, dim) => `${w}% weight · ${dim.toUpperCase()}`,

  riskIntro:
    "Dimensions that represent the highest investment risk — sorted by impact × gap.",
  riskDrag: (w, drag) => `${w}% weight · estimated ${drag} pts drag on total SVI`,

  roadmapIntro: (n) =>
    `Top ${n} actions ranked by expected SVI lift (weight × gap to 70-point threshold).`,
  roadmapLift: (pts) => `+${pts} pts potential lift`,
  roadmapMeta: (score, weight) =>
    `Current: ${score}/100 · Target: 70+ · ${weight}% weight`,
  roadmapAddEvidence: (section) => `Add evidence for ${section}`,

  cohortIntro:
    "How this startup compares against Australian seed-stage peers by SVI band, based on anonymised BlockID Index data (PitchBook AU 2024–2026 seed cohort).",
  cohortFootnote: (industry, stage) =>
    `Benchmarks sourced from BlockID anonymised cohort data + PitchBook AU 2024–2026 seed-stage analysis. Industry: ${industry} · Stage: ${stage}. This is a directional comparison — individual startup profiles vary significantly.`,

  methHeaderSvi: "BlockID Startup Value Index™ (SVI)",
  methBodySvi:
    "The SVI is a composite 0–100 score computed across 8 weighted dimensions. It is NOT a valuation — it is a readiness index designed to signal investor-readiness and highlight evidence gaps. Scores above 70 indicate investor-ready evidence across most dimensions; 40–69 indicates a developing startup with clear next steps; below 40 indicates early-stage with significant gaps to fill before fundraising.",
  methHeaderDims: "8 SVI Dimensions (total 100% weight)",
  methHeaderCriteria: "13 Investor Evaluation Criteria",
  methBodyCriteria:
    "Each criterion maps to one primary SVI dimension and optionally one or more secondary dimensions. The 13 criteria cover: Idea & Innovation, Market Opportunity, Founder Profile, Code & Git Repository, Website & Digital Presence, Team Composition, Customer Base & Traction, Go-to-Market Strategy, Key Documents, Data Room, Team Structure & Governance, Product Roadmap, and Revenue & Unit Economics.",
  methHeaderValuation: "Valuation Methods",
  methBodyValuation:
    "Pre-money valuation is computed using one of four methods selected automatically based on stage and traction: Berkus Method (pre-revenue, cap A$2.5M), Scorecard Method (angel round median × SVI factor), Comparable Transactions (AU seed/Series A comps from PitchBook 2024–2026), or DCF (10-year free-cash-flow with terminal value). Three cases (worst/average/best) apply a ±20% band. This is a directional estimate, not a formal valuation.",
  methHeaderAi: "AI Analysis",
  methBodyAi:
    "All analysis is generated by the BlockID Analyst Desk — a chain of specialised AI agents (Groq/SambaNova/Cerebras/Claude) grounded in the pitchdeck text supplied by the founder. Each agent must cite deck fragments as evidence and explicitly acknowledge when information is absent. Scores default to 30–45 when the deck is silent on a dimension. This report is AI-assisted and does not constitute a formal due-diligence audit or investment recommendation.",
  methFooter: (dateStr) =>
    `BlockID.au · Startup Value Index™ · Report generated ${dateStr} · For internal founder use and investor sharing only. Not for public distribution without founder consent.`,

  noAnalysisTitle: "No recent analysis found",
  noAnalysisBody:
    "Run a full SVI dimension analysis first — results are available for 30 minutes.",
  noAnalysisCta: "Analyse my pitchdeck",
  scoresMissingBody:
    "Analysis cached but no scores found. Re-run the dimension analysis.",
  scoresMissingCta: "Go to Pitchdeck Analyze →",

  footerDisclaimer:
    "BlockID Startup Value Index™ — AI-assisted analysis. Not a formal valuation or investment advice.",
  footerReanalyse: "Re-analyse →",

  execHeroPer100: "/ 100",
};

const vi: TbrStrings = {
  reportTitle: "Bao cao Kinh doanh Tin cay",
  brandBadge: "BlockID SVI™",
  progressXofY: (s, t) => `${s} tren ${t} khia canh`,
  completedInSeconds: (sec) => `hoan thanh trong ${sec}s`,
  partialAnalysis: "phan tich mot phan",

  shareWithInvestor: "Chia se voi Nha dau tu",
  sharing: "Dang chia se…",
  downloadPdf: "Tai PDF",
  print: "In",
  shareUrlLabel: "Duong dan chia se:",
  copy: "Sao chep",
  copied: "Da sao chep!",
  clickShareFirst: "Nhan ‘Chia se voi Nha dau tu’ truoc de bat tai PDF.",
  shareFailed: "Chia se that bai",
  languageToggleAria: "Chuyen ngon ngu bao cao",
  switchToVi: "VI",
  switchToEn: "EN",

  bandStrong: "San sang cho Nha dau tu",
  bandDeveloping: "Dang phat trien",
  bandEarly: "Giai doan som",

  verdictStrong: (svi, above70) =>
    `Doanh nghiep dat ${svi}/100 tren BlockID Startup Value Index — thuoc nhom san sang goi von. Phan tich xac dinh ${above70} khia canh vuot nguong 70 diem voi bang chung vung chac.`,
  verdictDeveloping: (svi, riskCount) =>
    `Doanh nghiep dat ${svi}/100 tren BlockID Startup Value Index — dang phat trien, con nhieu khoang trong can lap truoc Series A hoac vong angel lon. ${riskCount} khia canh duoc danh dau la uu tien cao.`,
  verdictEarly: (svi) =>
    `Doanh nghiep dat ${svi}/100 tren BlockID Startup Value Index — giai doan som, cho thay thieu bang chung dang ke lam han che kha nang goi von hien tai. Nen thu thap bang chung cu the truoc khi tiep can nha dau tu.`,

  secExecutive: "Tom tat Dieu hanh",
  secSvi: "SVI Doanh nghiep — Diem trong so chi tiet",
  secValuation: "Dinh gia Pre-Money (Dinh huong)",
  secCriteria: "Danh gia day du 13 tieu chi Chuyen gia",
  secRisk: "So Rui ro",
  secRoadmap: "Lo trinh Cai thien",
  secCohort: "So sanh Nhom — Benchmark AU Seed",
  secMethodology: "Phuong phap & Phu luc",

  tocOverview: "Tong quan",
  tocDimensions: "8 Khia canh",
  tocAnalysis: "Phan tich",
  tocContents: "Muc luc",

  thDimension: "Khia canh",
  thWeight: "Trong so",
  thScore: "Diem",
  thPriority: "Uu tien",
  thContribution: "Dong gop",
  thThisStartup: "Startup nay",
  thAuSeedMedian: "AU Seed Trung vi",
  thAuTopQuartile: "AU Nhom dau",
  thVsMedian: "So voi Trung vi",
  rowTotalSvi: "Tong SVI",
  rowCompositeSvi: "SVI Tong hop",

  chipWeightOfSvi: (w) => `${w}% tren tong SVI`,
  chipHighPriority: "uu tien cao",
  chipMediumPriority: "uu tien trung binh",
  chipLowPriority: "uu tien thap",
  chipAuBenchmark: "Benchmark thi truong AU",

  criteriaIntro:
    "Danh gia chi tiet tren 13 tieu chi cua nha dau tu — duoc suy ra tu 8 khia canh SVI o tren. Moi tieu chi anh xa vao mot khia canh SVI chinh va gop vao diem tong hop.",
  criteriaStrengths: "Diem manh",
  criteriaGaps: "Khoang trong",
  criteriaNextAction: "Hanh dong tiep theo (tuan nay)",
  criteriaMissingTitle: "Chua co tong hop tieu chi",
  criteriaMissingBody:
    "Chay lai phan tich pitchdeck (Wave 24+) de sinh day du 13 tieu chi. Muc nay yeu cau phien ban phan tich moi nhat.",
  criteriaReanalyse: "Phan tich lai ngay",
  chipWeightAndDim: (w, dim) => `${w}% trong so · ${dim.toUpperCase()}`,

  riskIntro:
    "Cac khia canh mang rui ro dau tu cao nhat — sap xep theo tac dong x khoang trong.",
  riskDrag: (w, drag) => `${w}% trong so · uoc ${drag} diem keo giam SVI`,

  roadmapIntro: (n) =>
    `Top ${n} hanh dong sap xep theo diem SVI ky vong tang (trong so x khoang cach den nguong 70 diem).`,
  roadmapLift: (pts) => `+${pts} diem tiem nang`,
  roadmapMeta: (score, weight) =>
    `Hien tai: ${score}/100 · Muc tieu: 70+ · ${weight}% trong so`,
  roadmapAddEvidence: (section) => `Bo sung bang chung cho ${section}`,

  cohortIntro:
    "So sanh startup voi nhom seed Uc theo band SVI, dua tren du lieu BlockID Index an danh (PitchBook AU 2024–2026 seed cohort).",
  cohortFootnote: (industry, stage) =>
    `Benchmark tu du lieu BlockID an danh + PitchBook AU 2024–2026 (seed). Nganh: ${industry} · Giai doan: ${stage}. Day la so sanh dinh huong — moi startup co dac diem khac nhau.`,

  methHeaderSvi: "BlockID Startup Value Index™ (SVI)",
  methBodySvi:
    "SVI la diem tong hop 0–100 tren 8 khia canh co trong so. Day KHONG phai la dinh gia — day la chi so san sang, giup phat hien khoang trong bang chung. Diem tren 70 the hien bang chung san sang cho nha dau tu; 40–69 la dang phat trien voi buoc tiep theo ro rang; duoi 40 la giai doan som voi nhieu khoang trong can lap truoc khi goi von.",
  methHeaderDims: "8 khia canh SVI (tong 100% trong so)",
  methHeaderCriteria: "13 tieu chi danh gia cua nha dau tu",
  methBodyCriteria:
    "Moi tieu chi anh xa mot khia canh SVI chinh va tuy chon nhieu khia canh phu. 13 tieu chi bao gom: Y tuong & Doi moi, Co hoi thi truong, Ho so Sang lap, Ma nguon & Git, Website & Hien dien so, Doi ngu, Khach hang & Traction, Chien luoc GTM, Tai lieu, Data Room, Cau truc & Quan tri, Roadmap san pham, Doanh thu & Unit Economics.",
  methHeaderValuation: "Phuong phap Dinh gia",
  methBodyValuation:
    "Dinh gia pre-money duoc tinh bang mot trong bon phuong phap, chon tu dong theo giai doan va traction: Berkus (chua doanh thu, cap A$2.5M), Scorecard (trung vi vong angel × he so SVI), So sanh giao dich (comps AU seed/Series A tu PitchBook 2024–2026), hoac DCF (dong tien tu do 10 nam voi gia tri cuoi ky). Ba kich ban (thap/trung/cao) ap dung dai ±20%. Day la uoc luong dinh huong, khong phai dinh gia chinh thuc.",
  methHeaderAi: "Phan tich AI",
  methBodyAi:
    "Toan bo phan tich duoc sinh boi BlockID Analyst Desk — chuoi AI chuyen biet (Groq/SambaNova/Cerebras/Claude) dua tren van ban pitchdeck cua nha sang lap. Moi agent phai trich dan doan pitchdeck lam bang chung va noi ro khi thong tin thieu. Diem mac dinh 30–45 khi deck khong de cap. Bao cao co AI ho tro, khong phai audit due-diligence chinh thuc hay khuyen nghi dau tu.",
  methFooter: (dateStr) =>
    `BlockID.au · Startup Value Index™ · Bao cao tao ngay ${dateStr} · Dung cho noi bo nha sang lap va chia se voi nha dau tu. Khong phat hanh cong khai neu chua co su dong y cua nha sang lap.`,

  noAnalysisTitle: "Khong tim thay phan tich gan day",
  noAnalysisBody:
    "Hay chay phan tich day du 8 khia canh SVI truoc — ket qua luu 30 phut.",
  noAnalysisCta: "Phan tich pitchdeck cua toi",
  scoresMissingBody:
    "Phan tich da luu cache nhung khong co diem. Hay chay lai phan tich khia canh.",
  scoresMissingCta: "Toi trang Phan tich Pitchdeck →",

  footerDisclaimer:
    "BlockID Startup Value Index™ — Phan tich co AI ho tro. Khong phai dinh gia chinh thuc hay khuyen nghi dau tu.",
  footerReanalyse: "Phan tich lai →",

  execHeroPer100: "/ 100",
};

export const TBR_STRINGS: Record<TbrLocale, TbrStrings> = { en, vi };

export function getTbrStrings(locale: TbrLocale | undefined): TbrStrings {
  return TBR_STRINGS[locale === "vi" ? "vi" : "en"];
}
