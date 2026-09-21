// Organisation artefact scope (G22-B, migration 0433) — which cohorts
// (`evaluation_batches`) and intake links (`program_intakes`) belong to an
// organisation. Shared by retention (lib/org/retention.ts) and the audit
// export (lib/org/audit-export.ts) so both answer the same question the
// same way:
//
//   rows whose `org_id` = the organisation           (stamped at creation
//                                                     from resolveActingOrg,
//                                                     or by the backfill
//                                                     script)
//   ∪ rows the org OWNER account created that still   (created before 0433 /
//     have no `org_id`                                 not yet backfilled —
//                                                     nothing shipped earlier
//                                                     is orphaned)
//
// A row the owner created for ANOTHER organisation (org_id set, ≠ this org)
// is excluded, and a seat holder's rows are only in scope when they were
// created while acting for this organisation — the G21 P3 review rule
// (a shared analyst's cohorts for org B never fall under org A's window).
//
// Fail-soft: before 0433 the `org_id` filter answers 42703 and the scope is
// exactly the owner-owned rows (the pre-0433 behaviour); before 0393 / 0322
// / 0405 the sets are empty.

import "server-only";
import type { getSupabaseAdmin } from "@/lib/supabase";

type Row = Record<string, unknown>;
type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export interface OrgScope {
  /** investor_organisations.owner_user_id (null when the org row is missing). */
  ownerUserId: string | null;
  batchIds: string[];
  intakeIds: string[];
  /** True when an `org_id` read answered 42703 (0433 not applied) — the scope is owner-only. */
  legacy: boolean;
}

export const SCOPE_LIMIT = 2000;

function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42703";
}

async function ownerOf(db: Db, orgId: string): Promise<string | null> {
  try {
    const { data } = await db.from("investor_organisations").select("owner_user_id").eq("id", orgId).maybeSingle();
    const owner = (data as Row | null)?.owner_user_id;
    return typeof owner === "string" && owner ? owner : null;
  } catch {
    return null;
  }
}

/** The slice of PostgREST's builder the scope reads use (structural, so the fake DB in tests needs no more). */
interface IdQuery {
  eq(col: string, v: string): IdQuery;
  is(col: string, v: null): IdQuery;
  limit(n: number): PromiseLike<{ data: unknown; error: unknown }>;
}

async function idsWhere(db: Db, table: string, build: (q: IdQuery) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ ids: string[]; missingColumn: boolean }> {
  try {
    const res = await build(db.from(table).select("id") as unknown as IdQuery);
    if (res.error) return { ids: [], missingColumn: isMissingColumn(res.error) };
    return { ids: ((res.data ?? []) as Row[]).map((r) => String(r.id)), missingColumn: false };
  } catch {
    return { ids: [], missingColumn: false };
  }
}

/**
 * The org's cohorts + intake links: `org_id = orgId` ∪ owner-owned rows with
 * no `org_id`. `ownerUserId` may be passed when the caller already has it
 * (resolveOrgAdmin) — otherwise it is read from investor_organisations.
 */
export async function loadOrgScope(db: Db, orgId: string, ownerUserId?: string | null): Promise<OrgScope> {
  const owner = ownerUserId === undefined ? await ownerOf(db, orgId) : ownerUserId;
  const out: OrgScope = { ownerUserId: owner, batchIds: [], intakeIds: [], legacy: false };
  if (!orgId) return out;

  const [bOrg, iOrg] = await Promise.all([
    idsWhere(db, "evaluation_batches", (q) => q.eq("org_id", orgId).limit(SCOPE_LIMIT)),
    idsWhere(db, "program_intakes", (q) => q.eq("org_id", orgId).limit(SCOPE_LIMIT)),
  ]);
  out.legacy = bOrg.missingColumn || iOrg.missingColumn;

  const batchIds = new Set(bOrg.ids);
  const intakeIds = new Set(iOrg.ids);

  if (owner) {
    // Owner-owned rows without an org id (pre-0433 / not yet backfilled).
    // 42703 → the column is absent: every owner-owned row is in scope.
    const [ownerBatches, ownerIntakes] = await Promise.all([
      bOrg.missingColumn
        ? idsWhere(db, "evaluation_batches", (q) => q.eq("user_id", owner).limit(SCOPE_LIMIT))
        : idsWhere(db, "evaluation_batches", (q) => q.eq("user_id", owner).is("org_id", null).limit(SCOPE_LIMIT)),
      iOrg.missingColumn
        ? idsWhere(db, "program_intakes", (q) => q.eq("owner_user_id", owner).limit(SCOPE_LIMIT))
        : idsWhere(db, "program_intakes", (q) => q.eq("owner_user_id", owner).is("org_id", null).limit(SCOPE_LIMIT)),
    ]);
    for (const id of ownerBatches.ids) batchIds.add(id);
    for (const id of ownerIntakes.ids) intakeIds.add(id);
  }

  // G24-C: the fictional demo cohort is never part of an organisation's
  // artefacts — not exported, not retained as data. Fail-soft: before 0436
  // the `is_demo` read answers 42703 and the set is left as it was.
  for (const id of await demoBatchIds(db, [...batchIds])) batchIds.delete(id);

  out.batchIds = [...batchIds];
  out.intakeIds = [...intakeIds];
  return out;
}

/** The slice of the builder the demo read uses. */
interface DemoIdQuery {
  in(col: string, vals: string[]): { eq(col: string, v: boolean): PromiseLike<{ data: unknown; error: unknown }> };
}

/** The subset of `ids` flagged `is_demo` (0436); [] before the migration or on any error. */
export async function demoBatchIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  try {
    const res = await (db.from("evaluation_batches").select("id") as unknown as DemoIdQuery).in("id", ids.slice(0, SCOPE_LIMIT)).eq("is_demo", true);
    if (res.error) return [];
    return ((res.data ?? []) as Row[]).map((r) => String(r.id));
  } catch {
    return [];
  }
}
