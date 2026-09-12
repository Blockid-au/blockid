"use client";

// Client half of /auth/reset (release QA-4 P2-d). Posts { token, password }
// to /api/auth/reset-password/confirm and sends the user to sign in on
// success. No session is created here.

import { useState } from "react";
import Link from "next/link";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setState("error");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      setState("error");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/auth/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not reset your password. Request a new link.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-xs text-emerald-700 font-medium">Password updated.</p>
        <p className="text-[11px] text-emerald-600 mt-1">
          You have been signed out everywhere.{" "}
          <Link href="/auth/login" className="underline font-medium">Sign in with your new password</Link>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        autoComplete="new-password"
        placeholder="New password (min 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        minLength={8}
        className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
      />

      {error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={state === "loading"}
        className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {state === "loading" ? "Saving…" : "Set new password"}
      </button>

      <p className="text-[11px] text-ink-500 text-center">
        Link expired? <Link href="/auth/login" className="underline">Request a new one</Link>.
      </p>
    </form>
  );
}
