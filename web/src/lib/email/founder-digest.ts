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

const PHASE_ORDINALS: readonly string[] = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
];

interface ClimbCell {
  phase: string;
  score: number;
  band: ReadinessBand;
  isCurrent: boolean;
}

/**
 * Project a `readinessByPhase` map into 12 cells (ordered 1..12) with
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
  const arrow =
    input.bandDirection === "up" ? "▲" : input.bandDirection === "down" ? "▼" : "—";

  const climbCells = input.readinessByPhase
    ? buildReadinessClimbSeries(input.readinessByPhase, input.phaseSlug)
    : null;
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
    ${climbBlock}
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
