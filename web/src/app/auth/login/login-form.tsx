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

function GoogleSignIn() {
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
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Google sign-in failed");
        }
        trackEvent("login_google_success", {});
        window.location.href = "/dashboard/svi";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed");
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const scriptId = "google-gsi-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => initGoogle(clientId);
      document.head.appendChild(script);
    } else if (window.google?.accounts) {
      initGoogle(clientId);
    }

    function initGoogle(id: string) {
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
      }
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
      <div ref={btnRef} className="w-full min-h-[44px]" />
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

function MagicLinkForm() {
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
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, intent: "login" }),
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

export function LoginForm() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");

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
      <GoogleSignIn />
      <Divider />
      <MagicLinkForm />
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
