"use client";

/**
 * <OneClickForm /> — client island for the /one-click-report landing page.
 *
 * Two-step flow:
 *   1. If mode === "pitch": POST FormData to /api/guest-analysis/upload-pitch
 *      to obtain { inputValue, filename }.
 *   2. POST JSON to /api/guest-analysis/create-order with the collected
 *      { email, inputType, inputValue, inputFilename? } to receive a Stripe
 *      hosted checkout URL, then hard-navigate the visitor there.
 *
 * The component is mounted twice on the landing page (variant="hero" and
 * variant="final") — each instance owns its own state so both remain
 * interactive independently. Element IDs are namespaced via `variant`
 * to keep labels associated correctly when both mount at once.
 */

import * as React from "react";
import { ArrowRight, Loader2, Upload, Link as LinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Mode = "pitch" | "url";

interface OneClickFormProps {
  variant?: "hero" | "final";
}

interface UploadResponse {
  inputValue?: string;
  filename?: string;
  error?: string;
}

interface CreateOrderResponse {
  checkoutUrl?: string;
  guestAnalysisId?: string;
  error?: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — mirror the API.
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ACCEPTED_EXT = /\.(pdf|docx)$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function OneClickForm({ variant = "hero" }: OneClickFormProps) {
  const ns = variant; // id namespace
  const [mode, setMode] = React.useState<Mode>("pitch");
  const [email, setEmail] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      return;
    }
    // Client-side guardrails so we fail fast without a wasted upload round-trip.
    if (picked.size > MAX_UPLOAD_BYTES) {
      setErrorMsg("File too large. Max 10 MB.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    // Some browsers omit MIME for DOCX; fall back to extension check.
    if (!ACCEPTED_MIME.has(picked.type) && !ACCEPTED_EXT.test(picked.name)) {
      setErrorMsg("Unsupported file type. Upload a PDF or DOCX.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setErrorMsg(null);
    setFile(picked);
  };

  const validate = (): string | null => {
    if (mode === "pitch") {
      if (!file) return "Choose a pitch deck (PDF or DOCX) to continue.";
    } else {
      if (!url.trim()) return "Paste your website URL to continue.";
      if (!isValidUrl(url.trim())) {
        return "That doesn't look like a valid URL. Include https://.";
      }
    }
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      return "Enter a valid email so we can send your report.";
    }
    if (!consent) {
      return "Please confirm you agree to receive your report by email.";
    }
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    try {
      let inputValue: string;
      let inputFilename: string | undefined;

      if (mode === "pitch") {
        // Step 1 — upload the pitch file, get the server-side path back.
        const fd = new FormData();
        // File is guaranteed non-null here by validate() above.
        fd.append("file", file as File);
        const uploadRes = await fetch("/api/guest-analysis/upload-pitch", {
          method: "POST",
          body: fd,
        });
        const uploadData = (await uploadRes.json()) as UploadResponse;
        if (!uploadRes.ok || !uploadData.inputValue) {
          throw new Error(
            uploadData.error ||
              "Couldn't upload your pitch. Please try again.",
          );
        }
        inputValue = uploadData.inputValue;
        inputFilename = uploadData.filename;
      } else {
        inputValue = url.trim();
      }

      // Step 2 — create the Stripe checkout session.
      const orderRes = await fetch("/api/guest-analysis/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          inputType: mode === "pitch" ? "pitch_file" : "website_url",
          inputValue,
          inputFilename,
        }),
      });
      const orderData = (await orderRes.json()) as CreateOrderResponse;
      if (!orderRes.ok || !orderData.checkoutUrl) {
        throw new Error(
          orderData.error ||
            "Couldn't create your order. Please try again in a moment.",
        );
      }

      // Hard navigation to Stripe hosted checkout.
      window.location.href = orderData.checkoutUrl;
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Segmented mode toggle */}
      <div
        role="tablist"
        aria-label="Choose input type"
        className="grid grid-cols-2 gap-1 rounded-xl border border-surface-200 bg-surface-100 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "pitch"}
          onClick={() => {
            setMode("pitch");
            setErrorMsg(null);
          }}
          className={
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 " +
            (mode === "pitch"
              ? "bg-white text-ink-900 shadow-sm"
              : "text-ink-600 hover:text-ink-800")
          }
        >
          <Upload strokeWidth={1.75} className="h-4 w-4" />
          Upload pitch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "url"}
          onClick={() => {
            setMode("url");
            setErrorMsg(null);
          }}
          className={
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 " +
            (mode === "url"
              ? "bg-white text-ink-900 shadow-sm"
              : "text-ink-600 hover:text-ink-800")
          }
        >
          <LinkIcon strokeWidth={1.75} className="h-4 w-4" />
          Paste website URL
        </button>
      </div>

      {mode === "pitch" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ns}-pitch-file`}>
            Pitch deck (PDF or DOCX, max 10 MB)
          </Label>
          <label
            htmlFor={`${ns}-pitch-file`}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-surface-300 bg-surface-50 px-4 py-6 text-center text-sm text-ink-600 transition-colors hover:border-brand-500/50 hover:bg-brand-50/40"
          >
            <Upload strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            {file ? (
              <>
                <span className="font-medium text-ink-800">{file.name}</span>
                <span className="text-xs text-ink-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB — click to change
                </span>
              </>
            ) : (
              <>
                <span className="font-medium text-ink-800">
                  Click to choose a file
                </span>
                <span className="text-xs text-ink-500">
                  PDF or DOCX · up to 10 MB
                </span>
              </>
            )}
          </label>
          <input
            ref={fileInputRef}
            id={`${ns}-pitch-file`}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={onFilePick}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ns}-url`}>Website URL</Label>
          <Input
            id={`${ns}-url`}
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://yourstartup.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ns}-email`}>Your email (report is sent here)</Label>
        <Input
          id={`${ns}-email`}
          type="email"
          autoComplete="email"
          placeholder="founder@yourstartup.com.au"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <label
        htmlFor={`${ns}-consent`}
        className="flex cursor-pointer items-start gap-3 text-sm text-ink-600"
      >
        <input
          id={`${ns}-consent`}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-surface-300 text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        />
        <span>I agree to receive my report by email.</span>
      </label>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={submitting}
        className="w-full"
      >
        {submitting ? (
          <>
            <Loader2 strokeWidth={2} className="h-5 w-5 animate-spin" />
            {mode === "pitch" ? "Uploading & starting checkout…" : "Starting checkout…"}
          </>
        ) : (
          <>
            Get my A$3 report
            <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
          </>
        )}
      </Button>

      <p className="text-center text-xs text-ink-500 leading-relaxed">
        Not financial advice. GST tax invoice included. Report emailed in ~2 min
        after payment.
      </p>

      {/* aria-live region — errors announced without stealing focus. */}
      <div role="alert" aria-live="polite" className="min-h-[1.25rem]">
        {errorMsg ? (
          <p className="text-sm text-red-600">{errorMsg}</p>
        ) : null}
      </div>
    </form>
  );
}
