"use client";

// CrmPushButton — lets founders push their startup profile to HubSpot,
// Salesforce, Pipedrive, or any CRM connected via a Zapier Zap.
//
// Usage:
//   <CrmPushButton />
//
// The button posts to /api/founder/crm-push (auth required, rate-limited
// to 5 pushes per hour). The backend reads the active project and latest
// SVI score then forwards the payload to the configured Zapier webhook.

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

interface CopyMap {
  button: string;
  loading: string;
  success: string;
  error_default: string;
  error_not_configured: string;
  error_rate_limit: string;
}

const COPY: Record<"en" | "vi", CopyMap> = {
  en: {
    button: "Push to CRM",
    loading: "Pushing…",
    success: "Pushed to CRM",
    error_default: "Push failed — please try again.",
    error_not_configured: "CRM push is not configured. Ask your admin to set ZAPIER_WEBHOOK_URL.",
    error_rate_limit: "Rate limit reached — you can push up to 5 times per hour.",
  },
  vi: {
    button: "Đẩy sang CRM",
    loading: "Đang đẩy…",
    success: "Đã đẩy sang CRM",
    error_default: "Đẩy thất bại — vui lòng thử lại.",
    error_not_configured: "Tích hợp CRM chưa được cấu hình. Yêu cầu quản trị viên thiết lập ZAPIER_WEBHOOK_URL.",
    error_rate_limit: "Đã đạt giới hạn — bạn có thể đẩy tối đa 5 lần mỗi giờ.",
  },
};

interface CrmPushButtonProps {
  /** ISO 639-1 locale for copy. Defaults to "en". */
  locale?: "en" | "vi";
  /** Extra Tailwind classes on the outer wrapper div. */
  className?: string;
}

export function CrmPushButton({ locale = "en", className = "" }: CrmPushButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [pushedAt, setPushedAt] = useState<string | null>(null);

  const copy = COPY[locale] ?? COPY.en;

  async function handlePush() {
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/founder/crm-push", { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        pushed_at?: string;
        error?: string;
        retryInSeconds?: number;
      };

      if (res.status === 429) {
        setStatus("error");
        setErrorMsg(copy.error_rate_limit);
        return;
      }
      if (res.status === 501) {
        setStatus("error");
        setErrorMsg(copy.error_not_configured);
        return;
      }
      if (!body.ok) {
        setStatus("error");
        setErrorMsg(body.error ?? copy.error_default);
        return;
      }

      setPushedAt(body.pushed_at ?? new Date().toISOString());
      setStatus("success");

      // Reset to idle after 4 seconds so the user can push again
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setErrorMsg(copy.error_default);
    }
  }

  const isLoading = status === "loading";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={handlePush}
        disabled={isLoading}
        className={[
          "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
          "border border-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          status === "success"
            ? "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500"
            : status === "error"
              ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
              : "bg-ink-900 text-white hover:bg-ink-700 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-white focus-visible:ring-ink-500",
          isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
        aria-busy={isLoading}
      >
        {/* Icon */}
        {status === "loading" && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}
        {status === "success" && (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {status === "error" && (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}

        {/* Label */}
        {status === "loading"
          ? copy.loading
          : status === "success"
            ? copy.success
            : copy.button}
      </button>

      {/* Error message */}
      {status === "error" && errorMsg && (
        <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
      )}

      {/* Success timestamp */}
      {status === "success" && pushedAt && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          {locale === "vi" ? "Đẩy lúc" : "Pushed at"}{" "}
          {new Date(pushedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
