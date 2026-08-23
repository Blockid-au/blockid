"use client";

/**
 * UTM + click-id + referrer capture.
 *
 * On every landing, if any of {utm_source, utm_medium, utm_campaign,
 * utm_term, utm_content, gclid, fbclid} appears in the URL search params, we:
 *
 *   - Snapshot into localStorage as JSON:
 *       bid_first_touch_v1 — set once, never overwritten (first-touch)
 *       bid_last_touch_v1  — always overwritten on every UTM landing
 *
 *   - Drop matching cookies (SameSite=Lax, 90-day max-age, Secure on https):
 *       bid_ft (first-touch, only if not already set)
 *       bid_lt (last-touch, always overwrite)
 *     so server-side handlers (e.g. /api/score) can persist attribution
 *     alongside the row.
 *
 * If NO utm/click-id param is present, the referrer is captured into
 * `bid_last_touch_v1` only when nothing has been stored yet (so an organic
 * hop from google.com still gets a last-touch record without stomping a
 * genuine UTM last-touch).
 *
 * Mounted once from `src/app/layout.tsx` near <GoogleAnalytics />. Pure
 * side-effect, renders null. Safe inside a Suspense boundary.
 *
 * NOTE: Consent Mode v2 gates GA4 through the ConsentBanner; that is a
 * separate contract. This component only writes to first-party storage —
 * cookies + localStorage on the user's own device — which does not require
 * analytics consent under APP 3/6 (functional/security storage stays
 * granted at consent-default time). No PII, no cross-site tracking.
 */

import { useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";

const FIRST_TOUCH_KEY = "bid_first_touch_v1";
const LAST_TOUCH_KEY = "bid_last_touch_v1";
const FT_COOKIE = "bid_ft";
const LT_COOKIE = "bid_lt";
const MAX_AGE_DAYS = 90;

interface Attribution {
  ts: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer: string | null;
  landing_path: string | null;
}

function isSecure(): boolean {
  if (typeof window === "undefined") return true;
  return window.location?.protocol === "https:";
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  try {
    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
    const secure = isSecure() ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(
      value,
    )}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } catch {
    // Private browsing / partitioned storage can throw — non-fatal.
  }
}

function safeGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // Quota / SecurityError — non-fatal.
  }
}

export function UtmCapture(): null {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const get = (k: string): string | null => {
      const v = searchParams?.get(k) ?? null;
      return v && v.length > 0 ? v : null;
    };

    const source = get("utm_source");
    const medium = get("utm_medium");
    const campaign = get("utm_campaign");
    const term = get("utm_term");
    const content = get("utm_content");
    const gclid = get("gclid");
    const fbclid = get("fbclid");

    const hasAnyParam = !!(source || medium || campaign || term || content || gclid || fbclid);
    const referrer =
      typeof document !== "undefined" && document.referrer ? document.referrer : null;

    // If neither UTM nor click-id landed, only seed a last-touch referrer
    // when nothing has ever been stored (first organic visit). Never
    // clobber a real UTM last-touch with a bare referrer.
    if (!hasAnyParam) {
      if (!safeGet(LAST_TOUCH_KEY) && referrer) {
        const seed: Attribution = {
          ts: new Date().toISOString(),
          source: null,
          medium: "referral",
          campaign: null,
          term: null,
          content: null,
          gclid: null,
          fbclid: null,
          referrer,
          landing_path: pathname ?? null,
        };
        const serialized = JSON.stringify(seed);
        safeSet(LAST_TOUCH_KEY, serialized);
        writeCookie(LT_COOKIE, serialized);
        if (!safeGet(FIRST_TOUCH_KEY)) {
          safeSet(FIRST_TOUCH_KEY, serialized);
          writeCookie(FT_COOKIE, serialized);
        }
      }
      return;
    }

    const attribution: Attribution = {
      ts: new Date().toISOString(),
      source,
      medium,
      campaign,
      term,
      content,
      gclid,
      fbclid,
      referrer,
      landing_path: pathname ?? null,
    };
    const serialized = JSON.stringify(attribution);

    // First-touch: write once, never overwrite.
    if (!safeGet(FIRST_TOUCH_KEY)) {
      safeSet(FIRST_TOUCH_KEY, serialized);
      writeCookie(FT_COOKIE, serialized);
    }

    // Last-touch: always overwrite on a fresh UTM landing.
    safeSet(LAST_TOUCH_KEY, serialized);
    writeCookie(LT_COOKIE, serialized);
  }, [searchParams, pathname]);

  return null;
}

/**
 * Read last-touch attribution from localStorage. Returns null if absent or
 * malformed. Safe on the server (no-ops to null).
 */
export function readLastTouch(): Attribution | null {
  const raw = safeGet(LAST_TOUCH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

/**
 * Read first-touch attribution from localStorage. Returns null if absent or
 * malformed.
 */
export function readFirstTouch(): Attribution | null {
  const raw = safeGet(FIRST_TOUCH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

export default UtmCapture;
