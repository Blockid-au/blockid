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
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   QA_RESELLER_ADMIN_EMAIL              (optional, default qa-reseller-1@blockid.au)
 *   QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL (optional, default qa-founder-attributed-1@blockid.au)
 *
 * Flags:
 *   --dry-run                       Print what would happen, do not touch DB.
 *   --reset                         Delete every user whose email starts with `qa-` first.
 *   --segment <name>                Only create accounts for the given segment.
 *   --skip-reseller-fixture         Do not run the P10 §5 reseller-fixture block.
 *   --reseller-admin-email <email>  Override QA_RESELLER_ADMIN_EMAIL.
 *   --reseller-attributed-email <email>
 *                                   Override QA_RESELLER_ATTRIBUTED_FOUNDER_EMAIL.
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

async function upsertResellerFixtureUser({ email, stampAttributionResellerId }) {
  const lookup = await supabase
    .from("app_users")
    .select("id, attribution_reseller_id")
    .eq("email", email)
    .maybeSingle();
  if (lookup.error) {
    console.warn(`  ! app_users lookup ${email}: ${lookup.error.message}`);
    return { email, action: "error" };
  }

  if (lookup.data) {
    const currentStamp = lookup.data.attribution_reseller_id ?? null;
    const wantStamp = stampAttributionResellerId ?? null;
    if (wantStamp && wantStamp !== currentStamp) {
      if (DRY) {
        console.log(`  [dry] stamp app_users.attribution_reseller_id on ${email}`);
        return { email, action: "would-stamp" };
      }
      const upd = await supabase
        .from("app_users")
        .update({ attribution_reseller_id: wantStamp })
        .eq("id", lookup.data.id);
      if (upd.error) {
        console.warn(`  ! stamp attribution ${email}: ${upd.error.message}`);
        return { email, action: "error" };
      }
      console.log(`  * stamped attribution_reseller_id on ${email}`);
      return { email, action: "stamped" };
    }
    console.log(`  = kept app_users ${email} (id ${lookup.data.id.slice(0, 8)})`);
    return { email, action: "kept" };
  }

  if (DRY) {
    console.log(
      `  [dry] insert app_users ${email}${
        stampAttributionResellerId ? " (with attribution stamp)" : ""
      }`,
    );
    return { email, action: "would-create" };
  }

  const row = {
    id: randomUUID(),
    email,
    role: "user",
    plan: "free",
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
    }`,
  );
  return { email, action: "created" };
}

async function seedResellerFixtureUsers() {
  console.log(
    `[seed] reseller-fixture block: admin=${RESELLER_ADMIN_EMAIL} attributed=${RESELLER_ATTRIBUTED_EMAIL}`,
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
    }),
  );
  results.push(
    await upsertResellerFixtureUser({
      email: RESELLER_ATTRIBUTED_EMAIL,
      stampAttributionResellerId: parentResellerId,
    }),
  );
  return results;
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

  if (errored > 0 || fixtureErrored > 0) exit(1);
}

main().catch((e) => {
  console.error("[seed] fatal", e);
  exit(1);
});
