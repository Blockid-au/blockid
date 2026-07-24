// POST /api/admin/affiliate/provision — end-to-end admin provisioning of a
// reseller / affiliate account.
//
// Ships the missing glue that
//   POST /api/admin/resellers               (creates reseller org only)
// leaves unfilled: create the app_users row, flip plan → reseller_admin,
// link the reseller_admins membership, stamp attribution, optionally seed
// credits + mint a tier-0 promotion code, and hand the admin an invite
// artifact (temp password, set password, or magic-link URL).
//
// Auth: requireAdmin() gate identical to the sibling /api/admin/resellers
// route pair — same { ok, reason } shape for 401 no_user / not_admin so a
// future auth-gate refactor lights up all admin specs together.
//
// Transactional posture: supabase-js has no first-class transaction API, so
// this route follows the ordered-write + compensating-delete pattern used
// by /api/reseller/create-startup (see the header comment there for the
// rationale). Every mutation records the previous state so we can roll
// forward on the audit_log INSERT even when a downstream side-effect fails.
//
// Idempotency: re-provisioning the same (email, reseller_code) pair is a
// no-op update (reseller_admins ON CONFLICT bumps role/status; app_users
// display_name refreshes). The response carries `idempotent:true` when no
// new rows were created so the caller can differentiate from a fresh mint.

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getCurrentUser,
  generateTempPassword,
  normaliseEmail,
  isValidEmail,
  requestMagicLink,
} from "@/lib/auth";
import { AdminGateError, requireAdmin } from "@/lib/reseller/require-admin";
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import { getSupabaseAdmin } from "@/lib/supabase";
import { monthKey } from "@/lib/reseller/credit-grants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "/api/admin/affiliate/provision";
const BCRYPT_ROUNDS = 12;
const MAGIC_LINK_TTL_MIN = 24 * 60;

// -----------------------------------------------------------------------------
// zod schema — mirrors POST /api/admin/resellers body for `mode='create'` +
// adds the user + membership + invite + seed_credits + mint_tier0_code
// blocks. Keep the discriminated-union shape so downstream type-narrows
// stay exhaustive.
// -----------------------------------------------------------------------------

const AttachResellerSchema = z.object({
  mode: z.literal("attach"),
  code: z.string().min(1),
});

const CreateResellerSchema = z.object({
  mode: z.literal("create"),
  code: z.string().min(1),
  display_name: z.string().min(2),
  billing_model: z.enum(["retail", "wholesale"]).default("retail"),
  abn: z.string().optional().nullable(),
  gst_registered: z.boolean().optional(),
  monthly_credit_budget: z.number().int().nonnegative().optional(),
  monthly_sandbox_credits: z.number().int().nonnegative().optional(),
  allowed_tiers: z.array(z.number().int()).optional(),
  can_create_startups: z.boolean().optional(),
  can_grant_credits: z.boolean().optional(),
  commission_share_pct: z.number().min(0).max(100).optional(),
  contact_email: z.string().email().optional().nullable(),
});

const ResellerSchema = z.discriminatedUnion("mode", [
  AttachResellerSchema,
  CreateResellerSchema,
]);

const InviteSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("temp_password") }),
  z.object({
    method: z.literal("set_password"),
    password: z.string().min(8),
  }),
  z.object({ method: z.literal("magic_link") }),
]);

const BodySchema = z.object({
  email: z.string().refine(isValidEmail, "invalid_email"),
  display_name: z.string().min(2),
  account_type: z.enum(["reseller", "affiliate"]).default("reseller"),
  role: z.enum(["owner", "admin", "viewer"]).default("owner"),
  reseller: ResellerSchema,
  invite: InviteSchema,
  seed_credits: z.number().int().positive().optional(),
  mint_tier0_code: z
    .object({ code: z.string().min(1) })
    .optional(),
});

type Body = z.infer<typeof BodySchema>;

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

// -----------------------------------------------------------------------------
// Helper — insert audit-log row without letting a failure roll back the
// primary provisioning. reseller_audit_log has BEFORE UPDATE/DELETE triggers
// so INSERT is the only valid write; a hiccup here still surfaces via the
// warn log but does not fail the response.
// -----------------------------------------------------------------------------

async function safeAudit(entry: {
  reseller_id: string;
  actor_user_id: string;
  subject_user_id: string | null;
  action: string;
  route: string;
  ip: string;
  user_agent: string;
  metadata: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    await supabase.from("reseller_audit_log").insert({
      reseller_id: entry.reseller_id,
      actor_user_id: entry.actor_user_id,
      subject_user_id: entry.subject_user_id,
      action: entry.action,
      fields: [],
      route: entry.route,
      ip: entry.ip,
      user_agent: entry.user_agent,
      metadata: entry.metadata,
    });
  } catch (err) {
    console.warn("[admin.affiliate.provision] audit_log insert failed", err);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      const status = err.code === "no_user" ? 401 : 403;
      return NextResponse.json({ ok: false, reason: err.code }, { status });
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const body: Body = parsed.data;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  // Wholesale gate mirrors POST /api/admin/resellers so admins get the same
  // error surface. `ck_wholesale_gst_required` will reject the INSERT anyway
  // but the pre-check keeps the message coherent + saves a round-trip.
  if (body.reseller.mode === "create" && body.reseller.billing_model === "wholesale") {
    if (!body.reseller.gst_registered) {
      return NextResponse.json(
        { ok: false, reason: "wholesale_requires_gst" },
        { status: 400 },
      );
    }
    if (
      !body.reseller.abn ||
      !/^\d{2} \d{3} \d{3} \d{3}$/.test(body.reseller.abn)
    ) {
      return NextResponse.json(
        { ok: false, reason: "wholesale_requires_abn", hint: "format: NN NNN NNN NNN" },
        { status: 400 },
      );
    }
  }

  const normCode = normaliseResellerCode(body.reseller.code);
  if (!normCode) {
    return NextResponse.json({ ok: false, reason: "code_required" }, { status: 400 });
  }

  // ---------------------------------------------------------------------------
  // Step 1 — resolve reseller row (attach OR create).
  // ---------------------------------------------------------------------------
  interface ResellerRowShape {
    id: string;
    code: string;
    display_name: string;
    billing_model: string;
    can_grant_credits: boolean;
  }
  let resellerRow: ResellerRowShape;
  let createdReseller = false;

  {
    const { data: existing } = await supabase
      .from("resellers")
      .select("id, code, display_name, billing_model, can_grant_credits")
      .eq("code", normCode)
      .maybeSingle();

    if (existing) {
      if (body.reseller.mode === "create") {
        return NextResponse.json(
          { ok: false, reason: "reseller_code_taken" },
          { status: 409 },
        );
      }
      resellerRow = existing as ResellerRowShape;
    } else {
      if (body.reseller.mode === "attach") {
        return NextResponse.json(
          { ok: false, reason: "reseller_not_found", code: normCode },
          { status: 404 },
        );
      }
      const { data: inserted, error: insErr } = await supabase
        .from("resellers")
        .insert({
          code: normCode,
          display_name: body.reseller.display_name,
          billing_model: body.reseller.billing_model,
          gst_registered: body.reseller.gst_registered ?? false,
          abn: body.reseller.abn ?? null,
          monthly_credit_budget: body.reseller.monthly_credit_budget ?? 0,
          monthly_sandbox_credits: body.reseller.monthly_sandbox_credits ?? 500,
          allowed_tiers: body.reseller.allowed_tiers ?? [0, 10, 20, 30, 40],
          can_create_startups: body.reseller.can_create_startups ?? false,
          can_grant_credits: body.reseller.can_grant_credits ?? false,
          commission_share_pct: body.reseller.commission_share_pct ?? 40,
          contact_email: body.reseller.contact_email ?? null,
          status: "active",
        })
        .select("id, code, display_name, billing_model, can_grant_credits")
        .single();
      if (insErr || !inserted) {
        return NextResponse.json(
          {
            ok: false,
            reason: "reseller_insert_failed",
            error: insErr?.message,
          },
          { status: 500 },
        );
      }
      resellerRow = inserted as ResellerRowShape;
      createdReseller = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2 — upsert app_users row. Only overwrite password_hash when the
  // caller supplied a temp_password or set_password invite. magic_link
  // leaves the existing hash untouched so a re-provision on an existing
  // account cannot silently rotate a live login credential.
  // ---------------------------------------------------------------------------
  const email = normaliseEmail(body.email);
  let passwordHash: string | null = null;
  let plainTempPassword: string | null = null;
  if (body.invite.method === "temp_password") {
    plainTempPassword = generateTempPassword();
    passwordHash = await bcrypt.hash(plainTempPassword, BCRYPT_ROUNDS);
  } else if (body.invite.method === "set_password") {
    passwordHash = await bcrypt.hash(body.invite.password, BCRYPT_ROUNDS);
  }

  const { data: existingUser } = await supabase
    .from("app_users")
    .select("id, plan, account_type, display_name")
    .eq("email", email)
    .maybeSingle();

  let userId: string;
  let createdUser = false;

  if (existingUser) {
    userId = existingUser.id as string;
    const patch: Record<string, unknown> = {
      display_name: body.display_name,
      plan: "reseller_admin",
      account_type: body.account_type,
      attribution_reseller_id: resellerRow.id,
    };
    if (passwordHash) patch.password_hash = passwordHash;
    const { error: upErr } = await supabase
      .from("app_users")
      .update(patch)
      .eq("id", userId);
    if (upErr) {
      // Rollback the freshly-created reseller row so a retry does not
      // hit the code_taken branch on a stale org.
      if (createdReseller) {
        await supabase.from("resellers").delete().eq("id", resellerRow.id);
      }
      return NextResponse.json(
        { ok: false, reason: "user_update_failed", error: upErr.message },
        { status: 500 },
      );
    }
  } else {
    const { data: created, error: insErr } = await supabase
      .from("app_users")
      .insert({
        email,
        display_name: body.display_name,
        plan: "reseller_admin",
        account_type: body.account_type,
        segment: "founder",
        jurisdiction: "AU",
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
        attribution_reseller_id: resellerRow.id,
        password_hash: passwordHash,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      if (createdReseller) {
        await supabase.from("resellers").delete().eq("id", resellerRow.id);
      }
      return NextResponse.json(
        { ok: false, reason: "user_insert_failed", error: insErr?.message },
        { status: 500 },
      );
    }
    userId = created.id as string;
    createdUser = true;
  }

  // ---------------------------------------------------------------------------
  // Step 3 — reseller_admins membership. UNIQUE (reseller_id, user_id) —
  // ON CONFLICT bumps role + status so a re-provision idempotently promotes.
  // ---------------------------------------------------------------------------
  let createdMembership = false;
  {
    const { data: existingMem } = await supabase
      .from("reseller_admins")
      .select("id, role, status")
      .eq("reseller_id", resellerRow.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMem) {
      const needsUpdate =
        existingMem.role !== body.role || existingMem.status !== "active";
      if (needsUpdate) {
        const { error: memUpErr } = await supabase
          .from("reseller_admins")
          .update({ role: body.role, status: "active", revoked_at: null })
          .eq("id", existingMem.id);
        if (memUpErr) {
          return NextResponse.json(
            {
              ok: false,
              reason: "membership_update_failed",
              error: memUpErr.message,
            },
            { status: 500 },
          );
        }
      }
    } else {
      const { error: memInsErr } = await supabase
        .from("reseller_admins")
        .insert({
          reseller_id: resellerRow.id,
          user_id: userId,
          role: body.role,
          status: "active",
        });
      if (memInsErr) {
        return NextResponse.json(
          {
            ok: false,
            reason: "membership_insert_failed",
            error: memInsErr.message,
          },
          { status: 500 },
        );
      }
      createdMembership = true;
    }
  }

  // Idempotent no-op — everything was already in place. Skip credit + code
  // + audit side-effects (they've already fired on the original call) and
  // return early with `idempotent:true`.
  const idempotent = !createdReseller && !createdUser && !createdMembership;

  // ---------------------------------------------------------------------------
  // Step 4 — optional seed credits. Requires the reseller to have
  // can_grant_credits so we never bypass the credit-governance boundary
  // just because an admin is provisioning. Mirrors the over_budget_approval
  // triad from /api/admin/resellers/requests/[id] (balance upsert +
  // credit_transactions insert + reseller_credit_grants insert).
  // ---------------------------------------------------------------------------
  let seededCredits: number | null = null;
  if (!idempotent && body.seed_credits && body.seed_credits > 0) {
    if (!resellerRow.can_grant_credits) {
      // Don't fail hard — just skip and surface the reason so the admin
      // can decide whether to flip can_grant_credits and retry.
      seededCredits = 0;
    } else {
      const targetUserId = userId;
      const amount = body.seed_credits;

      const { data: balanceRow } = await supabase
        .from("credit_balances")
        .select("balance, lifetime_earned, lifetime_spent")
        .eq("user_id", targetUserId)
        .maybeSingle();
      const currentBalance = Number(balanceRow?.balance ?? 0);
      const lifetimeEarned = Number(balanceRow?.lifetime_earned ?? 0);
      const lifetimeSpent = Number(balanceRow?.lifetime_spent ?? 0);
      const newBalance = currentBalance + amount;

      const { error: balErr } = await supabase.from("credit_balances").upsert(
        {
          user_id: targetUserId,
          balance: newBalance,
          lifetime_earned: lifetimeEarned + amount,
          lifetime_spent: lifetimeSpent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (balErr) {
        return NextResponse.json(
          { ok: false, reason: "credit_balance_failed", error: balErr.message },
          { status: 500 },
        );
      }

      const { data: txRow, error: txErr } = await supabase
        .from("credit_transactions")
        .insert({
          user_id: targetUserId,
          amount,
          balance_after: newBalance,
          reason: "reseller_seed",
          granted_by_reseller_id: resellerRow.id,
          metadata: {
            source: "admin_provision",
            provisioned_by_admin: user!.id,
            reseller_id: resellerRow.id,
          },
        })
        .select("id")
        .single();
      if (txErr || !txRow) {
        return NextResponse.json(
          {
            ok: false,
            reason: "credit_transaction_failed",
            error: txErr?.message,
          },
          { status: 500 },
        );
      }

      const { error: grantErr } = await supabase.from("reseller_credit_grants").insert({
        reseller_id: resellerRow.id,
        target_user_id: targetUserId,
        kind: "grant",
        amount,
        credit_transaction_id: txRow.id,
        month_key: monthKey(new Date()),
        over_budget: false,
        granted_by_user_id: user!.id,
        metadata: {
          source: "admin_provision",
          provisioned_by_admin: user!.id,
        },
      });
      if (grantErr) {
        // Non-fatal — the credit_transactions row is already visible to
        // the founder; the reseller-side mirror row is best-effort. Log
        // and continue so the admin still gets the provisioning envelope.
        console.warn("[admin.affiliate.provision] reseller_credit_grants insert failed", grantErr);
      }
      seededCredits = amount;
    }
  }

  // ---------------------------------------------------------------------------
  // Step 5 — optional tier-0 promotion code mint. Tier 0 requires NULL
  // Stripe IDs (ck_stripe_objects_by_tier); this route deliberately does
  // NOT touch Stripe (that's the /api/admin/resellers/requests/[id]
  // approve-side of P9.4). A collision on the (reseller_id, tier_pct)
  // UNIQUE is a soft failure — the reseller already owns a tier-0 code.
  // ---------------------------------------------------------------------------
  let mintedTier0: { code: string; id: string } | null = null;
  if (!idempotent && body.mint_tier0_code?.code) {
    const codeNorm = normaliseResellerCode(body.mint_tier0_code.code);
    if (codeNorm) {
      const { data: existingCode } = await supabase
        .from("reseller_promotion_codes")
        .select("id, code")
        .eq("reseller_id", resellerRow.id)
        .eq("tier_pct", 0)
        .maybeSingle();
      if (existingCode) {
        mintedTier0 = {
          code: existingCode.code as string,
          id: existingCode.id as string,
        };
      } else {
        const { data: promoRow, error: promoErr } = await supabase
          .from("reseller_promotion_codes")
          .insert({
            reseller_id: resellerRow.id,
            tier_pct: 0,
            code: codeNorm,
            stripe_coupon_id: null,
            stripe_promotion_code_id: null,
            active: true,
          })
          .select("id, code")
          .single();
        if (promoErr) {
          console.warn(
            "[admin.affiliate.provision] promotion_code insert failed",
            promoErr,
          );
        } else if (promoRow) {
          mintedTier0 = {
            code: promoRow.code as string,
            id: promoRow.id as string,
          };
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 6 — build the invite artifact. temp_password / set_password have
  // already hashed into passwordHash above; magic_link requests a fresh
  // login token so the admin can hand-off a one-click URL out-of-band.
  // ---------------------------------------------------------------------------
  let invite:
    | { method: "temp_password"; temp_password: string }
    | { method: "set_password" }
    | { method: "magic_link"; magic_link_url: string | null; token: string | null; expires_at: string | null };

  if (body.invite.method === "temp_password") {
    invite = {
      method: "temp_password",
      temp_password: plainTempPassword!,
    };
  } else if (body.invite.method === "set_password") {
    invite = { method: "set_password" };
  } else {
    // magic_link path — mirror the create-startup route's requestMagicLink
    // (24h TTL, login intent). Failure is soft: the caller still gets the
    // provisioning envelope; the admin can retry via /reseller/create-startup
    // or a password-reset flow.
    const linkResult = await requestMagicLink({
      email,
      intent: "login",
      ttlMinutes: MAGIC_LINK_TTL_MIN,
      pendingPayload: { next: "/reseller" },
    });
    if (linkResult.ok) {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
      const url = `${siteUrl}/auth/verify?token=${encodeURIComponent(linkResult.token)}`;
      invite = {
        method: "magic_link",
        magic_link_url: url,
        token: linkResult.token,
        expires_at: linkResult.expiresAt,
      };
    } else {
      invite = { method: "magic_link", magic_link_url: null, token: null, expires_at: null };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 7 — audit log. Best-effort — a hiccup here still surfaces via the
  // warn log but does not fail the response. Never write the plaintext
  // temp_password / set_password into the audit metadata.
  // ---------------------------------------------------------------------------
  const meta = readClientMeta(request);
  await safeAudit({
    reseller_id: resellerRow.id,
    actor_user_id: user!.id,
    subject_user_id: userId,
    action: "provision_affiliate",
    route: ROUTE,
    ip: meta.ip,
    user_agent: meta.ua,
    metadata: {
      email,
      account_type: body.account_type,
      role: body.role,
      reseller_mode: body.reseller.mode,
      reseller_code: resellerRow.code,
      reseller_created: createdReseller,
      user_created: createdUser,
      membership_created: createdMembership,
      idempotent,
      invite_method: body.invite.method,
      seed_credits: seededCredits,
      mint_tier0_code: mintedTier0?.code ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    idempotent,
    user: {
      id: userId,
      email,
      display_name: body.display_name,
      plan: "reseller_admin",
      account_type: body.account_type,
    },
    reseller: {
      id: resellerRow.id,
      code: resellerRow.code,
      display_name: resellerRow.display_name,
      billing_model: resellerRow.billing_model,
      created: createdReseller,
    },
    membership: {
      role: body.role,
      status: "active",
      created: createdMembership,
    },
    seed_credits: seededCredits,
    tier0_code: mintedTier0,
    invite,
  });
}
