/**
 * 01 — Plan elevation (opt-in): app_users.plan → 'growth' and the project's
 * growth phase → 'funding' for the QA account only, via the local psql path.
 * Requires LIVE_QA_ELEVATE=1 AND LIVE_QA_ALLOW_DB=1; otherwise the test is
 * skipped and every Growth-gated journey skips itself (fixture `growth`).
 */
import { test, expect } from "./fixtures";
import { env } from "./lib/env";
import { elevatePlan, setGrowthPhase } from "./lib/db";
import { patchRunState } from "./lib/run-state";
import { evidence, get } from "./lib/api";

test.describe.configure({ mode: "serial" });

test("elevate the QA account to Growth + phase 'funding' (local SQL, QA email only)", async ({ api, qa }, testInfo) => {
  test.skip(!env.elevate, "LIVE_QA_ELEVATE not set — Free-plan coverage only");
  test.skip(!env.allowDb, "LIVE_QA_ELEVATE=1 needs LIVE_QA_ALLOW_DB=1 for the psql step");
  expect(qa.projectId, "project id from setup").toBeTruthy();

  const plan = elevatePlan(qa.email, "growth");
  const phase = setGrowthPhase(qa.email, qa.projectId!, "funding");

  const me = await get<{ ok: boolean; user: { plan?: string } | null }>(api, "/api/auth/me");
  await evidence(testInfo, "after elevation", { plan, phase, me: me.body });
  expect(me.body.user?.plan).toBe("growth");
  patchRunState({ plan: "growth", elevated: true });
});
