"use client";

// Step 2 (founder) · "Your startup" — G13-W4-IA4 (spec §B.3 row 2).
//
// Name · website · one-line description → POST /api/projects (the existing
// endpoint; no new schema). Skip is first-class — nobody is blocked from
// reaching step 3. On a resume with a project already created the form
// collapses to "Continue".

import * as React from "react";
import { ArrowRight, Loader2, Rocket, SkipForward } from "lucide-react";
import { useLocale, type Locale } from "@/lib/use-locale";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

interface Copy {
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  urlLabel: string;
  urlPlaceholder: string;
  descLabel: string;
  descPlaceholder: string;
  submit: string;
  submitting: string;
  skip: string;
  created: string;
  continue: string;
  errorGeneric: string;
  errorName: string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    title: "Your startup",
    subtitle: "Give it a name so your desk has something to work with. Every field can change later.",
    nameLabel: "What are you building?",
    namePlaceholder: "e.g. Aurora Health",
    urlLabel: "Website (if any)",
    urlPlaceholder: "https://your-startup.com",
    descLabel: "In one sentence",
    descPlaceholder: "Remote monitoring for chronic-care patients in APAC.",
    submit: "Create startup",
    submitting: "Creating…",
    skip: "I'll do this later",
    created: "Startup created.",
    continue: "Continue",
    errorGeneric: "Couldn't create the startup — please try again.",
    errorName: "Give your startup a name (at least 2 characters).",
  },
  vi: {
    title: "Startup của bạn",
    subtitle: "Đặt tên để bàn làm việc có dữ liệu. Mọi thông tin có thể chỉnh sau.",
    nameLabel: "Bạn đang xây dựng gì?",
    namePlaceholder: "ví dụ: Aurora Health",
    urlLabel: "Website (nếu có)",
    urlPlaceholder: "https://startup-cua-ban.com",
    descLabel: "Mô tả trong một câu",
    descPlaceholder: "Giám sát từ xa cho bệnh nhân mãn tính tại APAC.",
    submit: "Tạo startup",
    submitting: "Đang tạo…",
    skip: "Tôi sẽ làm sau",
    created: "Đã tạo startup.",
    continue: "Tiếp tục",
    errorGeneric: "Không thể tạo startup — vui lòng thử lại.",
    errorName: "Đặt tên cho startup (tối thiểu 2 ký tự).",
  },
};

/** Pure: the `description` the projects endpoint stores (pinned by the wizard test). */
export function projectDescription(description: string, url: string): string | undefined {
  const d = description.trim();
  const u = url.trim();
  if (d) return u ? `${d}\n\nURL: ${u}` : d;
  return u ? `URL: ${u}` : undefined;
}

export interface StepStartupProps {
  existingProjectId?: string;
  onCreated: (projectId: string | undefined) => void;
  onSkip: () => void;
  onContinue: () => void;
}

export function StepStartup({ existingProjectId, onCreated, onSkip, onContinue }: StepStartupProps) {
  const [locale] = useLocale();
  const copy = COPY[locale];
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const uid = React.useId();

  const input = "mt-2 w-full rounded-xl border border-line-subtle bg-surface px-4 py-3 text-sm text-primary placeholder:text-tertiary focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30";

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(copy.errorName);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description: projectDescription(description, url) }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; project?: { id?: string } };
      if (!res.ok || !data.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, data), copy.errorGeneric));
        setSubmitting(false);
        return;
      }
      onCreated(typeof data.project?.id === "string" ? data.project.id : undefined);
    } catch {
      setError(copy.errorGeneric);
      setSubmitting(false);
    }
  }

  if (existingProjectId) {
    return (
      <div data-wizard-step="startup" data-startup-created={existingProjectId}>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">{copy.title}</h1>
        <p className="mt-2 text-muted">{copy.created}</p>
        <div className="mt-8 flex justify-end">
          <button type="button" onClick={onContinue} data-testid="wizard-continue" className="inline-flex items-center gap-2 rounded-xl bg-action px-6 py-3 text-sm font-semibold text-on-action hover:bg-action-hover">
            {copy.continue}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-wizard-step="startup">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{copy.title}</h1>
      <p className="mt-2 text-muted">{copy.subtitle}</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-primary">{copy.nameLabel}</label>
          <input id={`${uid}-name`} type="text" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} className={input} />
        </div>
        <div>
          <label htmlFor={`${uid}-url`} className="block text-sm font-medium text-primary">{copy.urlLabel}</label>
          <input id={`${uid}-url`} type="url" maxLength={200} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={copy.urlPlaceholder} className={input} />
        </div>
        <div>
          <label htmlFor={`${uid}-desc`} className="block text-sm font-medium text-primary">{copy.descLabel}</label>
          <textarea id={`${uid}-desc`} rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={copy.descPlaceholder} className={`${input} resize-none`} />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-400">{error}</p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onSkip} disabled={submitting} data-testid="wizard-skip" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted underline decoration-line-strong underline-offset-4 hover:text-action disabled:opacity-40">
            <SkipForward aria-hidden="true" className="h-4 w-4" />
            {copy.skip}
          </button>
          <button type="submit" disabled={submitting} data-testid="wizard-continue" className="inline-flex items-center justify-center gap-2 rounded-xl bg-action px-6 py-3 text-sm font-semibold text-on-action hover:bg-action-hover disabled:opacity-40">
            {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Rocket aria-hidden="true" className="h-4 w-4" />}
            {submitting ? copy.submitting : copy.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
