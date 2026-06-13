"use client";

import { useState } from "react";
import { Mail, Loader2, CheckCircle } from "lucide-react";

export function IndexWaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/index/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join waitlist");
      }

      setSubmitted(true);
      setEmail("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="inline-flex flex-col items-center gap-3">
        <CheckCircle className="h-8 w-8 text-emerald-600" />
        <p className="font-semibold text-ink-900">You're on the list!</p>
        <p className="text-sm text-ink-600">We'll email you when beta access opens.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-4 py-3 rounded-lg border border-surface-300 bg-white text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        required
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-400 pointer-events-none" />
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-surface-300 bg-white text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : (
            "Join Beta"
          )}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </form>
  );
}
