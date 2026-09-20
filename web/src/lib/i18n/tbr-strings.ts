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

export type TbrLocale = "en" | "vi" | "es" | "ja";

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
  switchToEs: string;
  switchToJa: string;

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
  // G13-W1-R1 — ReportV2 chapter titles
  secCover: string;
  secPhaseGates: string;
  secMoney: string;
  secActionPlan: string;
  secAppendix: string;

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

  // G19-S41 — score ledger ("How this score was built") on every chapter,
  // the cover ledger strip and the pending-dimension line. Web, PDF and DOCX
  // all read these; nothing is hard-coded in the components.
  ledger: TbrLedgerStrings;
  /** G19-S45 — every ReportV2 web label (chapters, rail, order page, adapter sentences, survey). */
  v2: TbrV2Strings;
}

export interface TbrLedgerStrings {
  title: string;
  thSignal: string;
  thPoints: string;
  thSource: string;
  base: (base: number) => string;
  /** "= score 82/100 (base + signals, clamped 0–100)" */
  score: (score: number) => string;
  weight: (weightPct: number) => string;
  confidence: (multiplier: string) => string;
  verification: (level: number, multiplier: string) => string;
  adjustment: (signed: string) => string;
  /** Marker on the LCO evidence-vault rows that move the adjustment, not the raw score. */
  adjustmentScale: string;
  pending: string;
  pendingAdd: (what: string) => string;
  scoreNote: string;
  source: Record<"self_declared" | "public_url" | "document_uploaded" | "connected_source" | "transaction_data" | "third_party_verified" | "audit" | "penalty" | "stage", string>;
  // Cover strip
  coverTitle: string;
  coverBase: string;
  coverDims: string;
  coverStage: string;
  coverPenalties: string;
  coverSector: string;
  coverMetrics: string;
  coverCi: string;
  coverFloor: string;
  coverTotal: string;
  pendingDims: (n: number, total: number) => string;
}

const ledgerEn: TbrLedgerStrings = {
  title: "How this score was built",
  thSignal: "Signal",
  thPoints: "Points",
  thSource: "Source",
  base: (base) => `Base ${base}`,
  score: (score) => `= score ${score}/100 (base + signals, clamped 0–100)`,
  weight: (w) => `× weight ${w} %`,
  confidence: (m) => `× evidence confidence ${m}`,
  verification: (level, m) => `× verification L${level} ${m}`,
  adjustment: (signed) => `= adjustment ${signed} on the SVI base of 100`,
  adjustmentScale: "applied to the adjustment",
  pending: "Not assessed yet — no evidence for this dimension.",
  pendingAdd: (what) => `Add: ${what}`,
  scoreNote: "Score note",
  source: {
    self_declared: "self-declared",
    public_url: "public URL",
    document_uploaded: "document",
    connected_source: "connector",
    transaction_data: "transactions",
    third_party_verified: "third-party verified",
    audit: "audit",
    penalty: "penalty",
    stage: "stage",
  },
  coverTitle: "SVI ledger",
  coverBase: "Base",
  coverDims: "8 dimensions",
  coverStage: "Stage bonus",
  coverPenalties: "Risk penalties",
  coverSector: "Sector",
  coverMetrics: "Metrics",
  coverCi: "Competitive intel",
  coverFloor: "Floor",
  coverTotal: "Total",
  pendingDims: (n, total) => `${n} of ${total} dimensions pending`,
};

const ledgerVi: TbrLedgerStrings = {
  title: "Điểm này được xây dựng như thế nào",
  thSignal: "Tín hiệu",
  thPoints: "Điểm",
  thSource: "Nguồn",
  base: (base) => `Điểm nền ${base}`,
  score: (score) => `= điểm ${score}/100 (nền + tín hiệu, giới hạn 0–100)`,
  weight: (w) => `× trọng số ${w} %`,
  confidence: (m) => `× độ tin cậy bằng chứng ${m}`,
  verification: (level, m) => `× xác minh L${level} ${m}`,
  adjustment: (signed) => `= điều chỉnh ${signed} trên nền SVI 100`,
  adjustmentScale: "áp dụng vào điều chỉnh",
  pending: "Chưa đánh giá — chưa có bằng chứng cho khía cạnh này.",
  pendingAdd: (what) => `Bổ sung: ${what}`,
  scoreNote: "Ghi chú điểm",
  source: {
    self_declared: "tự khai",
    public_url: "URL công khai",
    document_uploaded: "tài liệu tải lên",
    connected_source: "nguồn kết nối",
    transaction_data: "dữ liệu giao dịch",
    third_party_verified: "bên thứ ba xác minh",
    audit: "kiểm định",
    penalty: "phạt",
    stage: "giai đoạn",
  },
  coverTitle: "Sổ cái SVI",
  coverBase: "Nền",
  coverDims: "8 khía cạnh",
  coverStage: "Thưởng giai đoạn",
  coverPenalties: "Phạt rủi ro",
  coverSector: "Ngành",
  coverMetrics: "Chỉ số",
  coverCi: "Tình báo cạnh tranh",
  coverFloor: "Sàn",
  coverTotal: "Tổng",
  pendingDims: (n, total) => `${n} trên ${total} khía cạnh chưa đánh giá`,
};

const ledgerEs: TbrLedgerStrings = {
  title: "Cómo se construyó esta puntuación",
  thSignal: "Señal",
  thPoints: "Puntos",
  thSource: "Fuente",
  base: (base) => `Base ${base}`,
  score: (score) => `= puntuación ${score}/100 (base + señales, limitada a 0–100)`,
  weight: (w) => `× peso ${w} %`,
  confidence: (m) => `× confianza de la evidencia ${m}`,
  verification: (level, m) => `× verificación L${level} ${m}`,
  adjustment: (signed) => `= ajuste ${signed} sobre la base SVI de 100`,
  adjustmentScale: "aplicado al ajuste",
  pending: "Aún no evaluada — sin evidencia para esta dimensión.",
  pendingAdd: (what) => `Añadir: ${what}`,
  scoreNote: "Nota de puntuación",
  source: {
    self_declared: "autodeclarado",
    public_url: "URL pública",
    document_uploaded: "documento",
    connected_source: "conector",
    transaction_data: "transacciones",
    third_party_verified: "verificado por terceros",
    audit: "auditoría",
    penalty: "penalización",
    stage: "etapa",
  },
  coverTitle: "Libro SVI",
  coverBase: "Base",
  coverDims: "8 dimensiones",
  coverStage: "Bono de etapa",
  coverPenalties: "Penalizaciones de riesgo",
  coverSector: "Sector",
  coverMetrics: "Métricas",
  coverCi: "Inteligencia competitiva",
  coverFloor: "Mínimo",
  coverTotal: "Total",
  pendingDims: (n, total) => `${n} de ${total} dimensiones pendientes`,
};

const ledgerJa: TbrLedgerStrings = {
  title: "このスコアの内訳",
  thSignal: "シグナル",
  thPoints: "ポイント",
  thSource: "出所",
  base: (base) => `基準値 ${base}`,
  score: (score) => `= スコア ${score}/100（基準値 + シグナル、0–100 に制限）`,
  weight: (w) => `× ウェイト ${w} %`,
  confidence: (m) => `× エビデンス信頼度 ${m}`,
  verification: (level, m) => `× 検証 L${level} ${m}`,
  adjustment: (signed) => `= 調整 ${signed}（SVI 基準値 100 に対して）`,
  adjustmentScale: "調整に適用",
  pending: "未評価 — この項目のエビデンスがありません。",
  pendingAdd: (what) => `追加: ${what}`,
  scoreNote: "スコア注記",
  source: {
    self_declared: "自己申告",
    public_url: "公開 URL",
    document_uploaded: "アップロード資料",
    connected_source: "連携データ",
    transaction_data: "取引データ",
    third_party_verified: "第三者検証",
    audit: "監査",
    penalty: "ペナルティ",
    stage: "ステージ",
  },
  coverTitle: "SVI 台帳",
  coverBase: "基準値",
  coverDims: "8 項目",
  coverStage: "ステージ加点",
  coverPenalties: "リスク減点",
  coverSector: "セクター",
  coverMetrics: "指標",
  coverCi: "競合分析",
  coverFloor: "下限",
  coverTotal: "合計",
  pendingDims: (n, total) => `${total} 項目中 ${n} 項目が未評価`,
};

// ── G19-S45 — every ReportV2 web label (components/tbr/v2/*) ────────────────
//
// The chapter components, the unlock rail, the order page, the adapter's
// templated sentences and the clarity survey all read this block; nothing
// is hard-coded in the components. EN and VI (with diacritics) are real
// translations; ES and JA reuse the English text until a translation lands
// (key parity is enforced by tbr-strings.test.ts).

export type TbrV2Band = "strong" | "developing" | "early" | "pending";
export type TbrV2DataState = "real" | "partial" | "benchmark_only" | "target";
export type TbrV2Window = "this_week" | "30d" | "90d";

export interface TbrV2Strings {
  band: Record<TbrV2Band, string>;
  state: Record<TbrV2DataState, string>;
  audit: {
    auditor: string;
    grounded: string;
    notAudited: string;
    uncited: (n: number) => string;
    revised: string;
    frameworks: string;
  };
  chapter: {
    per100: string;
    weight: (w: number) => string;
    owner: string;
    benchmarks: (p25: number, p50: number, p75: number) => string;
    youPercentile: (p: number) => string;
    evidence: string;
    noEvidence: string;
    strengths: string;
    gaps: string;
    next: string;
    nextAction: (window: string) => string;
    window: Record<TbrV2Window, string>;
    expectedLift: (n: number) => string;
    evidenceToAdd: (what: string) => string;
    unlockChapter: (title: string) => string;
    grounded: string;
    uncited: string;
  };
  executive: {
    confidence: (pct: number) => string;
    topStrengths: string;
    topGaps: string;
    phaseLine: (now: string, next: string, pct: number) => string;
    finalPhase: string;
    noBlockers: string;
  };
  cover: {
    deltaVsLast: (signed: string) => string;
    phase: string;
    demoData: string;
    builtFromSnapshot: string;
    thDimension: string;
    thOwner: string;
    thWeight: string;
    thScore: string;
    thP50: string;
    thPctl: string;
  };
  phaseGates: {
    currentPhase: (label: string) => string;
    requiredCriteria: (label: string) => string;
    met: string;
    notMet: string;
  };
  money: {
    matched: (n: number, total: string) => string;
    grant: string;
    program: string;
    fit: (n: number) => string;
  };
  actionPlan: {
    steps: (n: number, days: number) => string;
    dayRange: (from: number, to: number) => string;
    lift: (n: number) => string;
    empty: string;
  };
  appendix: {
    quality: (score: number, groundedPct: number) => string;
    degraded: (list: string) => string;
    method: string;
    evidenceRegister: string;
    noEvidence: string;
    dataPrinciple: string;
    sources: string;
    comparables: (n: number, withMultiples: number) => string;
    auditorLog: string;
    grounded: string;
    uncited: (n: number) => string;
    revised: string;
    skipped: (reason: string) => string;
  };
  rail: {
    ariaLabel: string;
    headlineBuy: (price: string) => string;
    headlineIncluded: string;
    headlinePurchased: string;
    headlinePending: string;
    perks: (chapterCount: number) => string[];
    unlockFor: (price: string) => string;
    confirmNote: string;
    includedGenerate: string;
    includedNote: string;
    openFull: string;
    openLegacy: string;
    pendingNote: string;
    /** Locked-chapter preview footer. */
    lockedNote: string;
  };
  order: {
    downloadDocx: string;
    generated: (date: string) => string;
    paid: (amount: string) => string;
    redeemed: (credits: number) => string;
    availableUntil: (date: string) => string;
    openInWorkspace: string;
    legacyText: (words: number) => string;
    pendingTitle: string;
    pendingAria: string;
    pendingLeave: string;
    blockedRefunded: string;
    blockedUnavailable: string;
    reference: (ref: string) => string;
    backToDashboard: string;
    loading: string;
    /** Strip above the ReportV2 page while the paid order is still being written. */
    generatingStrip: string;
    /** Strip when the paid order is ready but only as legacy markdown (pre-v2 order). */
    legacyStrip: string;
    paidBadge: string;
  };
  adapter: {
    thesisStrong: (svi: number, above70: number) => string;
    thesisDeveloping: (svi: number, gaps: number) => string;
    thesisEarly: (svi: number) => string;
    thesisPending: string;
    worthLine: (low: string, high: string, sector: string, stage: string) => string;
    sectorNeutral: string;
    startup: string;
    nextLine: (action: string, lift: number, dim: string) => string;
    addEvidence: string;
    nextFallback: string;
    /** G19-S44 (D5): one phase vocabulary — the SVI stage label is no longer part of the sentence. */
    whereLine: (industry: string, svi: number, band: string, phase: string, pct: number) => string;
    phaseFloor: (phase: string, dim: string, floor: number, met: boolean, score: number) => string;
    phaseNoFloor: (phase: string, dim: string, nextGate: string) => string;
    lastPhase: string;
    method: string;
    disclaimer: string;
  };
  survey: {
    question: string;
    hint: string;
    low: string;
    high: string;
    commentPlaceholder: string;
    submit: string;
    dismiss: string;
    thanks: string;
    ariaScore: (n: number) => string;
  };
  /** G19-S44: cover "current value" hero, executive-from-cards sources, one phase-lens row, dashboard executive synthesis. */
  s44: {
    /** Cover hero. */
    currentValue: string;
    preMoney: string;
    valuationPending: string;
    valuationConfidence: (pct: number) => string;
    sviTotal: (n: number) => string;
    /** The "(source)" suffix on executive strengths / gaps — every EvidenceSource + ledger signal source + the honest fallback. */
    source: Record<string, string>;
    /** Executive header: the mean chapter-ledger confidence. */
    evidenceConfidence: (pct: number) => string;
    /** Chapter header floor chip + the one phase-lens row in Phase Gates. */
    floorMet: (floor: number) => string;
    floorNotMet: (floor: number) => string;
    noFloor: string;
    floorsRow: (phase: string) => string;
    /** Compact (borrowed) criterion card → link to the chapter that carries it in full. */
    fullCardIn: (chapter: string) => string;
    /** Dashboard block. */
    dashboard: {
      title: string;
      where: string;
      worth: string;
      strengths: string;
      weaknesses: string;
      followUps: string;
      dataToAdd: string;
      lift: (n: number) => string;
      day: (d: number) => string;
      openReport: string;
      fromReport: (date: string) => string;
      nothingYet: string;
    };
  };
  /** G19-S47: structured executive summary + report-wide section lead-ins. */
  s47: TbrS47Strings;
}

export type TbrV2VerdictLabel = "back" | "back_with_conditions" | "watch" | "not_yet";

export interface TbrS47Strings {
  /** Executive block labels. */
  keyInsight: string;
  whyBack: string;
  whatMustChange: string;
  benchmarks: string;
  whereYouAre: string;
  blocker: string;
  whatItTakes: string;
  verdict: string;
  verdictLabel: Record<TbrV2VerdictLabel, string>;
  confidence: (pct: number) => string;
  condition: string;
  actions: string;
  lift: (n: number) => string;
  openChapter: (title: string) => string;
  noCondition: string;
  /** Deterministic fallback copy (`structureExecutive` when the CEO text has no structure). */
  headlineFallback: (name: string, svi: number, band: string) => string;
  headlinePending: (name: string) => string;
  worthParagraph: (low: string, high: string, pct: number) => string;
  worthPending: string;
  phaseParagraph: (phase: string, pct: number, next: string | null) => string;
  noBlocker: string;
  takesFallback: (action: string) => string;
  reasonTitle: (dimTitle: string) => string;
  gapTitle: (dimTitle: string) => string;
  conditionFallback: (action: string) => string;
  actionDetail: (owner: string, lift: number) => string;
  /** One-line purpose under every section title (number · title · purpose). */
  purpose: {
    cover: string;
    executive: string;
    dimension: (weight: number) => string;
    valuation: string;
    phaseGates: string;
    money: string;
    actionPlan: string;
    appendix: string;
  };
}

const v2En: TbrV2Strings = {
  band: { strong: "Strong", developing: "Developing", early: "Early", pending: "Pending" },
  state: { real: "real data", partial: "partial data", benchmark_only: "benchmark only", target: "target, not actual" },
  audit: {
    auditor: "Auditor",
    grounded: "grounded",
    notAudited: "no citation in this chapter",
    uncited: (n) => `${n} uncited`,
    revised: "revised",
    frameworks: "Frameworks",
  },
  chapter: {
    per100: "/100",
    weight: (w) => `weight ${w}`,
    owner: "owner",
    benchmarks: (p25, p50, p75) => `Stage p25 ${p25} · p50 ${p50} · p75 ${p75}`,
    youPercentile: (p) => `you: ${p}th percentile`,
    evidence: "Evidence",
    noEvidence: "No evidence rows in this snapshot — connect a data source or upload documents to make this chapter evidenced.",
    strengths: "Strengths",
    gaps: "Gaps",
    next: "Next",
    nextAction: (window) => `Next action (${window})`,
    window: { this_week: "this week", "30d": "next 30 days", "90d": "next 90 days" },
    expectedLift: (n) => `expected lift +${n} SVI`,
    evidenceToAdd: (what) => `evidence: ${what}`,
    unlockChapter: (title) => `Unlock the full ${title} chapter`,
    grounded: "grounded",
    uncited: "uncited",
  },
  executive: {
    confidence: (pct) => `confidence ${pct}%`,
    topStrengths: "Top strengths",
    topGaps: "Top gaps",
    phaseLine: (now, next, pct) => `Phase now: ${now} → next gate: ${next} · ${pct}% cleared`,
    finalPhase: "final phase",
    noBlockers: "No blockers on the current gate.",
  },
  cover: {
    deltaVsLast: (signed) => `${signed} vs last snapshot`,
    phase: "Phase",
    demoData: "demo data",
    builtFromSnapshot: "built from stored snapshot",
    thDimension: "Dimension",
    thOwner: "Owner",
    thWeight: "W",
    thScore: "Score",
    thP50: "p50",
    thPctl: "Pctl",
  },
  phaseGates: {
    currentPhase: (label) => `Current phase: ${label}`,
    requiredCriteria: (label) => `Required criteria for ${label}`,
    met: "✓ met",
    notMet: "✗ not met",
  },
  money: {
    matched: (n, total) => `${n} matched · total ${total}`,
    grant: "grant",
    program: "program",
    fit: (n) => `fit ${n}`,
  },
  actionPlan: {
    steps: (n, days) => `${n} steps · ${days} days`,
    dayRange: (from, to) => `Day ${from}–${to}`,
    lift: (n) => `+${n} SVI`,
    empty: "Every scored dimension is already in the strong band — keep the evidence fresh before the next raise.",
  },
  appendix: {
    quality: (score, groundedPct) => `quality ${score}/100 · grounded ${groundedPct}%`,
    degraded: (list) => `degraded: ${list}`,
    method: "Method",
    evidenceRegister: "Evidence register",
    noEvidence: "No evidence rows are attached to this document. Connect Stripe, Xero, GA4 or GitHub, or upload documents, to populate the register.",
    dataPrinciple: "Data principle",
    sources: "Sources",
    comparables: (n, withMultiples) => `AU comparables: ${n} raises tracked, ${withMultiples} with disclosed multiples.`,
    auditorLog: "Auditor log",
    grounded: "grounded",
    uncited: (n) => `${n} uncited`,
    revised: "revised",
    skipped: (reason) => `skipped: ${reason}`,
  },
  rail: {
    ariaLabel: "Unlock the full report",
    headlineBuy: (price) => `Unlock the full Trusted Business Report — ${price} (one-off)`,
    headlineIncluded: "The full Trusted Business Report is included in your plan",
    headlinePurchased: "Your full Trusted Business Report is ready",
    headlinePending: "Your full Trusted Business Report is being written",
    perks: (n) => [
      `All ${n} dimension chapters in full — evidence tables, criterion cards, next actions`,
      "Valuation range with the three methods behind it",
      "90-day action plan, phase gates and the grants you qualify for",
      "PDF export + a live share link for investors",
    ],
    unlockFor: (price) => `Unlock for ${price}`,
    confirmNote: "One-off inc. GST. You confirm the exact price and credit cost before anything is charged.",
    includedGenerate: "Included in your plan — generate",
    includedNote: "No charge — your plan carries the full report.",
    openFull: "Open your full report",
    openLegacy: "Open the text version",
    pendingNote: "Usually about four minutes. This page updates itself — you can also leave and come back; the report is saved to your account.",
    lockedNote: "Full analysis, evidence table and criterion cards are in the full Trusted Business Report.",
  },
  order: {
    downloadDocx: "Download DOCX",
    generated: (date) => `generated ${date}`,
    paid: (amount) => `Paid ${amount}`,
    redeemed: (credits) => `Redeemed ${credits} credits`,
    availableUntil: (date) => `available until ${date}`,
    openInWorkspace: "Open this report in your workspace (share link, TOC, Q&A) →",
    legacyText: (words) => `Legacy text version (${words.toLocaleString("en-AU")} words)`,
    pendingTitle: "Writing your Trusted Business Report",
    pendingAria: "Report generation in progress",
    pendingLeave: "You can leave this page — the report is saved to your account and this link keeps working for 90 days.",
    blockedRefunded: "This order was refunded",
    blockedUnavailable: "This report is not available",
    reference: (ref) => `Reference: ${ref}`,
    backToDashboard: "Back to dashboard",
    loading: "Loading your report…",
    generatingStrip: "Your paid report is being written by the C-Level agent team — usually about four minutes. Below is your current snapshot; this page swaps in the full document automatically.",
    legacyStrip: "This order was generated before the chapter format existed. Every chapter is unlocked here; the original text version is one click away.",
    paidBadge: "Paid report",
  },
  adapter: {
    thesisStrong: (svi, above70) => `SVI ${svi} — investor-ready: ${above70} of 8 dimensions are in the strong band.`,
    thesisDeveloping: (svi, gaps) => `SVI ${svi} — developing: ${gaps} dimensions need evidence before a raise.`,
    thesisEarly: (svi) => `SVI ${svi} — early: build evidence on the highest-weight gaps first.`,
    thesisPending: "No dimension has been scored yet — run the analysis to populate this report.",
    worthLine: (low, high, sector, stage) => `Directional A$${low}–${high} pre-money (${sector}, ${stage}); not a formal valuation.`,
    sectorNeutral: "sector-neutral",
    startup: "startup",
    nextLine: (action, lift, dim) => `${action} — +${lift} SVI on ${dim}.`,
    addEvidence: "Add evidence",
    nextFallback: "Keep the evidence fresh: reconnect data sources before the next investor conversation.",
    whereLine: (industry, svi, band, phase, pct) => `${industry} at SVI ${svi} (${band}); phase ${phase}, ${pct}% of the gate cleared.`,
    phaseFloor: (phase, dim, floor, met, score) => `${phase}: ${dim} floor ${floor} — ${met ? "met" : "not met"} at ${score}.`,
    phaseNoFloor: (phase, dim, nextGate) => `${phase}: no ${dim} floor at this phase; next gate is ${nextGate}.`,
    lastPhase: "the last phase",
    method:
      "Scores come from the BlockID Startup Value Index (8 weighted dimensions, 13 evaluation criteria). Benchmarks are stage p25/p50/p75 bands from AU startup research; a sector cohort replaces them when N ≥ 30. Visuals are deterministic renders of the numbers in this document. Chapters built by the read-time adapter carry no evidence register — connect Stripe, Xero, GA4, GitHub or upload documents to make them evidenced.",
    disclaimer: "General information only, not financial, legal or investment advice. The valuation range is directional and is not a formal valuation.",
  },
  survey: {
    question: "Was this report clear and useful?",
    hint: "One tap — it helps us make every report clearer.",
    low: "Not at all",
    high: "Extremely",
    commentPlaceholder: "What would make it clearer? (optional)",
    submit: "Send",
    dismiss: "Not now",
    thanks: "Thank you — your answer shapes the next version of this report.",
    ariaScore: (n) => `Score ${n} of 10`,
  },
  s44: {
    currentValue: "Current value",
    preMoney: "pre-money, directional",
    valuationPending: "Valuation pending — add revenue or team evidence",
    valuationConfidence: (pct) => `confidence ${pct}%`,
    sviTotal: (n) => `SVI ${n}`,
    source: {
      self_declared: "self-declared",
      public_url: "public URL",
      document_uploaded: "document",
      connected_source: "connected source",
      transaction_data: "transaction data",
      third_party_verified: "third-party verified",
      audit: "audit",
      penalty: "penalty",
      stage: "stage",
      stripe: "Stripe",
      ga4: "GA4",
      github: "GitHub",
      xero: "Xero",
      linkedin: "LinkedIn",
      upload: "document",
      url: "public URL",
      founder_profile: "founder profile",
      connector_other: "connector",
      external: "external register",
      none: "no citation",
    },
    evidenceConfidence: (pct) => `evidence confidence ${pct}%`,
    floorMet: (floor) => `floor ${floor} ✓`,
    floorNotMet: (floor) => `floor ${floor} ✗`,
    noFloor: "no floor",
    floorsRow: (phase) => `Dimension floors at ${phase}`,
    fullCardIn: (chapter) => `Full card in ${chapter} →`,
    dashboard: {
      title: "Executive synthesis",
      where: "Where",
      worth: "Worth",
      strengths: "Top strengths",
      weaknesses: "Top weaknesses",
      followUps: "Follow-ups",
      dataToAdd: "Data to add",
      lift: (n) => `+${n} SVI`,
      day: (d) => `day ${d}`,
      openReport: "Open the full report",
      fromReport: (date) => `From your report of ${date}`,
      nothingYet: "Nothing to show here yet.",
    },
  },
  s47: {
    keyInsight: "Key insight",
    whyBack: "Why back this startup",
    whatMustChange: "What must change",
    benchmarks: "Stage benchmarks",
    whereYouAre: "Where you are",
    blocker: "Blocker",
    whatItTakes: "What it takes",
    verdict: "Verdict",
    verdictLabel: { back: "Back", back_with_conditions: "Back with conditions", watch: "Watch", not_yet: "Not yet" },
    confidence: (pct) => `confidence ${pct}%`,
    condition: "Condition",
    actions: "Recommended actions",
    lift: (n) => `+${n} SVI`,
    openChapter: (title) => `Open the ${title} chapter`,
    noCondition: "No condition attached.",
    headlineFallback: (name, svi, band) => `${name}: SVI ${svi}, ${band} for its stage`,
    headlinePending: (name) => `${name}: evidence still pending`,
    worthParagraph: (low, high, pct) => `The consensus valuation sits between ${low} and ${high} (confidence ${pct}%), from the applicable methods weighed in the Valuation chapter.`,
    worthPending: "A valuation range is pending — revenue or team evidence would let the applicable methods run.",
    phaseParagraph: (phase, pct, next) => `The startup is in the ${phase} phase with ${pct}% of the exit gate cleared${next ? `; the next phase is ${next}` : ""}.`,
    noBlocker: "No blocker on the current gate.",
    takesFallback: (action) => `Clearing the gate starts with: ${action}.`,
    reasonTitle: (dimTitle) => `${dimTitle} is a strength`,
    gapTitle: (dimTitle) => `${dimTitle} below benchmark`,
    conditionFallback: (action) => `Subject to: ${action}.`,
    actionDetail: (owner, lift) => `Owner ${owner} · expected lift +${lift} SVI`,
    purpose: {
      cover: "The three answers an evaluator needs first: where the startup is, what it is worth, what comes next.",
      executive: "The CEO agent's synthesis of every chapter: the case for backing, the gaps, the verdict and the next moves.",
      dimension: (weight) => `One of the eight SVI dimensions (${weight}% of the index) — score ledger, evidence, criterion cards, next action.`,
      valuation: "The methods that apply at this stage, their inputs and how the consensus range was reached.",
      phaseGates: "The 13 criteria against the 12 growth phases — what the current gate requires and what is still open.",
      money: "Grants and programs matched to the saved funding profile, with fit and deadlines.",
      actionPlan: "The 90-day plan the chapters agree on, ordered by expected lift.",
      appendix: "Method, data principle, the evidence register and the auditor log behind every claim.",
    },
  },
};

const v2Vi: TbrV2Strings = {
  band: { strong: "Mạnh", developing: "Đang phát triển", early: "Sớm", pending: "Chưa đánh giá" },
  state: { real: "dữ liệu thực", partial: "dữ liệu một phần", benchmark_only: "chỉ chuẩn tham chiếu", target: "mục tiêu, chưa thực tế" },
  audit: {
    auditor: "Kiểm định",
    grounded: "có căn cứ",
    notAudited: "chưa có trích dẫn trong chương này",
    uncited: (n) => `${n} chưa trích dẫn`,
    revised: "đã hiệu chỉnh",
    frameworks: "Khung phân tích",
  },
  chapter: {
    per100: "/100",
    weight: (w) => `trọng số ${w}`,
    owner: "phụ trách",
    benchmarks: (p25, p50, p75) => `Giai đoạn p25 ${p25} · p50 ${p50} · p75 ${p75}`,
    youPercentile: (p) => `bạn: phân vị ${p}`,
    evidence: "Bằng chứng",
    noEvidence: "Chưa có dòng bằng chứng nào trong bản chụp này — kết nối nguồn dữ liệu hoặc tải tài liệu lên để chương này có căn cứ.",
    strengths: "Điểm mạnh",
    gaps: "Khoảng trống",
    next: "Tiếp theo",
    nextAction: (window) => `Hành động tiếp theo (${window})`,
    window: { this_week: "tuần này", "30d": "30 ngày tới", "90d": "90 ngày tới" },
    expectedLift: (n) => `kỳ vọng tăng +${n} SVI`,
    evidenceToAdd: (what) => `bằng chứng: ${what}`,
    unlockChapter: (title) => `Mở khoá toàn bộ chương ${title}`,
    grounded: "có căn cứ",
    uncited: "chưa trích dẫn",
  },
  executive: {
    confidence: (pct) => `độ tin cậy ${pct}%`,
    topStrengths: "Điểm mạnh nổi bật",
    topGaps: "Khoảng trống lớn nhất",
    phaseLine: (now, next, pct) => `Giai đoạn hiện tại: ${now} → cổng tiếp theo: ${next} · đã qua ${pct}%`,
    finalPhase: "giai đoạn cuối",
    noBlockers: "Không có điểm nghẽn ở cổng hiện tại.",
  },
  cover: {
    deltaVsLast: (signed) => `${signed} so với bản chụp trước`,
    phase: "Giai đoạn",
    demoData: "dữ liệu mẫu",
    builtFromSnapshot: "dựng từ bản chụp đã lưu",
    thDimension: "Khía cạnh",
    thOwner: "Phụ trách",
    thWeight: "TS",
    thScore: "Điểm",
    thP50: "p50",
    thPctl: "Phân vị",
  },
  phaseGates: {
    currentPhase: (label) => `Giai đoạn hiện tại: ${label}`,
    requiredCriteria: (label) => `Tiêu chí bắt buộc cho ${label}`,
    met: "✓ đạt",
    notMet: "✗ chưa đạt",
  },
  money: {
    matched: (n, total) => `${n} phù hợp · tổng ${total}`,
    grant: "tài trợ",
    program: "chương trình",
    fit: (n) => `phù hợp ${n}`,
  },
  actionPlan: {
    steps: (n, days) => `${n} bước · ${days} ngày`,
    dayRange: (from, to) => `Ngày ${from}–${to}`,
    lift: (n) => `+${n} SVI`,
    empty: "Mọi khía cạnh đã chấm đều ở nhóm mạnh — hãy giữ bằng chứng luôn mới trước vòng gọi vốn tiếp theo.",
  },
  appendix: {
    quality: (score, groundedPct) => `chất lượng ${score}/100 · có căn cứ ${groundedPct}%`,
    degraded: (list) => `suy giảm: ${list}`,
    method: "Phương pháp",
    evidenceRegister: "Sổ bằng chứng",
    noEvidence: "Chưa có dòng bằng chứng nào gắn với tài liệu này. Kết nối Stripe, Xero, GA4 hoặc GitHub, hoặc tải tài liệu lên để lấp sổ bằng chứng.",
    dataPrinciple: "Nguyên tắc dữ liệu",
    sources: "Nguồn",
    comparables: (n, withMultiples) => `So sánh Úc: ${n} vòng gọi vốn được theo dõi, ${withMultiples} có công bố hệ số.`,
    auditorLog: "Nhật ký kiểm định",
    grounded: "có căn cứ",
    uncited: (n) => `${n} chưa trích dẫn`,
    revised: "đã hiệu chỉnh",
    skipped: (reason) => `bỏ qua: ${reason}`,
  },
  rail: {
    ariaLabel: "Mở khoá báo cáo đầy đủ",
    headlineBuy: (price) => `Mở khoá Báo cáo Kinh doanh Tin cậy đầy đủ — ${price} (một lần)`,
    headlineIncluded: "Báo cáo Kinh doanh Tin cậy đầy đủ đã có trong gói của bạn",
    headlinePurchased: "Báo cáo Kinh doanh Tin cậy đầy đủ của bạn đã sẵn sàng",
    headlinePending: "Báo cáo Kinh doanh Tin cậy đầy đủ của bạn đang được viết",
    perks: (n) => [
      `Toàn bộ ${n} chương khía cạnh — bảng bằng chứng, thẻ tiêu chí, hành động tiếp theo`,
      "Khoảng định giá cùng ba phương pháp phía sau",
      "Kế hoạch hành động 90 ngày, cổng giai đoạn và các khoản tài trợ bạn đủ điều kiện",
      "Xuất PDF + đường dẫn chia sẻ trực tiếp cho nhà đầu tư",
    ],
    unlockFor: (price) => `Mở khoá với ${price}`,
    confirmNote: "Thanh toán một lần, đã gồm GST. Bạn xác nhận giá và số credit chính xác trước khi bị tính phí.",
    includedGenerate: "Đã có trong gói — tạo báo cáo",
    includedNote: "Không tính phí — gói của bạn bao gồm báo cáo đầy đủ.",
    openFull: "Mở báo cáo đầy đủ",
    openLegacy: "Mở bản văn bản",
    pendingNote: "Thường mất khoảng bốn phút. Trang này tự cập nhật — bạn có thể rời đi và quay lại; báo cáo được lưu vào tài khoản.",
    lockedNote: "Phân tích đầy đủ, bảng bằng chứng và thẻ tiêu chí nằm trong Báo cáo Kinh doanh Tin cậy đầy đủ.",
  },
  order: {
    downloadDocx: "Tải DOCX",
    generated: (date) => `tạo ngày ${date}`,
    paid: (amount) => `Đã thanh toán ${amount}`,
    redeemed: (credits) => `Đã dùng ${credits} credit`,
    availableUntil: (date) => `khả dụng đến ${date}`,
    openInWorkspace: "Mở báo cáo này trong không gian làm việc (chia sẻ, mục lục, hỏi đáp) →",
    legacyText: (words) => `Bản văn bản cũ (${words.toLocaleString("vi-VN")} từ)`,
    pendingTitle: "Đang viết Báo cáo Kinh doanh Tin cậy của bạn",
    pendingAria: "Đang tạo báo cáo",
    pendingLeave: "Bạn có thể rời trang — báo cáo được lưu vào tài khoản và đường dẫn này còn hiệu lực 90 ngày.",
    blockedRefunded: "Đơn hàng này đã được hoàn tiền",
    blockedUnavailable: "Báo cáo này không khả dụng",
    reference: (ref) => `Mã tham chiếu: ${ref}`,
    backToDashboard: "Về bảng điều khiển",
    loading: "Đang tải báo cáo của bạn…",
    generatingStrip: "Báo cáo trả phí của bạn đang được đội ngũ agent C-Level viết — thường mất khoảng bốn phút. Bên dưới là bản chụp hiện tại; trang này sẽ tự thay bằng tài liệu đầy đủ.",
    legacyStrip: "Đơn hàng này được tạo trước khi có định dạng theo chương. Mọi chương đều đã mở khoá ở đây; bản văn bản gốc chỉ cách một cú nhấp.",
    paidBadge: "Báo cáo trả phí",
  },
  adapter: {
    thesisStrong: (svi, above70) => `SVI ${svi} — sẵn sàng gọi vốn: ${above70} trên 8 khía cạnh thuộc nhóm mạnh.`,
    thesisDeveloping: (svi, gaps) => `SVI ${svi} — đang phát triển: ${gaps} khía cạnh cần thêm bằng chứng trước khi gọi vốn.`,
    thesisEarly: (svi) => `SVI ${svi} — giai đoạn sớm: hãy xây bằng chứng cho các khoảng trống có trọng số cao nhất trước.`,
    thesisPending: "Chưa có khía cạnh nào được chấm — hãy chạy phân tích để lấp đầy báo cáo này.",
    worthLine: (low, high, sector, stage) => `Định hướng A$${low}–${high} pre-money (${sector}, ${stage}); không phải định giá chính thức.`,
    sectorNeutral: "không theo ngành",
    startup: "startup",
    nextLine: (action, lift, dim) => `${action} — +${lift} SVI cho ${dim}.`,
    addEvidence: "Bổ sung bằng chứng",
    nextFallback: "Giữ bằng chứng luôn mới: kết nối lại nguồn dữ liệu trước buổi gặp nhà đầu tư tiếp theo.",
    whereLine: (industry, svi, band, phase, pct) => `${industry} ở SVI ${svi} (${band}); giai đoạn ${phase}, đã qua ${pct}% cổng.`,
    phaseFloor: (phase, dim, floor, met, score) => `${phase}: sàn ${dim} là ${floor} — ${met ? "đạt" : "chưa đạt"} ở mức ${score}.`,
    phaseNoFloor: (phase, dim, nextGate) => `${phase}: không có sàn ${dim} ở giai đoạn này; cổng tiếp theo là ${nextGate}.`,
    lastPhase: "giai đoạn cuối",
    method:
      "Điểm số đến từ BlockID Startup Value Index (8 khía cạnh có trọng số, 13 tiêu chí đánh giá). Chuẩn tham chiếu là dải p25/p50/p75 theo giai đoạn từ nghiên cứu startup Úc; nhóm ngành thay thế khi N ≥ 30. Hình ảnh là kết xuất xác định từ các con số trong tài liệu này. Các chương do bộ chuyển đổi lúc đọc dựng nên không có sổ bằng chứng — kết nối Stripe, Xero, GA4, GitHub hoặc tải tài liệu lên để có căn cứ.",
    disclaimer: "Chỉ là thông tin chung, không phải tư vấn tài chính, pháp lý hay đầu tư. Khoảng định giá mang tính định hướng và không phải định giá chính thức.",
  },
  survey: {
    question: "Báo cáo này có rõ ràng và hữu ích không?",
    hint: "Một chạm — giúp chúng tôi làm mọi báo cáo rõ ràng hơn.",
    low: "Không hề",
    high: "Rất rõ",
    commentPlaceholder: "Điều gì sẽ giúp báo cáo rõ hơn? (không bắt buộc)",
    submit: "Gửi",
    dismiss: "Để sau",
    thanks: "Cảm ơn bạn — câu trả lời của bạn định hình phiên bản tiếp theo của báo cáo này.",
    ariaScore: (n) => `Điểm ${n} trên 10`,
  },
  s44: {
    currentValue: "Giá trị hiện tại",
    preMoney: "pre-money, mang tính định hướng",
    valuationPending: "Định giá đang chờ — hãy bổ sung bằng chứng doanh thu hoặc đội ngũ",
    valuationConfidence: (pct) => `độ tin cậy ${pct}%`,
    sviTotal: (n) => `SVI ${n}`,
    source: {
      self_declared: "tự khai báo",
      public_url: "URL công khai",
      document_uploaded: "tài liệu",
      connected_source: "nguồn đã kết nối",
      transaction_data: "dữ liệu giao dịch",
      third_party_verified: "bên thứ ba xác minh",
      audit: "kiểm toán",
      penalty: "điểm trừ",
      stage: "giai đoạn",
      stripe: "Stripe",
      ga4: "GA4",
      github: "GitHub",
      xero: "Xero",
      linkedin: "LinkedIn",
      upload: "tài liệu",
      url: "URL công khai",
      founder_profile: "hồ sơ nhà sáng lập",
      connector_other: "kết nối dữ liệu",
      external: "sổ đăng ký bên ngoài",
      none: "chưa có trích dẫn",
    },
    evidenceConfidence: (pct) => `độ tin cậy bằng chứng ${pct}%`,
    floorMet: (floor) => `sàn ${floor} ✓`,
    floorNotMet: (floor) => `sàn ${floor} ✗`,
    noFloor: "không có sàn",
    floorsRow: (phase) => `Sàn khía cạnh ở giai đoạn ${phase}`,
    fullCardIn: (chapter) => `Thẻ đầy đủ ở chương ${chapter} →`,
    dashboard: {
      title: "Tổng hợp điều hành",
      where: "Đang ở đâu",
      worth: "Đáng giá bao nhiêu",
      strengths: "Điểm mạnh nổi bật",
      weaknesses: "Điểm yếu lớn nhất",
      followUps: "Việc cần làm tiếp",
      dataToAdd: "Dữ liệu cần bổ sung",
      lift: (n) => `+${n} SVI`,
      day: (d) => `ngày ${d}`,
      openReport: "Mở báo cáo đầy đủ",
      fromReport: (date) => `Từ báo cáo ngày ${date}`,
      nothingYet: "Chưa có gì để hiển thị ở đây.",
    },
  },
  s47: {
    keyInsight: "Điểm mấu chốt",
    whyBack: "Vì sao nên đầu tư",
    whatMustChange: "Điều cần thay đổi",
    benchmarks: "Chuẩn theo giai đoạn",
    whereYouAre: "Bạn đang ở đâu",
    blocker: "Rào cản",
    whatItTakes: "Cần gì để vượt qua",
    verdict: "Kết luận",
    verdictLabel: { back: "Nên đầu tư", back_with_conditions: "Đầu tư có điều kiện", watch: "Theo dõi", not_yet: "Chưa đến lúc" },
    confidence: (pct) => `độ tin cậy ${pct}%`,
    condition: "Điều kiện",
    actions: "Hành động đề xuất",
    lift: (n) => `+${n} SVI`,
    openChapter: (title) => `Mở chương ${title}`,
    noCondition: "Không kèm điều kiện.",
    headlineFallback: (name, svi, band) => `${name}: SVI ${svi}, ${band} so với giai đoạn`,
    headlinePending: (name) => `${name}: bằng chứng còn đang chờ`,
    worthParagraph: (low, high, pct) => `Định giá đồng thuận nằm trong khoảng ${low} đến ${high} (độ tin cậy ${pct}%), từ các phương pháp áp dụng được cân nhắc ở chương Định giá.`,
    worthPending: "Khoảng định giá đang chờ — bằng chứng doanh thu hoặc đội ngũ sẽ cho phép các phương pháp áp dụng chạy.",
    phaseParagraph: (phase, pct, next) => `Startup đang ở giai đoạn ${phase}, đã hoàn thành ${pct}% cổng thoát${next ? `; giai đoạn tiếp theo là ${next}` : ""}.`,
    noBlocker: "Không có rào cản ở cổng hiện tại.",
    takesFallback: (action) => `Vượt qua cổng bắt đầu bằng: ${action}.`,
    reasonTitle: (dimTitle) => `${dimTitle} là điểm mạnh`,
    gapTitle: (dimTitle) => `${dimTitle} dưới chuẩn`,
    conditionFallback: (action) => `Với điều kiện: ${action}.`,
    actionDetail: (owner, lift) => `Phụ trách ${owner} · mức nâng kỳ vọng +${lift} SVI`,
    purpose: {
      cover: "Ba câu trả lời nhà đánh giá cần trước tiên: startup đang ở đâu, đáng giá bao nhiêu, bước tiếp theo là gì.",
      executive: "Tổng hợp của tác nhân CEO từ mọi chương: lý do nên đầu tư, khoảng trống, kết luận và những bước tiếp theo.",
      dimension: (weight) => `Một trong tám khía cạnh SVI (${weight}% chỉ số) — sổ cái điểm, bằng chứng, thẻ tiêu chí, hành động tiếp theo.`,
      valuation: "Các phương pháp áp dụng ở giai đoạn này, đầu vào của chúng và cách đạt tới khoảng đồng thuận.",
      phaseGates: "13 tiêu chí đối chiếu 12 giai đoạn tăng trưởng — cổng hiện tại yêu cầu gì và điều gì còn mở.",
      money: "Tài trợ và chương trình khớp với hồ sơ tài trợ đã lưu, kèm độ phù hợp và hạn chót.",
      actionPlan: "Kế hoạch 90 ngày mà các chương thống nhất, xếp theo mức nâng kỳ vọng.",
      appendix: "Phương pháp, nguyên tắc dữ liệu, sổ đăng ký bằng chứng và nhật ký kiểm toán đằng sau mọi nhận định.",
    },
  },
};

// ES / JA reuse the English ReportV2 labels until a translation lands (the
// shell strings above are translated; key parity is what the test enforces).
const v2Es: TbrV2Strings = v2En;
const v2Ja: TbrV2Strings = v2En;

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
  switchToEs: "ES",
  switchToJa: "JA",

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
  secCover: "Cover — Where / Worth / Next",
  secPhaseGates: "Phase Gates — 13 Criteria × 12 Phases",
  secMoney: "Money on the Table — Grants & Programs",
  secActionPlan: "90-Day Action Plan",
  secAppendix: "Appendix — Method, Evidence & Auditor Log",

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
    "Re-run the pitchdeck analysis (Wave 24+) to generate the full 8-dimension SVI breakdown. This section requires the latest analysis version.",
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
  methHeaderCriteria: "Investor Evaluation Signals (internal mapping)",
  methBodyCriteria:
    "Each signal maps to one primary SVI dimension and optionally one or more secondary dimensions. Internal signals cover: Idea & Innovation, Market Opportunity, Founder Profile, Code & Git Repository, Website & Digital Presence, Team Composition, Customer Base & Traction, Go-to-Market Strategy, Key Documents, Data Room, Team Structure & Governance, Product Roadmap, and Revenue & Unit Economics — the customer-facing score is always the 8-dimension SVI composite.",
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
  ledger: ledgerEn,
  v2: v2En,
};

const vi: TbrStrings = {
  reportTitle: "Báo cáo Kinh doanh Tin cậy",
  brandBadge: "BlockID SVI™",
  progressXofY: (s, t) => `${s} trên ${t} khía cạnh`,
  completedInSeconds: (sec) => `hoàn thành trong ${sec}s`,
  partialAnalysis: "phân tích một phần",

  shareWithInvestor: "Chia sẻ với Nhà đầu tư",
  sharing: "Đang chia sẻ…",
  downloadPdf: "Tải PDF",
  print: "In",
  shareUrlLabel: "Đường dẫn chia sẻ:",
  copy: "Sao chép",
  copied: "Đã sao chép!",
  clickShareFirst: "Nhấn ‘Chia sẻ với Nhà đầu tư’ trước để bật tải PDF.",
  shareFailed: "Chia sẻ thất bại",
  languageToggleAria: "Chuyển ngôn ngữ báo cáo",
  switchToVi: "VI",
  switchToEn: "EN",
  switchToEs: "ES",
  switchToJa: "JA",

  bandStrong: "Sẵn sàng cho Nhà đầu tư",
  bandDeveloping: "Đang phát triển",
  bandEarly: "Giai đoạn sớm",

  verdictStrong: (svi, above70) =>
    `Doanh nghiệp đạt ${svi}/100 trên BlockID Startup Value Index — thuộc nhóm sẵn sàng gọi vốn. Phân tích xác định ${above70} khía cạnh vượt ngưỡng 70 điểm với bằng chứng vững chắc.`,
  verdictDeveloping: (svi, riskCount) =>
    `Doanh nghiệp đạt ${svi}/100 trên BlockID Startup Value Index — đang phát triển, còn nhiều khoảng trống cần lấp trước Series A hoặc vòng angel lớn. ${riskCount} khía cạnh được đánh dấu là ưu tiên cao.`,
  verdictEarly: (svi) =>
    `Doanh nghiệp đạt ${svi}/100 trên BlockID Startup Value Index — giai đoạn sớm, cho thấy thiếu bằng chứng đáng kể làm hạn chế khả năng gọi vốn hiện tại. Nên thu thập bằng chứng cụ thể trước khi tiếp cận nhà đầu tư.`,

  secExecutive: "Tóm tắt Điều hành",
  secSvi: "SVI Doanh nghiệp — Điểm trọng số chi tiết",
  secValuation: "Định giá Pre-Money (Định hướng)",
  secCriteria: "Đánh giá đầy đủ 13 tiêu chí Chuyên gia",
  secRisk: "Sổ Rủi ro",
  secRoadmap: "Lộ trình Cải thiện",
  secCohort: "So sánh Nhóm — Benchmark AU Seed",
  secMethodology: "Phương pháp & Phụ lục",
  secCover: "Trang bìa — Ở đâu / Giá trị / Tiếp theo",
  secPhaseGates: "Cổng giai đoạn — 13 tiêu chí × 12 giai đoạn",
  secMoney: "Tiền trên bàn — Tài trợ & Chương trình",
  secActionPlan: "Kế hoạch hành động 90 ngày",
  secAppendix: "Phụ lục — Phương pháp, Bằng chứng & Nhật ký kiểm định",

  tocOverview: "Tổng quan",
  tocDimensions: "8 Khía cạnh",
  tocAnalysis: "Phân tích",
  tocContents: "Mục lục",

  thDimension: "Khía cạnh",
  thWeight: "Trọng số",
  thScore: "Điểm",
  thPriority: "Ưu tiên",
  thContribution: "Đóng góp",
  thThisStartup: "Startup này",
  thAuSeedMedian: "Trung vị AU Seed",
  thAuTopQuartile: "Nhóm đầu AU",
  thVsMedian: "So với Trung vị",
  rowTotalSvi: "Tổng SVI",
  rowCompositeSvi: "SVI Tổng hợp",

  chipWeightOfSvi: (w) => `${w}% trên tổng SVI`,
  chipHighPriority: "ưu tiên cao",
  chipMediumPriority: "ưu tiên trung bình",
  chipLowPriority: "ưu tiên thấp",
  chipAuBenchmark: "Benchmark thị trường AU",

  criteriaIntro:
    "Đánh giá chi tiết trên 13 tiêu chí của nhà đầu tư — được suy ra từ 8 khía cạnh SVI ở trên. Mỗi tiêu chí ánh xạ vào một khía cạnh SVI chính và góp vào điểm tổng hợp.",
  criteriaStrengths: "Điểm mạnh",
  criteriaGaps: "Khoảng trống",
  criteriaNextAction: "Hành động tiếp theo (tuần này)",
  criteriaMissingTitle: "Chưa có tổng hợp tiêu chí",
  criteriaMissingBody:
    "Chạy lại phân tích pitchdeck (Wave 24+) để sinh đầy đủ 13 tiêu chí. Mục này yêu cầu phiên bản phân tích mới nhất.",
  criteriaReanalyse: "Phân tích lại ngay",
  chipWeightAndDim: (w, dim) => `${w}% trọng số · ${dim.toUpperCase()}`,

  riskIntro:
    "Các khía cạnh mang rủi ro đầu tư cao nhất — sắp xếp theo tác động × khoảng trống.",
  riskDrag: (w, drag) => `${w}% trọng số · ước ${drag} điểm kéo giảm SVI`,

  roadmapIntro: (n) =>
    `Top ${n} hành động sắp xếp theo điểm SVI kỳ vọng tăng (trọng số × khoảng cách đến ngưỡng 70 điểm).`,
  roadmapLift: (pts) => `+${pts} điểm tiềm năng`,
  roadmapMeta: (score, weight) =>
    `Hiện tại: ${score}/100 · Mục tiêu: 70+ · ${weight}% trọng số`,
  roadmapAddEvidence: (section) => `Bổ sung bằng chứng cho ${section}`,

  cohortIntro:
    "So sánh startup với nhóm seed Úc theo band SVI, dựa trên dữ liệu BlockID Index ẩn danh (PitchBook AU 2024–2026 seed cohort).",
  cohortFootnote: (industry, stage) =>
    `Benchmark từ dữ liệu BlockID ẩn danh + PitchBook AU 2024–2026 (seed). Ngành: ${industry} · Giai đoạn: ${stage}. Đây là so sánh định hướng — mỗi startup có đặc điểm khác nhau.`,

  methHeaderSvi: "BlockID Startup Value Index™ (SVI)",
  methBodySvi:
    "SVI là điểm tổng hợp 0–100 trên 8 khía cạnh có trọng số. Đây KHÔNG phải là định giá — đây là chỉ số sẵn sàng, giúp phát hiện khoảng trống bằng chứng. Điểm trên 70 thể hiện bằng chứng sẵn sàng cho nhà đầu tư; 40–69 là đang phát triển với bước tiếp theo rõ ràng; dưới 40 là giai đoạn sớm với nhiều khoảng trống cần lấp trước khi gọi vốn.",
  methHeaderDims: "8 khía cạnh SVI (tổng 100% trọng số)",
  methHeaderCriteria: "13 tiêu chí đánh giá của nhà đầu tư",
  methBodyCriteria:
    "Mỗi tiêu chí ánh xạ một khía cạnh SVI chính và tuỳ chọn nhiều khía cạnh phụ. 13 tiêu chí bao gồm: Ý tưởng & Đổi mới, Cơ hội thị trường, Hồ sơ Sáng lập, Mã nguồn & Git, Website & Hiện diện số, Đội ngũ, Khách hàng & Traction, Chiến lược GTM, Tài liệu, Data Room, Cấu trúc & Quản trị, Roadmap sản phẩm, Doanh thu & Unit Economics.",
  methHeaderValuation: "Phương pháp Định giá",
  methBodyValuation:
    "Định giá pre-money được tính bằng một trong bốn phương pháp, chọn tự động theo giai đoạn và traction: Berkus (chưa doanh thu, cap A$2.5M), Scorecard (trung vị vòng angel × hệ số SVI), So sánh giao dịch (comps AU seed/Series A từ PitchBook 2024–2026), hoặc DCF (dòng tiền tự do 10 năm với giá trị cuối kỳ). Ba kịch bản (thấp/trung/cao) áp dụng dải ±20%. Đây là ước lượng định hướng, không phải định giá chính thức.",
  methHeaderAi: "Phân tích AI",
  methBodyAi:
    "Toàn bộ phân tích được sinh bởi BlockID Analyst Desk — chuỗi AI chuyên biệt (Groq/SambaNova/Cerebras/Claude) dựa trên văn bản pitchdeck của nhà sáng lập. Mỗi agent phải trích dẫn đoạn pitchdeck làm bằng chứng và nói rõ khi thông tin thiếu. Điểm mặc định 30–45 khi deck không đề cập. Báo cáo có AI hỗ trợ, không phải audit due-diligence chính thức hay khuyến nghị đầu tư.",
  methFooter: (dateStr) =>
    `BlockID.au · Startup Value Index™ · Báo cáo tạo ngày ${dateStr} · Dùng cho nội bộ nhà sáng lập và chia sẻ với nhà đầu tư. Không phát hành công khai nếu chưa có sự đồng ý của nhà sáng lập.`,

  noAnalysisTitle: "Không tìm thấy phân tích gần đây",
  noAnalysisBody:
    "Hãy chạy phân tích đầy đủ 8 khía cạnh SVI trước — kết quả lưu 30 phút.",
  noAnalysisCta: "Phân tích pitchdeck của tôi",
  scoresMissingBody:
    "Phân tích đã lưu cache nhưng không có điểm. Hãy chạy lại phân tích khía cạnh.",
  scoresMissingCta: "Tới trang Phân tích Pitchdeck →",

  footerDisclaimer:
    "BlockID Startup Value Index™ — Phân tích có AI hỗ trợ. Không phải định giá chính thức hay khuyến nghị đầu tư.",
  footerReanalyse: "Phân tích lại →",

  execHeroPer100: "/ 100",
  ledger: ledgerVi,
  v2: v2Vi,
};

// ── Spanish (ES) ─────────────────────────────────────────────────────────────
// Investor-facing register, formal Spanish (usted). Technical terms like SVI,
// TBR, seed, Series A, Berkus, DCF stay in English as they are the lingua
// franca of the venture-capital community across LATAM and Spain.

const es: TbrStrings = {
  reportTitle: "Informe de Negocio de Confianza",
  brandBadge: "BlockID SVI™",
  progressXofY: (s, t) => `${s} de ${t} dimensiones`,
  completedInSeconds: (sec) => `completado en ${sec}s`,
  partialAnalysis: "análisis parcial",

  shareWithInvestor: "Compartir con el Inversor",
  sharing: "Compartiendo…",
  downloadPdf: "Descargar PDF",
  print: "Imprimir",
  shareUrlLabel: "Enlace para compartir:",
  copy: "Copiar",
  copied: "¡Copiado!",
  clickShareFirst: "Pulse ‘Compartir con el Inversor’ primero para habilitar la descarga del PDF.",
  shareFailed: "Error al compartir",
  languageToggleAria: "Cambiar el idioma del informe",
  switchToVi: "VI",
  switchToEn: "EN",
  switchToEs: "ES",
  switchToJa: "JA",

  bandStrong: "Listo para Inversores",
  bandDeveloping: "En Desarrollo",
  bandEarly: "Etapa Temprana",

  verdictStrong: (svi, above70) =>
    `Este negocio obtiene ${svi}/100 en el BlockID Startup Value Index — situándose en territorio listo para inversores. El análisis identificó ${above70} dimensiones por encima del umbral de 70 puntos con evidencia sólida.`,
  verdictDeveloping: (svi, riskCount) =>
    `Este negocio obtiene ${svi}/100 en el BlockID Startup Value Index — en desarrollo, con brechas relevantes que cerrar antes de una Series A o de una ronda angel significativa. ${riskCount} dimensión${riskCount !== 1 ? "es" : ""} marcada${riskCount !== 1 ? "s" : ""} como foco de alta prioridad.`,
  verdictEarly: (svi) =>
    `Este negocio obtiene ${svi}/100 en el BlockID Startup Value Index — etapa temprana, con brechas de evidencia significativas que limitarán las opciones de captación de capital en este momento. Se recomiendan acciones concretas de construcción de evidencia antes de acercarse a los inversores.`,

  secExecutive: "Resumen Ejecutivo",
  secSvi: "SVI del Negocio — Desglose Ponderado",
  secValuation: "Valoración Pre-Money Orientativa",
  secCriteria: "Evaluación Completa de 13 Criterios del Analista",
  secRisk: "Registro de Riesgos",
  secRoadmap: "Hoja de Ruta de Mejora",
  secCohort: "Comparación de Cohorte — Benchmarks Seed AU",
  secMethodology: "Metodología y Anexo",
  secCover: "Portada — Dónde / Valor / Siguiente",
  secPhaseGates: "Puertas de fase — 13 criterios × 12 fases",
  secMoney: "Dinero sobre la mesa — Subvenciones y programas",
  secActionPlan: "Plan de acción de 90 días",
  secAppendix: "Anexo — Método, evidencia y registro del auditor",

  tocOverview: "Visión General",
  tocDimensions: "8 Dimensiones",
  tocAnalysis: "Análisis",
  tocContents: "Índice",

  thDimension: "Dimensión",
  thWeight: "Peso",
  thScore: "Puntuación",
  thPriority: "Prioridad",
  thContribution: "Contribución",
  thThisStartup: "Esta Startup",
  thAuSeedMedian: "Mediana Seed AU",
  thAuTopQuartile: "Cuartil Superior AU",
  thVsMedian: "vs Mediana",
  rowTotalSvi: "SVI Total",
  rowCompositeSvi: "SVI Compuesto",

  chipWeightOfSvi: (w) => `${w}% del SVI total`,
  chipHighPriority: "prioridad alta",
  chipMediumPriority: "prioridad media",
  chipLowPriority: "prioridad baja",
  chipAuBenchmark: "Benchmark del Mercado AU",

  criteriaIntro:
    "Evaluación detallada sobre los 13 criterios de análisis de inversores — derivada del análisis de las 8 dimensiones SVI anteriores. Cada criterio se asigna a una dimensión SVI primaria y aporta a la puntuación compuesta.",
  criteriaStrengths: "Fortalezas",
  criteriaGaps: "Brechas",
  criteriaNextAction: "Próxima Acción (Esta Semana)",
  criteriaMissingTitle: "Síntesis de criterios aún no disponible",
  criteriaMissingBody:
    "Vuelva a ejecutar el análisis del pitchdeck (Wave 24+) para generar el desglose completo de 13 criterios. Esta sección requiere la versión más reciente del análisis.",
  criteriaReanalyse: "Reanalizar ahora",
  chipWeightAndDim: (w, dim) => `${w}% de peso · ${dim.toUpperCase()}`,

  riskIntro:
    "Dimensiones que representan el mayor riesgo de inversión — ordenadas por impacto × brecha.",
  riskDrag: (w, drag) => `${w}% de peso · lastre estimado de ${drag} pts sobre el SVI total`,

  roadmapIntro: (n) =>
    `Las ${n} acciones principales ordenadas por incremento esperado del SVI (peso × brecha hasta el umbral de 70 puntos).`,
  roadmapLift: (pts) => `+${pts} pts de mejora potencial`,
  roadmapMeta: (score, weight) =>
    `Actual: ${score}/100 · Objetivo: 70+ · ${weight}% de peso`,
  roadmapAddEvidence: (section) => `Añadir evidencia para ${section}`,

  cohortIntro:
    "Cómo se compara esta startup con sus pares seed australianos por banda SVI, basado en datos anonimizados de BlockID Index (cohorte seed PitchBook AU 2024–2026).",
  cohortFootnote: (industry, stage) =>
    `Benchmarks obtenidos de datos anonimizados de la cohorte BlockID + análisis seed PitchBook AU 2024–2026. Sector: ${industry} · Etapa: ${stage}. Se trata de una comparación orientativa — los perfiles individuales de cada startup varían significativamente.`,

  methHeaderSvi: "BlockID Startup Value Index™ (SVI)",
  methBodySvi:
    "El SVI es una puntuación compuesta de 0 a 100 calculada sobre 8 dimensiones ponderadas. NO es una valoración — es un índice de preparación diseñado para señalizar la disposición ante inversores y resaltar brechas de evidencia. Puntuaciones por encima de 70 indican evidencia lista para inversores en la mayoría de dimensiones; de 40 a 69 indica una startup en desarrollo con próximos pasos claros; por debajo de 40 indica etapa temprana con brechas significativas que cerrar antes de captar capital.",
  methHeaderDims: "8 Dimensiones SVI (100% de peso total)",
  methHeaderCriteria: "13 Criterios de Evaluación de Inversores",
  methBodyCriteria:
    "Cada criterio se asigna a una dimensión SVI primaria y opcionalmente a una o más dimensiones secundarias. Los 13 criterios abarcan: Idea e Innovación, Oportunidad de Mercado, Perfil del Fundador, Código y Repositorio Git, Sitio Web y Presencia Digital, Composición del Equipo, Base de Clientes y Tracción, Estrategia Go-to-Market, Documentos Clave, Data Room, Estructura del Equipo y Gobernanza, Roadmap de Producto, e Ingresos y Unit Economics.",
  methHeaderValuation: "Métodos de Valoración",
  methBodyValuation:
    "La valoración pre-money se calcula mediante uno de cuatro métodos seleccionados automáticamente según la etapa y la tracción: Método Berkus (pre-ingresos, tope A$2,5M), Método Scorecard (mediana de ronda angel × factor SVI), Transacciones Comparables (comps seed/Series A de AU tomados de PitchBook 2024–2026) o DCF (flujo de caja libre a 10 años con valor terminal). Tres escenarios (peor/promedio/mejor) aplican una banda de ±20%. Es una estimación orientativa, no una valoración formal.",
  methHeaderAi: "Análisis de IA",
  methBodyAi:
    "Todo el análisis se genera desde el BlockID Analyst Desk — una cadena de agentes de IA especializados (Groq/SambaNova/Cerebras/Claude) apoyados en el texto del pitchdeck aportado por el fundador. Cada agente debe citar fragmentos del deck como evidencia y reconocer explícitamente cuando la información está ausente. Las puntuaciones se ajustan a 30–45 por defecto cuando el deck no menciona una dimensión. Este informe está asistido por IA y no constituye una auditoría de due diligence formal ni una recomendación de inversión.",
  methFooter: (dateStr) =>
    `BlockID.au · Startup Value Index™ · Informe generado el ${dateStr} · Uso interno del fundador y para compartir con inversores únicamente. No se autoriza su distribución pública sin el consentimiento del fundador.`,

  noAnalysisTitle: "No se ha encontrado un análisis reciente",
  noAnalysisBody:
    "Ejecute primero un análisis completo de las 8 dimensiones SVI — los resultados están disponibles durante 30 minutos.",
  noAnalysisCta: "Analizar mi pitchdeck",
  scoresMissingBody:
    "Análisis cacheado pero sin puntuaciones. Vuelva a ejecutar el análisis de dimensiones.",
  scoresMissingCta: "Ir al Análisis del Pitchdeck →",

  footerDisclaimer:
    "BlockID Startup Value Index™ — Análisis asistido por IA. No constituye una valoración formal ni asesoramiento de inversión.",
  footerReanalyse: "Reanalizar →",

  execHeroPer100: "/ 100",
  ledger: ledgerEs,
  v2: v2Es,
};

// ── Japanese (JA) ────────────────────────────────────────────────────────────
// Business register with keigo (敬語) when addressing the investor. Loanwords
// (startup, SVI, TBR, pitchdeck, seed, Series A, Berkus, DCF, cohort, etc.)
// stay in katakana or their English form as is standard in the JP VC scene.

const ja: TbrStrings = {
  reportTitle: "信頼できる事業レポート",
  brandBadge: "BlockID SVI™",
  progressXofY: (s, t) => `${t}項目中 ${s} 項目`,
  completedInSeconds: (sec) => `${sec}秒で完了`,
  partialAnalysis: "部分的な分析",

  shareWithInvestor: "投資家と共有",
  sharing: "共有中…",
  downloadPdf: "PDFをダウンロード",
  print: "印刷",
  shareUrlLabel: "共有URL:",
  copy: "コピー",
  copied: "コピーしました!",
  clickShareFirst: "PDFのダウンロードを有効にするには、まず「投資家と共有」を押してください。",
  shareFailed: "共有に失敗しました",
  languageToggleAria: "レポートの言語を切り替える",
  switchToVi: "VI",
  switchToEn: "EN",
  switchToEs: "ES",
  switchToJa: "JA",

  bandStrong: "投資家対応レベル",
  bandDeveloping: "成長段階",
  bandEarly: "アーリーステージ",

  verdictStrong: (svi, above70) =>
    `本事業は BlockID Startup Value Index で ${svi}/100 を獲得し、投資家対応レベルに位置しております。分析では、確かな根拠に基づき ${above70} 項目が70点の基準値を上回りました。`,
  verdictDeveloping: (svi, riskCount) =>
    `本事業は BlockID Startup Value Index で ${svi}/100 を獲得し、成長段階にあります。Series A や本格的なエンジェルラウンドに進む前に埋めるべき重要なギャップが存在します。${riskCount} 項目が優先度の高い注力領域として特定されました。`,
  verdictEarly: (svi) =>
    `本事業は BlockID Startup Value Index で ${svi}/100 を獲得し、アーリーステージにあります。現時点での資金調達の選択肢を制約する重大な根拠不足が見られます。投資家にアプローチする前に、具体的なエビデンス構築の取り組みを推奨いたします。`,

  secExecutive: "エグゼクティブサマリー",
  secSvi: "事業SVI — 加重スコアの内訳",
  secValuation: "参考プレマネー・バリュエーション",
  secCriteria: "13項目 完全アナリスト評価",
  secRisk: "リスク一覧",
  secRoadmap: "改善ロードマップ",
  secCohort: "コホート比較 — AU シード ベンチマーク",
  secMethodology: "方法論と付録",
  secCover: "表紙 — 現在地 / 価値 / 次の一手",
  secPhaseGates: "フェーズゲート — 13基準 × 12フェーズ",
  secMoney: "獲得可能な資金 — 助成金・プログラム",
  secActionPlan: "90日アクションプラン",
  secAppendix: "付録 — 手法・エビデンス・監査ログ",

  tocOverview: "概要",
  tocDimensions: "8つの評価項目",
  tocAnalysis: "分析",
  tocContents: "目次",

  thDimension: "評価項目",
  thWeight: "ウェイト",
  thScore: "スコア",
  thPriority: "優先度",
  thContribution: "寄与度",
  thThisStartup: "本スタートアップ",
  thAuSeedMedian: "AU シード中央値",
  thAuTopQuartile: "AU 上位四分位",
  thVsMedian: "中央値との差",
  rowTotalSvi: "SVI合計",
  rowCompositeSvi: "SVI総合",

  chipWeightOfSvi: (w) => `SVI全体の${w}%`,
  chipHighPriority: "高優先度",
  chipMediumPriority: "中優先度",
  chipLowPriority: "低優先度",
  chipAuBenchmark: "AU市場ベンチマーク",

  criteriaIntro:
    "上記8つのSVI評価項目の分析から導出された、13項目の投資家評価基準にわたる詳細評価です。各基準は主となるSVI項目に紐付き、総合スコアに寄与します。",
  criteriaStrengths: "強み",
  criteriaGaps: "ギャップ",
  criteriaNextAction: "次のアクション(今週)",
  criteriaMissingTitle: "評価基準の統合はまだご利用いただけません",
  criteriaMissingBody:
    "13項目の完全な内訳を生成するには、pitchdeck 分析 (Wave 24+) を再度実行してください。本セクションには最新版の分析が必要です。",
  criteriaReanalyse: "今すぐ再分析",
  chipWeightAndDim: (w, dim) => `ウェイト ${w}% · ${dim.toUpperCase()}`,

  riskIntro:
    "投資リスクが最も高い評価項目 — インパクト × ギャップの順に並び替えています。",
  riskDrag: (w, drag) => `ウェイト ${w}% · SVI合計への影響は推定 ${drag} pt の押し下げ`,

  roadmapIntro: (n) =>
    `期待されるSVI改善幅(ウェイト × 70点基準値までのギャップ)で並べた上位 ${n} 件のアクションです。`,
  roadmapLift: (pts) => `+${pts} pt の改善余地`,
  roadmapMeta: (score, weight) =>
    `現在: ${score}/100 · 目標: 70+ · ウェイト ${weight}%`,
  roadmapAddEvidence: (section) => `${section} の根拠を追加`,

  cohortIntro:
    "本スタートアップがオーストラリアのシード期の同業他社と、SVIバンド別にどう比較されるかを、匿名化された BlockID Index データ (PitchBook AU 2024–2026 シードコホート) に基づいてご確認いただけます。",
  cohortFootnote: (industry, stage) =>
    `ベンチマークは、匿名化された BlockID コホートデータおよび PitchBook AU 2024–2026 シード分析を出典としております。業種: ${industry} · ステージ: ${stage}。これは方向性を示す比較であり、個々のスタートアップのプロフィールは大きく異なる可能性がございます。`,

  methHeaderSvi: "BlockID Startup Value Index™ (SVI)",
  methBodySvi:
    "SVIは8つの加重評価項目にわたって算出される0〜100の総合スコアです。これはバリュエーションではなく、投資家対応の準備度を示し、根拠(エビデンス)のギャップを可視化するための準備度指数として設計されております。70点超は多くの項目で投資家対応レベルの根拠が揃っていることを、40〜69点は次のステップが明確な成長段階を、40点未満は資金調達前に埋めるべき重大なギャップを有するアーリーステージを示します。",
  methHeaderDims: "8つのSVI評価項目 (ウェイト合計 100%)",
  methHeaderCriteria: "13項目の投資家評価基準",
  methBodyCriteria:
    "各基準は1つの主たるSVI評価項目と、任意で1つ以上の副次的な評価項目に紐付きます。13項目は次のとおりです: アイデア&イノベーション、市場機会、ファウンダー・プロファイル、コード&Git リポジトリ、Web サイト&デジタルプレゼンス、チーム構成、顧客基盤&トラクション、Go-to-Market 戦略、主要文書、Data Room、チーム体制&ガバナンス、プロダクト・ロードマップ、および売上&Unit Economics。",
  methHeaderValuation: "バリュエーション手法",
  methBodyValuation:
    "プレマネー・バリュエーションは、ステージとトラクションに応じて自動選択される4つの手法のいずれかで算出いたします: Berkus 法 (プレレベニュー、上限 A$2.5M)、Scorecard 法 (エンジェルラウンド中央値 × SVI 係数)、比較取引法 (PitchBook 2024–2026 の AU シード/Series A コンパラブル)、または DCF (10年間のフリーキャッシュフローと継続価値)。3ケース (下位/平均/上位) に ±20% のバンドを適用します。これは方向性を示す推計であり、正式なバリュエーションではございません。",
  methHeaderAi: "AI 分析",
  methBodyAi:
    "すべての分析は、ファウンダーからご提供いただいた pitchdeck のテキストに基づく専門化された AI エージェントのチェーン (Groq/SambaNova/Cerebras/Claude) — BlockID Analyst Desk により生成されます。各エージェントは根拠として pitchdeck の該当箇所を引用し、情報が欠落している場合は明示的にその旨をお示しする必要があります。デックに言及がない項目のスコアは既定で30〜45となります。本レポートは AI 支援によるものであり、正式なデューデリジェンス監査や投資推奨を構成するものではございません。",
  methFooter: (dateStr) =>
    `BlockID.au · Startup Value Index™ · レポート生成日 ${dateStr} · ファウンダー内部および投資家との共有のみを目的としております。ファウンダーの同意なしに公開配布することはご遠慮ください。`,

  noAnalysisTitle: "最近の分析が見つかりません",
  noAnalysisBody:
    "まずSVIの8項目分析を実行してください — 結果は30分間ご利用いただけます。",
  noAnalysisCta: "自分の pitchdeck を分析する",
  scoresMissingBody:
    "分析はキャッシュされていますが、スコアが見つかりません。項目分析を再実行してください。",
  scoresMissingCta: "Pitchdeck 分析へ移動 →",

  footerDisclaimer:
    "BlockID Startup Value Index™ — AI 支援による分析です。正式なバリュエーションや投資助言ではございません。",
  footerReanalyse: "再分析 →",

  execHeroPer100: "/ 100",
  ledger: ledgerJa,
  v2: v2Ja,
};

export const TBR_STRINGS: Record<TbrLocale, TbrStrings> = { en, vi, es, ja };

export function getTbrStrings(locale: TbrLocale | undefined): TbrStrings {
  if (locale === "vi" || locale === "es" || locale === "ja") return TBR_STRINGS[locale];
  return TBR_STRINGS.en;
}

// ── G19-S42 — ReportV2 valuation chapter (web / PDF / DOCX twins) ───────────
//
// Kept as its own block (EN + VI only, VI with diacritics) so the three
// renderers share one source; S45 folds every ReportV2 label into this file.

export type TbrValuationLocale = "en" | "vi";

export interface TbrValuationStrings {
  confidence: (pct: number) => string;
  low: string;
  consensus: string;
  high: string;
  pending: string;
  // Inputs & assumptions
  inputsTitle: string;
  thInput: string;
  thValue: string;
  thSource: string;
  inMrr: string;
  inArr: string;
  inGrowth: string;
  inGrowthAssumedValue: (pct: number) => string;
  inEsic: string;
  inRdti: string;
  inBerkus: string;
  inStage: string;
  inSector: string;
  inSectorMultiples: string;
  inRaise: string;
  raiseNotStated: string;
  yes: string;
  no: string;
  notProvided: string;
  pillar: Record<"soundIdea" | "prototype" | "qualityTeam" | "strategicRelationships" | "productRollout", string>;
  source: Record<"connector" | "document" | "founder_stated" | "assumed" | "none" | "benchmark" | "model", string>;
  // Method table
  methodsTitle: string;
  thMethod: string;
  thWeight: string;
  thRationale: string;
  thDerivation: string;
  method: Record<"revenue_multiple" | "berkus" | "dcf_proxy" | "comparables" | "risk_factor_summation" | "scorecard" | "stage_baseline", string>;
  needRevenue: (n: number) => string;
  connectorsCta: string;
  noneApplicable: string;
  // Unit economics
  unitEconomicsTitle: string;
  ue: Record<"cacAud" | "ltvAud" | "ltvCacRatio" | "grossMarginPct" | "ruleOf40" | "cacPaybackMonths" | "verdict", string>;
  ueVerdict: Record<"strong" | "healthy" | "watch" | "weak", string>;
  // Cross-checks / notes / ask
  crossChecksTitle: string;
  nLabel: (n: number) => string;
  asOf: (d: string) => string;
  consistencyTitle: string;
  scenarios: string;
  scenarioLine: (bear: string, base: string, bull: string) => string;
  askLine: (pre: string, raise: string, verdict: string, gap: string) => string;
  askVerdict: Record<"aligned" | "above_consensus" | "below_consensus", string>;
  sectorMultiplesTitle: (sector: string) => string;
  sectorMultiplesLine: (low: number, median: number, high: number, label: string, date: string) => string;
  comparablesLine: (n: number, withMultiples: number, date: string) => string;
}

const valuationEn: TbrValuationStrings = {
  confidence: (pct) => `consensus confidence ${pct}%`,
  low: "Low",
  consensus: "Consensus",
  high: "High",
  pending: "The indicative valuation is computed from the 8 scored dimensions. Run the analysis first — the range, methods and comparables appear here once at least one dimension is scored.",
  inputsTitle: "Inputs & assumptions",
  thInput: "Input",
  thValue: "Value",
  thSource: "Source",
  inMrr: "MRR",
  inArr: "ARR",
  inGrowth: "Monthly growth",
  inGrowthAssumedValue: (pct) => `${pct}% / month (sector median)`,
  inEsic: "ESIC qualifies",
  inRdti: "R&D Tax Incentive refund (est.)",
  inBerkus: "Berkus pillars evidenced",
  inStage: "Stage",
  inSector: "Sector",
  inSectorMultiples: "Sector ARR multiples (p25 / p50 / p75)",
  inRaise: "Raise",
  raiseNotStated: "not stated — no ask modelled",
  yes: "yes",
  no: "no",
  notProvided: "not provided",
  pillar: { soundIdea: "sound idea", prototype: "prototype", qualityTeam: "quality team", strategicRelationships: "strategic relationships", productRollout: "product roll-out" },
  source: { connector: "connector", document: "document", founder_stated: "founder-stated", assumed: "assumed", none: "none", benchmark: "benchmark", model: "model" },
  methodsTitle: "Methods",
  thMethod: "Method",
  thWeight: "Weight",
  thRationale: "Rationale",
  thDerivation: "Derivation",
  method: {
    revenue_multiple: "Revenue multiple",
    berkus: "Berkus",
    dcf_proxy: "DCF proxy",
    comparables: "AU comparables",
    risk_factor_summation: "Risk-factor summation",
    scorecard: "Scorecard (Bill Payne)",
    stage_baseline: "AU stage baseline",
  },
  needRevenue: (n) => `${n} method${n === 1 ? "" : "s"} need revenue — connect Stripe or Xero, or state MRR, to unlock ${n === 1 ? "it" : "them"}.`,
  connectorsCta: "Connect Stripe or Xero",
  noneApplicable: "No valuation method ran on this snapshot — the range above is the directional stage model only. Connect Stripe or Xero, or state MRR, then re-run the analysis to get the method table, inputs and cross-checks.",
  unitEconomicsTitle: "Unit economics",
  ue: { cacAud: "CAC", ltvAud: "LTV", ltvCacRatio: "LTV : CAC", grossMarginPct: "Gross margin", ruleOf40: "Rule of 40", cacPaybackMonths: "CAC payback (months)", verdict: "Verdict" },
  ueVerdict: { strong: "strong", healthy: "healthy", watch: "watch", weak: "weak" },
  crossChecksTitle: "Cross-checks",
  nLabel: (n) => `N=${n}`,
  asOf: (d) => `as of ${d}`,
  consistencyTitle: "Consistency notes",
  scenarios: "Scenarios",
  scenarioLine: (bear, base, bull) => `Bear ${bear} · Base ${base} · Bull ${bull}`,
  askLine: (pre, raise, verdict, gap) => `Ask: ${pre} pre-money, raising ${raise} — ${verdict} (${gap})`,
  askVerdict: { aligned: "aligned", above_consensus: "above consensus", below_consensus: "below consensus" },
  sectorMultiplesTitle: (sector) => `Sector multiples · ${sector}`,
  sectorMultiplesLine: (low, median, high, label, date) => `${low}× / ${median}× / ${high}× ARR — ${label} (${date})`,
  comparablesLine: (n, withMultiples, date) => `AU comparables: ${n} raises tracked, ${withMultiples} with disclosed multiples (sources dated ${date}).`,
};

const valuationVi: TbrValuationStrings = {
  confidence: (pct) => `độ tin cậy đồng thuận ${pct}%`,
  low: "Thấp",
  consensus: "Đồng thuận",
  high: "Cao",
  pending: "Định giá tham khảo được tính từ 8 khía cạnh đã chấm điểm. Hãy chạy phân tích trước — khoảng giá trị, các phương pháp và so sánh sẽ xuất hiện khi có ít nhất một khía cạnh được chấm.",
  inputsTitle: "Dữ liệu đầu vào & giả định",
  thInput: "Đầu vào",
  thValue: "Giá trị",
  thSource: "Nguồn",
  inMrr: "MRR",
  inArr: "ARR",
  inGrowth: "Tăng trưởng hàng tháng",
  inGrowthAssumedValue: (pct) => `${pct}% / tháng (trung vị ngành)`,
  inEsic: "Đủ điều kiện ESIC",
  inRdti: "Hoàn thuế R&D Tax Incentive (ước tính)",
  inBerkus: "Trụ cột Berkus có bằng chứng",
  inStage: "Giai đoạn",
  inSector: "Ngành",
  inSectorMultiples: "Hệ số ARR ngành (p25 / p50 / p75)",
  inRaise: "Vòng gọi vốn",
  raiseNotStated: "chưa khai báo — không mô hình hoá mức gọi vốn",
  yes: "có",
  no: "không",
  notProvided: "chưa cung cấp",
  pillar: { soundIdea: "ý tưởng vững", prototype: "nguyên mẫu", qualityTeam: "đội ngũ chất lượng", strategicRelationships: "quan hệ chiến lược", productRollout: "sản phẩm đã ra mắt" },
  source: { connector: "kết nối dữ liệu", document: "tài liệu", founder_stated: "nhà sáng lập khai báo", assumed: "giả định", none: "không có", benchmark: "chuẩn tham chiếu", model: "mô hình" },
  methodsTitle: "Phương pháp",
  thMethod: "Phương pháp",
  thWeight: "Trọng số",
  thRationale: "Lý do",
  thDerivation: "Cách tính",
  method: {
    revenue_multiple: "Hệ số doanh thu",
    berkus: "Berkus",
    dcf_proxy: "DCF ước lượng",
    comparables: "So sánh giao dịch Úc",
    risk_factor_summation: "Tổng hợp yếu tố rủi ro",
    scorecard: "Scorecard (Bill Payne)",
    stage_baseline: "Mốc chuẩn giai đoạn Úc",
  },
  needRevenue: (n) => `${n} phương pháp cần doanh thu — kết nối Stripe hoặc Xero, hoặc khai báo MRR, để mở khoá.`,
  connectorsCta: "Kết nối Stripe hoặc Xero",
  noneApplicable: "Chưa có phương pháp định giá nào chạy trên bản chụp này — khoảng giá trị phía trên chỉ là mô hình định hướng theo giai đoạn. Kết nối Stripe hoặc Xero, hoặc khai báo MRR, rồi chạy lại phân tích để có bảng phương pháp, đầu vào và đối chiếu.",
  unitEconomicsTitle: "Kinh tế đơn vị",
  ue: { cacAud: "CAC", ltvAud: "LTV", ltvCacRatio: "LTV : CAC", grossMarginPct: "Biên lợi nhuận gộp", ruleOf40: "Quy tắc 40", cacPaybackMonths: "Hoàn vốn CAC (tháng)", verdict: "Kết luận" },
  ueVerdict: { strong: "mạnh", healthy: "lành mạnh", watch: "cần theo dõi", weak: "yếu" },
  crossChecksTitle: "Đối chiếu",
  nLabel: (n) => `N=${n}`,
  asOf: (d) => `tính đến ${d}`,
  consistencyTitle: "Ghi chú nhất quán",
  scenarios: "Kịch bản",
  scenarioLine: (bear, base, bull) => `Xấu ${bear} · Cơ sở ${base} · Tốt ${bull}`,
  askLine: (pre, raise, verdict, gap) => `Mức đề xuất: ${pre} pre-money, gọi ${raise} — ${verdict} (${gap})`,
  askVerdict: { aligned: "phù hợp", above_consensus: "cao hơn đồng thuận", below_consensus: "thấp hơn đồng thuận" },
  sectorMultiplesTitle: (sector) => `Hệ số ngành · ${sector}`,
  sectorMultiplesLine: (low, median, high, label, date) => `${low}× / ${median}× / ${high}× ARR — ${label} (${date})`,
  comparablesLine: (n, withMultiples, date) => `So sánh Úc: ${n} vòng gọi vốn được theo dõi, ${withMultiples} có công bố hệ số (nguồn tính đến ${date}).`,
};

export const TBR_VALUATION_STRINGS: Record<TbrValuationLocale, TbrValuationStrings> = { en: valuationEn, vi: valuationVi };

export function getTbrValuationStrings(locale: string | undefined): TbrValuationStrings {
  return locale === "vi" ? valuationVi : valuationEn;
}

// ── G19-S43 — evidence & data CTAs (web / PDF / DOCX twins) ─────────────────
//
// Additive sub-block (EN + VI with diacritics) for the S43 surfaces: CTA rows
// in the chapter evidence table / appendix register, the pending-chapter
// CTAs, the next-action "evidence to add" label, the Money on the Table empty
// state and the cover "Evidence: … (×N)" line. S45 folds every remaining
// ReportV2 label into this file; keep this block self-contained.

export type TbrS43Locale = "en" | "vi";

export type TbrEvidenceSourceKey = "stripe" | "ga4" | "github" | "xero" | "linkedin" | "upload" | "url" | "self_declared" | "founder_profile" | "connector_other" | "external";
export type TbrEvidenceLevelKey = "self_declared" | "public_url" | "document_uploaded" | "connected_source" | "transaction_data" | "third_party_verified";

export interface TbrS43Strings {
  /** Status cell on a CTA row. */
  missing: string;
  /** Link text on a CTA row ("Add now →"). */
  addNow: string;
  /** "+N SVI" chip. */
  lift: (n: number) => string;
  /** Empty evidence table (no rows at all) + its link. */
  noEvidence: string;
  noEvidenceCta: string;
  /** Pending chapter: "Add data to score this dimension:" */
  pendingCtas: string;
  /** Next-action box: "Evidence to add" (replaces the raw enum "evidence: stripe"). */
  evidenceToAdd: string;
  /** Next-action box: "expected lift". */
  expectedLift: (n: number) => string;
  /** Founder-facing source names. */
  source: Record<TbrEvidenceSourceKey, string>;
  /** Cover line: "Evidence: mostly self-declared (×0.50)". */
  coverEvidence: (levelLabel: string, multiplier: string) => string;
  evidenceLevel: Record<TbrEvidenceLevelKey, string>;
  /** Money on the Table empty states. */
  moneyNoProfile: string;
  moneyNoProfileCta: string;
  moneyNoMatch: string;
  moneyNoMatchCta: string;
  /** 90-day plan: the P0 / P1 evidence block. */
  planEvidenceTitle: string;
  /** Appendix register: the CTA column header. */
  thAddIt: string;
}

const s43En: TbrS43Strings = {
  missing: "missing",
  addNow: "Add now →",
  lift: (n) => `+${n} SVI`,
  noEvidence: "No evidence rows on this dimension yet.",
  noEvidenceCta: "Add evidence in the Evidence Hub →",
  pendingCtas: "Add data to score this dimension:",
  evidenceToAdd: "Evidence to add",
  expectedLift: (n) => `expected lift +${n} SVI`,
  source: {
    stripe: "Stripe (revenue)",
    ga4: "Google Analytics 4",
    github: "GitHub repository",
    xero: "Xero (accounts)",
    linkedin: "LinkedIn export",
    upload: "Document upload",
    url: "Public URL",
    self_declared: "Self-declared input",
    founder_profile: "Founder profile",
    connector_other: "Data connector",
    external: "Verified ABN (public registers)",
  },
  coverEvidence: (levelLabel, multiplier) => `Evidence: ${levelLabel} (×${multiplier})`,
  evidenceLevel: {
    self_declared: "mostly self-declared",
    public_url: "public URLs",
    document_uploaded: "documents uploaded",
    connected_source: "connected sources",
    transaction_data: "transaction data",
    third_party_verified: "third-party verified",
  },
  moneyNoProfile: "No grant profile yet — grants and programs are matched on the saved profile.",
  moneyNoProfileCta: "Complete your grant profile →",
  moneyNoMatch: "No open grant or program matches the saved profile right now — matching re-runs on every report.",
  moneyNoMatchCta: "Review your grant profile →",
  planEvidenceTitle: "Evidence to add (P0 / P1)",
  thAddIt: "Add it",
};

const s43Vi: TbrS43Strings = {
  missing: "thiếu",
  addNow: "Bổ sung ngay →",
  lift: (n) => `+${n} SVI`,
  noEvidence: "Chưa có dòng bằng chứng nào cho khía cạnh này.",
  noEvidenceCta: "Bổ sung bằng chứng trong Kho bằng chứng →",
  pendingCtas: "Bổ sung dữ liệu để chấm điểm khía cạnh này:",
  evidenceToAdd: "Bằng chứng cần bổ sung",
  expectedLift: (n) => `mức tăng dự kiến +${n} SVI`,
  source: {
    stripe: "Stripe (doanh thu)",
    ga4: "Google Analytics 4",
    github: "Kho mã GitHub",
    xero: "Xero (kế toán)",
    linkedin: "Bản xuất LinkedIn",
    upload: "Tài liệu tải lên",
    url: "URL công khai",
    self_declared: "Thông tin tự khai",
    founder_profile: "Hồ sơ nhà sáng lập",
    connector_other: "Kết nối dữ liệu",
    external: "ABN đã xác minh (đăng ký công khai)",
  },
  coverEvidence: (levelLabel, multiplier) => `Bằng chứng: ${levelLabel} (×${multiplier})`,
  evidenceLevel: {
    self_declared: "chủ yếu tự khai",
    public_url: "URL công khai",
    document_uploaded: "tài liệu đã tải lên",
    connected_source: "nguồn đã kết nối",
    transaction_data: "dữ liệu giao dịch",
    third_party_verified: "bên thứ ba xác minh",
  },
  moneyNoProfile: "Chưa có hồ sơ tài trợ — các khoản tài trợ và chương trình được khớp theo hồ sơ đã lưu.",
  moneyNoProfileCta: "Hoàn thiện hồ sơ tài trợ →",
  moneyNoMatch: "Hiện chưa có khoản tài trợ hay chương trình nào khớp với hồ sơ đã lưu — việc khớp chạy lại ở mỗi báo cáo.",
  moneyNoMatchCta: "Xem lại hồ sơ tài trợ →",
  planEvidenceTitle: "Bằng chứng cần bổ sung (P0 / P1)",
  thAddIt: "Bổ sung",
};

export const TBR_S43_STRINGS: Record<TbrS43Locale, TbrS43Strings> = { en: s43En, vi: s43Vi };

export function getTbrS43Strings(locale: string | undefined): TbrS43Strings {
  return locale === "vi" ? s43Vi : s43En;
}
