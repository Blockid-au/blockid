// Client-side Google Consent Mode v2 helper.
//
// Both AU and non-AU users default to DENIED (opt-in only) so we don't
// have to guess a jurisdiction before consent runs. Once the user grants
// consent, we call gtag('consent','update',…) and mirror the decision to
// localStorage + a first-party cookie so subsequent SSR renders can read
// the state without a flash.

"use client";

const STORAGE_KEY = "blockid_analytics_consent_v1";
const COOKIE_KEY = "blockid_consent";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1y

export interface ConsentState {
  granted: boolean;
  timestamp?: string;
}

// Window.gtag is declared in web/src/lib/analytics.ts as
// `(...args: any[]) => void`. We reuse it here rather than redeclare
// (a stricter `unknown[]` variant would clash with the existing decl).
// Window.gtag + Window.dataLayer are already declared in web/src/lib/analytics.ts.
// Do not redeclare here to avoid TS type-narrowing conflicts.

type Gtag = (...args: any[]) => void;

// ── Local storage / cookie plumbing ────────────────────────────────────

function readStorage(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentState;
  } catch {
    return null;
  }
}

function writeStorage(state: ConsentState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* private mode / storage full — non-fatal */ }
  try {
    const value = state.granted ? "granted" : "denied";
    document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
  } catch { /* SSR / hostile env — non-fatal */ }
}

// ── gtag consent-update helpers ────────────────────────────────────────

function callGtagConsent(mode: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  // Ensure dataLayer exists even if the loader script hasn't finished yet;
  // gtag.js drains the queue when it initialises.
  window.dataLayer = window.dataLayer || [];
  const gtag: Gtag = (...args: unknown[]) => window.dataLayer!.push(args);
  gtag("consent", "update", {
    ad_storage: mode,
    analytics_storage: mode,
    ad_user_data: mode,
    ad_personalization: mode,
  });
}

// ── Public API ─────────────────────────────────────────────────────────

/** Current consent state. Returns { granted:false } if the user has not answered yet. */
export function getConsent(): ConsentState {
  const state = readStorage();
  if (state) return state;
  return { granted: false };
}

/** True if the user has explicitly answered (granted OR denied). */
export function hasResponded(): boolean {
  return readStorage() !== null;
}

export function grantConsent(): void {
  const state: ConsentState = { granted: true, timestamp: new Date().toISOString() };
  writeStorage(state);
  callGtagConsent("granted");
}

export function denyConsent(): void {
  const state: ConsentState = { granted: false, timestamp: new Date().toISOString() };
  writeStorage(state);
  callGtagConsent("denied");
}
