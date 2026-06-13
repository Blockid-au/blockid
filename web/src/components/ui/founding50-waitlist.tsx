"use client";

import * as React from "react";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Founding50Waitlist() {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [state, setState] = React.useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState("submitting");
    setError("");
    try {
      const res = await fetch("/api/founding50/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setState("done");
      } else {
        setError(data.error ?? "Something went wrong");
        setState("error");
      }
    } catch {
      setError("Network error — please try again");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" strokeWidth={1.5} />
        <h3 className="text-xl font-bold text-emerald-900 mb-2">You&apos;re on the waitlist!</h3>
        <p className="text-emerald-700 text-sm">
          We&apos;ll email you at <strong>{email}</strong> the moment new Founding spots open.
          We add spots in batches — usually within 2–4 weeks.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
      <div className="flex items-center gap-3 mb-4">
        <Bell className="h-6 w-6 text-amber-600 shrink-0" strokeWidth={1.5} />
        <div>
          <h3 className="text-lg font-bold text-amber-900">All 50 spots are taken</h3>
          <p className="text-sm text-amber-700">Join the waitlist — we&apos;ll notify you when new spots open.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label htmlFor="waitlist-name" className="text-sm font-medium text-amber-900">
            Your name (optional)
          </Label>
          <Input
            id="waitlist-name"
            type="text"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 bg-white border-amber-200 focus:border-amber-400"
            disabled={state === "submitting"}
          />
        </div>
        <div>
          <Label htmlFor="waitlist-email" className="text-sm font-medium text-amber-900">
            Email address <span className="text-amber-600">*</span>
          </Label>
          <Input
            id="waitlist-email"
            type="email"
            required
            placeholder="you@startup.com.au"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 bg-white border-amber-200 focus:border-amber-400"
            disabled={state === "submitting"}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={state === "submitting" || !email.trim()}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        >
          {state === "submitting" ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…</>
          ) : (
            "Notify me when spots open"
          )}
        </Button>
      </form>

      <p className="mt-3 text-xs text-amber-600 text-center">
        No spam. One email when new spots are released.
      </p>
    </div>
  );
}
