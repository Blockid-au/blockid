/** Deterministic screening context from a saved report. No new score, model
 * claim, evidence admission, financial calculation or publication decision. */
import { CRITERIA, type CriterionKey } from "@/lib/evaluation-criteria";
import { isConfidenceLevel } from "@/lib/evidence/confidence-cap";
import type { AgentRole } from "@/lib/report-pipeline/types";
import type { CriterionCard, EvidenceConfidence, EvidenceRow, ReportV2 } from "./schema";

export type InvestorSignalKey = "team" | "traction" | "moat" | "liquidity" | "capital_structure" | "ip";
export interface InvestorScreeningPoint { signalKey: InvestorSignalKey; text: string; evidenceIds: string[] }
export interface InvestorScreeningEvidence {
  id: string; label: string; href: string; observedAt: string | null;
  source: EvidenceRow["source"]; status: EvidenceRow["status"]; confidence: EvidenceConfidence | null;
}
export interface InvestorScreeningSignal {
  key: InvestorSignalKey; label: string;
  status: "context_available" | "missing" | "locked"; statusLabel: string;
  summary: string; score: null;
  criteria: Array<{ key: CriterionKey; title: string; score: number | null; finding: string; ownerRole: AgentRole }>;
  evidence: InvestorScreeningEvidence[];
  confidence: { state: "stored" | "unknown" | "locked"; levels: EvidenceConfidence[]; label: string };
  ownerRoles: AgentRole[];
  /** D24-b: status is visible, but criteria, evidence, confidence, roles and
   * list points stay gated because a mapped criterion sits in a card chapter. */
  detailLocked: boolean;
}
export interface InvestorScreeningOptions {
  /** D24-b (founder 25/09): free page 1 shows each signal's status. `false`
   * restores the pre-D24-b behaviour where a gated signal reads "locked". */
  revealStatus?: boolean;
}

const DEFINITIONS: ReadonlyArray<{ key: InvestorSignalKey; en: string; vi: string; criteria: readonly CriterionKey[]; question: [string, string] }> = [
  { key: "team", en: "Team", vi: "Đội ngũ", criteria: ["founder_profile", "team", "team_structure"], question: ["What evidence supports the team's execution record and key-person coverage?", "Bằng chứng nào xác nhận năng lực thực thi và phương án thay thế nhân sự chủ chốt?"] },
  { key: "traction", en: "Traction", vi: "Sức kéo thương mại", criteria: ["customer_size", "revenue", "gtm_strategy"], question: ["Can dated customer and revenue records substantiate retention and recurring revenue?", "Hồ sơ khách hàng và doanh thu có ngày có xác nhận tỷ lệ giữ chân và doanh thu định kỳ không?"] },
  { key: "moat", en: "Moat", vi: "Lợi thế phòng thủ", criteria: ["idea", "code_git", "roadmap", "market"], question: ["Which competitive advantages are supported by evidence beyond the pitch?", "Lợi thế cạnh tranh nào có bằng chứng ngoài nội dung giới thiệu?"] },
  { key: "liquidity", en: "Liquidity", vi: "Khả năng thoái vốn", criteria: ["revenue", "market", "documents", "team_structure"], question: ["What evidence supports a feasible exit route, potential buyers and transaction constraints?", "Bằng chứng nào hỗ trợ phương án thoái vốn, bên mua tiềm năng và các hạn chế giao dịch?"] },
  { key: "capital_structure", en: "Capital structure", vi: "Cấu trúc vốn", criteria: ["team_structure", "documents", "dataroom"], question: ["Can the current cap table, vesting terms and convertible instruments be reconciled?", "Có thể đối chiếu bảng sở hữu hiện tại, điều khoản vesting và các công cụ chuyển đổi không?"] },
  { key: "ip", en: "IP", vi: "Sở hữu trí tuệ", criteria: ["code_git", "documents", "idea"], question: ["Who owns the IP, and which signed assignments or registrations substantiate ownership?", "Ai sở hữu tài sản trí tuệ và văn bản chuyển giao hoặc đăng ký nào xác nhận quyền sở hữu?"] },
];

export function investorScreeningStrings(locale: string) {
  return locale === "vi" ? {
    title: "Tổng quan sàng lọc cho nhà đầu tư", context: "Có đánh giá tiêu chí liên quan", missing: "Chưa có đánh giá riêng", locked: "Chi tiết trong báo cáo đầy đủ",
    noCriteria: "Chưa có đánh giá tiêu chí liên quan được lưu. Thiếu dữ liệu không đồng nghĩa với điểm bằng không.",
    related: "Ngữ cảnh từ các tiêu chí đã lưu; không phải điểm tổng hợp hay kết luận đầu tư mới.",
    liquidity: "Chưa có đánh giá riêng về phương án thoái vốn. Tiêu chí liên quan không xác nhận khả năng thanh khoản hay thời điểm thoái vốn.",
    capital: "Chưa có đánh giá riêng về cấu trúc vốn. Tiêu chí liên quan không xác nhận tỷ lệ sở hữu, quyền cổ đông hay mức pha loãng.",
    ip: "Ngữ cảnh công nghệ và tài liệu đã lưu; chưa xác nhận quyền sở hữu, khả năng bảo hộ hay chuyển giao tài sản trí tuệ.",
    confidence: "Mức bằng chứng đã lưu; không phải điểm kinh doanh hay xác nhận kiểm chứng độc lập.", unknown: "Chưa lưu mức tin cậy bằng chứng.",
    scopeNote: "Lớp sàng lọc xác định từ báo cáo đã lưu. Không thêm điểm, định giá, xác minh độc lập hay khuyến nghị đầu tư. Câu hỏi là gợi ý thẩm định; vai trò là thông tin xuất xứ đã lưu, không xác nhận model AI.",
  } : {
    title: "Investor screening overview", context: "Related assessments available", missing: "No dedicated assessment", locked: "Details in the full report",
    noCriteria: "No related criterion assessment is saved. Missing information is not a zero score.",
    related: "Context from saved criteria; not a new composite score or investment conclusion.",
    liquidity: "No dedicated exit assessment is saved. Related criteria do not establish liquidity or exit timing.",
    capital: "No dedicated capital-structure assessment is saved. Related criteria do not establish ownership, shareholder rights or dilution.",
    ip: "Saved technology and document context; IP ownership, protection and assignment are not established.",
    confidence: "Stored evidence levels; not business scores or independent verification.", unknown: "No evidence confidence level is saved.",
    scopeNote: "A deterministic screening layer over the saved report. No new score, valuation, independent verification or investment recommendation. Questions are due-diligence prompts; roles are saved provenance, not a claim about the AI model used.",
  };
}

const norm = (id: string) => id.trim().toLowerCase();

/** Free gating is deliberately conservative: any locked occurrence of a mapped
 * criterion locks the entire signal's detail, including evidence, scores,
 * findings, provenance and list points. D24-b: the signal's status (related
 * assessment saved or not) stays visible; `revealStatus: false` hides it too. */
export function buildInvestorScreening(report: ReportV2, locale: string = report.locale, lockCards = report.tier === "free", { revealStatus = true }: InvestorScreeningOptions = {}) {
  const strings = investorScreeningStrings(locale), vi = locale === "vi";
  const lockedChapters = lockCards ? report.dimensions.filter(ch => ch.renderAs === "card") : [];
  const lockedCriteria = new Set(lockedChapters.flatMap(ch => ch.criteria.map(c => c.key)));
  const lockedEvidence = new Set(lockedChapters.flatMap(ch => [...ch.evidence.map(e => norm(e.evidence_id)), ...ch.criteria.flatMap(c => c.citations.map(e => norm(e.evidence_id)))]));
  const register = new Map<string, EvidenceRow>();
  // Conflicting duplicate rows are omitted rather than arbitrarily choosing a
  // favourable confidence/date. No new evidence confidence is calculated.
  const conflicting = new Set<string>();
  for (const row of [...report.appendix.evidenceRegister, ...report.dimensions.flatMap(ch => ch.evidence)]) {
    const id = norm(row.evidence_id);
    if (!id || lockedEvidence.has(id)) continue;
    const previous = register.get(id);
    if (previous && ["label", "source", "status", "observedAt", "confidence"].some(key => previous[key as keyof EvidenceRow] !== row[key as keyof EvidenceRow])) conflicting.add(id);
    else register.set(id, row);
  }
  for (const id of conflicting) register.delete(id);
  const strengths: InvestorScreeningPoint[] = [], gaps: InvestorScreeningPoint[] = [], questions: InvestorScreeningPoint[] = [];
  const seenStrengths = new Set<string>(), seenGaps = new Set<string>();
  const signals: InvestorScreeningSignal[] = DEFINITIONS.map(def => {
    const locked = def.criteria.some(key => lockedCriteria.has(key));
    const base = { key: def.key, label: vi ? def.vi : def.en, score: null } as const;
    const gated = { ...base, criteria: [], evidence: [], confidence: { state: "locked" as const, levels: [], label: strings.locked }, ownerRoles: [], detailLocked: true };
    if (locked && !revealStatus) return { ...gated, status: "locked", statusLabel: strings.locked, summary: strings.locked };
    const cards: CriterionCard[] = [];
    const criteria: InvestorScreeningSignal["criteria"] = [];
    for (const key of def.criteria) {
      const chapter = report.dimensions.find(ch => ch.criteria.some(c => c.key === key));
      const card = chapter?.criteria.find(c => c.key === key);
      if (!chapter || !card) continue;
      // An explicitly pending dimension cannot supply a scored criterion.
      if (chapter.scoreBreakdown?.assessed === false || (!chapter.scoreBreakdown && chapter.band === "pending")) continue;
      cards.push(card);
      const title = CRITERIA.find(c => c.key === key)!;
      criteria.push({ key, title: vi ? title.titleVi : title.title, score: Number.isFinite(card.score) ? card.score : null, finding: card.verdict, ownerRole: card.agent });
    }
    const missing = def.key === "liquidity" || def.key === "capital_structure" || !criteria.length;
    const summary = def.key === "liquidity" ? strings.liquidity : def.key === "capital_structure" ? strings.capital : !criteria.length ? strings.noCriteria : def.key === "ip" ? strings.ip : strings.related;
    const status = missing ? "missing" as const : "context_available" as const, statusLabel = missing ? strings.missing : strings.context;
    // Status and the fixed summary only: no criterion, finding, evidence,
    // role or list point of a gated signal leaves this function.
    if (locked) return { ...gated, status, statusLabel, summary };
    const cited = [...new Set(cards.flatMap(c => c.citations.map(cite => norm(cite.evidence_id))))];
    const evidence = cited.flatMap(id => {
      const row = register.get(id);
      return row ? [{ id: row.evidence_id, label: row.label, href: "#tbr-appendix", observedAt: row.observedAt ?? null, source: row.source, status: row.status, confidence: isConfidenceLevel(row.confidence) ? row.confidence : null }] : [];
    });
    const levels = [...new Set(evidence.flatMap(e => e.confidence ? [e.confidence] : []))];
    // A criterion-level citation does not prove every bullet. Only promote
    // grounded saved bullets with their own valid, non-stale evidence markers.
    for (const card of cards) {
      if (!card.grounded) continue;
      const ownIds = new Set(card.citations.map(c => norm(c.evidence_id)));
      for (const [bullets, target, seen] of [[card.strengths, strengths, seenStrengths], [card.gaps, gaps, seenGaps]] as const) {
        for (const text of bullets) {
          if (target.length >= 3 || seen.has(text) || /\[(?:uncited|unevidenced)\]/i.test(text)) continue;
          const ids = [...text.matchAll(/\[ev:\s*([^\]]+?)\s*\]/gi)].map(match => norm(match[1]));
          if (!ids.length || !ids.every(id => ownIds.has(id) && register.get(id)?.status === "evidenced")) continue;
          seen.add(text); target.push({ signalKey: def.key, text, evidenceIds: [...new Set(ids)].map(id => register.get(id)!.evidence_id) });
        }
      }
    }
    questions.push({ signalKey: def.key, text: def.question[vi ? 1 : 0], evidenceIds: [] });
    return { ...base, status, statusLabel, summary, criteria, evidence,
      confidence: { state: levels.length ? "stored" : "unknown", levels, label: levels.length ? strings.confidence : strings.unknown }, ownerRoles: [...new Set(criteria.map(c => c.ownerRole))], detailLocked: false };
  });
  // Missing dedicated signals take precedence over generic prompts. This is
  // fixed presentation order, not a calibrated investment-risk ranking.
  const orderedQuestions = [...questions.filter(q => signals.find(s => s.key === q.signalKey)?.status === "missing"), ...questions.filter(q => signals.find(s => s.key === q.signalKey)?.status !== "missing")].slice(0, 3);
  for (const signal of signals) if (signal.status === "missing" && !signal.detailLocked && gaps.length < 3) gaps.push({ signalKey: signal.key, text: signal.summary, evidenceIds: [] });
  return { signals, strengths, gaps, questions: orderedQuestions, generatedAt: report.generatedAt, scopeNote: strings.scopeNote };
}
