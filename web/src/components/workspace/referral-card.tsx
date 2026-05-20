"use client";

import * as React from "react";
import {
  CheckCircle2,
  Copy,
  Gift,
  Mail,
  ExternalLink,
  Users,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface ReferralStats {
  pending: number;
  signedUp: number;
  converted: number;
  creditsEarned: number;
}

interface ReferralData {
  code: string;
  link: string;
  stats: ReferralStats;
}

export function ReferralCard() {
  const [data, setData] = React.useState<ReferralData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/referral");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.ok) {
          setData({ code: json.code, link: json.link, stats: json.stats });
        }
      } catch {
        // Silently ignore fetch errors.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = async () => {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      trackEvent("referral_link_copied", {});
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers.
      const el = document.createElement("textarea");
      el.value = data.link;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEmailShare = () => {
    if (!data?.link) return;
    const subject = encodeURIComponent(
      "Check out BlockID.au - AI-powered startup valuation",
    );
    const body = encodeURIComponent(
      `I've been using BlockID.au to track my startup's value and progress. You should try it too!\n\nSign up here and we both get credits: ${data.link}`,
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
    trackEvent("referral_email_shared", {});
  };

  const handleLinkedInShare = () => {
    if (!data?.link) return;
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.link)}`,
      "_blank",
      "width=600,height=500",
    );
    trackEvent("referral_linkedin_shared", {});
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6 animate-pulse">
        <div className="h-5 w-48 bg-surface-200 rounded" />
        <div className="mt-3 h-4 w-64 bg-surface-100 rounded" />
      </div>
    );
  }

  if (!data?.code) return null;

  const totalInvited =
    data.stats.pending + data.stats.signedUp + data.stats.converted;

  return (
    <div className="rounded-2xl border border-surface-200 bg-gradient-to-br from-white to-brand-50/30 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center">
          <Gift strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h3 className="text-base font-bold text-ink-800">
            Invite founders, earn credits
          </h3>
          <p className="text-xs text-ink-500">
            Earn 2 credits for every friend who signs up
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-surface-50 p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Users strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-400" />
            <span className="text-xs text-ink-500">Invited</span>
          </div>
          <span className="text-lg font-bold text-ink-800">{totalInvited}</span>
        </div>
        <div className="rounded-xl bg-surface-50 p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <CheckCircle2
              strokeWidth={1.75}
              className="h-3.5 w-3.5 text-green-500"
            />
            <span className="text-xs text-ink-500">Signed up</span>
          </div>
          <span className="text-lg font-bold text-ink-800">
            {data.stats.signedUp}
          </span>
        </div>
        <div className="rounded-xl bg-surface-50 p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Gift strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500" />
            <span className="text-xs text-ink-500">Credits</span>
          </div>
          <span className="text-lg font-bold text-brand-600">
            {data.stats.creditsEarned}
          </span>
        </div>
      </div>

      {/* Referral link */}
      <div className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2">
        <input
          type="text"
          readOnly
          value={data.link}
          className="flex-1 text-sm text-ink-600 bg-transparent outline-none truncate"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
              Copy Link
            </>
          )}
        </button>
      </div>

      {/* Share buttons */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleEmailShare}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          <Mail strokeWidth={1.75} className="h-3.5 w-3.5" />
          Email
        </button>
        <button
          type="button"
          onClick={handleLinkedInShare}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
          LinkedIn
        </button>
      </div>
    </div>
  );
}
