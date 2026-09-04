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
  switchToEs: "ES",
  switchToJa: "JA",

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
};

export const TBR_STRINGS: Record<TbrLocale, TbrStrings> = { en, vi, es, ja };

export function getTbrStrings(locale: TbrLocale | undefined): TbrStrings {
  if (locale === "vi" || locale === "es" || locale === "ja") return TBR_STRINGS[locale];
  return TBR_STRINGS.en;
}
