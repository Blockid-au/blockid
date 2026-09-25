// G27 — TBR v3 investment view strings (web / PDF / DOCX / e-mail twins).
//
// Self-contained EN + VI block (VI with diacritics) for the investor-grade
// report: dashboard tiles, the A–D verdict rubric wording, conditions,
// key points, risk matrix, 90-day improvement plan, per-dimension investor
// takeaways and the 16-section titles. Spec: docs/design/tbr-v3-investor-
// report-spec.md § 2–4. ES / JA read the English block (re-exported through
// `tbr-strings.ts`; key parity is enforced by tbr-strings.test.ts). Every
// string here is never-say safe (docs/design/messaging.md § 11): no
// "predicts", no "AI decides", no benchmark figure without its n.

export type TbrV3Locale = "en" | "vi";
export type TbrV3Band = "A" | "B" | "C" | "D";
export type TbrV3Conviction = "low" | "medium" | "high";
export type TbrV3Level = "low" | "medium" | "high";

export interface TbrV3Strings {
  /** Section titles in v3 order (chapters 5–12 use the chapter titles). */
  sec: {
    dashboard: string;
    investmentView: string;
    keyPoints: string;
    valuation: string;
    riskMatrix: string;
    improvementPlan: string;
    money: string;
    appendix: string;
  };
  purpose: {
    dashboard: string;
    investmentView: string;
    keyPoints: string;
    riskMatrix: string;
    improvementPlan: string;
  };
  /** Verdict band → short label ("With conditions") + the rubric wording (spec § 4). */
  bandLabel: Record<TbrV3Band, string>;
  bandWording: Record<TbrV3Band, string>;
  conviction: Record<TbrV3Conviction, string>;
  convictionLine: (ecPct: number, conviction: string) => string;
  /** Mandatory sub-line under every verdict (verbatim, spec § 4). */
  subline: string;
  /** Conditions (spec § 4). */
  condFloor: (dim: string, phase: string, floor: number, score: number) => string;
  condUnverified: (n: number) => string;
  condAsk: (gapPct: number, low: string, high: string) => string;
  conditions: string;
  noConditions: string;
  evidenceCtas: string;
  /** Reasons / risks fallbacks (spec § 4.1). */
  dimLine: (dim: string, score: number, delta: string, n: number) => string;
  dimLineNoBench: (dim: string, score: number) => string;
  whyBack: string;
  whatWeighsAgainst: string;
  analystSynthesis: string;
  whereYouAre: string;
  blocker: string;
  whatItTakes: string;
  /** Key points (spec § 4.2). */
  kpConsensus: (low: string, high: string, methods: number) => string;
  kpRevenueMethods: (m: number) => string;
  kpValuationPending: string;
  kpVerdict: (band: string, condition: string | null) => string;
  /** Investor takeaway templates (spec § 4.3). */
  takeawayTitle: string;
  takeawayStrong: (dim: string, score: number, delta: string, n: number) => string;
  takeawayStrongNoBench: (dim: string, score: number) => string;
  takeawayDeveloping: (dim: string, score: number, gap: string) => string;
  takeawayEarly: (dim: string, gap: string) => string;
  takeawayPending: (dim: string) => string;
  /** Risk matrix (spec § 4.4). */
  level: Record<TbrV3Level, string>;
  likelihood: string;
  impact: string;
  thRisk: string;
  thMitigation: string;
  riskUnverified: (n: number) => string;
  riskAsk: (gapPct: number) => string;
  mitigationUnverified: string;
  mitigationAsk: string;
  mitigationBlocker: string;
  riskGridCaption: string;
  noRisks: string;
  /** Improvement plan (spec § 4.5). */
  thAction: string;
  thLift: string;
  thWindow: string;
  thDim: string;
  thEvidence: string;
  planNote: string;
  planEmpty: string;
  window: Record<"this_week" | "30d" | "90d", string>;
  lift: (n: number) => string;
  /** Dashboard tiles (spec § 5). */
  tileSvi: string;
  tileEvidence: string;
  tileVerdict: string;
  tileValuation: string;
  composite: (n: number) => string;
  compositePending: string;
  methodsRan: (k: number, total: number) => string;
  askChip: Record<"aligned" | "above_consensus" | "below_consensus", string>;
  askNone: string;
  revenueNotRun: (m: number) => string;
  deltaVsLast: (signed: string) => string;
  conditionsCount: (n: number) => string;
  topStrength: string;
  topGap: string;
  unverifiedCount: (n: number) => string;
  lastUpdated: (date: string) => string;
  methodology: (v: string) => string;
  valuationPending: string;
  /** 8-dimension bar chart. */
  chartTitle: string;
  chartCaptionBand: (n: number, label: string) => string;
  chartCaptionNoBand: (n: number) => string;
  chartCaptionUnknown: string;
  legendScore: string;
  legendBand: string;
  legendMedian: string;
  tableView: string;
  pendingBar: string;
  /** Chapter anatomy (spec § 3). */
  dimKicker: (n: number, weight: number) => string;
  benchLine: (p50: number, n: number, label: string, p25: number, p75: number) => string;
  benchPercentile: (p: number) => string;
  benchNotEnough: (n: number) => string;
  benchNone: string;
  floorChip: (phase: string, floor: number, met: boolean) => string;
  noFloor: (phase: string) => string;
  verdict: string;
  evidenceUsed: string;
  moreInRegister: (n: number) => string;
  strengths: string;
  risksGaps: string;
  criteria: string;
  thCriterion: string;
  thScore: string;
  thQuality: string;
  thVerdict: string;
  whatToImprove: string;
  howBuilt: string;
  pendingCard: string;
  pendingAdd: string;
  unverified: string;
  unverifiedNote: string;
  fullCardsPaid: string;
  lockedCard: string;
  /** Valuation additions. */
  rangeTitle: string;
  rangeLow: string;
  rangeMid: string;
  rangeHigh: string;
  rangeAsk: string;
  whatMovesIt: string;
  movesRevenue: (m: number) => string;
  movesGrowth: string;
  movesVerification: string;
  movesClaims: (n: number) => string;
  movesAsk: string;
  thApplicable: string;
  consensusRow: string;
  yes: string;
  no: string;
  /** Appendix additions. */
  phaseGateMatrix: string;
  scoreLedger: string;
  countsOnly: (evidence: number, audit: number) => string;
  /** E-mail summary. */
  emailIntro: (name: string) => string;
  emailOpenFull: string;
  emailImprovements: string;
  /** G28-C: label before the signed PDF download link (free-grant e-mail). */
  emailPdfLink: string;
}

const en: TbrV3Strings = {
  sec: {
    dashboard: "Dashboard",
    investmentView: "Investment view",
    keyPoints: "Key points",
    valuation: "Valuation",
    riskMatrix: "Risk matrix",
    improvementPlan: "90-day improvement plan",
    money: "Money on the table — grants & programs",
    appendix: "Appendix — method, phase gates, ledger, evidence & disclaimers",
  },
  purpose: {
    dashboard: "One page: index, evidence confidence, verdict band and valuation range, with the eight dimensions against the stage median band.",
    investmentView: "The recommendation first: the verdict band, the conditions attached, why to back, what weighs against, and where the company stands.",
    keyPoints: "Five lines a screener can paste into notes.",
    riskMatrix: "The risks that matter, with likelihood, impact and the mitigation each one has.",
    improvementPlan: "Ranked by expected lift ÷ effort; lifts are the catalogue values, never cumulative.",
  },
  bandLabel: { A: "Worth investigating", B: "With conditions", C: "Not yet", D: "Insufficient evidence" },
  bandWording: {
    A: "Evidence supports further due diligence",
    B: "Further diligence subject to stated conditions",
    C: "Not yet — build evidence",
    D: "Not enough evidence to form a view",
  },
  conviction: { low: "low", medium: "medium", high: "high" },
  convictionLine: (ecPct, conviction) => `Evidence confidence ${ecPct} % · conviction: ${conviction}`,
  subline: "Based on the evidence supplied and the SVI rubric. BlockID structures the evidence; evaluators and founders make the decision. General information, not financial product advice.",
  condFloor: (dim, phase, floor, score) => `Lift ${dim} to the ${phase} floor of ${floor} (now ${score})`,
  condUnverified: (n) => `Verify ${n} self-declared material claim${n === 1 ? "" : "s"} (documents or connected sources)`,
  condAsk: (gapPct, low, high) => `Re-anchor the ask: ${gapPct} % above the ${low}–${high} weighted estimate`,
  conditions: "Conditions",
  noConditions: "No conditions attach.",
  evidenceCtas: "Evidence to add before a view can form",
  dimLine: (dim, score, delta, n) => `${dim} ${score}/100, ${delta} vs stage median (n = ${n})`,
  dimLineNoBench: (dim, score) => `${dim} ${score}/100`,
  whyBack: "Why back",
  whatWeighsAgainst: "What weighs against",
  analystSynthesis: "Analyst synthesis",
  whereYouAre: "Where you are",
  blocker: "Blocker",
  whatItTakes: "What it takes",
  kpConsensus: (low, high, methods) => `Weighted estimate ${low}–${high} from ${methods} method${methods === 1 ? "" : "s"}`,
  kpRevenueMethods: (m) => `${m} revenue method${m === 1 ? "" : "s"} did not run (pre-revenue)`,
  kpValuationPending: "Valuation pending — not enough scored evidence for a range",
  kpVerdict: (band, condition) => (condition ? `${band} — ${condition}` : band),
  takeawayTitle: "Investor takeaway",
  takeawayStrong: (dim, score, delta, n) => `${dim} supports the case: ${score}/100, ${delta} vs stage median (n = ${n}).`,
  takeawayStrongNoBench: (dim, score) => `${dim} supports the case: ${score}/100.`,
  takeawayDeveloping: (dim, score, gap) => `${dim} is neutral: ${score}/100; conditions attach until ${gap}.`,
  takeawayEarly: (dim, gap) => `${dim} weighs against the case until ${gap}.`,
  takeawayPending: (dim) => `No view on ${dim} until evidence is supplied.`,
  level: { low: "low", medium: "medium", high: "high" },
  likelihood: "Likelihood",
  impact: "Impact",
  thRisk: "Risk",
  thMitigation: "Mitigation",
  riskUnverified: (n) => `${n} self-declared material claim${n === 1 ? "" : "s"} not yet verified`,
  riskAsk: (gapPct) => `Ask sits ${gapPct} % above the weighted estimate range`,
  mitigationUnverified: "Upload documents or connect the source",
  mitigationAsk: "Re-anchor the ask to the weighted estimate range",
  mitigationBlocker: "Clear the phase-gate blocker (see the plan)",
  riskGridCaption: "Count of risks by likelihood (rows) × impact (columns)",
  noRisks: "No material risk rows — no evidence gap or phase blocker is open in any dimension.",
  thAction: "Action",
  thLift: "Lift",
  thWindow: "Window",
  thDim: "Dimension",
  thEvidence: "Evidence to add",
  planNote: "Ranked by lift ÷ effort · lifts as listed in the catalogue, not cumulative.",
  planEmpty: "No improvement steps — every dimension is evidenced.",
  window: { this_week: "this week", "30d": "30 days", "90d": "90 days" },
  lift: (n) => `+${n} SVI`,
  tileSvi: "SVI index",
  tileEvidence: "Evidence confidence",
  tileVerdict: "Verdict",
  tileValuation: "Valuation (A$, pre-money)",
  composite: (n) => `composite ${n}/100`,
  compositePending: "composite pending",
  methodsRan: (k, total) => `${k} of ${total} methods`,
  askChip: { aligned: "ask aligned", above_consensus: "ask above weighted estimate", below_consensus: "ask below weighted estimate" },
  askNone: "ask —",
  revenueNotRun: (m) => `${m} revenue method${m === 1 ? "" : "s"} not run`,
  deltaVsLast: (signed) => `${signed} vs last`,
  conditionsCount: (n) => (n === 0 ? "no conditions" : `${n} condition${n === 1 ? "" : "s"} ↓`),
  topStrength: "Top strength",
  topGap: "Top gap",
  unverifiedCount: (n) => `Unverified material claims: ${n}`,
  lastUpdated: (date) => `Last updated ${date}`,
  methodology: (v) => `Methodology ${v}`,
  valuationPending: "Valuation pending",
  chartTitle: "8 dimensions vs stage median band",
  chartCaptionBand: (n, label) => `Stage median band p25–p75, n = ${n} (${label})`,
  chartCaptionNoBand: (n) => `Not enough comparable companies for a band (n = ${n}) — scores only`,
  chartCaptionUnknown: "No published cohort for a band — scores only",
  legendScore: "your score",
  legendBand: "stage band p25–p75",
  legendMedian: "p50 median",
  tableView: "Table view",
  pendingBar: "Pending (no evidence yet)",
  dimKicker: (n, weight) => `Dimension ${n}/8 · weight ${weight} %`,
  benchLine: (p50, n, label, p25, p75) => `stage median ${p50} (n = ${n}, ${label}) · p25 ${p25} · p75 ${p75}`,
  benchPercentile: (p) => `${p}th percentile`,
  benchNotEnough: (n) => `not enough comparable companies (n = ${n})`,
  benchNone: "no published cohort",
  floorChip: (phase, floor, met) => `${phase} · floor ${floor} ${met ? "✓" : "✗"}`,
  noFloor: (phase) => `${phase} · no floor`,
  verdict: "Verdict",
  evidenceUsed: "Evidence used",
  moreInRegister: (n) => `+${n} more in the evidence register`,
  strengths: "Strengths",
  risksGaps: "Risks / gaps",
  criteria: "Criteria",
  thCriterion: "Criterion",
  thScore: "Score",
  thQuality: "Quality",
  thVerdict: "One-line verdict",
  whatToImprove: "What to improve",
  howBuilt: "How this score was built",
  pendingCard: "Pending — not assessed. No evidence has been supplied for this dimension, so no score is shown; a pending dimension is not a low score.",
  pendingAdd: "Add:",
  unverified: "unverified",
  unverifiedNote: "self-declared, not yet verified",
  fullCardsPaid: "Full criterion cards (strengths, gaps, next action) are in the paid view.",
  lockedCard: "Compact card — the full chapter (evidence used, criteria, what to improve, ledger) is in the paid view.",
  rangeTitle: "Range",
  rangeLow: "low",
  rangeMid: "mid",
  rangeHigh: "high",
  rangeAsk: "ask",
  whatMovesIt: "What moves it",
  movesRevenue: (m) => `Connect Stripe or Xero → ${m} revenue method${m === 1 ? "" : "s"} run (+${m} method${m === 1 ? "" : "s"} in the weighted estimate)`,
  movesGrowth: "An observed growth rate replaces the assumed sector median in the growth-dependent methods",
  movesVerification: "Verified ABN (public registers) moves the risk-factor legal row one step",
  movesClaims: (n) => `Verifying ${n} self-declared claim${n === 1 ? "" : "s"} lifts weighted estimate confidence`,
  movesAsk: "Stating the raise and cap adds the ask-alignment check",
  thApplicable: "Applicable",
  consensusRow: "Weighted estimate",
  yes: "✓",
  no: "—",
  phaseGateMatrix: "Phase-gate matrix",
  scoreLedger: "Score ledger",
  countsOnly: (evidence, audit) => `Evidence register: ${evidence} row${evidence === 1 ? "" : "s"} · auditor log: ${audit} section${audit === 1 ? "" : "s"} (full tables in the paid view)`,
  emailIntro: (name) => `The investment view for ${name} — the full report is attached and linked below.`,
  emailOpenFull: "Open the full report →",
  emailImprovements: "Top 3 improvements",
  emailPdfLink: "Download the PDF:",
};

const vi: TbrV3Strings = {
  sec: {
    dashboard: "Bảng tổng quan",
    investmentView: "Góc nhìn đầu tư",
    keyPoints: "Điểm chính",
    valuation: "Định giá",
    riskMatrix: "Ma trận rủi ro",
    improvementPlan: "Kế hoạch cải thiện 90 ngày",
    money: "Nguồn vốn phi pha loãng — tài trợ & chương trình",
    appendix: "Phụ lục — phương pháp, cổng giai đoạn, sổ điểm, bằng chứng & miễn trừ",
  },
  purpose: {
    dashboard: "Một trang: chỉ số, độ tin cậy bằng chứng, hạng kết luận và khoảng định giá, cùng tám chiều so với dải trung vị theo giai đoạn.",
    investmentView: "Khuyến nghị đặt lên đầu: hạng kết luận, các điều kiện kèm theo, lý do ủng hộ, điều bất lợi và vị trí hiện tại của công ty.",
    keyPoints: "Năm dòng mà người sàng lọc có thể dán vào ghi chú.",
    riskMatrix: "Những rủi ro quan trọng, kèm khả năng xảy ra, mức tác động và biện pháp giảm thiểu.",
    improvementPlan: "Xếp hạng theo mức tăng kỳ vọng ÷ công sức; mức tăng lấy theo danh mục, không cộng dồn.",
  },
  bandLabel: { A: "Đáng tìm hiểu thêm", B: "Kèm điều kiện", C: "Chưa đến lúc", D: "Chưa đủ bằng chứng" },
  bandWording: {
    A: "Bằng chứng hỗ trợ bước thẩm định tiếp theo",
    B: "Tiếp tục thẩm định theo các điều kiện đã nêu",
    C: "Chưa đến lúc — cần bổ sung bằng chứng",
    D: "Chưa đủ bằng chứng để đánh giá",
  },
  conviction: { low: "thấp", medium: "trung bình", high: "cao" },
  convictionLine: (ecPct, conviction) => `Độ tin cậy bằng chứng ${ecPct} % · mức tin tưởng: ${conviction}`,
  subline: "Dựa trên bằng chứng đã cung cấp và bộ tiêu chí SVI. BlockID sắp xếp bằng chứng; nhà đánh giá và nhà sáng lập tự ra quyết định. Thông tin chung, không phải lời khuyên về sản phẩm tài chính.",
  condFloor: (dim, phase, floor, score) => `Nâng ${dim} lên mức sàn ${floor} của giai đoạn ${phase} (hiện ${score})`,
  condUnverified: (n) => `Xác minh ${n} tuyên bố trọng yếu tự khai (tài liệu hoặc nguồn kết nối)`,
  condAsk: (gapPct, low, high) => `Điều chỉnh mức gọi vốn: cao hơn ${gapPct} % so với khoảng ước tính có trọng số ${low}–${high}`,
  conditions: "Điều kiện",
  noConditions: "Không kèm điều kiện.",
  evidenceCtas: "Bằng chứng cần bổ sung trước khi có nhận định",
  dimLine: (dim, score, delta, n) => `${dim} ${score}/100, ${delta} so với trung vị giai đoạn (n = ${n})`,
  dimLineNoBench: (dim, score) => `${dim} ${score}/100`,
  whyBack: "Lý do ủng hộ",
  whatWeighsAgainst: "Điều bất lợi",
  analystSynthesis: "Tổng hợp của chuyên viên phân tích",
  whereYouAre: "Vị trí hiện tại",
  blocker: "Điểm nghẽn",
  whatItTakes: "Cần gì để vượt qua",
  kpConsensus: (low, high, methods) => `Ước tính có trọng số ${low}–${high} từ ${methods} phương pháp`,
  kpRevenueMethods: (m) => `${m} phương pháp dựa trên doanh thu chưa chạy (chưa có doanh thu)`,
  kpValuationPending: "Định giá đang chờ — chưa đủ bằng chứng đã chấm điểm để lập khoảng",
  kpVerdict: (band, condition) => (condition ? `${band} — ${condition}` : band),
  takeawayTitle: "Nhận định cho nhà đầu tư",
  takeawayStrong: (dim, score, delta, n) => `${dim} củng cố luận điểm: ${score}/100, ${delta} so với trung vị giai đoạn (n = ${n}).`,
  takeawayStrongNoBench: (dim, score) => `${dim} củng cố luận điểm: ${score}/100.`,
  takeawayDeveloping: (dim, score, gap) => `${dim} ở mức trung tính: ${score}/100; điều kiện còn kèm theo cho đến khi ${gap}.`,
  takeawayEarly: (dim, gap) => `${dim} gây bất lợi cho luận điểm cho đến khi ${gap}.`,
  takeawayPending: (dim) => `Chưa có nhận định về ${dim} cho đến khi có bằng chứng.`,
  level: { low: "thấp", medium: "trung bình", high: "cao" },
  likelihood: "Khả năng xảy ra",
  impact: "Tác động",
  thRisk: "Rủi ro",
  thMitigation: "Giảm thiểu",
  riskUnverified: (n) => `${n} tuyên bố trọng yếu tự khai chưa được xác minh`,
  riskAsk: (gapPct) => `Mức gọi vốn cao hơn ${gapPct} % so với khoảng ước tính có trọng số`,
  mitigationUnverified: "Tải tài liệu lên hoặc kết nối nguồn dữ liệu",
  mitigationAsk: "Điều chỉnh mức gọi vốn về khoảng ước tính có trọng số",
  mitigationBlocker: "Gỡ điểm nghẽn cổng giai đoạn (xem kế hoạch)",
  riskGridCaption: "Số rủi ro theo khả năng xảy ra (hàng) × tác động (cột)",
  noRisks: "Không có dòng rủi ro trọng yếu — không còn khoảng trống bằng chứng hay điểm chặn giai đoạn ở bất kỳ chiều nào.",
  thAction: "Hành động",
  thLift: "Mức tăng",
  thWindow: "Thời hạn",
  thDim: "Chiều",
  thEvidence: "Bằng chứng cần bổ sung",
  planNote: "Xếp hạng theo mức tăng ÷ công sức · mức tăng lấy theo danh mục, không cộng dồn.",
  planEmpty: "Không có bước cải thiện — mọi chiều đều đã có bằng chứng.",
  window: { this_week: "tuần này", "30d": "30 ngày", "90d": "90 ngày" },
  lift: (n) => `+${n} SVI`,
  tileSvi: "Chỉ số SVI",
  tileEvidence: "Độ tin cậy bằng chứng",
  tileVerdict: "Kết luận",
  tileValuation: "Định giá (A$, trước gọi vốn)",
  composite: (n) => `tổng hợp ${n}/100`,
  compositePending: "tổng hợp đang chờ",
  methodsRan: (k, total) => `${k} trên ${total} phương pháp`,
  askChip: { aligned: "mức gọi vốn phù hợp", above_consensus: "mức gọi vốn cao hơn ước tính có trọng số", below_consensus: "mức gọi vốn thấp hơn ước tính có trọng số" },
  askNone: "mức gọi vốn —",
  revenueNotRun: (m) => `${m} phương pháp doanh thu chưa chạy`,
  deltaVsLast: (signed) => `${signed} so với lần trước`,
  conditionsCount: (n) => (n === 0 ? "không có điều kiện" : `${n} điều kiện ↓`),
  topStrength: "Điểm mạnh nhất",
  topGap: "Khoảng trống lớn nhất",
  unverifiedCount: (n) => `Tuyên bố trọng yếu chưa xác minh: ${n}`,
  lastUpdated: (date) => `Cập nhật lần cuối ${date}`,
  methodology: (v) => `Phương pháp ${v}`,
  valuationPending: "Định giá đang chờ",
  chartTitle: "8 chiều so với dải trung vị giai đoạn",
  chartCaptionBand: (n, label) => `Dải trung vị giai đoạn p25–p75, n = ${n} (${label})`,
  chartCaptionNoBand: (n) => `Chưa đủ công ty so sánh để lập dải (n = ${n}) — chỉ hiển thị điểm`,
  chartCaptionUnknown: "Chưa có nhóm so sánh công bố để lập dải — chỉ hiển thị điểm",
  legendScore: "điểm của bạn",
  legendBand: "dải giai đoạn p25–p75",
  legendMedian: "trung vị p50",
  tableView: "Xem dạng bảng",
  pendingBar: "Đang chờ (chưa có bằng chứng)",
  dimKicker: (n, weight) => `Chiều ${n}/8 · trọng số ${weight} %`,
  benchLine: (p50, n, label, p25, p75) => `trung vị giai đoạn ${p50} (n = ${n}, ${label}) · p25 ${p25} · p75 ${p75}`,
  benchPercentile: (p) => `bách phân vị ${p}`,
  benchNotEnough: (n) => `chưa đủ công ty so sánh (n = ${n})`,
  benchNone: "chưa có nhóm so sánh công bố",
  floorChip: (phase, floor, met) => `${phase} · sàn ${floor} ${met ? "✓" : "✗"}`,
  noFloor: (phase) => `${phase} · không có sàn`,
  verdict: "Kết luận",
  evidenceUsed: "Bằng chứng đã dùng",
  moreInRegister: (n) => `+${n} dòng nữa trong sổ bằng chứng`,
  strengths: "Điểm mạnh",
  risksGaps: "Rủi ro / khoảng trống",
  criteria: "Tiêu chí",
  thCriterion: "Tiêu chí",
  thScore: "Điểm",
  thQuality: "Chất lượng",
  thVerdict: "Kết luận một dòng",
  whatToImprove: "Cần cải thiện gì",
  howBuilt: "Điểm này được tính như thế nào",
  pendingCard: "Đang chờ — chưa đánh giá. Chưa có bằng chứng cho chiều này nên không hiển thị điểm; chiều đang chờ không phải là điểm thấp.",
  pendingAdd: "Bổ sung:",
  unverified: "chưa xác minh",
  unverifiedNote: "tự khai, chưa được xác minh",
  fullCardsPaid: "Thẻ tiêu chí đầy đủ (điểm mạnh, khoảng trống, hành động tiếp theo) có trong bản trả phí.",
  lockedCard: "Thẻ rút gọn — chương đầy đủ (bằng chứng đã dùng, tiêu chí, cần cải thiện, sổ điểm) có trong bản trả phí.",
  rangeTitle: "Khoảng",
  rangeLow: "thấp",
  rangeMid: "giữa",
  rangeHigh: "cao",
  rangeAsk: "mức gọi vốn",
  whatMovesIt: "Điều gì làm thay đổi",
  movesRevenue: (m) => `Kết nối Stripe hoặc Xero → ${m} phương pháp doanh thu được chạy (+${m} phương pháp trong ước tính có trọng số)`,
  movesGrowth: "Tốc độ tăng trưởng quan sát được thay cho trung vị ngành giả định trong các phương pháp phụ thuộc tăng trưởng",
  movesVerification: "ABN đã xác minh (đăng ký công khai) nâng dòng pháp lý trong phương pháp tổng hợp rủi ro lên một bậc",
  movesClaims: (n) => `Xác minh ${n} tuyên bố tự khai nâng độ tin cậy của ước tính có trọng số`,
  movesAsk: "Nêu rõ số tiền gọi vốn và mức trần sẽ thêm kiểm tra mức độ phù hợp của mức gọi vốn",
  thApplicable: "Áp dụng",
  consensusRow: "Ước tính có trọng số",
  yes: "✓",
  no: "—",
  phaseGateMatrix: "Ma trận cổng giai đoạn",
  scoreLedger: "Sổ điểm",
  countsOnly: (evidence, audit) => `Sổ bằng chứng: ${evidence} dòng · nhật ký kiểm toán: ${audit} mục (bảng đầy đủ trong bản trả phí)`,
  emailIntro: (name) => `Góc nhìn đầu tư cho ${name} — báo cáo đầy đủ được đính kèm và liên kết bên dưới.`,
  emailOpenFull: "Mở báo cáo đầy đủ →",
  emailImprovements: "3 cải thiện hàng đầu",
  emailPdfLink: "Tải PDF:",
};

export const TBR_V3_STRINGS: Record<TbrV3Locale, TbrV3Strings> = { en, vi };

/** EN / VI only (ES / JA read English), same rule as the S42 / S43 blocks. */
export function getTbrV3Strings(locale: string | undefined): TbrV3Strings {
  return locale === "vi" ? vi : en;
}
