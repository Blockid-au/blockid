"use client";

import * as React from "react";
import { CheckCircle2, Clock, Gift, Loader2, Users } from "lucide-react";
import { ReferralCard } from "@/components/workspace/referral-card";

interface Referral {
  id: string;
  referred_email: string;
  status: "pending" | "signed_up" | "converted";
  credits_awarded: number;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "converted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        Converted
      </span>
    );
  }
  if (status === "signed_up") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        <Users className="h-3 w-3" />
        Signed Up
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      <Clock className="h-3 w-3" />
      Pending
    </span>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReferralsClient() {
  const [referrals, setReferrals] = React.useState<Referral[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/referral/history");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.ok) setReferrals(json.referrals ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: Gift,
            label: "1. Share your link",
            desc: "Copy your unique referral link and send it to fellow founders.",
          },
          {
            icon: Users,
            label: "2. They sign up",
            desc: "Your contact creates an account using your referral link.",
          },
          {
            icon: CheckCircle2,
            label: "3. You both earn",
            desc: "You get 5 credits. They get 3 bonus credits on signup.",
          },
        ].map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-200 bg-white p-5"
          >
            <div className="h-9 w-9 rounded-xl bg-brand-100 flex items-center justify-center mb-3">
              <Icon strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            </div>
            <div className="font-semibold text-sm text-ink-800 mb-1">
              {label}
            </div>
            <p className="text-xs text-ink-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Referral share card */}
      <ReferralCard />

      {/* Referral history */}
      <div>
        <h2 className="text-base font-bold text-ink-800 mb-3">
          Referral History
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
          </div>
        ) : referrals.length === 0 ? (
          <div className="rounded-2xl border border-surface-200 bg-white p-10 text-center">
            <Users
              strokeWidth={1.5}
              className="h-10 w-10 text-ink-300 mx-auto mb-3"
            />
            <p className="text-sm text-ink-500">
              No referrals yet — share your link to get started!
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Friend
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Credits earned
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-surface-50 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-ink-700">
                      {maskEmail(r.referred_email)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 font-semibold text-brand-600">
                      +{r.credits_awarded}
                    </td>
                    <td className="px-5 py-3 text-ink-400">
                      {formatDate(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Promo note */}
      <p className="text-xs text-ink-400 text-center">
        🎉 Softlaunch promo: earn{" "}
        <span className="font-semibold text-brand-600">5 credits</span> per
        referral until 31 July 2026 (normally 2).
      </p>
    </div>
  );
}
