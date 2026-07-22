#!/usr/bin/env node
/**
 * One-shot backfill for retail per-project reseller_attributions rows.
 *
 * Closes the pre-tick-92 gap called out in reseller-module-goal.md next_action
 * tick 92: retail founders whose workspaces existed BEFORE tick 92 landed
 * carry app_users.attribution_reseller_id (the user-level cache) but have no
 * matching reseller_attributions ledger row for their projects. New workspaces
 * created after tick 92 land the row automatically via createProject() →
 * attributeProjectFromUserCache().
 *
 * Idempotent: the reseller_attributions U.15.1 partial unique index on
 * (subject_project_id) WHERE subject_type='project' AND status='active' AND
 * opted_out=false guarantees at most one active row per project, so re-runs
 * skip anything already backfilled and 23505 races land cleanly.
 *
 * Skipped intentionally:
 *   - archived projects (projects.archived_at IS NOT NULL) — a founder who
 *     already deleted their workspace shouldn't retroactively appear in
 *     the reseller's Customers list.
 *   - projects whose owner's cached reseller row is not status='active'
 *     (terminated/suspended/null). Matches the runtime decideRetailAttribution
 *     'reseller_inactive' deny gate so runtime + backfill agree on eligibility.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (read from web/.env)
 *
 * Run (dry-run by default):
 *   node scripts/backfill-retail-reseller-attributions.mjs
 *
 * Apply for real:
 *   node scripts/backfill-retail-reseller-attributions.mjs --apply
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");

const env = Object.fromEntries(
  readFileSync(resolve(WEB_DIR, ".env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(
  "supabase-kong",
  "localhost",
);
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

async function fetchAttributedUsers() {
  // Users with a cached attribution_reseller_id. Small table on this host;
  // no cursor pagination needed.
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("app_users")
      .select("id, attribution_reseller_id")
      .not("attribution_reseller_id", "is", null)
      .range(from, from + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return rows;
}

async function fetchActiveResellerIds(candidateIds) {
  if (candidateIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("resellers")
    .select("id, status")
    .in("id", candidateIds);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter((r) => r.status === "active")
      .map((r) => r.id),
  );
}

async function fetchNonArchivedProjectsForUsers(userIds) {
  if (userIds.length === 0) return [];
  const rows = [];
  for (let i = 0; i < userIds.length; i += 200) {
    const slice = userIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("projects")
      .select("id, user_id, attribution_reseller_id, archived_at")
      .in("user_id", slice)
      .is("archived_at", null);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function fetchExistingProjectAttributions(projectIds) {
  const seen = new Set();
  if (projectIds.length === 0) return seen;
  for (let i = 0; i < projectIds.length; i += 200) {
    const slice = projectIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("reseller_attributions")
      .select("subject_project_id")
      .eq("subject_type", "project")
      .eq("status", "active")
      .eq("opted_out", false)
      .in("subject_project_id", slice);
    if (error) throw error;
    for (const r of data ?? []) seen.add(r.subject_project_id);
  }
  return seen;
}

async function main() {
  console.log(`[backfill-retail-attributions] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const users = await fetchAttributedUsers();
  console.log(`  found ${users.length} attributed app_users`);
  if (users.length === 0) return;

  const activeResellerIds = await fetchActiveResellerIds(
    Array.from(new Set(users.map((u) => u.attribution_reseller_id))),
  );
  const eligibleUsers = users.filter((u) =>
    activeResellerIds.has(u.attribution_reseller_id),
  );
  console.log(
    `  ${eligibleUsers.length} carry an active reseller (${
      users.length - eligibleUsers.length
    } skipped: reseller terminated/suspended/missing)`,
  );

  const userIdToReseller = new Map(
    eligibleUsers.map((u) => [u.id, u.attribution_reseller_id]),
  );

  const projects = await fetchNonArchivedProjectsForUsers([
    ...userIdToReseller.keys(),
  ]);
  console.log(`  ${projects.length} non-archived projects owned by those users`);

  const alreadyAttributed = await fetchExistingProjectAttributions(
    projects.map((p) => p.id),
  );

  const targets = projects.filter((p) => !alreadyAttributed.has(p.id));
  console.log(
    `  ${targets.length} projects need a backfilled reseller_attributions row (${
      projects.length - targets.length
    } already have one)`,
  );

  if (!APPLY) {
    console.log("[dry-run] rerun with --apply to write the rows");
    return;
  }

  let inserted = 0;
  let raced = 0;
  let failed = 0;
  for (const p of targets) {
    const reseller_id = userIdToReseller.get(p.user_id);
    if (!reseller_id) continue;
    const { error: attrErr } = await supabase.from("reseller_attributions").insert({
      reseller_id,
      subject_type: "project",
      subject_project_id: p.id,
      subject_user_id: null,
      source: "code",
      promotion_code_id: null,
      metadata: { origin: "retail_project_create", backfill: "tick_93" },
    });
    if (attrErr) {
      if (attrErr.code === "23505") {
        raced += 1;
        continue;
      }
      failed += 1;
      console.error(`  project=${p.id} insert failed:`, attrErr.message);
      continue;
    }
    if (p.attribution_reseller_id !== reseller_id) {
      const { error: updErr } = await supabase
        .from("projects")
        .update({ attribution_reseller_id: reseller_id })
        .eq("id", p.id);
      if (updErr) {
        // Ledger row already landed — stamp failure is soft (webhook + drawer
        // can still join through reseller_attributions), so we log and move on.
        console.error(`  project=${p.id} stamp failed:`, updErr.message);
      }
    }
    inserted += 1;
  }

  console.log(
    `[apply] inserted=${inserted} raced=${raced} failed=${failed} of ${targets.length}`,
  );
}

main().catch((err) => {
  console.error("backfill-retail-reseller-attributions FAILED:", err);
  process.exit(1);
});
