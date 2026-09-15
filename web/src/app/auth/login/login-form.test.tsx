// Colocated render test for the Google block on /auth/login.
//
// Founder report 2026-09-15 ("login Google bị lỗi"): the GIS pop-up path
// can fail after the account pick without the server ever hearing about it.
// The form must therefore ALWAYS offer the server-side redirect flow, and a
// `?google_error=` code coming back from that flow must render as plain
// words (with the exact URI to register on redirect_uri_mismatch).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ qs: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.qs),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/auth/login",
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: () => {} }));

import { LoginForm, googleRedirectHref } from "./login-form";

const savedClient = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const savedSite = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "cid-123";
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  nav.qs = "";
});
afterEach(() => {
  if (savedClient === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = savedClient;
  if (savedSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = savedSite;
});

function html(): string {
  return renderToStaticMarkup(<LoginForm />);
}

describe("LoginForm — Google redirect fallback", () => {
  it("always renders 'Continue with Google (redirect)' → /api/auth/google/start, carrying ?next=", () => {
    nav.qs = "next=%2Fworkspace%2Fanalyses";
    const out = html();
    expect(out).toContain("Continue with Google (redirect)");
    expect(out).toContain('href="/api/auth/google/start?next=%2Fworkspace%2Fanalyses"');
    expect(out).not.toContain('data-testid="google-error"');
  });

  it("drops an off-origin ?next from the redirect link (open-redirect guard)", () => {
    nav.qs = "next=https%3A%2F%2Fevil.com";
    expect(html()).toContain('href="/api/auth/google/start"');
    expect(googleRedirectHref(null)).toBe("/api/auth/google/start");
    expect(googleRedirectHref("/a b")).toBe("/api/auth/google/start?next=%2Fa%20b");
  });

  it("renders nothing for Google when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset", () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const out = html();
    expect(out).not.toContain("Continue with Google");
    expect(out).toContain("Sign in to BlockID");
  });

  it("?google_error=access_denied → plain-language copy in a role=alert", () => {
    nav.qs = "google_error=access_denied";
    const out = html();
    expect(out).toContain('role="alert"');
    expect(out).toContain("Google sign-in was cancelled.");
    // User-side error: no 'Error code' footer.
    expect(out).not.toContain("Error code:");
  });

  it("?google_error=redirect_uri_mismatch shows the exact URI the founder must register", () => {
    nav.qs = "google_error=redirect_uri_mismatch";
    const out = html();
    expect(out).toContain("redirect_uri_mismatch");
    expect(out).toContain("https://blockid.au/api/auth/google/callback");
    expect(out).toContain("Error code:");
    expect(out).toContain("docs/ops/google-sign-in.md");
  });

  it("?google_error=org_internal / access_blocked → consent-screen 'Testing' explanation", () => {
    nav.qs = "google_error=org_internal";
    const out = html();
    expect(out).toContain("Access blocked");
    expect(out).toContain("Testing");
  });

  it("an arbitrary ?google_error value is sanitised, never reflected", () => {
    nav.qs = "google_error=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E";
    const out = html();
    expect(out).not.toContain("onerror");
    expect(out).toContain("Google sign-in failed (unknown).");
  });
});
