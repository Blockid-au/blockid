"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
  startupName?: string | null;
  sviScore?: number | null;
  className?: string;
}

/**
 * Share-on-social buttons for /s/[slug] pages. Uses standard share-intent URLs
 * (no API key, no auth) so any visitor can repost the report and create a
 * backlink loop. LinkedIn share is the priority — that's our primary
 * acquisition channel for AU founders.
 */
export function ShareButtons({ slug, startupName, sviScore, className }: Props) {
  const [copied, setCopied] = React.useState(false);
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/s/${slug}`
    : `https://blockid.au/s/${slug}`;

  const text = startupName && sviScore != null
    ? `${startupName} scored ${sviScore} on the BlockID Startup Value Index. See the full breakdown:`
    : "Check out my Startup Value Index score on BlockID:";

  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent("My Startup Value Index — BlockID")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const baseBtn = "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(baseBtn, "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100")}
        onClick={() => {
          // Fire-and-forget analytics ping; no PII
          void fetch("/api/track/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: "share_clicked", channel: "linkedin", slug }),
          }).catch(() => {});
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Share on LinkedIn
      </a>
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(baseBtn, "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100")}
      >
        <Send className="h-3.5 w-3.5" />
        Tweet
      </a>
      <a
        href={emailUrl}
        className={cn(baseBtn, "border-surface-200 bg-white text-ink-700 hover:bg-surface-50")}
      >
        <Mail className="h-3.5 w-3.5" />
        Email
      </a>
      <button
        type="button"
        onClick={copyLink}
        className={cn(baseBtn, "border-surface-200 bg-white text-ink-700 hover:bg-surface-50")}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
