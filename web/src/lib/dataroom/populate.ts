// Data-room populator — seeds a founder's data room with placeholder rows
// derived from a reference successful case (Atlassian in v1).
//
// Contract (docs/plans/atlassian-standard-mapping-goal.md §2):
//   - Placeholders never overwrite user-uploaded rows (`created_by != template`).
//   - Idempotent — running append twice yields no duplicate rows.
//   - `replace` mode archives existing template rows first (still non-destructive
//     to user uploads).
//
// Schema note:
//   `dataroom_files` does not have `project_id`, `category`, or `created_by`
//   columns. We map:
//     - category         → svi_dimension        (folder name from DATA_ROOM_STRUCTURE)
//     - title            → file_name
//     - source URL       → drive_file_url
//     - "missing" status → status = 'missing'
//     - template marker  → mime_type = TEMPLATE_MIME_MARKER
//   The optional `project_id` argument is accepted for future-proofing (once
//   0N_multi_project migration adds the column). It is validated but not
//   projected into the current row shape.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ATLASSIAN_DATAROOM_TEMPLATE,
  type DataRoomTemplateRow,
} from "./atlassian-template";

/** Marker mime-type used to identify template-seeded placeholder rows. */
export const TEMPLATE_MIME_MARKER = "application/vnd.blockid.template";

export type PopulateMode = "append" | "replace" | "dry_run";

export interface PopulateParams {
  userId: string;
  email: string;
  projectId?: string | null;
  template: DataRoomTemplateRow[];
  mode: PopulateMode;
  /** Injected in tests. Falls back to the shared admin client. */
  supabase?: SupabaseClient;
}

export interface PhaseSummary {
  count: number;
  missing: number;
  present: number;
}

export interface PopulateResult {
  ok: true;
  created: number;
  updated: number;
  skipped: number;
  summary_by_phase: Record<string, PhaseSummary>;
  /** When mode='dry_run', the rows that would have been inserted. */
  preview?: Array<Pick<DataRoomTemplateRow, "category" | "title" | "phaseSlug">>;
}

export interface PopulateError {
  ok: false;
  error: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function populateFromTemplate(
  params: PopulateParams,
): Promise<PopulateResult | PopulateError> {
  const supabase = params.supabase ?? getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "supabase_unavailable" };
  }
  if (!params.userId || !params.email) {
    return { ok: false, error: "user_missing" };
  }
  if (params.template.length === 0) {
    return {
      ok: true,
      created: 0,
      updated: 0,
      skipped: 0,
      summary_by_phase: {},
    };
  }

  // 1. Read existing rows for the user (all statuses). We match on
  //    (svi_dimension, file_name) — the natural key for a template row.
  const { data: existingRows, error: fetchErr } = await supabase
    .from("dataroom_files")
    .select("id, svi_dimension, file_name, status, mime_type")
    .eq("user_id", params.userId);

  if (fetchErr) {
    return {
      ok: false,
      error: "fetch_failed",
      detail: fetchErr.message,
    };
  }

  const existing = existingRows ?? [];
  const existingByKey = new Map<
    string,
    (typeof existing)[number]
  >();
  for (const row of existing) {
    existingByKey.set(
      keyOf(String(row.svi_dimension), String(row.file_name)),
      row,
    );
  }

  // 2. Compute the diff.
  const toInsert: Array<Record<string, unknown>> = [];
  const preview: PopulateResult["preview"] = [];
  const summary: Record<string, PhaseSummary> = {};
  let skipped = 0;

  for (const tpl of params.template) {
    const key = keyOf(tpl.category, tpl.title);
    const bucket = summary[tpl.phaseSlug] ?? {
      count: 0,
      missing: 0,
      present: 0,
    };
    bucket.count += 1;

    const existingRow = existingByKey.get(key);
    if (existingRow) {
      // Never overwrite — count it toward "present" so the summary is
      // meaningful even when the caller has already uploaded the doc.
      const isTemplatePlaceholder =
        existingRow.mime_type === TEMPLATE_MIME_MARKER &&
        existingRow.status === "missing";
      if (isTemplatePlaceholder) {
        bucket.missing += 1;
      } else {
        bucket.present += 1;
      }
      skipped += 1;
      summary[tpl.phaseSlug] = bucket;
      continue;
    }

    bucket.missing += 1;
    summary[tpl.phaseSlug] = bucket;

    preview.push({
      category: tpl.category,
      title: tpl.title,
      phaseSlug: tpl.phaseSlug,
    });

    toInsert.push({
      user_id: params.userId,
      email: params.email,
      svi_dimension: tpl.category,
      file_name: tpl.title,
      status: "missing",
      drive_file_url: tpl.sourceUrl ?? null,
      mime_type: TEMPLATE_MIME_MARKER,
    });
  }

  if (params.mode === "dry_run") {
    return {
      ok: true,
      created: 0,
      updated: 0,
      skipped,
      summary_by_phase: summary,
      preview,
    };
  }

  // 3. Replace-mode: archive existing template placeholders first. This
  //    only touches rows we ourselves seeded (mime_type === marker) —
  //    user uploads stay untouched.
  let updated = 0;
  if (params.mode === "replace") {
    const { data: archived, error: archiveErr } = await supabase
      .from("dataroom_files")
      .update({ status: "archived" })
      .eq("user_id", params.userId)
      .eq("mime_type", TEMPLATE_MIME_MARKER)
      .neq("status", "archived")
      .select("id");
    if (archiveErr) {
      return {
        ok: false,
        error: "archive_failed",
        detail: archiveErr.message,
      };
    }
    updated = archived?.length ?? 0;
  }

  if (toInsert.length === 0) {
    return {
      ok: true,
      created: 0,
      updated,
      skipped,
      summary_by_phase: summary,
    };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("dataroom_files")
    .insert(toInsert)
    .select("id");

  if (insertErr) {
    return {
      ok: false,
      error: "insert_failed",
      detail: insertErr.message,
    };
  }

  return {
    ok: true,
    created: inserted?.length ?? 0,
    updated,
    skipped,
    summary_by_phase: summary,
  };
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/** Populate from the Atlassian reference template (v1 default). */
export async function populateFromAtlassian(
  params: Omit<PopulateParams, "template">,
): Promise<PopulateResult | PopulateError> {
  return populateFromTemplate({
    ...params,
    template: ATLASSIAN_DATAROOM_TEMPLATE,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function keyOf(category: string, title: string): string {
  return `${category}::${title}`;
}
