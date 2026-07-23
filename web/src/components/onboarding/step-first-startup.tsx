"use client";

// Step 6 of the onboarding wizard — "Create your first startup".
//
// Real-world audit #8 (docs/plans/real-world-workflow-parity-audit-2026-07-23.md
// §6): Atlassian / Canva-style onboarding measurably lifts activation when the
// flow ends with the user's *first meaningful action* (a workspace / startup
// profile) rather than a payment screen. This step nudges the user to spend
// 30 seconds naming the thing they're building, then hands them off to
// /dashboard with that context already in the DB.
//
// Additive-only: reuses the existing POST /api/projects endpoint (see
// web/src/app/api/projects/route.ts). No new tables, no new schema. Skip
// is a first-class option — an unwilling user is *not* blocked from getting
// to the dashboard.

import * as React from "react";
import type { Dispatch } from "react";
import { Loader2, Rocket, SkipForward } from "lucide-react";
import { useLocale, type Locale } from "@/lib/use-locale";
import type { WizardAction, WizardState } from "./wizard-types";

interface Copy {
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  descLabel: string;
  descPlaceholder: string;
  urlLabel: string;
  urlPlaceholder: string;
  submit: string;
  submitting: string;
  skip: string;
  errorGeneric: string;
  errorName: string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    title: "Create your first startup",
    subtitle:
      "One last step — give it a name so your dashboard has something to work with. You can change every field later.",
    nameLabel: "What are you building?",
    namePlaceholder: "e.g. Aurora Health",
    descLabel: "In one sentence",
    descPlaceholder: "Remote-monitoring for chronic-care patients in APAC.",
    urlLabel: "URL (if any)",
    urlPlaceholder: "https://your-startup.com",
    submit: "Create startup + go to dashboard",
    submitting: "Creating…",
    skip: "I'll do this later",
    errorGeneric: "Couldn't create the startup — please try again.",
    errorName: "Give your startup a name (at least 2 characters).",
  },
  vi: {
    title: "Tạo startup đầu tiên của bạn",
    subtitle:
      "Bước cuối cùng — đặt tên để dashboard có dữ liệu để làm việc. Bạn có thể chỉnh sửa mọi thông tin sau này.",
    nameLabel: "Bạn đang xây dựng cái gì?",
    namePlaceholder: "ví dụ: Aurora Health",
    descLabel: "Mô tả trong một câu",
    descPlaceholder: "Giám sát từ xa cho bệnh nhân mãn tính tại APAC.",
    urlLabel: "URL (nếu có)",
    urlPlaceholder: "https://startup-cua-ban.com",
    submit: "Tạo startup + vào dashboard",
    submitting: "Đang tạo…",
    skip: "Tôi sẽ làm sau",
    errorGeneric: "Không thể tạo startup — vui lòng thử lại.",
    errorName: "Đặt tên cho startup (tối thiểu 2 ký tự).",
  },
};

async function saveProgress(step: number, state: WizardState): Promise<void> {
  try {
    await fetch("/api/onboarding/save-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, state }),
    });
  } catch {
    // Fire-and-forget — localStorage already has the latest state and this
    // is a persistence nicety, not a correctness requirement.
  }
}

export function StepFirstStartup({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const [locale] = useLocale();
  const copy = COPY[locale];

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting || skipping) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setLocalError(copy.errorName);
      return;
    }

    setSubmitting(true);
    setLocalError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description:
            description.trim().length > 0
              ? `${description.trim()}${url.trim() ? `\n\nURL: ${url.trim()}` : ""}`
              : url.trim().length > 0
                ? `URL: ${url.trim()}`
                : undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        project?: { id?: string };
      };

      if (!res.ok || !data.ok) {
        setLocalError(data.error || copy.errorGeneric);
        setSubmitting(false);
        return;
      }

      const createdAt = new Date().toISOString();
      const projectId =
        typeof data.project?.id === "string" ? data.project.id : undefined;
      dispatch({
        type: "SET_FIRST_STARTUP",
        createdAt,
        projectId,
      });

      await saveProgress(6, {
        ...state,
        firstStartupCreatedAt: createdAt,
        firstStartupId: projectId,
      });

      window.location.href = projectId
        ? `/dashboard?onboarding=complete&first_startup=${encodeURIComponent(projectId)}`
        : "/dashboard?onboarding=complete";
    } catch {
      setLocalError(copy.errorGeneric);
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    if (submitting || skipping) return;
    setSkipping(true);
    setLocalError(null);

    const createdAt = new Date().toISOString();
    dispatch({ type: "SET_FIRST_STARTUP", createdAt });
    await saveProgress(6, {
      ...state,
      firstStartupCreatedAt: createdAt,
    });
    window.location.href = "/dashboard?onboarding=complete&first_startup=skipped";
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">
        {copy.title}
      </h1>
      <p className="mt-2 text-brand-ink-muted">{copy.subtitle}</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label
            htmlFor="first-startup-name"
            className="block text-sm font-medium text-brand-ink"
          >
            {copy.nameLabel}
          </label>
          <input
            id="first-startup-name"
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={copy.namePlaceholder}
            className="mt-2 w-full rounded-xl border border-brand-cyan/15 bg-brand-navy-elev-1 px-4 py-3 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan/30"
          />
        </div>

        <div>
          <label
            htmlFor="first-startup-desc"
            className="block text-sm font-medium text-brand-ink"
          >
            {copy.descLabel}
          </label>
          <textarea
            id="first-startup-desc"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={copy.descPlaceholder}
            className="mt-2 w-full resize-none rounded-xl border border-brand-cyan/15 bg-brand-navy-elev-1 px-4 py-3 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan/30"
          />
        </div>

        <div>
          <label
            htmlFor="first-startup-url"
            className="block text-sm font-medium text-brand-ink"
          >
            {copy.urlLabel}
          </label>
          <input
            id="first-startup-url"
            type="url"
            maxLength={200}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={copy.urlPlaceholder}
            className="mt-2 w-full rounded-xl border border-brand-cyan/15 bg-brand-navy-elev-1 px-4 py-3 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan/30"
          />
        </div>

        {localError && (
          <p role="alert" className="text-sm text-red-400">
            {localError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting || skipping}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-brand-ink-muted underline decoration-brand-ink-muted/40 underline-offset-4 transition-colors hover:text-brand-cyan disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            {skipping ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <SkipForward aria-hidden="true" className="h-4 w-4" />
            )}
            {copy.skip}
          </button>

          <button
            type="submit"
            disabled={submitting || skipping}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket aria-hidden="true" className="h-4 w-4" />
            )}
            {submitting ? copy.submitting : copy.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
