// G16-C — pilot lifecycle: start (one-click comp), end early, daily expiry,
// list with counts. Every side effect goes through `PilotDeps` so the
// colocated test runs against an in-memory db, a temp ledger root and
// recording stubs; the routes call the functions with the defaults.
//
// Rules (spec § 3 C, GTM § 3):
//   * the evaluator must already exist in `app_users` — never create one;
//   * plan change = the same column the app reads (`app_users.plan`), the
//     way the Stripe webhook sets it; `previous_plan` is kept for the revert;
//   * comp = plan + `grantCredits` (lib/credits) — never a Stripe coupon;
//   * cap PILOT_CAP active pilots → 409; idempotent on e-mail;
//   * end / expiry revert the plan UNLESS a Stripe subscription row exists
//     for the user (subscription_trial_state trialing / active / past_due)
//     or the plan is no longer the pilot tier (someone else changed it) —
//     never downgrade a payer;
//   * e-mails, ops alert and the audit row are best-effort: a failed send
//     never rolls back a granted comp (it is logged and reported).

import { createIntake, listMyIntakes, publicUrlForSlug, type IntakeWithCounts } from "@/lib/intake/program-intakes";
import { buildPilotEndedEmail, buildPilotReminderEmail, buildPilotWelcomeEmail, type EmailBody } from "./emails";
import {
  daysLeft,
  findActiveByEmail,
  capReached,
  maskEmail,
  newPilotRow,
  normalisePilotEmail,
  planExpiry,
  pilotSource,
  readLedger,
  resolvePilotsRoot,
  upsertPilot,
  type PilotEndReason,
  type PilotRow,
} from "./ledger";
import { DEFAULT_PILOT_DAYS, PILOT_CAP, PILOT_MAX_APPLICANTS, PILOT_MAX_CREDITS, PILOT_MAX_DAYS, PILOT_TIER, defaultPilotCredits } from "./offer";

// ── Dependencies ────────────────────────────────────────────────────────────

export interface PilotUser {
  id: string;
  email: string;
  plan: string | null;
  display_name: string | null;
}

export interface PilotCounts {
  submissions: number;
  reports_run: number;
  assessments: number;
}

export interface PilotDb {
  findUserByEmail(email: string): Promise<PilotUser | null>;
  getPlan(userId: string): Promise<string | null>;
  setPlan(userId: string, plan: string, planStartedAt: string | null): Promise<void>;
  /** True when a Stripe-mirrored subscription is trialing / active / past_due. */
  hasStripeSubscription(userId: string): Promise<boolean>;
  counts(row: Pick<PilotRow, "user_id" | "intake_id" | "started_at">): Promise<PilotCounts>;
}

export interface PilotDeps {
  root?: string;
  now?: () => Date;
  db?: PilotDb | null;
  grantCredits?: (userId: string, amount: number, reason: string, metadata?: Record<string, unknown>) => Promise<{ ok: boolean; balance: number }>;
  createIntake?: typeof createIntake;
  listMyIntakes?: typeof listMyIntakes;
  sendEmail?: (args: { to: string; subject: string; html: string; text?: string }) => Promise<unknown>;
  alert?: (text: string) => Promise<boolean>;
  audit?: (params: { user_id?: string | null; actor: string; action: string; resource_type: string; resource_id?: string | null; detail?: Record<string, unknown> }) => Promise<unknown>;
  id?: () => string;
}

const ACTIVE_SUB_STATUSES = ["trialing", "active", "past_due"] as const;

/** Service-role implementation. Lazy imports keep the module test-friendly. */
export async function supabasePilotDb(): Promise<PilotDb | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  return {
    async findUserByEmail(email) {
      const { data } = await sb.from("app_users").select("id, email, plan, display_name").eq("email", normalisePilotEmail(email)).maybeSingle();
      return (data as PilotUser | null) ?? null;
    },
    async getPlan(userId) {
      const { data } = await sb.from("app_users").select("plan").eq("id", userId).maybeSingle();
      return ((data as { plan?: string | null } | null)?.plan ?? null) as string | null;
    },
    async setPlan(userId, plan, planStartedAt) {
      const { error } = await sb.from("app_users").update({ plan, plan_started_at: planStartedAt }).eq("id", userId);
      if (error) throw new Error(`app_users.plan update failed: ${error.message}`);
    },
    async hasStripeSubscription(userId) {
      const { data, error } = await sb
        .from("subscription_trial_state")
        .select("status, stripe_subscription_id")
        .eq("user_id", userId)
        .in("status", [...ACTIVE_SUB_STATUSES])
        .limit(1);
      if (error) {
        // Fail SAFE: if we cannot read the mirror, do not downgrade.
        console.error("[blockid:pilots] subscription check failed — not reverting", error.message);
        return true;
      }
      return (data ?? []).length > 0;
    },
    async counts(row) {
      const since = row.started_at;
      const [reports, assessments, submissions] = await Promise.all([
        sb.from("evaluation_reports").select("id", { count: "exact", head: true }).eq("user_id", row.user_id).gte("created_at", since),
        sb.from("evaluation_assessments").select("id", { count: "exact", head: true }).eq("assessor_user_id", row.user_id).gte("created_at", since),
        row.intake_id
          ? sb.from("intake_submissions").select("id", { count: "exact", head: true }).eq("intake_id", row.intake_id)
          : Promise.resolve({ count: 0 }),
      ]);
      return {
        submissions: submissions.count ?? 0,
        reports_run: reports.count ?? 0,
        assessments: assessments.count ?? 0,
      };
    },
  };
}

async function resolveDeps(deps: PilotDeps): Promise<Required<Pick<PilotDeps, "root" | "now" | "createIntake" | "listMyIntakes" | "sendEmail" | "alert" | "audit" | "grantCredits">> & { db: PilotDb | null }> {
  const root = deps.root ?? (await resolvePilotsRoot());
  const db = deps.db === undefined ? await supabasePilotDb() : deps.db;
  return {
    root,
    db,
    now: deps.now ?? (() => new Date()),
    // G22-B (0433): a pilot-created intake link is stamped with the evaluator's acting org (fail-soft: null).
    createIntake:
      deps.createIntake ??
      (async (ownerUserId, raw, intakeDeps = {}) => {
        const org = await import("@/lib/investor/organisations")
          .then((m) => m.resolveActingOrg(ownerUserId))
          .catch(() => null);
        return createIntake(ownerUserId, raw, { orgId: org?.id ?? null, ...intakeDeps });
      }),
    listMyIntakes: deps.listMyIntakes ?? listMyIntakes,
    grantCredits: deps.grantCredits ?? (async (userId, amount, reason, metadata) => (await import("@/lib/credits")).grantCredits(userId, amount, reason, metadata)),
    sendEmail: deps.sendEmail ?? (async (args) => (await import("@/lib/email")).sendEmail(args)),
    alert: deps.alert ?? (async (text) => (await import("@/lib/telegram")).sendTelegram(text)),
    audit: deps.audit ?? (async (params) => (await import("@/lib/audit")).appendAudit(params)),
  };
}

async function bestEffort<T>(label: string, fn: () => Promise<T>, warnings: string[]): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[blockid:pilots] ${label} failed`, msg);
    warnings.push(`${label}: ${msg}`);
    return null;
  }
}

// ── Start ───────────────────────────────────────────────────────────────────

export interface StartPilotInput {
  email: string;
  program_name: string;
  days?: number;
  credits?: number;
  intake_slug?: string | null;
  intake_name?: string | null;
}

export type StartPilotResult =
  | { ok: true; existing: boolean; pilot: PilotRow; intake_url: string | null; warnings: string[] }
  | { ok: false; status: 400 | 404 | 409 | 503; error: "invalid_input" | "user_not_found" | "cap_reached" | "already_paying" | "db_unavailable"; message: string; active?: number };

export function validateStartInput(raw: unknown): { ok: true; value: Required<Pick<StartPilotInput, "email" | "program_name" | "days" | "credits">> & Pick<StartPilotInput, "intake_slug" | "intake_name"> } | { ok: false; message: string } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? normalisePilotEmail(b.email) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return { ok: false, message: "email must be a valid address" };
  const program_name = typeof b.program_name === "string" ? b.program_name.trim() : "";
  if (!program_name || program_name.length > 120) return { ok: false, message: "program_name is required (≤ 120 chars)" };
  let days = DEFAULT_PILOT_DAYS;
  if (b.days != null && b.days !== "") {
    const n = Number(b.days);
    if (!Number.isInteger(n) || n < 1 || n > PILOT_MAX_DAYS) return { ok: false, message: `days must be a whole number between 1 and ${PILOT_MAX_DAYS}` };
    days = n;
  }
  let credits = defaultPilotCredits();
  if (b.credits != null && b.credits !== "") {
    const n = Number(b.credits);
    if (!Number.isFinite(n) || n < 0 || n > PILOT_MAX_CREDITS) return { ok: false, message: `credits must be between 0 and ${PILOT_MAX_CREDITS}` };
    credits = Math.round(n * 100) / 100;
  }
  const intake_slug = typeof b.intake_slug === "string" && b.intake_slug.trim() ? b.intake_slug.trim().toLowerCase() : null;
  if (intake_slug && !/^[a-z0-9][a-z0-9-]{2,79}$/.test(intake_slug)) return { ok: false, message: "intake_slug is not a valid slug" };
  const intake_name = typeof b.intake_name === "string" && b.intake_name.trim() ? b.intake_name.trim().slice(0, 120) : null;
  return { ok: true, value: { email, program_name, days, credits, intake_slug, intake_name } };
}

export async function startPilot(input: StartPilotInput, actor: { email: string; id?: string | null }, deps: PilotDeps = {}): Promise<StartPilotResult> {
  const parsed = validateStartInput(input);
  if (!parsed.ok) return { ok: false, status: 400, error: "invalid_input", message: parsed.message };
  const v = parsed.value;
  const d = await resolveDeps(deps);
  const warnings: string[] = [];
  const now = d.now();

  const ledger = await readLedger(d.root);
  const existing = findActiveByEmail(ledger.pilots, v.email);
  if (existing) {
    return { ok: true, existing: true, pilot: existing, intake_url: existing.intake_slug ? publicUrlForSlug(existing.intake_slug) : null, warnings };
  }
  if (capReached(ledger.pilots)) {
    const active = ledger.pilots.filter((p) => p.status === "active").length;
    return { ok: false, status: 409, error: "cap_reached", message: `${active} of ${PILOT_CAP} pilots are active — end one before starting another (the sixth pays list price)`, active };
  }
  if (!d.db) return { ok: false, status: 503, error: "db_unavailable", message: "Database not configured" };

  const user = await d.db.findUserByEmail(v.email);
  if (!user) return { ok: false, status: 404, error: "user_not_found", message: "No BlockID account with that e-mail — the evaluator signs up first; pilots never create accounts" };

  // G16 review: a paying evaluator (Stripe subscription) is never comped —
  // the plan write would overwrite what they pay for and the end/expiry
  // guard would then keep the comped tier forever.
  if (await d.db.hasStripeSubscription(user.id)) {
    return { ok: false, status: 409, error: "already_paying", message: "This evaluator has an active Stripe subscription — pilots are for programs that are not yet customers" };
  }

  // 1. Plan (same column the app reads; the way the webhook sets it).
  const previousPlan = user.plan ?? null;
  await d.db.setPlan(user.id, PILOT_TIER, now.toISOString());

  // 2. Credits — the admin credit-grant path (never a Stripe coupon).
  if (v.credits > 0) {
    const g = await bestEffort("credit grant", () => d.grantCredits(user.id, v.credits, `pilot: ${v.program_name}`, { granted_by: actor.email, admin_action: true, pilot: true }), warnings);
    if (g && !g.ok) warnings.push("credit grant: refused");
  }

  // 3. Intake link, owned by the evaluator.
  let intake: IntakeWithCounts | null = null;
  if (v.intake_slug) {
    const mine = await d.listMyIntakes(user.id);
    intake = mine.find((i) => i.slug === v.intake_slug) ?? null;
    if (!intake) warnings.push(`intake_slug ${v.intake_slug} not found among the evaluator's intakes — none linked`);
  } else {
    const created = await bestEffort(
      "intake create",
      () => d.createIntake(user.id, { name: v.intake_name ?? v.program_name, max_submissions: PILOT_MAX_APPLICANTS, blurb: `Pilot intake for ${v.program_name}` }),
      warnings,
    );
    if (created?.ok) intake = created.intake;
    else if (created) warnings.push(`intake create: ${created.message}`);
  }

  // 4. Ledger.
  const row = newPilotRow(
    {
      user_id: user.id,
      email: user.email,
      program_name: v.program_name,
      previous_plan: previousPlan,
      credits_granted: v.credits,
      intake_id: intake?.id ?? null,
      intake_slug: intake?.slug ?? null,
      days: v.days,
      started_by: actor.email,
    },
    now,
    deps.id?.(),
  );
  const saved = await upsertPilot(d.root, row, "start", now);
  const intakeUrl = saved.intake_slug ? publicUrlForSlug(saved.intake_slug) : null;

  // 5. Welcome e-mail, audit, ops alert — best-effort.
  const mail = buildPilotWelcomeEmail({ programName: saved.program_name, intakeUrl, expiresAt: saved.expires_at, creditsGranted: saved.credits_granted, days: v.days });
  await bestEffort("welcome e-mail", () => d.sendEmail({ to: saved.email, ...mail }), warnings);
  await bestEffort(
    "audit",
    () =>
      d.audit({
        user_id: actor.id ?? null,
        actor: "admin",
        action: "pilot.started",
        resource_type: "pilot",
        resource_id: saved.id,
        detail: { evaluator_user_id: saved.user_id, program_name: saved.program_name, tier: saved.tier, previous_plan: saved.previous_plan, days: v.days, credits: saved.credits_granted, intake_id: saved.intake_id, by: actor.email },
      }),
    warnings,
  );
  await bestEffort(
    "ops alert",
    () => d.alert(`🧪 *Pilot started* — ${saved.program_name}\n${maskEmail(saved.email)} · Program tier for ${v.days} d · ${saved.credits_granted} credits${intakeUrl ? `\nIntake: ${intakeUrl}` : ""}\nby ${actor.email}${warnings.length ? `\n⚠️ ${warnings.join("; ")}` : ""}`),
    warnings,
  );

  return { ok: true, existing: false, pilot: saved, intake_url: intakeUrl, warnings };
}

// ── End / expire ────────────────────────────────────────────────────────────

export type EndPilotResult =
  | { ok: true; pilot: PilotRow; plan_reverted: boolean; warnings: string[] }
  | { ok: false; status: 404 | 409 | 503; error: "not_found" | "not_active" | "db_unavailable"; message: string };

export async function endPilot(id: string, reason: PilotEndReason, actor: { email: string; id?: string | null; kind: "admin" | "cron" }, deps: PilotDeps = {}, note: string | null = null): Promise<EndPilotResult> {
  const d = await resolveDeps(deps);
  const warnings: string[] = [];
  const now = d.now();
  const ledger = await readLedger(d.root);
  const row = ledger.pilots.find((p) => p.id === id);
  if (!row) return { ok: false, status: 404, error: "not_found", message: "No pilot with that id" };
  if (row.status !== "active") return { ok: false, status: 409, error: "not_active", message: `Pilot already ${row.status}` };
  if (!d.db) return { ok: false, status: 503, error: "db_unavailable", message: "Database not configured" };

  // Never downgrade a payer, never fight another plan change.
  let reverted = false;
  let why = "";
  const subscribed = await d.db.hasStripeSubscription(row.user_id);
  if (subscribed) {
    why = "Stripe subscription exists — plan kept";
  } else {
    const current = await d.db.getPlan(row.user_id);
    // A ledger row carries the tier it granted (a retired G21 paid row = its
    // Cohort tier; a comp row = PILOT_TIER — rows written before G21 always do).
    const grantedTier = row.tier ?? PILOT_TIER;
    if (current !== grantedTier) {
      why = `plan is now ${current ?? "null"} (not the pilot tier) — left as is`;
    } else {
      const target = row.previous_plan && row.previous_plan !== grantedTier ? row.previous_plan : "free";
      await d.db.setPlan(row.user_id, target, target === "free" ? null : now.toISOString());
      reverted = true;
      why = `plan reverted to ${target}`;
    }
  }

  const next: PilotRow = {
    ...row,
    status: reason === "expired" ? "expired" : "ended",
    ended_at: now.toISOString(),
    ended_reason: reason,
    plan_reverted: reverted,
    note: [note, why].filter(Boolean).join(" · ") || null,
  };
  const saved = await upsertPilot(d.root, next, reason === "expired" ? "expire" : "end", now);

  const mail: EmailBody = buildPilotEndedEmail({ programName: saved.program_name, reason, planReverted: reverted, previousPlan: saved.previous_plan });
  await bestEffort("ended e-mail", () => d.sendEmail({ to: saved.email, ...mail }), warnings);
  await bestEffort(
    "audit",
    () =>
      d.audit({
        user_id: actor.id ?? null,
        actor: actor.kind,
        action: reason === "expired" ? "pilot.expired" : "pilot.ended",
        resource_type: "pilot",
        resource_id: saved.id,
        detail: { evaluator_user_id: saved.user_id, program_name: saved.program_name, reason, plan_reverted: reverted, why, by: actor.email },
      }),
    warnings,
  );
  await bestEffort("ops alert", () => d.alert(`🧪 *Pilot ${saved.status}* — ${saved.program_name}\n${maskEmail(saved.email)} · ${reason} · ${why}\nby ${actor.email}`), warnings);

  return { ok: true, pilot: saved, plan_reverted: reverted, warnings };
}

// ── Daily expiry ────────────────────────────────────────────────────────────

export interface ExpiryRunResult {
  ok: true;
  dry: boolean;
  at: string;
  reminded: Array<{ id: string; program_name: string; email: string; days_left: number }>;
  expired: Array<{ id: string; program_name: string; email: string; plan_reverted: boolean | null }>;
  warnings: string[];
}

export async function runPilotExpiry(opts: { dry?: boolean } = {}, deps: PilotDeps = {}): Promise<ExpiryRunResult> {
  const d = await resolveDeps(deps);
  const dry = opts.dry === true;
  const now = d.now();
  const warnings: string[] = [];
  const ledger = await readLedger(d.root);
  const plan = planExpiry(ledger.pilots, now);
  const out: ExpiryRunResult = { ok: true, dry, at: now.toISOString(), reminded: [], expired: [], warnings };

  for (const row of plan.remind) {
    const left = daysLeft(row, now);
    out.reminded.push({ id: row.id, program_name: row.program_name, email: maskEmail(row.email), days_left: left });
    if (dry) continue;
    const mail = buildPilotReminderEmail({ programName: row.program_name, expiresAt: row.expires_at, daysLeft: left });
    const sent = await bestEffort("reminder e-mail", () => d.sendEmail({ to: row.email, ...mail }), warnings);
    if (sent !== null) await upsertPilot(d.root, { ...row, reminder_sent_at: now.toISOString() }, "remind", now);
    await bestEffort("ops alert", () => d.alert(`🧪 *Pilot ends in ${left} d* — ${row.program_name} (${maskEmail(row.email)}) · expires ${row.expires_at.slice(0, 10)}`), warnings);
  }

  for (const row of plan.expire) {
    if (dry) {
      out.expired.push({ id: row.id, program_name: row.program_name, email: maskEmail(row.email), plan_reverted: null });
      continue;
    }
    const r = await endPilot(row.id, "expired", { email: "cron", kind: "cron" }, { ...deps, root: d.root, db: d.db, now: d.now }, "expired by pilot-expiry cron");
    if (r.ok) {
      out.expired.push({ id: row.id, program_name: row.program_name, email: maskEmail(row.email), plan_reverted: r.plan_reverted });
      warnings.push(...r.warnings);
    } else {
      warnings.push(`expire ${row.id}: ${r.message}`);
    }
  }
  return out;
}

// ── List ────────────────────────────────────────────────────────────────────

export interface PilotListRow extends PilotRow, PilotCounts {
  days_left: number;
  email_masked: string;
  intake_url: string | null;
}

export async function listPilots(deps: PilotDeps = {}): Promise<{ pilots: PilotListRow[]; active: number; cap: number }> {
  const d = await resolveDeps(deps);
  const now = d.now();
  const ledger = await readLedger(d.root);
  const rows = [...ledger.pilots].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const pilots: PilotListRow[] = [];
  for (const row of rows) {
    let counts: PilotCounts = { submissions: 0, reports_run: 0, assessments: 0 };
    if (d.db) {
      try {
        counts = await d.db.counts(row);
      } catch (err) {
        console.error("[blockid:pilots] counts failed", err instanceof Error ? err.message : String(err));
      }
    }
    pilots.push({ ...row, ...counts, days_left: daysLeft(row, now), email_masked: maskEmail(row.email), intake_url: row.intake_slug ? publicUrlForSlug(row.intake_slug) : null });
  }
  return { pilots, active: rows.filter((r) => r.status === "active" && pilotSource(r) === "comp").length, cap: PILOT_CAP };
}
