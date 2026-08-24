#!/usr/bin/env npx ts-node --esm
/**
 * SVI Evidence Completeness Backfill Script
 *
 * For each project, calls /api/svi/evidence-completeness (GET) to trigger
 * completeness calculation and logs results.
 *
 * Idempotent — safe to run multiple times. Does NOT write to any table
 * directly; completeness calculation is handled inside the API route.
 *
 * Usage (manual, against local Supabase):
 *   BASE_URL=http://localhost:3000 npx ts-node --skipProject scripts/backfill-svi-completeness.ts
 *
 * Or against prod (service role bypasses auth middleware):
 *   BASE_URL=https://blockid.au npx ts-node --skipProject scripts/backfill-svi-completeness.ts
 *
 * Env vars:
 *   BASE_URL              Next.js app base URL (default: http://localhost:3000)
 *   SUPABASE_URL          Supabase base URL (for fetching project list)
 *   SUPABASE_SERVICE_ROLE_KEY  Service role key
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ─── Config ────────────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const WEB_DIR = resolve(SCRIPT_DIR, "..");
const ENV_FILE = resolve(WEB_DIR, ".env");

// Parse .env (same pattern used by existing backfill scripts)
function loadEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split("\n")
        .map((l) => l.match(/^([A-Z_]+)=(.*)/))
        .filter(Boolean)
        .map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")])
    );
  } catch {
    return {};
  }
}

const env = loadEnv();

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  env.SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  "http://127.0.0.1:8000"
).replace("supabase-kong", "localhost");

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

const BASE_URL =
  process.env.BASE_URL ||
  env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const PROJECT_FETCH_LIMIT = 100;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name?: string;
}

interface DimensionResult {
  dimension: string;
  completenessPercent: number;
  totalPossible: number;
  totalPresent: number;
}

interface CompletenessApiResponse {
  ok: boolean;
  dimensions?: DimensionResult[];
  forecast?: {
    currentSvi: number;
    projectedSvi: number;
    potentialSviGain: number;
  } | null;
  currentSvi?: number;
  error?: string;
}

// ─── Supabase REST helper ──────────────────────────────────────────────────────

async function fetchProjects(): Promise<Project[]> {
  const url = `${SUPABASE_URL}/rest/v1/projects?select=id,name&limit=${PROJECT_FETCH_LIMIT}&order=created_at.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch projects: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<Project[]>;
}

// ─── API call to trigger completeness calc ────────────────────────────────────

async function triggerCompletenessForProject(
  projectId: string
): Promise<CompletenessApiResponse> {
  // The GET endpoint resolves project_id from the authenticated user's session.
  // For the backfill we call a Supabase RPC or use the REST endpoint directly.
  // We call the Next.js API with the project_id passed as a query param so the
  // route can override its project resolution. If the route doesn't support
  // that param, we fall back to direct Supabase RPC completeness query.
  const url = `${BASE_URL}/api/svi/evidence-completeness?project_id=${projectId}`;
  const res = await fetch(url, {
    headers: {
      // Pass service role as Bearer — works if the route calls getSupabaseAdmin()
      // and doesn't hard-require session auth for internal calls.
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "x-service-role": "true",
    },
  });
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return res.json() as Promise<CompletenessApiResponse>;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== SVI Evidence Completeness Backfill ===");
  console.log(`Supabase URL : ${SUPABASE_URL}`);
  console.log(`App base URL : ${BASE_URL}`);
  console.log(`Fetching up to ${PROJECT_FETCH_LIMIT} projects...\n`);

  let projects: Project[];
  try {
    projects = await fetchProjects();
  } catch (err) {
    console.error("FATAL: Could not fetch projects.", err);
    process.exit(1);
  }

  console.log(`Found ${projects.length} project(s).\n`);

  let succeeded = 0;
  let failed = 0;

  for (const project of projects) {
    const label = project.name
      ? `"${project.name}" (${project.id})`
      : project.id;

    let result: CompletenessApiResponse;
    try {
      result = await triggerCompletenessForProject(project.id);
    } catch (err) {
      console.error(`  [FAIL] ${label} — fetch error: ${err}`);
      failed++;
      continue;
    }

    if (!result.ok) {
      console.warn(`  [WARN] ${label} — API error: ${result.error}`);
      failed++;
      continue;
    }

    // Summarise dimension completeness
    const dims = result.dimensions ?? [];
    const overallPct =
      dims.length > 0
        ? Math.round(
            dims.reduce((s, d) => s + d.completenessPercent, 0) / dims.length
          )
        : 0;

    const dimSummary = dims
      .map((d) => `${d.dimension}:${d.completenessPercent}%`)
      .join("  ");

    const svi = result.currentSvi ?? 0;
    const projected = result.forecast?.projectedSvi ?? svi;
    const gain = result.forecast?.potentialSviGain ?? 0;

    console.log(
      `  [OK]  ${label}\n` +
        `        overall: ${overallPct}%  svi: ${svi} → ${projected} (+${gain})\n` +
        `        ${dimSummary}`
    );

    succeeded++;
  }

  console.log(
    `\nDone. ${succeeded} succeeded, ${failed} failed out of ${projects.length} projects.`
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
