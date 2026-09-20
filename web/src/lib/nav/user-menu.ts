// The ONE signed-in user menu — G13-W5-IA5 (spec §E S-IA5).
//
// Before this sprint three avatar menus existed with three different lists:
// `landing/nav-v2.tsx` (New analysis → /score, My SVI score, My reports,
// Dashboard), `site/navbar.tsx` (the same four in a different style) and the
// workspace `header-account-menu.tsx` (Profile · Billing · Settings · Guides).
// Both surviving menus — the marketing header and the workspace topbar —
// now render this list, so a founder sees the same rows wherever the avatar
// is. `Dashboard` is the persona landing (`PERSONAS[persona].landingHref`;
// an admin signs in to the founder workspace, as in
// `lib/auth/post-login.ts#landingHrefFor`).
//
// Pure data — no React, no Next, no `server-only` — so the client headers,
// the server pages and the docs matrix can all import it. Icons are keyed,
// not imported: each renderer maps `icon` to its own lucide component.

import { PERSONAS, type PersonaKey, isEvaluatorPersona } from "./persona";

export type UserMenuIcon = "new-analysis" | "score" | "reports" | "dashboard" | "billing" | "settings";

export interface UserMenuItem {
  /** Stable id — analytics `nav_click.item`, test selectors. */
  key: UserMenuIcon;
  href: string;
  label: string;
  icon: UserMenuIcon;
}

/** Label of the terminal row every menu renders after the links. */
export const USER_MENU_SIGN_OUT_LABEL = "Sign out";

/**
 * Persona landing for the Dashboard row. Mirrors `landingHrefFor` in
 * `lib/auth/post-login.ts` minus the server-only rollback flag (a menu link
 * to the evaluator landing is harmless when the flag is off — the landing
 * page itself still renders).
 */
export function dashboardHrefFor(persona: PersonaKey | null | undefined): string {
  if (!persona || persona === "admin") return PERSONAS.founder.landingHref;
  return PERSONAS[persona].landingHref;
}

/** The shared rows, in order. Sign out is rendered by the caller (it is a form, not a link). */
export function userMenuItems(persona?: PersonaKey | null): UserMenuItem[] {
  if (isEvaluatorPersona(persona)) {
    // Evaluators have no score of their own — their rows are the evaluator
    // surfaces (W5 review: the founder-shaped menu sent investors to /analyze).
    return [
      // Same keys/icons as the founder rows (renderers map icon by key); only the targets differ.
      { key: "new-analysis", href: "/workspace/evaluations?add=1", label: "Add a startup", icon: "new-analysis" },
      { key: "score", href: "/workspace/evaluations", label: "My evaluations", icon: "score" },
      { key: "reports", href: "/workspace/investor/mandate", label: "My mandate", icon: "reports" },
      { key: "dashboard", href: dashboardHrefFor(persona), label: "Dashboard", icon: "dashboard" },
      // G18-D (2026-09-19): evaluators do not see the founder Settings hub
      // tabs (where Billing lives) and the marketing header's avatar menu has
      // no "View billing" row, so Scout / Firm / Program / Cohort subscribers
      // had no path to cancel. One explicit row — the founder list keeps its
      // five (Billing is under Settings › Billing and "View billing" there).
      { key: "billing", href: "/workspace/billing", label: "Billing", icon: "billing" },
      { key: "settings", href: "/workspace/settings", label: "Settings", icon: "settings" },
    ];
  }
  return [
    // Straight to the analyser — the old `/score` hop was one redirect for nothing.
    { key: "new-analysis", href: "/analyze", label: "New analysis", icon: "new-analysis" },
    { key: "score", href: "/workspace/score", label: "My score", icon: "score" },
    { key: "reports", href: "/workspace/reports", label: "My reports", icon: "reports" },
    { key: "dashboard", href: dashboardHrefFor(persona), label: "Dashboard", icon: "dashboard" },
    { key: "settings", href: "/workspace/settings", label: "Settings", icon: "settings" },
  ];
}

/** Founder default — what a statically rendered header shows before the persona resolves. */
export const USER_MENU_ITEMS: readonly UserMenuItem[] = Object.freeze(userMenuItems("founder"));
