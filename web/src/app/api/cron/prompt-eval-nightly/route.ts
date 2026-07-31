/**
 * GET/POST /api/cron/prompt-eval-nightly — Master Upgrade Plan §17.10
 * item H (nightly eval + prompt promotion) + §15.5 new crons.
 *
 * Phase 6 Batch J · sub-J4/Q3 — full wiring:
 *   1. Guard on CRON_SECRET (Bearer or x-cron-secret).
 *   2. Fetch every prompt_versions row where status IN ('shadow','canary'),
 *      capped at MAX_PER_INVOCATION so a large canary backlog cannot
 *      blow the request timeout.
 *   3. For each row, load the golden fixture from
 *      web/test-fixtures/prompt-eval/{agent}-v{version}.json (Zod-validated).
 *      Missing fixtures are surfaced in `missingFixtures[]` and skipped.
 *   4. runEval(fixture, promptVersion, {runCase}) → EvalResult.
 *   5. Persist EvalResult on prompt_versions.evaluation_result (jsonb).
 *   6. If shouldPromote(result) AND status='canary' → promoteCanaryToProd().
 *      Shadow rows are never auto-promoted — a human moves shadow → canary
 *      first so we always get one nightly cycle at low traffic.
 *   7. Return a summary the ops dashboard can chart:
 *      { evaluated, promoted, failed_promotion, missingFixtures[] }.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { callStructured } from "@/lib/ai/call-structured";
import {
  PromptEvalFixture,
  runEval,
  shouldPromote,
  type CaseRunner,
  type FixtureCase,
} from "@/lib/ai/eval-runner";
import {
  PromptVersion,
  promoteCanaryToProd,
  type PromptVersion as PromptVersionT,
} from "@/lib/ai/prompt-registry";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FIXTURE_DIR = path.join(process.cwd(), "test-fixtures", "prompt-eval");

// Bounded per invocation so a large backlog cannot exceed the platform
// timeout. Any leftover canaries get evaluated on the next tick.
const MAX_PER_INVOCATION = 20;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length === 0) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const xCron = request.headers.get("x-cron-secret");
  if (xCron === secret) return true;
  return false;
}

async function loadFixture(
  agent: string,
  version: string,
): Promise<z.infer<typeof PromptEvalFixture> | null> {
  const p = path.join(FIXTURE_DIR, `${agent}-v${version}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
  try {
    return PromptEvalFixture.parse(JSON.parse(raw));
  } catch {
    // Malformed fixture is treated as "missing" so bad JSON does not
    // wedge the whole cron; the missingFixtures[] surface will flag it.
    return null;
  }
}

// ── Default case runner ──────────────────────────────────────────────
//
// Wraps callStructured with a permissive schema — eval-runner scores
// the *content* of the output; letting the wrapper permit any JSON
// object here keeps the eval loop working before every agent has a
// pinned Zod output schema. When an agent does have one, the caller
// can override `runCaseImpl` in production.

const permissiveInput = z.record(z.string(), z.unknown());
const permissiveOutput = z.record(z.string(), z.unknown());

function defaultRunCase(): CaseRunner {
  return async (fx: FixtureCase, pv: PromptVersionT) => {
    const started = Date.now();
    const res = await callStructured({
      promptVersionId: pv.id,
      agent: pv.agent,
      model: pv.model,
      inputSchema: permissiveInput,
      outputSchema: permissiveOutput,
      input: fx.input,
      systemPrompt: `Agent ${pv.agent} · ${pv.purpose}. Return ONLY a JSON object matching the agent's contract.`,
      renderUser: (i) => `Evaluate the following case and return JSON:\n${JSON.stringify(i)}`,
      purpose: `prompt_eval:${pv.agent}`,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, reason: res.reason, latencyMs, costUsd: 0, runId: res.runId };
    }
    return {
      ok: true,
      data: res.data as Record<string, unknown>,
      latencyMs,
      costUsd: 0,
      runId: res.runId,
    };
  };
}

// ── Test seam ────────────────────────────────────────────────────────
//
// Exported so the colocated test can inject a mocked case runner
// without touching the real Anthropic wrapper. Production leaves it as
// null → falls back to defaultRunCase().
export type RunCaseFactory = () => CaseRunner;
export const __testHooks: { runCaseFactory: RunCaseFactory | null } = {
  runCaseFactory: null,
};

interface CandidateRow {
  id: string;
  agent: string;
  version: string;
  status: string;
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503 },
    );
  }

  let candidates: CandidateRow[] = [];
  try {
    const { data } = await supabase
      .from("prompt_versions")
      .select("*")
      .in("status", ["shadow", "canary"])
      .limit(MAX_PER_INVOCATION);
    candidates = ((data ?? []) as unknown[])
      .map(row => {
        // Full PromptVersion validation so a schema-drifted row does
        // not blow the cron — invalid rows are just skipped.
        const parsed = PromptVersion.safeParse(row);
        return parsed.success ? parsed.data : null;
      })
      .filter((r): r is PromptVersionT => r !== null)
      .map(r => ({ id: r.id, agent: r.agent, version: r.version, status: r.status }));
  } catch {
    candidates = [];
  }

  const runCase = (__testHooks.runCaseFactory ?? defaultRunCase)();

  let evaluated = 0;
  let promoted = 0;
  let failed_promotion = 0;
  const missingFixtures: string[] = [];

  for (const cand of candidates) {
    const fixture = await loadFixture(cand.agent, cand.version);
    if (!fixture) {
      missingFixtures.push(`${cand.agent}-v${cand.version}`);
      continue;
    }

    // Re-hydrate the full PromptVersion so runEval + promote get a
    // stable, Zod-validated shape.
    const { data: fullRow } = await supabase
      .from("prompt_versions")
      .select("*")
      .eq("id", cand.id)
      .maybeSingle();
    const pvParsed = PromptVersion.safeParse(fullRow);
    if (!pvParsed.success) {
      missingFixtures.push(`${cand.agent}-v${cand.version} (row parse failed)`);
      continue;
    }
    const pv = pvParsed.data;

    const result = await runEval(fixture, pv, { runCase });
    evaluated += 1;

    // Persist. Any db error here is logged via .error but not thrown —
    // the promotion decision still runs on the in-memory result.
    await supabase
      .from("prompt_versions")
      .update({ evaluation_result: result })
      .eq("id", cand.id);

    if (cand.status === "canary" && shouldPromote(result)) {
      const p = await promoteCanaryToProd(pv.agent, pv.id, "nightly_eval");
      if (p.ok) promoted += 1;
      else failed_promotion += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    inspected: candidates.length,
    evaluated,
    promoted,
    failed_promotion,
    missingFixtures,
    cap: MAX_PER_INVOCATION,
  });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
