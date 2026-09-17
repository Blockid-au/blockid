#!/usr/bin/env node
/**
 * QA test-user seeder — idempotent.
 *
 * Creates 2 accounts per segment × 6 segments = 12 base accounts.
 * Each account gets a staggered `plan_started_at` so downstream trial /
 * billing tests can exercise (T-8d expired, T-7d last day, T-5d mid,
 * T-1d fresh, T-30d active paid, T-60d renewed).
 *
 * Naming: qa-<segment>-<index>@blockid.au
 *
 * Reseller fixture block (P10 §5): after the segment sweep, seeds two
 * public.app_users rows so seed-qa-reseller.mjs can resolve
 * QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL:
 *   - qa-reseller-1@blockid.au           → target of reseller_admins mirror
 *   - qa-founder-attributed-1@blockid.au → target of reseller_attributions
 *     mirror; opportunistically stamps app_users.attribution_reseller_id
 *     to the QAPROBEWHOLESALEACTIVE reseller when that row exists.
 * Overridable via --reseller-admin-email / --reseller-attributed-email or
 * QA_RESELLER_ADMIN_EMAIL / QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL env vars.
 * Skip the block with --skip-reseller-fixture.
 *
 * Multi-admin cohort (P10 Option A step 1 — collision finding docs/plans/
 * p10-temp-reseller-admin-scope-collision-finding.md): when
 * QA_RESELLER_MULTI_ADMIN=1 or --reseller-multi-admin is passed, additionally
 * seeds SEVEN per-variant admin app_users rows so seed-qa-reseller.mjs can
 * mirror one distinct app_users.id onto each variant's reseller_admins row.
 * This prevents the scopedReseller() .maybeSingle() PGRST116 collision that
 * fires whenever the SAME user is a member of MORE THAN ONE reseller. The
 * default (multi-admin off) preserves the tick 132 single-account contract
 * so qa-release-gate.sh keeps its existing shape until the fixture flips.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   QA_RESELLER_ADMIN_EMAIL              (optional, default qa-reseller-1@blockid.au)
 *   QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL (optional, default qa-founder-attributed-1@blockid.au)
 *   QA_RESELLER_MULTI_ADMIN              (optional, "1" enables multi-admin cohort)
 *   QA_RESELLER_ADMIN_EMAIL_<VARIANT>    (optional per-variant override — see MULTI_ADMIN_EMAILS)
 *
 * Flags:
 *   --dry-run                       Print what would happen, do not touch DB.
 *   --reset                         Delete every user whose email starts with `qa-` first.
 *   --segment <name>                Only create accounts for the given segment.
 *   --skip-reseller-fixture         Do not run the P10 §5 reseller-fixture block.
 *   --skip-feedback-fixture         Do not seed the G14-S34 feedback-letter fixture
 *                                   (3 shared assessments / 2 orgs on one claimed
 *                                   project for qa-founder-feedback@blockid.au).
 *   --reseller-admin-email <email>  Override QA_RESELLER_ADMIN_EMAIL.
 *   --reseller-attributed-email <email>
 *                                   Override QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL.
 *   --reseller-multi-admin          Enable P10 Option A multi-admin cohort (7 rows).
 *
 * Passwords are randomly generated and appended to /tmp/blockid-qa-accounts.txt
 * with mode 0600.
 *
 * Owner: QA Lead (W7 track). Wired into scripts/qa-release-gate.sh.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { argv, env, exit } from "node:process";

const SEGMENTS = [
  "founder",
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
  "lp",
];

// Two accounts per segment; index -> days-since-plan-start offset (negative = past)
const STAGGER = [
  { idx: 1, daysAgo: 5 }, // mid-trial
  { idx: 2, daysAgo: 30 }, // active paid
];

// Extra scenarios only for founder segment so the 5 canonical journeys have
// concrete test-clock anchors.
const FOUNDER_EXTRA = [
  { idx: 3, daysAgo: 8, status: "trial_expired" },
  { idx: 4, daysAgo: 7, status: "trial_last_day" },
  { idx: 5, daysAgo: 1, status: "trial_fresh" },
  { idx: 6, daysAgo: 60, status: "renewed" },
];

const args = new Set(argv.slice(2));
const DRY = args.has("--dry-run");
const RESET = args.has("--reset");
const segFlagIdx = argv.indexOf("--segment");
const ONLY_SEGMENT = segFlagIdx > -1 ? argv[segFlagIdx + 1] : null;
const SKIP_RESELLER_FIXTURE = args.has("--skip-reseller-fixture");
const SKIP_FEEDBACK_FIXTURE = args.has("--skip-feedback-fixture");
const rAdminFlagIdx = argv.indexOf("--reseller-admin-email");
const rAttrFlagIdx = argv.indexOf("--reseller-attributed-email");
const RESELLER_ADMIN_EMAIL =
  rAdminFlagIdx > -1
    ? argv[rAdminFlagIdx + 1]
    : env.QA_RESELLER_ADMIN_EMAIL || "qa-reseller-1@blockid.au";
const RESELLER_ATTRIBUTED_EMAIL =
  rAttrFlagIdx > -1
    ? argv[rAttrFlagIdx + 1]
    : env.QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL || "qa-founder-attributed-1@blockid.au";
// P10 Option A multi-admin cohort — see docs/plans/
// p10-temp-reseller-admin-scope-collision-finding.md §Resolution options → A.
// Off by default so tick 132's contract stays intact until the fixture flips.
const RESELLER_MULTI_ADMIN =
  args.has("--reseller-multi-admin") || env.QA_RESELLER_MULTI_ADMIN === "1";
// Variant name → default admin email. Mirrors the seven ResellerVariant members
// declared in web/tests/e2e/fixtures/reseller.ts and the seven VARIANTS in
// web/scripts/seed-qa-reseller.mjs. Per-slot override via
// QA_RESELLER_ADMIN_EMAIL_<VARIANT> (upper-snake) so CI can point at bespoke
// mailbox addresses without editing the seeder.
const MULTI_ADMIN_EMAILS = {
  active_wholesale:
    env.QA_RESELLER_ADMIN_EMAIL_ACTIVE_WHOLESALE ||
    "qa-reseller-wholesale-active@blockid.au",
  active_retail:
    env.QA_RESELLER_ADMIN_EMAIL_ACTIVE_RETAIL ||
    "qa-reseller-retail-active@blockid.au",
  paused:
    env.QA_RESELLER_ADMIN_EMAIL_PAUSED || "qa-reseller-paused@blockid.au",
  terminated:
    env.QA_RESELLER_ADMIN_EMAIL_TERMINATED ||
    "qa-reseller-terminated@blockid.au",
  no_capability:
    env.QA_RESELLER_ADMIN_EMAIL_NO_CAPABILITY ||
    "qa-reseller-no-cap@blockid.au",
  tier_only_zero:
    env.QA_RESELLER_ADMIN_EMAIL_TIER_ONLY_ZERO ||
    "qa-reseller-tier-zero@blockid.au",
  no_budget:
    env.QA_RESELLER_ADMIN_EMAIL_NO_BUDGET ||
    "qa-reseller-no-budget@blockid.au",
};
// Parent reseller for the attributed founder's app_users.attribution_reseller_id
// stamp. Must match the active_wholesale variant code in seed-qa-reseller.mjs.
const QA_PROBE_RESELLER_CODE = "QAPROBEWHOLESALEACTIVE";
const PW_FILE = "/tmp/blockid-qa-accounts.txt";

function need(name) {
  const v = env[name];
  if (!v) {
    console.error(`[seed] missing env ${name}`);
    exit(2);
  }
  return v;
}

const supabase = createClient(
  need("SUPABASE_URL"),
  need("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function randomPassword() {
  return randomBytes(12).toString("base64url") + "!Aa1";
}

function daysAgoIso(days) {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString();
}

async function findUserByEmail(email) {
  // Supabase admin API paginates; scan pages of 200.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function resetQaUsers() {
  console.log("[seed] --reset: deleting all qa-* users");
  const toDelete = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email && u.email.startsWith("qa-") && u.email.endsWith("@blockid.au")) {
        toDelete.push(u);
      }
    }
    if (data.users.length < 200) break;
  }
  for (const u of toDelete) {
    if (DRY) {
      console.log(`  [dry] delete ${u.email}`);
      continue;
    }
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) console.warn(`  ! failed delete ${u.email}: ${error.message}`);
    else console.log(`  x deleted ${u.email}`);
  }
}

async function upsertProfileAndStartup(userId, email, segment, planStartedAt, status) {
  // profiles row (best-effort — table may not exist during early rollout)
  const profile = {
    id: userId,
    email,
    segment,
    plan_started_at: planStartedAt,
    plan_status: status,
    updated_at: new Date().toISOString(),
  };
  const pRes = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
  if (pRes.error && !/relation .* does not exist/.test(pRes.error.message)) {
    console.warn(`  ! profile upsert ${email}: ${pRes.error.message}`);
  }

  // startup shell so downstream flows (SVI, cap table) have a target
  const startup = {
    id: randomUUID(),
    owner_id: userId,
    name: `QA ${segment} ${email.split("@")[0]}`,
    created_at: planStartedAt,
    updated_at: new Date().toISOString(),
  };
  const sExists = await supabase
    .from("startups")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (sExists.error && !/relation .* does not exist/.test(sExists.error.message)) {
    console.warn(`  ! startup lookup ${email}: ${sExists.error.message}`);
    return;
  }
  if (!sExists.data) {
    const sRes = await supabase.from("startups").insert(startup);
    if (sRes.error && !/relation .* does not exist/.test(sRes.error.message)) {
      console.warn(`  ! startup insert ${email}: ${sRes.error.message}`);
    }
  }
}

function planForSegment(segment, idx) {
  if (segment === "founder") {
    if (idx <= 2) return idx === 1 ? "founder_growth" : "founder_scale";
    return "founder_starter";
  }
  if (segment === "investor_angel") return "investor_angel";
  if (segment === "investor_vc") return idx === 1 ? "investor_vc_small" : "investor_vc_enterprise";
  if (segment === "advisor") return "advisor";
  if (segment === "accelerator") return idx === 1 ? "cohort_starter" : "cohort_growth";
  if (segment === "lp") return "lp";
  return "free";
}

async function seedOne(segment, idx, daysAgo, status) {
  const email = `qa-${segment}-${idx}@blockid.au`;
  const existing = await findUserByEmail(email);
  const planStartedAt = daysAgoIso(daysAgo);
  const password = randomPassword();
  const plan = planForSegment(segment, idx);

  if (existing) {
    if (DRY) {
      console.log(`  [dry] update ${email} plan_started_at=${planStartedAt} status=${status}`);
      return { email, action: "skipped", plan, status };
    }
    await upsertProfileAndStartup(existing.id, email, segment, planStartedAt, status);
    console.log(`  = kept ${email} (id ${existing.id.slice(0, 8)})`);
    return { email, action: "kept", plan, status };
  }

  if (DRY) {
    console.log(`  [dry] create ${email} plan=${plan} plan_started_at=${planStartedAt}`);
    return { email, action: "created", plan, status };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { segment, qa: true, plan },
  });
  if (error) {
    console.warn(`  ! createUser ${email}: ${error.message}`);
    return { email, action: "error", plan, status };
  }
  await upsertProfileAndStartup(data.user.id, email, segment, planStartedAt, status);
  appendFileSync(PW_FILE, `${email}\t${password}\t${plan}\t${status}\n`);
  console.log(`  + created ${email}`);
  return { email, action: "created", plan, status };
}

// -- P10 §5 reseller fixture --------------------------------------------------
// Mints two public.app_users rows so seed-qa-reseller.mjs can wire its
// reseller_admins + reseller_attributions mirrors on the next run. Runs
// independent of the Supabase Auth segment sweep above — app_users is a
// bespoke magic-link table (migration 0005), disjoint from auth.users.
async function findResellerIdByCode(code) {
  const { data, error } = await supabase
    .from("resellers")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.warn(`  ! resellers lookup ${code}: ${error.message}`);
    return null;
  }
  return data?.id ?? null;
}

// Why: reseller-admin QA rows need plan="reseller_admin" so
// gateRequireFeature("reseller.*") passes (see LEGACY_FEATURE_FALLBACK in
// web/src/lib/entitlements.ts and docs/plans/p10-wave1-preflight-finding.md
// finding #2). Attributed-customer rows stay on plan="free".
async function upsertResellerFixtureUser({ email, stampAttributionResellerId, plan = "free" }) {
  const lookup = await supabase
    .from("app_users")
    .select("id, attribution_reseller_id, plan")
    .eq("email", email)
    .maybeSingle();
  if (lookup.error) {
    console.warn(`  ! app_users lookup ${email}: ${lookup.error.message}`);
    return { email, action: "error" };
  }

  if (lookup.data) {
    const currentStamp = lookup.data.attribution_reseller_id ?? null;
    const wantStamp = stampAttributionResellerId ?? null;
    const currentPlan = lookup.data.plan ?? null;
    const stampNeeded = wantStamp && wantStamp !== currentStamp;
    const planNeeded = plan && plan !== currentPlan;
    if (stampNeeded || planNeeded) {
      if (DRY) {
        console.log(
          `  [dry] update app_users on ${email}${stampNeeded ? " (attribution)" : ""}${
            planNeeded ? ` (plan→${plan})` : ""
          }`,
        );
        return { email, action: "would-update" };
      }
      const patch = {};
      if (stampNeeded) patch.attribution_reseller_id = wantStamp;
      if (planNeeded) patch.plan = plan;
      const upd = await supabase.from("app_users").update(patch).eq("id", lookup.data.id);
      if (upd.error) {
        console.warn(`  ! update ${email}: ${upd.error.message}`);
        return { email, action: "error" };
      }
      console.log(
        `  * updated ${email}${stampNeeded ? " attribution" : ""}${
          planNeeded ? ` plan→${plan}` : ""
        }`,
      );
      return { email, action: "updated" };
    }
    console.log(`  = kept app_users ${email} (id ${lookup.data.id.slice(0, 8)})`);
    return { email, action: "kept" };
  }

  if (DRY) {
    console.log(
      `  [dry] insert app_users ${email}${
        stampAttributionResellerId ? " (with attribution stamp)" : ""
      } plan=${plan}`,
    );
    return { email, action: "would-create" };
  }

  const row = {
    id: randomUUID(),
    email,
    role: "user",
    plan,
  };
  if (stampAttributionResellerId) {
    row.attribution_reseller_id = stampAttributionResellerId;
  }
  const ins = await supabase.from("app_users").insert(row);
  if (ins.error) {
    console.warn(`  ! app_users insert ${email}: ${ins.error.message}`);
    return { email, action: "error" };
  }
  console.log(
    `  + inserted app_users ${email}${
      stampAttributionResellerId ? " + attribution stamp" : ""
    } plan=${plan}`,
  );
  return { email, action: "created" };
}

async function seedResellerFixtureUsers() {
  console.log(
    `[seed] reseller-fixture block: admin=${RESELLER_ADMIN_EMAIL} attributed=${RESELLER_ATTRIBUTED_EMAIL} multi_admin=${
      RESELLER_MULTI_ADMIN ? "on" : "off"
    }`,
  );

  const parentResellerId = await findResellerIdByCode(QA_PROBE_RESELLER_CODE);
  if (!parentResellerId) {
    console.log(
      `  [note] resellers.code='${QA_PROBE_RESELLER_CODE}' not found — attribution stamp will be skipped. Run seed-qa-reseller.mjs first, then re-run this seeder to pick up the stamp.`,
    );
  }

  const results = [];
  results.push(
    await upsertResellerFixtureUser({
      email: RESELLER_ADMIN_EMAIL,
      stampAttributionResellerId: null,
      plan: "reseller_admin",
    }),
  );
  results.push(
    await upsertResellerFixtureUser({
      email: RESELLER_ATTRIBUTED_EMAIL,
      stampAttributionResellerId: parentResellerId,
      plan: "free",
    }),
  );

  if (RESELLER_MULTI_ADMIN) {
    console.log(
      `  [multi-admin] seeding ${
        Object.keys(MULTI_ADMIN_EMAILS).length
      } per-variant admin app_users rows (Option A step 1 — collision finding)`,
    );
    for (const [variant, email] of Object.entries(MULTI_ADMIN_EMAILS)) {
      if (email === RESELLER_ADMIN_EMAIL) {
        console.log(
          `  = variant=${variant} shares email ${email} with base admin — skipping duplicate insert`,
        );
        continue;
      }
      const r = await upsertResellerFixtureUser({
        email,
        stampAttributionResellerId: null,
        plan: "reseller_admin",
      });
      results.push({ ...r, variant });
    }
  }

  return results;
}

// -- G14-S34 feedback-letter fixture -----------------------------------------
// Three SUBMITTED, SHARED assessments from three evaluator app_users across
// TWO organisations on ONE project claimed by a seeded founder app_user —
// exactly the k ≥ 3 / ≥ 2 org floor of docs/plans/g14-investor-feedback
// D3 / F-5, so `/api/cron/feedback-letters?dry=1` reports the project as
// eligible and a live run writes the letter, the notification and the email
// to qa-founder-feedback@blockid.au. Guarded: runs only when
// `evaluation_assessments` (migration 0392) exists; every row is keyed on
// the fixture emails / slug so re-runs are idempotent. app_users rows only
// (magic-link table, disjoint from auth.users) — like the reseller fixture.
const FEEDBACK_FOUNDER_EMAIL = "qa-founder-feedback@blockid.au";
const FEEDBACK_EVALUATORS = [
  { email: "qa-evaluator-feedback-1@blockid.au", org: "a" },
  { email: "qa-evaluator-feedback-2@blockid.au", org: "a" },
  { email: "qa-evaluator-feedback-3@blockid.au", org: "b" },
];
// Fixed org uuids (investor_organisations has no FK from assessments — 0392 header).
const FEEDBACK_ORG_IDS = { a: "0f33db4c-0000-4000-8000-0000000000aa", b: "0f33db4c-0000-4000-8000-0000000000bb" };
const FEEDBACK_PROJECT_SLUG = "qa-feedback-fixture";

function isMissingRelation(error) {
  return Boolean(error) && (error.code === "42P01" || /does not exist|schema cache|could not find the/i.test(error.message ?? ""));
}

async function ensureAppUser(email, plan, accountType) {
  const lookup = await supabase.from("app_users").select("id").eq("email", email).maybeSingle();
  if (lookup.error) throw new Error(`app_users lookup ${email}: ${lookup.error.message}`);
  if (lookup.data) return lookup.data.id;
  if (DRY) {
    console.log(`  [dry] insert app_users ${email} plan=${plan}`);
    return null;
  }
  const id = randomUUID();
  const row = { id, email, role: "user", plan, display_name: email.split("@")[0], onboarding_completed: true };
  if (accountType) row.account_type = accountType;
  let ins = await supabase.from("app_users").insert(row);
  if (ins.error && /account_type|display_name|onboarding_completed/.test(ins.error.message)) {
    ins = await supabase.from("app_users").insert({ id, email, role: "user", plan });
  }
  if (ins.error) throw new Error(`app_users insert ${email}: ${ins.error.message}`);
  console.log(`  + inserted app_users ${email} plan=${plan}`);
  return id;
}

async function seedFeedbackLetterFixture() {
  const probe = await supabase.from("evaluation_assessments").select("id").limit(1);
  if (probe.error) {
    if (isMissingRelation(probe.error)) {
      console.log("[seed] feedback-letter fixture skipped: evaluation_assessments (migration 0392) not applied");
      return { action: "skipped" };
    }
    throw new Error(`evaluation_assessments probe: ${probe.error.message}`);
  }

  const founderId = await ensureAppUser(FEEDBACK_FOUNDER_EMAIL, "founder_starter", "founder");
  const evaluatorIds = [];
  for (const e of FEEDBACK_EVALUATORS) evaluatorIds.push(await ensureAppUser(e.email, "investor_angel", "investor_angel"));
  if (DRY || !founderId || evaluatorIds.some((id) => !id)) {
    console.log("  [dry] would seed 1 project + 1 claimed evaluation + 3 submitted/shared assessments (2 orgs)");
    return { action: "would-create" };
  }

  // Project owned by evaluator 1 (projects.user_id = the evaluator who entered the startup — 0314 header).
  const ownerId = evaluatorIds[0];
  let project = await supabase.from("projects").select("id").eq("user_id", ownerId).eq("slug", FEEDBACK_PROJECT_SLUG).maybeSingle();
  if (project.error) throw new Error(`projects lookup: ${project.error.message}`);
  let projectId = project.data?.id ?? null;
  if (!projectId) {
    projectId = randomUUID();
    const ins = await supabase.from("projects").insert({ id: projectId, user_id: ownerId, name: "QA Feedback Fixture Startup", slug: FEEDBACK_PROJECT_SLUG, stage: 2, industry: "SaaS" });
    if (ins.error) throw new Error(`projects insert: ${ins.error.message}`);
    console.log(`  + inserted project ${FEEDBACK_PROJECT_SLUG}`);
  }

  // One evaluation per evaluator on the SAME project; evaluator 1's row is the
  // one the founder claimed (founder_user_id + owner_kind founder_claimed).
  const evaluationIds = [];
  for (let i = 0; i < evaluatorIds.length; i++) {
    const evaluatorId = evaluatorIds[i];
    const existing = await supabase.from("evaluations").select("id").eq("evaluator_user_id", evaluatorId).eq("project_id", projectId).maybeSingle();
    if (existing.error) throw new Error(`evaluations lookup: ${existing.error.message}`);
    let evaluationId = existing.data?.id ?? null;
    const claimed = i === 0;
    const patch = claimed
      ? { owner_kind: "founder_claimed", consent_tier: "reports_shared", founder_user_id: founderId, founder_email: FEEDBACK_FOUNDER_EMAIL, claimed_at: new Date().toISOString() }
      : { owner_kind: "evaluator" };
    if (!evaluationId) {
      evaluationId = randomUUID();
      const ins = await supabase.from("evaluations").insert({ id: evaluationId, evaluator_user_id: evaluatorId, project_id: projectId, label: "QA feedback fixture", ...patch });
      if (ins.error) throw new Error(`evaluations insert: ${ins.error.message}`);
      console.log(`  + inserted evaluation for ${FEEDBACK_EVALUATORS[i].email}${claimed ? " (founder_claimed)" : ""}`);
    } else if (claimed) {
      const upd = await supabase.from("evaluations").update(patch).eq("id", evaluationId);
      if (upd.error) throw new Error(`evaluations update: ${upd.error.message}`);
    }
    evaluationIds.push(evaluationId);
  }

  // Three submitted + shared assessments (dimension_ratings · risks · questions).
  const ratings = [
    { FTV: { rating: 4, stance: "agree" }, MPC: { rating: 3, stance: "agree" }, TRE: { rating: 2, stance: "disagree" }, PTD: { rating: 3, stance: "unsure" } },
    { FTV: { rating: 5, stance: "agree" }, MPC: { rating: 3, stance: "unsure" }, TRE: { rating: 1, stance: "disagree" }, PTD: { rating: 4, stance: "agree" } },
    { FTV: { rating: 4, stance: "disagree" }, MPC: { rating: 4, stance: "agree" }, TRE: { rating: 2, stance: "agree" }, PTD: { rating: 3, stance: "agree" } },
  ];
  let created = 0;
  for (let i = 0; i < evaluatorIds.length; i++) {
    const existing = await supabase.from("evaluation_assessments").select("id").eq("evaluation_id", evaluationIds[i]).eq("assessor_user_id", evaluatorIds[i]).eq("version", 1).maybeSingle();
    if (existing.error) throw new Error(`evaluation_assessments lookup: ${existing.error.message}`);
    if (existing.data) continue;
    const now = new Date().toISOString();
    const ins = await supabase.from("evaluation_assessments").insert({
      id: randomUUID(),
      evaluation_id: evaluationIds[i],
      project_id: projectId,
      assessor_user_id: evaluatorIds[i],
      org_id: FEEDBACK_ORG_IDS[FEEDBACK_EVALUATORS[i].org],
      version: 1,
      status: "submitted",
      decision: i === 1 ? "proceed" : "track",
      conviction: 3 + (i % 2),
      thesis_fit_pct: 55 + i * 10,
      dimension_ratings: ratings[i],
      risks: [
        { title: "No recurring revenue yet", severity: "high", dimension: "TRE", source: "evaluator" },
        ...(i === 2 ? [{ title: "Key-person risk", severity: "medium", dimension: "FTV", source: "ai" }] : []),
      ],
      questions_for_founder: [{ text: "What is your monthly churn?", dimension: "TRE" }, ...(i === 0 ? [{ text: "Who signs the first enterprise contract?" }] : [])],
      private_notes: "QA fixture — private, must never reach the founder",
      shared_notes: "QA fixture — shared note",
      shared_fields: ["dimension_ratings", "risks", "questions_for_founder"],
      shared_with_founder_at: now,
      submitted_at: now,
    });
    if (ins.error) throw new Error(`evaluation_assessments insert: ${ins.error.message}`);
    created++;
  }
  console.log(`  = feedback-letter fixture ready: project ${projectId.slice(0, 8)} · 3 evaluators / 2 orgs · ${created} new assessment(s)`);
  return { action: created ? "created" : "kept", projectId };
}

async function main() {
  console.log(
    `[seed] mode=${DRY ? "dry-run" : "live"} reset=${RESET} onlySegment=${ONLY_SEGMENT ?? "*"}`,
  );

  if (!DRY) {
    if (!existsSync(PW_FILE)) writeFileSync(PW_FILE, "# email\tpassword\tplan\tstatus\n");
    try {
      chmodSync(PW_FILE, 0o600);
    } catch {
      /* ignore */
    }
  }

  if (RESET) await resetQaUsers();

  const results = [];
  for (const segment of SEGMENTS) {
    if (ONLY_SEGMENT && segment !== ONLY_SEGMENT) continue;
    for (const s of STAGGER) {
      const status = s.daysAgo <= 7 ? "trialing" : "active";
      results.push(await seedOne(segment, s.idx, s.daysAgo, status));
    }
    if (segment === "founder") {
      for (const e of FOUNDER_EXTRA) {
        results.push(await seedOne(segment, e.idx, e.daysAgo, e.status));
      }
    }
  }

  console.log("\n[seed] summary");
  console.log("email".padEnd(42), "action".padEnd(10), "plan".padEnd(24), "status");
  for (const r of results) {
    console.log(
      r.email.padEnd(42),
      r.action.padEnd(10),
      r.plan.padEnd(24),
      r.status,
    );
  }
  const created = results.filter((r) => r.action === "created").length;
  const kept = results.filter((r) => r.action === "kept").length;
  const errored = results.filter((r) => r.action === "error").length;
  console.log(`\ncreated=${created} kept=${kept} errored=${errored} total=${results.length}`);

  let fixtureErrored = 0;
  if (!SKIP_RESELLER_FIXTURE) {
    const fixtureResults = await seedResellerFixtureUsers();
    console.log("\n[seed] reseller-fixture summary");
    console.log("email".padEnd(42), "action");
    for (const r of fixtureResults) {
      console.log(r.email.padEnd(42), r.action);
    }
    fixtureErrored = fixtureResults.filter((r) => r.action === "error").length;
  } else {
    console.log("\n[seed] reseller-fixture skipped via --skip-reseller-fixture");
  }

  // G14-S34 — founder feedback letter fixture (skips itself before 0392).
  let feedbackErrored = 0;
  if (!SKIP_FEEDBACK_FIXTURE) {
    try {
      const r = await seedFeedbackLetterFixture();
      console.log(`\n[seed] feedback-letter fixture: ${r.action}${r.projectId ? ` (project ${r.projectId})` : ""}`);
    } catch (e) {
      feedbackErrored = 1;
      console.warn(`\n[seed] feedback-letter fixture failed: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.log("\n[seed] feedback-letter fixture skipped via --skip-feedback-fixture");
  }

  if (errored > 0 || fixtureErrored > 0 || feedbackErrored > 0) exit(1);
}

main().catch((e) => {
  console.error("[seed] fatal", e);
  exit(1);
});
