// Data-room template seeder — uploads the 10 Day-0 minimum-viable dataroom
// docs to Supabase storage bucket `dataroom` and inserts matching
// dataroom_files rows with status='present'.
//
// Invoked from:
//   - POST /api/reseller/create-startup      (step 6b) — new startup provision
//   - POST /api/dataroom/reseed-templates    — founder-triggered retry
//
// Idempotent — a second call on a startup that already has all 10 files
// yields `uploaded=0, skipped=10, failed=[]` because the storage upload
// uses `upsert:false` and the natural-key match in populate.ts prevents
// duplicate rows.
//
// Non-fatal — this function NEVER throws. Callers wrap the response in a
// `dataroom_seed: 'ok' | 'partial' | 'deferred'` envelope so a Supabase
// storage wobble does not roll back an otherwise-successful startup provision.

import "server-only";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DATAROOM_TEMPLATE_MANIFEST,
  templateStoragePath,
  type TemplateEntry,
} from "./template-manifest";
import { populateFromTemplate, type TemplateRowOverride } from "./populate";
import type { DataRoomTemplateRow } from "./atlassian-template";

const BUCKET = "dataroom";
const CONCURRENCY = 5;

export interface SeedDataroomTemplatesParams {
  projectId: string;
  userId: string;
  email: string;
  supabase?: SupabaseClient;
  /**
   * Root directory containing the source-of-truth template files. Defaults
   * to `<cwd>/public/templates` — the standalone Next.js build layout
   * copies web/public/templates into `.next/standalone/web/public/templates`.
   * Overridable so unit tests can point at a fixture dir.
   */
  templatesDir?: string;
}

export interface SeedDataroomTemplatesResult {
  ok: boolean;
  /** Number of storage uploads that landed on this call (fresh bytes). */
  uploaded: number;
  /** Uploads that no-op'd because bytes were already there (idempotent path). */
  skipped: number;
  /** Slugs whose upload OR row-insert failed — surface in caller envelope. */
  failed: string[];
}

/**
 * Seed the 10-doc dataroom for a fresh startup. See file header for the
 * error-handling contract.
 */
export async function seedDataroomTemplates(
  params: SeedDataroomTemplatesParams,
): Promise<SeedDataroomTemplatesResult> {
  const supabase = params.supabase ?? getSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      uploaded: 0,
      skipped: 0,
      failed: DATAROOM_TEMPLATE_MANIFEST.map((t) => t.slug),
    };
  }

  const templatesDir =
    params.templatesDir ?? path.join(process.cwd(), "public", "templates");

  // Upload all 10 in bounded parallel (5 at a time so we do not hit the
  // route's 30s timeout even on cold-cache hosts).
  const uploads = await runWithConcurrency(
    DATAROOM_TEMPLATE_MANIFEST,
    CONCURRENCY,
    (entry) => uploadOne(supabase, params.projectId, entry, templatesDir),
  );

  const uploaded = uploads.filter((u) => u.state === "uploaded").length;
  const skipped = uploads.filter((u) => u.state === "skipped").length;
  const failedUploads = uploads.filter((u) => u.state === "failed");

  // Build the overrides map (keyed by populate.ts natural key) for every
  // successfully-uploaded row so populateFromTemplate stamps status='present'.
  const overrides = new Map<string, TemplateRowOverride>();
  const templateRows: DataRoomTemplateRow[] = [];
  for (const u of uploads) {
    if (u.state === "failed") continue;
    const entry = u.entry;
    const key = `${entry.category}::${entry.filename}`;
    templateRows.push({
      category: entry.category,
      title: entry.filename,
      phaseSlug: entry.phaseSlug,
      status_in_reference: "present",
    });
    overrides.set(key, {
      storage_path: templateStoragePath(params.projectId, entry),
      template_slug: entry.slug,
      template_version: entry.version,
      mime_type: entry.mime,
      status: "present",
    });
  }

  const failed: string[] = failedUploads.map((u) => u.entry.slug);

  if (templateRows.length > 0) {
    const populate = await populateFromTemplate({
      userId: params.userId,
      email: params.email,
      projectId: params.projectId,
      template: templateRows,
      mode: "append",
      overrides,
      supabase,
    });
    if (!populate.ok) {
      // Row insert failed — count every attempted template as failed for
      // this dimension so the caller can decide 'partial' vs 'deferred'.
      for (const row of templateRows) {
        const slug = DATAROOM_TEMPLATE_MANIFEST.find(
          (t) => t.filename === row.title,
        )?.slug;
        if (slug && !failed.includes(slug)) failed.push(slug);
      }
    }
  }

  return {
    ok: failed.length === 0,
    uploaded,
    skipped,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type UploadOutcome =
  | { state: "uploaded"; entry: TemplateEntry }
  | { state: "skipped"; entry: TemplateEntry }
  | { state: "failed"; entry: TemplateEntry; reason: string };

async function uploadOne(
  supabase: SupabaseClient,
  projectId: string,
  entry: TemplateEntry,
  templatesDir: string,
): Promise<UploadOutcome> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(path.join(templatesDir, entry.filename));
  } catch (err) {
    return {
      state: "failed",
      entry,
      reason: `read_failed:${(err as Error).message}`,
    };
  }
  if (bytes.byteLength > entry.size_bytes_max) {
    return {
      state: "failed",
      entry,
      reason: `size_exceeded:${bytes.byteLength}>${entry.size_bytes_max}`,
    };
  }

  const storagePath = templateStoragePath(projectId, entry);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: entry.mime,
      upsert: false,
    });

  if (!error) return { state: "uploaded", entry };

  // Supabase storage returns a 409-ish "Duplicate" / "already exists" message
  // when upsert:false collides with an existing object — treat as idempotent
  // skip, not failure.
  const msg = (error.message ?? "").toLowerCase();
  if (
    msg.includes("duplicate") ||
    msg.includes("already exists") ||
    msg.includes("resource already exists")
  ) {
    return { state: "skipped", entry };
  }
  return { state: "failed", entry, reason: error.message ?? "unknown" };
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function pull(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  const runners = Array.from({ length: Math.max(1, concurrency) }, pull);
  await Promise.all(runners);
  return results;
}
