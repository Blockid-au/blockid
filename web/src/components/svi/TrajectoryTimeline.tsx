// G21 P3-A — the longitudinal trajectory: SVI + Evidence Confidence over
// time from Day 0 (the first snapshot), evidence-level changes per snapshot,
// confirmed outcomes as markers, and the Day 0 / 60 / 180 tiles. Hook-free
// so it renders in server components (/workspace/score, the dossier) and
// client trees alike. Data is `Trajectory` from lib/svi/trajectory.ts
// (loaded by lib/svi/trajectory-load.ts).
//
// Inline SVG, theme tokens only (currentColor through text-* classes, so
// dark mode is the same markup), the VisualFigure pattern: a figure with the
// chart, a caption and a visually-hidden table (`trajectoryTable`). Nothing
// here forecasts — the chart shows what was observed and when.

import { EVIDENCE_BADGES, milestoneLabel, trajectoryTable, type Trajectory, type TrajectoryMilestone, type TrajectoryPoint } from "@/lib/svi/trajectory";
import { OUTCOME_KIND_META } from "@/lib/outcomes/types";
import { cn } from "@/lib/utils";

export interface TrajectoryTimelineProps {
  data: Trajectory;
  /** Compact = tiles + a shorter chart (dossier / cohort); full = the workspace card. */
  variant?: "full" | "compact";
  headingLevel?: 2 | 3;
  className?: string;
  /** Where "record an outcome" points (omit to hide the link). */
  outcomesHref?: string | null;
  /** Kicker + heading copy override (the dossier says "for this startup"). */
  title?: string;
  /** G22-A: id prefix for the SVG title / desc — pass a unique one when several timelines share a page (Compare drawer). */
  id?: string;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted";

const W = 640;
const H_FULL = 220;
const H_COMPACT = 160;
const PAD = { l: 36, r: 16, t: 26, b: 28 };

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : iso;
}

function delta(n: number | null): string {
  if (n === null) return "";
  return n > 0 ? `+${n}` : String(n);
}

function MilestoneTile({ m }: { m: TrajectoryMilestone }) {
  const p = m.point;
  return (
    <div className="rounded-xl border border-line-subtle bg-surface-sunken p-3" data-trajectory-milestone={m.mark} data-trajectory-present={p ? "true" : "false"}>
      <p className={LABEL}>{milestoneLabel(m)}</p>
      {p ? (
        <>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span className="text-2xl font-black tabular-nums tracking-tight text-primary">{p.svi}</span>
            <span className="text-xs text-muted">SVI</span>
            {m.sviDelta !== null ? <span className={cn("text-xs font-semibold tabular-nums", m.sviDelta > 0 ? "text-bull" : m.sviDelta < 0 ? "text-bear" : "text-muted")}>{delta(m.sviDelta)}</span> : null}
          </p>
          <p className="text-xs text-secondary">
            Confidence <span className="tabular-nums">{p.confidence === null ? "—" : `${p.confidence}%`}</span>
            {m.confidenceDelta !== null ? <span className={cn("ml-1 tabular-nums", m.confidenceDelta > 0 ? "text-bull" : m.confidenceDelta < 0 ? "text-bear" : "text-muted")}>{delta(m.confidenceDelta)}</span> : null}
          </p>
          <p className="text-xs text-secondary">
            Evidence <span className="tabular-nums">{p.evidenceTotal}</span>
            {p.highestLevel ? <span className="ml-1 font-mono text-[11px] text-muted">to {p.highestLevel}</span> : null}
            <span className="ml-1 text-muted">· {fmtDate(p.date)}</span>
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-secondary">{m.mark === 0 ? "No snapshot yet." : `Not reached yet — the record is younger than ${m.mark} days.`}</p>
      )}
    </div>
  );
}

function Chart({ data, height, id }: { data: Trajectory; height: number; id: string }) {
  const span = Math.max(1, data.spanDays);
  const plotW = W - PAD.l - PAD.r;
  const plotH = height - PAD.t - PAD.b;
  const x = (day: number) => PAD.l + (Math.max(0, Math.min(span, day)) / span) * plotW;
  const y = (v: number) => PAD.t + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const path = (pick: (p: TrajectoryPoint) => number | null) => {
    let d = "";
    let open = false;
    for (const p of data.points) {
      const v = pick(p);
      if (v === null) {
        open = false;
        continue;
      }
      d += `${open ? "L" : "M"}${x(p.day).toFixed(1)} ${y(v).toFixed(1)} `;
      open = true;
    }
    return d.trim();
  };
  const sviPath = path((p) => p.svi);
  const confPath = path((p) => p.confidence);
  // Day ticks: 0, 60, 180 when inside the span, plus the last day.
  const ticks = Array.from(new Set([0, 60, 180, span].filter((d) => d <= span))).sort((a, b) => a - b);
  const title = "SVI and Evidence Confidence over time";
  const desc = `From Day 0 (${data.day0 ?? "—"}) to Day ${span}: ${data.points.length} snapshot${data.points.length === 1 ? "" : "s"}, ${data.markers.length} confirmed outcome${data.markers.length === 1 ? "" : "s"}.`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="img" aria-labelledby={`${id}-title ${id}-desc`} className="h-auto w-full max-w-full text-primary" data-visual-id="trajectory-timeline">
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{desc}</desc>
      {/* grid */}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v} className="text-line-subtle">
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} className="fill-current text-muted" fill="currentColor">
            {v}
          </text>
        </g>
      ))}
      {ticks.map((d) => (
        <g key={d} className="text-muted">
          <line x1={x(d)} x2={x(d)} y1={PAD.t} y2={PAD.t + plotH} stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
          <text x={x(d)} y={height - 10} textAnchor={d === 0 ? "start" : d === span ? "end" : "middle"} fontSize={9} fill="currentColor">
            {`Day ${d}`}
          </text>
        </g>
      ))}
      {/* Evidence Confidence — dashed */}
      {confPath ? <path d={confPath} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" className="text-warn" strokeLinejoin="round" strokeLinecap="round" data-series="confidence" /> : null}
      {/* SVI — solid */}
      {sviPath ? <path d={sviPath} fill="none" stroke="currentColor" strokeWidth={2.5} className="text-action" strokeLinejoin="round" strokeLinecap="round" data-series="svi" /> : null}
      {data.points.map((p) => (
        <g key={p.day}>
          <circle cx={x(p.day)} cy={y(p.svi)} r={3.5} fill="currentColor" className="text-action" />
          {p.confidence !== null ? <circle cx={x(p.day)} cy={y(p.confidence)} r={2.5} fill="currentColor" className="text-warn" /> : null}
          {/* evidence-level change tick under the axis: total records as at this point */}
          <text x={x(p.day)} y={PAD.t + plotH + 11} textAnchor="middle" fontSize={8} fill="currentColor" className="text-muted">
            {p.evidenceTotal > 0 ? `${p.evidenceTotal}${p.highestLevel ? `·${p.highestLevel}` : ""}` : ""}
          </text>
        </g>
      ))}
      {/* outcome markers along the top */}
      {data.markers.map((m, i) => {
        const cx = x(m.day);
        const cy = PAD.t - 10;
        return (
          <g key={m.id} className="text-bull" data-trajectory-marker={m.kind}>
            <line x1={cx} x2={cx} y1={cy + 5} y2={PAD.t + plotH} stroke="currentColor" strokeWidth={1} opacity={0.35} />
            <path d={`M${cx} ${cy - 5} L${cx + 5} ${cy} L${cx} ${cy + 5} L${cx - 5} ${cy} Z`} fill="currentColor" />
            <title>{`${OUTCOME_KIND_META[m.kind].label} — ${m.label} (${fmtDate(m.date)})`}</title>
            {i < 6 ? (
              <text x={cx + 7} y={cy + 3} fontSize={8} fill="currentColor" className="text-secondary">
                {OUTCOME_KIND_META[m.kind].label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function TrajectoryTimeline({ data, variant = "full", headingLevel = 2, className, outcomesHref = null, title, id = "trajectory" }: TrajectoryTimelineProps) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const rows = trajectoryTable(data);
  const cols = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const latest = data.latest;
  return (
    <section
      data-testid="trajectory-timeline"
      data-trajectory-state={data.state}
      data-trajectory-points={data.points.length}
      data-trajectory-markers={data.markers.length}
      aria-label="Trajectory"
      className={cn("rounded-2xl border border-line-subtle bg-surface p-4 text-primary print:break-inside-avoid", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line-subtle pb-3">
        <div className="min-w-0">
          <p className={cn(LABEL, "font-mono tracking-[0.18em]")}>Trajectory · Day 0 / 60 / 180</p>
          <H className="mt-0.5 font-display text-lg font-bold tracking-tight text-primary">{title ?? "How the record has moved"}</H>
          <p className="mt-1 max-w-2xl text-xs text-secondary">
            Every snapshot is scored on the same methodology; movement here is real movement in the evidence, not a rule change. Confirmed outcomes are marked where they happened.
          </p>
        </div>
        {latest ? (
          <dl className="grid grid-cols-2 gap-x-4 text-xs sm:text-right">
            <div>
              <dt className={LABEL}>Latest</dt>
              <dd className="tabular-nums text-secondary">
                Day {latest.day} · SVI {latest.svi}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Verified</dt>
              <dd className="text-secondary">{data.verificationLevel ?? "L0"}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      {data.state === "empty" ? (
        <p className="mt-3 rounded-xl border border-dashed border-line-subtle bg-surface-sunken p-4 text-sm text-secondary" data-testid="trajectory-empty">
          No snapshot yet. The first assessment becomes Day 0; every re-score, evidence change and confirmed outcome after it is plotted here.
        </p>
      ) : (
        <>
          <div className={cn("mt-3 grid gap-3", variant === "full" ? "sm:grid-cols-3" : "grid-cols-3")} data-testid="trajectory-milestones">
            {data.milestones.map((m) => (
              <MilestoneTile key={m.mark} m={m} />
            ))}
          </div>

          <figure className="mt-3" data-visual-kind="trajectory" data-visual-state="real">
            <div className="w-full overflow-hidden rounded-xl border border-line-subtle bg-surface-sunken p-2">
              <Chart data={data} height={variant === "full" ? H_FULL : H_COMPACT} id={id} />
            </div>
            <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded bg-action" /> SVI (0–100)
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded border-t-2 border-dashed border-warn" /> Evidence Confidence (%)
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-2 w-2 rotate-45 bg-bull" /> Confirmed outcome
              </span>
              <span>Under the axis: evidence records on file · highest level ({EVIDENCE_BADGES[0]}–{EVIDENCE_BADGES[5]}).</span>
              {data.state === "single" ? <span>One snapshot so far — the line starts with the next re-score.</span> : null}
            </figcaption>
            {rows.length > 0 ? (
              <div className="sr-only">
                <table className="sr-only">
                  <caption>Trajectory data: one row per snapshot, then one per confirmed outcome</caption>
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {cols.map((c) => (
                          <td key={c}>{r[c] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </figure>

          {data.markers.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" data-testid="trajectory-outcomes">
              {data.markers.map((m) => (
                <li key={m.id} className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-xs text-secondary" data-outcome-kind={m.kind}>
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rotate-45 bg-bull" />
                  <span className="font-medium text-primary">{OUTCOME_KIND_META[m.kind].label}</span>
                  <span>· {m.label}</span>
                  <span className="text-muted">· Day {m.day}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-secondary" data-testid="trajectory-no-outcomes">
              No confirmed outcome yet.{" "}
              {outcomesHref ? (
                <a href={outcomesHref} className="text-action underline decoration-dotted underline-offset-4">
                  Record what happened
                </a>
              ) : null}
            </p>
          )}
        </>
      )}
    </section>
  );
}
