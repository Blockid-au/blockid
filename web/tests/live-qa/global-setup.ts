/**
 * Live-QA global setup — provisions ONE founder account for the whole run.
 *
 *   1. POST /api/auth/register  (qa-live-<yyyymmdd-hhmm>@blockid.au, random
 *      password) — one call per run; the register bucket is 60/IP +
 *      5/(IP,email) per window (auth-rate-limit.ts). The member lane (26) and
 *      the dossier lane (28) register their own accounts; three registers per
 *      run sit well inside the bucket. The password is kept in the
 *      (gitignored) run state only
 *      because 25-account re-authenticates the deletion request with it;
 *      the teardown scrubs it after the erasure.
 *   2. POST /api/onboarding/complete so /dashboard does not bounce to the
 *      wizard, then POST /api/projects (the release-qa2 path: onboarding
 *      creates no project, the founder does).
 *   3. Save the session cookie as the Playwright storage state every spec
 *      reuses; write test-results/live-qa/run-state.json for the specs and
 *      the teardown.
 *
 * Plan elevation is NOT done here — 00-free-plan-gates.spec.ts needs the
 * account on Free first; 01-elevate.spec.ts flips the plan (LIVE_QA_ELEVATE=1
 * + LIVE_QA_ALLOW_DB=1) and records `elevated` in the run state.
 */
import { request, type FullConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { LIVE_QA_OUT, LIVE_QA_STORAGE } from "../../playwright.live-qa.config";
import { env, qaEmailForNow, QA_EMAIL_RE } from "./lib/env";
import { fetchWithSwapRetry, json } from "./lib/api";
import { readRunState, writeRunState, RUN_STATE_PATH } from "./lib/run-state";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  void _config;
  if (env.reuseState && existsSync(RUN_STATE_PATH) && existsSync(LIVE_QA_STORAGE)) {
    const s = readRunState();
    console.log(`[live-qa] reusing run state for ${s.email} (LIVE_QA_REUSE_STATE=1)`);
    return;
  }

  mkdirSync(LIVE_QA_OUT, { recursive: true });
  // A stale state from an interrupted run must never be picked up by the
  // teardown as "the account to erase" — start clean.
  rmSync(RUN_STATE_PATH, { force: true });
  rmSync(LIVE_QA_STORAGE, { force: true });

  const email = qaEmailForNow();
  if (!QA_EMAIL_RE.test(email)) throw new Error(`generated email does not match the QA pattern: ${email}`);
  const password = `Qa!${randomBytes(18).toString("base64url")}`; // ≥ 8 chars; persisted in the run state for 25-account only
  const projectName = `QA Live ${email.slice(8, 21)}`;

  const ctx = await request.newContext({ baseURL: env.baseURL, extraHTTPHeaders: { accept: "application/json" } });
  try {
    console.log(`[live-qa] base ${env.baseURL} · registering ${email}`);
    const reg = await fetchWithSwapRetry(ctx, "POST", "/api/auth/register", {
      email,
      password,
      displayName: "QA Live Founder",
    });
    const regBody = (await reg.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; error?: string; user?: { id: string; plan?: string } };
    if (reg.status() === 429) {
      throw new Error(`register rate-limited (429, Retry-After ${reg.headers()["retry-after"] ?? "?"}s) — the register bucket is 60/IP + 5/(IP,email) per window (auth-rate-limit.ts); wait and re-run`);
    }
    if (reg.status() !== 200 || !regBody.ok || regBody.pending || !regBody.user?.id) {
      throw new Error(`register failed: ${reg.status()} ${JSON.stringify(regBody).slice(0, 300)}`);
    }
    const userId = regBody.user.id;

    // Must have a session now.
    const me = await json<{ ok: boolean; user: { id: string; plan?: string } | null }>(ctx, "GET", "/api/auth/me");
    if (!me.body.ok || me.body.user?.id !== userId) throw new Error(`/api/auth/me after register → ${me.status} ${me.text.slice(0, 200)}`);

    const onboarding = await json(ctx, "POST", "/api/onboarding/complete", {
      name: "QA Live Founder",
      role: "founder",
      startupName: projectName,
      stage: "mvp",
      industry: "saas",
      goals: ["valuation"],
    });
    if (onboarding.status !== 200) console.warn(`[live-qa] onboarding/complete → ${onboarding.status} (continuing)`);

    const proj = await json<{ ok: boolean; project?: { id: string; slug: string } ; error?: string }>(ctx, "POST", "/api/projects", {
      name: projectName,
      description: "Throw-away project created by the live-QA suite (S30-A). Erased at the end of the run.",
      industry: "saas",
    });
    if (proj.status !== 201 || !proj.body.project?.id) {
      throw new Error(`POST /api/projects → ${proj.status} ${proj.text.slice(0, 300)}`);
    }

    const state = await ctx.storageState();
    // Persist the founder session as the storage state for every spec, plus
    // the project cookie so every API call and page resolves the QA project.
    const url = new URL(env.baseURL);
    state.cookies.push({
      name: "blockid_project",
      value: proj.body.project.slug,
      domain: url.hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86_400,
      httpOnly: false,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(LIVE_QA_STORAGE, JSON.stringify(state, null, 2));

    writeRunState({
      startedAt: new Date().toISOString(),
      baseURL: env.baseURL,
      email,
      password,
      userId,
      projectId: proj.body.project.id,
      projectSlug: proj.body.project.slug,
      projectName,
      plan: (me.body.user?.plan ?? regBody.user.plan ?? "free") as string,
      elevated: false,
      scratch: {},
    });
    console.log(`[live-qa] provisioned user ${userId} · project ${proj.body.project.id} (${proj.body.project.slug}) · state ${path.relative(process.cwd(), RUN_STATE_PATH)}`);
  } finally {
    await ctx.dispose();
  }
}
