// Founder correction workflow — server service (G21 P1-C).
//
//   fileCorrection()      founder files one → `corrections` row (status open),
//                         admin e-mail, `correction.filed` audit action set on
//                         the request context.
//   listProjectCorrections()  the founder's rows for a project.
//   listCorrections()     admin queue (filter by status).
//   resolveCorrection()   admin accept / reject → status + resolution +
//                         resolved_by / resolved_at. An ACCEPT never
//                         overwrites data directly: only a `wrong_sector_stage`
//                         correction with a proposed value is written, and
//                         only through `updateProject` (the audited project
//                         update path); the resolution text records exactly
//                         what was (or was not) changed. The founder is
//                         e-mailed on accept.
//
// The db + e-mail + project-update deps are injectable so the route tests
// use the fake-supabase stub; production resolves them lazily.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  composeResolution,
  plannedChangeFor,
  targetLabel,
  CORRECTION_KIND_LABEL,
  OPEN_CORRECTIONS_PER_PROJECT_MAX,
  type CorrectionInput,
  type CorrectionRow,
  type CorrectionStatus,
  type ResolveDecision,
} from "./model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CorrectionsDb = SupabaseClient<any, any, any>;

export interface CorrectionsDeps {
  sendEmail?: (args: { to: string; subject: string; html: string; text?: string }) => Promise<unknown>;
  updateProject?: (projectId: string, updates: { industry?: string | null; stage?: number }) => Promise<{ ok: boolean; error?: string }>;
  adminEmail?: string;
  siteUrl?: string;
  now?: () => Date;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function resolveDeps(deps: CorrectionsDeps) {
  return {
    sendEmail: deps.sendEmail ?? (async (args: { to: string; subject: string; html: string; text?: string }) => (await import("@/lib/email")).sendEmail(args)),
    updateProject: deps.updateProject ?? (async (projectId: string, updates: { industry?: string | null; stage?: number }) => (await import("@/lib/projects")).updateProject(projectId, updates)),
    adminEmail: deps.adminEmail ?? (process.env.ADMIN_EMAIL ?? "admin@blockid.au"),
    siteUrl: (deps.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, ""),
    now: deps.now ?? (() => new Date()),
  };
}

export const CORRECTION_SELECT = "id, project_id, kind, target_ref, message, proposed, status, submitted_by, resolved_by, resolution, resolved_at, created_at, updated_at";

export type FileResult =
  | { ok: true; row: CorrectionRow; warnings: string[] }
  | { ok: false; error: "too_many_open" | "db_error"; message: string; status: number };

export async function fileCorrection(
  db: CorrectionsDb,
  input: CorrectionInput & { submittedBy: string; submitterEmail: string | null; projectName: string | null },
  deps: CorrectionsDeps = {},
): Promise<FileResult> {
  const d = await resolveDeps(deps);
  const warnings: string[] = [];

  const { count } = await db
    .from("corrections")
    .select("id", { count: "exact", head: true })
    .eq("project_id", input.projectId)
    .eq("status", "open");
  if ((count ?? 0) >= OPEN_CORRECTIONS_PER_PROJECT_MAX) {
    return { ok: false, error: "too_many_open", message: `You already have ${OPEN_CORRECTIONS_PER_PROJECT_MAX} open corrections on this startup — wait for a resolution before filing more.`, status: 429 };
  }

  const { data, error } = await db
    .from("corrections")
    .insert({
      project_id: input.projectId,
      kind: input.kind,
      target_ref: input.targetRef,
      message: input.message,
      proposed: input.proposed,
      status: "open",
      submitted_by: input.submittedBy,
    })
    .select(CORRECTION_SELECT)
    .single();
  if (error || !data) {
    return { ok: false, error: "db_error", message: "Could not save the correction. Try again in a minute.", status: 500 };
  }
  const row = data as CorrectionRow;

  const kind = CORRECTION_KIND_LABEL[row.kind]?.label ?? row.kind;
  const target = targetLabel(row.target_ref);
  const link = `${d.siteUrl}/admin/corrections`;
  const subject = `[BlockID] Correction filed — ${kind} · ${input.projectName ?? row.project_id}`;
  const text = [
    `A founder filed a correction.`,
    ``,
    `Startup: ${input.projectName ?? "(unnamed)"} (${row.project_id})`,
    `Kind: ${kind}`,
    `Target: ${target}${row.target_ref ? ` (${row.target_ref})` : ""}`,
    `Filed by: ${input.submitterEmail ?? row.submitted_by ?? "unknown"}`,
    ``,
    row.message,
    ``,
    `Review: ${link}`,
  ].join("\n");
  const html = `<p>A founder filed a correction.</p><table style="font-size:14px"><tr><td>Startup</td><td>${escapeHtml(input.projectName ?? "(unnamed)")} <code>${escapeHtml(row.project_id)}</code></td></tr><tr><td>Kind</td><td>${escapeHtml(kind)}</td></tr><tr><td>Target</td><td>${escapeHtml(target)}${row.target_ref ? ` <code>${escapeHtml(row.target_ref)}</code>` : ""}</td></tr><tr><td>Filed by</td><td>${escapeHtml(input.submitterEmail ?? row.submitted_by ?? "unknown")}</td></tr></table><blockquote style="white-space:pre-wrap">${escapeHtml(row.message)}</blockquote><p><a href="${escapeHtml(link)}">Review in the admin queue</a></p>`;
  try {
    await d.sendEmail({ to: d.adminEmail, subject, html, text });
  } catch (err) {
    warnings.push(`admin e-mail: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { ok: true, row, warnings };
}

export async function listProjectCorrections(db: CorrectionsDb, projectId: string): Promise<CorrectionRow[]> {
  const { data, error } = await db
    .from("corrections")
    .select(CORRECTION_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as CorrectionRow[];
}

export interface AdminCorrectionRow extends CorrectionRow {
  project_name: string | null;
  founder_email: string | null;
}

export async function listCorrections(db: CorrectionsDb, opts: { status?: CorrectionStatus | "all"; limit?: number } = {}): Promise<AdminCorrectionRow[]> {
  let q = db.from("corrections").select(CORRECTION_SELECT).order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error || !data) return [];
  const rows = data as CorrectionRow[];
  if (rows.length === 0) return [];

  const projectIds = Array.from(new Set(rows.map((r) => r.project_id)));
  const userIds = Array.from(new Set(rows.map((r) => r.submitted_by).filter((v): v is string => Boolean(v))));
  const [projects, users] = await Promise.all([
    db.from("projects").select("id, name").in("id", projectIds),
    userIds.length ? db.from("app_users").select("id, email").in("id", userIds) : Promise.resolve({ data: [] as Array<{ id: string; email: string }> }),
  ]);
  const nameOf = new Map(((projects.data ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name ?? null]));
  const emailOf = new Map(((users.data ?? []) as Array<{ id: string; email: string | null }>).map((u) => [u.id, u.email ?? null]));
  return rows.map((r) => ({ ...r, project_name: nameOf.get(r.project_id) ?? null, founder_email: r.submitted_by ? (emailOf.get(r.submitted_by) ?? null) : null }));
}

export type ResolveResult =
  | { ok: true; row: CorrectionRow; applied: boolean; change: ReturnType<typeof plannedChangeFor>; warnings: string[] }
  | { ok: false; error: "not_found" | "not_open" | "already_resolved" | "db_error"; message: string; status: number };

export async function resolveCorrection(
  db: CorrectionsDb,
  args: { id: string; decision: ResolveDecision; note: string | null; adminId: string },
  deps: CorrectionsDeps = {},
): Promise<ResolveResult> {
  const d = await resolveDeps(deps);
  const warnings: string[] = [];

  const { data: existing, error: readErr } = await db.from("corrections").select(CORRECTION_SELECT).eq("id", args.id).maybeSingle();
  if (readErr) return { ok: false, error: "db_error", message: "Could not read the correction.", status: 500 };
  if (!existing) return { ok: false, error: "not_found", message: "No such correction.", status: 404 };
  const row = existing as CorrectionRow;
  if (row.status !== "open") return { ok: false, error: "not_open", message: `Already ${row.status}.`, status: 409 };

  // Accept → the ONLY write to the startup record goes through updateProject.
  const change = args.decision === "accept" ? plannedChangeFor(row) : null;
  let applied = false;
  if (change) {
    try {
      const r = await d.updateProject(row.project_id, change.field === "industry" ? { industry: String(change.value) } : { stage: Number(change.value) });
      applied = r.ok;
      if (!r.ok) warnings.push(`project update: ${r.error ?? "failed"}`);
    } catch (err) {
      warnings.push(`project update: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const resolution = composeResolution(args.decision, args.note, change, applied);
  const nowIso = d.now().toISOString();
  // Concurrency (G21 P1 post-ship review): two admins can both pass the
  // read-side "open" check; the UPDATE itself is conditioned on status =
  // open so the second writer updates zero rows and gets 409 rather than
  // silently overwriting the first resolution.
  const { data: updated, error: updErr } = await db
    .from("corrections")
    .update({ status: args.decision === "accept" ? "accepted" : "rejected", resolution, resolved_by: args.adminId, resolved_at: nowIso, updated_at: nowIso })
    .eq("id", args.id)
    .eq("status", "open")
    .select(CORRECTION_SELECT)
    .maybeSingle();
  if (updErr) return { ok: false, error: "db_error", message: "Could not save the resolution.", status: 500 };
  if (!updated) return { ok: false, error: "already_resolved", message: "Another reviewer resolved this correction first.", status: 409 };
  const saved = updated as CorrectionRow;

  if (args.decision === "accept" && saved.submitted_by) {
    try {
      const { data: founder } = await db.from("app_users").select("email").eq("id", saved.submitted_by).maybeSingle();
      const to = (founder as { email?: string | null } | null)?.email ?? null;
      if (to) {
        const kind = CORRECTION_KIND_LABEL[saved.kind]?.label ?? saved.kind;
        const link = `${d.siteUrl}/workspace/evidence/corrections`;
        const text = [
          `Your correction was accepted.`,
          ``,
          `Kind: ${kind}`,
          `Target: ${targetLabel(saved.target_ref)}`,
          `Resolution: ${resolution}`,
          ``,
          `Nothing was overwritten silently — the resolution above records exactly what changed. See all your corrections: ${link}`,
        ].join("\n");
        const html = `<p>Your correction was accepted.</p><p><strong>Kind:</strong> ${escapeHtml(kind)}<br/><strong>Target:</strong> ${escapeHtml(targetLabel(saved.target_ref))}<br/><strong>Resolution:</strong> ${escapeHtml(resolution)}</p><p>Nothing was overwritten silently — the resolution above records exactly what changed. <a href="${escapeHtml(link)}">See all your corrections</a>.</p>`;
        await d.sendEmail({ to, subject: `[BlockID] Your correction was accepted — ${kind}`, html, text });
      }
    } catch (err) {
      warnings.push(`founder e-mail: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ok: true, row: saved, applied, change, warnings };
}
