// G34 BT6 — the page-1 position line under the scorecard (spec §1 "Peer
// position | Stage ladder"): stage ladder (RQ20, verified evidence, kept
// apart from the quality scores), peer percentile (RQ19, published n ≥ 10
// only), spike (RQ28) and round readiness (RQ27); plus the calibration
// disclosure (RQ21) linking /methodology/calibration. Every value comes from
// `buildDashboardV4`; lines with no data are omitted. Hook-free.

import type { DashboardV4 } from "@/lib/report-v2/dashboard-v4";
import { cn } from "@/lib/utils";
import { FIGURE_CLASS } from "./shared-v3";

export function PeerStageStrip({ v4, className }: { v4: DashboardV4; className?: string }) {
  const s = v4.strings;
  const ladder = v4.stageLadder;
  return (
    <div data-tbr-position className={cn("space-y-1 border-t border-line-subtle pt-2 text-xs text-secondary", className)}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-tbr-stage-ladder={ladder.step}>
          <span className="font-semibold uppercase tracking-wide text-muted">{s.ladderTitle}</span>{" "}
          <span role="img" aria-label={ladder.ariaLabel} className="text-action">
            <span aria-hidden="true">{ladder.dots}</span>
          </span>{" "}
          <span className="font-medium text-primary">{ladder.label}</span>
          <span className="text-muted"> · {ladder.basis}</span>
        </span>
        {v4.peer ? (
          <span data-tbr-peer={v4.peer.state}>
            <span className="font-semibold uppercase tracking-wide text-muted">{s.peerTitle}</span> <span className={cn("text-primary", FIGURE_CLASS)}>{v4.peer.text}</span>
          </span>
        ) : null}
        {v4.spike ? (
          <span data-tbr-spike={v4.spike.dims.join(" ")}>
            <span className="font-semibold uppercase tracking-wide text-muted">{s.spikeTitle}</span> <span className="text-primary">{v4.spike.text}</span>
          </span>
        ) : null}
        {v4.roundReadiness ? (
          <span data-tbr-round-readiness className="text-primary">
            {v4.roundReadiness.text}
          </span>
        ) : null}
      </p>
      <p className="text-muted">{s.ladderNote}</p>
    </div>
  );
}

/** RQ21 — one line: backtest ρ · n · date (or "calibration pending"), "not a substitute for diligence", methodology link. */
export function CalibrationLine({ v4, className }: { v4: DashboardV4; className?: string }) {
  const c = v4.calibration;
  return (
    <p data-tbr-calibration={c.state} className={cn("text-xs text-secondary", className)}>
      <span className="font-semibold uppercase tracking-wide text-muted">{v4.strings.calibrationTitle}</span> {c.text}{" "}
      <a href={c.href} className="font-semibold text-action hover:underline">
        {c.linkLabel}
      </a>
    </p>
  );
}
