"use client";

// SmartIntake — a single omni-box on /analyze that accepts a URL paste,
// a file drop (PDF / DOCX / PPTX) or free-text idea copy. The client
// classifier runs debounced 150 ms — URL regex, file MIME sniff, or
// deterministic /api/svi/stage-classify for text ≥40 tokens. The CTA
// morphs to match the detected variant so the founder always knows
// what action the button will fire.

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Globe,
  Loader2,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

export type IntakeVariant = "url" | "deck" | "idea" | "empty";

const URL_REGEX = /\b(https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)\b/i;
const DECK_MIME_ALLOWLIST = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-powerpoint",
];
const DECK_EXT_REGEX = /\.(pdf|docx?|pptx?)$/i;
const MIN_TOKENS_FOR_TEXT_CLASSIFY = 40;
const DEBOUNCE_MS = 150;

/** Classifier decision the omnibox produces synchronously (no network). */
export interface FastClassifierResult {
  variant: IntakeVariant;
  reason: string;
  chipLabel: string;
  ctaLabel: string;
  fileSizeBytes?: number;
}

/** Deferred stage guess returned by /api/svi/stage-classify. */
export interface StageGuess {
  stageLabel: string;
  confidence: number;
  reasons: string[];
}

/** Payload emitted to the parent when the user commits. */
export interface SmartIntakeSubmission {
  variant: IntakeVariant;
  text?: string;
  url?: string;
  file?: File;
  stageGuess?: StageGuess;
}

export interface SmartIntakeProps {
  onSubmit?: (payload: SmartIntakeSubmission) => void;
  /** Called every time the fast classifier settles — useful for telemetry. */
  onClassify?: (result: FastClassifierResult) => void;
  className?: string;
  /** Placeholder rotation is disabled if a fixed placeholder is provided. */
  placeholder?: string;
}

function tokenize(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Pure decision function — exported so tests can pin the truth table. */
export function classifyInput(input: {
  text?: string;
  file?: { name?: string; size?: number; type?: string } | null;
}): FastClassifierResult {
  const file = input.file ?? null;
  const text = (input.text ?? "").trim();

  if (file) {
    const nameHit = file.name ? DECK_EXT_REGEX.test(file.name) : false;
    const mimeHit = file.type ? DECK_MIME_ALLOWLIST.includes(file.type) : false;
    if (nameHit || mimeHit) {
      const mb = ((file.size ?? 0) / (1024 * 1024)).toFixed(1);
      return {
        variant: "deck",
        reason: "Detected pitch deck upload",
        chipLabel: `PDF · ${mb} MB`,
        ctaLabel: "Read my deck",
        fileSizeBytes: file.size,
      };
    }
  }

  if (!text) {
    return {
      variant: "empty",
      reason: "Nothing typed yet",
      chipLabel: "",
      ctaLabel: "Paste a link, drop a deck, or type an idea",
    };
  }

  if (URL_REGEX.test(text) && !text.includes(" ")) {
    return {
      variant: "url",
      reason: "Detected URL",
      chipLabel: "Looks like a URL",
      ctaLabel: "Visit my site",
    };
  }

  const tokens = tokenize(text);
  if (tokens >= MIN_TOKENS_FOR_TEXT_CLASSIFY) {
    return {
      variant: "idea",
      reason: "Detected idea text (≥40 tokens)",
      chipLabel: `Idea · ${tokens} words`,
      ctaLabel: "Classify my idea",
    };
  }

  return {
    variant: "empty",
    reason: `Need at least ${MIN_TOKENS_FOR_TEXT_CLASSIFY} words to classify an idea (currently ${tokens})`,
    chipLabel: `${tokens}/${MIN_TOKENS_FOR_TEXT_CLASSIFY} words`,
    ctaLabel: "Keep typing…",
  };
}

const PLACEHOLDERS = [
  "Paste your startup URL — https://…",
  "Drop your pitch deck (.pdf, .docx, .pptx)",
  "Or type your idea — 50+ words for best classification",
];

export function SmartIntake({
  onSubmit,
  onClassify,
  className,
  placeholder,
}: SmartIntakeProps) {
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [placeholderIdx, setPlaceholderIdx] = React.useState(0);
  const [classified, setClassified] = React.useState<FastClassifierResult>(() =>
    classifyInput({ text: "", file: null }),
  );
  const [stageGuess, setStageGuess] = React.useState<StageGuess | null>(null);
  const [stageLoading, setStageLoading] = React.useState(false);
  const [overrideVariant, setOverrideVariant] =
    React.useState<IntakeVariant | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (placeholder) return;
    const id = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length),
      3500,
    );
    return () => clearInterval(id);
  }, [placeholder]);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = classifyInput({
        text,
        file: file
          ? { name: file.name, size: file.size, type: file.type }
          : null,
      });
      setClassified(result);
      onClassify?.(result);

      // For idea variant, defer to the server for a real stage guess.
      if (result.variant === "idea" && !file) {
        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setStageLoading(true);
        fetch("/api/svi/stage-classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ctrl.signal,
        })
          .then((r) => r.json())
          .then((data) => {
            if (ctrl.signal.aborted) return;
            if (data && data.ok) {
              setStageGuess({
                stageLabel: data.stageLabel ?? "Unknown",
                confidence: typeof data.confidence === "number" ? data.confidence : 0.5,
                reasons: Array.isArray(data.reasons) ? data.reasons.slice(0, 5) : [],
              });
            }
          })
          .catch(() => {
            /* transient — the user can still submit and get a full run */
          })
          .finally(() => {
            if (!ctrl.signal.aborted) setStageLoading(false);
          });
      } else if (result.variant !== "idea") {
        setStageGuess(null);
        setStageLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, file, onClassify]);

  function handleFile(picked: File | null) {
    if (!picked) return;
    setFile(picked);
    // Clear the text so the classifier locks onto the deck.
    setText("");
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer?.files?.[0] ?? null;
    handleFile(dropped);
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (classified.variant === "empty") return;
    onSubmit?.({
      variant: overrideVariant ?? classified.variant,
      text: text || undefined,
      url:
        classified.variant === "url" || overrideVariant === "url"
          ? text
          : undefined,
      file: file ?? undefined,
      stageGuess: stageGuess ?? undefined,
    });
  }

  const effectiveVariant = overrideVariant ?? classified.variant;
  const placeholderText = placeholder ?? PLACEHOLDERS[placeholderIdx];
  const disabled = classified.variant === "empty";

  return (
    <form
      className={cn(
        "w-full max-w-3xl rounded-2xl border border-line-subtle bg-surface-raised p-4 shadow-sm",
        className,
      )}
      onSubmit={handleSubmit}
      data-testid="smart-intake"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col gap-3 rounded-xl border-2 border-dashed p-3 transition-colors",
          dragging
            ? "border-action bg-action/5"
            : "border-line-subtle bg-surface",
        )}
      >
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 shrink-0 text-tertiary" aria-hidden />
          <label htmlFor="smart-intake-input" className="sr-only">
            Paste a URL, drop a deck, or type your startup idea
          </label>
          <input
            id="smart-intake-input"
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholderText}
            className="flex-1 bg-transparent text-sm text-primary placeholder:text-tertiary focus:outline-none sm:text-base"
            autoComplete="off"
            data-testid="smart-intake-text"
          />
          <input
            id="smart-intake-file"
            type="file"
            accept=".pdf,.docx,.pptx"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            data-testid="smart-intake-file"
          />
          <label
            htmlFor="smart-intake-file"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden /> Upload
          </label>
        </div>

        {classified.chipLabel && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ClassifierChip result={classified} />
            {effectiveVariant === "idea" && stageLoading && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Classifying stage…
              </span>
            )}
            {effectiveVariant === "idea" && stageGuess && !stageLoading && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-svi-500/10 px-2 py-0.5 text-svi-500"
                data-testid="stage-guess-chip"
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                Stage guess: {stageGuess.stageLabel} ·{" "}
                {Math.round(stageGuess.confidence * 100)}%
              </span>
            )}
            {classified.variant !== "empty" && (
              <button
                type="button"
                onClick={() => {
                  const next: IntakeVariant =
                    classified.variant === "url"
                      ? "idea"
                      : classified.variant === "deck"
                        ? "url"
                        : "url";
                  setOverrideVariant(next);
                }}
                className="ml-auto text-xs font-medium text-action hover:underline"
              >
                Not right?
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {classified.reason}
          {file ? ` · ${file.name}` : ""}
        </p>
        <button
          type="submit"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-colors",
            disabled
              ? "bg-surface-hover text-tertiary cursor-not-allowed"
              : "bg-action text-on-action hover:bg-action-hover",
          )}
          data-testid="smart-intake-cta"
        >
          {classified.variant === "deck" && (
            <FileText className="h-4 w-4" aria-hidden />
          )}
          {classified.variant === "url" && (
            <Globe className="h-4 w-4" aria-hidden />
          )}
          {classified.variant === "idea" && (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {classified.ctaLabel}
        </button>
      </div>
    </form>
  );
}

function ClassifierChip({ result }: { result: FastClassifierResult }) {
  const icon =
    result.variant === "deck" ? (
      <FileText className="h-3 w-3" aria-hidden />
    ) : result.variant === "url" ? (
      <Globe className="h-3 w-3" aria-hidden />
    ) : result.variant === "idea" ? (
      <Sparkles className="h-3 w-3" aria-hidden />
    ) : (
      <Search className="h-3 w-3" aria-hidden />
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        result.variant === "deck" && "bg-action/10 text-action",
        result.variant === "url" && "bg-bull/10 text-bull",
        result.variant === "idea" && "bg-svi-500/10 text-svi-500",
        result.variant === "empty" && "bg-surface-hover text-muted",
      )}
      data-testid="classifier-chip"
    >
      {icon}
      {result.chipLabel}
    </span>
  );
}

export default SmartIntake;
