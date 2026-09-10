"use client";

/**
 * useAuthUser — client-side "who is signed in?" for chrome that must stay
 * statically renderable.
 *
 * Both public headers (`landing/nav-v2.tsx` and `site/navbar.tsx`) are
 * mounted by server shells on statically generated pages (insights ISR,
 * legal/[doc], solutions/*, team/[agent], startup/[slug] …). Reading cookies
 * in those shells would force every one of them dynamic, so the header asks
 * `/api/auth/me` after hydration instead. That route handles both the
 * Supabase session and the legacy `blockid_session` cookie.
 *
 * Return value:
 *   - `undefined` — still resolving; render a neutral skeleton.
 *   - `null`      — signed out.
 *   - `AuthUser`  — signed in.
 */

import { useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
  plan?: string;
}

export function useAuthUser(): AuthUser | null | undefined {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data: { ok?: boolean; user?: AuthUser | null }) => {
        if (!cancelled) setUser(data.ok && data.user ? data.user : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}

/** Up to two initials from a display name or the local part of an email. */
export function userInitials(user: Pick<AuthUser, "email" | "displayName">): string {
  return (user.displayName || user.email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
}

/** Short label for the trigger: display name, else the email local part. */
export function userShortName(user: Pick<AuthUser, "email" | "displayName">): string {
  return user.displayName || user.email.split("@")[0];
}
