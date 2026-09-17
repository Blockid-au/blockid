// G14-S38 — GET /api/v1/evaluations read model.
//
// Rows are the workspace list (`listEvaluations` — the same query the
// "Startups I'm evaluating" table renders) projected to a PUBLIC shape:
// ids, the project card, consent state, the latest SVI and the fit score of
// the key owner's primary mandate. Internals never leave: the invite token,
// the founder's e-mail / user id, the evaluator's private notes.
//
// Pagination is a keyset cursor over (created_at desc, id desc) — the list
// order the workspace uses — encoded base64url so a client cannot forge a
// page into another evaluator's rows (the cursor only positions inside the
// caller's own list; ownership is `evaluator_user_id = key owner`).
//
// Filters: `industry` (case-insensitive equals on projects.industry),
// `stage` (projects.stage number), `min_fit` (0–100 against
// mandate_fit_scores of the caller's PRIMARY mandate — S-T2; without a
// mandate the filter yields an empty page and `meta.fit_source =
// "no_mandate"` so the integration sees why).
//
// The pure parts (projection, cursor codec, in-memory page) are exported
// for the colocated test; only `listEvaluationsV1` touches Supabase.

import "server-only";
import { listEvaluations, type EvaluationListRow } from "@/lib/evaluations";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DOSSIER_PATH } from "@/lib/evaluations/dossier";

export const V1_DEFAULT_LIMIT = 25;
export const V1_MAX_LIMIT = 100;

export interface PublicEvaluationV1 {
  id: string;
  project: {
    id: string;
    slug: string;
    name: string;
    industry: string | null;
    stage: number;
    description: string | null;
    website: string | null;
    state: string | null;
  };
  owner_kind: EvaluationListRow["ownerKind"];
  consent_tier: EvaluationListRow["consentTier"];
  founder_claimed: boolean;
  label: string | null;
  svi: { total: number | null; at: string | null };
  /** Primary-mandate fit (0–100) when a mandate_fit_scores row exists; null otherwise. */
  fit: { score: number; computed_at: string | null } | null;
  links: { dossier: string; assessment: string; workspace: string };
  created_at: string;
  updated_at: string;
}

export function toPublicEvaluation(row: EvaluationListRow, fit: { score: number; computed_at: string | null } | null = null): PublicEvaluationV1 {
  const base = `/api/v1/evaluations/${encodeURIComponent(row.id)}`;
  return {
    id: row.id,
    project: {
      id: row.projectId,
      slug: row.projectSlug,
      name: row.projectName,
      industry: row.projectIndustry,
      stage: row.projectStage,
      description: row.projectDescription,
      website: row.website,
      state: row.state,
    },
    owner_kind: row.ownerKind,
    consent_tier: row.consentTier,
    founder_claimed: row.ownerKind === "founder_claimed" && Boolean(row.claimedAt),
    label: row.label,
    svi: { total: row.latestSvi, at: row.latestSviAt },
    fit,
    links: { dossier: `${base}/dossier`, assessment: `${base}/assessment`, workspace: DOSSIER_PATH(row.id) },
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

// ─── Cursor ─────────────────────────────────────────────────────────────────

export function encodeCursor(row: Pick<EvaluationListRow, "createdAt" | "id">): string {
  return Buffer.from(`${row.createdAt}|${row.id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  if (!/^[A-Za-z0-9_-]{4,200}$/.test(cursor)) return null;
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const sep = raw.lastIndexOf("|");
  if (sep <= 0) return null;
  const createdAt = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!id || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

// ─── Query parsing ──────────────────────────────────────────────────────────

export interface V1ListQuery {
  limit: number;
  cursor: string | null;
  industry: string | null;
  stage: number | null;
  min_fit: number | null;
}

export type V1ListQueryResult = { ok: true; query: V1ListQuery } | { ok: false; error: string };

export function parseListQuery(params: URLSearchParams): V1ListQueryResult {
  let limit = V1_DEFAULT_LIMIT;
  const rawLimit = params.get("limit");
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1 || n > V1_MAX_LIMIT) return { ok: false, error: `limit must be an integer between 1 and ${V1_MAX_LIMIT}` };
    limit = n;
  }
  const cursorRaw = params.get("cursor");
  if (cursorRaw !== null && cursorRaw !== "" && !decodeCursor(cursorRaw)) return { ok: false, error: "cursor is not valid" };
  const industryRaw = params.get("industry");
  const industry = industryRaw && industryRaw.trim() ? industryRaw.trim().slice(0, 80) : null;
  let stage: number | null = null;
  const stageRaw = params.get("stage");
  if (stageRaw !== null && stageRaw !== "") {
    const n = Number(stageRaw);
    if (!Number.isInteger(n) || n < 0 || n > 12) return { ok: false, error: "stage must be an integer between 0 and 12" };
    stage = n;
  }
  let min_fit: number | null = null;
  const fitRaw = params.get("min_fit");
  if (fitRaw !== null && fitRaw !== "") {
    const n = Number(fitRaw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: "min_fit must be a number between 0 and 100" };
    min_fit = n;
  }
  return { ok: true, query: { limit, cursor: cursorRaw && cursorRaw !== "" ? cursorRaw : null, industry, stage, min_fit } };
}

// ─── Pure page builder ──────────────────────────────────────────────────────

export interface V1Page {
  data: PublicEvaluationV1[];
  next_cursor: string | null;
  has_more: boolean;
}

/** Sort (created_at desc, id desc), apply cursor + filters, cut one page. */
export function pageEvaluations(rows: EvaluationListRow[], query: V1ListQuery, fitByProject: Map<string, { score: number; computed_at: string | null }> | null): V1Page {
  const sorted = [...rows].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.createdAt < b.createdAt ? 1 : -1));
  const after = decodeCursor(query.cursor);
  const industry = query.industry?.toLowerCase() ?? null;
  const filtered = sorted.filter((r) => {
    if (after && (r.createdAt > after.createdAt || (r.createdAt === after.createdAt && r.id >= after.id))) return false;
    if (industry && (r.projectIndustry ?? "").toLowerCase() !== industry) return false;
    if (query.stage !== null && r.projectStage !== query.stage) return false;
    if (query.min_fit !== null) {
      const fit = fitByProject?.get(r.projectId);
      if (!fit || fit.score < query.min_fit) return false;
    }
    return true;
  });
  const page = filtered.slice(0, query.limit);
  const hasMore = filtered.length > query.limit;
  return {
    data: page.map((r) => toPublicEvaluation(r, fitByProject?.get(r.projectId) ?? null)),
    next_cursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
    has_more: hasMore,
  };
}

// ─── Server ─────────────────────────────────────────────────────────────────

export interface V1ListResult extends V1Page {
  meta: { fit_source: "primary_mandate" | "no_mandate"; mandate_id: string | null };
}

async function readPrimaryFit(userId: string, projectIds: readonly string[]): Promise<{ mandateId: string | null; fit: Map<string, { score: number; computed_at: string | null }> | null }> {
  if (!projectIds.length) return { mandateId: null, fit: null };
  try {
    const { listMandates } = await import("@/lib/investors/mandates");
    const list = await listMandates(userId);
    const mandate = list.primary;
    if (!mandate) return { mandateId: null, fit: null };
    const supabase = getSupabaseAdmin();
    const fit = new Map<string, { score: number; computed_at: string | null }>();
    if (!supabase) return { mandateId: mandate.id, fit };
    const { data, error } = await supabase.from("mandate_fit_scores").select("project_id, score, computed_at").eq("mandate_id", mandate.id).in("project_id", [...projectIds]);
    if (error) return { mandateId: mandate.id, fit };
    for (const r of (data ?? []) as Array<{ project_id: string; score: number | string; computed_at: string | null }>) {
      const score = Number(r.score);
      if (Number.isFinite(score)) fit.set(String(r.project_id), { score: Math.round(score), computed_at: r.computed_at ?? null });
    }
    return { mandateId: mandate.id, fit };
  } catch {
    return { mandateId: null, fit: null };
  }
}

/** The key owner's evaluations, one page. Never throws. */
export async function listEvaluationsV1(userId: string, query: V1ListQuery): Promise<V1ListResult> {
  const rows = await listEvaluations(userId);
  const { mandateId, fit } = await readPrimaryFit(userId, rows.map((r) => r.projectId));
  const page = pageEvaluations(rows, query, fit);
  return { ...page, meta: { fit_source: mandateId ? "primary_mandate" : "no_mandate", mandate_id: mandateId } };
}
