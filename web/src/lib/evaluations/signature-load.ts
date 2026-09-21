// G21 P3-C — the DB side of the reviewer signature: who signs (app_users
// display name / e-mail, the seat role and firm from
// investor_organisation_members ⋈ investor_organisations — same preference
// order as lib/investor/organisations.ts resolveActingOrg: an owned firm →
// the first firm the user was invited into → personal, which prints no
// organisation), and how many assessment_overrides (0423) exist for THIS
// startup. Every read is fail-soft: a missing table or a DB error yields
// the "not available" form of the block, never a throw — a dossier or an
// IC memo must never fail because of its signature.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isMissingRelation } from "@/lib/investors/mandates";
import { buildReviewerSignature, type ReviewerSignature } from "./signature";

type Row = Record<string, unknown>;

export interface ReviewerIdentity {
  name: string | null;
  /** Seat role code (SEAT_ROLES) or null. */
  role: string | null;
  organisation: string | null;
}

/** Fail-soft: the signer's name, seat role and firm. */
export async function loadReviewerIdentity(userId: string, known?: { displayName?: string | null; email?: string | null }): Promise<ReviewerIdentity> {
  const out: ReviewerIdentity = { name: known?.displayName?.trim() || known?.email?.trim() || null, role: null, organisation: null };
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return out;
  try {
    if (!out.name) {
      const { data: u } = await supabase.from("app_users").select("display_name, email").eq("id", userId).maybeSingle();
      const row = (u ?? null) as Row | null;
      out.name = (String(row?.display_name ?? "").trim() || String(row?.email ?? "").trim()) || null;
    }
    const { data, error } = await supabase
      .from("investor_organisation_members")
      .select("role, org_id, investor_organisations:org_id (id, name, owner_user_id, is_personal)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) {
      if (!isMissingRelation(error)) console.warn("[blockid:signature] membership read failed", { code: (error as { code?: string }).code });
      return out;
    }
    let invited: { role: string | null; organisation: string } | null = null;
    for (const raw of (data ?? []) as Array<Row & { investor_organisations?: Row | Row[] | null }>) {
      const o = (Array.isArray(raw.investor_organisations) ? raw.investor_organisations[0] : raw.investor_organisations) ?? null;
      if (!o) continue;
      const role = typeof raw.role === "string" && raw.role ? raw.role : null;
      const personal = Boolean(o.is_personal);
      const owner = String(o.owner_user_id ?? "") === userId;
      if (owner && !personal) {
        out.role = role ?? "investment_partner";
        out.organisation = String(o.name ?? "").trim() || null;
        return out;
      }
      if (!owner && !invited) invited = { role, organisation: String(o.name ?? "").trim() };
      if (owner && personal && !out.role) out.role = role;
    }
    if (invited) {
      out.role = invited.role;
      out.organisation = invited.organisation || null;
    }
  } catch (err) {
    console.warn("[blockid:signature] identity lookup threw", err instanceof Error ? err.message : String(err));
  }
  return out;
}

/** Fail-soft: assessment_overrides rows for a project; null when the table cannot be read. */
export async function countOverridesForProject(projectId: string): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !projectId) return null;
  try {
    const { count, error } = await supabase.from("assessment_overrides").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (error) {
      if (!isMissingRelation(error)) console.warn("[blockid:signature] overrides count failed", { code: (error as { code?: string }).code });
      return null;
    }
    return typeof count === "number" ? count : null;
  } catch (err) {
    console.warn("[blockid:signature] overrides count threw", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface LoadReviewerSignatureArgs {
  userId: string;
  projectId: string;
  generatedAt: string;
  known?: { displayName?: string | null; email?: string | null };
  roleFallback?: string;
  methodologyVersion?: string | null;
}

/** The signature block for a dossier / IC memo, every read fail-soft. */
export async function loadReviewerSignature(args: LoadReviewerSignatureArgs): Promise<ReviewerSignature> {
  const [identity, overridesCount] = await Promise.all([loadReviewerIdentity(args.userId, args.known), countOverridesForProject(args.projectId)]);
  return buildReviewerSignature({
    reviewerName: identity.name,
    role: identity.role,
    roleFallback: args.roleFallback,
    organisation: identity.organisation,
    generatedAt: args.generatedAt,
    methodologyVersion: args.methodologyVersion,
    overridesCount,
  });
}
