// web/src/components/unicorn/UnicornPathDashboard.tsx
//
// Phase 6 Batch J · sub-J3 — server component that renders the
// Unicorn Standard Framework dashboard for a single business
// (Master Upgrade Plan §17.7).
//
// Data sources:
//   * business_stage_progress (migration 0280) — active row for the biz
//   * business_profile view (migration 0202) — trust_score, capability_scores
//   * stage_ai_runs (migration 0280) — most recent critical findings
//   * stage_milestones (migration 0280) — next upcoming milestone
//
// Persona switch: when `persona=investor` is passed, the SELF-view is
// replaced with a portfolio-wide S0..S5 histogram (§17.7 investor persona).
//
// Accessibility (WCAG AA):
//   * Wrapping <section role="region" aria-labelledby="unicorn-dash-heading">
//   * Every inline SVG carries <title> and aria-labelledby
//   * Blocker queue is an <ul> with real list semantics
//   * All colour signalling has a text label backup

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildSpiralNodes,
  buildTrustArc,
  buildRadarPoints,
  topBlockers,
  stageHistogram,
  daysInStage,
  RADAR_AREAS,
  type RawBlocker,
  type CohortRow,
} from "./unicorn-dashboard-logic";
import {
  getStage,
  type UnicornStageId,
} from "@/lib/unicorn/framework";

// ─── Types ──────────────────────────────────────────────────────────

export interface UnicornPathDashboardProps {
  businessId: string;
  /** 'self' — the founder's own view (default). 'investor' — histogram. */
  persona?: "self" | "investor";
}

// ─── Server component ──────────────────────────────────────────────

export async function UnicornPathDashboard({
  businessId,
  persona = "self",
}: UnicornPathDashboardProps) {
  if (!isSupabaseConfigured()) {
    return (
      <EmptyState message="Unicorn framework unavailable — Supabase not configured." />
    );
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return (
      <EmptyState message="Unicorn framework unavailable — Supabase not configured." />
    );
  }

  // Investor persona: portfolio-wide histogram (S0..S5) drawn from the
  // consented cohort rather than a single business.
  if (persona === "investor") {
    const { data: cohort } = await supabase
      .from("business_stage_progress")
      .select("current_stage_id")
      .is("stage_exited_at", null);
    const rows: CohortRow[] = (cohort ?? []).map((r) => ({
      currentStageId: r.current_stage_id as UnicornStageId,
    }));
    return <InvestorHistogram rows={rows} />;
  }

  // Self persona — full dashboard for the founder.
  const { data: progress } = await supabase
    .from("business_stage_progress")
    .select(
      "current_stage_id, stage_entered_at, stage_exit_target_at, on_track, open_blockers",
    )
    .eq("business_id", businessId)
    .is("stage_exited_at", null)
    .maybeSingle();

  if (!progress) {
    return (
      <EmptyState
        message="No active stage progression — the first nightly evaluation will seed one."
      />
    );
  }

  const currentStageId = progress.current_stage_id as UnicornStageId;
  const stage = getStage(currentStageId);
  const days = daysInStage(progress.stage_entered_at as string);
  const targetDays = stage.windowDaysMax;

  const { data: profile } = await supabase
    .from("business_profile")
    .select("trust_score, capability_scores, legal_name")
    .eq("business_id", businessId)
    .maybeSingle();

  const trustScore = Math.max(
    0,
    Math.min(100, (profile?.trust_score as number | null) ?? 0),
  );
  const capabilityScores =
    (profile?.capability_scores as Record<string, number> | null) ?? {};

  const { data: latestRun } = await supabase
    .from("stage_ai_runs")
    .select("critical_findings, ran_at")
    .eq("business_id", businessId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawBlockers: RawBlocker[] = Array.isArray(
    latestRun?.critical_findings,
  )
    ? (latestRun!.critical_findings as unknown as RawBlocker[])
    : [];
  const blockerQueue = topBlockers(rawBlockers, 5);

  const { data: nextMilestone } = await supabase
    .from("stage_milestones")
    .select("code, label, due_at, owner_agent")
    .eq("business_id", businessId)
    .eq("stage_id", currentStageId)
    .is("completed_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const spiralNodes = buildSpiralNodes(currentStageId);
  const arc = buildTrustArc(trustScore);
  const radarPoints = buildRadarPoints(capabilityScores);

  return (
    <section
      role="region"
      aria-labelledby="unicorn-dash-heading"
      className="grid gap-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="unicorn-dash-heading"
            className="text-xl font-semibold"
          >
            Unicorn Path · {stage.label} ({stage.id})
          </h2>
          <p className="text-sm text-muted-foreground">
            Day {days} of {targetDays} target
          </p>
        </div>
        <OnTrackChip onTrack={Boolean(progress.on_track)} />
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <SpiralSvg nodes={spiralNodes} />
        <TrustArcSvg
          score={trustScore}
          fullPath={arc.fullPath}
          filledPath={arc.filledPath}
          markerX={arc.markerX}
          markerY={arc.markerY}
        />
      </div>

      <RadarSvg points={radarPoints} />

      <BlockerQueue blockers={blockerQueue} />

      {nextMilestone ? (
        <NextMilestoneCard
          label={nextMilestone.label as string}
          dueAt={nextMilestone.due_at as string | null}
          ownerAgent={nextMilestone.owner_agent as string | null}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No pending milestones for the current stage.
        </p>
      )}
    </section>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <section
      role="region"
      aria-labelledby="unicorn-empty-heading"
      className="rounded border border-dashed p-6 text-sm text-muted-foreground"
    >
      <h2 id="unicorn-empty-heading" className="sr-only">
        Unicorn Path
      </h2>
      {message}
    </section>
  );
}

function OnTrackChip({ onTrack }: { onTrack: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium " +
        (onTrack
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800")
      }
      role="status"
      aria-label={onTrack ? "On track" : "Off track"}
    >
      {onTrack ? "On track" : "Off track"}
    </span>
  );
}

function SpiralSvg({
  nodes,
}: {
  nodes: ReturnType<typeof buildSpiralNodes>;
}) {
  const cx = 100;
  const cy = 100;
  const scale = 80;
  return (
    <figure aria-labelledby="unicorn-spiral-title">
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-labelledby="unicorn-spiral-title unicorn-spiral-desc"
        className="w-full max-w-sm"
      >
        <title id="unicorn-spiral-title">Unicorn stage spiral</title>
        <desc id="unicorn-spiral-desc">
          Six stages from Genesis (S0) to Unicorn-track (S5) arranged as
          an outward spiral. The current stage is highlighted.
        </desc>
        {nodes.map((n, i) => {
          const px = cx + n.x * scale;
          const py = cy + n.y * scale;
          const r = n.state === "current" ? 12 : 7;
          const fill =
            n.state === "past"
              ? "#94a3b8"
              : n.state === "current"
                ? "#7c3aed"
                : "#e5e7eb";
          return (
            <g key={n.id}>
              <circle cx={px} cy={py} r={r} fill={fill}>
                {n.state === "current" ? (
                  <animate
                    attributeName="r"
                    values={`${r};${r + 3};${r}`}
                    dur="1.8s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </circle>
              <text
                x={px}
                y={py + 24}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
              >
                {n.id}
              </text>
              {i > 0 ? (
                <line
                  x1={cx + nodes[i - 1]!.x * scale}
                  y1={cy + nodes[i - 1]!.y * scale}
                  x2={px}
                  y2={py}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        Stage progression spiral, current stage pulsing.
      </figcaption>
    </figure>
  );
}

function TrustArcSvg({
  score,
  fullPath,
  filledPath,
  markerX,
  markerY,
}: {
  score: number;
  fullPath: string;
  filledPath: string;
  markerX: number;
  markerY: number;
}) {
  return (
    <figure aria-labelledby="unicorn-trust-title">
      <svg
        viewBox="0 0 200 130"
        role="img"
        aria-labelledby="unicorn-trust-title unicorn-trust-desc"
        className="w-full max-w-sm"
      >
        <title id="unicorn-trust-title">Trust Score arc</title>
        <desc id="unicorn-trust-desc">
          Trust Score {score} out of 100.
        </desc>
        <path
          d={fullPath}
          stroke="#e5e7eb"
          strokeWidth={12}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={filledPath}
          stroke="#7c3aed"
          strokeWidth={12}
          fill="none"
          strokeLinecap="round"
        />
        <circle cx={markerX} cy={markerY} r={6} fill="#7c3aed" />
        <text
          x={100}
          y={95}
          textAnchor="middle"
          fontSize="22"
          fontWeight="600"
          fill="currentColor"
        >
          {score}
        </text>
        <text
          x={100}
          y={112}
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
        >
          Trust Score
        </text>
      </svg>
    </figure>
  );
}

function RadarSvg({
  points,
}: {
  points: ReturnType<typeof buildRadarPoints>;
}) {
  const cx = 150;
  const cy = 150;
  const scale = 120;
  const poly = points
    .map((p) => `${(cx + p.x * scale).toFixed(1)},${(cy + p.y * scale).toFixed(1)}`)
    .join(" ");
  return (
    <figure aria-labelledby="unicorn-radar-title">
      <svg
        viewBox="0 0 300 300"
        role="img"
        aria-labelledby="unicorn-radar-title unicorn-radar-desc"
        className="w-full max-w-md"
      >
        <title id="unicorn-radar-title">12-area capability radar</title>
        <desc id="unicorn-radar-desc">
          Capability scores across the twelve mandatory areas.
        </desc>
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r * scale}
            stroke="#e5e7eb"
            fill="none"
          />
        ))}
        {points.map((p) => (
          <line
            key={p.area}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(p.angle) * scale}
            y2={cy + Math.sin(p.angle) * scale}
            stroke="#e5e7eb"
          />
        ))}
        <polygon
          points={poly}
          fill="rgba(124,58,237,0.25)"
          stroke="#7c3aed"
          strokeWidth={1.5}
        />
        {RADAR_AREAS.map((area, i) => {
          const angle =
            -Math.PI / 2 + (i * 2 * Math.PI) / RADAR_AREAS.length;
          const lx = cx + Math.cos(angle) * (scale + 14);
          const ly = cy + Math.sin(angle) * (scale + 14);
          return (
            <text
              key={area}
              x={lx}
              y={ly}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
            >
              {area}
            </text>
          );
        })}
      </svg>
    </figure>
  );
}

function BlockerQueue({ blockers }: { blockers: RawBlocker[] }) {
  if (blockers.length === 0) {
    return (
      <p className="text-sm text-emerald-700">No open critical blockers.</p>
    );
  }
  return (
    <section aria-labelledby="unicorn-blockers-heading">
      <h3
        id="unicorn-blockers-heading"
        className="text-sm font-semibold mb-2"
      >
        Blocker queue
      </h3>
      <ul className="grid gap-2">
        {blockers.map((b, i) => (
          <li
            key={`${b.code}-${i}`}
            className="rounded border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm"
          >
            <span className="font-mono text-xs text-amber-800">
              [{b.severity ?? "medium"}]
            </span>{" "}
            {b.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NextMilestoneCard({
  label,
  dueAt,
  ownerAgent,
}: {
  label: string;
  dueAt: string | null;
  ownerAgent: string | null;
}) {
  return (
    <section
      aria-labelledby="unicorn-milestone-heading"
      className="rounded border p-4"
    >
      <h3
        id="unicorn-milestone-heading"
        className="text-sm font-semibold mb-1"
      >
        Next milestone
      </h3>
      <p className="text-base">{label}</p>
      <p className="text-xs text-muted-foreground">
        {dueAt ? `Due ${new Date(dueAt).toLocaleDateString()}` : "No due date"}
        {ownerAgent ? ` · owner: ${ownerAgent.toUpperCase()}` : ""}
      </p>
    </section>
  );
}

function InvestorHistogram({ rows }: { rows: CohortRow[] }) {
  const hist = stageHistogram(rows);
  const stages: UnicornStageId[] = ["S0", "S1", "S2", "S3", "S4", "S5"];
  const max = Math.max(1, ...stages.map((s) => hist[s]));
  return (
    <section
      role="region"
      aria-labelledby="unicorn-investor-heading"
      className="grid gap-4"
    >
      <h2
        id="unicorn-investor-heading"
        className="text-xl font-semibold"
      >
        Portfolio unicorn distribution
      </h2>
      <figure aria-labelledby="unicorn-hist-title">
        <svg
          viewBox="0 0 300 160"
          role="img"
          aria-labelledby="unicorn-hist-title unicorn-hist-desc"
          className="w-full max-w-lg"
        >
          <title id="unicorn-hist-title">Portfolio distribution histogram</title>
          <desc id="unicorn-hist-desc">
            Count of businesses currently at each stage S0 through S5.
          </desc>
          {stages.map((s, i) => {
            const h = (hist[s] / max) * 120;
            const x = 20 + i * 45;
            const y = 130 - h;
            return (
              <g key={s}>
                <rect
                  x={x}
                  y={y}
                  width={30}
                  height={h}
                  fill="#7c3aed"
                  rx={2}
                />
                <text
                  x={x + 15}
                  y={148}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {s}
                </text>
                <text
                  x={x + 15}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {hist[s]}
                </text>
              </g>
            );
          })}
        </svg>
      </figure>
    </section>
  );
}
