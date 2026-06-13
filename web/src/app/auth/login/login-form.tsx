"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

/* ---------- Types ---------- */
type EmailState = "idle" | "sending" | "sent" | "error";
type CouponState = "idle" | "validating" | "valid" | "invalid";

interface CouponResult {
  code: string;
  discount_pct: number;
  label?: string;
}

/* ========================================================================== */
/*  Google Sign-In                                                            */
/* ========================================================================== */

function GoogleSignIn({ nextUrl }: { nextUrl: string | null }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[blockid:auth] Google sign-in API error", res.status, data);
          throw new Error(data.error ?? `Google sign-in failed (${res.status})`);
        }
        trackEvent("login_google_success", {});
        const target = nextUrl ?? data.redirect ?? "/";
        const sep = target.includes("?") ? "&" : "?";
        window.location.href = `${target}${sep}logged_in=true`;
      } catch (err) {
        console.error("[blockid:auth] Google sign-in error", err);
        setError(err instanceof Error ? err.message : "Google sign-in failed");
        setLoading(false);
      }
    },
    [nextUrl],
  );

  const [gsiReady, setGsiReady] = useState(false);
  const [gsiError, setGsiError] = useState(false);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const scriptId = "google-gsi-script";

    function initGoogle(id: string) {
      try {
        window.google?.accounts.id.initialize({
          client_id: id,
          callback: handleCredentialResponse,
        });
        if (btnRef.current) {
          window.google?.accounts.id.renderButton(btnRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: btnRef.current.offsetWidth,
          });
          setGsiReady(true);
        }
      } catch {
        setGsiError(true);
      }
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => initGoogle(clientId);
      script.onerror = () => setGsiError(true);
      document.head.appendChild(script);
    } else if (window.google?.accounts) {
      initGoogle(clientId);
    } else {
      // Script tag exists but GSI not ready — wait and retry
      const timer = setTimeout(() => {
        if (window.google?.accounts) initGoogle(clientId);
        else setGsiError(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [handleCredentialResponse]);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return null;
  }

  return (
    <div className="space-y-2">
      {loading && (
        <p className="text-xs text-surface-400 text-center">Signing in...</p>
      )}
      <div ref={btnRef} className={`w-full min-h-[44px] ${!gsiReady && !gsiError ? "animate-pulse bg-surface-100 rounded-lg" : ""}`} />
      {gsiError && (
        <button
          type="button"
          onClick={() => { window.location.reload(); }}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-lg border border-surface-300 bg-white text-sm font-medium text-ink-700 hover:bg-surface-50 cursor-pointer transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Sign in with Google
        </button>
      )}
      {error && <p className="text-rose-500 text-xs text-center">{error}</p>}
    </div>
  );
}

/* ========================================================================== */
/*  Divider                                                                   */
/* ========================================================================== */

function Divider() {
  return (
    <div className="flex items-center gap-3 my-5">
      <span className="flex-1 h-px bg-surface-300" />
      <span className="text-[11px] uppercase tracking-[0.15em] text-surface-400">
        or continue with email
      </span>
      <span className="flex-1 h-px bg-surface-300" />
    </div>
  );
}

/* ========================================================================== */
/*  Magic-link email form                                                     */
/* ========================================================================== */

function MagicLinkForm({ nextUrl }: { nextUrl: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<EmailState>("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      // Include referral code from localStorage if present.
      const refCode =
        typeof window !== "undefined"
          ? localStorage.getItem("blockid_ref")
          : null;

      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          intent: "login",
          // Pass post-login redirect so the verify route can honour it.
          ...(nextUrl ? { next: nextUrl } : {}),
          // Pass referral code in pendingPayload for processing on verify.
          ...(refCode
            ? { pendingPayload: { referralCode: refCode } }
            : {}),
        }),
      });
      if (!res.ok) throw new Error("request failed");
      setState("sent");
      trackEvent("login_email_requested", {});
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="text-ink-600 text-sm leading-relaxed">
        <p className="mb-2">
          Check{" "}
          <span className="text-ink-800 font-medium">{email}</span>{" "}
          for your sign-in link.
        </p>
        <p className="text-surface-400 text-xs">
          The link expires in 15 minutes. Didn&rsquo;t arrive? Check spam or{" "}
          <button
            type="button"
            onClick={() => setState("idle")}
            className="text-brand-500 underline"
          >
            try a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="block text-xs uppercase tracking-[0.12em] text-surface-400 mb-1">
          Email
        </span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="founder@startup.au"
          className="w-full bg-white border border-surface-300 rounded-lg px-3 py-2.5 text-ink-800 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
      >
        {state === "sending" ? "Sending..." : "Send sign-in link"}
      </button>
      {state === "error" && (
        <p className="text-rose-500 text-xs">
          Something went wrong. Check your email and try again.
        </p>
      )}
    </form>
  );
}

/* ========================================================================== */
/*  Coupon code input                                                         */
/* ========================================================================== */

function CouponInput() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [state, setState] = useState<CouponState>("idle");
  const [result, setResult] = useState<CouponResult | null>(null);

  async function validate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setState("validating");
    try {
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!res.ok) {
        setState("invalid");
        setResult(null);
        return;
      }
      const data: CouponResult = await res.json();
      setState("valid");
      setResult(data);
      sessionStorage.setItem("blockid_coupon", JSON.stringify(data));
      trackEvent("partner_code_applied", { valid: true });
    } catch {
      setState("invalid");
      setResult(null);
      trackEvent("partner_code_applied", { valid: false });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-surface-400 hover:text-brand-600 transition-colors mt-1"
      >
        Have a partner code?
      </button>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-surface-300">
      <p className="text-xs uppercase tracking-[0.12em] text-gold-400 font-medium mb-2">
        Partner code
      </p>
      <form onSubmit={validate} className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (state === "invalid") setState("idle");
          }}
          placeholder="e.g. WSTI"
          className="flex-1 bg-white border border-surface-300 rounded-lg px-3 py-2 text-sm text-ink-800 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={state === "validating" || !code.trim()}
          className="px-4 py-2 bg-brand-50 text-brand-600 rounded-lg text-sm font-medium hover:bg-brand-100 transition-colors disabled:opacity-50"
        >
          {state === "validating" ? "..." : "Apply"}
        </button>
      </form>
      {state === "valid" && result && (
        <p className="mt-2 text-xs text-emerald-600">
          {result.label ?? `${result.discount_pct}%`} --{" "}
          discount will be applied at checkout.
        </p>
      )}
      {state === "invalid" && (
        <p className="mt-2 text-xs text-rose-500">
          Code not recognised. Check the spelling and try again.
        </p>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  Composed LoginForm                                                        */
/* ========================================================================== */

/* ========================================================================== */
/*  Forgot Password                                                            */
/* ========================================================================== */

function ForgotPasswordLink() {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="block w-full text-center text-xs text-ink-500 hover:text-brand-600 mt-2 cursor-pointer transition-colors"
      >
        Forgot your password?
      </button>
    );
  }

  const handleReset = async () => {
    if (!email.includes("@")) return;
    setState("sending");
    await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setState("sent");
  };

  if (state === "sent") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
        <p className="text-xs text-emerald-700 font-medium">New password sent!</p>
        <p className="text-[11px] text-emerald-600 mt-1">Check your email for a temporary password. Use it to sign in, then set your own password in your profile.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 rounded-lg border border-surface-300 px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-brand-400"
      />
      <button
        type="button"
        disabled={state === "sending" || !email.includes("@")}
        onClick={() => void handleReset()}
        className="rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-200 disabled:opacity-50 cursor-pointer transition-colors"
      >
        {state === "sending" ? "Sending..." : "Send Reset Link"}
      </button>
    </div>
  );
}

/* ========================================================================== */
/*  Email + Password Form (Login / Register)                                   */
/* ========================================================================== */

function EmailPasswordForm({ nextUrl }: { nextUrl: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    setError(null);

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login-password";
    const body = mode === "register"
      ? { email, password, displayName: displayName || undefined }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Authentication failed");
        setState("error");
        return;
      }

      trackEvent(mode === "register" ? "register_password_success" : "login_password_success", {});
      // New registrations go to Evidence Vault for guided onboarding
      const target = mode === "register" && !nextUrl
        ? "/workspace/evidence?onboarding=true"
        : nextUrl ?? "/";
      const sep = target.includes("?") ? "&" : "?";
      window.location.href = mode === "register" && !nextUrl
        ? target
        : `${target}${sep}logged_in=true`;
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-surface-200 p-0.5 bg-surface-50">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all cursor-pointer ${
            mode === "login" ? "bg-white text-ink-800 shadow-sm" : "text-ink-500 hover:text-ink-700"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all cursor-pointer ${
            mode === "register" ? "bg-white text-ink-800 shadow-sm" : "text-ink-500 hover:text-ink-700"
          }`}
        >
          Create Account
        </button>
      </div>

      {mode === "register" && (
        <input
          type="text"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
        />
      )}

      <input
        type="email"
        required
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
      />

      <input
        type="password"
        required
        minLength={mode === "register" ? 8 : 1}
        placeholder={mode === "register" ? "Password (min 8 characters)" : "Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
      />

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={state === "loading"}
        className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {state === "loading" ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {mode === "register" ? "Creating account..." : "Signing in..."}
          </span>
        ) : (
          mode === "register" ? "Create Account" : "Sign In"
        )}
      </button>

      {mode === "login" && (
        <ForgotPasswordLink />
      )}
    </form>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const nextUrl = searchParams.get("next");
  const [authMethod, setAuthMethod] = useState<"password" | "magic">("password");

  // Track login page view
  useEffect(() => { trackEvent("login_page_viewed", {}); }, []);

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Sign in to BlockID</h2>
      </div>
      <p className="text-ink-600 text-sm leading-relaxed mb-4">
        Own your cap table. Prove your equity. Raise with confidence.
      </p>
      {plan && (
        <p className="text-xs text-ink-600 mb-4">
          Sign in to continue with the{" "}
          <span className="text-brand-600 font-medium capitalize">{plan}</span>{" "}
          plan.
        </p>
      )}
      <GoogleSignIn nextUrl={nextUrl} />
      <Divider />

      {/* Auth method tabs */}
      <div className="flex rounded-lg border border-surface-200 p-0.5 bg-surface-50 mb-4">
        <button
          type="button"
          onClick={() => setAuthMethod("password")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all cursor-pointer ${
            authMethod === "password" ? "bg-white text-ink-800 shadow-sm" : "text-ink-500 hover:text-ink-700"
          }`}
        >
          Email & Password
        </button>
        <button
          type="button"
          onClick={() => setAuthMethod("magic")}
          className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all cursor-pointer ${
            authMethod === "magic" ? "bg-white text-ink-800 shadow-sm" : "text-ink-500 hover:text-ink-700"
          }`}
        >
          Magic Link
        </button>
      </div>

      {authMethod === "password" ? (
        <EmailPasswordForm nextUrl={nextUrl} />
      ) : (
        <MagicLinkForm nextUrl={nextUrl} />
      )}

      <CouponInput />
    </div>
  );
}

/* ---------- Google GSI type augmentation ---------- */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}
