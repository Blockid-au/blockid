// Shared user helpers — email normalisation, validation, and row mapping.
//
// Centralises the camelCase conversion and field list so every call
// site stays DRY.

// ---------------------------------------------------------------------------
// Email normalisation
// ---------------------------------------------------------------------------

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
  );
}

// ---------------------------------------------------------------------------
// Supabase select columns for app_users
// ---------------------------------------------------------------------------

export const APP_USER_SELECT =
  "id, email, display_name, created_at, last_login_at, role, plan, google_id, avatar_url, discount_pct, startup_name, startup_stage, industry, onboarding_completed, startup_goals";

// ---------------------------------------------------------------------------
// AppUser type and row mapper
// ---------------------------------------------------------------------------

export interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  role: "user" | "admin";
  plan: string | null;
  googleId: string | null;
  avatarUrl: string | null;
  discountPct: number | null;
  startupName: string | null;
  startupStage: string | null;
  industry: string | null;
  onboardingCompleted: boolean;
  startupGoals: string[] | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapAppUser(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
    role: row.role === "admin" ? "admin" : "user",
    plan: row.plan ?? null,
    googleId: row.google_id ?? null,
    avatarUrl: row.avatar_url ?? null,
    discountPct: row.discount_pct ?? null,
    startupName: row.startup_name ?? null,
    startupStage: row.startup_stage ?? null,
    industry: row.industry ?? null,
    onboardingCompleted: row.onboarding_completed ?? false,
    startupGoals: row.startup_goals ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
