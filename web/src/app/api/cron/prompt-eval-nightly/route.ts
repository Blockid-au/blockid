/**
 * GET/POST /api/cron/prompt-eval-nightly — Master Upgrade Plan §17.10
 * item H (nightly eval + prompt promotion) + §15.5 new crons.
 *
 * Phase 6 Batch J · sub-J4 STUB. Reads every prompt_versions row whose
 * status is 'shadow' or 'canary', then attempts to load a golden
 * fixture from web/test-fixtures/prompt-eval/{agent}-{version}.json.
 *
 * Until the fixture set is populated (follow-up PR), this route
 * returns { evaluated: 0, promoted: 0 } and never mutates
 * prompt_versions — the plumbing is in place so the eval loop can land
 * as a small diff.
 *
 * Auth: Bearer CRON_SECRET OR x-cron-secret header.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FIXTURE_DIR = path.join(
  process.cwd(),
  "test-fixtures",
  "prompt-eval",
);

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const xCron = request.headers.get("x-cron-secret");
  if (xCron === secret) return true;

  return false;
}

interface PromptVersionRow {
  agent: string;
  version: string;
  status: string;
}

async function loadFixture(
  agent: string,
  version: string,
): Promise<unknown | null> {
  try {
    const p = path.join(FIXTURE_DIR, `${agent}-${version}.json`);
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  // prompt_versions table may not yet exist in every environment — the
  // eval loop is opt-in until the prompt registry lands.
  let candidates: PromptVersionRow[] = [];
  try {
    const { data } = await supabase
      .from("prompt_versions")
      .select("agent, version, status")
      .in("status", ["shadow", "canary"]);
    candidates = (data ?? []) as PromptVersionRow[];
  } catch {
    candidates = [];
  }

  let evaluated = 0;
  const missingFixtures: string[] = [];
  for (const cand of candidates) {
    const fixture = await loadFixture(cand.agent, cand.version);
    if (fixture === null) {
      missingFixtures.push(`${cand.agent}-${cand.version}`);
      continue;
    }
    // TODO(follow-up PR): run the actual eval loop against `fixture`,
    // score canary vs. baseline, promote/reject the prompt_version.
    evaluated += 1;
  }

  return NextResponse.json({
    ok: true,
    evaluated: 0, // stub — no mutations until the eval loop ships
    promoted: 0,
    inspected: candidates.length,
    fixturesFound: evaluated,
    missingFixtures,
    note: "Stub route — actual eval + promotion lands in a follow-up PR when the fixture set is populated.",
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
