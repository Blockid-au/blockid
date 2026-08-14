"use client";

// PitchVideoGenerator — lets founders generate a 60-second "Pitch Snapshot"
// MP4 from their startup profile data using Remotion server-side rendering.
//
// Usage:
//   <PitchVideoGenerator startupId="<project-uuid>" startupName="Acme AI" />
//
// The component POSTs to /api/founder/pitch-video (auth required, rate-limited
// to 3 renders per hour). On success, it auto-downloads the MP4.
//
// Notes:
//   - Rendering takes 1–3 minutes on bare-metal; the button shows a progress
//     indicator while the server is working.
//   - 2 credits are charged on success.

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

// ── Types ──────────────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "success" | "error";

interface CopyMap {
  button: string;
  loading: string;
  success: string;
  credits: string;
  error_default: string;
  error_rate_limit: string;
  error_credits: string;
  error_render: string;
  hint: string;
}

const COPY: Record<"en" | "vi", CopyMap> = {
  en: {
    button: "Generate Pitch Video",
    loading: "Rendering video… (1–3 min)",
    success: "Video ready — downloading",
    credits: "2 credits",
    error_default: "Video generation failed — please try again.",
    error_rate_limit: "Rate limit reached — up to 3 renders per hour.",
    error_credits: "Not enough credits. 2 credits required.",
    error_render: "Render failed. The video could not be generated.",
    hint: "Generates a 60-second MP4 pitch video from your startup profile.",
  },
  vi: {
    button: "Tạo Video Pitch",
    loading: "Đang render video… (1–3 phút)",
    success: "Video sẵn sàng — đang tải xuống",
    credits: "2 credit",
    error_default: "Tạo video thất bại — vui lòng thử lại.",
    error_rate_limit: "Đã đạt giới hạn — tối đa 3 lần mỗi giờ.",
    error_credits: "Không đủ credit. Cần 2 credit.",
    error_render: "Render thất bại. Không thể tạo video.",
    hint: "Tạo video pitch MP4 60 giây từ hồ sơ startup của bạn.",
  },
};

// ── Component ──────────────────────────────────────────────────────────────

interface PitchVideoGeneratorProps {
  /** Project UUID — passed to the API as startup_id. */
  startupId: string;
  /** Human-readable startup name for the success toast. */
  startupName?: string;
  /** ISO 639-1 locale for copy. Defaults to "en". */
  locale?: "en" | "vi";
  /** Extra Tailwind classes on the outer wrapper div. */
  className?: string;
}

export function PitchVideoGenerator({
  startupId,
  startupName,
  locale = "en",
  className = "",
}: PitchVideoGeneratorProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const copy = COPY[locale] ?? COPY.en;

  async function handleGenerate() {
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/founder/pitch-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startup_id: startupId }),
      });

      const body = (await res.json()) as {
        ok: boolean;
        url?: string | null;
        storagePath?: string;
        error?: string;
        creditsRequired?: number;
        retry_after_seconds?: number;
      };

      if (res.status === 429) {
        setStatus("error");
        setErrorMsg(copy.error_rate_limit);
        return;
      }

      if (res.status === 402 || body.error === "insufficient_credits") {
        setStatus("error");
        setErrorMsg(copy.error_credits);
        return;
      }

      if (body.error === "render_failed") {
        setStatus("error");
        setErrorMsg(copy.error_render);
        return;
      }

      if (!body.ok || !body.url) {
        setStatus("error");
        setErrorMsg(body.error ?? copy.error_default);
        return;
      }

      // Auto-download the MP4.
      const link = document.createElement("a");
      link.href = body.url;
      link.download = `pitch-snapshot-${startupName ?? startupId}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setStatus("success");
      trackEvent("pitch_video_generated", { startup_id: startupId });

      // Reset to idle after 8 seconds.
      setTimeout(() => setStatus("idle"), 8000);
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
        onClick={handleGenerate}
        disabled={isLoading}
        className={[
          "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
          "border border-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          status === "success"
            ? "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500"
            : status === "error"
              ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
              : "bg-[#00D4FF] text-[#0A0F1E] hover:bg-cyan-400 focus-visible:ring-cyan-500",
          isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
        aria-busy={isLoading}
        aria-label={isLoading ? copy.loading : copy.button}
      >
        {/* Icons */}
        {status === "loading" && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}
        {status === "success" && (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {status === "error" && (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {status === "idle" && (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
            />
          </svg>
        )}

        {/* Label */}
        {status === "loading"
          ? copy.loading
          : status === "success"
            ? copy.success
            : copy.button}

        {/* Credit badge (idle only) */}
        {status === "idle" && (
          <span className="ml-1 rounded-full bg-[#0A0F1E]/20 px-2 py-0.5 text-xs font-semibold">
            {copy.credits}
          </span>
        )}
      </button>

      {/* Error message */}
      {status === "error" && errorMsg && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {errorMsg}
        </p>
      )}

      {/* Hint (idle only) */}
      {status === "idle" && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{copy.hint}</p>
      )}
    </div>
  );
}
