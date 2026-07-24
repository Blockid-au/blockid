"use client";

// 4-step onboarding checklist rendered inside the roster empty state.
// Persists check state per reseller in localStorage; deep-links to flows.

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";

interface Step {
  key: string;
  title: string;
  detail: string;
  href: string;
  optional?: boolean;
}

const STEPS: Step[] = [
  {
    key: "invite",
    title: "Invite your first mentee",
    detail: "Share your reseller promotion code so a founder signs up attributed to you.",
    href: "/reseller/codes",
  },
  {
    key: "consent",
    title: "Ask for engagement consent",
    detail: "Request 'reports' tier so you can see their SVI trend and check-in history.",
    href: "/reseller/mentor",
  },
  {
    key: "checkin",
    title: "Schedule the first check-in",
    detail: "A 30-min kickoff call sets the mentoring cadence and locks in accountability.",
    href: "/reseller/mentor",
  },
  {
    key: "cohort",
    title: "Optional: create a cohort",
    detail: "Group mentees into a cohort for weekly heat-map reporting.",
    href: "/reseller/mentor/cohort",
    optional: true,
  },
];

const STORAGE_KEY = "blockid.mentor.onboarding.v1";

export function MentorOnboardingChecklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // ignore malformed
    }
  }, []);

  function toggle(key: string) {
    setDone((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota / private-mode
      }
      return next;
    });
  }

  return (
    <ol className="space-y-2">
      {STEPS.map((s, idx) => {
        const isDone = !!done[s.key];
        return (
          <li
            key={s.key}
            className="flex items-start gap-3 rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-700 dark:bg-surface-800"
          >
            <button
              type="button"
              onClick={() => toggle(s.key)}
              className="mt-0.5 text-brand-600 hover:text-brand-800"
              aria-label={isDone ? `Mark step ${idx + 1} incomplete` : `Mark step ${idx + 1} complete`}
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${isDone ? "text-ink-400 line-through" : "text-ink-900 dark:text-ink-100"}`}
                >
                  {idx + 1}. {s.title}
                </span>
                {s.optional && (
                  <span className="rounded-full bg-surface-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500 dark:bg-surface-700 dark:text-ink-300">
                    Optional
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-400">{s.detail}</p>
              <Link
                href={s.href}
                className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline dark:text-brand-300"
              >
                Go to step <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default MentorOnboardingChecklist;
