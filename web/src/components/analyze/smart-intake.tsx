"use client";

// SmartIntake — a single omni-box on /analyze that accepts a URL paste,
// a file drop (PDF / DOCX / PPTX) or free-text idea copy. The client
// classifier runs debounced 150 ms — URL regex, file MIME sniff, or
// deterministic /api/svi/stage-classify once the text says what the
// business is (a sentence or two). The CTA
// morphs to match the detected variant so the founder always knows
// what action the button will fire.

import * as React from "react";
import { cn } from "@/lib/utils";
import { AnimatedSearchFrame } from "@/components/ui/animated-search-frame";
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
// A description only has to be enough to say what the business is — a sentence
// or two does that. The old 40-word floor turned the hero into a writing task
// and left the CTA reading "Keep typing…" for most real attempts, which is a
// wall in front of the one action the whole page exists to invite. Anything
// shorter than this is genuinely too thin to classify (a bare product name).
const MIN_TOKENS_FOR_TEXT_CLASSIFY = 8;
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
      reason: `Detected idea text (${tokens} tokens)`,
      chipLabel: tokens < 25 ? `Idea · ${tokens} words — more detail sharpens it` : `Idea · ${tokens} words`,
      ctaLabel: "Classify my idea",
    };
  }

  return {
    variant: "empty",
    reason: `Tell us a little more — what it does and who it is for (${tokens} words so far)`,
    chipLabel: tokens === 0 ? "Paste, drop, or type" : `${tokens} words`,
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

  function handleDrop(e: React.DragEvent<HTMLElement>) {
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
  // `classifyInput`'s empty-state ctaLabel is the long invitation ("Paste a
  // link, drop a deck, or type an idea"). That is the right *copy* and the
  // wrong *button* — inside a pill it pushed the input down to a third of the
  // bar at 1440 and truncated the placeholder. The invitation now lives in
  // the helper line under the pill (and in the placeholder); the disabled
  // button just names the action. The classifier contract is untouched.
  const ctaText = disabled ? "Analyse" : classified.ctaLabel;

  return (
    <div className={cn("w-full max-w-3xl", className)}>
      {/* The pill. One row on sm+, two on a phone — see the stacking note
          on the submit button below. `rounded-[inherit]` is load-bearing:
          the ring is AnimatedSearchFrame's padding band, so any radius the
          child does not match shows as a square shoulder. */}
      <AnimatedSearchFrame
        radius="rounded-[1.75rem] sm:rounded-full"
        thickness={3}
      >
        <form
          className={cn(
            "w-full rounded-[inherit] border bg-surface-raised shadow-md transition-colors",
            dragging
              ? "border-action bg-action/5"
              : "border-line-subtle",
          )}
          onSubmit={handleSubmit}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          data-testid="smart-intake"
        >
          <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:gap-2 sm:py-2 sm:pl-5 sm:pr-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 pl-2 sm:gap-3 sm:pl-0">
              <Search
                className="h-5 w-5 shrink-0 text-tertiary"
                aria-hidden
              />
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
                className="h-11 min-w-0 flex-1 bg-transparent text-base text-primary placeholder:text-tertiary focus:outline-none"
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
              {/* 44x44 minimum tap target. The word "Upload" is visually
                  hidden on a phone (the pill has no room) but always read
                  by a screen reader, and the helper line under the pill
                  spells the affordance out for sighted phone users. */}
              <label
                htmlFor="smart-intake-file"
                title="Upload a pitch deck (PDF, DOCX or PPTX)"
                className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-primary focus-within:ring-2 focus-within:ring-action sm:border sm:border-line-subtle"
              >
                <Upload className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Upload</span>
              </label>
            </div>

            {/* 390px decision: the CTA drops below the field rather than
                shrinking inside it. The label morphs up to "Paste a link,
                drop a deck, or type an idea" — inside a phone-width pill
                that either truncates or squeezes the input to nothing.
                Full-width underneath keeps both at a 44px tap target and
                keeps the label readable. */}
            <button
              type="submit"
              disabled={disabled}
              className={cn(
                "inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors sm:w-auto sm:max-w-[15rem]",
                disabled
                  ? "cursor-not-allowed bg-surface-sunken text-tertiary"
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
              <span className="truncate">{ctaText}</span>
            </button>
          </div>
        </form>
      </AnimatedSearchFrame>

      {/* Classifier read-out lives under the pill, not inside it — the same
          place Google puts its suggestions, and the only way the pill stays
          a pill while the mode chip keeps reporting live. */}
      <div
        className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-2 text-xs"
        aria-live="polite"
      >
        {classified.chipLabel && <ClassifierChip result={classified} />}
        {effectiveVariant === "idea" && stageLoading && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Classifying stage…
          </span>
        )}
        {effectiveVariant === "idea" && stageGuess && !stageLoading && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-svi-500/10 px-2 py-0.5 text-on-brand"
            data-testid="stage-guess-chip"
          >
            <Sparkles className="h-3 w-3 text-warn" aria-hidden />
            Stage guess: {stageGuess.stageLabel} ·{" "}
            {Math.round(stageGuess.confidence * 100)}%
          </span>
        )}
        <p className="text-muted">
          {classified.variant === "empty" && !file
            ? "Drop a PDF, DOCX or PPTX here, paste a link, or just describe the idea."
            : classified.reason}
          {file ? ` · ${file.name}` : ""}
        </p>
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
            className="font-medium text-action hover:underline"
          >
            Not right?
          </button>
        )}
      </div>
    </div>
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
        // svi-500 (#FF9F0A) is 2.33:1 on white — graphic-only per
        // docs/design-system.md. The chip ground stays brand orange at
        // 10%; the label uses text.on-brand ink so the pair passes AA.
        result.variant === "idea" && "bg-svi-500/15 text-on-brand",
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
