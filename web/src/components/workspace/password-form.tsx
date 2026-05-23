"use client";

import { useState } from "react";

export function PasswordForm({ hasExistingPassword }: { hasExistingPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setState("saving");
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(hasExistingPassword ? { currentPassword } : {}),
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to update password");
        setState("error");
        return;
      }
      setState("success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  return (
    <div className="bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
      <h2 className="text-base font-semibold text-ink-800 mb-1">
        {hasExistingPassword ? "Change Password" : "Set Password"}
      </h2>
      <p className="text-xs text-ink-600 mb-4">
        {hasExistingPassword
          ? "Update your password to keep your account secure."
          : "Set a password so you can sign in with email and password."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {hasExistingPassword && (
          <label className="block">
            <span className="block text-xs text-ink-700 mb-1">Current password</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
            />
          </label>
        )}

        <label className="block">
          <span className="block text-xs text-ink-700 mb-1">New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
          />
        </label>

        <label className="block">
          <span className="block text-xs text-ink-700 mb-1">Confirm new password</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all"
          />
        </label>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {state === "success" && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Password updated successfully!
          </p>
        )}

        <button
          type="submit"
          disabled={state === "saving"}
          className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
        >
          {state === "saving" ? "Saving..." : hasExistingPassword ? "Update Password" : "Set Password"}
        </button>
      </form>
    </div>
  );
}
