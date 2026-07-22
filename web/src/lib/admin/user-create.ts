// Pure helpers for the P12.5 create-user endpoint.
//
// POST /api/admin/users/create accepts an admin-authored payload that names a
// new user by email + segment + account_type + plan (+ optional credits grant).
// The route resolves the write against app_users; validation stays here so the
// branch is unit-testable without Supabase. Mirrors the P12.6 permissions
// pattern (validate* → apply*/normalise* pure lib + thin route).

import { isAccountType, type AccountType } from "@/lib/segments";

// Segment enum accepted by /api/onboarding/save-progress + StepSegment — the
// admin create path stays aligned so an admin-created row lands identically to
// a self-signup row. Kept in one place so a segment addition surfaces as a
// compile error here too.
export const CREATE_USER_SEGMENTS = [
  "founder",
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
  "lp",
  "admin",
] as const;
export type CreateUserSegment = (typeof CREATE_USER_SEGMENTS)[number];

// Plan slug shape — lowercase alpha/digit/underscore, must start with a
// letter. Matches the plans.csv id column (founder_free, investor_vc_small,
// etc.) and the legacy pre-v2 SKUs (free, founding50, growth, growth_annual).
// Wider than the plans.csv snapshot so an admin can create a row whose plan
// column will be reconciled by a follow-up migration without this endpoint
// having to know the full v2 catalogue.
const PLAN_SLUG = /^[a-z][a-z0-9_]{0,63}$/;

const EMAIL_MAX = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_MAX = 120;
const CREDITS_MAX = 100_000;

export interface RawCreateUserBody {
  email?: unknown;
  segment?: unknown;
  account_type?: unknown;
  plan?: unknown;
  credits?: unknown;
  display_name?: unknown;
}

export interface NormalisedCreateUserBody {
  email: string;
  segment: CreateUserSegment;
  account_type: AccountType;
  plan: string;
  credits: number;
  display_name: string | null;
}

export type CreateUserValidationError =
  | "invalid_body"
  | "invalid_email"
  | "segment_invalid"
  | "account_type_invalid"
  | "plan_invalid"
  | "plan_slug_invalid"
  | "credits_invalid"
  | "display_name_too_long";

export type CreateUserValidation =
  | { ok: true; value: NormalisedCreateUserBody }
  | { ok: false; reason: CreateUserValidationError };

/**
 * Coerce the raw request body into a NormalisedCreateUserBody or return the
 * specific validation error code the route surfaces as 400.
 *
 * Gates enforced (in order — first failing gate wins):
 *   1. body is an object
 *   2. email is a syntactically-valid address, ≤ 320 chars, lowercased
 *   3. segment is one of CREATE_USER_SEGMENTS
 *   4. account_type is one of ACCOUNT_TYPE_VALUES (via isAccountType from P12.1)
 *   5. plan is a non-empty string matching PLAN_SLUG
 *   6. credits, when provided, is a non-negative integer ≤ 100 000
 *   7. display_name, when provided, is ≤ 120 chars after trim
 */
export function validateCreateUserBody(raw: unknown): CreateUserValidation {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_body" };
  const body = raw as RawCreateUserBody;

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  if (
    !emailRaw ||
    emailRaw.length > EMAIL_MAX ||
    !EMAIL_RE.test(emailRaw)
  ) {
    return { ok: false, reason: "invalid_email" };
  }
  const email = emailRaw.toLowerCase();

  if (
    typeof body.segment !== "string" ||
    !(CREATE_USER_SEGMENTS as readonly string[]).includes(body.segment)
  ) {
    return { ok: false, reason: "segment_invalid" };
  }
  const segment = body.segment as CreateUserSegment;

  if (!isAccountType(body.account_type)) {
    return { ok: false, reason: "account_type_invalid" };
  }
  const account_type = body.account_type;

  if (typeof body.plan !== "string" || body.plan.trim().length === 0) {
    return { ok: false, reason: "plan_invalid" };
  }
  const plan = body.plan.trim();
  if (!PLAN_SLUG.test(plan)) {
    return { ok: false, reason: "plan_slug_invalid" };
  }

  // credits is optional. When present it must be a non-negative integer ≤ cap.
  // A missing / null / undefined value collapses to 0 (no grant).
  let credits = 0;
  if (body.credits !== undefined && body.credits !== null) {
    const num =
      typeof body.credits === "number"
        ? body.credits
        : typeof body.credits === "string"
          ? Number.parseInt(body.credits, 10)
          : Number.NaN;
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > CREDITS_MAX) {
      return { ok: false, reason: "credits_invalid" };
    }
    credits = num;
  }

  let display_name: string | null = null;
  if (body.display_name !== undefined && body.display_name !== null) {
    if (typeof body.display_name !== "string") {
      return { ok: false, reason: "display_name_too_long" };
    }
    const trimmed = body.display_name.trim();
    if (trimmed.length > DISPLAY_NAME_MAX) {
      return { ok: false, reason: "display_name_too_long" };
    }
    display_name = trimmed || null;
  }

  return {
    ok: true,
    value: { email, segment, account_type, plan, credits, display_name },
  };
}

export interface AppUsersInsertRow {
  email: string;
  segment: CreateUserSegment;
  account_type: AccountType;
  plan: string;
  display_name: string | null;
}

/**
 * Shape the app_users row the route inserts. Kept pure so the test can
 * assert the exact set of columns landed and no drift creeps in when the
 * plan/segment enums evolve.
 */
export function buildAppUsersInsert(body: NormalisedCreateUserBody): AppUsersInsertRow {
  return {
    email: body.email,
    segment: body.segment,
    account_type: body.account_type,
    plan: body.plan,
    display_name: body.display_name,
  };
}
