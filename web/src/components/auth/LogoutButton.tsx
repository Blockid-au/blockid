"use client";

import { type ReactNode } from "react";
import { broadcastAuthEvent } from "./auth-sync-logic";

interface LogoutButtonProps {
  children: ReactNode;
  className?: string;
  redirectTo?: string;
}

/**
 * Replaces a plain form-POST logout button.  On click it:
 * 1. Broadcasts SIGNED_OUT to all peer tabs via BroadcastChannel
 * 2. POSTs to /api/auth/logout
 * 3. Navigates to the redirect destination
 *
 * Peer tabs receive the broadcast and call router.refresh(), flipping
 * navbar auth state without requiring the user to reload.
 */
export function LogoutButton({
  children,
  className,
  redirectTo = "/auth/login",
}: LogoutButtonProps) {
  async function handleClick() {
    broadcastAuthEvent("SIGNED_OUT");
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // proceed regardless — cookie will expire or next request will 401
    }
    window.location.href = redirectTo;
  }

  return (
    <button type="button" onClick={() => void handleClick()} className={className}>
      {children}
    </button>
  );
}
