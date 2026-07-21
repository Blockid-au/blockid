// Track B B5 — pure grouping helper for the /guide/reports template gallery.
// Consumes DataRoomShowcaseRow[] produced by buildShowcaseDataRoomRows() and
// bins them by phase_at_generation (1..12 + "cross-cutting" bucket for null).
// No I/O; caller supplies the rows. Kept separate so the page component stays
// thin and the section layout is unit-testable.

import type { DataRoomShowcaseRow, ShowcaseAgent } from "./report-tagging";

export const PHASE_COUNT = 12;

export interface PhaseLabel {
  en: string;
  vi: string;
}

// Aligned with U.9 12-phase journey matrix in docs/plans/reseller-module-plan.md.
export const PHASE_LABELS: Record<number, PhaseLabel> = {
  1: { en: "Vision / Day-0 Idea", vi: "Tầm nhìn / Ý tưởng ban đầu" },
  2: { en: "Idea Validation", vi: "Xác thực ý tưởng" },
  3: { en: "Market Research", vi: "Nghiên cứu thị trường" },
  4: { en: "MVP / Product Discovery", vi: "MVP / Khám phá sản phẩm" },
  5: { en: "PMF / Early Traction", vi: "PMF / Traction ban đầu" },
  6: { en: "Revenue / Business Model", vi: "Doanh thu / Mô hình kinh doanh" },
  7: { en: "Growth / Analytics", vi: "Tăng trưởng / Phân tích" },
  8: { en: "Team & Culture", vi: "Đội ngũ & Văn hóa" },
  9: { en: "Funding-Ready", vi: "Sẵn sàng gọi vốn" },
  10: { en: "Fundraise / Term Sheet", vi: "Gọi vốn / Term Sheet" },
  11: { en: "Post-Funding / Scale", vi: "Sau gọi vốn / Mở rộng" },
  12: { en: "Exit / Beyond", vi: "Thoái vốn / Tương lai" },
};

export const CROSS_CUTTING_LABEL: PhaseLabel = {
  en: "Cross-cutting reports",
  vi: "Báo cáo xuyên suốt",
};

export interface GallerySection {
  key: string;                       // "phase-1".."phase-12" or "cross-cutting"
  phase: number | null;
  label: PhaseLabel;
  rows: DataRoomShowcaseRow[];
}

// Groups gallery rows by phase_at_generation. Empty phases are omitted so the
// UI doesn't render placeholder headings that confuse first-time visitors.
export function buildGallerySections(rows: DataRoomShowcaseRow[]): GallerySection[] {
  const byPhase = new Map<number | "null", DataRoomShowcaseRow[]>();
  for (const row of rows) {
    const key = row.phase_at_generation ?? "null";
    const bucket = byPhase.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      byPhase.set(key, [row]);
    }
  }
  const sections: GallerySection[] = [];
  for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
    const bucket = byPhase.get(phase);
    if (!bucket || bucket.length === 0) continue;
    sections.push({
      key: `phase-${phase}`,
      phase,
      label: PHASE_LABELS[phase],
      rows: bucket,
    });
  }
  const cross = byPhase.get("null");
  if (cross && cross.length > 0) {
    sections.push({
      key: "cross-cutting",
      phase: null,
      label: CROSS_CUTTING_LABEL,
      rows: cross,
    });
  }
  return sections;
}

// Agent slug → display name used in the row card. Mirrors the C-Level slug set
// in report-tagging.ts so the gallery header doesn't leak internal shorthand.
const AGENT_LABELS: Record<ShowcaseAgent, string> = {
  ceo: "CEO",
  cto: "CTO",
  cfo: "CFO",
  cmo: "CMO",
  coo: "COO",
  cpo: "CPO",
  cdo: "CDO",
  chro: "CHRO",
  ciso: "CISO",
  clo: "CLO",
  cro: "CRO",
  cso: "CSO",
  ccso: "CCSO",
  ir: "Investor Relations",
  qa: "QA Lead",
  rnd: "R&D",
  "customer-care": "Customer Success",
  ops: "Operations",
  perf: "Performance",
  security: "Security",
  unknown: "Platform",
};

export function agentLabel(agent: ShowcaseAgent): string {
  return AGENT_LABELS[agent] ?? "Platform";
}

// Newest-first ordering guarantee. buildShowcaseDataRoomRows already sorts,
// but total count needs to be exposed to the page footer so we thread it here.
export interface GallerySummary {
  total_rows: number;
  sections: GallerySection[];
  agents_covered: ShowcaseAgent[];
  latest_generated_at: string | null;
}

export function summariseGallery(rows: DataRoomShowcaseRow[]): GallerySummary {
  const sections = buildGallerySections(rows);
  const agents = new Set<ShowcaseAgent>();
  let latest: string | null = null;
  for (const row of rows) {
    agents.add(row.generated_by_agent);
    if (row.generated_at && (!latest || row.generated_at > latest)) {
      latest = row.generated_at;
    }
  }
  return {
    total_rows: rows.length,
    sections,
    agents_covered: Array.from(agents).sort((a, b) => a.localeCompare(b)),
    latest_generated_at: latest,
  };
}
