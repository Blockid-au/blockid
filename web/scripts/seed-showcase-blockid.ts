#!/usr/bin/env npx tsx
/**
 * Track B B1.3 — seed + ingest BlockID.au showcase workspace.
 *
 * Idempotent one-shot: flags the admin's default project as is_showcase, upserts
 * a data_rooms row for it, and stores the report metadata array (built by the
 * pure buildShowcaseDataRoomRows helper) as data_rooms.sections. The data_room_
 * documents table from migration 0062 was never applied, so we store per-report
 * rows inside the existing sections jsonb until that table lands.
 *
 * Usage (from web/):
 *   npx tsx scripts/seed-showcase-blockid.ts
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loaded from .env if absent).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildShowcaseDataRoomRows } from "../src/lib/showcase/report-tagging";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(WEB_DIR, ".env");
  if (!existsSync(envPath)) return {} as Record<string, string>;
  return Object.fromEntries(
    readFileSync(envPath, "utf8").split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)/))
      .filter(Boolean)
      .map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")]),
  ) as Record<string, string>;
}

const fileEnv = loadEnv();
const SUPABASE_URL = (process.env.SUPABASE_URL
  ?? fileEnv.SUPABASE_URL
  ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL
  ?? "").replace("supabase-kong", "localhost");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[seed-showcase-blockid] Missing SUPABASE_URL / SERVICE_ROLE_KEY");
  process.exit(1);
}

const ADMIN_EMAIL = "admin@blockid.au";
const REPO_URL = "https://github.com/Blockid-au/blockid.git";
const DATA_ROOM_NAME = "BlockID.au Showcase";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: adminUser, error: userErr } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  if (userErr || !adminUser) {
    console.error("[seed-showcase-blockid] admin@blockid.au not found", userErr);
    process.exit(1);
  }

  const { data: existingShowcase } = await supabase
    .from("projects")
    .select("id, name, slug, is_showcase, repo_url")
    .eq("user_id", adminUser.id)
    .eq("is_showcase", true)
    .maybeSingle();

  let projectId: string;
  if (existingShowcase) {
    projectId = existingShowcase.id;
    console.log(`[seed-showcase-blockid] reusing showcase project ${projectId} (${existingShowcase.slug})`);
    if (existingShowcase.repo_url !== REPO_URL) {
      const { error } = await supabase
        .from("projects")
        .update({ repo_url: REPO_URL })
        .eq("id", projectId);
      if (error) throw new Error(`update repo_url: ${error.message}`);
    }
  } else {
    const { data: defaultProject, error: defErr } = await supabase
      .from("projects")
      .select("id, name, slug, is_default")
      .eq("user_id", adminUser.id)
      .eq("is_default", true)
      .maybeSingle();
    if (defErr || !defaultProject) {
      console.error("[seed-showcase-blockid] no default project for admin", defErr);
      process.exit(1);
    }
    projectId = defaultProject.id;
    const { error } = await supabase
      .from("projects")
      .update({ is_showcase: true, repo_url: REPO_URL })
      .eq("id", projectId);
    if (error) throw new Error(`flip is_showcase: ${error.message}`);
    console.log(`[seed-showcase-blockid] flipped project ${projectId} (${defaultProject.slug}) → is_showcase=true`);
  }

  const reportsDir = resolve(WEB_DIR, "content/reports");
  const filenames = readdirSync(reportsDir).filter((f) => f.endsWith(".md"));
  const rows = buildShowcaseDataRoomRows({ filenames, includeTemplates: false });
  console.log(`[seed-showcase-blockid] parsed ${rows.length} report rows from ${filenames.length} .md files`);

  const { data: existingRoom } = await supabase
    .from("data_rooms")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", DATA_ROOM_NAME)
    .maybeSingle();

  const roomPayload = {
    user_id: adminUser.id,
    project_id: projectId,
    name: DATA_ROOM_NAME,
    description: "Auto-ingested from web/content/reports/*.md — metadata only (no body content).",
    template: "showcase",
    sections: rows,
    settings: {
      seeded_by: "scripts/seed-showcase-blockid.ts",
      seeded_at: new Date().toISOString(),
      source_dir: "web/content/reports",
      row_count: rows.length,
    },
    is_public: true,
  };

  if (existingRoom) {
    const { error } = await supabase
      .from("data_rooms")
      .update(roomPayload)
      .eq("id", existingRoom.id);
    if (error) throw new Error(`update data_rooms: ${error.message}`);
    console.log(`[seed-showcase-blockid] updated data_rooms ${existingRoom.id} with ${rows.length} sections`);
  } else {
    const { data: created, error } = await supabase
      .from("data_rooms")
      .insert(roomPayload)
      .select("id")
      .single();
    if (error) throw new Error(`insert data_rooms: ${error.message}`);
    console.log(`[seed-showcase-blockid] inserted data_rooms ${created!.id} with ${rows.length} sections`);
  }

  console.log(`[seed-showcase-blockid] done. project_id=${projectId}`);
}

main().catch((err) => {
  console.error("[seed-showcase-blockid] fatal:", err);
  process.exit(1);
});
