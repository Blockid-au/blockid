// FounderWeeklyDigest — pure email helpers (P7a).
//
// Consumed by /api/cron/founder-weekly-digest (docs/plans/
// atlassian-standard-mapping-goal.md §P7 exit criteria — "digest section
// 'Your investor readiness this week' renders {score band, delta vs
// last week, single next action, top-3 missing}"). Sibling to
// investor-digest.ts; kept side-effect-free so the digest can be unit
// tested + dry-run without a Supabase client.

import type { NudgeMissingItem, NudgeNextAction } from "@/lib/nudge/next-steps";
import type {
  PhaseReadinessEntry,
  ReadinessBand,
} from "@/lib/nudge/readiness-by-phase";
import type { BandDirection } from "@/lib/nudge/readiness-snapshots";
import { GROWTH_PHASE_IDS } from "@/lib/growth/phase-taxonomy";

export interface BuildFounderDigestInput {
  name: string;
  phaseSlug: string;
  phaseLabel: string;
  readinessScore: number;
  band: ReadinessBand;
  deltaSummary: string;
  bandDirection: BandDirection;
  nextAction: NudgeNextAction | null;
  missingTop3: NudgeMissingItem[];
  dashboardUrl: string;
  unsubscribeUrl?: string;
  /**
   * Per-phase readiness climb (P7a-readiness-climb) — one entry per
   * PhaseKey (1..12) keyed by stringified ordinal, sourced from
   * `NudgeResult.readiness_by_phase`. When present, the digest renders a
   * 12-cell mini-spark so the founder sees their readiness pattern across
   * the whole journey, not just the current phase. When absent, the
   * section is silently omitted so older callers keep the pre-P7a shape.
   */
  readinessByPhase?: Record<string, PhaseReadinessEntry>;
  /**
   * Previous week's per-phase readiness map (P7a-climb-delta) — sourced
   * from the previous `svi_readiness_snapshots` row's `readiness_by_phase`
   * jsonb column (migration 0113). When both `readinessByPhase` and
   * `previousReadinessByPhase` are present, the digest renders a per-phase
   * before/after chart alongside the current climb so the founder sees
   * which phases moved this week — not just the blended overall score.
   * When either input is absent (first digest, older callers), the delta
   * section is silently omitted so nothing regresses.
   */
  previousReadinessByPhase?: Record<string, PhaseReadinessEntry>;
  /**
   * Startup Package progress block (subgoal 10). When present, the digest
   * PREPENDS a "Package progress" section above the readiness climb — the
   * founder sees their guided-Package position first, then the underlying
   * readiness signal. The block is a pure input so the founder-digest lib
   * stays side-effect-free; the cron builder is responsible for gating on
   * `package_purchased_at` + `email_preferences.package_progress` before
   * populating this field. When absent, the digest renders unchanged so
   * older callers keep the pre-subgoal-10 shape.
   */
  packageProgress?: PackageProgressInput;
}

/**
 * Data the founder digest needs to render the Package progress block.
 * Pure — the cron builder fetches this from `startup_package_progress`,
 * `startup_package_interview`, `svi_snapshots`, and `credits.ts:FEATURE_COSTS`
 * (see `buildPackageProgressBlock` for the composed helper).
 */
export interface PackageProgressInput {
  /** Current phase title, e.g. "Customer Development". */
  currentPhaseTitle: string;
  /** Slug ordinal (1-12) — used for the `Phase N of 12` label. */
  currentPhaseSlug: string;
  /** Whole-percent completion of the current phase (0-100). */
  currentPhaseCompletionPct: number;
  /** SVI value from this week's snapshot. */
  sviCurrent: number;
  /** SVI value from last week's snapshot (or null for the first digest). */
  sviPrevious: number | null;
  /**
   * Next credit-priced action pulled from unfinished deliverables. Null
   * when the founder is fully caught up for this phase.
   */
  nextAction: {
    label: string;
    creditCost: number;
    href: string;
  } | null;
  /** Count of interview steps not yet answered (0-8). */
  unfinishedInterviewSteps: number;
  /** Deep-link CTA to the Package dashboard for this project. */
  packageDashboardUrl: string;
}

export interface PackageProgressBlock {
  html: string;
  text: string;
}

export interface FounderDigestEmail {
  subject: string;
  html: string;
  text: string;
}

const AFSL_DISCLAIMER =
  "General information only, not personal financial product advice per s766B Corporations Act 2001 (Cth). BlockID does not hold an Australian Financial Services Licence.";

const BAND_LABEL: Record<ReadinessBand, string> = {
  "not-ready": "Not investor-ready yet",
  "warming-up": "Warming up",
  "investor-ready": "Investor-ready",
};

const BAND_COLOUR: Record<ReadinessBand, string> = {
  "not-ready": "#be123c",
  "warming-up": "#b45309",
  "investor-ready": "#047857",
};

const CLIMB_BAND_FILL: Record<ReadinessBand, string> = {
  "not-ready": "#fecaca",
  "warming-up": "#fde68a",
  "investor-ready": "#bbf7d0",
};

// G8-P0: readiness_by_phase is keyed by the canonical growth-phase taxonomy
// ("vision".."funding"), not the numeric one. Snapshots written before that
// change carry "1".."12" keys and simply gap-fill to score=0 here.
const PHASE_ORDINALS: readonly string[] = GROWTH_PHASE_IDS;

interface ClimbCell {
  phase: string;
  score: number;
  band: ReadinessBand;
  isCurrent: boolean;
}

/**
 * Project a `readinessByPhase` map into 12 cells (ordered vision→funding) with
 * gap-fill (score=0 / band="not-ready") for missing phases and a single
 * `isCurrent` flag on the phase matching `currentPhaseSlug`. Pure, exported
 * for the vitest fixture.
 */
export function buildReadinessClimbSeries(
  readinessByPhase: Record<string, PhaseReadinessEntry> | undefined,
  currentPhaseSlug: string,
): ClimbCell[] {
  return PHASE_ORDINALS.map((p) => {
    const entry = readinessByPhase?.[p];
    const raw =
      typeof entry?.score === "number" && Number.isFinite(entry.score)
        ? entry.score
        : 0;
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const band: ReadinessBand = entry?.band ?? "not-ready";
    return { phase: p, score, band, isCurrent: p === currentPhaseSlug };
  });
}

/** Signed direction of a per-phase week-over-week readiness change. */
export type ClimbDeltaDirection = "up" | "down" | "same" | "new";

export interface ClimbDeltaCell {
  phase: string;
  currScore: number;
  prevScore: number;
  delta: number;
  direction: ClimbDeltaDirection;
  currBand: ReadinessBand;
  prevBand: ReadinessBand;
  isCurrent: boolean;
}

/**
 * Pick the single phase with the largest absolute week-over-week delta
 * (magnitude only — the *causal* action attribution is a separate tick
 * that needs the reseller-monitor edit-log stream). Returns null when the
 * series is empty OR every cell resolved to `direction === "same"` (a
 * fully-flat week has nothing to highlight). Ties break by (a) the current
 * phase first — a founder cares more about the phase they're standing in
 * than an equally-large delta elsewhere, (b) then phase ordinal ascending
 * so an earlier phase wins over a later one, keeping output deterministic
 * across snapshots. `"new"` cells count as movers using their current
 * score as the magnitude (0 → 40 is a bigger story than 88 → 90). Pure —
 * exported for the vitest fixture.
 */
export function pickBiggestMover(
  cells: ClimbDeltaCell[],
): ClimbDeltaCell | null {
  let best: ClimbDeltaCell | null = null;
  let bestMagnitude = 0;
  for (const cell of cells) {
    if (cell.direction === "same") continue;
    const magnitude =
      cell.direction === "new" ? Math.abs(cell.currScore) : Math.abs(cell.delta);
    if (magnitude <= 0) continue;
    if (!best) {
      best = cell;
      bestMagnitude = magnitude;
      continue;
    }
    if (magnitude > bestMagnitude) {
      best = cell;
      bestMagnitude = magnitude;
      continue;
    }
    if (magnitude === bestMagnitude) {
      if (cell.isCurrent && !best.isCurrent) {
        best = cell;
        bestMagnitude = magnitude;
        continue;
      }
      if (
        cell.isCurrent === best.isCurrent &&
        Number(cell.phase) < Number(best.phase)
      ) {
        best = cell;
        bestMagnitude = magnitude;
      }
    }
  }
  return best;
}

/**
 * Walk 12 phases and pair the current readiness map with the previous
 * digest snapshot, returning per-phase before/after with signed deltas.
 * Direction `"new"` fires when the current tick has a real score but the
 * previous snapshot didn't (either a new phase entering the map or the
 * founder's first weekly digest with per-phase persistence). Pure — no
 * I/O. Exported for the vitest fixture.
 */
export function buildReadinessClimbDeltaSeries(
  currentByPhase: Record<string, PhaseReadinessEntry> | undefined,
  previousByPhase: Record<string, PhaseReadinessEntry> | undefined,
  currentPhaseSlug: string,
): ClimbDeltaCell[] {
  const curr = buildReadinessClimbSeries(currentByPhase, currentPhaseSlug);
  return curr.map((cell) => {
    const prevEntry = previousByPhase?.[cell.phase];
    const prevHas =
      prevEntry !== undefined &&
      typeof prevEntry.score === "number" &&
      Number.isFinite(prevEntry.score);
    const prevScore = prevHas
      ? Math.max(0, Math.min(100, Math.round(prevEntry!.score)))
      : 0;
    const prevBand: ReadinessBand = prevHas
      ? (prevEntry!.band ?? "not-ready")
      : "not-ready";
    const delta = cell.score - prevScore;
    let direction: ClimbDeltaDirection;
    if (!prevHas) direction = cell.score > 0 ? "new" : "same";
    else if (delta > 0) direction = "up";
    else if (delta < 0) direction = "down";
    else direction = "same";
    return {
      phase: cell.phase,
      currScore: cell.score,
      prevScore,
      delta,
      direction,
      currBand: cell.band,
      prevBand,
      isCurrent: cell.isCurrent,
    };
  });
}

/**
 * Build the "Startup Package progress" section that gets PREPENDED above
 * the readiness climb when a founder is on the Package. Pure — no I/O.
 * Returns HTML + text mirrors that both the digest builder and any
 * standalone tooling (e.g. a per-founder preview page) can render.
 *
 * Layout:
 *   (a) current phase title + a 12-step progress bar of the current phase,
 *   (b) SVI delta vs last week (signed, coloured up/down/flat),
 *   (c) next credit-priced action (or a "caught up" message),
 *   (d) unfinished interview steps count (badge only when > 0).
 */
export function buildPackageProgressBlock(
  input: PackageProgressInput,
): PackageProgressBlock {
  const pct = Math.max(0, Math.min(100, Math.round(input.currentPhaseCompletionPct)));
  const sviDelta =
    input.sviPrevious !== null && Number.isFinite(input.sviPrevious)
      ? input.sviCurrent - input.sviPrevious
      : null;
  const sviArrow =
    sviDelta === null || sviDelta === 0 ? "—" : sviDelta > 0 ? "▲" : "▼";
  const sviColour =
    sviDelta === null || sviDelta === 0
      ? "#64748b"
      : sviDelta > 0
        ? "#047857"
        : "#be123c";
  const sviDeltaLabel =
    sviDelta === null
      ? "first snapshot"
      : sviDelta === 0
        ? "no change this week"
        : `${sviDelta > 0 ? "+" : ""}${sviDelta} pts vs last week`;

  const nextActionBlock = input.nextAction
    ? `<p style="margin:8px 0 0;font-size:13px;color:#0f172a"><strong>Next paid action:</strong> ${escapeHtml(input.nextAction.label)} <span style="color:#0369a1;font-weight:600">· ${input.nextAction.creditCost} credits</span></p>
       <p style="margin:6px 0 0"><a href="${escapeAttr(input.nextAction.href)}" style="color:#0f766e;font-weight:600;text-decoration:none">Run this action →</a></p>`
    : `<p style="margin:8px 0 0;font-size:13px;color:#475569"><em>Caught up for this phase — no paid actions queued.</em></p>`;

  const unfinishedBadge =
    input.unfinishedInterviewSteps > 0
      ? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#fef3c7;color:#92400e;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">${input.unfinishedInterviewSteps} interview step${input.unfinishedInterviewSteps === 1 ? "" : "s"} left</span>`
      : `<span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#dcfce7;color:#166534;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Interview complete</span>`;

  const html = `
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f0f9ff">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Startup Package · Progress this week</p>
        <h2 style="margin:2px 0 6px;font-size:16px;color:#0f172a">
          Phase ${escapeHtml(input.currentPhaseSlug)} of 12 · ${escapeHtml(input.currentPhaseTitle)}
          ${unfinishedBadge}
        </h2>
        <div style="height:8px;width:100%;background:#e0f2fe;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:#0f766e"></div>
        </div>
        <p style="margin:6px 0 0;font-size:12px;color:#475569">${pct}% of this phase's deliverables complete.</p>
        <p style="margin:10px 0 0;font-size:13px;color:#0f172a"><strong>SVI:</strong> ${input.sviCurrent} <span style="color:${sviColour};font-weight:600">${sviArrow} ${escapeHtml(sviDeltaLabel)}</span></p>
        ${nextActionBlock}
        <p style="margin:12px 0 0"><a href="${escapeAttr(input.packageDashboardUrl)}" style="color:#0f766e;font-weight:600;text-decoration:none">Open Package dashboard →</a></p>
      </div>`;

  const textLines: string[] = [];
  textLines.push("Startup Package — Progress this week");
  textLines.push(
    `Phase ${input.currentPhaseSlug} of 12 · ${input.currentPhaseTitle} — ${pct}% complete`,
  );
  textLines.push(`SVI: ${input.sviCurrent} (${sviArrow} ${sviDeltaLabel})`);
  if (input.nextAction) {
    textLines.push(
      `Next paid action: ${input.nextAction.label} · ${input.nextAction.creditCost} credits`,
    );
    textLines.push(`  ${input.nextAction.href}`);
  } else {
    textLines.push("Caught up for this phase — no paid actions queued.");
  }
  textLines.push(
    input.unfinishedInterviewSteps > 0
      ? `Interview steps left: ${input.unfinishedInterviewSteps}`
      : "Interview complete",
  );
  textLines.push(`Package dashboard: ${input.packageDashboardUrl}`);

  return { html, text: textLines.join("\n") };
}

export function buildFounderDigest(
  input: BuildFounderDigestInput,
): FounderDigestEmail {
  const name = input.name || "there";
  const score = clamp(input.readinessScore);

  const subject =
    input.bandDirection === "up"
      ? `Readiness up — you're now ${BAND_LABEL[input.band].toLowerCase()} (${score}/100)`
      : input.bandDirection === "down"
        ? `Readiness slipped — top raise-blocker to fix this week`
        : `Your BlockID readiness — ${score}/100 · Phase ${input.phaseSlug}`;

  const html = renderHtml(input, score);
  const text = renderText(input, score);

  return { subject, html, text };
}

function renderHtml(input: BuildFounderDigestInput, score: number): string {
  const bandColour = BAND_COLOUR[input.band];
  const bandLabel = BAND_LABEL[input.band];
  const packageBlock = input.packageProgress
    ? buildPackageProgressBlock(input.packageProgress).html
    : "";
  const arrow =
    input.bandDirection === "up" ? "▲" : input.bandDirection === "down" ? "▼" : "—";

  const climbCells = input.readinessByPhase
    ? buildReadinessClimbSeries(input.readinessByPhase, input.phaseSlug)
    : null;

  const climbDeltaCells =
    input.readinessByPhase && input.previousReadinessByPhase
      ? buildReadinessClimbDeltaSeries(
          input.readinessByPhase,
          input.previousReadinessByPhase,
          input.phaseSlug,
        )
      : null;
  const climbDeltaMoved =
    !!climbDeltaCells && climbDeltaCells.some((c) => c.direction !== "same");
  const biggestMover = climbDeltaMoved
    ? pickBiggestMover(climbDeltaCells!)
    : null;
  const moverCalloutBlock = biggestMover
    ? (() => {
        const copy = formatMoverCallout(biggestMover);
        return `
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Biggest mover this week</p>
        <p style="margin:0;font-size:14px;color:${copy.colour};font-weight:600">${copy.icon} ${escapeHtml(copy.headline)}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:12px">${escapeHtml(copy.hint)}</p>
      </div>`;
      })()
    : "";
  const climbDeltaBlock =
    climbDeltaMoved && climbDeltaCells
      ? `
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Week-over-week climb</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
          <tr>
            <th align="left" style="font-size:11px;color:#64748b;padding:4px 6px;font-weight:600">Phase</th>
            <th align="right" style="font-size:11px;color:#64748b;padding:4px 6px;font-weight:600">Last week</th>
            <th align="right" style="font-size:11px;color:#64748b;padding:4px 6px;font-weight:600">This week</th>
            <th align="right" style="font-size:11px;color:#64748b;padding:4px 6px;font-weight:600">Delta</th>
          </tr>
          ${climbDeltaCells
            .map((c) => {
              const arrow =
                c.direction === "up"
                  ? "▲"
                  : c.direction === "down"
                    ? "▼"
                    : c.direction === "new"
                      ? "★"
                      : "—";
              const deltaColour =
                c.direction === "up"
                  ? "#047857"
                  : c.direction === "down"
                    ? "#be123c"
                    : c.direction === "new"
                      ? "#0369a1"
                      : "#64748b";
              const signed =
                c.direction === "new"
                  ? "new"
                  : c.delta > 0
                    ? `+${c.delta}`
                    : c.delta < 0
                      ? `${c.delta}`
                      : "0";
              const rowStyle = c.isCurrent
                ? "background:#ecfeff;font-weight:600"
                : "";
              return `
          <tr style="${rowStyle}">
            <td style="font-size:12px;color:#0f172a;padding:4px 6px">Phase ${escapeHtml(c.phase)}${c.isCurrent ? " · you are here" : ""}</td>
            <td align="right" style="font-size:12px;color:#475569;padding:4px 6px">${c.prevScore}/100</td>
            <td align="right" style="font-size:12px;color:#0f172a;padding:4px 6px">${c.currScore}/100</td>
            <td align="right" style="font-size:12px;color:${deltaColour};padding:4px 6px">${arrow} ${signed}</td>
          </tr>`;
            })
            .join("")}
        </table>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b">Compared to your last digest snapshot. ★ = a phase that entered the map this week; — = held steady.</p>
      </div>`
      : "";
  const climbBlock = climbCells
    ? `
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Readiness across all 12 phases</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            ${climbCells
              .map(
                (c) => `
            <td style="padding:0 3px;vertical-align:bottom" title="Phase ${escapeAttr(c.phase)} — ${c.score}/100 (${escapeAttr(BAND_LABEL[c.band])})">
              <div style="width:24px;height:${Math.max(4, Math.round((c.score / 100) * 48))}px;background:${CLIMB_BAND_FILL[c.band]};border:${c.isCurrent ? "2px solid #0f766e" : "1px solid #e2e8f0"};border-radius:3px"></div>
              <div style="font-size:10px;color:${c.isCurrent ? "#0f766e" : "#64748b"};text-align:center;margin-top:2px;font-weight:${c.isCurrent ? "700" : "400"}">${escapeHtml(c.phase)}</div>
            </td>`,
              )
              .join("")}
          </tr>
        </table>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b">Your Phase ${escapeHtml(input.phaseSlug)} column is outlined in teal. Bars use band colours: red = not-ready, amber = warming-up, green = investor-ready.</p>
      </div>`
    : "";

  const nextActionBlock = input.nextAction
    ? `
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
        <p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Do this next</p>
        <h2 style="margin:6px 0 4px;font-size:16px">${escapeHtml(input.nextAction.title)}</h2>
        <p style="margin:0 0 12px;color:#475569;font-size:13px">${escapeHtml(input.nextAction.reason)}</p>
        <a href="${escapeAttr(input.nextAction.cta_url)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(input.nextAction.cta_label)}</a>
      </div>`
    : `
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
        <p style="margin:0;color:#475569;font-size:13px">Your data room is caught up for this phase — kick off the next one from your dashboard.</p>
      </div>`;

  const missingBlock =
    input.missingTop3.length > 0
      ? `
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Top 3 gaps</p>
        <ol style="margin:0;padding-left:20px;color:#0f172a;font-size:13px">
          ${input.missingTop3
            .map(
              (m) => `
          <li style="margin:6px 0">
            <a href="${escapeAttr(m.cta_url)}" style="color:#0f766e;font-weight:600;text-decoration:none">${escapeHtml(m.title)}</a>
            ${m.raise_blocker ? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#fecaca;color:#991b1b;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Blocker</span>` : ""}
            <div style="color:#64748b;font-size:12px;margin-top:2px">${escapeHtml(m.why_it_matters)}</div>
          </li>`,
            )
            .join("")}
        </ol>
      </div>`
      : "";

  return `<!doctype html>
<html><body style="font-family:-apple-system,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="padding:24px;border-bottom:1px solid #e2e8f0">
      <p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Founder · Weekly readiness digest</p>
      <h1 style="margin:8px 0 0;font-size:22px">Hi ${escapeHtml(input.name)},</h1>
      <p style="margin:8px 0 0;color:#475569;font-size:14px">You're in <strong>Phase ${escapeHtml(input.phaseSlug)} — ${escapeHtml(input.phaseLabel)}</strong>.</p>
    </div>
    <div style="padding:20px 24px;display:flex;gap:16px;align-items:baseline;flex-wrap:wrap">
      <div style="font-size:32px;font-weight:700;color:${bandColour}">${score}<span style="font-size:14px;color:#64748b;font-weight:400"> /100</span></div>
      <div>
        <div style="font-size:14px;font-weight:600;color:${bandColour}">${escapeHtml(bandLabel)}</div>
        <div style="font-size:12px;color:#475569;margin-top:2px">${arrow} ${escapeHtml(input.deltaSummary)}</div>
      </div>
    </div>
    ${packageBlock}
    ${climbBlock}
    ${moverCalloutBlock}
    ${climbDeltaBlock}
    ${nextActionBlock}
    ${missingBlock}
    <div style="padding:16px 24px;border-top:1px solid #e2e8f0">
      <a href="${escapeAttr(input.dashboardUrl)}" style="color:#0f766e;font-weight:600;text-decoration:none">Open your dashboard →</a>
    </div>
    <div style="padding:16px 24px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:11px;color:#64748b">
      ${escapeHtml(AFSL_DISCLAIMER)}
      ${input.unsubscribeUrl ? `<br/><a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#64748b">Unsubscribe</a>` : ""}
    </div>
  </div>
</body></html>`;
}

function renderText(input: BuildFounderDigestInput, score: number): string {
  const lines: string[] = [];
  lines.push(`Hi ${input.name},`, "");
  if (input.packageProgress) {
    const block = buildPackageProgressBlock(input.packageProgress);
    lines.push(block.text, "");
  }
  lines.push(`Phase ${input.phaseSlug} — ${input.phaseLabel}`);
  lines.push(`Readiness: ${score}/100 (${BAND_LABEL[input.band]})`);
  lines.push(input.deltaSummary, "");
  if (input.readinessByPhase) {
    const cells = buildReadinessClimbSeries(input.readinessByPhase, input.phaseSlug);
    lines.push("Readiness across all 12 phases:");
    for (const c of cells) {
      const marker = c.isCurrent ? "▶ " : "  ";
      lines.push(`  ${marker}Phase ${c.phase}: ${c.score}/100 (${BAND_LABEL[c.band]})`);
    }
    lines.push("");
  }
  if (input.readinessByPhase && input.previousReadinessByPhase) {
    const deltaCells = buildReadinessClimbDeltaSeries(
      input.readinessByPhase,
      input.previousReadinessByPhase,
      input.phaseSlug,
    );
    if (deltaCells.some((c) => c.direction !== "same")) {
      const mover = pickBiggestMover(deltaCells);
      if (mover) {
        const copy = formatMoverCallout(mover);
        lines.push(`Biggest mover this week: ${copy.icon} ${copy.headline}`);
        lines.push(`  ${copy.hint}`, "");
      }
      lines.push("Week-over-week climb (last week → this week · delta):");
      for (const c of deltaCells) {
        const marker = c.isCurrent ? "▶ " : "  ";
        const arrow =
          c.direction === "up"
            ? "▲"
            : c.direction === "down"
              ? "▼"
              : c.direction === "new"
                ? "★"
                : "—";
        const signed =
          c.direction === "new"
            ? "new"
            : c.delta > 0
              ? `+${c.delta}`
              : c.delta < 0
                ? `${c.delta}`
                : "0";
        lines.push(
          `  ${marker}Phase ${c.phase}: ${c.prevScore}/100 → ${c.currScore}/100 (${arrow} ${signed})`,
        );
      }
      lines.push("");
    }
  }
  if (input.nextAction) {
    lines.push(`Do this next: ${input.nextAction.title}`);
    lines.push(`  ${input.nextAction.reason}`);
    lines.push(`  → ${input.nextAction.cta_url}`, "");
  } else {
    lines.push(
      "Your data room is caught up for this phase — kick off the next one.",
      "",
    );
  }
  if (input.missingTop3.length > 0) {
    lines.push("Top 3 gaps:");
    for (const m of input.missingTop3) {
      const chip = m.raise_blocker ? " [BLOCKER]" : "";
      lines.push(`  - ${m.title}${chip}`);
      lines.push(`      ${m.why_it_matters}`);
      lines.push(`      ${m.cta_url}`);
    }
    lines.push("");
  }
  lines.push(`Dashboard: ${input.dashboardUrl}`, "");
  lines.push(AFSL_DISCLAIMER);
  return lines.join("\n");
}

interface MoverCallout {
  headline: string;
  hint: string;
  icon: string;
  colour: string;
}

/**
 * Copy pack for the biggest-mover callout — direction-specific headline +
 * hint. Pure so the HTML + text mirrors + tests all render from the same
 * source of truth. Exported for the vitest fixture.
 */
export function formatMoverCallout(cell: ClimbDeltaCell): MoverCallout {
  const phaseLabel = `Phase ${cell.phase}`;
  const hereChip = cell.isCurrent ? " (you are here)" : "";
  if (cell.direction === "new") {
    return {
      headline: `${phaseLabel}${hereChip} entered your readiness map at ${cell.currScore}/100`,
      hint: "This phase wasn't scored in last week's digest — a fresh signal to steer the next tick.",
      icon: "★",
      colour: "#0369a1",
    };
  }
  if (cell.direction === "up") {
    return {
      headline: `${phaseLabel}${hereChip} climbed +${cell.delta} pts to ${cell.currScore}/100`,
      hint: "Your biggest week-over-week gain — keep the workflow that moved it.",
      icon: "▲",
      colour: "#047857",
    };
  }
  return {
    headline: `${phaseLabel}${hereChip} slipped ${cell.delta} pts to ${cell.currScore}/100`,
    hint: "Your biggest week-over-week drop — check what changed in your data room since the last digest.",
    icon: "▼",
    colour: "#be123c",
  };
}

function clamp(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
