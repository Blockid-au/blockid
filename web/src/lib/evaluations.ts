// evaluations — "Startups I'm evaluating" (T0270, G12 sprint S3).
//
// The ownership object between an evaluator (investor / accelerator /
// incubator / advisor / service provider — see 0310) and a startup they
// entered themselves. Each evaluation is:
//   • a `projects` row OWNED BY THE EVALUATOR (`projects.user_id` = evaluator,
//     `attribution_*` untouched — this is not a reseller-provisioned
//     workspace), and
//   • one `evaluations` row (migration 0314) carrying `owner_kind`,
//     `consent_tier` (the mentor access tiers), the optional founder invite
//     token and the evaluator's private label / notes.
//
// Plan quota: `plans.usage_limits.profiles` (Scout 25 / Firm 50 / Program 200,
// resolved by `getProjectLimit`) counts the startups an evaluator tracks, so
// the limit here is the number of `evaluations` rows they hold — a paying
// evaluator with 25 tracked startups is at the Scout cap regardless of any
// stray default project on the account.
//
// Claim semantics (docs/plans/evaluator-traction-2026-09-10.md §3c-4): the
// founder clicks the invite link, logs in, and POSTs
// /api/evaluations/claim/[token]. That flips `owner_kind='founder_claimed'`,
// `consent_tier='reports_shared'` and stamps `claimed_at` / `founder_user_id`.
// `projects.user_id` is NOT transferred — see the 0314 header: the evaluator's
// quota, credits ledger and every evaluator-scoped read key on that column;
// co-ownership is this row, not a rewrite of the project's owner. Consent
// upgrades beyond `reports_shared` (per-report toggles, full_mentor) are
// deliberately not wired here — T0271+ own that.
//
// T0271 (A$3 Trust BizReport inside the workspace) calls
// `canAccessProjectAsEvaluator(userId, projectId)` before generating a report
// for a project the caller does not own via `projects.user_id`.

import "server-only";
import { nanoid } from "nanoid";
import { getSupabaseAdmin } from "./supabase";
import { getProjectLimit } from "./projects";
import { sendEmail } from "./email";
import { can } from "./entitlements";
import type { AppUser } from "./auth";
import { MENTOR_ACCESS_TIERS, type MentorAccessTier } from "./mentor/access-tiers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const EVALUATION_OWNER_KINDS = [
  "evaluator",
  "founder_invited",
  "founder_claimed",
] as const;
export type EvaluationOwnerKind = (typeof EVALUATION_OWNER_KINDS)[number];

/** Consent tiers reuse the mentor access ladder — one vocabulary. */
export type EvaluationConsentTier = MentorAccessTier;
export const EVALUATION_CONSENT_TIERS = MENTOR_ACCESS_TIERS;

export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT", "national"] as const;
export type AuState = (typeof AU_STATES)[number];

/**
 * `app_users.account_type` values that may hold evaluations even when their
 * plan row lacks `investor.dealflow` (e.g. mid-trial before the plan row
 * syncs). Mirrors EVALUATOR_ACCOUNT_TYPE_OPTIONS (signup-plans.ts) plus the
 * legacy investor_* types 0102 already admits.
 */
export const EVALUATOR_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
  "investor",
  "investor_angel",
  "investor_vc",
  "accelerator",
  "incubator",
  "advisor",
  "service_provider",
]);

export interface Evaluation {
  id: string;
  evaluatorUserId: string;
  projectId: string;
  ownerKind: EvaluationOwnerKind;
  consentTier: EvaluationConsentTier;
  founderEmail: string | null;
  founderUserId: string | null;
  /** Present only for the evaluator's own rows (never sent to the founder). */
  inviteToken: string | null;
  invitedAt: string | null;
  claimedAt: string | null;
  label: string | null;
  notes: string | null;
  website: string | null;
  state: AuState | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationListRow extends Evaluation {
  projectName: string;
  projectSlug: string;
  projectIndustry: string | null;
  projectStage: number;
  projectDescription: string | null;
  latestSvi: number | null;
  latestSviAt: string | null;
}

export interface CreateEvaluationInput {
  name: string;
  website?: string | null;
  description?: string | null;
  founder_email?: string | null;
  state?: string | null;
  industry?: string | null;
}

export type CreateEvaluationResult =
  | { ok: true; evaluation: EvaluationListRow; inviteSent: boolean; used: number; limit: number }
  | { ok: false; error: "evaluation_limit_reached"; limit: number; used: number; message: string }
  | { ok: false; error: "invalid_input"; message: string }
  | { ok: false; error: "service_unavailable" | "create_failed"; message: string };

export type ClaimEvaluationResult =
  | { ok: true; evaluation: Evaluation; alreadyClaimed: boolean; projectName: string }
  | { ok: false; error: "not_found" | "email_mismatch" | "service_unavailable" | "claim_failed"; message: string };

export type EvaluatorProjectAccess =
  | { allowed: false }
  | { allowed: true; via: "evaluator" | "founder_claimed"; evaluation: Evaluation };

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const EVALUATION_COLUMNS =
  "id, evaluator_user_id, project_id, owner_kind, consent_tier, founder_email, founder_user_id, invite_token, invited_at, claimed_at, label, notes, website, state, created_at, updated_at";

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

export function mapEvaluationRow(row: Row): Evaluation {
  const ownerKind = String(row.owner_kind ?? "evaluator");
  const tier = String(row.consent_tier ?? "attributed_only");
  const state = str(row.state);
  return {
    id: String(row.id),
    evaluatorUserId: String(row.evaluator_user_id),
    projectId: String(row.project_id),
    ownerKind: (EVALUATION_OWNER_KINDS as readonly string[]).includes(ownerKind)
      ? (ownerKind as EvaluationOwnerKind)
      : "evaluator",
    consentTier: (MENTOR_ACCESS_TIERS as readonly string[]).includes(tier)
      ? (tier as MentorAccessTier)
      : "attributed_only",
    founderEmail: str(row.founder_email),
    founderUserId: str(row.founder_user_id),
    inviteToken: str(row.invite_token),
    invitedAt: str(row.invited_at),
    claimedAt: str(row.claimed_at),
    label: str(row.label),
    notes: str(row.notes),
    website: str(row.website),
    state: state && (AU_STATES as readonly string[]).includes(state) ? (state as AuState) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Input normalisation (pure — exported for the route + tests)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NormalisedCreateInput {
  name: string;
  website: string | null;
  description: string | null;
  founderEmail: string | null;
  state: AuState | null;
  industry: string | null;
}

export function normaliseCreateInput(
  raw: CreateEvaluationInput,
): { ok: true; value: NormalisedCreateInput } | { ok: false; message: string } {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, message: "Startup name is required" };
  if (name.length > 100) return { ok: false, message: "Startup name must be under 100 characters" };

  let website: string | null = null;
  if (typeof raw.website === "string" && raw.website.trim()) {
    let w = raw.website.trim();
    if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
    try {
      const u = new URL(w);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) {
        return { ok: false, message: "Website must be a valid URL" };
      }
      website = u.toString().replace(/\/$/, "");
    } catch {
      return { ok: false, message: "Website must be a valid URL" };
    }
  }

  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim().slice(0, 500)
      : null;

  let founderEmail: string | null = null;
  if (typeof raw.founder_email === "string" && raw.founder_email.trim()) {
    founderEmail = raw.founder_email.trim().toLowerCase();
    if (!EMAIL_RE.test(founderEmail) || founderEmail.length > 254) {
      return { ok: false, message: "Founder email must be a valid email address" };
    }
  }

  let state: AuState | null = null;
  if (typeof raw.state === "string" && raw.state.trim()) {
    const s = raw.state.trim();
    const upper = s.toUpperCase();
    if ((AU_STATES as readonly string[]).includes(upper)) state = upper as AuState;
    else if (s.toLowerCase() === "national") state = "national";
    else return { ok: false, message: "State must be one of NSW, VIC, QLD, WA, SA, TAS, ACT, NT or national" };
  }

  const industry =
    typeof raw.industry === "string" && raw.industry.trim()
      ? raw.industry.trim().slice(0, 60)
      : null;

  return { ok: true, value: { name, website, description, founderEmail, state, industry } };
}

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "startup"
  );
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URL the founder lands on; the evaluations page POSTs the claim. */
export function claimUrlForToken(token: string): string {
  const next = `/workspace/evaluations?claim=${encodeURIComponent(token)}`;
  return `${siteUrl()}/auth/login?next=${encodeURIComponent(next)}`;
}

/** Pure template — exported so the test can pin the copy without sending. */
export function buildFounderInviteEmail(args: {
  evaluatorName: string;
  startupName: string;
  claimUrl: string;
}): { subject: string; html: string } {
  const who = escapeHtml(args.evaluatorName);
  const startup = escapeHtml(args.startupName);
  const subject = `${args.evaluatorName} is evaluating ${args.startupName} on BlockID — claim it to share your evidence`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background:#F1F5F9;color:#0F172A;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;">
  <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748B;">BlockID.au</p>
  <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;">${who} is evaluating ${startup} on BlockID</h1>
  <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">${who} has added <strong>${startup}</strong> to the startups they are evaluating. Every startup they track is scored on the same 8-dimension rubric.</p>
  <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Claim it to share your evidence: once you claim the profile, any Trust BizReport ${who} runs on ${startup} is shared with you, and you can add the evidence that lifts the score — you stay in control of what is shared.</p>
  <p style="margin:24px 0;"><a href="${escapeHtml(args.claimUrl)}" style="display:inline-block;background:#4F46E5;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;">Claim ${startup} on BlockID</a></p>
  <p style="margin:0;font-size:12px;line-height:1.6;color:#64748B;">If you were not expecting this, ignore it — nothing is shared until you claim. Your data belongs to your startup; BlockID stores it so every report builds on your own evidence.</p>
</div></body></html>`;
  return { subject, html };
}

// ---------------------------------------------------------------------------
// Gate — who may hold evaluations
// ---------------------------------------------------------------------------

/**
 * True when the user may use the evaluations surface: plan grants
 * `investor.dealflow` OR `app_users.account_type` is an evaluator persona.
 * Reads account_type from the DB because `AppUser` does not carry it.
 */
export async function isEvaluatorUser(
  user: Pick<AppUser, "id" | "plan"> & { accountType?: string | null },
): Promise<boolean> {
  let accountType = user.accountType ?? null;
  if (accountType == null) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("app_users")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();
      accountType = (data?.account_type as string | null | undefined) ?? null;
    }
  }
  if (accountType && EVALUATOR_ACCOUNT_TYPES.has(accountType)) return true;
  return can(
    { id: user.id, plan: user.plan ?? "", segment: "investor" },
    "investor.dealflow",
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function countEvaluations(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("evaluations")
    .select("id", { count: "exact", head: true })
    .eq("evaluator_user_id", userId);
  if (error) {
    console.error("[blockid:evaluations] count failed", error);
    return 0;
  }
  return count ?? 0;
}

/** `{ used, limit }` for the plan banner — `used` = evaluations held. */
export async function getEvaluationQuota(
  user: Pick<AppUser, "id" | "plan">,
): Promise<{ used: number; limit: number }> {
  const [used, limit] = await Promise.all([
    countEvaluations(user.id),
    getProjectLimit(user.plan ?? "free"),
  ]);
  return { used, limit };
}

async function latestSviByProject(
  projectIds: string[],
): Promise<Map<string, { svi: number; at: string }>> {
  const out = new Map<string, { svi: number; at: string }>();
  if (projectIds.length === 0) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  try {
    const { data, error } = await supabase
      .from("svi_snapshots")
      .select("project_id, svi_total, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(projectIds.length * 5);
    if (error || !data) return out;
    for (const r of data as Array<Row>) {
      const pid = str(r.project_id);
      if (!pid || out.has(pid)) continue;
      const svi = Number(r.svi_total);
      if (!Number.isFinite(svi)) continue;
      out.set(pid, { svi, at: String(r.created_at ?? "") });
    }
  } catch {
    /* snapshot read is decorative — never block the list */
  }
  return out;
}

/** All evaluations held by `userId`, newest first, joined to the project. */
export async function listEvaluations(userId: string): Promise<EvaluationListRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("evaluations")
    .select(`${EVALUATION_COLUMNS}, projects:project_id (name, slug, industry, stage, description, archived_at)`)
    .eq("evaluator_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    // 42P01 = migration 0314 not applied yet — degrade to the empty state.
    if ((error as { code?: string }).code !== "42P01") {
      console.error("[blockid:evaluations] list failed", error);
    }
    return [];
  }

  const rows = (data ?? []) as Array<Row & { projects?: Row | Row[] | null }>;
  const base = rows.map((r) => {
    const p = (Array.isArray(r.projects) ? r.projects[0] : r.projects) ?? {};
    return {
      ...mapEvaluationRow(r),
      projectName: String(p.name ?? "Untitled startup"),
      projectSlug: String(p.slug ?? ""),
      projectIndustry: str(p.industry),
      projectStage: Number(p.stage ?? 0) || 0,
      projectDescription: str(p.description),
      latestSvi: null as number | null,
      latestSviAt: null as string | null,
    };
  });

  const svi = await latestSviByProject(base.map((b) => b.projectId));
  return base.map((b) => {
    const hit = svi.get(b.projectId);
    return hit ? { ...b, latestSvi: hit.svi, latestSviAt: hit.at } : b;
  });
}

/** One evaluation, only if `userId` is its evaluator. */
export async function getEvaluationForUser(
  userId: string,
  evaluationId: string,
): Promise<Evaluation | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("evaluations")
    .select(EVALUATION_COLUMNS)
    .eq("id", evaluationId)
    .eq("evaluator_user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapEvaluationRow(data as Row);
}

/**
 * May `userId` act on `projectId` as an evaluator (or as the founder who
 * claimed it)? Pure project ownership (`projects.user_id`) is NOT consulted
 * here — callers that already own the project never need this check.
 */
export async function canAccessProjectAsEvaluator(
  userId: string,
  projectId: string,
): Promise<EvaluatorProjectAccess> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { allowed: false };
  const { data, error } = await supabase
    .from("evaluations")
    .select(EVALUATION_COLUMNS)
    .eq("project_id", projectId)
    .or(`evaluator_user_id.eq.${userId},founder_user_id.eq.${userId}`)
    .limit(5);
  if (error || !data) return { allowed: false };
  const rows = (data as Row[]).map(mapEvaluationRow);
  const asEvaluator = rows.find((r) => r.evaluatorUserId === userId);
  if (asEvaluator) return { allowed: true, via: "evaluator", evaluation: asEvaluator };
  const asFounder = rows.find(
    (r) => r.founderUserId === userId && r.ownerKind === "founder_claimed" && r.claimedAt,
  );
  if (asFounder) return { allowed: true, via: "founder_claimed", evaluation: asFounder };
  return { allowed: false };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createEvaluation(
  evaluator: Pick<AppUser, "id" | "email" | "plan" | "displayName">,
  rawInput: CreateEvaluationInput,
): Promise<CreateEvaluationResult> {
  const parsed = normaliseCreateInput(rawInput);
  if (!parsed.ok) return { ok: false, error: "invalid_input", message: parsed.message };
  const input = parsed.value;

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "service_unavailable", message: "Service unavailable" };

  // Plan quota — usage_limits.profiles via getProjectLimit (G12-7).
  const { used, limit } = await getEvaluationQuota(evaluator);
  if (used >= limit) {
    return {
      ok: false,
      error: "evaluation_limit_reached",
      limit,
      used,
      message: `Your plan tracks up to ${limit} startup${limit === 1 ? "" : "s"}. Upgrade to add more.`,
    };
  }

  // Slug unique per owner (projects UNIQUE(user_id, slug)).
  const { data: owned } = await supabase
    .from("projects")
    .select("slug, archived_at")
    .eq("user_id", evaluator.id);
  const ownedRows = (owned ?? []) as Array<{ slug: string; archived_at: string | null }>;
  const taken = new Set(ownedRows.map((p) => p.slug));
  let slug = toSlug(input.name);
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  const hasActiveProject = ownedRows.some((p) => !p.archived_at);

  // 1. projects row owned by the evaluator. attribution_* left untouched.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: evaluator.id,
      name: input.name,
      slug,
      description: input.description,
      industry: input.industry,
      is_default: !hasActiveProject,
    })
    .select("id, name, slug, industry, stage, description")
    .single();
  if (projectError || !project) {
    console.error("[blockid:evaluations] project insert failed", projectError);
    return { ok: false, error: "create_failed", message: "Failed to create the startup" };
  }
  const projectRow = project as Row;
  const projectId = String(projectRow.id);

  // 2. evaluations row (+ invite token when a founder email was given).
  const inviteToken = input.founderEmail ? nanoid(24) : null;
  const nowIso = new Date().toISOString();
  const { data: evalRow, error: evalError } = await supabase
    .from("evaluations")
    .insert({
      evaluator_user_id: evaluator.id,
      project_id: projectId,
      owner_kind: input.founderEmail ? "founder_invited" : "evaluator",
      consent_tier: "attributed_only",
      founder_email: input.founderEmail,
      invite_token: inviteToken,
      invited_at: inviteToken ? nowIso : null,
      website: input.website,
      state: input.state,
    })
    .select(EVALUATION_COLUMNS)
    .single();
  if (evalError || !evalRow) {
    console.error("[blockid:evaluations] evaluations insert failed", evalError);
    // Compensate: the project row is useless without its evaluation.
    await supabase.from("projects").delete().eq("id", projectId).eq("user_id", evaluator.id);
    return { ok: false, error: "create_failed", message: "Failed to record the evaluation" };
  }

  // 3. Founder invite — best effort; a mail outage must not undo the create.
  let inviteSent = false;
  if (inviteToken && input.founderEmail) {
    const evaluatorName = evaluator.displayName?.trim() || evaluator.email;
    const { subject, html } = buildFounderInviteEmail({
      evaluatorName,
      startupName: input.name,
      claimUrl: claimUrlForToken(inviteToken),
    });
    try {
      const sent = await sendEmail({ to: input.founderEmail, subject, html });
      inviteSent = sent.ok;
    } catch (err) {
      console.error("[blockid:evaluations] invite email failed", err);
    }
  }

  const evaluation: EvaluationListRow = {
    ...mapEvaluationRow(evalRow as Row),
    projectName: String(projectRow.name ?? input.name),
    projectSlug: String(projectRow.slug ?? slug),
    projectIndustry: str(projectRow.industry),
    projectStage: Number(projectRow.stage ?? 0) || 0,
    projectDescription: str(projectRow.description),
    latestSvi: null,
    latestSviAt: null,
  };
  return { ok: true, evaluation, inviteSent, used: used + 1, limit };
}

export async function updateEvaluation(
  userId: string,
  evaluationId: string,
  patch: { label?: string | null; notes?: string | null },
): Promise<Evaluation | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    update.label = typeof patch.label === "string" && patch.label.trim() ? patch.label.trim().slice(0, 120) : null;
  }
  if (patch.notes !== undefined) {
    update.notes = typeof patch.notes === "string" && patch.notes.trim() ? patch.notes.trim().slice(0, 20000) : null;
  }
  if (Object.keys(update).length === 0) return getEvaluationForUser(userId, evaluationId);

  const { data, error } = await supabase
    .from("evaluations")
    .update(update)
    .eq("id", evaluationId)
    .eq("evaluator_user_id", userId)
    .select(EVALUATION_COLUMNS)
    .maybeSingle();
  if (error || !data) return null;
  return mapEvaluationRow(data as Row);
}

/**
 * Soft delete: removes the evaluation row only. The `projects` row (and
 * every snapshot / report hanging off it) is kept — the evaluator may have
 * paid for a report on it and the founder may have claimed it.
 */
export async function deleteEvaluation(userId: string, evaluationId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", evaluationId)
    .eq("evaluator_user_id", userId)
    .select("id");
  if (error) {
    console.error("[blockid:evaluations] delete failed", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Founder claim. The token is single-purpose and unguessable (nanoid 24),
 * but because claiming makes the founder a co-owner of the evaluator's
 * project data, the logged-in email must match the invited address when one
 * was recorded. Idempotent: a second claim by the same founder returns
 * `alreadyClaimed: true` without rewriting consent.
 */
export async function claimEvaluation(
  token: string,
  founder: Pick<AppUser, "id" | "email">,
): Promise<ClaimEvaluationResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "service_unavailable", message: "Service unavailable" };
  const clean = typeof token === "string" ? token.trim() : "";
  if (!clean || clean.length > 64) return { ok: false, error: "not_found", message: "Invite not found" };

  const { data, error } = await supabase
    .from("evaluations")
    .select(`${EVALUATION_COLUMNS}, projects:project_id (name)`)
    .eq("invite_token", clean)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "not_found", message: "Invite not found or already revoked" };

  const row = data as Row & { projects?: Row | Row[] | null };
  const current = mapEvaluationRow(row);
  const p = (Array.isArray(row.projects) ? row.projects[0] : row.projects) ?? {};
  const projectName = String(p.name ?? "this startup");

  const founderEmail = founder.email.trim().toLowerCase();
  if (current.founderEmail && current.founderEmail !== founderEmail) {
    return {
      ok: false,
      error: "email_mismatch",
      message: `This invite was sent to ${current.founderEmail}. Log in with that address to claim it.`,
    };
  }

  if (current.claimedAt && current.founderUserId === founder.id) {
    return { ok: true, evaluation: current, alreadyClaimed: true, projectName };
  }

  const { data: updated, error: updateError } = await supabase
    .from("evaluations")
    .update({
      owner_kind: "founder_claimed",
      consent_tier: "reports_shared",
      founder_user_id: founder.id,
      founder_email: current.founderEmail ?? founderEmail,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select(EVALUATION_COLUMNS)
    .maybeSingle();
  if (updateError || !updated) {
    console.error("[blockid:evaluations] claim update failed", updateError);
    return { ok: false, error: "claim_failed", message: "Could not claim this startup" };
  }
  return { ok: true, evaluation: mapEvaluationRow(updated as Row), alreadyClaimed: false, projectName };
}
