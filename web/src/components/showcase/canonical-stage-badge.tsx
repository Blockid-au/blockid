// Canonical 8-stage badge overlay for the 12-phase showcase timelines.
// Renders a secondary annotation that maps the internal 12-phase key onto the
// canonical VC vocabulary (idea → public/exit). The 12-phase heading stays
// primary; this badge is a small muted tag rendered next to it.
//
// Used by web/src/app/showcase/{atlassian,canva,xero,safetyculture}/page.tsx
// (real-world audit §6 item 5).

import { phaseToStageLabel } from "@/lib/journey-map";

interface CanonicalStageBadgeProps {
  /** 12-phase key (1..12). Values outside range render nothing. */
  phase: number;
  /** Extra classes appended to the badge span (optional). */
  className?: string;
}

/**
 * Pure text helper shared by the component and its smoke test. Kept exported
 * so downstream surfaces (e.g. PDF renderer, DOCX exporter) can reuse the
 * exact copy without pulling in React.
 */
export function canonicalStageBadgeText(phase: number): string | null {
  const label = phaseToStageLabel(phase);
  if (!label) return null;
  return `Stage: ${label.label_en} · ${label.label_vi}`;
}

/**
 * Render a secondary canonical-stage badge for a given 12-phase key. Returns
 * `null` when the phase is out of range so callers can safely mount it next to
 * arbitrary phase headings without worrying about a misleading fallback.
 */
export function CanonicalStageBadge({
  phase,
  className,
}: CanonicalStageBadgeProps) {
  const label = phaseToStageLabel(phase);
  if (!label) return null;
  return (
    <span
      data-canonical-stage={label.stage}
      className={`inline-flex items-center rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500${
        className ? ` ${className}` : ""
      }`}
    >
      Stage: {label.label_en} <span className="mx-1 text-ink-400">·</span>
      <span className="italic">{label.label_vi}</span>
    </span>
  );
}
