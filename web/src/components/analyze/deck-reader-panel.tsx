"use client";

// DeckReaderPanel — vertical slide-thumbnail strip that mirrors the
// backend's per-slide parsing progress. Section chips at the top
// (Problem / Market / Product / Traction / Team / Ask) light up as
// slide_parsed events come in with a matched section label.

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

export type SlideStatus = "queued" | "reading" | "parsed";

export interface SlideState {
  index: number;
  title?: string;
  status: SlideStatus;
  section?: DeckSection;
}

export type DeckSection =
  | "problem"
  | "solution"
  | "market"
  | "product"
  | "traction"
  | "team"
  | "ask"
  | "other";

const SECTION_LABEL: Record<DeckSection, string> = {
  problem: "Problem",
  solution: "Solution",
  market: "Market",
  product: "Product",
  traction: "Traction",
  team: "Team",
  ask: "Ask",
  other: "Other",
};

const SECTION_ORDER: DeckSection[] = [
  "problem",
  "solution",
  "market",
  "product",
  "traction",
  "team",
  "ask",
];

export interface DeckReaderPanelProps {
  slides: SlideState[];
  /** Sections seen in slide_parsed events so far. */
  detectedSections: Set<DeckSection>;
  className?: string;
}

export function DeckReaderPanel({
  slides,
  detectedSections,
  className,
}: DeckReaderPanelProps) {
  const total = slides.length || 0;
  const parsed = slides.filter((s) => s.status === "parsed").length;
  const reading = slides.find((s) => s.status === "reading");

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line-subtle bg-surface-raised p-3",
        className,
      )}
      data-testid="deck-reader-panel"
    >
      <header>
        <p className="text-xs uppercase tracking-[0.14em] text-tertiary">
          Deck reader
        </p>
        <p className="text-sm text-primary">
          {parsed} of {total || "…"} slides parsed
          {reading ? ` · reading slide ${reading.index + 1}` : ""}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {SECTION_ORDER.map((section) => {
          const active = detectedSections.has(section);
          return (
            <span
              key={section}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-bull bg-bull/10 text-bull"
                  : "border-line-subtle bg-surface text-tertiary",
              )}
              data-testid={`deck-section-${section}`}
            >
              {SECTION_LABEL[section]}
            </span>
          );
        })}
      </div>

      <ol className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
        {slides.length === 0 && (
          <li className="text-xs italic text-muted">
            Awaiting slide list from server…
          </li>
        )}
        {slides.map((slide) => (
          <li key={slide.index}>
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors",
                slide.status === "parsed" &&
                  "border-bull bg-bull/5 text-primary",
                slide.status === "reading" &&
                  "border-action bg-action/5 text-primary",
                slide.status === "queued" &&
                  "border-line-subtle bg-surface text-tertiary",
              )}
              data-testid={`deck-slide-${slide.index}`}
            >
              <span className="mt-0.5">
                {slide.status === "parsed" ? (
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-bull"
                    aria-hidden
                  />
                ) : slide.status === "reading" ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-action"
                    aria-hidden
                  />
                ) : (
                  <Circle className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              <span className="flex-1">
                <span className="font-semibold">Slide {slide.index + 1}</span>
                {slide.title && (
                  <span className="ml-1 text-muted">— {slide.title}</span>
                )}
                {slide.section && (
                  <span className="ml-2 rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-tertiary">
                    {SECTION_LABEL[slide.section]}
                  </span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default DeckReaderPanel;
