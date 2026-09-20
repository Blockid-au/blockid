// One persona table for the authenticated shell — G13-W1-IA1 (D5).
//
// Replaces `lib/roles/role-taxonomy.ts` (`ROLE_SPECS`, whose `landingHref`
// was never wired) and `lib/nav/role-menu-overlay.ts` (which hid sidebar
// groups by *label string*). A persona is resolved once from the signed-in
// user and drives:
//
//   • which `NAV_GROUPS` ids render in the sidebar (`navGroups`)
//   • where the post-login redirect lands (`landingHref`, consumed by
//     `dashboard/page.tsx` + the login `next` resolver in S-IA4)
//   • which first-run tour auto-launches (`tourSlug`)
//   • which onboarding flow the wizard runs (`onboardingFlow`, S-IA4)
//   • the optional console bridge in the topbar (`console`)
//
// Pure data + one resolver. No React, no Next, no fetch — importable from
// server code, client components and the docs matrix builder alike.
//
// Spec: docs/plans/investor-clarity-2026-09-15/11-pm-ia-post-login.md §C.3.

export type PersonaKey =
  | "founder"
  | "investor_angel"
  | "investor_vc"
  | "advisor"
  | "accelerator"
  | "reseller"
  | "mentor"
  | "innovator"
  | "journalist"
  | "admin";

/**
 * Sidebar group ids — the closed set `NAV_GROUPS[].id` / `ADMIN_NAV_GROUP.id`
 * / `RESELLER_NAV_GROUPS[].id` draw from. Kept here (not in nav-groups.ts)
 * so persona → groups is typed without importing the icon-bearing catalogue.
 */
export type NavGroupId =
  // founder (§A.1)
  | "home"
  | "prove"
  | "money"
  | "company"
  // evaluator (§A.2)
  | "evaluator-home"
  | "dealflow"
  | "reports"
  // consoles
  | "admin"
  | "reseller"
  | "mentor-console";

export type OnboardingFlow = "founder" | "evaluator" | "none";

export interface PersonaConsoleLink {
  href: string;
  label: string;
  /** Short badge shown to the right of the label — e.g. "Console". */
  badge?: string;
  /** WCAG label if the visible text is a short glyph. */
  ariaLabel?: string;
}

export interface Persona {
  key: PersonaKey;
  /** Human-readable label for admin panels + debug telemetry. */
  label: string;
  /** Where the persona lands after login. Must start with '/'. */
  landingHref: string;
  /** Ordered `NAV_GROUPS` ids the sidebar renders for this persona. */
  navGroups: NavGroupId[];
  /** FeatureTourSlug that auto-launches on `landingHref`; null = no tour. */
  tourSlug: string | null;
  onboardingFlow: OnboardingFlow;
  /** Topbar bridge back to the persona's console (reseller / mentor / innovator / admin). */
  console?: PersonaConsoleLink;
}

const FOUNDER_GROUPS: NavGroupId[] = ["home", "prove", "money", "company"];
const EVALUATOR_GROUPS: NavGroupId[] = ["evaluator-home", "dealflow", "reports"];

export const PERSONAS: Readonly<Record<PersonaKey, Persona>> = Object.freeze({
  founder: {
    key: "founder",
    label: "Founder",
    landingHref: "/dashboard",
    navGroups: FOUNDER_GROUPS,
    tourSlug: "founder-first-run",
    onboardingFlow: "founder",
  },
  investor_angel: {
    key: "investor_angel",
    label: "Angel investor",
    landingHref: "/workspace/investor",
    navGroups: EVALUATOR_GROUPS,
    tourSlug: null,
    onboardingFlow: "evaluator",
  },
  investor_vc: {
    key: "investor_vc",
    label: "VC investor",
    landingHref: "/workspace/investor",
    navGroups: EVALUATOR_GROUPS,
    tourSlug: null,
    onboardingFlow: "evaluator",
  },
  advisor: {
    key: "advisor",
    label: "Advisor",
    landingHref: "/workspace/advisor",
    navGroups: EVALUATOR_GROUPS,
    tourSlug: "advisor-first-run",
    onboardingFlow: "evaluator",
  },
  accelerator: {
    key: "accelerator",
    label: "Accelerator",
    landingHref: "/workspace/accelerator",
    navGroups: EVALUATOR_GROUPS,
    tourSlug: "accelerator-first-run",
    onboardingFlow: "evaluator",
  },
  // Reseller / mentor / innovator live in their own console shells. On a
  // founder workspace page they get the Home group only, plus the console
  // bridge in the topbar. The reseller layout mounts `RESELLER_NAV_GROUPS`
  // itself (WorkspaceLayout `navPreset="reseller"`).
  reseller: {
    key: "reseller",
    label: "Reseller",
    landingHref: "/reseller",
    navGroups: ["home"],
    tourSlug: "reseller-first-run",
    onboardingFlow: "none",
    console: { href: "/reseller", label: "Reseller", badge: "Console" },
  },
  mentor: {
    key: "mentor",
    label: "Program mentor",
    landingHref: "/reseller/mentor",
    navGroups: ["home"],
    tourSlug: "mentor-first-run",
    onboardingFlow: "none",
    console: { href: "/reseller/mentor", label: "Mentor", badge: "Console" },
  },
  // G20-F1 (2026-09-20): the Innovator console (/innovator/*) is hidden —
  // four empty shells with no innovator_* tables (lib/features/hidden.ts key
  // innovator_console). The persona keeps resolving (account_type stays in
  // the enum) but lands on the founder dashboard with no console bridge and
  // no auto-tour; the routes answer the "not offered" card.
  innovator: {
    key: "innovator",
    label: "Corporate innovator",
    landingHref: "/dashboard",
    navGroups: ["home"],
    tourSlug: null,
    onboardingFlow: "none",
  },
  journalist: {
    key: "journalist",
    label: "Journalist",
    landingHref: "/dashboard",
    navGroups: ["home"],
    tourSlug: null,
    onboardingFlow: "none",
  },
  admin: {
    key: "admin",
    label: "Admin",
    landingHref: "/admin",
    navGroups: [...FOUNDER_GROUPS, "admin"],
    tourSlug: "founder-first-run",
    onboardingFlow: "none",
    console: { href: "/admin", label: "Admin", ariaLabel: "Admin control panel" },
  },
});

export const PERSONA_KEYS = Object.keys(PERSONAS) as PersonaKey[];

export const EVALUATOR_PERSONAS: readonly PersonaKey[] = Object.freeze([
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
]);

export function isPersonaKey(v: unknown): v is PersonaKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PERSONAS, v);
}

export function isEvaluatorPersona(key: PersonaKey | string | null | undefined): boolean {
  return typeof key === "string" && (EVALUATOR_PERSONAS as readonly string[]).includes(key);
}

/**
 * `app_users.account_type` → persona. The account-type enum is wider than
 * the persona set (legacy `investor`, `incubator`, `affiliate`,
 * `service_provider`), and the onboarding wizard + admin provisioning use
 * the virtual `mentor` / `innovator` values in memory, so every string the
 * column can carry maps somewhere.
 */
const ACCOUNT_TYPE_TO_PERSONA: Readonly<Record<string, PersonaKey>> = Object.freeze({
  founder: "founder",
  investor: "investor_angel",
  investor_angel: "investor_angel",
  investor_vc: "investor_vc",
  advisor: "advisor",
  service_provider: "advisor",
  accelerator: "accelerator",
  incubator: "accelerator",
  reseller: "reseller",
  affiliate: "reseller",
  mentor: "mentor",
  innovator: "innovator",
  journalist: "journalist",
  admin: "admin",
});

/** `app_users.segment` → persona (fallback when account_type is missing). */
const SEGMENT_TO_PERSONA: Readonly<Record<string, PersonaKey>> = Object.freeze({
  founder: "founder",
  investor_angel: "investor_angel",
  investor_vc: "investor_vc",
  advisor: "advisor",
  accelerator: "accelerator",
  lp: "investor_vc",
  admin: "admin",
});

export interface PersonaResolverInput {
  /** `user.role` — "admin" short-circuits to the admin persona. */
  role?: string | null;
  /** `app_users.account_type` (or the virtual mentor / innovator values). */
  accountType?: string | null;
  /** `app_users.segment` — used when account_type is absent or unknown. */
  segment?: string | null;
}

/**
 * Resolve the persona for a signed-in user.
 *
 * Precedence: role=admin → account_type → segment → founder. A legacy
 * `investor` account type defers to the segment when it names the investor
 * rung (angel vs VC), because that is the finer signal.
 */
export function resolvePersona(user: PersonaResolverInput | null | undefined): PersonaKey {
  if (!user) return "founder";
  if (user.role === "admin") return "admin";
  const at = user.accountType ?? null;
  const seg = user.segment ?? null;
  if (at === "investor" && seg && SEGMENT_TO_PERSONA[seg]) return SEGMENT_TO_PERSONA[seg];
  if (at && ACCOUNT_TYPE_TO_PERSONA[at]) return ACCOUNT_TYPE_TO_PERSONA[at];
  if (seg && SEGMENT_TO_PERSONA[seg]) return SEGMENT_TO_PERSONA[seg];
  return "founder";
}

export function getPersona(user: PersonaResolverInput | null | undefined): Persona {
  return PERSONAS[resolvePersona(user)];
}

/** Convenience: iterate personas in declared order. */
export function listPersonas(): Persona[] {
  return PERSONA_KEYS.map((k) => PERSONAS[k]);
}
