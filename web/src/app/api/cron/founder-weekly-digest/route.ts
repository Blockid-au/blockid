// GET /api/cron/founder-weekly-digest
//
// P7a follow-up — docs/plans/atlassian-standard-mapping-goal.md §P7 exit
//   criteria: "digest section 'Your investor readiness this week' renders
//   {score band, delta vs last week, single next action, top-3 missing}".
//
// Weekly digest for active founders. For each founder active in the last
// 30 days:
//   1. Load their active project + phase progress + latest SVI + data-room
//      rows + evidence + compliance status (same loaders the
//      /api/nudge/next-steps route uses).
//   2. Call computeNextSteps() to derive phase / next_action / missing /
//      readiness score.
//   3. Fetch the previous svi_readiness_snapshots row for this founder
//      (before now) to compute a score delta + band-direction summary.
//   4. Persist the fresh snapshot (source='digest') so next week's delta
//      has a baseline.
//   5. Render the email via buildFounderDigest() and send it (honouring
//      the founder's email_preferences.weekly_reports flag).
//
// Auth: shared CRON_SECRET Bearer pattern.
// Kill switch: env FOUNDER_DIGEST=off short-circuits.
// Query params:
//   - skip_email=1 → dry-run (compute rows + subjects, DO NOT send +
//     DO NOT persist snapshots)

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { buildFounderDigest } from "@/lib/email/founder-digest";
import {
  computeNextSteps,
  type NudgePhaseProgressRow,
  type NudgeSviScoreRow,
  type NudgeDataroomRow,
  type NudgeEvidenceItem,
  type NudgeProject,
  type NudgeComplianceStatus,
  type NudgeResult,
} from "@/lib/nudge/next-steps";
import { computeComplianceMissing } from "@/lib/nudge/compliance-status";
import {
  computeReadinessDelta,
  fetchLatestReadinessSnapshot,
  toSnapshotRow,
  writeReadinessSnapshot,
} from "@/lib/nudge/readiness-snapshots";
import {
  canSendEmail,
  ensureEmailPreferences,
  getUnsubscribeUrl,
} from "@/lib/email-preferences";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FOUNDER_ACCOUNT_TYPES = ["founder"] as const;
const LAST_LOGIN_WINDOW_DAYS = 30;
const DASHBOARD_URL = "https://blockid.au/dashboard";

interface FounderRow {
  id: string;
  email: string;
  display_name: string | null;
}

interface DryRunSummary {
  founder_id: string;
  email: string;
  phase: string;
  readiness: number;
  band: string;
  band_direction: string;
  missing_count: number;
  subject: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (process.env.FOUNDER_DIGEST === "off") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "not_configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const skipEmail = url.searchParams.get("skip_email") === "1";

  const cutoff = new Date(
    Date.now() - LAST_LOGIN_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: foundersData, error: foundersErr } = await supabase
    .from("app_users")
    .select("id, email, display_name")
    .in("account_type", FOUNDER_ACCOUNT_TYPES as unknown as string[])
    .gte("last_login_at", cutoff);

  if (foundersErr) {
    return NextResponse.json(
      {
        ok: false,
        reason: "founders_query_failed",
        error: foundersErr.message,
      },
      { status: 500 },
    );
  }
  const founders = (foundersData ?? []) as FounderRow[];

  if (founders.length === 0) {
    return NextResponse.json({ ok: true, founder_count: 0, emailed: 0 });
  }

  const dryRun: DryRunSummary[] = [];
  let emailed = 0;
  let failures = 0;
  const nowIso = new Date().toISOString();

  for (const founder of founders) {
    if (!founder.email) continue;

    try {
      const nudge = await buildNudgeFor(supabase, founder);

      // Previous snapshot for delta — always fetched BEFORE we persist the
      // fresh one below so the "before" cutoff still catches it.
      const previous = await fetchLatestReadinessSnapshot(supabase, {
        userId: founder.id,
        projectId: nudge.projectId,
        before: nowIso,
      });

      const snapshotRow = toSnapshotRow(nudge.result, {
        userId: founder.id,
        projectId: nudge.projectId,
        source: "digest",
      });
      const delta = computeReadinessDelta(snapshotRow, previous);

      const name = founder.display_name || founder.email.split("@")[0];
      const digest = buildFounderDigest({
        name,
        phaseSlug: nudge.result.current_phase.slug,
        phaseLabel: nudge.result.current_phase.label,
        readinessScore: snapshotRow.overall_score,
        band: snapshotRow.band,
        deltaSummary: delta.summary,
        bandDirection: delta.band_direction,
        nextAction:
          nudge.result.next_action.category === "phase_advance" &&
          nudge.result.missing.length === 0
            ? null
            : nudge.result.next_action,
        missingTop3: snapshotRow.missing_top3,
        dashboardUrl: DASHBOARD_URL,
        readinessByPhase: nudge.result.readiness_by_phase,
        previousReadinessByPhase:
          (previous?.readiness_by_phase as
            | typeof nudge.result.readiness_by_phase
            | undefined) ?? undefined,
      });

      if (skipEmail) {
        dryRun.push({
          founder_id: founder.id,
          email: founder.email,
          phase: nudge.result.current_phase.slug,
          readiness: snapshotRow.overall_score,
          band: snapshotRow.band,
          band_direction: delta.band_direction,
          missing_count: snapshotRow.missing_top3.length,
          subject: digest.subject,
        });
        continue;
      }

      // Honour weekly_reports opt-out (per email_preferences.ts).
      const allowed = await canSendEmail(founder.email, "weekly_reports");
      if (!allowed) continue;

      let unsubscribeUrl: string | undefined;
      try {
        const token = await ensureEmailPreferences(founder.email);
        unsubscribeUrl = getUnsubscribeUrl(token, "weekly_reports");
      } catch (err) {
        console.warn(
          "[founder-weekly-digest] unsubscribe url prep failed",
          founder.email,
          err,
        );
      }

      // Re-render with the unsubscribe link now that we have it.
      const digestForSend = unsubscribeUrl
        ? buildFounderDigest({
            name,
            phaseSlug: nudge.result.current_phase.slug,
            phaseLabel: nudge.result.current_phase.label,
            readinessScore: snapshotRow.overall_score,
            band: snapshotRow.band,
            deltaSummary: delta.summary,
            bandDirection: delta.band_direction,
            nextAction:
              nudge.result.next_action.category === "phase_advance" &&
              nudge.result.missing.length === 0
                ? null
                : nudge.result.next_action,
            missingTop3: snapshotRow.missing_top3,
            dashboardUrl: DASHBOARD_URL,
            readinessByPhase: nudge.result.readiness_by_phase,
        previousReadinessByPhase:
          (previous?.readiness_by_phase as
            | typeof nudge.result.readiness_by_phase
            | undefined) ?? undefined,
            unsubscribeUrl,
          })
        : digest;

      const res = await sendEmail({
        to: founder.email,
        subject: digestForSend.subject,
        html: digestForSend.html,
        unsubscribeUrl,
      });
      if (res && (res as { ok?: boolean }).ok !== false) {
        emailed++;
        // Persist the fresh snapshot so next week's delta anchors here.
        await writeReadinessSnapshot(supabase, snapshotRow);
      } else {
        failures++;
      }
    } catch (err) {
      failures++;
      console.warn(
        "[founder-weekly-digest] tick failed for",
        founder.email,
        err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    founder_count: founders.length,
    emailed,
    failures,
    dry_run: skipEmail ? dryRun : undefined,
  });
}

// ---------------------------------------------------------------------------
// Per-founder loader — mirrors /api/nudge/next-steps route.
// Kept inline to avoid coupling the API route to the cron.
// ---------------------------------------------------------------------------

interface NudgeBundle {
  projectId: string | null;
  result: NudgeResult;
}

async function buildNudgeFor(
  // typed loosely to avoid the SupabaseClient generic drift here — the cron
  // is service-role only and this file is server-side.
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  founder: FounderRow,
): Promise<NudgeBundle> {
  // Active project (is_default).
  const { data: projectRow } = await supabase
    .from("projects")
    .select("id, growth_phase_current, growth_completion_pct")
    .eq("user_id", founder.id)
    .is("archived_at", null)
    .eq("is_default", true)
    .maybeSingle();
  const projectId: string | null = projectRow?.id ?? null;

  const nudgeProject: NudgeProject | null = projectRow
    ? {
        id: projectRow.id,
        growth_phase_current: projectRow.growth_phase_current ?? null,
        growth_completion_pct: projectRow.growth_completion_pct ?? null,
      }
    : null;

  // Phase progress — project-scoped first, then account-scoped fallback.
  let phaseProgress: NudgePhaseProgressRow[] = [];
  if (projectId) {
    const { data } = await supabase
      .from("startup_phase_progress")
      .select(
        "phase_id, phase_order, status, completion_pct, started_at, completed_at, updated_at",
      )
      .eq("project_id", projectId)
      .order("phase_order", { ascending: true });
    phaseProgress = (data ?? []) as NudgePhaseProgressRow[];
  }
  if (phaseProgress.length === 0) {
    const { data: accRow } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", founder.email)
      .maybeSingle();
    if (accRow?.id) {
      const { data } = await supabase
        .from("startup_phase_progress")
        .select(
          "phase_id, phase_order, status, completion_pct, started_at, completed_at, updated_at",
        )
        .eq("account_id", accRow.id)
        .order("phase_order", { ascending: true });
      phaseProgress = (data ?? []) as NudgePhaseProgressRow[];
    }
  }

  // Latest SVI analysis.
  let sviScores: NudgeSviScoreRow[] = [];
  const { data: sviRow } = await supabase
    .from("svi_analyses")
    .select("analysis_json")
    .eq("email", founder.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sviRow?.analysis_json) {
    sviScores = extractSviScores(sviRow.analysis_json);
  }

  // Data-room rows — user-scoped.
  const { data: drRows } = await supabase
    .from("dataroom_files")
    .select("svi_dimension, file_name, status, mime_type")
    .eq("user_id", founder.id);
  const dataroomRows: NudgeDataroomRow[] = (drRows ?? []) as NudgeDataroomRow[];

  // Evidence items — account-scoped.
  let evidenceItems: NudgeEvidenceItem[] = [];
  const { data: accForEv } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", founder.email)
    .maybeSingle();
  if (accForEv?.id) {
    const { data: evRows } = await supabase
      .from("evidence_items")
      .select("dimension, evidence_type, confidence_level")
      .eq("account_id", accForEv.id);
    evidenceItems = (evRows ?? []) as NudgeEvidenceItem[];
  }

  let complianceStatus: NudgeComplianceStatus | undefined;
  try {
    complianceStatus = await computeComplianceMissing(
      supabase,
      founder.id,
      projectId,
    );
  } catch (err) {
    console.warn(
      "[founder-weekly-digest] compliance snapshot failed",
      founder.email,
      err,
    );
  }

  const result = computeNextSteps({
    user: { id: founder.id, email: founder.email },
    project: nudgeProject,
    phaseProgress,
    sviScores,
    dataroomRows,
    evidenceItems,
    complianceStatus,
  });

  return { projectId, result };
}

// Same shape as /api/nudge/next-steps route.ts extractSviScores() — kept
// inline so this cron does not import from an API route file.
function extractSviScores(json: unknown): NudgeSviScoreRow[] {
  if (!json || typeof json !== "object") return [];
  const j = json as Record<string, unknown>;
  const out: NudgeSviScoreRow[] = [];

  const criteria = j.criteria;
  if (criteria && typeof criteria === "object") {
    for (const [key, value] of Object.entries(criteria)) {
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        const score = typeof v.score === "number" ? v.score : null;
        if (score !== null) {
          out.push({ criterion_key: key, score });
        }
      }
    }
  }

  const dimensions = j.dimensions;
  if (Array.isArray(dimensions)) {
    for (const d of dimensions) {
      if (d && typeof d === "object") {
        const v = d as Record<string, unknown>;
        const dim =
          (typeof v.key === "string" && v.key) ||
          (typeof v.dimension === "string" && v.dimension) ||
          null;
        const score = typeof v.score === "number" ? v.score : null;
        if (dim && score !== null) {
          out.push({ dimension: dim, score });
        }
      }
    }
  }

  return out;
}
