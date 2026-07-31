"use client";

// Marketing `?ref=<CODE>` deep-link capture.
//
// Mounted from `web/src/app/layout.tsx` so every marketing page + the pre-auth
// signup flow can capture inbound reseller attribution before the founder
// submits their signup form. The equivalent post-auth attribution lives in
// `web/src/lib/reseller/process-attribution.ts` and is invoked by the signup
// route once a user id exists.
//
// Contract (task M1):
//   - Reads `?ref=` from the URL.
//   - Validates against the RESELLER_CODE_RE contract (letters + optional digits).
//   - Sets cookie `blockid_via` with 90-day max-age, Path=/, SameSite=Lax,
//     Secure when the current origin is https, Domain=.blockid.au when
//     the host matches. Never writes a Domain attr on localhost so browsers
//     stop rejecting the cookie in local dev.
//   - Fires GA4 event `reseller_ref_captured` with the code value.
//   - Removes `?ref=` (and, when present, `?override_ref=`) from the URL via
//     `history.replaceState` so subsequent share links don't leak the code.
//   - Honours first-touch attribution: if `blockid_via` is already set with a
//     different code, keeps the existing value unless the URL also carries
//     `?override_ref=true`.
//
// Rendered as `null`. Pure side-effect component. Safe to mount inside a
// Suspense boundary — no state, no rendering, no waterfalls.

import { useEffect } from "react";
import {
  decideRefCapture,
  buildRefCookieString,
  REF_COOKIE_KEY,
  REF_PARAM,
  OVERRIDE_PARAM,
} from "./reseller-ref-logic";

type GA4Window = Window & {
  gtag?: (cmd: string, event: string, params: Record<string, unknown>) => void;
  dataLayer?: Array<Record<string, unknown>>;
};

function readCookie(key: string): string | null {
  if (typeof document === "undefined") return null;
  for (const raw of document.cookie.split(";")) {
    const [k, v] = raw.trim().split("=");
    if (k === key && v) {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}

function isSecureContext(): boolean {
  if (typeof window === "undefined") return true;
  return window.location?.protocol === "https:";
}

function cookieDomainForHost(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location?.hostname ?? "";
  // Only stamp the shared Domain attr for the production apex + subdomains.
  // Any other host (localhost, previews, custom devs) keeps a host-scoped
  // cookie so browsers don't silently reject a mismatching Domain.
  if (host === "blockid.au" || host.endsWith(".blockid.au")) return ".blockid.au";
  return null;
}

function stripRefFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let mutated = false;
    if (url.searchParams.has(REF_PARAM)) {
      url.searchParams.delete(REF_PARAM);
      mutated = true;
    }
    if (url.searchParams.has(OVERRIDE_PARAM)) {
      url.searchParams.delete(OVERRIDE_PARAM);
      mutated = true;
    }
    if (mutated) {
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    // history / URL parsing failed — non-fatal.
  }
}

function fireGA4Captured(code: string): void {
  if (typeof window === "undefined") return;
  const w = window as GA4Window;
  try {
    w.gtag?.("event", "reseller_ref_captured", { code });
  } catch {
    // gtag failure is never fatal.
  }
  // Fallback to dataLayer.push so GTM containers that don't proxy through
  // gtag still pick up the event.
  if (Array.isArray(w.dataLayer)) {
    try {
      w.dataLayer.push({ event: "reseller_ref_captured", code });
    } catch {
      // ignore
    }
  }
}

export function ResellerRefCapture(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let refParam: string | null = null;
    let overrideParam: string | null = null;
    try {
      const url = new URL(window.location.href);
      refParam = url.searchParams.get(REF_PARAM);
      overrideParam = url.searchParams.get(OVERRIDE_PARAM);
    } catch {
      return;
    }

    // Fast-path: no `?ref=` → nothing to do. Skips the cookie read entirely.
    if (!refParam) return;

    const existingCookie = readCookie(REF_COOKIE_KEY);
    const decision = decideRefCapture({ refParam, overrideParam, existingCookie });

    if (decision.action === "write") {
      const cookieStr = buildRefCookieString(decision.code, {
        isSecure: isSecureContext(),
        domain: cookieDomainForHost(),
      });
      try {
        document.cookie = cookieStr;
      } catch {
        // Non-fatal — private-mode / iframe-partitioned contexts may refuse.
      }
      fireGA4Captured(decision.code);
    }

    // Whether we wrote or skipped, always clean the URL so downstream share
    // buttons don't propagate the reseller code (task M1 explicit contract).
    stripRefFromUrl();
  }, []);

  return null;
}

export default ResellerRefCapture;
