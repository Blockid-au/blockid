// saveDeliverable — upload a generated file to the `dataroom` bucket and
// upsert its `dataroom_files` row (T0244; extracted verbatim from
// api/startup-package/deliverable/accelerator-apply/route.ts steps 9–10 so
// the Money Finder report, the accelerator drafter and future deliverables
// share one path).
//
// Behaviour preserved from the inline version:
//   • storage path `startup-<projectId>/package/<template_slug>-<version>.<ext>`
//   • upload with `upsert: true` (re-running a deliverable replaces the file)
//   • `dataroom_files` keyed on (user_id, template_slug): update when a row
//     exists, otherwise insert with `status: "present"`
//   • errors are returned, not thrown, with the same codes the route mapped
//     to HTTP statuses (`storage_upload_failed` → 502, the two row errors → 500)
//
// Colocated tests: save-deliverable.test.ts.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export const DATAROOM_BUCKET = "dataroom";

export interface SaveDeliverableInput {
  userId: string;
  /** Email stored on an inserted `dataroom_files` row (the table requires it). */
  email?: string | null;
  projectId: string;
  /** Display name for the row (`file_name`); defaults to `<template_slug>.<ext>`. */
  filename?: string;
  buffer: Buffer | Uint8Array;
  mime: string;
  /** Stable slug — one row per (user, slug); re-saving replaces the file. */
  template_slug: string;
  template_version?: string;
  /** `dataroom_files.svi_dimension` bucket — defaults to "package". */
  svi_dimension?: string;
  /** Sub-folder under `startup-<projectId>/` — defaults to "package". */
  folder?: string;
}

export type SaveDeliverableResult =
  | { ok: true; dataroomFileId: string | null; storagePath: string; downloadUrl: string | null }
  | { ok: false; error: "service_unavailable" | "storage_upload_failed" | "dataroom_row_update_failed" | "dataroom_row_insert_failed"; status: 503 | 502 | 500 };

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/markdown": "md",
  "application/json": "json",
};

export function extensionForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

export async function saveDeliverable(input: SaveDeliverableInput): Promise<SaveDeliverableResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "service_unavailable", status: 503 };

  const version = input.template_version ?? "v1";
  const ext = extensionForMime(input.mime);
  const folder = input.folder ?? "package";
  const storagePath = `startup-${input.projectId}/${folder}/${input.template_slug}-${version}.${ext}`;
  const fileName = input.filename ?? `${input.template_slug}.${ext}`;

  // 1. Upload (upsert — re-running replaces the previous file)
  const uploadRes = await supabase.storage
    .from(DATAROOM_BUCKET)
    .upload(storagePath, input.buffer, { contentType: input.mime, upsert: true });
  if (uploadRes.error) {
    console.error("[dataroom/save-deliverable] upload failed", { storagePath, error: uploadRes.error });
    return { ok: false, error: "storage_upload_failed", status: 502 };
  }

  // 2. dataroom_files upsert keyed on (user_id, template_slug)
  const { data: existingRow } = await supabase
    .from("dataroom_files")
    .select("id")
    .eq("user_id", input.userId)
    .eq("template_slug", input.template_slug)
    .maybeSingle();

  let dataroomFileId: string | null = null;
  if (existingRow?.id) {
    const { data, error } = await supabase
      .from("dataroom_files")
      .update({
        storage_path: storagePath,
        mime_type: input.mime,
        status: "present",
        template_version: version,
        file_name: fileName,
      })
      .eq("id", existingRow.id)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[dataroom/save-deliverable] update dataroom_files failed", error);
      return { ok: false, error: "dataroom_row_update_failed", status: 500 };
    }
    dataroomFileId = data?.id ?? null;
  } else {
    const { data, error } = await supabase
      .from("dataroom_files")
      .insert({
        user_id: input.userId,
        email: input.email ?? "",
        svi_dimension: input.svi_dimension ?? "package",
        file_name: fileName,
        status: "present",
        mime_type: input.mime,
        storage_path: storagePath,
        template_slug: input.template_slug,
        template_version: version,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[dataroom/save-deliverable] insert dataroom_files failed", error);
      return { ok: false, error: "dataroom_row_insert_failed", status: 500 };
    }
    dataroomFileId = data?.id ?? null;
  }

  // 3. Signed download URL (best-effort)
  let downloadUrl: string | null = null;
  try {
    const signed = await supabase.storage.from(DATAROOM_BUCKET).createSignedUrl(storagePath, 3600);
    downloadUrl = signed.data?.signedUrl ?? null;
  } catch {
    downloadUrl = null;
  }

  return { ok: true, dataroomFileId, storagePath, downloadUrl };
}
